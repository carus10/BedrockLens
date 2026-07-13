import { useState, useEffect } from 'react'
import { useSettings } from '../hooks/useData'
import { useQueryClient } from '@tanstack/react-query'
import { ipc } from '../lib/ipc'
import type { AppSettings, CredentialConfig, AWSCredentialStatus } from '../../../shared/types'
import { Check, X, Loader2, ChevronDown, Shield, Bell, CreditCard, RefreshCw, Sliders } from 'lucide-react'

type SettingsTab = 'aws' | 'alerts' | 'credits' | 'general' | 'pricing'

export default function SettingsView() {
  const { data: settings } = useSettings()
  const [activeTab, setActiveTab] = useState<SettingsTab>('aws')

  const TABS: { id: SettingsTab; label: string; icon: React.ComponentType<any> }[] = [
    { id: 'aws', label: 'AWS Credentials', icon: Shield },
    { id: 'alerts', label: 'Alerts & Budget', icon: Bell },
    { id: 'credits', label: 'AWS Credits', icon: CreditCard },
    { id: 'general', label: 'General', icon: Sliders },
    { id: 'pricing', label: 'Pricing', icon: RefreshCw }
  ]

  if (!settings) return null

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-sm font-bold text-text-primary tracking-wide">SETTINGS</h1>
        <p className="text-[11px] text-text-muted font-mono mt-0.5">Configuration & preferences</p>
      </div>

      <div className="flex gap-4">
        {/* Tabs */}
        <div className="w-44 flex-shrink-0 space-y-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`nav-item w-full text-left ${activeTab === tab.id ? 'active' : ''}`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'aws' && <AWSTab settings={settings} />}
          {activeTab === 'alerts' && <AlertsTab settings={settings} />}
          {activeTab === 'credits' && <CreditsTab settings={settings} />}
          {activeTab === 'general' && <GeneralTab settings={settings} />}
          {activeTab === 'pricing' && <PricingTab settings={settings} />}
        </div>
      </div>
    </div>
  )
}

