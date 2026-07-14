import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ipc } from '../lib/ipc'
import type { PeriodData, DailyDataPoint, HourlyDataPoint, Session, AppSettings, AlertEvent, CreditsStatus } from '../../../shared/types'

export function usePeriods() {
  return useQuery<PeriodData[]>({
    queryKey: ['periods'],
    queryFn: () => ipc.invoke('data:get-periods'),
    refetchInterval: 60_000
  })
}

export function useDailyData(days = 30) {
  return useQuery<DailyDataPoint[]>({
    queryKey: ['daily', days],
    queryFn: () => ipc.invoke('data:get-daily', { days }),
    refetchInterval: 300_000
  })
}

export function useHourlyData(hours = 24) {
  return useQuery<HourlyDataPoint[]>({
    queryKey: ['hourly', hours],
    queryFn: () => ipc.invoke('data:get-hourly', { hours }),
    refetchInterval: 60_000
  })
}

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => ipc.invoke('data:get-sessions'),
    refetchInterval: 60_000
  })
}

export function useSettings() {
  return useQuery<AppSettings>({
    queryKey: ['settings'],
    queryFn: () => ipc.invoke('settings:get'),
    staleTime: Infinity
  })
}

export function useAlerts() {
  return useQuery<AlertEvent[]>({
    queryKey: ['alerts'],
    queryFn: () => ipc.invoke('alerts:get'),
    refetchInterval: 30_000
  })
}

export function useCredits() {
  return useQuery<CreditsStatus | null>({
    queryKey: ['credits'],
    queryFn: () => ipc.invoke('credits:get'),
    refetchInterval: 300_000
  })
}

export function useAutoRefresh() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const unsubData = ipc.on('data:updated', () => {
      queryClient.invalidateQueries()
    })
    const unsubAlerts = ipc.on('alerts:new', () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] })
    })
    return () => {
      unsubData()
      unsubAlerts()
    }
  }, [queryClient])
}
