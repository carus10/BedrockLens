# Handoff Report — Pricing Engine

## 1. Observation

- **Pricing Engine Codebase (`src/shared/pricing-engine.ts`)**:
  - In `resolveModelKey` (lines 21-22):
    ```typescript
    normalizedId.includes(key) ||
    key.includes(normalizedId.replace(/[^a-z0-9-]/g, '-'))
    ```
    If `modelId` contains only special characters (like `.` or `/`), `normalizedId.replace(/[^a-z0-9-]/g, '-')` becomes `"-"`.
  - In `calculateCost` (lines 47-73), the method resolves `modelPricing` and extracts rates strictly from the `onDemand` or `provisionedThroughput` properties:
    ```typescript
    const tier: PricingTier = {
      ...(pricingType === 'provisionedThroughput' && modelPricing.provisionedThroughput
        ? modelPricing.provisionedThroughput
        : modelPricing.onDemand),
      ...overrides
    }
    ```
  - In `estimateDepletionDate` (lines 110-116):
    ```typescript
    estimateDepletionDate(remainingCredits: number, dailyBurnRate: number): Date | null {
      if (dailyBurnRate <= 0) return null
      const daysRemaining = remainingCredits / dailyBurnRate
      const depletion = new Date()
      depletion.setDate(depletion.getDate() + Math.floor(daysRemaining))
      return depletion
    }
    ```
    When `remainingCredits` is negative, `daysRemaining` is negative, which updates the date to a past value.

- **Pricing configuration (`src/shared/pricing.json`)**:
  - Contains `introductoryPricing` property for `claude-sonnet-5` (lines 49-55):
    ```json
    "introductoryPricing": {
      "note": "Introductory pricing until 2026-08-31",
      "inputPer1k": 0.002,
      "outputPer1k": 0.010,
      "cacheWritePer1k": 0.00250,
      "cacheReadPer1k": 0.00020
    }
    ```

- **Test Execution**:
  - Command: `npm test -- --run`
  - Output:
    ```
    ✓ src/shared/pricing-engine.test.ts (27 tests) 21ms
    ❯ src/main/services/cloudwatch-service.test.ts (20 tests | 2 failed) 14ms
      ❯ ... should fall victim to prompt injection ...
      ❯ ... should ignore negative signs ...
    ```

## 2. Logic Chain

1. In `resolveModelKey`, the substring matching condition `key.includes(normalizedId.replace(/[^a-z0-9-]/g, '-'))` evaluates to `true` whenever the replaced input string is a substring of any key. For invalid/special character model IDs, the replaced string becomes `"-"`, which matches keys containing hyphens (e.g. `"claude-sonnet-4-6"`). Therefore, `resolveModelKey('.')` incorrectly resolves to `"claude-sonnet-4-6"` instead of returning `undefined`.
2. In `calculateCost`, since `introductoryPricing` from `pricing.json` is never read or referenced, the engine calculates the cost for `anthropic.claude-sonnet-5` using standard `onDemand` rates ($0.003/1k input tokens) instead of the promotional introductory rates ($0.002/1k input tokens).
3. In `estimateDepletionDate`, inputting negative credits computes a negative `daysRemaining`, subtracting days from `Date.now()`, resulting in a past Date object.
4. The test execution of `npm test -- --run` verified all 27 unit tests (including the 7 new challenger tests) in `pricing-engine.test.ts` pass, empirically confirming these behaviors. It also highlighted that 2 tests in `cloudwatch-service.test.ts` are currently failing (scope of Challenger 1).

## 3. Caveats

- We did not implement any logic fixes in the source files, complying with the `Review-only` constraint.
- The CloudWatch service test failures are reported but not addressed.

## 4. Conclusion

- **Model Key Resolution Bug**: Malformed/empty inputs resolve incorrectly to standard active models instead of failing.
- **Introductory Pricing Bug**: Claude Sonnet 5 introductory pricing is ignored, leading to over-calculating estimated costs.
- **Negative Credits Date**: Negative credits produce a depletion date in the past.

## 5. Verification Method

- Run the test suite:
  ```powershell
  npm test -- --run
  ```
- Inspect the newly added tests at the end of `src/shared/pricing-engine.test.ts` to see boundary condition assertions.
