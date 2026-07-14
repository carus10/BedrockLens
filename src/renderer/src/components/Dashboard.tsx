import { usePeriods, useCredits, useDailyData } from '../hooks/useData'
import { formatCost, formatTokens, formatLatency, getModelColor } from '../lib/ipc'
import type { PeriodData } from '../../../shared/types'
import { TrendingUp, TrendingDown, Minus, DollarSign, Zap, Clock, Hash } from 'lucide-react'
import DatePicker from './DatePicker'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { cn } from '../lib/utils'
import ExportMenu from './ExportMenu'
import { useEffect, useRef, useState } from 'react'

const PERIOD_ORDER: PeriodData['period'][] = ['session', 'today', 'yesterday', '7d', '30d']

// Animasyonlu sayı bileşeni
function AnimatedNumber({ value, formatter }: { value: number; formatter: (v: number) => string }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)

  useEffect(() => {
    if (prev.current === value) return
    const start = prev.current
    const end = value
    const duration = 600
    const startTime = performance.now()

    const tick = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(start + (end - start) * eased)
      if (progress < 1) requestAnimationFrame(tick)
      else { setDisplay(end); prev.current = end }
    }
    requestAnimationFrame(tick)
  }, [value])

  return <span>{formatter(display)}</span>
}

type SummaryTab = 'today' | '7d' | '30d' | 'custom'

