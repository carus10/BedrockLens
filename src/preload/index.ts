import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => listener(...args))
    return () => ipcRenderer.removeListener(channel, listener)
  },
  once: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_, ...args) => listener(...args))
  }
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
