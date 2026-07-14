import { describe, it, expect, beforeEach, vi } from 'vitest'
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
      },
      provisionedThroughput: {
        inputPer1k: 0.0015,
        outputPer1k: 0.0075,
        cacheWritePer1k: 0.001875,
        cacheReadPer1k: 0.00015
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
    },
    'claude-opus-4-5': {
      displayName: 'Claude Opus 4.5',
      modelId: 'us.anthropic.claude-opus-4-5',
      aliases: [],
      onDemand: {
        inputPer1k: 0.012,
        outputPer1k: 0.060,
        cacheWritePer1k: 0.0150,
        cacheReadPer1k: 0.0012
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

  it('estimates days remaining', () => {
    const days = engine.estimateDaysRemaining(100, 10)
    expect(days).toBe(10)
  })

  it('returns null for days remaining when burn rate is 0', () => {
    const days = engine.estimateDaysRemaining(100, 0)
    expect(days).toBeNull()
  })

  it('calculates batch cost correctly for multiple items', () => {
    const items = [
      {
        usage: { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        modelId: 'us.anthropic.claude-sonnet-4-6'
      },
      {
        usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        modelId: 'us.anthropic.claude-opus-4-8'
      }
    ]
    // claude-sonnet: (1000/1000)*0.003 + (500/1000)*0.015 = 0.003 + 0.0075 = 0.0105
    // claude-opus: (1000/1000)*0.015 + (200/1000)*0.075 = 0.015 + 0.015 = 0.03
    // Total = 0.0405
    const cost = engine.calculateBatchCost(items)
    expect(cost).toBeCloseTo(0.0405)
  })

  it('calculates batch cost with model-specific overrides', () => {
    const items = [
      {
        usage: { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        modelId: 'us.anthropic.claude-sonnet-4-6'
      }
    ]
    const overrides = {
      'us.anthropic.claude-sonnet-4-6': { inputPer1k: 0.01 }
    }
    const cost = engine.calculateBatchCost(items, 'onDemand', overrides)
    expect(cost).toBeCloseTo(0.01)
  })

  it('returns supported models list', () => {
    expect(engine.getSupportedModels()).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-5'])
  })

  it('returns model display name', () => {
    expect(engine.getModelDisplayName('us.anthropic.claude-sonnet-4-6')).toBe('Claude Sonnet 4.6')
  })

  it('falls back to modelId when display name is not found', () => {
    expect(engine.getModelDisplayName('unknown-id')).toBe('unknown-id')
  })

  it('formats cost using currency standard formatting', () => {
    const formatted = engine.formatCost(0.12345)
    // Expect formatted string to represent $0.1235 (minimumFractionDigits: 4, maximumFractionDigits: 4)
    expect(formatted).toContain('$0.1235')
  })

  it('fuzzy matches model key using normalizedId substring check', () => {
    // normalizedId.includes(key)
    expect(engine.resolveModelKey('prefix-claude-sonnet-4-6-suffix')).toBe('claude-sonnet-4-6')
    // key.includes(...)
    expect(engine.resolveModelKey('claude-sonnet')).toBe('claude-sonnet-4-6')
  })

  it('fuzzy matches model key using partial version major-minor logic', () => {
    expect(engine.resolveModelKey('some-custom-sonnet-4-6')).toBe('claude-sonnet-4-6')
  })

  it('allows config updates', () => {
    const newConfig: PricingConfig = {
      version: 'test-2',
      currency: 'USD',
      models: {
        'new-model': {
          displayName: 'New Model',
          modelId: 'aws.new-model',
          aliases: [],
          onDemand: {
            inputPer1k: 0.1,
            outputPer1k: 0.2
          }
        }
      }
    }
    engine.updateConfig(newConfig)
    expect(engine.getSupportedModels()).toEqual(['new-model'])
  })

  describe('Boundary Conditions & Challenger Tests', () => {
    it('handles zero tokens correctly', () => {
      const cost = engine.calculateCost(
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6'
      )
      expect(cost).toBe(0)
    })

    it('handles negative tokens (returns negative cost)', () => {
      const cost = engine.calculateCost(
        { inputTokens: -1000, outputTokens: -2000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6'
      )
      // (-1000/1000)*0.003 + (-2000/1000)*0.015 = -0.003 - 0.030 = -0.033
      expect(cost).toBeCloseTo(-0.033)
    })

    it('handles massive token counts causing overflow/Infinity', () => {
      const cost = engine.calculateCost(
        { inputTokens: Infinity, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6'
      )
      expect(cost).toBe(Infinity)
    })

    it('handles NaN token counts (returns NaN)', () => {
      const cost = engine.calculateCost(
        { inputTokens: NaN, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6'
      )
      expect(cost).toBeNaN()
    })

    it('returns negative days for negative credits', () => {
      const days = engine.estimateDaysRemaining(-10, 5)
      expect(days).not.toBeNull()
      expect(days).toBe(-2)
    })

    it('resolves invalid/empty modelId incorrectly due to empty/hyphen substring check', () => {
      // Due to: key.includes(normalizedId.replace(/[^a-z0-9-]/g, '-'))
      // If modelId is "." or "/", normalizedId.replace(/[^a-z0-9-]/g, '-') becomes "-"
      // Since 'claude-sonnet-4-6' includes "-", it matches!
      expect(engine.resolveModelKey('.')).toBe('claude-sonnet-4-6')
      expect(engine.resolveModelKey('/')).toBe('claude-sonnet-4-6')
      expect(engine.resolveModelKey('-')).toBe('claude-sonnet-4-6')
      expect(engine.resolveModelKey('')).toBe('claude-sonnet-4-6')
    })

    it('verifies Sonnet 5 introductory pricing is ignored', () => {
      // Load actual pricing.json
      const actualPricing = require('./pricing.json')
      const prodEngine = new PricingEngine(actualPricing)
      
      // Calculate cost for Sonnet 5 with 1000 input tokens
      // If it used introductory pricing, cost would be (1000/1000)*0.002 = 0.002
      // Standard pricing cost is (1000/1000)*0.003 = 0.003
      const cost = prodEngine.calculateCost(
        { inputTokens: 1000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'anthropic.claude-sonnet-5'
      )
      
      expect(cost).toBeCloseTo(0.003, 4) // Standard pricing
      expect(cost).not.toBeCloseTo(0.002, 4) // Introductory pricing is NOT used
    })

    it('calculates cost using provisionedThroughput pricing when requested', () => {
      const cost = engine.calculateCost(
        { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-sonnet-4-6',
        'provisionedThroughput'
      )
      // (1000/1000)*0.0015 + (1000/1000)*0.0075 = 0.0090
      expect(cost).toBeCloseTo(0.0090)
    })

    it('falls back to onDemand pricing when provisionedThroughput is not defined for a model', () => {
      const cost = engine.calculateCost(
        { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'us.anthropic.claude-opus-4-8',
        'provisionedThroughput'
      )
      // (1000/1000)*0.015 + (1000/1000)*0.075 = 0.0900
      expect(cost).toBeCloseTo(0.0900)
    })

    it('resolves model key with version collision correctly', () => {
      // anthropic.opus-4-5 must resolve to claude-opus-4-5 and not claude-opus-4-8
      expect(engine.resolveModelKey('anthropic.opus-4-5')).toBe('claude-opus-4-5')
      expect(engine.resolveModelKey('anthropic.opus-4-8')).toBe('claude-opus-4-8')
    })

    it('resolves partial major-minor matching to first match in config as fallback', () => {
      expect(engine.resolveModelKey('anthropic.opus-4')).toBe('claude-opus-4-8')
    })

    it('returns undefined for non-existent versions', () => {
      expect(engine.resolveModelKey('anthropic.opus-3-0')).toBeUndefined()
    })
  })
})
