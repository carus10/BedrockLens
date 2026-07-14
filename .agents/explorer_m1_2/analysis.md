# Milestone 1: Log Parsing & Calculator Tests Analysis

## 1. Overview
This report contains a comprehensive analysis of the BedrockLens pricing engine (`src/shared/pricing-engine.ts`), pricing configuration (`src/shared/pricing.json`), log parsing services (`src/main/services/cloudwatch-service.ts`), and existing tests (`src/shared/pricing-engine.test.ts`). We identify gaps in model coverage, cache read/write, thinking tokens, burn rate/depletion logic, log parsing/deduplication, and outline mock data requirements along with a comprehensive testing strategy.

---

## 2. Detailed Findings & Codebase Analysis

### A. Pricing Configuration (`pricing.json`) vs. Pricing Engine (`pricing-engine.ts`)
1. **Introductory Pricing Gap**: 
   - `claude-sonnet-5` in `pricing.json` defines an `introductoryPricing` tier:
     ```json
     "introductoryPricing": {
       "note": "Introductory pricing until 2026-08-31",
       "inputPer1k": 0.002,
       "outputPer1k": 0.010,
       "cacheWritePer1k": 0.00250,
       "cacheReadPer1k": 0.00020
     }
     ```
   - However, `PricingEngine.calculateCost` only checks for `provisionedThroughput` or `onDemand`. It has no knowledge of `introductoryPricing` or the current date.
   - Given the current date (July 2026) is prior to `2026-08-31`, this causes the system to overcharge users by calculating with standard `onDemand` rates ($0.003/$0.015 instead of $0.002/$0.010).
   - In addition, `ModelPricing` interface in `src/shared/types.ts` is missing `introductoryPricing` in its type declaration.
2. **Fuzzy Matching logic and Key Collision**:
   - The secondary loop in `resolveModelKey` performs fuzzy matching:
     ```typescript
     for (const [key] of Object.entries(this.config.models)) {
       const parts = key.split('-')
       const major = parts[1] // model family, e.g., 'opus' or 'sonnet'
       const minor = parts[2] // version major, e.g., '4'
       if (major && minor && normalizedId.includes(`${major}-${minor}`)) {
         return key
       }
     }
     ```
   - This logic is problematic because it splits the key and looks only at the model family (stored in `major`) and version major (stored in `minor`). It ignores the version minor (e.g., `8`, `7`, `6`, `5`).
   - If a model ID like `anthropic.opus-4-5` is provided and fails the exact/alias loops, it checks the fuzzy match. Since the first key in the configuration that splits to `opus-4` is `claude-opus-4-8`, it will incorrectly resolve `anthropic.opus-4-5` to `claude-opus-4-8`.
3. **Provisioned Throughput**:
   - The engine supports a `provisionedThroughput` pricing type in `calculateCost` and `calculateBatchCost`, but no model in `pricing.json` currently contains this tier. The testing strategy should include mock data containing `provisionedThroughput` to verify this path works properly.

### B. Caching (Read/Write Tokens)
- `PricingEngine` correctly checks if `cacheWritePer1k` or `cacheReadPer1k` are present and defaults to `0` if they are not.
- Gaps: The existing test suite contains no tests for when these fields are missing/undefined in the model pricing config, nor does it verify that these rates are correctly applied for all the models in `pricing.json`.

### C. Thinking Tokens
- `TokenUsage` in `types.ts` includes `thinkingTokens: number`, but `PricingEngine` completely ignores this field during cost calculation.
- AWS Bedrock/Anthropic Claude 3.7 billing bills thinking tokens at the standard output token rate.
- Gaps: 
  - If `thinkingTokens` is passed separately and is *not* already included in `outputTokens`, the cost will be under-calculated unless `thinkingTokens` is explicitly added to `outputTokens` or calculated at the output rate.
  - If `thinkingTokens` *is* already included in `outputTokens`, we must verify that we do not double-charge.
  - `BedrockInvocationLog` is missing the `thinkingTokens` property. Consequently, `cloudwatch-service.ts` does not parse it from logs.

### D. Burn Rate & Depletion Dates
- **Time Sensitivity**: `estimateDepletionDate` creates a mutable `new Date()` which makes assertions in tests dependent on execution time. Unit tests must use Vitest's fake timer utilities (`vi.useFakeTimers`, `vi.setSystemTime`) to lock down the current date.
- **Negative Credits**: If `remainingCredits` is zero or negative, `estimateDepletionDate` will compute a date today or in the past. The engine should ideally return today's date or handle negative credits by capping the result.
- **Negative Burn Rate**: Covered by `dailyBurnRate <= 0` returning `null`, which is correct.

