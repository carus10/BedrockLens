import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { RefreshCw, Wifi, WifiOff, Clock } from 'lucide-react'
import { ipc } from '../lib/ipc'
import { format } from 'date-fns'

export default function StatusBar() {
  const isFetching = useIsFetching()
  const queryClient = useQueryClient()
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [connected, setConnected] = useState(true)

  // İlk açılışta hemen refresh yap
  useEffect(() => {
    const doInitialRefresh = async () => {
      setIsRefreshing(true)
      try {
        await ipc.invoke('data:refresh')
        queryClient.invalidateQueries()
        setLastRefresh(new Date())
        setConnected(true)
      } catch {
        setConnected(false)
      } finally {
        setIsRefreshing(false)
      }
    }
    doInitialRefresh()
  }, [])

  useEffect(() => {
    const unsub = ipc.on('data:updated', () => {
      setLastRefresh(new Date())
      setConnected(true)
    })
    return unsub
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await ipc.invoke('data:refresh')
      queryClient.invalidateQueries()
      setLastRefresh(new Date())
      setConnected(true)
    } catch {
      setConnected(false)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <footer className="flex items-center gap-3 px-4 py-1.5 border-t border-border-subtle bg-bg-secondary text-[10px] font-mono text-text-muted">
      {connected ? (
        <span className="flex items-center gap-1 text-accent-green">
          <Wifi className="w-3 h-3" />
          AWS Connected
        </span>
      ) : (
        <span className="flex items-center gap-1 text-accent-red">
          <WifiOff className="w-3 h-3" />
          Disconnected
        </span>
      )}

      {(isFetching > 0 || isRefreshing) && (
        <span className="flex items-center gap-1 text-accent-blue animate-pulse-glow">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
          Updating…
        </span>
      )}

      <span className="flex items-center gap-1">
        <Clock className="w-2.5 h-2.5" />
        {format(lastRefresh, 'HH:mm:ss')}
      </span>
    </footer>
  )
}
