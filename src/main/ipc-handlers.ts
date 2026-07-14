import { ipcMain, BrowserWindow } from 'electron'
import { testCredentials, detectCredentials, listAwsProfiles } from './services/aws-credentials'
import { DataService } from './services/data-service'
import { SettingsService } from './services/settings-service'
import { AlertService } from './services/alert-service'
import { ExportService } from './services/export-service'
import pricingJson from '../shared/pricing.json'

export function setupIpcHandlers(): void {
  const settings = SettingsService.getInstance()
  const data = DataService.getInstance()
  const alerts = AlertService.getInstance()
  const exports = ExportService.getInstance()

  // AWS
  ipcMain.handle('aws:test-credentials', async (_, config) => {
    return testCredentials(config)
  })

  ipcMain.handle('aws:get-profiles', async () => {
    return listAwsProfiles()
  })

  ipcMain.handle('aws:detect-credentials', async () => {
    return detectCredentials()
  })

  // Data
  ipcMain.handle('data:get-periods', async () => {
    return data.getPeriods()
  })

  ipcMain.handle('data:get-daily', async (_, { days }) => {
    return data.getDailyData(days)
  })

  ipcMain.handle('data:get-hourly', async (_, { hours }) => {
    return data.getHourlyData(hours)
  })

  ipcMain.handle('data:get-sessions', async () => {
    return data.getSessions()
  })

  ipcMain.handle('data:refresh', async () => {
    await data.refresh()
  })

  // Settings
  ipcMain.handle('settings:get', () => {
    return settings.getSettings()
  })

  ipcMain.handle('settings:save', async (_, partial) => {
    settings.saveSettings(partial)
    if (partial.credential) {
      await data.reinitialize()
    }
  })

  // Alerts
  ipcMain.handle('alerts:get', () => {
    return alerts.getAlerts()
  })

  ipcMain.handle('alerts:acknowledge', (_, id: string) => {
    alerts.acknowledgeAlert(id)
  })

  // Credits
  ipcMain.handle('credits:get', async () => {
    const s = settings.getSettings()
    if (!s.credits) return null

    // Use trackingStartedAt (set when user saves credits) to determine spend window
    // Falls back to startDate for legacy configs without trackingStartedAt
    const trackingStart = s.credits.trackingStartedAt ?? s.credits.startDate
    const trackingMs = new Date(trackingStart).getTime()
    const daysSinceTracking = Math.max(1, Math.ceil((Date.now() - trackingMs) / 86400000))

    const periods = await data.getPeriods()
    const last30 = periods.find((p) => p.period === '30d')
    const last7 = periods.find((p) => p.period === '7d')
    const today = periods.find((p) => p.period === 'today')

    let usedByBedrock: number

    // If tracking started today (less than 24h ago), just use current today period
    if (daysSinceTracking <= 1) {
      const trackingDate = trackingStart.slice(0, 10)
      const todayDate = new Date().toISOString().slice(0, 10)
      if (trackingDate === todayDate) {
        usedByBedrock = today?.total.estimatedCost ?? 0
      } else {
        const dailyData = await data.getDailyData(1)
        usedByBedrock = dailyData.reduce((sum, d) => sum + d.estimatedCost, 0)
      }
    } else if (daysSinceTracking <= 31) {
      const trackingDateStr = trackingStart.slice(0, 10)
      const dailyData = await data.getDailyData(daysSinceTracking)
      usedByBedrock = dailyData
        .filter((d) => d.date >= trackingDateStr)
        .reduce((sum, d) => sum + d.estimatedCost, 0)
    } else {
      usedByBedrock = last30?.total.estimatedCost ?? 0
    }

    const estimatedRemaining = Math.max(0, s.credits.totalCredits - usedByBedrock)

    const last7Cost = last7?.total.estimatedCost ?? 0
    const dailyBurnRate = data.getPricingEngine().estimateDailyBurnRate(last7Cost)

    // Single consistent rounding — floor so "depletes in" never overshoots
    const daysRemaining = dailyBurnRate > 0 ? Math.floor(estimatedRemaining / dailyBurnRate) : undefined
    const deplDate = daysRemaining != null ? (() => {
      const d = new Date()
      d.setDate(d.getDate() + daysRemaining)
      return d
    })() : null

    return {
      totalCredits: s.credits.totalCredits,
      usedByBedrock,
      estimatedRemaining,
      dailyBurnRate,
      estimatedDepletionDate: deplDate?.toISOString(),
      daysRemaining
    }
  })

  // Export
  ipcMain.handle('export:csv', async (_, { period }) => exports.exportCSV(period))
  ipcMain.handle('export:excel', async (_, { period }) => exports.exportExcel(period))
  ipcMain.handle('export:json', async (_, { period }) => exports.exportJSON(period))
  ipcMain.handle('export:pdf', async (_, { period }) => exports.exportPDF(period))

  // Pricing
  ipcMain.handle('pricing:get', () => pricingJson)
  ipcMain.handle('pricing:update', (_, partial) => {
    settings.saveSettings({ pricingOverrides: partial })
  })

}
