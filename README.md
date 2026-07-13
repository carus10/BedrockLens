# BedrockLens

**Real-time Amazon Bedrock cost & usage dashboard for Claude Desktop users.**

BedrockLens is a cross-platform Electron desktop app that connects directly to your AWS account and gives you live visibility into every Claude model invocation — tokens, costs, cache efficiency, sessions, and budget alerts — all in one dark-themed interface.

---

## Features

- **Live Dashboard** — KPI cards with animated counters: today's cost, tokens, requests, session cost. 7-day sparkline chart and trend vs. yesterday.
- **Period Breakdown** — Session / Today / Yesterday / Last 7 Days / Last 30 Days side by side.
- **Model Summary Table** — Per-model requests, input/output tokens, cache hit/write, latency, and estimated cost. Filterable by Today, Last 7d, Last 30d, or any specific day with a custom date picker.
- **Sessions View** — Auto-detected sessions with expandable detail: cache hit rate, cache savings, input/output ratio, models used.
- **Analytics / Charts** — Daily spending area chart, requests over time, hourly request bar chart, daily token stacked bars, cost-by-model donut chart, efficiency score (A–F).
- **Budget Alerts** — Configurable daily / monthly budget thresholds with desktop notifications at 50 / 75 / 80 / 90 / 100%.
- **AWS Credits Tracker** — Track your AWS Activate / Startup credits: remaining balance, daily burn rate, estimated depletion date.
- **Cost Explorer Integration** — Overlay actual AWS costs on top of local estimates for accuracy.
- **Export** — CSV, Excel, JSON, PDF export from any period.
- **Multi-platform** — Windows (NSIS installer + portable), macOS (Intel + Apple Silicon DMG), Linux (AppImage).

---

## Prerequisites

Before installing BedrockLens you need:

1. An AWS account with Amazon Bedrock enabled
2. **Model Invocation Logging** turned on in Bedrock (Step 1 below)
3. An IAM user or role with the required permissions (Steps 2–3 below)
4. AWS credentials accessible on your machine

---

## AWS Setup

### Step 1 — Enable Model Invocation Logging in Amazon Bedrock

Model Invocation Logging is the source of all data in BedrockLens. Without it the dashboard will show no data.