function AWSTab({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const [credential, setCredential] = useState<CredentialConfig>(settings.credential)
  const [profiles, setProfiles] = useState<string[]>([])
  const [status, setStatus] = useState<AWSCredentialStatus | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    ipc.invoke<string[]>('aws:get-profiles').then(setProfiles).catch(() => {})
  }, [])

  const test = async () => {
    setTesting(true)
    setStatus(null)
    try {
      const result = await ipc.invoke<AWSCredentialStatus>('aws:test-credentials', credential)
      setStatus(result)
    } finally {
      setTesting(false)
    }
  }

  const autoDetect = async () => {
    const detected = await ipc.invoke<CredentialConfig | null>('aws:detect-credentials')
    if (detected) setCredential(detected)
  }

  const save = async () => {
    setSaving(true)
    try {
      await ipc.invoke('settings:save', { credential })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } finally {
      setSaving(false)
    }
  }

  const CRED_TYPES: { id: CredentialConfig['type']; label: string }[] = [
    { id: 'env', label: 'Environment Variables' },
    { id: 'profile', label: 'AWS Profile' },
    { id: 'sso', label: 'AWS SSO' },
    { id: 'accessKey', label: 'Access Key / Secret' },
    { id: 'instanceProfile', label: 'Instance Profile' }
  ]

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">AWS Credentials</span>
        <button
          onClick={autoDetect}
          className="text-[10px] text-accent-blue hover:text-accent-blue/80 font-mono"
        >
          Auto-detect
        </button>
      </div>
      <div className="p-4 space-y-4">
        {/* Credential type */}
        <Field label="Credential Type">
          <select
            value={credential.type}
            onChange={(e) => setCredential({ ...credential, type: e.target.value as any })}
            className="input-field"
          >
            {CRED_TYPES.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </Field>

        {/* Region */}
        <Field label="Region">
          <input
            type="text"
            value={credential.region}
            onChange={(e) => setCredential({ ...credential, region: e.target.value })}
            placeholder="us-east-1"
            className="input-field"
          />
        </Field>

        {/* Profile */}
        {credential.type === 'profile' && (
          <Field label="Profile">
            <select
              value={credential.profile ?? ''}
              onChange={(e) => setCredential({ ...credential, profile: e.target.value })}
              className="input-field"
            >
              <option value="">Select profile…</option>
              {profiles.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </Field>
        )}

        {/* SSO */}
        {credential.type === 'sso' && (
          <>
            <Field label="SSO Start URL">
              <input
                type="text"
                value={credential.ssoStartUrl ?? ''}
                onChange={(e) => setCredential({ ...credential, ssoStartUrl: e.target.value })}
                placeholder="https://xxx.awsapps.com/start"
                className="input-field"
              />
            </Field>
            <Field label="SSO Profile">
              <select
                value={credential.profile ?? ''}
                onChange={(e) => setCredential({ ...credential, profile: e.target.value })}
                className="input-field"
              >
                <option value="">Select profile…</option>
                {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
          </>
        )}

        {/* Access Key */}
        {credential.type === 'accessKey' && (
          <>
            <Field label="Access Key ID">
              <input
                type="text"
                value={credential.accessKeyId ?? ''}
                onChange={(e) => setCredential({ ...credential, accessKeyId: e.target.value })}
                placeholder="AKIA…"
                className="input-field font-mono"
              />
            </Field>
            <Field label="Secret Access Key">
              <input
                type="password"
                value={credential.secretAccessKey ?? ''}
                onChange={(e) => setCredential({ ...credential, secretAccessKey: e.target.value })}
                placeholder="••••••••"
                className="input-field font-mono"
              />
            </Field>
            <Field label="Session Token (optional)">
              <input
                type="password"
                value={credential.sessionToken ?? ''}
                onChange={(e) => setCredential({ ...credential, sessionToken: e.target.value || undefined })}
                placeholder="Optional"
                className="input-field font-mono"
              />
            </Field>
          </>
        )}

        {/* Log group */}
        <Field label="Bedrock Log Group">
          <input
            type="text"
            value={settings.logGroupName}
            readOnly
            className="input-field opacity-60"
          />
        </Field>

        {/* Status */}
        {status && (
          <div className={`flex items-start gap-2 p-3 rounded border text-xs font-mono ${
            status.isValid
              ? 'bg-accent-green/5 border-accent-green/30 text-accent-green'
              : 'bg-accent-red/5 border-accent-red/30 text-accent-red'
          }`}>
            {status.isValid ? <Check className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> : <X className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />}
            <div>
              {status.isValid ? (
                <>
                  <div>Connected as {status.userId}</div>
                  <div className="text-[10px] opacity-70">Account: {status.accountId}</div>
                  <div className="text-[10px] opacity-70 break-all">{status.arn}</div>
                </>
              ) : (
                <div>{status.error}</div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={test}
            disabled={testing}
            className="btn-secondary flex items-center gap-1.5"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
            Test Connection
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="btn-primary flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function AlertsTab({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const [alerts, setAlerts] = useState(settings.alerts)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await ipc.invoke('settings:save', { alerts })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Budget Alerts</span>
        <label className="flex items-center gap-2 text-[10px] text-text-secondary cursor-pointer">
          <div
            onClick={() => setAlerts({ ...alerts, enabled: !alerts.enabled })}
            className={`w-7 h-4 rounded-full transition-colors relative ${alerts.enabled ? 'bg-accent-green' : 'bg-border-default'}`}
          >
            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${alerts.enabled ? 'left-3.5' : 'left-0.5'}`} />
          </div>
          {alerts.enabled ? 'Enabled' : 'Disabled'}
        </label>
      </div>
      <div className="p-4 space-y-4">
        <Field label="Daily Budget ($)">
          <input
            type="number"
            value={alerts.dailyBudget ?? ''}
            onChange={(e) => setAlerts({ ...alerts, dailyBudget: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 5.00"
            min="0"
            step="0.01"
            className="input-field"
          />
        </Field>
        <Field label="Monthly Budget ($)">
          <input
            type="number"
            value={alerts.monthlyBudget ?? ''}
            onChange={(e) => setAlerts({ ...alerts, monthlyBudget: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 50.00"
            min="0"
            step="0.01"
            className="input-field"
          />
        </Field>
        <Field label="Session Budget ($)">
          <input
            type="number"
            value={alerts.sessionBudget ?? ''}
            onChange={(e) => setAlerts({ ...alerts, sessionBudget: e.target.value ? Number(e.target.value) : undefined })}
            placeholder="e.g. 1.00"
            min="0"
            step="0.01"
            className="input-field"
          />
        </Field>
        <Field label="Notify at thresholds (%)">
          <div className="flex items-center gap-2">
            {[50, 75, 80, 90, 100].map((t) => (
              <button
                key={t}
                onClick={() => {
                  const current = alerts.notifyAt
                  setAlerts({
                    ...alerts,
                    notifyAt: current.includes(t) ? current.filter((x) => x !== t) : [...current, t].sort((a, b) => a - b)
                  })
                }}
                className={`px-2.5 py-1 rounded text-[10px] font-mono border transition-colors ${
                  alerts.notifyAt.includes(t)
                    ? 'bg-accent-blue/20 border-accent-blue/50 text-accent-blue'
                    : 'border-border-default text-text-muted hover:border-border-muted'
                }`}
              >
                {t}%
              </button>
            ))}
          </div>
        </Field>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Alerts
        </button>
      </div>
    </div>
  )
}

function CreditsTab({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const [credits, setCredits] = useState(settings.credits ?? { totalCredits: 0, usedExternally: 0, startDate: new Date().toISOString().slice(0, 10) })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await ipc.invoke('settings:save', { credits })
      queryClient.invalidateQueries({ queryKey: ['settings', 'credits'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">AWS Activate Credits</span>
      </div>
      <div className="p-4 space-y-4">
        <p className="text-[11px] text-text-muted font-mono">
          Track your AWS Activate / Startup credits against Bedrock usage.
        </p>
        <Field label="Total Credits ($)">
          <input
            type="number"
            value={credits.totalCredits}
            onChange={(e) => setCredits({ ...credits, totalCredits: Number(e.target.value) })}
            placeholder="e.g. 1000"
            min="0"
            className="input-field"
          />
        </Field>
        <Field label="Used by Other Services ($)">
          <input
            type="number"
            value={credits.usedExternally}
            onChange={(e) => setCredits({ ...credits, usedExternally: Number(e.target.value) })}
            placeholder="e.g. 100"
            min="0"
            className="input-field"
          />
        </Field>
        <Field label="Credit Start Date">
          <input
            type="date"
            value={credits.startDate}
            onChange={(e) => setCredits({ ...credits, startDate: e.target.value })}
            className="input-field"
          />
        </Field>
        <Field label="Notes">
          <input
            type="text"
            value={credits.notes ?? ''}
            onChange={(e) => setCredits({ ...credits, notes: e.target.value || undefined })}
            placeholder="Optional notes"
            className="input-field"
          />
        </Field>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Credits
        </button>
      </div>
    </div>
  )
}

function GeneralTab({ settings }: { settings: AppSettings }) {
  const queryClient = useQueryClient()
  const [general, setGeneral] = useState({
    refreshIntervalSeconds: settings.refreshIntervalSeconds,
    sessionGapMinutes: settings.sessionGapMinutes,
    enableCostExplorer: settings.enableCostExplorer,
    logGroupName: settings.logGroupName,
    pricingType: settings.pricingType
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await ipc.invoke('settings:save', general)
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">General Settings</span>
      </div>
      <div className="p-4 space-y-4">
        <Field label="Refresh Interval (seconds)">
          <input
            type="number"
            value={general.refreshIntervalSeconds}
            onChange={(e) => setGeneral({ ...general, refreshIntervalSeconds: Number(e.target.value) })}
            min="10"
            max="3600"
            className="input-field"
          />
        </Field>
        <Field label="Session Gap (minutes)">
          <input
            type="number"
            value={general.sessionGapMinutes}
            onChange={(e) => setGeneral({ ...general, sessionGapMinutes: Number(e.target.value) })}
            min="5"
            max="120"
            className="input-field"
          />
          <p className="text-[10px] text-text-muted mt-1 font-mono">
            Requests separated by more than this are considered different sessions
          </p>
        </Field>
        <Field label="CloudWatch Log Group">
          <input
            type="text"
            value={general.logGroupName}
            onChange={(e) => setGeneral({ ...general, logGroupName: e.target.value })}
            className="input-field font-mono"
          />
        </Field>
        <Field label="Pricing Type">
          <select
            value={general.pricingType}
            onChange={(e) => setGeneral({ ...general, pricingType: e.target.value as any })}
            className="input-field"
          >
            <option value="onDemand">On-Demand</option>
            <option value="provisionedThroughput">Provisioned Throughput</option>
          </select>
        </Field>
        <Field label="Cost Explorer">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setGeneral({ ...general, enableCostExplorer: !general.enableCostExplorer })}
              className={`w-7 h-4 rounded-full transition-colors relative ${general.enableCostExplorer ? 'bg-accent-green' : 'bg-border-default'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${general.enableCostExplorer ? 'left-3.5' : 'left-0.5'}`} />
            </div>
            <span className="text-xs text-text-secondary">
              {general.enableCostExplorer ? 'Enabled (shows actual AWS costs)' : 'Disabled'}
            </span>
          </label>
        </Field>
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          Save Settings
        </button>
      </div>
    </div>
  )
}

function PricingTab({ settings }: { settings: AppSettings }) {
  const [pricingJson, setPricingJson] = useState<string>('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    ipc.invoke('pricing:get').then((data) => {
      setPricingJson(JSON.stringify(data, null, 2))
      setLoaded(true)
    })
  }, [])

  return (
    <div className="panel">
      <div className="panel-header">
        <span className="panel-title">Pricing Configuration</span>
      </div>
      <div className="p-4 space-y-3">
        <p className="text-[11px] text-text-muted font-mono">
          Current pricing loaded from <code className="text-accent-blue">pricing.json</code>.
          Edit the file directly to update model prices — changes take effect on restart.
        </p>
        {loaded && (
          <pre className="text-[10px] font-mono text-text-secondary bg-bg-primary p-3 rounded border border-border-subtle overflow-auto max-h-96 leading-relaxed">
            {pricingJson}
          </pre>
        )}
        <p className="text-[10px] text-text-muted font-mono">
          File location: <span className="text-accent-blue">src/shared/pricing.json</span>
        </p>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{label}</label>
      {children}
    </div>
  )
}
