# Codebase Analysis: AWS Cost Explorer Comparison Script (Milestone 2)

This report details the architectural and layout recommendations for implementing the AWS Cost Explorer Comparison Script (Milestone 2).

---

## 1. Standalone Script vs. Integration Test Comparison

We evaluated two distinct approaches for running the billing comparison:

| Attribute | Standalone Script (`scripts/verify-billing.ts`) | Integration Test (`src/**/*.integration.test.ts`) |
|---|---|---|
| **Primary Purpose** | Operational verification, continuous monitoring, and alerting. | Verify code implementation correctness and contract integrity. |
| **CLI Inputs** | **Highly Flexible:** Can easily accept parameters like `--days`, `--variance-threshold`, `--profile`, `--region`, `--log-group` via `process.argv`. | **Restricted:** Parameterization in Vitest relies on environment variables, making CLI usage cumbersome. |
| **AWS Credentials Dependency** | Handled gracefully. If credentials are missing, it outputs an error message and exits with a specific code (e.g., status 1). | Can cause test suite failures in local environments where developers are offline or don't have active AWS sessions (SSO). |
| **Execution Context** | Runs in a standard Node.js process using a TS loader. Free of Electron dependency concerns. | Runs inside the test runner (`vitest`), which is fine, but adds execution overhead for simple checks. |
| **CI/CD Integration** | **Simple:** Easily integrated as a standalone pipeline step or scheduled cron job (e.g., `npm run verify:billing`). | Requires separate configuration (e.g., a dedicated integration config) to avoid running during fast unit test suites. |

### Recommendation
We recommend a **Standalone TypeScript Script** located at `scripts/verify-billing.ts`. 
Operational cost audits and comparison checks are post-deployment/monitoring concerns rather than unit/integration verification of local source code. Decoupling this from the main test suite ensures local developers can run unit tests offline without credential errors, and CI/CD environments can run the billing audit as a dedicated step with customizable thresholds.

---

## 2. TypeScript Loading Mechanism

Since the script needs to run directly from the command line, we analyzed the loader options:

1. **`vite-node`** (Recommended)
   - **How it works:** Executes TS files using Vite's transform pipeline.
   - **Why it fits:** It is already installed transitively in the project via `vitest` (verified in `package-lock.json`). It respects standard compiler configurations and resolves relative/alias paths naturally.
   - **Usage:** `npx vite-node scripts/verify-billing.ts`
   
2. **`tsx`** (Alternative / Modern Standard)
   - **How it works:** A wrapper around esbuild, optimized for running Node.js scripts in TS.
   - **Why it fits:** Extremely fast and handles modern ESM/CommonJS modules correctly.
   - **Usage:** Add `"tsx"` to `devDependencies` and run `npx tsx scripts/verify-billing.ts`.
   
3. **`ts-node`** (Not Recommended)
   - **Why not:** Requires additional configuration, is slower than `tsx`/`vite-node`, and frequently runs into ESM compatibility issues in modern Vite-based projects.

### Recommendation
Use **`vite-node`** as the default runner. It requires zero configuration, zero new packages (already in `node_modules` via `vitest`), and automatically works out of the box with the project's existing build environment.

---

## 3. Package.json Dependencies & Scripts

### Dependencies to Leverage
The script can import and reuse the following self-contained modules from `src/` (which have no Electron runtime dependencies):
- `CloudWatchService` (`src/main/services/cloudwatch-service.ts`) - to query logs and parse them into daily records.
- `CostExplorerService` (`src/main/services/cost-explorer-service.ts`) - to fetch actual Bedrock costs.
- `PricingEngine` (`src/shared/pricing-engine.ts`) - to compute costs from logs.
- `detectCredentials` / `buildCredentialProvider` (`src/main/services/aws-credentials.ts`) - to fetch credentials.
- `pricing.json` (`src/shared/pricing.json`) - to initialize the pricing config.

### Scripts to Add
We should add the following script under `scripts` in `package.json`:
```json
"verify:billing": "vite-node scripts/verify-billing.ts"
```

To run with parameters (e.g. customized variance threshold or day range):
```bash
npm run verify:billing -- --days 7 --variance 0.05
```

---

## 4. Automation Strategy (No Human Intervention)

To automate the script in CI/CD without human intervention:

1. **AWS Credential Retrieval:**
   - In CI (e.g., GitHub Actions), use OIDC authentication (`aws-actions/configure-aws-credentials`) to obtain temporary credentials, or supply them through secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).
   - The script uses the existing `detectCredentials()` helper to resolve these credentials automatically.

2. **Pipeline Execution:**
   - Add a step in the CI/CD pipeline after deployments or as a daily cron job (GitHub Actions schedule):
     ```yaml
     - name: Run AWS Billing Variance Check
       run: npm run verify:billing -- --days 1 --variance 0.02
       env:
         AWS_REGION: us-east-1
         AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
         AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
     ```

