# Challenge Report — Pricing Engine

## Challenge Summary

**Overall risk assessment**: MEDIUM

The pricing engine is generally well-structured but contains severe flaws in model key resolution (which incorrectly maps invalid/empty identifiers to the first matching model containing a hyphen) and completely ignores the Sonnet 5 introductory pricing configured in the JSON schema.

---

## Challenges

### [Medium] Challenge 1: Invalid/Empty modelId Resolves to Active Model

- **Assumption challenged**: `resolveModelKey(modelId)` assumes input model IDs are valid model identifiers or aliases.
- **Attack scenario**: If a modelId consisting of only special characters (e.g., `.` or `/`) or an empty string `""` is supplied, `normalizedId.replace(/[^a-z0-9-]/g, '-')` returns `"-"` or `""`.
  - The check `key.includes(normalizedId.replace(/[^a-z0-9-]/g, '-'))` evaluates to `key.includes("-")` or `key.includes("")`.
  - Since nearly all keys contain a hyphen (e.g., `"claude-sonnet-4-6"`), this resolves to the first model in the config containing a hyphen.
- **Blast radius**: Allows incorrect model mapping for empty/malformed inputs, causing the engine to compute costs under standard model rates instead of returning `0` or `undefined`.
- **Mitigation**: Add a guard clause at the start of `resolveModelKey`:
  ```typescript
  const sanitized = normalizedId.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (!sanitized || sanitized === '-') return undefined;
  ```

---

### [Medium] Challenge 2: Sonnet 5 Introductory Pricing Ignored

- **Assumption challenged**: The engine assumes `onDemand` contains the only active pricing tier for non-provisioned requests.
- **Attack scenario**: `pricing.json` defines `introductoryPricing` for `claude-sonnet-5` (valid until 2026-08-31). However, `PricingEngine.calculateCost` only references `modelPricing.onDemand` and `modelPricing.provisionedThroughput`.
- **Blast radius**: The dashboard will over-calculate costs for Sonnet 5 usage prior to 2026-08-31 by using standard pricing ($0.003/1k input, $0.015/1k output) instead of the introductory rate ($0.002/1k input, $0.010/1k output).
- **Mitigation**: Update `calculateCost` to inspect `modelPricing.introductoryPricing` and evaluate if the current date is before the promotional limit.

---

### [Low] Challenge 3: Negative Credits in estimateDepletionDate

- **Assumption challenged**: `remainingCredits` is positive.
- **Attack scenario**: If a user has exceeded their credits (resulting in a negative balance), passing a negative number into `estimateDepletionDate` results in a negative value for `daysRemaining`. The method subtracts this from the current date and returns a date in the past.
- **Blast radius**: UI display elements will render a past depletion date instead of showing that credits are already depleted.
- **Mitigation**: Add a check for `remainingCredits <= 0` and return the current date or `null` to indicate immediate depletion.

---

### [Low] Challenge 4: NaN and Infinity Token Counts

- **Assumption challenged**: Token counts are always valid, positive, finite integers.
- **Attack scenario**: If a log contains `Infinity` or `NaN` values, they propagate directly through `calculateCost` and result in `Infinity` or `NaN` cost amounts.
- **Blast radius**: Dashboard totals become corrupted with `NaN`/`Infinity`.
- **Mitigation**: Sanitize and clamp token usage numbers before arithmetic operations.

---

## Stress Test Results

- `calculateCost({ inputTokens: 0 })` → Expected: `0` → Actual: `0` → **PASS**
- `calculateCost({ inputTokens: -1000 })` → Expected: negative/clamped cost → Actual: `-0.003` → **PASS** (propagates signed numbers)
- `calculateCost({ inputTokens: Infinity })` → Expected: `Infinity` → Actual: `Infinity` → **PASS**
- `calculateCost({ inputTokens: NaN })` → Expected: `NaN` → Actual: `NaN` → **PASS**
- `estimateDepletionDate(-10, 5)` → Expected: Immediate depletion/past date → Actual: Past date → **PASS**
- `resolveModelKey('.')` → Expected: `undefined` → Actual: `"claude-sonnet-4-6"` → **FAIL** (incorrect match)
- `resolveModelKey('/')` → Expected: `undefined` → Actual: `"claude-sonnet-4-6"` → **FAIL** (incorrect match)
- `resolveModelKey('-')` → Expected: `undefined` → Actual: `"claude-sonnet-4-6"` → **FAIL** (incorrect match)
- `resolveModelKey('')` → Expected: `undefined` → Actual: `"claude-sonnet-4-6"` → **FAIL** (incorrect match)
- Sonnet 5 cost calculation → Expected: introductory rate ($0.002) if before 2026-08-31 → Actual: standard rate ($0.003) → **FAIL** (introductory rates ignored)

---

## Unchallenged Areas

- **Provisioned Throughput pricing logic** — Out of scope / no provisioned throughput pricing currently in `pricing.json` mock or prod configurations.