export default function Dashboard() {
  const { data: periods, isLoading } = usePeriods()
  const { data: credits } = useCredits()
  const { data: daily } = useDailyData(30)
  const [summaryTab, setSummaryTab] = useState<SummaryTab>('today')
  const [customDate, setCustomDate] = useState<string>('')

  if (isLoading) return <LoadingSkeleton />

  const today = periods?.find((p) => p.period === 'today')
  const yesterday = periods?.find((p) => p.period === 'yesterday')
  const session = periods?.find((p) => p.period === 'session')
  const last30 = periods?.find((p) => p.period === '30d')
  const last7 = periods?.find((p) => p.period === '7d')

  // Custom date: pick matching DailyDataPoint
  const customDayData = summaryTab === 'custom' && customDate
    ? daily?.find((d) => d.date === customDate)
    : null

  // Build model list for selected tab
  const summaryModels: { modelKey: string; displayName: string; requestCount: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number; averageLatencyMs: number; estimatedCost: number }[] = (() => {
    if (summaryTab === 'custom') {
      if (!customDayData) return []
      return Object.entries(customDayData.byModel).map(([key, m]) => ({
        modelKey: key,
        displayName: (m as any).displayName ?? key,
        requestCount: (m as any).requestCount ?? 0,
        inputTokens: (m as any).inputTokens ?? 0,
        outputTokens: (m as any).outputTokens ?? 0,
        cacheReadTokens: (m as any).cacheReadTokens ?? 0,
        cacheWriteTokens: (m as any).cacheWriteTokens ?? 0,
        averageLatencyMs: (m as any).averageLatencyMs ?? 0,
        estimatedCost: (m as any).estimatedCost ?? 0,
      })).sort((a, b) => b.estimatedCost - a.estimatedCost)
    }
    const src = summaryTab === 'today' ? today : summaryTab === '7d' ? last7 : last30
    return (src?.byModel ?? []).slice().sort((a, b) => b.estimatedCost - a.estimatedCost)
  })()

  const todayVsYesterday =
    yesterday && yesterday.total.estimatedCost > 0
      ? ((today?.total.estimatedCost ?? 0) - yesterday.total.estimatedCost) /
        yesterday.total.estimatedCost * 100
      : null

  // Bu ay tahmin: son 30 gün ortalaması × 30
  const dailyAvg = last30 ? last30.total.estimatedCost / 30 : 0
  const monthlyEstimate = dailyAvg * 30
  const monthSpent = last30?.total.estimatedCost ?? 0
  const monthProgress = monthlyEstimate > 0 ? (monthSpent / monthlyEstimate) * 100 : 0

  const sparkData = daily?.slice(-7).map((d) => ({ date: d.date.slice(5), cost: d.estimatedCost })) ?? []

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-sm font-bold text-text-primary tracking-wide">USAGE OVERVIEW</h1>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">Amazon Bedrock · Claude Models</p>
        </div>
        <ExportMenu />
      </div>

      {/* Monthly summary bar */}
      <div className="panel px-4 py-2.5 flex items-center gap-6">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted flex-shrink-0">
          30-Day Summary
        </div>
        <div className="flex items-center gap-6 flex-1 font-mono text-[11px]">
          <span>
            <span className="text-text-muted">Spent </span>
            <span className="text-accent-blue font-semibold">{formatCost(monthSpent)}</span>
          </span>
          <span>
            <span className="text-text-muted">Daily avg </span>
            <span className="text-text-primary">{formatCost(dailyAvg)}</span>
          </span>
          <span>
            <span className="text-text-muted">Month est. </span>
            <span className="text-accent-orange">{formatCost(monthlyEstimate)}</span>
          </span>
          <span>
            <span className="text-text-muted">Requests </span>
            <span className="text-text-primary">{last30?.total.requestCount.toLocaleString() ?? 0}</span>
          </span>
          <span>
            <span className="text-text-muted">Tokens </span>
            <span className="text-text-primary">{formatTokens((last30?.total.inputTokens ?? 0) + (last30?.total.outputTokens ?? 0))}</span>
          </span>
        </div>
      </div>

      {/* Top KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          label="Today Cost"
          value={today?.total.estimatedCost ?? 0}
          formatter={formatCost}
          subValue={today?.total.actualCost != null ? `Actual: ${formatCost(today.total.actualCost)}` : undefined}
          trend={todayVsYesterday}
          icon={<DollarSign className="w-3.5 h-3.5" />}
          accent="blue"
          sparkData={sparkData}
        />
        <KpiCard
          label="Today Tokens"
          value={(today?.total.inputTokens ?? 0) + (today?.total.outputTokens ?? 0)}
          formatter={formatTokens}
          subValue={`In: ${formatTokens(today?.total.inputTokens ?? 0)} · Out: ${formatTokens(today?.total.outputTokens ?? 0)}`}
          icon={<Zap className="w-3.5 h-3.5" />}
          accent="green"
        />
        <KpiCard
          label="Requests Today"
          value={today?.total.requestCount ?? 0}
          formatter={(v) => Math.round(v).toLocaleString()}
          subValue={`Avg latency: ${formatLatency(today?.total.averageLatencyMs ?? 0)}`}
          icon={<Hash className="w-3.5 h-3.5" />}
          accent="purple"
        />
        <KpiCard
          label="Session Cost"
          value={session?.total.estimatedCost ?? 0}
          formatter={formatCost}
          subValue={`${session?.total.requestCount ?? 0} requests`}
          icon={<Clock className="w-3.5 h-3.5" />}
          accent="orange"
        />
      </div>

      {/* Credits bar */}
      {credits && <CreditsBar credits={credits} />}

      {/* Period + Model panels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Period Breakdown</span>
          </div>
          <div className="divide-y divide-border-subtle">
            {PERIOD_ORDER.map((period) => {
              const p = periods?.find((x) => x.period === period)
              if (!p) return null
              return <PeriodRow key={period} data={p} />
            })}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Model Breakdown · Today</span>
          </div>
          {today?.byModel && today.byModel.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {today.byModel
                .sort((a, b) => b.estimatedCost - a.estimatedCost)
                .map((m) => <ModelRow key={m.modelKey} model={m} />)}
            </div>
          ) : (
            <EmptyState message="No activity today" />
          )}
        </div>
      </div>

      {/* Model Summary with period tabs */}
      <div className="panel">
        <div className="panel-header flex items-center justify-between">
          <span className="panel-title">Model Summary</span>
          <div className="flex items-center gap-1.5">
            {(['today', '7d', '30d'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSummaryTab(tab)}
                className={cn(
                  'px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded transition-colors',
                  summaryTab === tab
                    ? 'bg-accent-blue/20 text-accent-blue'
                    : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
                )}
              >
                {tab === 'today' ? 'Today' : tab === '7d' ? 'Last 7d' : 'Last 30d'}
              </button>
            ))}
            <div onClick={() => setSummaryTab('custom')}>
              <DatePicker
                value={customDate}
                onChange={(v) => { setCustomDate(v); if (v) setSummaryTab('custom') }}
                min={daily && daily.length > 0 ? daily[0].date : undefined}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Model', 'Requests', 'Input', 'Output', 'Cache Hit', 'Cache Write', 'Avg Latency', 'Est. Cost'].map((h) => (
                  <th key={h} className="text-[10px] font-semibold text-text-muted uppercase tracking-wider px-4 py-2 text-right first:text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryModels.map((m) => (
                <tr key={m.modelKey} className="border-b border-border-subtle last:border-0 hover:bg-bg-elevated/30 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: getModelColor(m.modelKey) }} />
                      <span className="text-xs font-medium text-text-primary">{m.displayName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">{m.requestCount.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">{formatTokens(m.inputTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">{formatTokens(m.outputTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-accent-cyan">{formatTokens(m.cacheReadTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-accent-yellow">{formatTokens(m.cacheWriteTokens)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-text-secondary">{formatLatency(m.averageLatencyMs)}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs text-accent-blue font-semibold">{formatCost(m.estimatedCost)}</td>
                </tr>
              ))}
              {summaryModels.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-text-muted text-xs">
                    {summaryTab === 'custom' && !customDate
                      ? 'Select a date to view data'
                      : summaryTab === 'custom' && customDate
                      ? `No data for ${customDate}`
                      : 'No data for this period'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function KpiCard({
  label, value, formatter, subValue, trend, icon, accent, sparkData
}: {
  label: string
  value: number
  formatter: (v: number) => string
  subValue?: string
  trend?: number | null
  icon: React.ReactNode
  accent: 'blue' | 'green' | 'orange' | 'purple'
  sparkData?: { date: string; cost: number }[]
}) {
  const accentColor = {
    blue: 'var(--accent-blue)',
    green: 'var(--accent-green)',
    orange: 'var(--accent-orange)',
    purple: 'var(--accent-purple)'
  }[accent]

  return (
    <div className="stat-card">
      <div className="flex items-start justify-between mb-2">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</div>
        <div style={{ color: accentColor }} className="opacity-60">{icon}</div>
      </div>
      <div className="ticker-value text-xl font-bold" style={{ color: accentColor }}>
        <AnimatedNumber value={value} formatter={formatter} />
      </div>
      <div className="flex items-center justify-between mt-1">
        {subValue && <div className="text-[10px] font-mono text-text-muted truncate">{subValue}</div>}
        {trend != null && <TrendBadge value={trend} />}
      </div>
      {sparkData && sparkData.length > 0 && (
        <div className="mt-2 h-8 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData}>
              <defs>
                <linearGradient id={`grad-${accent}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={accentColor} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={accentColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="cost" stroke={accentColor} strokeWidth={1} fill={`url(#grad-${accent})`} dot={false} />
              <Tooltip
                contentStyle={{ background: '#1c2128', border: '1px solid #30363d', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono' }}
                formatter={(v: any) => [formatCost(Number(v)), 'Cost']}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function TrendBadge({ value }: { value: number }) {
  const isFlat = Math.abs(value) < 0.5
  if (isFlat) return <span className="badge badge-green flex items-center gap-0.5"><Minus className="w-2.5 h-2.5" />{value.toFixed(1)}%</span>
  if (value > 0) return <span className="badge badge-red flex items-center gap-0.5"><TrendingUp className="w-2.5 h-2.5" />+{value.toFixed(1)}%</span>
  return <span className="badge badge-green flex items-center gap-0.5"><TrendingDown className="w-2.5 h-2.5" />{value.toFixed(1)}%</span>
}

function PeriodRow({ data }: { data: PeriodData }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2.5 hover:bg-bg-elevated/30 transition-colors">
      <div className="text-xs font-medium text-text-primary">{data.label}</div>
      <div className="text-right">
        <div className="text-[10px] text-text-muted font-mono">{formatTokens(data.total.inputTokens + data.total.outputTokens)}</div>
        <div className="text-[9px] text-text-muted">tokens</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-text-secondary font-mono">{data.total.requestCount}</div>
        <div className="text-[9px] text-text-muted">reqs</div>
      </div>
      <div className="text-right">
        <div className="text-[10px] text-accent-blue font-mono font-semibold">{formatCost(data.total.estimatedCost)}</div>
        {data.total.actualCost != null && (
          <div className="text-[9px] text-accent-green font-mono">{formatCost(data.total.actualCost)}</div>
        )}
      </div>
    </div>
  )
}

function ModelRow({ model }: { model: any }) {
  const color = getModelColor(model.modelKey)
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-4 py-2.5 hover:bg-bg-elevated/30 transition-colors">
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span className="text-xs text-text-primary truncate">{model.displayName}</span>
      </div>
      <div className="text-right font-mono text-[10px] text-text-secondary">
        {formatTokens(model.inputTokens + model.outputTokens)}
      </div>
      <div className="text-right font-mono text-[10px] text-accent-blue font-semibold">
        {formatCost(model.estimatedCost)}
      </div>
    </div>
  )
}

function CreditsBar({ credits }: { credits: any }) {
  const pct = credits.totalCredits > 0 ? ((credits.totalCredits - credits.estimatedRemaining) / credits.totalCredits) * 100 : 0
  const barColor = pct > 80 ? 'var(--accent-red)' : pct > 60 ? 'var(--accent-orange)' : 'var(--accent-green)'

  return (
    <div className="panel px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">AWS Credits</span>
        <div className="flex items-center gap-4 font-mono text-[10px]">
          <span className="text-text-muted">Remaining: <span className="text-accent-green">${credits.estimatedRemaining.toFixed(2)}</span></span>
          <span className="text-text-muted">Burn: <span className="text-accent-orange">${credits.dailyBurnRate.toFixed(4)}/day</span></span>
          {credits.daysRemaining != null && (
            <span className="text-text-muted">Depletes in: <span className="text-text-primary">{credits.daysRemaining}d</span></span>
          )}
        </div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-8 text-center text-xs text-text-muted">{message}</div>
}

function LoadingSkeleton() {
  return (
    <div className="p-4 space-y-3">
      <div className="panel h-8 shimmer-bg" />
      <div className="grid grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="stat-card h-24 shimmer-bg" />)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="panel h-48 shimmer-bg" />
        <div className="panel h-48 shimmer-bg" />
      </div>
    </div>
  )
}
