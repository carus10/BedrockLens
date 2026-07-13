import Store from 'electron-store'
import type { AppSettings, CredentialConfig } from '../../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  credential: {
    type: 'env',
    region: 'us-east-1'
  },
  refreshIntervalSeconds: 60,
  logGroupName: '/aws/bedrock/modelinvocations',
  alerts: {
    dailyBudget: undefined,
    monthlyBudget: undefined,
    sessionBudget: undefined,
    notifyAt: [50, 80, 100],
    enabled: true
  },
  pricingOverrides: {},
  pricingType: 'onDemand',
  theme: 'dark',
  currency: 'USD',
  sessionGapMinutes: 30,
  enableCloudTrail: false,
  enableCostExplorer: true
}

export class SettingsService {
  private static instance: SettingsService
  private store: Store<{ settings: AppSettings }>

  private constructor() {
    this.store = new Store<{ settings: AppSettings }>({
      name: 'bedrock-lens-settings',
      defaults: { settings: DEFAULT_SETTINGS }
    })
  }

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService()
    }
    return SettingsService.instance
  }

  getSettings(): AppSettings {
    return this.store.get('settings', DEFAULT_SETTINGS)
  }

  saveSettings(partial: Partial<AppSettings>): void {
    const current = this.getSettings()
    this.store.set('settings', { ...current, ...partial })
  }

  getCredential(): CredentialConfig {
    return this.getSettings().credential
  }

  updateCredential(credential: CredentialConfig): void {
    this.saveSettings({ credential })
  }
}
