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

    // Compute total Bedrock spend since credits startDate
    const startDate = new Date(s.credits.startDate)
    const daysSinceStart = Math.max(1, Math.ceil((Date.now() - startDate.getTime()) / 86400000))
    const dailyData = await data.getDailyData(Math.min(daysSinceStart, 365))
    const usedByBedrock = dailyData
      .filter((d) => new Date(d.date) >= startDate)
      .reduce((sum, d) => sum + d.estimatedCost, 0)

    const estimatedRemaining = Math.max(0, s.credits.totalCredits - usedByBedrock)

    // Burn rate: use last 7 days or however many days we have
    const periods = await data.getPeriods()
    const last7 = periods.find((p) => p.period === '7d')
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
