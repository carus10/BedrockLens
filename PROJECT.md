# Project: AWS Bedrock Cost Calculator Verification

## Architecture
- `src/shared/pricing-engine.ts`: Core pricing engine class mapping model IDs to token prices and calculating costs.
- `src/shared/pricing.json`: Pricing definitions for models.
- `src/main/services/cloudwatch-service.ts`: Querying Bedrock invocation logs via CloudWatch Logs Insights.
- `src/main/services/cost-explorer-service.ts`: Querying actual Bedrock billing data via AWS Cost Explorer API.
- `src/main/services/aws-credentials.ts`: AWS STS validation and credential retrieval.

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Log Parsing & Calculator Tests | Add unit tests for log parsing (parsing logic, regex fallbacks, deduplication) and calculations (PricingEngine) | none | DONE |
| 2 | M2: AWS Cost Explorer Comparison Script | Create verification script comparing computed billing vs Cost Explorer billing with a variance check | M1 | DONE |
| 3 | M3: Automation & E2E Validation | Integrate verification scripts to npm test flow and perform final audit | M2 | PLANNED |

## Interface Contracts
### `PricingEngine` ↔ `CloudWatchService`
- PricingEngine takes `TokenUsage` interface to calculate costs.
- CloudWatchService parses results into `BedrockInvocationLog[]`, which has token details.
### `CostExplorerService` ↔ `verify-billing`
- CostExplorerService returns `CostExplorerDay[]` with daily totals for Bedrock costs.

## Code Layout
- `src/shared/pricing-engine.test.ts`: Existing test for pricing engine calculations.
- `src/shared/pricing-engine.ts`: PricingEngine class.
- `src/main/services/cloudwatch-service.ts`: Log parsing logic.
- `src/main/services/cost-explorer-service.ts`: Cost Explorer API.
