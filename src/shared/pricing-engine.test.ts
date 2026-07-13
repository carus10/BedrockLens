import { describe, it, expect, beforeEach } from 'vitest'
import { PricingEngine } from './pricing-engine'
import type { PricingConfig } from './types'

const mockConfig: PricingConfig = {
  version: 'test',
  currency: 'USD',
  models: {
    'claude-sonnet-4-6': {
      displayName: 'Claude Sonnet 4.6',
      modelId: 'us.anthropic.claude-sonnet-4-6',
      aliases: ['anthropic.claude-sonnet-4-6'],
      onDemand: {
        inputPer1k: 0.003,
        outputPer1k: 0.015,
        cacheWritePer1k: 0.00375,
        cacheReadPer1k: 0.0003
      }
    },
    'claude-opus-4-8': {
      displayName: 'Claude Opus 4.8',
      modelId: 'us.anthropic.claude-opus-4-8',
      aliases: [],
      onDemand: {
        inputPer1k: 0.015,
        outputPer1k: 0.075,
        cacheWritePer1k: 0.01875,
        cacheReadPer1k: 0.0015
      }
    }
  }
}

describe('PricingEngine', () => {
  let engine: PricingEngine

  beforeEach(() => {
    engine = new PricingEngine(mockConfig)
  })

  it('resolves model key by exact modelId', () => {
    expect(engine.resolveModelKey('us.anthropic.claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })

  it('resolves model key by alias', () => {
    expect(engine.resolveModelKey('anthropic.claude-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })

  it('calculates input cost correctly', () => {
    const cost = engine.calculateCost(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
      'us.anthropic.claude-sonnet-4-6'
    )
    expect(cost).toBeCloseTo(0.003)
  })

  it('calculates output cost correctly', () => {
    const cost = engine.calculateCost(
      { inputTokens: 0, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
      'us.anthropic.claude-sonnet-4-6'
    )
    expect(cost).toBeCloseTo(0.015)
  })

  it('calculates cache read at discounted rate', () => {
    const cost = engine.calculateCost(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1000, cacheWriteTokens: 0, thinkingTokens: 0 },
      'us.anthropic.claude-sonnet-4-6'
    )
    expect(cost).toBeCloseTo(0.0003)
  })

  it('calculates combined cost', () => {
    const cost = engine.calculateCost(
      { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200, cacheWriteTokens: 100, thinkingTokens: 0 },
      'us.anthropic.claude-sonnet-4-6'
    )
    const expected = 0.003 + 0.0075 + 0.00006 + 0.000375
    expect(cost).toBeCloseTo(expected)
  })

  it('returns 0 for unknown model', () => {
    const cost = engine.calculateCost(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
      'unknown-model-xyz'
    )
    expect(cost).toBe(0)
  })

  it('uses overrides when provided', () => {
    const cost = engine.calculateCost(
      { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
      'us.anthropic.claude-sonnet-4-6',
      'onDemand',
      { inputPer1k: 0.006 }
    )
    expect(cost).toBeCloseTo(0.006)
  })

  it('estimates daily burn rate', () => {
    const rate = engine.estimateDailyBurnRate(7.0)
    expect(rate).toBeCloseTo(1.0)
  })

  it('estimates depletion date', () => {
    const date = engine.estimateDepletionDate(100, 10)
    expect(date).not.toBeNull()
    const daysAway = Math.floor((date!.getTime() - Date.now()) / 86400000)
    expect(daysAway).toBeGreaterThanOrEqual(9)
    expect(daysAway).toBeLessThanOrEqual(11)
  })

  it('returns null for depletion when burn rate is 0', () => {
    const date = engine.estimateDepletionDate(100, 0)
    expect(date).toBeNull()
  })
})