1. Open the [AWS Console](https://console.aws.amazon.com/) and navigate to **Amazon Bedrock**.
2. In the left sidebar click **Settings** (under the gear icon at the bottom).
3. Under **Model invocation logging** click **Edit**.
4. Set **Logging destination** to **CloudWatch Logs**.
5. Set **Log group name** to:
   ```
   /aws/bedrock/modelinvocations
   ```
6. Make sure both **Input data** and **Output data** are checked.
7. Click **Save changes**.

> Bedrock creates the log group automatically on the first invocation. If you already have a different log group name, use that name in BedrockLens **Settings → General → CloudWatch Log Group**.

> Data only appears for invocations made **after** logging is enabled. Historical invocations are not retroactively logged.

---

### Step 2 — Create an IAM Policy

1. In the AWS Console go to **IAM → Policies → Create policy**.
2. Switch to the **JSON** tab and paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "CloudWatchLogsRead",
      "Effect": "Allow",
      "Action": [
        "logs:StartQuery",
        "logs:GetQueryResults",
        "logs:DescribeLogGroups"
      ],
      "Resource": "arn:aws:logs:*:*:log-group:/aws/bedrock/*"
    },
    {
      "Sid": "CostExplorer",
      "Effect": "Allow",
      "Action": [
        "ce:GetCostAndUsage"
      ],
      "Resource": "*"
    },
    {
      "Sid": "VerifyIdentity",
      "Effect": "Allow",
      "Action": [
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
```

3. Click **Next**, name it `BedrockLensPolicy`, then **Create policy**.

> `ce:GetCostAndUsage` is only used when **Cost Explorer** is enabled in Settings (optional but recommended). You can remove it if you don't need actual cost data overlays.
>
> `sts:GetCallerIdentity` is only used by the **Test Connection** button in Settings.

---

### Step 3 — Create an IAM User and Get Credentials

1. In **IAM → Users → Create user**.
2. Enter a username such as `bedrocklens-user` and click **Next**.
3. Choose **Attach policies directly**, search for `BedrockLensPolicy`, select it, click **Next → Create user**.
4. Open the user you just created → **Security credentials** tab → **Create access key**.
5. Select **Application running outside AWS** → **Next** → **Create access key**.
6. **Copy both the Access Key ID and the Secret Access Key.** You will need these in BedrockLens. The secret key cannot be viewed again after you leave this page.

> If your organization uses AWS SSO (IAM Identity Center) or named profiles, you can use those instead — see [Credential Types](#credential-types) below.

---

### Step 4 — Choose the Right Region

Set the region in BedrockLens to match where your Bedrock usage occurs. Claude Desktop typically uses `us-east-1` (N. Virginia) or `us-west-2` (Oregon). Check **Amazon Bedrock → Model invocation logging** to confirm which region your logs are in.

---

## Installation

### Download a pre-built release

Go to the [Releases](https://github.com/carus10/BedrockLens/releases) page and download the installer for your platform:

| Platform | File |
|---|---|
| Windows | `bedrock-lens-x.x.x-Setup.exe` (installer) or `bedrock-lens-x.x.x-portable.exe` |
| macOS | `bedrock-lens-x.x.x.dmg` (Intel + Apple Silicon) |
| Linux | `bedrock-lens-x.x.x.AppImage` |

### Build from source

```bash
# Clone the repository
git clone https://github.com/carus10/BedrockLens.git
cd BedrockLens

# Install dependencies
npm install

# Run in development mode (hot reload)
npm run dev

# Build for your current platform
npm run package

# Or build for a specific platform
npm run package:win
npm run package:mac
npm run package:linux
```

**Requirement:** Node.js 18+ and npm.

---

## First-Time Configuration

1. Launch BedrockLens.
2. Click **Settings** in the sidebar (or press `5`).
3. Go to the **AWS Credentials** tab.
4. Select your **Credential Type** (see table below).
5. Enter your **Region** (e.g. `us-east-1`).
6. Enter your credentials (access key, profile name, etc.).
7. Click **Test Connection** — a green success message confirms the credentials work.
8. Click **Save**.
9. BedrockLens will start fetching the last 31 days of invocation data immediately.

---

## Credential Types

| Type | When to use |
|---|---|
| **Access Key + Secret** | You created an IAM user with an access key (Step 3 above) |
| **Named Profile** | You have a profile in `~/.aws/credentials` |
| **AWS SSO** | Your organization uses IAM Identity Center |
| **Environment Variables** | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` are set in your shell |
| **Instance Profile** | Running on an EC2 instance with an attached IAM role |

**Named profile example** (`~/.aws/credentials`):

```ini
[bedrocklens]
aws_access_key_id     = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
region                = us-east-1
```

Select **Named Profile** in BedrockLens Settings and type `bedrocklens`. You can also click **Auto-detect** to let the app find all available profiles automatically.

---

## Settings Reference

| Setting | Default | Description |
|---|---|---|
| Region | `us-east-1` | Region where your Bedrock usage occurs |
| CloudWatch Log Group | `/aws/bedrock/modelinvocations` | Must match what you set in Bedrock Settings |
| Refresh Interval | `60` seconds | How often the dashboard pulls new data |
| Session Gap | `30` minutes | Gap between requests that creates a new session |
| Pricing Type | `onDemand` | On-demand or provisioned throughput pricing |
| Enable Cost Explorer | `true` | Show actual AWS costs alongside local estimates |
| Daily Budget | — | Optional. Triggers alerts at configured thresholds |
| Monthly Budget | — | Optional. Triggers alerts at configured thresholds |
| Alert Thresholds | 50 / 80 / 100% | Percentage levels that trigger desktop notifications |
| AWS Credits | — | Optional. Track AWS Activate / Startup credits |

---

## Keyboard Shortcuts

| Key | View |
|---|---|
| `1` | Dashboard |
| `2` | Sessions |
| `3` | Analytics |
| `4` | Alerts |
| `5` | Settings |

---

## Updating Pricing

BedrockLens ships with a built-in pricing table for all current Claude models. If AWS updates prices before a new release is published, edit `src/shared/pricing.json` directly and rebuild.

Supported models (current):

- Claude Fable 5, Opus 4.8, Sonnet 5
- Claude Opus 4.7, Opus 4.6, Opus 4.5
- Claude Sonnet 4.6, Sonnet 4.5
- Claude Haiku 4.5

Cross-region inference profile IDs (e.g. `us.anthropic.claude-sonnet-4-6-20250514-v1:0`) are automatically resolved to the correct model and pricing.

---

## Troubleshooting

**Dashboard shows no data**
- Verify Model Invocation Logging is enabled in Amazon Bedrock → Settings.
- Make sure the log group name in BedrockLens Settings → General exactly matches the one configured in Bedrock.
- Check that your IAM policy includes `logs:StartQuery`, `logs:GetQueryResults`, and `logs:DescribeLogGroups`.
- Remember: data only appears for invocations made *after* logging was enabled.

**"Access Denied" on connection test**
- Your IAM user or role is missing `sts:GetCallerIdentity`. Add it to the policy.

**Cost Explorer shows $0.00 actual costs**
- Make sure `ce:GetCostAndUsage` is in your IAM policy.
- Cost Explorer data has up to a 24-hour delay in AWS.
- Confirm **Enable Cost Explorer** is toggled on in Settings → General.

**App shows stale data**
- Click the **Refresh** button at the bottom of the sidebar, or wait for the next automatic refresh cycle.

---

## Tech Stack

- **Electron** + **electron-vite** — desktop shell and build tooling
- **React 19** + **TypeScript** — UI
- **Tailwind CSS** + **Radix UI** + **Lucide** — styling and components
- **Recharts** — charts and sparklines
- **TanStack Query** — data fetching and caching
- **AWS SDK v3** — CloudWatch Logs Insights, Cost Explorer, STS
- **ExcelJS** + **jsPDF** — Excel and PDF export
- **electron-store** — local settings persistence

---

## License

MIT © 2025 BedrockLens
