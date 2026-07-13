import { useState } from 'react'
import { useDailyData, useHourlyData, usePeriods } from '../hooks/useData'
import { getModelColor, formatCost, formatTokens } from '../lib/ipc'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { TrendingUp, Award } from 'lucide-react'

type ChartPeriod = '7d' | '14d' | '30d'

const TOOLTIP = {
  backgroundColor: '#1c2128',
  border: '1px solid #30363d',
  borderRadius: '4px',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: '11px',
  color: '#e6edf3'
}

// Token verimlilik skoru
function calcEfficiencyScore(cacheReadTokens: number, inputTokens: number, outputTokens: number, requestCount: number): { grade: string; score: number; color: string } {
  if (requestCount === 0) return { grade: '—', score: 0, color: '#6e7681' }

  const cacheHitRate = inputTokens > 0 ? cacheReadTokens / (inputTokens + cacheReadTokens) : 0
  const outputRatio = (inputTokens + outputTokens) > 0 ? outputTokens / (inputTokens + outputTokens) : 0

  // Score: cache hit rate 60% + output efficiency 40%
  const score = (cacheHitRate * 60) + (Math.min(outputRatio * 5, 1) * 40)

  let grade: string
  let color: string
  if (score >= 80) { grade = 'A'; color = '#3fb950' }
  else if (score >= 65) { grade = 'B'; color = '#39d353' }
  else if (score >= 50) { grade = 'C'; color = '#d29922' }
  else if (score >= 35) { grade = 'D'; color = '#f85149' }
  else { grade = 'F'; color = '#f85149' }

  return { grade, score, color }
}

