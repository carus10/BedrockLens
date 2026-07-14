import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: <T>(channel: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (channel: string, listener: (...args: any[]) => void) => {
    const wrapper = (_: Electron.IpcRendererEvent, ...args: any[]) => listener(...args)
    ipcRenderer.on(channel, wrapper)
    return () => ipcRenderer.removeListener(channel, wrapper)
  },
  once: (channel: string, listener: (...args: any[]) => void) => {
    ipcRenderer.once(channel, (_, ...args) => listener(...args))
  }
}

contextBridge.exposeInMainWorld('electron', api)

export type ElectronAPI = typeof api
