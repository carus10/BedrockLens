# Milestone 1: Log Parsing & Calculator Tests Handoff Report

## 1. Observation
- **Introductory Pricing**: In `src/shared/pricing.json`, `claude-sonnet-5` has an `introductoryPricing` object (lines 49-55). However, `src/shared/types.ts` does not define `introductoryPricing` in `ModelPricing` (lines 105-111), and `src/shared/pricing-engine.ts` has no reference to it in `calculateCost` (lines 47-73), meaning the engine charges Sonnet 5 at standard rates despite being in the active promotion window.
- **Fuzzy Model Key Resolution Collision**: `PricingEngine.resolveModelKey` (lines 28-36) splits keys by `-` and matches major/minor parts. For `claude-opus-4-8` it splits into `parts[1] = 'opus'` and `parts[2] = '4'`. If an ID like `anthropic.opus-4-5` is matched via the fuzzy loop, it resolves to `claude-opus-4-8` because it is the first model in `pricing.json` matching `opus-4`.
- **Thinking Tokens**: `TokenUsage` interface in `src/shared/types.ts` contains `thinkingTokens: number` (line 6), but it is ignored in cost calculations in `src/shared/pricing-engine.ts` (lines 63-70) and is not parsed in `src/main/services/cloudwatch-service.ts` (lines 108-168).
- **Time Sensitivity**: `estimateDepletionDate` (lines 110-116 in `src/shared/pricing-engine.ts`) uses `new Date()`, creating a mutable time dependency that makes testing without mocked timers flaky.
- **Log Parsing Gaps**: `src/main/services/cloudwatch-service.ts` does not have any corresponding unit tests, leaving regex fallbacks and deduplication logic untested.
- **Path Resolution Errors**: The test run via `npx vitest run` failed for the proposed test file written by another explorer in `.agents/explorer_m1_3/proposed_cloudwatch-service.test.ts` due to incorrect relative imports:
  ```
  Error: Failed to load url ./cloudwatch-service (resolved id: ./cloudwatch-service) in C:/Users/taska/Desktop/tkip/.agents/explorer_m1_3/proposed_cloudwatch-service.test.ts. Does the file exist?
  ```

## 2. Logic Chain
- Given the omissions in `introductoryPricing` and `thinkingTokens` implementation, the pricing engine's calculations are incorrect or incomplete relative to real-world AWS Bedrock bills.
- The fuzzy matcher version collision means that certain models can be mismapped. Consequently, tests should cover resolving IDs like `anthropic.opus-4-5` to verify they map to the correct key (`claude-opus-4-5`) and do not fallback incorrectly.
- Writing unit tests for `CloudWatchService` log parsing is necessary to ensure regex fallbacks parse correctly from the `@message` field when structured fields are missing.
- Mocking system time in the Vitest environment is necessary to prevent tests on `estimateDepletionDate` from failing when run near midnight or in different time zones.

## 3. Caveats
- This is a read-only investigation. No source code files in `src/` were modified.
- Assumed thinking tokens are billed at the standard output token rate as per Anthropic/AWS Bedrock specifications.

## 4. Conclusion
- The test suite needs expansion in two areas:
  1. **Log Parsing & Deduplication**: A new test file (e.g. `src/main/services/cloudwatch-service.test.ts`) must test `parseQueryResults` and `deduplicateLogs` with mock query results.
  2. **Calculator Logic**: `src/shared/pricing-engine.test.ts` must be expanded to test all actual model keys in `pricing.json`, verify batch calculations, overrides, and use fake timers for depletion date.
- Propose fixing the import paths for tests by locating test files co-located with their target code (e.g. `src/main/services/cloudwatch-service.test.ts` rather than in `.agents/`).

## 5. Verification Method
- Execute tests using `npx vitest run`.
- Confirm all tests pass successfully without path resolution errors.
- Ensure the newly added test suites achieve high coverage of `pricing-engine.ts` and `cloudwatch-service.ts`.
