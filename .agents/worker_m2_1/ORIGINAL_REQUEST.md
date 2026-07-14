## 2026-07-14T08:40:50Z
Objective: Implement the verification script comparing computed AWS Bedrock billing vs actual Cost Explorer billing (Milestone 2).

Working directory: c:\Users\taska\Desktop\tkip\.agents\worker_m2_1

Tasks to perform:
1. Create `scripts/verify-billing.ts` to implement the comparison script as designed in Milestone 2.
2. The script must:
   - Use `detectCredentials` from `src/main/services/aws-credentials.ts` to authenticate AWS.
   - Accept configuration from CLI arguments or environment variables (e.g. COMPARE_DAYS, OFFSET_DAYS, VARIANCE_THRESHOLD_PERCENT, BEDROCK_LOG_GROUP_NAME).
   - Use `CostExplorerService` to pull Bedrock costs for the specified period (with exclusive end-date handling).
   - Use `CloudWatchService` to query CloudWatch Bedrock logs for the matching period.
   - Filter logs to include only successful invocations (statusCode === 200, no errorCode).
   - Deduplicate logs.
   - Calculate estimated Bedrock costs using `PricingEngine` and the price tiers in `src/shared/pricing.json`.
   - Align/group log data and Cost Explorer data using UTC days.
   - Compare estimated vs actual daily costs using a double tolerance model:
     * Absolute tolerance: $T_{abs} = 0.01$ USD
     * Percentage tolerance: $T_{pct} = 1\%$ (or configurable via threshold)
   - Print a clear verification table to the console detailing: Date, Logs Count, CW Est. Cost, CE Act. Cost, Difference, Variance %, Status (OK/FAIL).
   - Exit with code 0 on success (all days pass within tolerance), exit with code 1 on threshold violations (variance exceeds threshold), and exit with code 2 on system or connection errors.
3. Update `package.json` to add the script `"verify:billing": "vite-node scripts/verify-billing.ts"`.
4. Update the status of Milestone 2 to `DONE` in `c:\Users\taska\Desktop\tkip\PROJECT.md`.
5. Run the build/test commands to verify that:
   - The project builds successfully.
   - The unit tests pass.
   - The `verify:billing` script executes correctly (you can test with invalid credentials or run it locally if credentials exist, or mock/test it).
6. Document your changes and verification commands in your handoff report (`handoff.md` in your working directory `c:\Users\taska\Desktop\tkip\.agents\worker_m2_1`).
