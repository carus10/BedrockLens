import { app, shell, BrowserWindow, ipcMain, Notification } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupIpcHandlers } from './ipc-handlers'
import { DataService } from './services/data-service'
import { SettingsService } from './services/settings-service'
import { AlertService } from './services/alert-service'
import { createTray, updateTray } from './tray'

let mainWindow: BrowserWindow | null = null
let refreshTimer: NodeJS.Timeout | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#080c10',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0d1117',
      symbolColor: '#8b949e',
      height: 40
    },
    frame: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function startRefreshTimer(): Promise<void> {
  if (refreshTimer) clearInterval(refreshTimer)

  const settings = SettingsService.getInstance().getSettings()
  const intervalMs = (settings.refreshIntervalSeconds || 60) * 1000

  refreshTimer = setInterval(async () => {
    try {
      await DataService.getInstance().refresh()
      mainWindow?.webContents.send('data:updated')
      await updateTray()


      const alertService = AlertService.getInstance()
      const newAlerts = await alertService.checkAlerts()
      if (newAlerts.length > 0 && Notification.isSupported()) {
        for (const alert of newAlerts) {
          new Notification({
            title: 'BedrockLens — Budget Alert',
            body: `${alert.type.charAt(0).toUpperCase() + alert.type.slice(1)} budget at ${alert.percentage.toFixed(0)}% ($${alert.currentValue.toFixed(2)})`,
            icon: join(__dirname, '../../resources/icon.png')
          }).show()
        }
        mainWindow?.webContents.send('alerts:new', newAlerts)
      }
    } catch (err) {
      console.error('[RefreshTimer] Error:', err)
    }
  }, intervalMs)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.bedrockLens')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIpcHandlers()
  createWindow()

  try {
    await DataService.getInstance().initialize()
    await startRefreshTimer()
    await createTray()
  } catch (err) {
    console.error('[App] Initialization error:', err)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (refreshTimer) clearInterval(refreshTimer)
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.on('settings:refresh-interval-changed', async () => {
  await startRefreshTimer()
})

export { mainWindow }
