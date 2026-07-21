import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { AssetType, SymbolSuggestion } from '../../../shared/types'

interface Props {
  type: AssetType
  value: string
  onChange: (symbol: string) => void
  onSelect?: (s: SymbolSuggestion) => void
  placeholder?: string
}

const MAX_DROP_HEIGHT = 260

export default function TickerPicker({ type, value, onChange, onSelect, placeholder }: Props): JSX.Element {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<SymbolSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [hilite, setHilite] = useState(-1)
  const [dropPos, setDropPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 280 })
  const ref = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const reqId = useRef(0)

  useEffect(() => {
    const q = value.trim()
    if (q.length < 1) { setResults([]); setLoading(false); return }
    setLoading(true)
    const id = ++reqId.current
    const timer = setTimeout(async () => {
      try {
        const res = await window.api.searchSymbol(type, q)
        if (id === reqId.current) setResults(res)
      } finally {
        if (id === reqId.current) setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [value, type])

  const updatePos = (): void => {
    if (!ref.current) return
    const r = ref.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const width = Math.max(r.width, 280)
    if (spaceBelow < MAX_DROP_HEIGHT && r.top > spaceBelow) {
      setDropPos({ bottom: window.innerHeight - r.top + 2, left: r.left, width })
    } else {
      setDropPos({ top: r.bottom + 2, left: r.left, width })
    }
  }

  const openDrop = (): void => { updatePos(); setOpen(true) }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (ref.current?.contains(e.target as Node)) return
      if (listRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  useEffect(() => {
    if (!listRef.current || hilite < 0) return
    const el = listRef.current.querySelector(`[data-idx="${hilite}"]`) as HTMLElement | null
    el?.scrollIntoView({ block: 'nearest' })
  }, [hilite])

  const select = (s: SymbolSuggestion): void => {
    onChange(s.symbol)
    onSelect?.(s)
    setOpen(false)
    setHilite(-1)
    ref.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault(); openDrop(); setHilite((h) => Math.min(h + 1, results.length - 1)); return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault(); setHilite((h) => Math.max(h - 1, 0)); return
    }
    if (e.key === 'Enter' && open && hilite >= 0 && hilite < results.length) {
      e.preventDefault(); select(results[hilite])
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={ref}
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); openDrop(); setHilite(-1) }}
        onFocus={openDrop}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (loading || results.length > 0 || value.trim().length > 0) && createPortal(
        <div
          ref={listRef}
          style={{
            position: 'fixed',
            top: dropPos.top,
            bottom: dropPos.bottom,
            left: dropPos.left,
            width: dropPos.width,
            maxHeight: MAX_DROP_HEIGHT,
            overflowY: 'auto',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            zIndex: 9999,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
          }}
        >
          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }}>Recherche…</div>
          )}
          {!loading && results.length === 0 && (
            <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }}>Aucun résultat</div>
          )}
          {!loading && results.map((s, i) => (
            <div
              key={`${s.symbol}-${i}`}
              data-idx={i}
              onMouseDown={(e) => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setHilite(i)}
              style={{
                padding: '7px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                background: i === hilite ? 'var(--accent)' : 'transparent',
                color: i === hilite ? '#fff' : 'var(--text)',
                fontSize: 13
              }}
            >
              <span style={{ fontWeight: 600, flexShrink: 0 }}>{s.symbol}</span>
              <span
                style={{
                  color: i === hilite ? 'rgba(255,255,255,0.75)' : 'var(--text2)',
                  fontSize: 12,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  textAlign: 'right'
                }}
              >
                {s.name}{s.exchange ? ` · ${s.exchange}` : ''}
              </span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
