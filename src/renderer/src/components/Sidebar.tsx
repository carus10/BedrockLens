import { LayoutDashboard, Clock, BarChart3, Bell, Settings, RefreshCw } from 'lucide-react'
import type { View } from '../App'
import { useAlerts } from '../hooks/useData'
import { cn } from '../lib/utils'
import logoUrl from '../assets/logo.jpeg'
import { useQueryClient } from '@tanstack/react-query'
import { ipc } from '../lib/ipc'
import { useState } from 'react'

interface SidebarProps {
  activeView: View
  setActiveView: (v: View) => void
}

const NAV_ITEMS: { id: View; label: string; icon: React.ComponentType<any> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'sessions', label: 'Sessions', icon: Clock },
  { id: 'charts', label: 'Analytics', icon: BarChart3 },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'settings', label: 'Settings', icon: Settings }
]

export default function Sidebar({ activeView, setActiveView }: SidebarProps) {
  const { data: alerts } = useAlerts()
  const unacknowledged = alerts?.filter((a) => !a.acknowledged).length ?? 0
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await ipc.invoke('data:refresh')
      queryClient.invalidateQueries()
    } catch {} finally {
      setRefreshing(false)
    }
  }

  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col bg-bg-secondary border-r border-border-subtle">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle">
        <img
          src={logoUrl}
          alt="BedrockLens"
          className="w-8 h-8 rounded-md object-cover flex-shrink-0"
          style={{ imageRendering: 'crisp-edges' }}
        />
        <div>
          <div className="text-xs font-bold text-text-primary tracking-wide leading-none">BEDROCK</div>
          <div className="text-[10px] font-mono text-accent-green tracking-widest leading-none mt-0.5">LENS</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveView(item.id)}
            className={cn(
              'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded text-xs font-medium transition-all duration-150 cursor-pointer relative',
              activeView === item.id
                ? 'bg-bg-elevated text-text-primary'
                : 'text-text-secondary hover:bg-bg-elevated/60 hover:text-text-primary'
            )}
          >
            {/* Aktif gösterge — sağ kenarda ince çizgi yerine sol'da accent dot */}
            {activeView === item.id && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r bg-accent-green" />
            )}
            <item.icon className={cn(
              'w-3.5 h-3.5 flex-shrink-0',
              activeView === item.id ? 'text-accent-green' : 'text-text-muted'
            )} />
            <span>{item.label}</span>
            {item.id === 'alerts' && unacknowledged > 0 && (
              <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full bg-accent-red text-white text-[9px] font-bold flex items-center justify-center">
                {unacknowledged > 9 ? '9+' : unacknowledged}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Refresh butonu */}
      <div className="px-2 pb-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded
                     border border-accent-green/30 bg-accent-green/10 text-accent-green
                     text-xs font-semibold hover:bg-accent-green/20 hover:border-accent-green/60
                     transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border-subtle flex items-center gap-2">
        <img src={logoUrl} alt="" className="w-4 h-4 rounded object-cover opacity-40" />
        <div className="text-[9px] font-mono text-text-muted uppercase tracking-widest">
          v1.0.0
        </div>
      </div>
    </aside>
  )
}
