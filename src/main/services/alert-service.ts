import Store from 'electron-store'
import type { AlertEvent, AlertConfig } from '../../shared/types'
import { SettingsService } from './settings-service'
import { DataService } from './data-service'

interface AlertStore {
  alerts: AlertEvent[]
  notifiedThresholds: Record<string, number[]>
}

export class AlertService {
  private static instance: AlertService
  private store: Store<AlertStore>

  private constructor() {
    this.store = new Store<AlertStore>({
      name: 'bedrock-lens-alerts',
      defaults: { alerts: [], notifiedThresholds: {} }
    })
  }

  static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService()
    }
    return AlertService.instance
  }

  async checkAlerts(): Promise<AlertEvent[]> {
    const settings = SettingsService.getInstance().getSettings()
    const { alerts } = settings
    if (!alerts.enabled) return []

    const dataService = DataService.getInstance()
    const periods = await dataService.getPeriods()
    const today = periods.find((p) => p.period === 'today')
    const last30 = periods.find((p) => p.period === '30d')

    const newAlerts: AlertEvent[] = []

    // Daily budget
    if (alerts.dailyBudget && today) {
      const pct = (today.total.estimatedCost / alerts.dailyBudget) * 100
      const key = `daily-${today.startDate.slice(0, 10)}`
      for (const threshold of alerts.notifyAt) {
        if (pct >= threshold && !this.hasNotified(key, threshold)) {
          newAlerts.push(this.createAlert('daily', threshold, today.total.estimatedCost, pct))
          this.markNotified(key, threshold)
        }
      }
    }

    // Monthly budget
    if (alerts.monthlyBudget && last30) {
      const monthStr = new Date().toISOString().slice(0, 7)
      const pct = (last30.total.estimatedCost / alerts.monthlyBudget) * 100
      const key = `monthly-${monthStr}`
      for (const threshold of alerts.notifyAt) {
        if (pct >= threshold && !this.hasNotified(key, threshold)) {
          newAlerts.push(this.createAlert('monthly', threshold, last30.total.estimatedCost, pct))
          this.markNotified(key, threshold)
        }
      }
    }

    // Session budget — check the most recent active/completed session
    if (alerts.sessionBudget) {
      const sessions = await dataService.getSessions()
      const recent = sessions[0]
      if (recent) {
        const pct = (recent.estimatedCost / alerts.sessionBudget) * 100
        const key = `session-${recent.id}`
        for (const threshold of alerts.notifyAt) {
          if (pct >= threshold && !this.hasNotified(key, threshold)) {
            newAlerts.push(this.createAlert('session', threshold, recent.estimatedCost, pct))
            this.markNotified(key, threshold)
          }
        }
      }
    }

    if (newAlerts.length > 0) {
      const existing = this.store.get('alerts', [])
      this.store.set('alerts', [...newAlerts, ...existing].slice(0, 200))
    }

    return newAlerts
  }

  getAlerts(): AlertEvent[] {
    return this.store.get('alerts', [])
  }

  acknowledgeAlert(id: string): void {
    const alerts = this.store.get('alerts', [])
    this.store.set(
      'alerts',
      alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    )
  }

  private createAlert(
    type: AlertEvent['type'],
    threshold: number,
    currentValue: number,
    percentage: number
  ): AlertEvent {
    return {
      id: `${type}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type,
      threshold,
      currentValue,
      percentage,
      acknowledged: false
    }
  }

  private hasNotified(key: string, threshold: number): boolean {
    const thresholds = this.store.get('notifiedThresholds', {})
    return thresholds[key]?.includes(threshold) ?? false
  }

  private markNotified(key: string, threshold: number): void {
    const thresholds = this.store.get('notifiedThresholds', {})
    thresholds[key] = [...(thresholds[key] ?? []), threshold]
    this.store.set('notifiedThresholds', thresholds)
  }
}
