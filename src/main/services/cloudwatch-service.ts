import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  DescribeLogGroupsCommand,
  QueryStatus
} from '@aws-sdk/client-cloudwatch-logs'
import type { BedrockInvocationLog, CredentialConfig } from '../../shared/types'
import { buildCredentialProvider } from './aws-credentials'

const QUERY_POLL_INTERVAL_MS = 1000
const QUERY_TIMEOUT_MS = 30000

export class CloudWatchService {
  private client: CloudWatchLogsClient | null = null
  private logGroupName: string

  constructor(logGroupName: string) {
    this.logGroupName = logGroupName
  }

  async initialize(credential: CredentialConfig): Promise<void> {
    const credProvider = await buildCredentialProvider(credential)
    this.client = new CloudWatchLogsClient({
      region: credential.region,
      credentials: credProvider
    })
  }

  async verifyLogGroup(): Promise<boolean> {
    if (!this.client) return false
    try {
      const resp = await this.client.send(
        new DescribeLogGroupsCommand({ logGroupNamePrefix: this.logGroupName })
      )
      return !!resp.logGroups?.some((lg) => lg.logGroupName === this.logGroupName)
    } catch {
      return false
    }
  }

  async queryInvocations(
    startTime: Date,
    endTime: Date,
    limit = 10000
  ): Promise<BedrockInvocationLog[]> {
    if (!this.client) throw new Error('CloudWatch client not initialized')

    // Keep @message for JS-side regex fallback. No parse commands (causes flaky results).
    const query = `
      fields @timestamp, @message,
             requestId,
             modelId,
             input.inputTokenCount as inputTokens,
             output.outputTokenCount as outputTokens,
             input.cacheReadInputTokenCount as cacheReadTokens,
             input.cacheWriteInputTokenCount as cacheWriteTokens,
             performanceData.latencyMs as latencyMs,
             statusCode,
             errorCode
      | filter ispresent(modelId)
      | sort @timestamp asc
      | limit ${limit}
    `

    const startResp = await this.client.send(
      new StartQueryCommand({
        logGroupName: this.logGroupName,
        startTime: Math.floor(startTime.getTime() / 1000),
        endTime: Math.floor(endTime.getTime() / 1000),
        queryString: query
      })
    )

    const queryId = startResp.queryId
    if (!queryId) throw new Error('Failed to start CloudWatch query')

    // Poll until complete
    const deadline = Date.now() + QUERY_TIMEOUT_MS
    while (Date.now() < deadline) {
      await sleep(QUERY_POLL_INTERVAL_MS)

      let results
      try {
        results = await this.client.send(
          new GetQueryResultsCommand({ queryId })
        )
      } catch (err) {
        console.error('Transient error fetching query results, retrying...', err)
        continue
      }

      if (
        results.status === QueryStatus.Complete ||
        results.status === QueryStatus.Failed ||
        results.status === QueryStatus.Cancelled
      ) {
        if (results.status !== QueryStatus.Complete) {
          throw new Error(`Query ended with status: ${results.status}`)
        }

        return deduplicateLogs(parseQueryResults(results.results ?? []))
      }
    }

    throw new Error('CloudWatch query timed out')
  }

  updateLogGroup(logGroupName: string): void {
    this.logGroupName = logGroupName
  }
}

