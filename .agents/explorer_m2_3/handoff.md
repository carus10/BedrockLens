# Handoff Report: AWS Cost Explorer Comparison Script (Milestone 2)

## 1. Observation

- **Project Milestones:** `PROJECT.md` at lines 10-15 details:
  ```markdown
  10: ## Milestones
  11: | # | Name | Scope | Dependencies | Status |
  12: |---|------|-------|-------------|--------|
  13: | 1 | M1: Log Parsing & Calculator Tests | Add unit tests for log parsing (parsing logic, regex fallbacks, deduplication) and calculations (PricingEngine) | none | DONE |
  14: | 2 | M2: AWS Cost Explorer Comparison Script | Create verification script comparing computed billing vs Cost Explorer billing with a variance check | M1 | PLANNED |
  15: | 3 | M3: Automation & E2E Validation | Integrate verification scripts to npm test flow and perform final audit | M2 | PLANNED |
  ```
- **Transitive Runners:** Searching `package-lock.json` reveals `vite-node` is installed under `node_modules/vite-node` (line 11331) as a dependency of `vitest` (line 11379). `tsx` is listed as an optional peer dependency in package-lock.json (line 9484) but is not explicitly declared in `package.json` `devDependencies` (lines 53-70).
- **Service Dependency Isolation:** 
  - `src/main/services/cloudwatch-service.ts` and `src/main/services/cost-explorer-service.ts` do not import any Electron-specific packages.
  - `src/main/services/settings-service.ts` at line 1 imports `electron-store`:
    ```typescript
    1: import Store from 'electron-store'
    ```
    This package requires the Electron main process context (`app.getPath`), making it unsafe for command-line Node.js execution.

---

## 2. Logic Chain

1. **Decoupled Script Location:** 
   - A standalone script under `scripts/verify-billing.ts` is superior to an integration test.
   - Live AWS API integration checks require active AWS credentials.
   - If written as a standard unit/integration test, it would run by default on developer machines during `npm run test` (`vitest`), causing test suite failures if the developer is offline or lacks SSO credentials.
   - A standalone CLI script can accept customized CLI arguments (like `--days` and `--variance`) and be triggered in specific environments (like CI/CD or staging) without affecting developer local workflows.
2. **TypeScript Loader Selection:**
   - Standard Node.js cannot run TypeScript files directly.
   - `vite-node` is already present in `package-lock.json` as a dependency of `vitest`.
   - Running `npx vite-node scripts/verify-billing.ts` avoids adding new devDependencies or configuration overhead.
3. **Dependency and Import Constraints:**
   - The script needs to reuse `CloudWatchService` and `CostExplorerService`.
   - Since these classes do not depend on Electron packages, they can be safely imported using relative paths in a standard Node.js runtime environment.
   - The script must avoid importing `SettingsService` or other Electron-dependent modules. Configuration parameters (such as the log group name or region) should be supplied via CLI arguments or environment variables.

---

## 3. Caveats

- **AWS API Quotas:** Calling CloudWatch Logs Insights and Cost Explorer APIs regularly in automated scripts can incur small AWS costs and are subject to rate limiting.
- **Transitive Dependency Risk:** Relying on `vite-node` as a transitive dependency of `vitest` is safe since `vitest` is a core devDependency. However, if `vitest` is ever removed, the script runner would break. (Adding `"tsx": "^4.16.2"` explicitly to `devDependencies` is a safer alternative if transitive dependency isolation is required).
- **Region Constraints:** Cost Explorer API commands are hardcoded to `us-east-1` in `cost-explorer-service.ts`, whereas CloudWatch log groups reside in the target profile's region. The credential resolver must have IAM permissions for both services and regions.

---

## 4. Conclusion

- **Layout:** Implement the comparison script as a standalone script at `scripts/verify-billing.ts`.
- **Command Line Runner:** Run the script using `vite-node` (already installed) or explicitly add `tsx` to `devDependencies` and use `npx tsx scripts/verify-billing.ts`.
- **Integration:** Add the command to `package.json` scripts:
  ```json
  "verify:billing": "vite-node scripts/verify-billing.ts"
  ```
- **Automation:** Execute the script in CI/CD pipelines (e.g., GitHub Actions) on a cron schedule or post-deployment, utilizing environment variables for credentials and exiting with status `1` on variance failures to stop the pipeline and trigger alerts.

---

## 5. Verification Method

To verify the setup:
1. Create a dummy TypeScript script at `scripts/verify-billing.ts` printing a test message.
2. Add the npm script to `package.json`: `"verify:billing": "vite-node scripts/verify-billing.ts"`.
3. Run `npm run verify:billing` on the command line. It should execute successfully and print the test message without complaining about TypeScript execution or compile errors.
4. Set up invalid credentials or a high variance check (e.g. `--variance 0.000001`) to confirm that the script terminates with exit code `1` (indicating failure) when expected.
