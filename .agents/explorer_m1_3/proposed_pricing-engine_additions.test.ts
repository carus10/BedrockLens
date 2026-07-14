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

describe('PricingEngine - Additional Coverage', () => {
  let engine: PricingEngine

  beforeEach(() => {
    engine = new PricingEngine(mockConfig)
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
    expect(engine.getSupportedModels()).toEqual(['claude-sonnet-4-6', 'claude-opus-4-8'])
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
})