export function parseQueryResults(
  results: Array<Array<{ field?: string; value?: string }>>
): BedrockInvocationLog[] {
  const getVal = (val: any): number => {
    if (val === undefined || val === null) return 0
    const parsed = parseInt(String(val), 10)
    if (isNaN(parsed) || parsed < 0) return 0
    return parsed
  }

  return results.map((row) => {
    const record: Record<string, string> = {}
    for (const field of row) {
      if (field.field && field.value !== undefined) {
        record[field.field] = field.value
      }
    }

    let jsonParsed: any = null
    let jsonParseSuccess = false
    if (record['@message']) {
      try {
        jsonParsed = JSON.parse(record['@message'])
        jsonParseSuccess = true
      } catch {
        jsonParseSuccess = false
      }
    }

    // Output tokens: try structured field first, then @message JSON, then regex
    let outputTokens = parseInt(record['outputTokens'] ?? '0', 10) || 0
    if (outputTokens === 0 && record['parsedOutputTokens']) {
      outputTokens = parseInt(record['parsedOutputTokens'], 10) || 0
    }
    if (outputTokens === 0 && record['@message']) {
      if (jsonParseSuccess) {
        const val = jsonParsed?.output?.outputTokenCount ?? jsonParsed?.outputTokenCount
        if (val !== undefined && val !== null) {
          outputTokens = getVal(val)
        }
      } else {
        const m = record['@message'].match(/"outputTokenCount"\s*:\s*(\d+)/)
        if (m) outputTokens = parseInt(m[1], 10) || 0
      }
    }

    // Input tokens: also try @message fallback
    let inputTokens = parseInt(record['inputTokens'] ?? '0', 10) || 0
    if (inputTokens === 0 && record['@message']) {
      if (jsonParseSuccess) {
        const val = jsonParsed?.input?.inputTokenCount ?? jsonParsed?.inputTokenCount
        if (val !== undefined && val !== null) {
          inputTokens = getVal(val)
        }
      } else {
        const m = record['@message'].match(/"inputTokenCount"\s*:\s*(\d+)/)
        if (m) inputTokens = parseInt(m[1], 10) || 0
      }
    }

    // Cache tokens: also try @message fallback
    let cacheReadTokens = parseInt(record['cacheReadTokens'] ?? '0', 10) || 0
    if (cacheReadTokens === 0 && record['@message']) {
      if (jsonParseSuccess) {
        const val = jsonParsed?.input?.cacheReadInputTokenCount ?? jsonParsed?.cacheReadInputTokenCount
        if (val !== undefined && val !== null) {
          cacheReadTokens = getVal(val)
        }
      } else {
        const m = record['@message'].match(/"cacheReadInputTokenCount"\s*:\s*(\d+)/)
        if (m) cacheReadTokens = parseInt(m[1], 10) || 0
      }
    }

    let cacheWriteTokens = parseInt(record['cacheWriteTokens'] ?? '0', 10) || 0
    if (cacheWriteTokens === 0 && record['@message']) {
      if (jsonParseSuccess) {
        const val = jsonParsed?.input?.cacheWriteInputTokenCount ?? jsonParsed?.cacheWriteInputTokenCount
        if (val !== undefined && val !== null) {
          cacheWriteTokens = getVal(val)
        }
      } else {
        const m = record['@message'].match(/"cacheWriteInputTokenCount"\s*:\s*(\d+)/)
        if (m) cacheWriteTokens = parseInt(m[1], 10) || 0
      }
    }

    // requestId: from parse or _rid
    const requestId = record['requestId'] || record['_rid'] || ''

    // latency: try performanceData.latencyMs then latency field
    const latencyMs = parseInt(record['latencyMs'] ?? '0', 10) || 0

    return {
      timestamp: record['@timestamp'] ?? '',
      requestId,
      modelId: record['modelId'] ?? '',
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheWriteTokens,
      latencyMs,
      statusCode: parseInt(record['statusCode'] ?? '200', 10) || 200,
      errorCode: record['errorCode']
    }
  })
}

// CloudWatch Logs Insights occasionally returns duplicate rows for the same
// invocation (e.g. one row for request metadata + one for response metadata).
// We deduplicate by requestId, keeping the row with the most token data.
export function deduplicateLogs(logs: BedrockInvocationLog[]): BedrockInvocationLog[] {
  const byId = new Map<string, BedrockInvocationLog>()

  for (const log of logs) {
    const key = log.requestId || log.timestamp
    const existing = byId.get(key)
    if (!existing) {
      byId.set(key, log)
      continue
    }
    // Merge: keep max values per token field
    byId.set(key, {
      ...existing,
      inputTokens: Math.max(existing.inputTokens, log.inputTokens),
      outputTokens: Math.max(existing.outputTokens, log.outputTokens),
      cacheReadTokens: Math.max(existing.cacheReadTokens, log.cacheReadTokens),
      cacheWriteTokens: Math.max(existing.cacheWriteTokens, log.cacheWriteTokens),
      latencyMs: Math.max(existing.latencyMs, log.latencyMs)
    })
  }

  return Array.from(byId.values())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
