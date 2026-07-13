import { useAlerts, useSettings, usePeriods } from '../hooks/useData'
import { useQueryClient } from '@tanstack/react-query'
import { ipc, formatCost } from '../lib/ipc'
import { format, parseISO } from 'date-fns'
import { Bell, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react'

export default function AlertsView() {
  const { data: alerts } = useAlerts()
  const { data: settings } = useSettings()
  const { data: periods } = usePeriods()
  const queryClient = useQueryClient()

  const unacknowledged = alerts?.filter((a) => !a.acknowledged) ?? []
  const acknowledged = alerts?.filter((a) => a.acknowledged) ?? []

  const today = periods?.find((p) => p.period === 'today')
  const last30 = periods?.find((p) => p.period === '30d')

  const hasBudget = settings?.alerts.dailyBudget || settings?.alerts.monthlyBudget

  const dailyPct = settings?.alerts.dailyBudget && today
    ? (today.total.estimatedCost / settings.alerts.dailyBudget) * 100
    : null

  const monthlyPct = settings?.alerts.monthlyBudget && last30
    ? (last30.total.estimatedCost / settings.alerts.monthlyBudget) * 100
    : null

  const acknowledge = async (id: string) => {
    await ipc.invoke('alerts:acknowledge', id)
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  }

  const acknowledgeAll = async () => {
    for (const a of unacknowledged) {
      await ipc.invoke('alerts:acknowledge', a.id)
    }
    queryClient.invalidateQueries({ queryKey: ['alerts'] })
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-sm font-bold text-text-primary tracking-wide">ALERTS</h1>
          <p className="text-[11px] text-text-muted font-mono mt-0.5">
            Budget notifications · {unacknowledged.length} unread
          </p>
        </div>
        {unacknowledged.length > 1 && (
          <button
            onClick={acknowledgeAll}
            className="btn-secondary flex items-center gap-1.5 text-[10px]"
          >
            <CheckCircle className="w-3 h-3" />
            Dismiss All
          </button>
        )}
      </div>

      {/* Budget status cards */}
      {hasBudget && (
        <div className="grid grid-cols-2 gap-3">
          {settings?.alerts.dailyBudget && today && (
            <BudgetCard
              label="Daily Budget"
              spent={today.total.estimatedCost}
              budget={settings.alerts.dailyBudget}
              pct={dailyPct ?? 0}
              requests={today.total.requestCount}
            />
          )}
          {settings?.alerts.monthlyBudget && last30 && (
            <BudgetCard
              label="Monthly Budget"
              spent={last30.total.estimatedCost}
              budget={settings.alerts.monthlyBudget}
              pct={monthlyPct ?? 0}
              requests={last30.total.requestCount}
            />
          )}
        </div>
      )}

      {/* No budget configured */}
      {!hasBudget && (
        <div className="panel py-8 text-center">
          <Bell className="w-8 h-8 text-text-muted mx-auto mb-3 opacity-40" />
          <p className="text-sm text-text-muted">No budget configured</p>
          <p className="text-[11px] text-text-muted mt-1 font-mono">
            Go to Settings → Alerts & Budget to set daily or monthly limits
          </p>
          <div className="mt-3 text-[10px] font-mono text-text-muted">
            Press <kbd className="px-1 py-0.5 rounded bg-bg-elevated border border-border-subtle">5</kbd> to open Settings
          </div>
        </div>
      )}

      {/* Unread alerts */}
      {unacknowledged.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
            Unread ({unacknowledged.length})
          </div>
          {unacknowledged.map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAcknowledge={acknowledge} />
          ))}
        </div>
      )}

      {/* History */}
      {acknowledged.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-text-muted mt-4">
            History ({acknowledged.length})
          </div>
          {acknowledged.slice(0, 20).map((alert) => (
            <AlertCard key={alert.id} alert={alert} onAcknowledge={acknowledge} />
          ))}
        </div>
      )}

      {/* All clear */}
      {hasBudget && unacknowledged.length === 0 && acknowledged.length === 0 && (
        <div className="panel py-8 text-center">
          <CheckCircle className="w-8 h-8 text-accent-green mx-auto mb-3 opacity-60" />
          <p className="text-sm text-text-secondary">All clear</p>
          <p className="text-[11px] text-text-muted mt-1 font-mono">
            No budget thresholds have been crossed
          </p>
        </div>
      )}
    </div>
  )
}

function BudgetCard({ label, spent, budget, pct, requests }: {
  label: string
  spent: number
  budget: number
  pct: number
  requests: number
}) {
  const isHigh = pct >= 90
  const isWarn = pct >= 70
  const barColor = isHigh ? 'var(--accent-red)' : isWarn ? 'var(--accent-orange)' : 'var(--accent-green)'
  const remaining = Math.max(0, budget - spent)

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">{label}</span>
        <span
          className="text-[10px] font-mono font-bold"
          style={{ color: isHigh ? 'var(--accent-red)' : isWarn ? 'var(--accent-orange)' : 'var(--accent-green)' }}
        >
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className="flex items-end justify-between mb-2">
        <div>
          <div className="text-lg font-bold font-mono text-text-primary">{formatCost(spent)}</div>
          <div className="text-[10px] font-mono text-text-muted">of {formatCost(budget)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono" style={{ color: barColor }}>{formatCost(remaining)}</div>
          <div className="text-[9px] font-mono text-text-muted">remaining</div>
        </div>
      </div>

      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(pct, 100)}%`, background: barColor }}
        />
      </div>

      <div className="mt-1.5 text-[9px] font-mono text-text-muted">
        {requests.toLocaleString()} requests
      </div>
    </div>
  )
}

function AlertCard({ alert, onAcknowledge }: { alert: any; onAcknowledge: (id: string) => void }) {
  const isHigh = alert.percentage >= 100
  const isWarn = alert.percentage >= 80

  const Icon = isHigh ? AlertOctagon : isWarn ? AlertTriangle : Bell
  const color = isHigh ? 'text-accent-red' : isWarn ? 'text-accent-orange' : 'text-accent-yellow'
  const borderColor = isHigh ? 'border-accent-red/30' : isWarn ? 'border-accent-orange/30' : 'border-accent-yellow/30'
  const bgColor = isHigh ? 'bg-accent-red/5' : isWarn ? 'bg-accent-orange/5' : 'bg-accent-yellow/5'

  return (
    <div className={`panel border ${borderColor} ${bgColor} ${alert.acknowledged ? 'opacity-40' : ''}`}>
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${color}`} />
          <div>
            <div className="text-xs font-semibold text-text-primary">
              {alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} budget at{' '}
              <span className={color}>{alert.percentage.toFixed(0)}%</span>
            </div>
            <div className="text-[10px] font-mono text-text-secondary mt-0.5">
              Spent: {formatCost(alert.currentValue)} · Threshold: {alert.threshold}%
            </div>
            <div className="text-[9px] font-mono text-text-muted mt-1">
              {format(parseISO(alert.timestamp), 'MMM d, HH:mm:ss')}
            </div>
          </div>
        </div>

        {!alert.acknowledged && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            className="flex items-center gap-1 text-[10px] text-text-muted hover:text-accent-green transition-colors flex-shrink-0 mt-0.5"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
