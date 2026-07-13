import Store from 'electron-store'
import type { AlertEvent, AlertConfig } from '../../shared/types'
import { SettingsService } from './settings-service'
import { DataService } from './data-service'

export class AlertService {
  private static instance: AlertService
  private store: Store<{ alerts: AlertEvent[] }>
  private notifiedThresholds: Map<string, Set<number>> = new Map()

  private constructor() {
    this.store = new Store<{ alerts: AlertEvent[] }>({
      name: 'bedrock-lens-alerts',
      defaults: { alerts: [] }
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
      for (const threshold of alerts.notifyAt) {
        const key = `daily-${today.startDate.slice(0, 10)}`
        if (pct >= threshold && !this.hasNotified(key, threshold)) {
          const event = this.createAlert('daily', threshold, today.total.estimatedCost, pct)
          newAlerts.push(event)
          this.markNotified(key, threshold)
        }
      }
    }

    // Monthly budget
    if (alerts.monthlyBudget && last30) {
      const monthStr = new Date().toISOString().slice(0, 7)
      const pct = (last30.total.estimatedCost / alerts.monthlyBudget) * 100
      for (const threshold of alerts.notifyAt) {
        const key = `monthly-${monthStr}`
        if (pct >= threshold && !this.hasNotified(key, threshold)) {
          const event = this.createAlert('monthly', threshold, last30.total.estimatedCost, pct)
          newAlerts.push(event)
          this.markNotified(key, threshold)
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
    return this.notifiedThresholds.get(key)?.has(threshold) ?? false
  }

  private markNotified(key: string, threshold: number): void {
    if (!this.notifiedThresholds.has(key)) {
      this.notifiedThresholds.set(key, new Set())
    }
    this.notifiedThresholds.get(key)!.add(threshold)
  }
}