3. **Alerting on Failure:**
   - If the variance between calculated cost (from CloudWatch logs) and actual cost (from Cost Explorer) exceeds the allowed threshold (e.g., 2%), the script logs the daily details and exits with `process.exit(1)`.
   - This failure stops the CI pipeline and triggers built-in notifications (e.g., email alerts, Slack webhooks).

---

## 5. Design Sketch: `scripts/verify-billing.ts`

Here is how the script's entry point and core logic should be structured:

```typescript
import { CloudWatchService } from '../src/main/services/cloudwatch-service'
import { CostExplorerService } from '../src/main/services/cost-explorer-service'
import { PricingEngine } from '../src/shared/pricing-engine'
import { detectCredentials } from '../src/main/services/aws-credentials'
import pricingConfig from '../src/shared/pricing.json'
import { subDays, startOfDay, endOfDay } from 'date-fns'

// Parse CLI Arguments
const args = process.argv.slice(2)
const getArg = (name: string, fallback: string): string => {
  const idx = args.indexOf(name)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const days = parseInt(getArg('--days', '7'), 10)
const threshold = parseFloat(getArg('--variance', '0.02')) // 2% default
const logGroupName = getArg('--log-group', '/aws/bedrock/modelinvocations')

async function main() {
  console.log(`[Billing Verifier] Starting verification for the past ${days} days...`)
  console.log(`[Billing Verifier] Allowed variance threshold: ${(threshold * 100).toFixed(1)}%`)
  console.log(`[Billing Verifier] Log Group: ${logGroupName}`)

  // 1. Resolve Credentials
  const credentials = await detectCredentials()
  if (!credentials) {
    console.error('[Error] AWS credentials could not be detected.')
    process.exit(1)
  }
  console.log(`[Billing Verifier] Using AWS credentials: Type: ${credentials.type}, Region: ${credentials.region}`)

  // 2. Initialize Services
  const cloudWatch = new CloudWatchService(logGroupName)
  await cloudWatch.initialize(credentials)

  const costExplorer = new CostExplorerService()
  await costExplorer.initialize(credentials)

  const pricingEngine = new PricingEngine(pricingConfig as any)

  // 3. Fetch Cost Explorer Data (Actual Costs)
  // costExplorer.getDailyCosts retrieves daily costs ending today
  const actualDailyCosts = await costExplorer.getDailyCosts(days)
  const actualCostsMap = new Map<string, number>()
  for (const day of actualDailyCosts) {
    actualCostsMap.set(day.date, day.bedrockCost)
  }

  // 4. Query CloudWatch Logs and Compute Costs
  let hasFailure = false
  const resultsTable: any[] = []

  for (let i = days; i >= 1; i--) {
    const targetDate = subDays(new Date(), i)
    const dateStr = targetDate.toISOString().slice(0, 10) // yyyy-MM-dd
    const startTime = startOfDay(targetDate)
    const endTime = endOfDay(targetDate)

    const actualCost = actualCostsMap.get(dateStr) ?? 0

    // Fetch logs for this specific day
    let invocations = []
    try {
      invocations = await cloudWatch.queryInvocations(startTime, endTime)
    } catch (err: any) {
      console.error(`[Error] Failed to query CloudWatch logs for ${dateStr}:`, err.message)
      hasFailure = true
      continue
    }

    // Compute cost using PricingEngine
    const computedCost = invocations.reduce((sum, inv) => {
      const usage = {
        inputTokens: inv.inputTokens,
        outputTokens: inv.outputTokens,
        cacheReadTokens: inv.cacheReadTokens,
        cacheWriteTokens: inv.cacheWriteTokens,
        thinkingTokens: 0
      }
      return sum + pricingEngine.calculateCost(usage, inv.modelId)
    }, 0)

    // Calculate Variance
    const absoluteDiff = Math.abs(computedCost - actualCost)
    let variancePercent = 0
    if (actualCost > 0) {
      variancePercent = absoluteDiff / actualCost
    } else if (computedCost > 0) {
      variancePercent = 1 // 100% variance if actual is 0 but computed is > 0
    }

    const isExceeded = variancePercent > threshold
    if (isExceeded) {
      hasFailure = true
    }

    resultsTable.push({
      Date: dateStr,
      'Logs Query Count': invocations.length,
      'Computed Cost ($)': computedCost.toFixed(6),
      'Actual Cost ($)': actualCost.toFixed(6),
      'Diff ($)': (computedCost - actualCost).toFixed(6),
      'Variance (%)': `${(variancePercent * 100).toFixed(2)}%`,
      Status: isExceeded ? '❌ FAILED' : '✅ PASSED'
    })
  }

  // 5. Output Results
  console.table(resultsTable)

  if (hasFailure) {
    console.error('[Billing Verifier] Verification failed: Cost discrepancies exceed the allowed threshold.')
    process.exit(1)
  }

  console.log('[Billing Verifier] Verification passed successfully!')
  process.exit(0)
}

main().catch((err) => {
  console.error('[Billing Verifier] Fatal execution error:', err)
  process.exit(1)
})
```
