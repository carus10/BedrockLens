import { useState, useRef, useEffect } from 'react'
import { Download, FileText, FileSpreadsheet, FileJson, File } from 'lucide-react'
import { ipc } from '../lib/ipc'

export default function ExportMenu() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const exportData = async (format: string) => {
    setLoading(format)
    try {
      await ipc.invoke(`export:${format}`, { period: 'all' })
    } catch (err: any) {
      if (!err.message?.includes('cancelled')) {
        console.error('Export error:', err)
      }
    } finally {
      setLoading(null)
      setOpen(false)
    }
  }

  const options = [
    { id: 'csv', label: 'CSV', icon: FileText },
    { id: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
    { id: 'json', label: 'JSON', icon: FileJson },
    { id: 'pdf', label: 'PDF Report', icon: File }
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-border-default bg-bg-elevated text-xs font-medium text-text-secondary hover:text-text-primary hover:border-border-muted transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-bg-elevated border border-border-default rounded shadow-xl z-50">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => exportData(opt.id)}
              disabled={!!loading}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-colors first:rounded-t last:rounded-b disabled:opacity-50"
            >
              {loading === opt.id ? (
                <span className="w-3.5 h-3.5 border border-accent-blue border-t-transparent rounded-full animate-spin" />
              ) : (
                <opt.icon className="w-3.5 h-3.5" />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
