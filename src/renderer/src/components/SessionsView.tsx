import { useState } from 'react'
import { useSessions } from '../hooks/useData'
import { formatCost, formatTokens, formatDuration, formatLatency, getModelColor } from '../lib/ipc'
import { format, parseISO } from 'date-fns'
import { Activity, Clock, Hash, DollarSign, ChevronDown, ChevronRight, Zap } from 'lucide-react'
import type { Session } from '../../../shared/types'

export default function SessionsView() {
  const { data: sessions, isLoading } = useSessions()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const totalCost = sessions?.reduce((s, x) => s + x.estimatedCost, 0) ?? 0
  const totalRequests = sessions?.reduce((s, x) => s + x.requestCount, 0) ?? 0

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold text-text-primary tracking-wide">SESSIONS</h1>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">
            Auto-detected · {sessions?.length ?? 0} sessions · {totalRequests} requests
          </p>
        </div>
        {sessions && sessions.length > 0 && (
          <div className="flex items-center gap-4 font-mono text-[11px]">
            <span className="text-text-muted">Total: <span className="text-accent-blue font-semibold">{formatCost(totalCost)}</span></span>
            <span className="text-text-muted">Sessions: <span className="text-text-primary">{sessions.length}</span></span>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="panel h-20 shimmer-bg" />)}
        </div>
      )}

      {!isLoading && (!sessions || sessions.length === 0) && (
        <div className="panel py-16 text-center">
          <Activity className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-muted">No sessions detected yet</p>
          <p className="text-[11px] text-text-muted mt-1 font-mono">
            Sessions are grouped from Bedrock invocation logs
          </p>
        </div>
      )}

      <div className="space-y-2">
        {sessions?.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            expanded={expandedId === session.id}
            onToggle={() => setExpandedId(expandedId === session.id ? null : session.id)}
          />
        ))}
      </div>
    </div>
  )
}

function SessionCard({ session, expanded, onToggle }: {
  session: Session
  expanded: boolean
  onToggle: () => void
}) {
  const inputRatio = session.usage.inputTokens + session.usage.outputTokens > 0
    ? (session.usage.inputTokens / (session.usage.inputTokens + session.usage.outputTokens)) * 100
    : 0
  const cacheHitRate = session.usage.inputTokens > 0
    ? (session.usage.cacheReadTokens / session.usage.inputTokens) * 100
    : 0

  return (
    <div className={`panel transition-colors ${session.isActive ? 'border-accent-green/30' : ''}`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-start justify-between gap-3 hover:bg-bg-elevated/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
          }
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {session.isActive && (
                <span className="flex items-center gap-1 badge badge-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse-glow" />
                  ACTIVE
                </span>
              )}
              <span className="text-xs font-semibold font-mono text-text-primary">
                {format(parseISO(session.startTime), 'MMM d, HH:mm')}
              </span>
              {session.endTime && (
                <span className="text-[10px] font-mono text-text-muted">
                  → {format(parseISO(session.endTime), 'HH:mm')}
                </span>
              )}
              {session.durationMs && (
                <span className="badge badge-blue">{formatDuration(session.durationMs)}</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <span className="text-[10px] font-mono text-text-secondary">{session.requestCount} reqs</span>
          <span className="ticker-value text-sm font-bold text-accent-blue">
            {formatCost(session.estimatedCost)}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border-subtle px-4 py-3 space-y-3">
          {/* Token breakdown */}
          <div className="grid grid-cols-4 gap-3">
            <StatBox icon={<Zap className="w-3 h-3" />} label="Input" value={formatTokens(session.usage.inputTokens)} color="blue" />
            <StatBox icon={<Zap className="w-3 h-3" />} label="Output" value={formatTokens(session.usage.outputTokens)} color="green" />
            <StatBox icon={<Zap className="w-3 h-3" />} label="Cache Read" value={formatTokens(session.usage.cacheReadTokens)} color="cyan" />
            <StatBox icon={<Zap className="w-3 h-3" />} label="Cache Write" value={formatTokens(session.usage.cacheWriteTokens)} color="orange" />
          </div>

          {/* Token ratio bar */}
          <div className="space-y-1">
            <div className="flex justify-between text-[9px] font-mono text-text-muted">
              <span>Input {inputRatio.toFixed(0)}%</span>
              <span>Output {(100 - inputRatio).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-border-subtle overflow-hidden flex">
              <div className="h-full bg-accent-blue transition-all" style={{ width: `${inputRatio}%` }} />
              <div className="h-full bg-accent-green flex-1" />
            </div>
          </div>

          {/* Cache hit rate */}
          {cacheHitRate > 0 && (
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="text-text-muted">Cache hit rate:</span>
              <span className="text-accent-cyan font-semibold">{cacheHitRate.toFixed(1)}%</span>
              <span className="text-text-muted text-[9px]">(saves {formatCost(session.usage.cacheReadTokens * 0.003 / 1000 * 0.9)} est.)</span>
            </div>
          )}

          {/* Models used */}
          {session.modelsUsed.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] text-text-muted uppercase tracking-wider">Models:</span>
              {session.modelsUsed.map((m) => (
                <span key={m} className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded bg-bg-primary border border-border-subtle">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: getModelColor(m) }} />
                  {m}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function StatBox({ icon, label, value, color }: {
  icon: React.ReactNode
  label: string
  value: string
  color: 'blue' | 'green' | 'cyan' | 'orange'
}) {
  const colorMap = {
    blue: 'text-accent-blue',
    green: 'text-accent-green',
    cyan: 'text-accent-cyan',
    orange: 'text-accent-orange'
  }
  return (
    <div className="bg-bg-primary rounded px-3 py-2">
      <div className="flex items-center gap-1 text-text-muted mb-1">
        {icon}
        <span className="text-[9px] uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xs font-mono font-semibold ${colorMap[color]}`}>{value}</div>
    </div>
  )
}
