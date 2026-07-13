import { useState, useEffect } from 'react'
import { useAutoRefresh } from './hooks/useData'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import SessionsView from './components/SessionsView'
import ChartsView from './components/ChartsView'
import SettingsView from './components/SettingsView'
import AlertsView from './components/AlertsView'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
export type View = 'dashboard' | 'sessions' | 'charts' | 'alerts' | 'settings'

function MainApp() {
  const [activeView, setActiveView] = useState<View>('dashboard')
  useAutoRefresh()

  // Klavye kısayolları
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Eğer input odakta ise çalışmasın
      const tag = (document.activeElement as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case '1': setActiveView('dashboard'); break
        case '2': setActiveView('sessions'); break
        case '3': setActiveView('charts'); break
        case '4': setActiveView('alerts'); break
        case '5': setActiveView('settings'); break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-bg-primary overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar activeView={activeView} setActiveView={setActiveView} />
        <div className="flex flex-col flex-1 min-w-0">
          <main className="flex-1 overflow-auto">
            {activeView === 'dashboard' && <Dashboard />}
            {activeView === 'sessions' && <SessionsView />}
            {activeView === 'charts' && <ChartsView />}
            {activeView === 'alerts' && <AlertsView />}
            {activeView === 'settings' && <SettingsView />}
          </main>
          <StatusBar />
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return <MainApp />
}
