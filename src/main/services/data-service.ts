import { format, subDays, startOfDay, endOfDay, startOfToday, endOfToday } from 'date-fns'
import type {
  PeriodData,
  DailyDataPoint,
  HourlyDataPoint,
  Session,
  UsageMetrics,
  ModelUsage,
  BedrockInvocationLog,
  TokenUsage
} from '../../shared/types'
import { PricingEngine } from '../../shared/pricing-engine'
import pricingJson from '../../shared/pricing.json'
import { SettingsService } from './settings-service'
import { CloudWatchService } from './cloudwatch-service'
import { CostExplorerService } from './cost-explorer-service'

interface CachedData {
  logs: BedrockInvocationLog[]
  lastFetched: Date
  periodStart: Date
  periodEnd: Date
}

export class DataService {
  private static instance: DataService
  private settings = SettingsService.getInstance()
  private cloudWatch: CloudWatchService
  private costExplorer: CostExplorerService
  private pricingEngine: PricingEngine
  private cache: CachedData | null = null
  private costCache: Map<string, number> = new Map()
  private initialized = false

  private constructor() {
    const s = this.settings.getSettings()
    this.cloudWatch = new CloudWatchService(s.logGroupName)
    this.costExplorer = new CostExplorerService()
    this.pricingEngine = new PricingEngine(pricingJson as any)
  }

  static getInstance(): DataService {
    if (!DataService.instance) {
      DataService.instance = new DataService()
    }
    return DataService.instance
  }

  async initialize(): Promise<void> {
    const credential = this.settings.getCredential()
    await this.cloudWatch.initialize(credential)
    try {
      await this.costExplorer.initialize(credential)
    } catch {
      // Cost Explorer optional
    }
    await this.refresh()
    this.initialized = true
  }

  async reinitialize(): Promise<void> {
    this.cache = null
    this.costCache.clear()
    this.initialized = false
    await this.initialize()
  }

  async refresh(): Promise<void> {
    const s = this.settings.getSettings()
    this.cloudWatch.updateLogGroup(s.logGroupName)

    const endTime = new Date()
    const startTime = subDays(endTime, 31)

    const logs = await this.cloudWatch.queryInvocations(startTime, endTime)
    this.cache = { logs, lastFetched: new Date(), periodStart: startTime, periodEnd: endTime }

    // Refresh cost explorer in background
    if (s.enableCostExplorer) {
      this.refreshCostExplorer().catch(() => {})
    }
  }

  private async refreshCostExplorer(): Promise<void> {
    try {
      const days = await this.costExplorer.getDailyCosts(31)
      this.costCache.clear()
      for (const d of days) {
        this.costCache.set(d.date, d.bedrockCost)
      }
    } catch {
      // optional
    }
  }

  private getLogs(): BedrockInvocationLog[] {
    return this.cache?.logs ?? []
  }

  private filterByRange(start: Date, end: Date): BedrockInvocationLog[] {
    return this.getLogs().filter((log) => {
      const t = new Date(log.timestamp).getTime()
      return t >= start.getTime() && t <= end.getTime()
    })
  }

  private aggregateMetrics(
    logs: BedrockInvocationLog[],
    pricingType: 'onDemand' | 'provisionedThroughput' = 'onDemand'
  ): UsageMetrics {
    let inputTokens = 0,
      outputTokens = 0,
      cacheReadTokens = 0,
      cacheWriteTokens = 0,
      thinkingTokens = 0,
      totalLatencyMs = 0,
      requestCount = 0

    for (const log of logs) {
      inputTokens += log.inputTokens
      outputTokens += log.outputTokens
      cacheReadTokens += log.cacheReadTokens
      cacheWriteTokens += log.cacheWriteTokens
      totalLatencyMs += log.latencyMs
      requestCount++
    }

    const usage: TokenUsage = {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      thinkingTokens
    }

    const estimatedCost = logs.reduce((sum, log) => {
      return (
        sum +
        this.pricingEngine.calculateCost(
          {
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            cacheReadTokens: log.cacheReadTokens,
            cacheWriteTokens: log.cacheWriteTokens,
            thinkingTokens: 0
          },
          log.modelId,
          pricingType
        )
      )
    }, 0)

    return {
      ...usage,
      requestCount,
      totalLatencyMs,
      averageLatencyMs: requestCount > 0 ? totalLatencyMs / requestCount : 0,
      estimatedCost
    }
  }

