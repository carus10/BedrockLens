import { describe, it, expect } from 'vitest'
import { parseQueryResults, deduplicateLogs } from './cloudwatch-service'
import type { BedrockInvocationLog } from '../../shared/types'

describe('CloudWatchService Log Parsing', () => {
  describe('parseQueryResults', () => {
    it('should parse standard query results successfully', () => {
      const results = [
        [
          { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
          { field: 'requestId', value: 'req-1' },
          { field: 'modelId', value: 'anthropic.claude-v2' },
          { field: 'inputTokens', value: '100' },
          { field: 'outputTokens', value: '200' },
          { field: 'cacheReadTokens', value: '50' },
          { field: 'cacheWriteTokens', value: '10' },
          { field: 'latencyMs', value: '1200' },
          { field: 'statusCode', value: '200' }
        ]
      ]

      const parsed = parseQueryResults(results)
      expect(parsed).toHaveLength(1)
      expect(parsed[0]).toEqual({
        timestamp: '2026-07-14T08:00:00.000Z',
        requestId: 'req-1',
        modelId: 'anthropic.claude-v2',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
        latencyMs: 1200,
        statusCode: 200,
        errorCode: undefined
      })
    })

    it('should fallback to @message regex when token counts are missing or zero', () => {
      const results = [
        [
          { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
          { field: 'requestId', value: 'req-2' },
          { field: 'modelId', value: 'anthropic.claude-v3' },
          { field: 'inputTokens', value: '0' },
          { field: 'outputTokens', value: '0' },
          { field: 'cacheReadTokens', value: '0' },
          { field: 'cacheWriteTokens', value: '0' },
          { field: 'latencyMs', value: '500' },
          { field: 'statusCode', value: '200' },
          {
            field: '@message',
            value: JSON.stringify({
              inputTokenCount: 150,
              outputTokenCount: 250,
              cacheReadInputTokenCount: 80,
              cacheWriteInputTokenCount: 30
            })
          }
        ]
      ]

      const parsed = parseQueryResults(results)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].inputTokens).toBe(150)
      expect(parsed[0].outputTokens).toBe(250)
      expect(parsed[0].cacheReadTokens).toBe(80)
      expect(parsed[0].cacheWriteTokens).toBe(30)
    })

    it('should fallback to parsedOutputTokens when outputTokens is zero', () => {
      const results = [
        [
          { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
          { field: 'requestId', value: 'req-3' },
          { field: 'modelId', value: 'anthropic.claude-v3' },
          { field: 'outputTokens', value: '0' },
          { field: 'parsedOutputTokens', value: '450' }
        ]
      ]

      const parsed = parseQueryResults(results)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].outputTokens).toBe(450)
    })

    it('should parse requestId from _rid fallback and status code defaults', () => {
      const results = [
        [
          { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
          { field: '_rid', value: 'rid-999' },
          { field: 'modelId', value: 'anthropic.claude-v3' }
        ]
      ]

      const parsed = parseQueryResults(results)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].requestId).toBe('rid-999')
      expect(parsed[0].statusCode).toBe(200) // Default value
    })

    it('should parse errorCode if present', () => {
      const results = [
        [
          { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
          { field: 'modelId', value: 'anthropic.claude-v3' },
          { field: 'errorCode', value: 'ThrottlingException' },
          { field: 'statusCode', value: '400' }
        ]
      ]

      const parsed = parseQueryResults(results)
      expect(parsed).toHaveLength(1)
      expect(parsed[0].errorCode).toBe('ThrottlingException')
      expect(parsed[0].statusCode).toBe(400)
    })
  })

  describe('deduplicateLogs', () => {
    it('should return empty array for empty inputs', () => {
      expect(deduplicateLogs([])).toEqual([])
    })

    it('should keep unique logs untouched', () => {
      const logs: BedrockInvocationLog[] = [
        {
          timestamp: '2026-07-14T08:00:00.000Z',
          requestId: 'req-1',
          modelId: 'm1',
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        },
        {
          timestamp: '2026-07-14T08:01:00.000Z',
          requestId: 'req-2',
          modelId: 'm2',
          inputTokens: 30,
          outputTokens: 40,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 200,
          statusCode: 200
        }
      ]

      expect(deduplicateLogs(logs)).toEqual(logs)
    })

    it('should merge duplicate logs by taking maximum value of each field', () => {
      const logs: BedrockInvocationLog[] = [
        {
          timestamp: '2026-07-14T08:00:00.000Z',
          requestId: 'req-1',
          modelId: 'm1',
          inputTokens: 100,
          outputTokens: 0,
          cacheReadTokens: 50,
          cacheWriteTokens: 0,
          latencyMs: 800,
          statusCode: 200
        },
        {
          timestamp: '2026-07-14T08:00:00.000Z',
          requestId: 'req-1',
          modelId: 'm1',
          inputTokens: 0,
          outputTokens: 200,
          cacheReadTokens: 0,
          cacheWriteTokens: 10,
          latencyMs: 1200,
          statusCode: 200
        }
      ]

      const merged = deduplicateLogs(logs)
      expect(merged).toHaveLength(1)
      expect(merged[0]).toEqual({
        timestamp: '2026-07-14T08:00:00.000Z',
        requestId: 'req-1',
        modelId: 'm1',
        inputTokens: 100,
        outputTokens: 200,
        cacheReadTokens: 50,
        cacheWriteTokens: 10,
        latencyMs: 1200,
        statusCode: 200
      })
    })

    it('should deduplicate using timestamp when requestId is missing', () => {
      const logs: BedrockInvocationLog[] = [
        {
          timestamp: '2026-07-14T08:00:00.000Z',
          requestId: '',
          modelId: 'm1',
          inputTokens: 10,
          outputTokens: 20,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 100,
          statusCode: 200
        },
        {
          timestamp: '2026-07-14T08:00:00.000Z',
          requestId: '',
          modelId: 'm1',
          inputTokens: 30,
          outputTokens: 40,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 150,
          statusCode: 200
        }
      ]

      const merged = deduplicateLogs(logs)
      expect(merged).toHaveLength(1)
      expect(merged[0].inputTokens).toBe(30)
      expect(merged[0].outputTokens).toBe(40)
      expect(merged[0].latencyMs).toBe(150)
    })
  })
})
