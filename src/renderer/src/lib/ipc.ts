declare global {
  interface Window {
    electron: {
      invoke: <T>(channel: string, ...args: any[]) => Promise<T>
      on: (channel: string, listener: (...args: any[]) => void) => () => void
      once: (channel: string, listener: (...args: any[]) => void) => void
    }
  }
}

export const ipc = {
  invoke: <T>(channel: string, ...args: any[]): Promise<T> => {
    if (!window.electron) throw new Error('Electron IPC not available')
    return window.electron.invoke<T>(channel, ...args)
  },
  on: (channel: string, listener: (...args: any[]) => void) => {
    if (!window.electron) return () => {}
    return window.electron.on(channel, listener)
  }
}

export function formatCost(value: number): string {
  if (value >= 1) return `$${value.toFixed(4)}`
  if (value >= 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(6)}`
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return String(value)
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  return `${m}m ${s}s`
}

export function formatLatency(ms: number): string {
  if (ms === 0) return '—'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export const MODEL_COLORS: Record<string, string> = {
  'claude-sonnet-4-5': '#58a6ff',
  'claude-sonnet-4-6': '#3fb950',
  'claude-opus-4-6': '#bc8cff',
  'claude-opus-4-7': '#d29922',
  'claude-opus-4-8': '#f85149',
  'claude-haiku-4-5': '#39d353'
}

export function getModelColor(modelKey: string): string {
  return MODEL_COLORS[modelKey] ?? '#8b949e'
}
