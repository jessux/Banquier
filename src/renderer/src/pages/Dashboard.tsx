import { useEffect, useRef, useState } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'
import type { DashboardSummary, CategoryStatsGrouped } from '../../../shared/types'

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

function PieTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { subcategories: { category: string; total: number }[] } }[] }) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const subs = item.payload.subcategories ?? []
  return (
    <div style={{ background: '#1a1d27', border: '1px solid #2e3147', borderRadius: 6, padding: '10px 14px', minWidth: 180 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: subs.length ? 8 : 0, color: '#e2e8f0' }}>
        {item.name} — {item.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
      </div>
      {subs.map((s) => (
        <div key={s.category} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 12, color: '#94a3b8', paddingLeft: 8 }}>
          <span>{s.category}</span>
          <span>{s.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>
        </div>
      ))}
    </div>
  )
}

type Period = 'mois' | '3m' | '6m' | '1a' | 'tout' | 'custom'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'mois',   label: 'Ce mois'     },
  { key: '3m',     label: '3 mois'      },
  { key: '6m',     label: '6 mois'      },
  { key: '1a',     label: '1 an'        },
  { key: 'tout',   label: 'Tout'        },
  { key: 'custom', label: 'Personnalisé' }
]

const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']

function periodDates(p: Period, customStart?: string, customEnd?: string, monthOffset = 0): { startDate?: string; endDate?: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  switch (p) {
    case 'mois': {
      const y = today.getFullYear(), m = today.getMonth() + monthOffset
      const start = new Date(y, m, 1)
      const end = new Date(y, m + 1, 0)
      const isCurrentMonth = monthOffset === 0
      return { startDate: fmt(start), endDate: fmt(isCurrentMonth ? today : end) }
    }
    case '3m': { const s = new Date(today); s.setMonth(s.getMonth() - 3); return { startDate: fmt(s), endDate: fmt(today) } }
    case '6m': { const s = new Date(today); s.setMonth(s.getMonth() - 6); return { startDate: fmt(s), endDate: fmt(today) } }
    case '1a': { const s = new Date(today); s.setFullYear(s.getFullYear() - 1); return { startDate: fmt(s), endDate: fmt(today) } }
    case 'tout': return {}
    case 'custom': return { startDate: customStart, endDate: customEnd }
  }
}

function monthLabel(offset: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + offset)
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

function periodComparisonLabel(p: Period): string {
  switch (p) {
    case 'mois':   return 'vs mois précédent'
    case '3m':     return 'vs 3 mois précédents'
    case '6m':     return 'vs 6 mois précédents'
    case '1a':     return 'vs année précédente'
    case 'tout':   return ''
    case 'custom': return ''
  }
}

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function pct(current: number, previous: number): string {
  if (previous === 0) return ''
  const diff = ((current - previous) / previous) * 100
  const sign = diff >= 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}