  private groupByModel(
    logs: BedrockInvocationLog[],
    pricingType: 'onDemand' | 'provisionedThroughput' = 'onDemand'
  ): ModelUsage[] {
    const byModel = new Map<string, BedrockInvocationLog[]>()

    for (const log of logs) {
      const key = this.pricingEngine.resolveModelKey(log.modelId) ?? log.modelId
      if (!byModel.has(key)) byModel.set(key, [])
      byModel.get(key)!.push(log)
    }

    return Array.from(byModel.entries()).map(([key, modelLogs]) => {
      const metrics = this.aggregateMetrics(modelLogs, pricingType)
      const pricing = this.pricingEngine.getModelPricing(modelLogs[0].modelId)
      return {
        ...metrics,
        modelKey: key,
        modelId: modelLogs[0].modelId,
        displayName: pricing?.displayName ?? key
      }
    })
  }

  async getPeriods(): Promise<PeriodData[]> {
    const s = this.settings.getSettings()
    const pricingType = s.pricingType
    const now = new Date()

    const sessionLogs = this.getSessionLogs(s.sessionGapMinutes)
    const todayLogs = this.filterByRange(startOfToday(), endOfToday())
    const yesterdayStart = startOfDay(subDays(now, 1))
    const yesterdayEnd = endOfDay(subDays(now, 1))
    const last7Start = subDays(now, 7)
    const last30Start = subDays(now, 30)

    const yesterdayLogs = this.filterByRange(yesterdayStart, yesterdayEnd)
    const last7Logs = this.filterByRange(last7Start, now)
    const last30Logs = this.filterByRange(last30Start, now)

    return [
      {
        period: 'session',
        label: 'Current Session',
        startDate: sessionLogs.length > 0 ? sessionLogs[0].timestamp : now.toISOString(),
        endDate: now.toISOString(),
        total: this.aggregateMetrics(sessionLogs, pricingType),
        byModel: this.groupByModel(sessionLogs, pricingType)
      },
      {
        period: 'today',
        label: 'Today',
        startDate: startOfToday().toISOString(),
        endDate: now.toISOString(),
        total: { ...this.aggregateMetrics(todayLogs, pricingType), actualCost: this.costCache.get(format(now, 'yyyy-MM-dd')) },
        byModel: this.groupByModel(todayLogs, pricingType)
      },
      {
        period: 'yesterday',
        label: 'Yesterday',
        startDate: yesterdayStart.toISOString(),
        endDate: yesterdayEnd.toISOString(),
        total: { ...this.aggregateMetrics(yesterdayLogs, pricingType), actualCost: this.costCache.get(format(subDays(now, 1), 'yyyy-MM-dd')) },
        byModel: this.groupByModel(yesterdayLogs, pricingType)
      },
      {
        period: '7d',
        label: 'Last 7 Days',
        startDate: last7Start.toISOString(),
        endDate: now.toISOString(),
        total: this.aggregateMetrics(last7Logs, pricingType),
        byModel: this.groupByModel(last7Logs, pricingType)
      },
      {
        period: '30d',
        label: 'Last 30 Days',
        startDate: last30Start.toISOString(),
        endDate: now.toISOString(),
        total: this.aggregateMetrics(last30Logs, pricingType),
        byModel: this.groupByModel(last30Logs, pricingType)
      }
    ]
  }

  async getDailyData(days: number): Promise<DailyDataPoint[]> {
    const s = this.settings.getSettings()
    const result: DailyDataPoint[] = []
    const now = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(now, i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const start = startOfDay(date)
      const end = endOfDay(date)
      const logs = this.filterByRange(start, end)
      const metrics = this.aggregateMetrics(logs, s.pricingType)
      const byModel = this.groupByModel(logs, s.pricingType)

      const byModelRecord: Record<string, Partial<UsageMetrics> & { displayName?: string }> = {}
      for (const m of byModel) {
        byModelRecord[m.modelKey] = m
      }

      result.push({
        date: dateStr,
        totalCost: this.costCache.get(dateStr) ?? metrics.estimatedCost,
        estimatedCost: metrics.estimatedCost,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        cacheReadTokens: metrics.cacheReadTokens,
        cacheWriteTokens: metrics.cacheWriteTokens,
        requestCount: metrics.requestCount,
        byModel: byModelRecord
      })
    }

    return result
  }

