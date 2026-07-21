import { useEffect, useState } from 'react'
import type { PeriodComparison } from '../../../shared/types'

type Mode = 'mois' | 'annee' | 'custom'

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function monthBounds(offset: number): { start: string; end: string; label: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + offset
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const isCurrentMonth = offset === 0
  const d = new Date(y, m, 1)
  return {
    start: fmt(start),
    end: fmt(isCurrentMonth ? today : end),
    label: `${MONTH_NAMES[((m % 12) + 12) % 12]} ${d.getFullYear()}`
  }
}

function yearBounds(offset: number): { start: string; end: string; label: string } {
  const today = new Date()
  const y = today.getFullYear() + offset
  const start = new Date(y, 0, 1)
  const end = new Date(y, 11, 31)
  const isCurrentYear = offset === 0
  return {
    start: fmt(start),
    end: fmt(isCurrentYear ? today : end),
    label: String(y)
  }
}

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export default function Comparaison(): JSX.Element {
  const [mode, setMode] = useState<Mode>('mois')
  const [offset, setOffset] = useState(0)
  const [customAStart, setCustomAStart] = useState('')
  const [customAEnd, setCustomAEnd] = useState('')
  const [customBStart, setCustomBStart] = useState('')
  const [customBEnd, setCustomBEnd] = useState('')
  const [data, setData] = useState<PeriodComparison | null>(null)
  const [loading, setLoading] = useState(false)

  const periodA = mode === 'mois' ? monthBounds(offset - 1) : mode === 'annee' ? yearBounds(offset - 1) : null
  const periodB = mode === 'mois' ? monthBounds(offset) : mode === 'annee' ? yearBounds(offset) : null

  const aStart = mode === 'custom' ? customAStart : periodA?.start
  const aEnd = mode === 'custom' ? customAEnd : periodA?.end
  const bStart = mode === 'custom' ? customBStart : periodB?.start
  const bEnd = mode === 'custom' ? customBEnd : periodB?.end

  useEffect(() => {
    if (!aStart || !aEnd || !bStart || !bEnd) { setData(null); return }
    setLoading(true)
    window.api.comparePeriods(aStart, aEnd, bStart, bEnd).then((res) => {
      setData(res)
      setLoading(false)
    })
  }, [aStart, aEnd, bStart, bEnd])

  const modeBar = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {([
        { key: 'mois', label: 'Mois vs mois précédent' },
        { key: 'annee', label: 'Année vs année précédente' },
        { key: 'custom', label: 'Personnalisé' }
      ] as { key: Mode; label: string }[]).map((m) => (
        <button
          key={m.key}
          onClick={() => { setMode(m.key); setOffset(0) }}
          style={{
            padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: mode === m.key ? 600 : 400,
            background: mode === m.key ? 'var(--accent)' : 'var(--bg3)',
            color: mode === m.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s'
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  )

  const total = data ? data.categories.reduce((s, c) => s + c.totalB, 0) : 0
  const totalPrev = data ? data.categories.reduce((s, c) => s + c.totalA, 0) : 0
  const totalDiff = total - totalPrev
  const totalPct = totalPrev > 0 ? (totalDiff / totalPrev) * 100 : null

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Comparer deux périodes</h1>
        {modeBar}
      </div>

      {(mode === 'mois' || mode === 'annee') && periodA && periodB && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button
            onClick={() => setOffset((o) => o - 1)}
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 14 }}
          >‹</button>
          <span style={{ fontSize: 14 }}>
            <strong>{periodB.label}</strong> <span style={{ color: 'var(--text2)' }}>vs</span> <strong>{periodA.label}</strong>
          </span>
          <button
            onClick={() => setOffset((o) => o + 1)}
            disabled={offset >= 0}
            style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: offset >= 0 ? 'default' : 'pointer', background: 'var(--bg3)', color: offset >= 0 ? 'var(--border)' : 'var(--text2)', fontSize: 14 }}
          >›</button>
        </div>
      )}

      {mode === 'custom' && (
        <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Période A</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customAStart} onChange={(e) => setCustomAStart(e.target.value)} style={{ width: 140 }} />
              <span style={{ color: 'var(--text3)' }}>→</span>
              <input type="date" value={customAEnd} onChange={(e) => setCustomAEnd(e.target.value)} style={{ width: 140 }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>Période B</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="date" value={customBStart} onChange={(e) => setCustomBStart(e.target.value)} style={{ width: 140 }} />
              <span style={{ color: 'var(--text3)' }}>→</span>
              <input type="date" value={customBEnd} onChange={(e) => setCustomBEnd(e.target.value)} style={{ width: 140 }} />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      ) : !data || (mode === 'custom' && (!aStart || !aEnd || !bStart || !bEnd)) ? (
        <div className="empty-state"><p className="text-muted">Choisissez deux périodes à comparer.</p></div>
      ) : data.categories.length === 0 ? (
        <div className="empty-state"><p className="text-muted">Aucune dépense sur ces périodes.</p></div>
      ) : (
        <>
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="card">
              <div className="card-title">Dépenses — période A</div>
              <div className="card-value">{formatEur(totalPrev)}</div>
              <div className="text-muted text-sm" style={{ marginTop: 6 }}>{data.periodA.startDate} → {data.periodA.endDate}</div>
            </div>
            <div className="card">
              <div className="card-title">Dépenses — période B</div>
              <div className="card-value">{formatEur(total)}</div>
              <div className="text-muted text-sm" style={{ marginTop: 6 }}>{data.periodB.startDate} → {data.periodB.endDate}</div>
            </div>
            <div className="card">
              <div className="card-title">Écart</div>
              <div className={`card-value ${totalDiff > 0 ? 'negative' : totalDiff < 0 ? 'positive' : ''}`}>
                {totalDiff >= 0 ? '+' : ''}{formatEur(totalDiff)}
              </div>
              {totalPct !== null && (
                <div className="text-muted text-sm" style={{ marginTop: 6 }}>
                  {totalDiff >= 0 ? '+' : ''}{totalPct.toFixed(1)} %
                </div>
              )}
            </div>
          </div>

          <div className="card-title" style={{ marginBottom: 12 }}>Écart par catégorie</div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Catégorie</th>
                  <th style={{ textAlign: 'right' }}>Période A</th>
                  <th style={{ textAlign: 'right' }}>Période B</th>
                  <th style={{ textAlign: 'right' }}>Écart</th>
                  <th style={{ textAlign: 'right' }}>%</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.category}>
                    <td>{c.category}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{formatEur(c.totalA)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text2)' }}>{formatEur(c.totalB)}</td>
                    <td style={{ textAlign: 'right' }} className={c.diff > 0 ? 'amount-negative' : c.diff < 0 ? 'amount-positive' : undefined}>
                      {c.diff >= 0 ? '+' : ''}{formatEur(c.diff)}
                    </td>
                    <td style={{ textAlign: 'right', color: c.diff > 0 ? 'var(--red)' : c.diff < 0 ? 'var(--green)' : 'var(--text3)' }}>
                      {c.pct !== null ? `${c.diff >= 0 ? '+' : ''}${c.pct.toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
