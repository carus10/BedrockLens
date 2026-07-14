import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'
import { DataService } from './services/data-service'
import { formatCost } from './utils'

let tray: Tray | null = null

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

function buildTrayMenu(): Electron.MenuItemConstructorOptions[] {
  const data = DataService.getInstance()
  const lastRefresh = data.getLastRefresh()

  return [
    {
      label: 'BedrockLens',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Show Dashboard',
      click: () => {
        const wins = BrowserWindow.getAllWindows()
        if (wins.length > 0) {
          wins[0].show()
          wins[0].focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      role: 'quit'
    }
  ]
}

export async function createTray(): Promise<void> {
  try {
    const iconPath = join(__dirname, '../../resources/icon.ico')
    const icon = nativeImage.createFromPath(iconPath)

    tray = new Tray(icon)
    tray.setToolTip('BedrockLens')

    await updateTray()
  } catch (err) {
    console.error('[Tray] Failed to create tray:', err)
  }
}

export async function updateTray(): Promise<void> {
  if (!tray) return
  try {
    const data = DataService.getInstance()
    const periods = await data.getPeriods()
    const today = periods.find((p) => p.period === 'today')
    const session = periods.find((p) => p.period === 'session')

    const todayCost = today?.total.estimatedCost ?? 0
    const sessionCost = session?.total.estimatedCost ?? 0

    tray.setToolTip(
      `BedrockLens\nToday: ${formatCost(todayCost)}\nSession: ${formatCost(sessionCost)}`
    )

    const menu = Menu.buildFromTemplate([
      { label: 'BedrockLens', enabled: false },
      { type: 'separator' },
      { label: `Today:   ${formatCost(todayCost)}`, enabled: false },
      { label: `Session: ${formatCost(sessionCost)}`, enabled: false },
      { label: `Requests: ${today?.total.requestCount ?? 0}`, enabled: false },
      { type: 'separator' },
      {
        label: 'Open Dashboard',
        click: () => {
          const wins = BrowserWindow.getAllWindows()
          if (wins.length > 0) { wins[0].show(); wins[0].focus() }
        }
      },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' }
    ])

    tray.setContextMenu(menu)
  } catch (err) {
    console.error('[Tray] Update error:', err)
  }
}
