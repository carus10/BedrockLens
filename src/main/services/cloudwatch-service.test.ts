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

  describe('Adversarial & Edge Cases', () => {
    describe('Malformed or Injected @message', () => {
      it('should not crash on completely non-JSON @message and should return default tokens', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-1' },
            { field: 'modelId', value: 'm1' },
            { field: '@message', value: 'not-a-json-at-all' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(0)
        expect(parsed[0].outputTokens).toBe(0)
      })

      it('should NOT fall victim to prompt injection in JSON-stringified @message because of escaping, but matches the second valid JSON occurrence', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-2a' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: JSON.stringify({
                prompt: 'User said: "outputTokenCount": 99999',
                outputTokenCount: 5
              })
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(5) // Not 99999, because JSON.stringify escapes double quotes which breaks the regex pattern.
      })

      it('should fall victim to prompt injection in raw/non-escaped @message', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-2b' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: 'info: "outputTokenCount": 99999, actual outputTokenCount: 5'
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(99999) // Injected value is matched first
      })
    })

    describe('Extreme and Invalid Token Values', () => {
      it('should parse negative token counts literally if they come from fields', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-3' },
            { field: 'modelId', value: 'm1' },
            { field: 'inputTokens', value: '-50' },
            { field: 'outputTokens', value: '-100' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(-50)
        expect(parsed[0].outputTokens).toBe(-100)
      })

      it('should fail to match negative signs in @message regex (returning 0) instead of parsing as positive', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-4' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: JSON.stringify({
                inputTokenCount: -150
              })
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(0) // 0 because the regex \d+ doesn't match the negative sign, causing match to fail
      })

      it('should handle float token counts by truncating to integer', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-5' },
            { field: 'modelId', value: 'm1' },
            { field: 'inputTokens', value: '123.45' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(123)
      })

      it('should handle overflow token counts beyond safe integer limit', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-6' },
            { field: 'modelId', value: 'm1' },
            { field: 'inputTokens', value: '9007199254740992' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(9007199254740992)
      })

      it('should default to 0 for non-numeric fields', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-7' },
            { field: 'modelId', value: 'm1' },
            { field: 'inputTokens', value: 'abc' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].inputTokens).toBe(0)
      })
    })

    describe('Extreme and Invalid Latency Values', () => {
      it('should parse negative latency literally', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-8' },
            { field: 'modelId', value: 'm1' },
            { field: 'latencyMs', value: '-1200' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].latencyMs).toBe(-1200)
      })

      it('should default to 0 for non-numeric latency', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-adv-9' },
            { field: 'modelId', value: 'm1' },
            { field: 'latencyMs', value: 'fast' }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].latencyMs).toBe(0)
      })
    })

    describe('Deduplication Edge Cases', () => {
      it('should deduplicate negative/positive mix using Math.max', () => {
        const logs: BedrockInvocationLog[] = [
          {
            timestamp: '2026-07-14T08:00:00.000Z',
            requestId: 'req-dup-1',
            modelId: 'm1',
            inputTokens: -10,
            outputTokens: 20,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            latencyMs: -100,
            statusCode: 200
          },
          {
            timestamp: '2026-07-14T08:00:00.000Z',
            requestId: 'req-dup-1',
            modelId: 'm1',
            inputTokens: 30,
            outputTokens: -50,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            latencyMs: 150,
            statusCode: 200
          }
        ]

        const merged = deduplicateLogs(logs)
        expect(merged).toHaveLength(1)
        expect(merged[0].inputTokens).toBe(30)
        expect(merged[0].outputTokens).toBe(20)
        expect(merged[0].latencyMs).toBe(150)
      })

      it('should merge duplicate logs with empty requestId and empty timestamp as a single log', () => {
        const logs: BedrockInvocationLog[] = [
          {
            timestamp: '',
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
            timestamp: '',
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

    describe('JSON Parsing Fallback and Prompt Injection Robustness (Gen 2)', () => {
      it('should handle malformed JSON correctly by falling back to regex parsing', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-gen2-1' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: '{"outputTokenCount": 777, "inputTokenCount": 222, "cacheReadInputTokenCount": 111, "cacheWriteInputTokenCount": 55'
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(777)
        expect(parsed[0].inputTokens).toBe(222)
        expect(parsed[0].cacheReadTokens).toBe(111)
        expect(parsed[0].cacheWriteTokens).toBe(55)
      })

      it('should handle prompt injection in malformed JSON (vulnerability verification)', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-gen2-2' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: '{"prompt": "User said: \"outputTokenCount\": 99999", "inputTokenCount": 10'
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        // Since JSON parsing fails, regex fallback runs and matches the prompt injection value
        expect(parsed[0].outputTokens).toBe(99999)
      })

      it('should handle standard valid JSON input without regressions', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-gen2-3' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: JSON.stringify({
                outputTokenCount: 45,
                inputTokenCount: 15,
                cacheReadInputTokenCount: 5,
                cacheWriteInputTokenCount: 2
              })
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(45)
        expect(parsed[0].inputTokens).toBe(15)
        expect(parsed[0].cacheReadTokens).toBe(5)
        expect(parsed[0].cacheWriteTokens).toBe(2)
      })

      it('should parse nested JSON structure in @message correctly', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-gen2-4' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: JSON.stringify({
                output: { outputTokenCount: 123 },
                input: {
                  inputTokenCount: 456,
                  cacheReadInputTokenCount: 78,
                  cacheWriteInputTokenCount: 90
                }
              })
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(123)
        expect(parsed[0].inputTokens).toBe(456)
        expect(parsed[0].cacheReadTokens).toBe(78)
        expect(parsed[0].cacheWriteTokens).toBe(90)
      })

      it('should handle SQL or prompt-injection payload strings in valid JSON safely without regression', () => {
        const results = [
          [
            { field: '@timestamp', value: '2026-07-14T08:00:00.000Z' },
            { field: 'requestId', value: 'req-gen2-5' },
            { field: 'modelId', value: 'm1' },
            {
              field: '@message',
              value: JSON.stringify({
                prompt: "DROP TABLE logs; -- outputTokenCount: 99999",
                output: { outputTokenCount: 10 },
                input: { inputTokenCount: 5 }
              })
            }
          ]
        ]
        const parsed = parseQueryResults(results)
        expect(parsed).toHaveLength(1)
        expect(parsed[0].outputTokens).toBe(10) // Parsed safely from JSON output object
        expect(parsed[0].inputTokens).toBe(5)
      })
    })
  })
})

