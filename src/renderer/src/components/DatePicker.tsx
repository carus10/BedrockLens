import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { cn } from '../lib/utils'

const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

interface DatePickerProps {
  value: string       // 'yyyy-MM-dd' or ''
  onChange: (v: string) => void
  min?: string        // 'yyyy-MM-dd'
  max?: string        // 'yyyy-MM-dd'
}

function parseDate(s: string): Date | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function fmtYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export default function DatePicker({ value, onChange, min, max }: DatePickerProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const selected = parseDate(value)
  const minDate = parseDate(min ?? '')
  const maxDate = parseDate(max ?? fmtYMD(today))

  const initial = selected ?? today
  const [viewYear, setViewYear] = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())
  const [open, setOpen] = useState(false)

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  // Build calendar grid (Mon-start)
  function buildGrid(): (Date | null)[] {
    const first = new Date(viewYear, viewMonth, 1)
    // Mon=0, Sun=6
    const startDow = (first.getDay() + 6) % 7
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
    const cells: (Date | null)[] = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(viewYear, viewMonth, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }

  function isDisabled(d: Date): boolean {
    if (minDate && d < minDate) return true
    if (maxDate && d > maxDate) return true
    return false
  }

  function selectDay(d: Date) {
    if (isDisabled(d)) return
    onChange(fmtYMD(d))
    setOpen(false)
  }

  const grid = buildGrid()

  const label = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Pick date'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider transition-colors',
          open || value
            ? 'bg-accent-blue/20 text-accent-blue'
            : 'text-text-muted hover:text-text-secondary hover:bg-bg-elevated'
        )}
      >
        <CalendarDays className="w-3 h-3 flex-shrink-0" />
        {value ? value : 'Date'}
      </button>

      {open && (
        <div
          className="absolute right-0 bottom-full mb-1.5 z-50 rounded border border-border-default bg-bg-elevated shadow-2xl"
          style={{ width: 220 }}
        >
          {/* Month nav */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
            <button
              onClick={prevMonth}
              className="p-0.5 rounded hover:bg-bg-primary transition-colors text-text-muted hover:text-text-primary"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-semibold text-text-primary font-mono">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="p-0.5 rounded hover:bg-bg-primary transition-colors text-text-muted hover:text-text-primary"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 px-2 pt-2 pb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[9px] font-semibold uppercase tracking-wider text-text-muted py-0.5">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5">
            {grid.map((d, i) => {
              if (!d) return <div key={i} />
              const isToday = fmtYMD(d) === fmtYMD(today)
              const isSel = value && fmtYMD(d) === value
              const disabled = isDisabled(d)
              return (
                <button
                  key={i}
                  onClick={() => selectDay(d)}
                  disabled={disabled}
                  className={cn(
                    'w-full aspect-square flex items-center justify-center rounded text-[10px] font-mono transition-colors',
                    disabled && 'text-text-muted/30 cursor-not-allowed',
                    !disabled && isSel && 'bg-accent-blue text-bg-primary font-bold',
                    !disabled && !isSel && isToday && 'ring-1 ring-accent-blue/60 text-accent-blue',
                    !disabled && !isSel && !isToday && 'text-text-secondary hover:bg-bg-primary hover:text-text-primary'
                  )}
                >
                  {d.getDate()}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-1.5 border-t border-border-subtle">
            <button
              onClick={() => { onChange(''); setOpen(false) }}
              className="text-[10px] text-text-muted hover:text-text-primary transition-colors font-mono"
            >
              Clear
            </button>
            <button
              onClick={() => {
                if (!isDisabled(today)) { onChange(fmtYMD(today)); setOpen(false) }
                else { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }
              }}
              className="text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors font-mono"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