### E. CloudWatch Log Parsing & Deduplication (`cloudwatch-service.ts`)
- **No Tests**: There are zero existing tests for `CloudWatchService` log parsing.
- **Log Parsing Gaps**:
  - `@message` JSON format could be malformed; the regex parser must handle these fallbacks safely without throwing unhandled exceptions.
  - Input/Output/CacheRead/CacheWrite tokens fallbacks via regex need testing with edge cases (e.g. token counts with spaces, non-numeric values, or values that are missing).
  - Status codes and error codes mapping (e.g. 400 with ThrottlingException) must be parsed.
  - Deduplication: `deduplicateLogs` merges records by matching `requestId` or falling back to `timestamp`. It takes `Math.max` for token counts and latency. Gaps include testing behavior when both `requestId` and `timestamp` are missing or empty.

---

## 3. Comparison & Test Coverage Gap Analysis

| Feature | Current Test Coverage | Required Coverage / Gaps |
|---|---|---|
| **Model Types** | Only `claude-sonnet-4-6` and `claude-opus-4-8` are tested in a mock config. | All 9 model families/keys in the actual `pricing.json` must be loaded and verified. |
| **Fuzzy Matching** | 1 test for alias, 1 test for exact match. | Edge cases: partial matching collisions (e.g., resolving `opus-4-5` vs `opus-4-8`), handling keys with fewer/more dash components. |
| **Cache Tokens** | Checked for Sonnet 4.6. | Edge cases: models missing cache read/write configuration (safety check), verification that different rates are correctly applied. |
| **Thinking Tokens** | None. Passing `thinkingTokens: 0` in all tests. | Define billing logic: verify that thinking tokens are billed at the output token rate if separate, or verify how they map. Update types and parser to support them. |
| **Burn Rate & Depletion** | Simple math verification with dynamic system date. | Mock current system date using fake timers. Verify behavior with negative remaining credits, zero remaining credits, and large burn rates. |
| **Batch Cost** | None. | Verification of `calculateBatchCost` with multiple models, pricing types, and model-specific overrides. |
| **Log Parsing** | None. | Parse standard query results, regex fallbacks from raw `@message` block, `_rid` requestId fallback, errorCode parsing, default status codes. |
| **Log Deduplication** | None. | Merge records by `requestId` (taking maximum values), merge records by `timestamp` if `requestId` is empty, handle empty array, verify order preservation. |

---

## 4. Required Mock Data

### A. Mock Pricing Configuration
```typescript
const mockPricingConfig: PricingConfig = {
  version: 'test-2026',
  currency: 'USD',
  models: {
    'claude-sonnet-5': {
      displayName: 'Claude Sonnet 5',
      modelId: 'anthropic.claude-sonnet-5',
      aliases: ['claude-sonnet-5', 'us.anthropic.claude-sonnet-5'],
      onDemand: {
        inputPer1k: 0.003,
        outputPer1k: 0.015,
        cacheWritePer1k: 0.00375,
        cacheReadPer1k: 0.00030
      },
      // Propose adding this to type definitions
      introductoryPricing: {
        inputPer1k: 0.002,
        outputPer1k: 0.010,
        cacheWritePer1k: 0.00250,
        cacheReadPer1k: 0.00020
      }
    },
    'legacy-model': {
      displayName: 'Legacy Model',
      modelId: 'anthropic.legacy-model-v1',
      aliases: [],
      onDemand: {
        inputPer1k: 0.01,
        outputPer1k: 0.05
        // Missing cacheReadPer1k and cacheWritePer1k to test safety fallbacks
      }
    },
    'throughput-model': {
      displayName: 'Throughput Model',
      modelId: 'anthropic.throughput-model-v1',
      aliases: [],
      onDemand: {
        inputPer1k: 0.01,
        outputPer1k: 0.05
      },
      provisionedThroughput: {
        inputPer1k: 0.008,
        outputPer1k: 0.04
      }
    }
  }
}
```

### B. Mock CloudWatch Log Data
1. **Standard Log Result (fully parsed)**:
   ```json
   [
     { "field": "@timestamp", "value": "2026-07-14T08:00:00.000Z" },
     { "field": "requestId", "value": "req-1" },
     { "field": "modelId", "value": "anthropic.claude-sonnet-5" },
     { "field": "inputTokens", "value": "1000" },
     { "field": "outputTokens", "value": "500" },
     { "field": "cacheReadTokens", "value": "200" },
     { "field": "cacheWriteTokens", "value": "100" },
     { "field": "latencyMs", "value": "1500" },
     { "field": "statusCode", "value": "200" }
   ]
   ```
