import {
  CostExplorerClient,
  GetCostAndUsageCommand,
  Granularity,
  GroupDefinitionType
} from '@aws-sdk/client-cost-explorer'
import { format, subDays } from 'date-fns'
import type { CredentialConfig } from '../../shared/types'
import { buildCredentialProvider } from './aws-credentials'

export interface CostExplorerDay {
  date: string
  totalCost: number
  bedrockCost: number
}

export class CostExplorerService {
  private client: CostExplorerClient | null = null

  async initialize(credential: CredentialConfig): Promise<void> {
    const credProvider = await buildCredentialProvider(credential)
    // Cost Explorer is always us-east-1
    this.client = new CostExplorerClient({
      region: 'us-east-1',
      credentials: credProvider
    })
  }

  async getDailyCosts(days: number): Promise<CostExplorerDay[]> {
    if (!this.client) throw new Error('CostExplorer client not initialized')

    const endDate = new Date()
    const startDate = subDays(endDate, days)

    const resp = await this.client.send(
      new GetCostAndUsageCommand({
        TimePeriod: {
          Start: format(startDate, 'yyyy-MM-dd'),
          End: format(endDate, 'yyyy-MM-dd')
        },
        Granularity: Granularity.DAILY,
        Filter: {
          Dimensions: {
            Key: 'SERVICE',
            Values: ['Amazon Bedrock', 'AWS Bedrock']
          }
        },
        Metrics: ['UnblendedCost'],
        GroupBy: [
          {
            Type: GroupDefinitionType.DIMENSION,
            Key: 'SERVICE'
          }
        ]
      })
    )

    const results: CostExplorerDay[] = []

    for (const result of resp.ResultsByTime ?? []) {
      const date = result.TimePeriod?.Start ?? ''
      let bedrockCost = 0

      for (const group of result.Groups ?? []) {
        const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount ?? '0')
        bedrockCost += cost
      }

      // Fallback: total if no groups
      if (bedrockCost === 0) {
        bedrockCost = parseFloat(
          result.Total?.['UnblendedCost']?.Amount ?? '0'
        )
      }

      results.push({ date, totalCost: bedrockCost, bedrockCost })
    }

    return results
  }

  async getMonthToDateCost(): Promise<number> {
    const daily = await this.getDailyCosts(31)
    const now = new Date()
    const thisMonth = format(now, 'yyyy-MM')
    return daily
      .filter((d) => d.date.startsWith(thisMonth))
      .reduce((sum, d) => sum + d.bedrockCost, 0)
  }
}