  async getHourlyData(hours: number): Promise<HourlyDataPoint[]> {
    const s = this.settings.getSettings()
    const now = new Date()
    const result: HourlyDataPoint[] = []

    for (let i = hours - 1; i >= 0; i--) {
      const hourStart = new Date(now)
      hourStart.setMinutes(0, 0, 0)
      hourStart.setHours(hourStart.getHours() - i)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hourEnd.getHours() + 1)

      const logs = this.filterByRange(hourStart, hourEnd)
      const metrics = this.aggregateMetrics(logs, s.pricingType)

      result.push({
        hour: format(hourStart, 'HH:mm'),
        requestCount: metrics.requestCount,
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        estimatedCost: metrics.estimatedCost
      })
    }

    return result
  }

  async getSessions(): Promise<Session[]> {
    const s = this.settings.getSettings()
    const logs = this.getLogs().slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    return this.buildSessions(logs, s.sessionGapMinutes, s.pricingType)
  }

  private getSessionLogs(gapMinutes: number): BedrockInvocationLog[] {
    const logs = this.getLogs().slice().sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )

    if (logs.length === 0) return []

    const latestTime = new Date(logs[0].timestamp).getTime()
    const gapMs = gapMinutes * 60 * 1000
    const sessionStart = latestTime - gapMs

    // Walk backwards to find session start
    const sessionLogs: BedrockInvocationLog[] = []
    let lastTime = latestTime

    for (const log of logs) {
      const t = new Date(log.timestamp).getTime()
      if (lastTime - t > gapMs) break
      sessionLogs.push(log)
      lastTime = t
    }

    return sessionLogs.reverse()
  }

  private buildSessions(
    logs: BedrockInvocationLog[],
    gapMinutes: number,
    pricingType: 'onDemand' | 'provisionedThroughput'
  ): Session[] {
    if (logs.length === 0) return []

    const gapMs = gapMinutes * 60 * 1000
    const sessions: Session[] = []
    let currentGroup: BedrockInvocationLog[] = [logs[0]]

    for (let i = 1; i < logs.length; i++) {
      const prev = new Date(logs[i - 1].timestamp).getTime()
      const curr = new Date(logs[i].timestamp).getTime()

      if (curr - prev > gapMs) {
        sessions.push(this.buildSession(currentGroup, pricingType, false))
        currentGroup = [logs[i]]
      } else {
        currentGroup.push(logs[i])
      }
    }

    const isActive =
      currentGroup.length > 0 &&
      Date.now() - new Date(currentGroup[currentGroup.length - 1].timestamp).getTime() < gapMs

    sessions.push(this.buildSession(currentGroup, pricingType, isActive))
    return sessions.reverse()
  }

  private buildSession(
    logs: BedrockInvocationLog[],
    pricingType: 'onDemand' | 'provisionedThroughput',
    isActive: boolean
  ): Session {
    const sortedLogs = logs.slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const startTime = sortedLogs[0].timestamp
    const endTime = sortedLogs[sortedLogs.length - 1].timestamp
    const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime()

    const metrics = this.aggregateMetrics(logs, pricingType)
    const modelsUsed = [...new Set(logs.map((l) => this.pricingEngine.resolveModelKey(l.modelId) ?? l.modelId))]

    return {
      id: `session-${startTime}`,
      startTime,
      endTime,
      durationMs,
      requestCount: metrics.requestCount,
      usage: {
        inputTokens: metrics.inputTokens,
        outputTokens: metrics.outputTokens,
        cacheReadTokens: metrics.cacheReadTokens,
        cacheWriteTokens: metrics.cacheWriteTokens,
        thinkingTokens: metrics.thinkingTokens
      },
      estimatedCost: metrics.estimatedCost,
      modelsUsed,
      isActive
    }
  }

  getPricingEngine(): PricingEngine {
    return this.pricingEngine
  }

  getCostCache(): Map<string, number> {
    return this.costCache
  }

  isInitialized(): boolean {
    return this.initialized
  }

  getLastRefresh(): Date | null {
    return this.cache?.lastFetched ?? null
  }
}