2. **Fallback Log Result (zero tokens in fields, parsed from `@message`)**:
   ```json
   [
     { "field": "@timestamp", "value": "2026-07-14T08:00:05.000Z" },
     { "field": "requestId", "value": "req-2" },
     { "field": "modelId", "value": "anthropic.claude-sonnet-5" },
     { "field": "inputTokens", "value": "0" },
     { "field": "outputTokens", "value": "0" },
     { "field": "cacheReadTokens", "value": "0" },
     { "field": "cacheWriteTokens", "value": "0" },
     { "field": "@message", "value": "{\"inputTokenCount\":1200,\"outputTokenCount\":600,\"cacheReadInputTokenCount\":300,\"cacheWriteInputTokenCount\":150,\"thinkingTokenCount\":100}" }
   ]
   ```
3. **Duplicate Log Records (for deduplication)**:
   - Record A (Request phase: contains input and cache write tokens, latency = 50ms):
     ```json
     {
       "timestamp": "2026-07-14T08:00:00.000Z",
       "requestId": "dup-req-1",
       "modelId": "anthropic.claude-sonnet-5",
       "inputTokens": 1000,
       "outputTokens": 0,
       "cacheReadTokens": 0,
       "cacheWriteTokens": 100,
       "latencyMs": 50,
       "statusCode": 200
     }
     ```
   - Record B (Response phase: contains output and cache read tokens, latency = 1200ms):
     ```json
     {
       "timestamp": "2026-07-14T08:00:00.000Z",
       "requestId": "dup-req-1",
       "modelId": "anthropic.claude-sonnet-5",
       "inputTokens": 0,
       "outputTokens": 500,
       "cacheReadTokens": 200,
       "cacheWriteTokens": 0,
       "latencyMs": 1200,
       "statusCode": 200
     }
     ```

---

## 5. Recommended Testing Strategy & Test Case Design

We recommend separating the tests into two distinct suites under `src/shared/` and `src/main/services/`:
1. `src/shared/pricing-engine.test.ts`: Expand existing file to cover all calculator logic, including real config integration, batch cost, and overrides.
2. `src/main/services/cloudwatch-service.test.ts`: Create a new test suite specifically testing `parseQueryResults` and `deduplicateLogs`.

### A. Calculator Test Cases (`pricing-engine.test.ts`)
- **TC-1: Load Real Configuration**: Validate that `PricingEngine` works with the actual `pricing.json` file. Iterate through all supported models and verify that they resolve to their correct keys.
- **TC-2: Cache Tokens Safety Fallback**: Verify that if a model (like `legacy-model`) does not specify cache rates, they are treated as $0.00.
- **TC-3: Provisioned Throughput cost**: Verify cost calculations when `pricingType` is `'provisionedThroughput'`.
- **TC-4: Batch Cost Calculations**:
  - Calculate combined cost for multiple models.
  - Calculate combined cost with model-specific overrides.
- **TC-5: Model Key Matching Collisions**: Verify that `resolveModelKey` returns the correct model and doesn't collide versions incorrectly (e.g. matching `opus-4-5` to `opus-4-8` fuzzy matcher).
- **TC-6: Introductory Pricing (Proposed)**: Verify that when introductory pricing is active (based on current date), the discount rate is applied.
- **TC-7: Depletion Date with Fake Timers**: Use `vi.useFakeTimers` to lock the current date to `2026-07-14`.
  - Verify that 100 credits remaining with a burn rate of 10/day returns `2026-07-24`.
  - Verify zero remaining credits returns `2026-07-14`.
  - Verify negative remaining credits Cap logic.

### B. Log Parsing Test Cases (`cloudwatch-service.test.ts`)
- **TC-8: Standard Parse**: Parse fully populated CloudWatch log fields.
- **TC-9: Fallback Regex Parse**: Parse fields when input/output/cache values are `0` by extracting them from the `@message` JSON block using regex.
- **TC-10: Request ID Fallbacks**: Parse using `_rid` when `requestId` is empty.
- **TC-11: Status Code and Error Codes**: Verify that error codes are mapped correctly and status code defaults to 200.
- **TC-12: Log Deduplication (Same Request ID)**: Deduplicate two log chunks with the same `requestId`. Verify that the output keeps the max token values and latency.
- **TC-13: Log Deduplication (No Request ID)**: Deduplicate logs using `timestamp` when `requestId` is missing or empty.
