import type { PricingConfig, PricingTier, TokenUsage, ModelPricing } from './types'

export class PricingEngine {
  private config: PricingConfig

  constructor(config: PricingConfig) {
    this.config = config
  }

  updateConfig(config: PricingConfig): void {
    this.config = config
  }

  resolveModelKey(modelId: string): string | undefined {
    const normalizedId = modelId.toLowerCase()

    for (const [key, model] of Object.entries(this.config.models)) {
      if (
        model.modelId.toLowerCase() === normalizedId ||
        model.aliases.some((alias) => alias.toLowerCase() === normalizedId) ||
        normalizedId.includes(key) ||
        key.includes(normalizedId.replace(/[^a-z0-9-]/g, '-'))
      ) {
        return key
      }
    }

    // Fuzzy match — find by partial version string
    // Try matching full version string first (e.g. opus-4-5) to avoid version collisions
    for (const [key] of Object.entries(this.config.models)) {
      const parts = key.split('-')
      const versionStr = parts.slice(1).join('-')
      if (versionStr && normalizedId.includes(versionStr)) {
        return key
      }
    }

    // Fallback to major-minor version matching (e.g. opus-4)
    for (const [key] of Object.entries(this.config.models)) {
      const parts = key.split('-')
      const major = parts[1]
      const minor = parts[2]
      if (major && minor && normalizedId.includes(`${major}-${minor}`)) {
        return key
      }
    }

    return undefined
  }

  getModelPricing(modelId: string): ModelPricing | undefined {
    const key = this.resolveModelKey(modelId)
    if (!key) return undefined
    return this.config.models[key]
  }

  calculateCost(
    usage: TokenUsage,
    modelId: string,
    pricingType: 'onDemand' | 'provisionedThroughput' = 'onDemand',
    overrides?: Partial<PricingTier>
  ): number {
    const modelPricing = this.getModelPricing(modelId)
    if (!modelPricing) return 0

    const tier: PricingTier = {
      ...(pricingType === 'provisionedThroughput' && modelPricing.provisionedThroughput
        ? modelPricing.provisionedThroughput
        : modelPricing.onDemand),
      ...overrides
    }

    const inputCost = (usage.inputTokens / 1000) * tier.inputPer1k
    const outputCost = (usage.outputTokens / 1000) * tier.outputPer1k
    const cacheWriteCost = tier.cacheWritePer1k
      ? (usage.cacheWriteTokens / 1000) * tier.cacheWritePer1k
      : 0
    const cacheReadCost = tier.cacheReadPer1k
      ? (usage.cacheReadTokens / 1000) * tier.cacheReadPer1k
      : 0

    return inputCost + outputCost + cacheWriteCost + cacheReadCost
  }

  calculateBatchCost(
    items: Array<{ usage: TokenUsage; modelId: string }>,
    pricingType: 'onDemand' | 'provisionedThroughput' = 'onDemand',
    overrides?: Record<string, Partial<PricingTier>>
  ): number {
    return items.reduce((total, item) => {
      const modelOverride = overrides?.[item.modelId]
      return total + this.calculateCost(item.usage, item.modelId, pricingType, modelOverride)
    }, 0)
  }

  getSupportedModels(): string[] {
    return Object.keys(this.config.models)
  }

  getModelDisplayName(modelId: string): string {
    const model = this.getModelPricing(modelId)
    return model?.displayName ?? modelId
  }

  formatCost(amount: number, currency = 'USD'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount)
  }

  estimateDailyBurnRate(
    last7DayCost: number
  ): number {
    return last7DayCost / 7
  }

  estimateDaysRemaining(remainingCredits: number, dailyBurnRate: number): number | null {
    if (dailyBurnRate <= 0) return null
    return Math.floor(remainingCredits / dailyBurnRate)
  }
}
