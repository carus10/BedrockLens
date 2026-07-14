import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'

// Spy on process.exit and console methods
const exitSpy = vi.spyOn(process, 'exit').mockImplementation((code) => {
  return undefined as never
})
vi.spyOn(console, 'log').mockImplementation(() => {})
vi.spyOn(console, 'error').mockImplementation(() => {})

// Define mocked service functions
const mockDetectCredentials = vi.fn()
const mockGetDailyCosts = vi.fn()
const mockQueryInvocations = vi.fn()

// Register module mocks (hoisted — apply before any import)
vi.mock('../services/aws-credentials', () => ({
  detectCredentials: mockDetectCredentials
}))

vi.mock('../services/cost-explorer-service', () => ({
  CostExplorerService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getDailyCosts: mockGetDailyCosts
  }))
}))

vi.mock('../services/cloudwatch-service', () => ({
  CloudWatchService: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    queryInvocations: mockQueryInvocations
  })),
  deduplicateLogs: (logs: any) => logs
}))

// Import main() after mocks are registered
import('../../../scripts/verify-billing').then(() => {})

// Helper: run the billing logic fresh each time
async function runBillingScript(): Promise<void> {
  const { main } = await import('../../../scripts/verify-billing')
  await main()
}

describe('AWS Bedrock Billing Verification Script', () => {
  const originalArgv = [...process.argv]
  const systemDate = new Date('2026-07-14T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(systemDate)

    // Reset argv to defaults
    process.argv = ['node', 'verify-billing.ts']

    // Clear all mock state
    exitSpy.mockClear()
    mockDetectCredentials.mockReset()
    mockGetDailyCosts.mockReset()
    mockQueryInvocations.mockReset()

    // Default: credentials succeed
    mockDetectCredentials.mockResolvedValue({
      type: 'env',
      region: 'us-east-1'
    })
    // Default: empty responses
    mockQueryInvocations.mockResolvedValue([])
    mockGetDailyCosts.mockResolvedValue([])
  })

  afterEach(() => {
    process.argv = [...originalArgv]
    vi.useRealTimers()
  })

  describe('Mock Modes (--mock and --mock-fail)', () => {
    it('exits with 0 in --mock mode with default mock data', async () => {
      process.argv.push('--mock')
      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('exits with 1 in --mock-fail mode due to variance threshold violation', async () => {
      process.argv.push('--mock-fail')
      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Extreme values stress verification', () => {
    it('handles a huge number of logs (10,000 logs) efficiently and succeeds if costs match', async () => {
      const date = '2026-07-07'
      const rawLogs = Array.from({ length: 10000 }, (_, i) => ({
        timestamp: `${date}T12:00:00.000Z`,
        requestId: `req-${i}`,
        modelId: 'anthropic.claude-sonnet-5',
        inputTokens: 1000,
        outputTokens: 1000,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        latencyMs: 100,
        statusCode: 200
      }))

      mockQueryInvocations.mockResolvedValue(rawLogs)
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 180.00 },
        { date: '2026-07-08', bedrockCost: 0 },
        { date: '2026-07-09', bedrockCost: 0 },
        { date: '2026-07-10', bedrockCost: 0 },
        { date: '2026-07-11', bedrockCost: 0 },
        { date: '2026-07-12', bedrockCost: 0 },
        { date: '2026-07-13', bedrockCost: 0 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('succeeds under zero logs and zero cost scenario', async () => {
      mockQueryInvocations.mockResolvedValue([])
      mockGetDailyCosts.mockResolvedValue([])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })
  })

  describe('Mismatched date ranges', () => {
    it('fails when logs exist but actual Cost Explorer cost is 0', async () => {
      mockQueryInvocations.mockResolvedValue([
        {
          timestamp: '2026-07-07T12:00:00.000Z',
          requestId: 'req-1',
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 1000,
          outputTokens: 1000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        }
      ])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 0.00 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('fails when no logs exist but actual Cost Explorer cost is non-zero', async () => {
      mockQueryInvocations.mockResolvedValue([])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 5.00 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })

  describe('Double Tolerance and Threshold Checking', () => {
    it('succeeds on small decimal differences (under $0.01 absolute) despite high percentage variance', async () => {
      // CW Est = $0.003, CE = $0.000 → diff = 0.003 ≤ 0.01 → OK
      mockQueryInvocations.mockResolvedValue([
        {
          timestamp: '2026-07-07T12:00:00.000Z',
          requestId: 'req-1',
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 1000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        }
      ])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 0.00 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('fails when difference exceeds $0.01 and percentage exceeds threshold', async () => {
      // CW Est = $0.012 (4000 input tokens * $0.003/1k), CE = $0.000 → diff > 0.01 AND var > 1%
      mockQueryInvocations.mockResolvedValue([
        {
          timestamp: '2026-07-07T12:00:00.000Z',
          requestId: 'req-1',
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 4000,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        }
      ])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 0.00 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })

    it('succeeds when difference is large but percentage variance is within threshold', async () => {
      // CW Est = $100.00, CE = $100.50 → var = 0.497% ≤ 1% → OK
      mockQueryInvocations.mockResolvedValue([
        {
          timestamp: '2026-07-07T12:00:00.000Z',
          requestId: 'req-1',
          modelId: 'anthropic.claude-opus-4-8',
          inputTokens: 2000000,
          outputTokens: 3600000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        }
      ])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 100.50 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    it('fails when difference is large and percentage variance exceeds threshold', async () => {
      // CW Est = $100.00, CE = $101.50 → var = 1.48% > 1% → FAIL
      mockQueryInvocations.mockResolvedValue([
        {
          timestamp: '2026-07-07T12:00:00.000Z',
          requestId: 'req-1',
          modelId: 'anthropic.claude-opus-4-8',
          inputTokens: 2000000,
          outputTokens: 3600000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        }
      ])
      mockGetDailyCosts.mockResolvedValue([
        { date: '2026-07-07', bedrockCost: 101.50 }
      ])

      await runBillingScript()
      expect(exitSpy).toHaveBeenCalledWith(1)
    })
  })
})