export default function Dashboard(): JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('mois')
  const [monthOffset, setMonthOffset] = useState(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set())
  const [showCatFilter, setShowCatFilter] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    window.api.getCategories().then(setAllCategories)
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowCatFilter(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    const { startDate, endDate } = periodDates(period, customStart, customEnd, monthOffset)
    const excl = excludedCats.size > 0 ? Array.from(excludedCats) : undefined
    window.api.getDashboardSummary(startDate, endDate, excl).then((s) => {
      setSummary(s)
      setLoading(false)
    })
  }, [period, monthOffset, customStart, customEnd, excludedCats])

  const toggleCat = (cat: string) => {
    setExcludedCats((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  const arrowBtn = (dir: -1 | 1) => (
    <button
      onClick={() => setMonthOffset((o) => o + dir)}
      disabled={dir === 1 && monthOffset >= 0}
      style={{
        width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: dir === 1 && monthOffset >= 0 ? 'default' : 'pointer',
        background: '#242736', color: dir === 1 && monthOffset >= 0 ? '#3e4259' : '#94a3b8',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
        transition: 'all 0.15s'
      }}
    >
      {dir === -1 ? '‹' : '›'}
    </button>
  )

  const periodBar = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => { setPeriod(p.key); if (p.key !== 'mois') setMonthOffset(0) }}
          style={{
            padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: period === p.key ? 600 : 400,
            background: period === p.key ? '#6366f1' : '#242736',
            color: period === p.key ? '#fff' : '#94a3b8', transition: 'all 0.15s'
          }}
        >
          {p.label}
        </button>
      ))}

      {period === 'mois' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, background: '#1a1d27', borderRadius: 20, padding: '3px 8px' }}>
          {arrowBtn(-1)}
          <span style={{ fontSize: 13, color: '#e2e8f0', minWidth: 110, textAlign: 'center', fontWeight: 500 }}>
            {monthLabel(monthOffset)}
          </span>
          {arrowBtn(1)}
        </div>
      )}

      {period === 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }}>
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: 6, border: '1px solid #2e3147',
              background: '#1a1d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer'
            }}
          />
          <span style={{ color: '#64748b', fontSize: 13 }}>→</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => setCustomEnd(e.target.value)}
            style={{
              padding: '4px 8px', borderRadius: 6, border: '1px solid #2e3147',
              background: '#1a1d27', color: '#e2e8f0', fontSize: 13, cursor: 'pointer'
            }}
          />
        </div>
      )}

      <div style={{ position: 'relative' }} ref={filterRef}>
        <button
          onClick={() => setShowCatFilter((v) => !v)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, background: excludedCats.size > 0 ? '#2e3147' : '#242736',
            color: excludedCats.size > 0 ? '#f59e0b' : '#94a3b8', transition: 'all 0.15s'
          }}
        >
          {excludedCats.size > 0 ? `Exclure (${excludedCats.size})` : 'Exclure ▾'}
        </button>

        {showCatFilter && allCategories.length > 0 && (
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)',
            background: '#1a1d27', border: '1px solid #2e3147', borderRadius: 8,
            padding: '8px 0', zIndex: 200, minWidth: 220
          }}>
            <div style={{ padding: '0 12px 6px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Exclure du calcul
            </div>
            {allCategories.map((cat) => (
              <label
                key={cat}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px', cursor: 'pointer',
                  opacity: excludedCats.has(cat) ? 0.45 : 1
                }}
              >
                <input
                  type="checkbox"
                  checked={!excludedCats.has(cat)}
                  onChange={() => toggleCat(cat)}
                  style={{ accentColor: '#6366f1' }}
                />
                <span style={{ fontSize: 13 }}>{cat}</span>
              </label>
            ))}
            {excludedCats.size > 0 && (
              <div style={{ padding: '8px 16px 4px', borderTop: '1px solid #2e3147', marginTop: 4 }}>
                <button
                  onClick={() => setExcludedCats(new Set())}
                  style={{
                    width: '100%', padding: '5px 0', borderRadius: 6, border: 'none',
                    background: '#2e3147', color: '#94a3b8', cursor: 'pointer', fontSize: 12
                  }}
                >
                  Tout réactiver
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Tableau de bord</h1>{periodBar}</div>
        <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      </div>
    )
  }

  if (!summary || summary.totalTransactions === 0) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Tableau de bord</h1>{periodBar}</div>
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16 }}>📥</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Aucune transaction</p>
          <p className="text-muted">Importez vos relevés pour commencer l'analyse.</p>
        </div>
      </div>
    )
  }

  const cmpLabel = periodComparisonLabel(period)
  const variation = pct(summary.periodDebit, summary.previousPeriodDebit)
  const variationColor = summary.periodDebit > summary.previousPeriodDebit ? '#ef4444' : '#22c55e'

  const trendData = summary.monthlyTrend.map((m) => ({
    name: m.month.slice(5),
    Dépenses: Math.round(m.total_debit),
    Revenus: Math.round(m.total_credit)
  }))

  const pieData = summary.topCategories.slice(0, 5).map((c) => ({
    name: c.category,
    value: Math.round(c.total),
    subcategories: c.subcategories
  }))

  const tooltipStyle = {
    contentStyle: { background: '#1a1d27', border: '1px solid #2e3147', borderRadius: 6 },
    labelStyle: { color: '#e2e8f0' },
    itemStyle: { color: '#e2e8f0' }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Tableau de bord</h1>
        {periodBar}
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Dépenses</div>
          <div className="card-value negative">{formatEur(summary.periodDebit)}</div>
          {variation && cmpLabel && (
            <div style={{ color: variationColor, fontSize: 12, marginTop: 6 }}>
              {variation} {cmpLabel}
            </div>
          )}
        </div>
        <div className="card">
          <div className="card-title">Revenus</div>
          <div className="card-value positive">{formatEur(summary.periodCredit)}</div>
        </div>
        <div className="card">
          <div className="card-title">Solde estimé</div>
          <div className={`card-value ${summary.periodCredit - summary.periodDebit >= 0 ? 'positive' : 'negative'}`}>
            {formatEur(summary.periodCredit - summary.periodDebit)}
          </div>
          <div className="text-muted text-sm" style={{ marginTop: 6 }}>
            {summary.totalTransactions} transactions au total
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Tendance sur 6 mois</div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2e3147" />
              <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Dépenses" stroke="#ef4444" fill="url(#depGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="Revenus" stroke="#22c55e" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>Répartition par catégorie</div>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: 24 }}>
              <p className="text-muted">Catégorisez vos transactions pour voir la répartition.</p>
            </div>
          )}
        </div>
      </div>

      {summary.topCategories.length > 0 && (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Catégories</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {summary.topCategories.map((c, i) => {
              const max = summary.topCategories[0].total
              return (
                <div key={c.category}>
                  <div className="flex justify-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{c.category}</span>
                    <span className="amount-negative">{formatEur(c.total)}</span>
                  </div>
                  <div style={{ background: '#242736', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: c.subcategories.length ? 6 : 0 }}>
                    <div style={{ width: `${(c.total / max) * 100}%`, height: '100%', background: COLORS[i % COLORS.length], borderRadius: 4 }} />
                  </div>
                  {c.subcategories.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12, borderLeft: `2px solid ${COLORS[i % COLORS.length]}33` }}>
                      {c.subcategories.sort((a, b) => b.total - a.total).map((s) => (
                        <div key={s.category} className="flex justify-between" style={{ fontSize: 12, color: '#94a3b8' }}>
                          <span>{s.category}</span>
                          <span>{formatEur(s.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
