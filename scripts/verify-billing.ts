import { format, subDays } from 'date-fns'
import { detectCredentials } from '../src/main/services/aws-credentials'
import { CostExplorerService } from '../src/main/services/cost-explorer-service'
import { CloudWatchService, deduplicateLogs } from '../src/main/services/cloudwatch-service'
import { PricingEngine } from '../src/shared/pricing-engine'
import pricingJson from '../src/shared/pricing.json'
import type { BedrockInvocationLog } from '../src/shared/types'

// Helper to parse arguments
function getArg(name: string): string | undefined {
  const prefix = `--${name}=`
  const arg = process.argv.find((a) => a.startsWith(prefix))
  if (arg) {
    return arg.substring(prefix.length)
  }
  const index = process.argv.indexOf(`--${name}`)
  if (index !== -1 && index + 1 < process.argv.length) {
    return process.argv[index + 1]
  }
  return undefined
}

async function main() {
  try {
    // 1. Load config from arguments or env vars
    const compareDaysRaw = getArg('compare-days') || process.env.COMPARE_DAYS || '7'
    const compareDays = parseInt(compareDaysRaw, 10)
    if (isNaN(compareDays) || compareDays <= 0) {
      console.error(`Invalid compare-days value: ${compareDaysRaw}`)
      process.exit(2)
    }

    const offsetDaysRaw = getArg('offset-days') || process.env.OFFSET_DAYS || '1'
    const offsetDays = parseInt(offsetDaysRaw, 10)
    if (isNaN(offsetDays) || offsetDays < 0) {
      console.error(`Invalid offset-days value: ${offsetDaysRaw}`)
      process.exit(2)
    }

    const thresholdRaw = getArg('variance-threshold') || process.env.VARIANCE_THRESHOLD_PERCENT || '1'
    const varianceThresholdPercent = parseFloat(thresholdRaw)
    if (isNaN(varianceThresholdPercent) || varianceThresholdPercent < 0) {
      console.error(`Invalid variance-threshold value: ${thresholdRaw}`)
      process.exit(2)
    }

    const logGroupName = getArg('log-group-name') || process.env.BEDROCK_LOG_GROUP_NAME || '/aws/bedrock/modelinvocations'

    const mockMode = process.argv.includes('--mock') || process.env.MOCK_AWS === 'true'
    const mockFailMode = process.argv.includes('--mock-fail')

    console.log('=== AWS Bedrock Cost Verification ===')
    console.log(`Compare Days:      ${compareDays}`)
    console.log(`Offset Days:       ${offsetDays}`)
    console.log(`Variance Thresh %: ${varianceThresholdPercent}%`)
    console.log(`Log Group Name:    ${logGroupName}`)
    console.log(`Mock Mode:         ${mockMode || mockFailMode ? 'ENABLED' : 'DISABLED'}`)
    console.log('======================================\n')

    // 2. Dates setup
    const today = new Date()
    // Exclusive End-Date handling:
    // If offsetDays is 1, the period we check ends yesterday (D-1 inclusive).
    // So the exclusive end date in Cost Explorer is subDays(today, 0) = today (which means < today, i.e., up to yesterday inclusive).
    const endDate = subDays(today, offsetDays - 1)
    const startDate = subDays(endDate, compareDays)

    const startDateStr = format(startDate, 'yyyy-MM-dd')
    const endDateStr = format(endDate, 'yyyy-MM-dd')
    console.log(`Querying period: ${startDateStr} to ${endDateStr} (UTC days)`)

    // Generate list of UTC dates to compare
    const datesList: string[] = []
    for (let i = 0; i < compareDays; i++) {
      const day = subDays(endDate, compareDays - i)
      datesList.push(format(day, 'yyyy-MM-dd'))
    }

    let rawLogs: BedrockInvocationLog[] = []
    let actualCosts: Array<{ date: string; bedrockCost: number }> = []

    if (mockMode || mockFailMode) {
      // MOCK DATA GENERATION
      console.log('Generating mock data...')
      
      // We will mock logs count and token usage for each day
      for (const date of datesList) {
        // Log 1: Claude Sonnet 5 call
        rawLogs.push({
          timestamp: `${date}T10:00:00.000Z`,
          requestId: `req-${date}-1`,
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 5000,
          outputTokens: 2000,
          cacheReadTokens: 1000,
          cacheWriteTokens: 2000,
          latencyMs: 1500,
          statusCode: 200
        })

        // Log 2: Claude Sonnet 5 call
        rawLogs.push({
          timestamp: `${date}T15:30:00.000Z`,
          requestId: `req-${date}-2`,
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 10000,
          outputTokens: 4000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 3000,
          statusCode: 200
        })

        // Log 3: Claude Sonnet 5 failed call (should be filtered out)
        rawLogs.push({
          timestamp: `${date}T18:00:00.000Z`,
          requestId: `req-${date}-3`,
          modelId: 'anthropic.claude-sonnet-5',
          inputTokens: 10000,
          outputTokens: 4000,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          latencyMs: 200,
          statusCode: 400,
          errorCode: 'ValidationException'
        })
      }

      // pricing engine helper to calculate expected mock estimated cost
      const pricingEngine = new PricingEngine(pricingJson as any)
      const mockEstimatedCostPerDay = pricingEngine.calculateCost(
        { inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 1000, cacheWriteTokens: 2000, thinkingTokens: 0 },
        'anthropic.claude-sonnet-5'
      ) + pricingEngine.calculateCost(
        { inputTokens: 10000, outputTokens: 4000, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: 0 },
        'anthropic.claude-sonnet-5'
      )

      // Set actual costs
      for (let i = 0; i < datesList.length; i++) {
        const date = datesList[i]
        let bedrockCost = mockEstimatedCostPerDay

        if (mockFailMode && i === Math.floor(datesList.length / 2)) {
          // Force a threshold violation by making actual cost much higher
          bedrockCost = mockEstimatedCostPerDay + 5.00
        } else {
          // Introduce small controllable acceptable variances
          if (i === 1) {
            // Under absolute tolerance (+$0.005)
            bedrockCost = mockEstimatedCostPerDay + 0.005
          } else if (i === 2) {
            // Under percentage tolerance (+0.5%)
            bedrockCost = mockEstimatedCostPerDay * 1.005
          }
        }

        actualCosts.push({ date, bedrockCost })
      }
    } else {
      // REAL AWS CALLS
      const credential = await detectCredentials()
      if (!credential) {
        console.error('Error: AWS credentials could not be detected.')
        process.exit(2)
      }

      console.log(`AWS Credentials detected (type: ${credential.type}, region: ${credential.region})`)
      console.log('Initializing AWS services...')

      const ceService = new CostExplorerService()
      await ceService.initialize(credential)

      const cwService = new CloudWatchService(logGroupName)
      await cwService.initialize(credential)

      console.log('Querying Cost Explorer for daily Bedrock costs...')
      actualCosts = await ceService.getDailyCosts(compareDays, endDate)

      console.log('Querying CloudWatch model invocation logs...')
      const startCwDate = new Date(`${startDateStr}T00:00:00.000Z`)
      const endCwDate = new Date(`${endDateStr}T00:00:00.000Z`)
      rawLogs = await cwService.queryInvocations(startCwDate, endCwDate)
    }

    // 3. Filter successful invocations & deduplicate
    const successfulLogs = rawLogs.filter((log) => log.statusCode === 200 && !log.errorCode)
    const dedupedLogs = deduplicateLogs(successfulLogs)

    // 4. Calculate estimated costs and group by UTC day
    const pricingEngine = new PricingEngine(pricingJson as any)
    const getUtcDate = (timestampStr: string): string => {
      const d = new Date(timestampStr)
      if (isNaN(d.getTime())) {
        return timestampStr.substring(0, 10)
      }
      return d.toISOString().substring(0, 10)
    }

    // Initialize mapping of Date -> data
    const dailyReport: Record<
      string,
      { logsCount: number; cwEstCost: number; ceActCost: number }
    > = {}

    for (const date of datesList) {
      dailyReport[date] = {
        logsCount: 0,
        cwEstCost: 0,
        ceActCost: 0
      }
    }

    // Populate CE actual costs
    for (const item of actualCosts) {
      if (dailyReport[item.date]) {
        dailyReport[item.date].ceActCost = item.bedrockCost
      }
    }

    // Populate CW estimated costs
    for (const log of dedupedLogs) {
      const date = getUtcDate(log.timestamp)
      if (dailyReport[date]) {
        const estCost = pricingEngine.calculateCost(
          {
            inputTokens: log.inputTokens,
            outputTokens: log.outputTokens,
            cacheReadTokens: log.cacheReadTokens,
            cacheWriteTokens: log.cacheWriteTokens,
            thinkingTokens: 0
          },
          log.modelId
        )
        dailyReport[date].logsCount += 1
        dailyReport[date].cwEstCost += estCost
      }
    }

    // 5. Compare daily costs & Print Verification Table
    const tableHeader = '| Date       | Logs | CW Est. Cost | CE Act. Cost | Difference | Var %  | Status |'
    const tableDivider = '|------------|------|--------------|--------------|------------|--------|--------|'
    console.log('\nVerification Results Table:')
    console.log(tableHeader)
    console.log(tableDivider)

    let allOk = true
    const thresholdPct = varianceThresholdPercent / 100

    for (const date of datesList) {
      const report = dailyReport[date]
      const diff = report.cwEstCost - report.ceActCost
      const absDiff = Math.abs(diff)

      let variancePct = 0
      if (report.ceActCost > 0) {
        variancePct = absDiff / report.ceActCost
      } else if (report.cwEstCost > 0) {
        variancePct = absDiff / report.cwEstCost
      }

      // Double tolerance model:
      // Status OK if absolute difference is <= 0.01 USD OR percentage difference is <= threshold
      const isOk = absDiff <= 0.01 || variancePct <= thresholdPct
      if (!isOk) {
        allOk = false
      }

      const logsStr = String(report.logsCount).padStart(4)
      const estStr = `$${report.cwEstCost.toFixed(4)}`.padStart(12)
      const actStr = `$${report.ceActCost.toFixed(4)}`.padStart(12)
      const diffSign = diff >= 0 ? '+' : '-'
      const diffStr = `${diffSign}$${absDiff.toFixed(4)}`.padStart(10)
      const varStr = `${(variancePct * 100).toFixed(2)}%`.padStart(6)
      const statusStr = isOk ? 'OK' : 'FAIL'

      console.log(`| ${date} | ${logsStr} | ${estStr} | ${actStr} | ${diffStr} | ${varStr} | ${statusStr.padEnd(6)} |`)
    }

    console.log(tableDivider)

    if (allOk) {
      console.log('\n[SUCCESS] All daily variances are within the double tolerance threshold.')
      process.exit(0)
    } else {
      console.error('\n[FAIL] Verification failed: Daily variance exceeds threshold for one or more days.')
      process.exit(1)
    }
  } catch (error: any) {
    console.error('\n[ERROR] System or connection error during verification:', error.message || error)
    process.exit(2)
  }
}

export { main }

// Only auto-run when executed directly (not imported by tests)
if (process.env.VITEST !== 'true') {
  main()
}
