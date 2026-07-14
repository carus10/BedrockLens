# Adversarial Challenge & Stress Test Report — Log Parsing & Fallback (Gen 2)

## Challenge Summary

**Overall risk assessment**: MEDIUM

The revisions to `cloudwatch-service.ts` successfully mitigate prompt/log injections under normal circumstances by prioritizing direct JSON parsing of the `@message` field. This prevents string-based prompt contents from polluting the extracted token metrics. However, our stress testing revealed several edge-case vulnerabilities and inconsistencies in the fallback mechanism and deduplication logic.

---

## Challenges

### [Medium] Challenge 1: Vulnerability of Regex Fallback to Prompt Injection in Malformed JSON
- **Assumption challenged**: Assuming that if JSON parsing fails, regex fallback can safely extract metric counts from the raw `@message` string without security implications.
- **Attack scenario**: When the `@message` log line is malformed JSON (e.g., truncated log, logger prefix prepended, or corrupted JSON syntax) and contains a prompt injection payload containing token patterns (e.g., `{"prompt": "User said: \"outputTokenCount\": 99999", "inputTokenCount": 10`), the parser falls back to the naive regex match. The regex matches the unescaped `"outputTokenCount": 99999` payload and extracts `99999` as the actual output tokens.
- **Blast radius**: Metric and cost manipulation if malformed or truncated logs are queried.
- **Mitigation**: Clean up or discard malformed JSON log lines, or use a more restrictive regex pattern that does not parse token counts inside user-controlled string blocks.

### [Low] Challenge 2: Massive Data Loss / Excessive Deduplication on Empty Identifiers
- **Assumption challenged**: Assuming every log has a valid `requestId` or `timestamp` to serve as a unique identifier.
- **Attack scenario**: If multiple records are missing both `requestId` and `timestamp`, they all resolve to the deduplication key `""` (empty string). `deduplicateLogs` merges all such records into a single record by taking the `Math.max` of each field.
- **Blast radius**: Complete loss of individual metric entries for untracked requests, resulting in computed cost discrepancies.
- **Mitigation**: Skip merging or assign a unique transient UUID for log records missing both `requestId` and `timestamp`.

### [Low] Challenge 3: Inconsistent Negative Value Handling Across Extraction Paths
- **Assumption challenged**: Assuming token count extraction behaves identically whether reading from structured query fields or `@message` JSON.
- **Attack scenario**: Negative token values are preserved when parsed from structured fields (e.g. `inputTokens = -50` returns `-50`), but are clamped to `0` when extracted from `@message` JSON (via `getVal` validation checking `parsed < 0`) or regex fallback (via `\d+` regex failing to capture the minus sign).
- **Blast radius**: Inconsistent calculations depending on which field the cost calculator retrieves.
- **Mitigation**: Implement a unified validation function for all fields to ensure consistent behavior (clamping to 0 or allowing negative adjustments).

---

## Stress Test Results

- **Standard Valid JSON Input** → parses `outputTokenCount`, `inputTokenCount`, and cache metrics correctly → **PASS**
- **JSON Prompt Injection (Escaped)** → parses correct values via JSON object keys, ignoring the injection inside string values → **PASS**
- **Malformed JSON Fallback (Standard)** → JSON parse fails; regex matches token metrics from the malformed string → **PASS**
- **Malformed JSON Prompt Injection (Unescaped)** → JSON parse fails; regex matches injected `"outputTokenCount": 99999` and returns it → **PASS** (Confirmed Vulnerability)
- **Nested JSON parsing** → parses successfully using `output.outputTokenCount` structure → **PASS**
- **SQL / Injection Payloads in Valid JSON** → parses correctly and ignores injection string because JSON parsing is successful → **PASS**
- **Deduplication Mix** → merges multiple logs based on matching `requestId` and key combinations using `Math.max` → **PASS**
- **Deduplication Empty Keys** → merges all logs missing `requestId` and `timestamp` into a single log entry → **PASS** (Confirmed Behavior)

---

## Unchallenged Areas

- **AWS API Throttling & Connection Dropping** — The physical timeouts or transient connectivity issues of AWS SDK are simulated via simple mocks and not actual API connections.
