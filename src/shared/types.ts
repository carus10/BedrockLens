export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  thinkingTokens: number
}

export interface UsageMetrics extends TokenUsage {
  requestCount: number
  totalLatencyMs: number
  averageLatencyMs: number
  estimatedCost: number
  actualCost?: number
}

export interface ModelUsage extends UsageMetrics {
  modelKey: string
  modelId: string
  displayName: string
}

export interface PeriodData {
  period: 'session' | 'today' | 'yesterday' | '7d' | '30d'
  label: string
  startDate: string
  endDate: string
  total: UsageMetrics
  byModel: ModelUsage[]
}

export interface DailyDataPoint {
  date: string
  totalCost: number
  estimatedCost: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  requestCount: number
  byModel: Record<string, Partial<UsageMetrics>>
}

export interface HourlyDataPoint {
  hour: string
  requestCount: number
  inputTokens: number
  outputTokens: number
  estimatedCost: number
}

export interface Session {
  id: string
  startTime: string
  endTime?: string
  durationMs?: number
  requestCount: number
  usage: TokenUsage
  estimatedCost: number
  modelsUsed: string[]
  isActive: boolean
}

export interface BedrockInvocationLog {
  timestamp: string
  requestId: string
  modelId: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  latencyMs: number
  statusCode: number
  errorCode?: string
}

export interface CredentialConfig {
  type: 'profile' | 'sso' | 'accessKey' | 'env' | 'instanceProfile'
  profile?: string
  region: string
  ssoStartUrl?: string
  ssoAccountId?: string
  ssoRoleName?: string
  accessKeyId?: string
  secretAccessKey?: string
  sessionToken?: string
}

export interface AWSCredentialStatus {
  isValid: boolean
  type: string
  accountId?: string
  userId?: string
  arn?: string
  error?: string
}

export interface PricingTier {
  inputPer1k: number
  outputPer1k: number
  cacheWritePer1k?: number
  cacheReadPer1k?: number
}

export interface ModelPricing {
  displayName: string
  modelId: string
  aliases: string[]
  onDemand: PricingTier
  provisionedThroughput?: PricingTier
}

export interface PricingConfig {
  version: string
  currency: string
  models: Record<string, ModelPricing>
}

export interface AlertConfig {
  dailyBudget?: number
  monthlyBudget?: number
  sessionBudget?: number
  notifyAt: number[]
  enabled: boolean
}

export interface AlertEvent {
  id: string
  timestamp: string
  type: 'daily' | 'monthly' | 'session'
  threshold: number
  currentValue: number
  percentage: number
  acknowledged: boolean
}

export interface CreditsConfig {
  totalCredits: number
  usedExternally: number
  startDate: string
  trackingStartedAt?: string
  notes?: string
}

export interface CreditsStatus {
  totalCredits: number
  usedByBedrock: number
  estimatedRemaining: number
  dailyBurnRate: number
  estimatedDepletionDate?: string
  daysRemaining?: number
}

export interface AppSettings {
  credential: CredentialConfig
  refreshIntervalSeconds: number
  logGroupName: string
  logGroupArn?: string
  alerts: AlertConfig
  credits?: CreditsConfig
  pricingOverrides: Record<string, Partial<PricingTier>>
  pricingType: 'onDemand' | 'provisionedThroughput'
  theme: 'dark' | 'darker'
  currency: string
  exportPath?: string
  sessionGapMinutes: number
  enableCloudTrail: boolean
  enableCostExplorer: boolean
}

export interface IpcChannels {
  'aws:test-credentials': [CredentialConfig, AWSCredentialStatus]
  'aws:get-profiles': [void, string[]]
  'aws:detect-credentials': [void, CredentialConfig | null]
  'data:get-periods': [void, PeriodData[]]
  'data:get-daily': [{ days: number }, DailyDataPoint[]]
  'data:get-hourly': [{ hours: number }, HourlyDataPoint[]]
  'data:get-sessions': [void, Session[]]
  'data:refresh': [void, void]
  'settings:get': [void, AppSettings]
  'settings:save': [Partial<AppSettings>, void]
  'alerts:get': [void, AlertEvent[]]
  'alerts:acknowledge': [string, void]
  'credits:get': [void, CreditsStatus | null]
  'export:csv': [{ period: string }, string]
  'export:excel': [{ period: string }, string]
  'export:json': [{ period: string }, string]
  'export:pdf': [{ period: string }, string]
  'pricing:get': [void, PricingConfig]
  'pricing:update': [Partial<PricingConfig>, void]
}

export type IpcRequest<K extends keyof IpcChannels> = IpcChannels[K][0]
export type IpcResponse<K extends keyof IpcChannels> = IpcChannels[K][1]

export interface AppState {
  isLoading: boolean
  lastRefresh?: string
  error?: string
  credentialStatus?: AWSCredentialStatus
}