export default function ChartsView() {
  const [period, setPeriod] = useState<ChartPeriod>('7d')
  const days = period === '7d' ? 7 : period === '14d' ? 14 : 30

  const { data: daily } = useDailyData(days)
  const { data: hourly } = useHourlyData(24)
  const { data: periods } = usePeriods()
  const last30 = periods?.find((p) => p.period === '30d')
  const today = periods?.find((p) => p.period === 'today')

  const efficiency = calcEfficiencyScore(
    last30?.total.cacheReadTokens ?? 0,
    last30?.total.inputTokens ?? 0,
    last30?.total.outputTokens ?? 0,
    last30?.total.requestCount ?? 0
  )

  const costData = daily?.map((d) => ({
    date: d.date.slice(5),
    estimated: parseFloat(d.estimatedCost.toFixed(4)),
    actual: d.totalCost !== d.estimatedCost ? parseFloat(d.totalCost.toFixed(4)) : undefined
  })) ?? []

  const tokenData = daily?.map((d) => ({
    date: d.date.slice(5),
    input: d.inputTokens,
    output: d.outputTokens,
    cacheRead: d.cacheReadTokens,
    cacheWrite: d.cacheWriteTokens
  })) ?? []

  const reqData = hourly?.map((h) => ({
    hour: h.hour,
    requests: h.requestCount,
    cost: parseFloat(h.estimatedCost.toFixed(6))
  })) ?? []

  // Requests over time line chart
  const requestsOverTime = daily?.map((d) => ({
    date: d.date.slice(5),
    requests: d.requestCount,
    cost: parseFloat(d.estimatedCost.toFixed(4))
  })) ?? []

  const avgRequests = requestsOverTime.length > 0
    ? requestsOverTime.reduce((s, d) => s + d.requests, 0) / requestsOverTime.length
    : 0

  const pieData = last30?.byModel
    .filter((m) => m.estimatedCost > 0)
    .map((m) => ({
      name: m.displayName,
      value: parseFloat(m.estimatedCost.toFixed(6)),
      modelKey: m.modelKey
    })) ?? []

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-text-primary tracking-wide">ANALYTICS</h1>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">Interactive charts & insights</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Efficiency score badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded border border-border-default bg-bg-elevated">
            <Award className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[10px] text-text-muted font-mono">Efficiency</span>
            <span className="text-sm font-bold font-mono" style={{ color: efficiency.color }}>{efficiency.grade}</span>
            <span className="text-[9px] font-mono text-text-muted">{efficiency.score.toFixed(0)}/100</span>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-bg-secondary rounded border border-border-subtle p-0.5">
            {(['7d', '14d', '30d'] as ChartPeriod[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded text-[10px] font-semibold font-mono transition-colors ${
                  period === p
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Efficiency breakdown */}
      <div className="panel px-4 py-3">
        <div className="flex items-center gap-6">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">30-Day Efficiency</div>
          <div className="flex items-center gap-5 font-mono text-[11px]">
            <span>
              <span className="text-text-muted">Cache hit rate </span>
              <span className="text-accent-cyan font-semibold">
                {last30?.total.inputTokens && last30.total.inputTokens > 0
                  ? ((last30.total.cacheReadTokens / (last30.total.inputTokens + last30.total.cacheReadTokens)) * 100).toFixed(1)
                  : '0.0'}%
              </span>
            </span>
            <span>
              <span className="text-text-muted">Cache savings </span>
              <span className="text-accent-green font-semibold">
                {formatCost((last30?.total.cacheReadTokens ?? 0) * 0.003 / 1000 * 0.9)}
              </span>
            </span>
            <span>
              <span className="text-text-muted">Avg output/req </span>
              <span className="text-text-primary">
                {last30?.total.requestCount && last30.total.requestCount > 0
                  ? formatTokens(Math.round(last30.total.outputTokens / last30.total.requestCount))
                  : '0'}
              </span>
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="text-[9px] font-mono text-text-muted">Grade</div>
            <div
              className="w-8 h-8 rounded flex items-center justify-center font-bold text-base border"
              style={{ color: efficiency.color, borderColor: efficiency.color + '40', background: efficiency.color + '15' }}
            >
              {efficiency.grade}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Daily Cost */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Daily Spending</span>
            <span className="text-[10px] font-mono text-text-muted">Est. vs Actual</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={costData}>
                <defs>
                  <linearGradient id="gradEst" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#58a6ff" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#58a6ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAct" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3fb950" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3fb950" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="date" tick={{ fill: '#6e7681', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6e7681', fontSize: 9 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => [`$${Number(v).toFixed(4)}`, '']} />
                <Area type="monotone" dataKey="estimated" stroke="#58a6ff" fill="url(#gradEst)" strokeWidth={1.5} dot={false} name="Estimated" />
                <Area type="monotone" dataKey="actual" stroke="#3fb950" fill="url(#gradAct)" strokeWidth={1.5} dot={false} name="Actual" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Requests over time */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Requests Over Time</span>
            <span className="text-[10px] font-mono text-text-muted">avg {avgRequests.toFixed(0)}/day</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={requestsOverTime}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="date" tick={{ fill: '#6e7681', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6e7681', fontSize: 9 }} />
                <Tooltip contentStyle={TOOLTIP} />
                <ReferenceLine y={avgRequests} stroke="#484f58" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="requests" stroke="#bc8cff" strokeWidth={2} dot={{ r: 3, fill: '#bc8cff' }} name="Requests" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Requests/hour */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Requests / Hour (24h)</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={reqData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="hour" tick={{ fill: '#6e7681', fontSize: 9 }} interval={3} />
                <YAxis tick={{ fill: '#6e7681', fontSize: 9 }} />
                <Tooltip contentStyle={TOOLTIP} />
                <Bar dataKey="requests" fill="#bc8cff" radius={[2, 2, 0, 0]} name="Requests" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Tokens stacked */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Daily Tokens</span>
          </div>
          <div className="p-4">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={tokenData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#21262d" />
                <XAxis dataKey="date" tick={{ fill: '#6e7681', fontSize: 9 }} />
                <YAxis tick={{ fill: '#6e7681', fontSize: 9 }} tickFormatter={(v) => formatTokens(v)} />
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => [formatTokens(Number(v)), '']} />
                <Legend wrapperStyle={{ fontSize: 9, color: '#8b949e' }} />
                <Bar dataKey="input" stackId="a" fill="#58a6ff" name="Input" />
                <Bar dataKey="output" stackId="a" fill="#3fb950" name="Output" />
                <Bar dataKey="cacheRead" stackId="a" fill="#39d353" name="Cache Read" />
                <Bar dataKey="cacheWrite" stackId="a" fill="#d29922" radius={[2, 2, 0, 0]} name="Cache Write" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cost by model pie */}
        <div className="panel col-span-2">
          <div className="panel-header">
            <span className="panel-title">Cost by Model (30d)</span>
          </div>
          <div className="p-4 flex items-center gap-8">
            <ResponsiveContainer width="30%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" strokeWidth={0}>
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={getModelColor(entry.modelKey)} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} formatter={(v: any) => [`$${Number(v).toFixed(6)}`, '']} />
              </PieChart>
            </ResponsiveContainer>

            <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-2">
              {pieData.map((entry) => {
                const total = pieData.reduce((s, x) => s + x.value, 0)
                const pct = total > 0 ? (entry.value / total) * 100 : 0
                return (
                  <div key={entry.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: getModelColor(entry.modelKey) }} />
                        <span className="text-[10px] text-text-secondary">{entry.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-accent-blue">{formatCost(entry.value)}</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: getModelColor(entry.modelKey) }} />
                    </div>
                  </div>
                )
              })}
              {pieData.length === 0 && (
                <div className="text-[10px] text-text-muted col-span-2">No data</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
