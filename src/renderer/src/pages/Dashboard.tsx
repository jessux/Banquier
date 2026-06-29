import { useEffect, useState } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea
} from 'recharts'
import type { DashboardSummary, CategoryStatsGrouped, BudgetWithSpent } from '../../../shared/types'
import type { Page } from '../App'

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
type CatView = 'depenses' | 'combined' | 'revenus'

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

const MONTH_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']

function monthTick(monthKey: string): string {
  const [y, m] = monthKey.split('-')
  return `${MONTH_SHORT[parseInt(m, 10) - 1]}-${y.slice(2)}`
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

export default function Dashboard({ onNavigate }: { onNavigate?: (page: Page) => void }): JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('mois')
  const [monthOffset, setMonthOffset] = useState(0)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set())
  const [hoveredCat, setHoveredCat] = useState<string | null>(null)
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([])
  const [catView, setCatView] = useState<CatView>('depenses')

  useEffect(() => {
    if (period === 'custom' && (!customStart || !customEnd)) return
    setLoading(true)
    const { startDate, endDate } = periodDates(period, customStart, customEnd, monthOffset)
    const excl = excludedCats.size > 0 ? Array.from(excludedCats) : undefined
    Promise.all([
      window.api.getDashboardSummary(startDate, endDate, excl),
      window.api.getBudgetsWithSpent(startDate, endDate)
    ]).then(([s, b]) => {
      setSummary(s as DashboardSummary)
      setBudgets(b as BudgetWithSpent[])
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
    month: m.month,
    Dépenses: Math.round(m.total_debit),
    Revenus: Math.round(m.total_credit)
  }))

  // Bande « période observée » : on borne le surlignage aux mois réellement
  // présents dans la tendance (un mois sans transaction n'est pas tracé).
  const trendKeys = trendData.map((d) => d.month)
  const inWindow = (k: string | null): boolean => !!k && k >= trendKeys[0] && k <= trendKeys[trendKeys.length - 1]
  const hlStart = inWindow(summary.trendHighlightStart)
    ? trendKeys.find((k) => k >= summary.trendHighlightStart!)
    : undefined
  const hlEnd = inWindow(summary.trendHighlightEnd)
    ? [...trendKeys].reverse().find((k) => k <= summary.trendHighlightEnd!)
    : undefined
  const showHighlight = trendKeys.length > 0 && hlStart !== undefined && hlEnd !== undefined

  const trendSpan = trendKeys.length
    ? (() => {
        const [ys, ms] = trendKeys[0].split('-').map(Number)
        const [ye, me] = trendKeys[trendKeys.length - 1].split('-').map(Number)
        return (ye - ys) * 12 + (me - ms) + 1
      })()
    : 6

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

      {excludedCats.size > 0 && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: '#64748b', flexShrink: 0 }}>Exclu du calcul :</span>
          {Array.from(excludedCats).map((cat) => (
            <button
              key={cat}
              onClick={() => toggleCat(cat)}
              title="Cliquer pour réactiver"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '3px 10px 3px 12px', borderRadius: 20,
                border: '1px solid #f59e0b44', background: '#f59e0b18',
                color: '#f59e0b', cursor: 'pointer', fontSize: 12, fontWeight: 500
              }}
            >
              {cat}
              <span style={{ fontSize: 14, lineHeight: 1, opacity: 0.7 }}>×</span>
            </button>
          ))}
          <button
            onClick={() => setExcludedCats(new Set())}
            style={{
              padding: '3px 10px', borderRadius: 20, border: 'none',
              background: '#2e3147', color: '#94a3b8', cursor: 'pointer', fontSize: 12
            }}
          >
            Tout réactiver
          </button>
        </div>
      )}

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
          <div className="flex justify-between" style={{ alignItems: 'baseline', marginBottom: 16 }}>
            <div className="card-title">Tendance sur {trendSpan} mois</div>
            {showHighlight && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94a3b8' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: '#6366f1', opacity: 0.25, border: '1px solid #6366f1' }} />
                Période observée
              </div>
            )}
          </div>
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
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={monthTick} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}€`} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => formatEur(v)} labelFormatter={monthTick} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {showHighlight && (
                <ReferenceArea
                  x1={hlStart} x2={hlEnd}
                  fill="#6366f1" fillOpacity={0.12}
                  stroke="#6366f1" strokeOpacity={0.4} strokeDasharray="3 3"
                  ifOverflow="extendDomain"
                />
              )}
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

      {(summary.topCategories.length > 0 || summary.topIncomeCategories.length > 0) && (() => {
        const depItems = summary.topCategories
        const revItems = summary.topIncomeCategories

        // Combined: net balance per category (revenus − dépenses)
        const netMap = new Map<string, { income: number; expense: number; subcategories: typeof depItems[0]['subcategories'] }>()
        for (const c of depItems) {
          const e = netMap.get(c.category) ?? { income: 0, expense: 0, subcategories: c.subcategories }
          netMap.set(c.category, { ...e, expense: c.total, subcategories: c.subcategories })
        }
        for (const c of revItems) {
          const e = netMap.get(c.category) ?? { income: 0, expense: 0, subcategories: c.subcategories }
          netMap.set(c.category, { ...e, income: c.total })
        }
        const netItems = Array.from(netMap.entries())
          .map(([cat, d]) => ({ category: cat, net: d.income - d.expense, income: d.income, expense: d.expense, subcategories: d.subcategories }))
          .sort((a, b) => b.net - a.net)

        const depWithColor = depItems.map((c, i) => ({ ...c, catType: 'depense' as const, color: COLORS[i % COLORS.length] }))
        const revWithColor = revItems.map(c => ({ ...c, catType: 'revenu' as const, color: '#22c55e' }))

        return (
          <div className="card" style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title" style={{
                marginBottom: 0,
                color: catView === 'depenses' ? '#ef4444' : catView === 'revenus' ? '#22c55e' : undefined
              }}>
                {catView === 'depenses' ? 'Dépenses par catégorie' : catView === 'revenus' ? 'Revenus par catégorie' : 'Solde net par catégorie'}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['depenses', 'combined', 'revenus'] as CatView[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setCatView(v)}
                    style={{
                      padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      fontSize: 12, fontWeight: catView === v ? 600 : 400,
                      background: catView === v
                        ? (v === 'depenses' ? '#ef444420' : v === 'revenus' ? '#22c55e20' : '#6366f120')
                        : '#242736',
                      color: catView === v
                        ? (v === 'depenses' ? '#ef4444' : v === 'revenus' ? '#22c55e' : '#6366f1')
                        : '#94a3b8',
                      transition: 'all 0.15s'
                    }}
                  >
                    {v === 'depenses' ? 'Dépenses' : v === 'revenus' ? 'Revenus' : 'Combiné'}
                  </button>
                ))}
              </div>
            </div>

            {catView === 'combined' ? (
              netItems.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>Aucune donnée.</p>
              ) : (() => {
                const maxAbs = Math.max(...netItems.map(c => Math.abs(c.net)), 1)
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {netItems.map((c) => {
                      const isPos = c.net >= 0
                      const color = isPos ? '#22c55e' : '#ef4444'
                      const isHovered = hoveredCat === `net/${c.category}`
                      return (
                        <div key={c.category}>
                          <div
                            className="flex justify-between"
                            onClick={() => toggleCat(c.category)}
                            onMouseEnter={() => setHoveredCat(`net/${c.category}`)}
                            onMouseLeave={() => setHoveredCat(null)}
                            style={{ marginBottom: 4, cursor: 'pointer', borderRadius: 4, padding: '2px 4px', marginLeft: -4, background: isHovered ? '#2e314733' : 'transparent', transition: 'background 0.15s' }}
                            title="Cliquer pour exclure du calcul"
                          >
                            <span style={{ fontSize: 13, fontWeight: 600 }}>{c.category}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, color: '#475569', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>exclure ×</span>
                              {(c.income > 0 || c.expense > 0) && (
                                <span style={{ fontSize: 11, color: '#64748b' }}>
                                  {c.income > 0 && `+${formatEur(c.income)}`}{c.income > 0 && c.expense > 0 && ' / '}{c.expense > 0 && `-${formatEur(c.expense)}`}
                                </span>
                              )}
                              <span style={{ color, fontWeight: 600, fontSize: 13 }}>{isPos ? '+' : ''}{formatEur(c.net)}</span>
                            </div>
                          </div>
                          <div style={{ background: '#242736', borderRadius: 4, height: 6, overflow: 'hidden' }}>
                            <div style={{ width: `${(Math.abs(c.net) / maxAbs) * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
            ) : (() => {
              const activeItems = catView === 'depenses' ? depWithColor : revWithColor
              return activeItems.length === 0 ? (
                <p className="text-muted" style={{ fontSize: 13 }}>Aucune donnée pour cette vue.</p>
              ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {activeItems.map((c) => {
                  const max = activeItems[0]?.total ?? 1
                  const isExpense = c.catType === 'depense'
                  const isHovered = hoveredCat === `cat/${c.category}`
                  return (
                    <div key={`${c.catType}/${c.category}`}>
                      <div
                        className="flex justify-between"
                        onClick={() => toggleCat(c.category)}
                        onMouseEnter={() => setHoveredCat(`cat/${c.category}`)}
                        onMouseLeave={() => setHoveredCat(null)}
                        style={{ marginBottom: 4, cursor: 'pointer', borderRadius: 4, padding: '2px 4px', marginLeft: -4, background: isHovered ? '#2e314733' : 'transparent', transition: 'background 0.15s' }}
                        title="Cliquer pour exclure du calcul"
                      >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{c.category}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#64748b', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }}>exclure ×</span>
                          <span className={isExpense ? 'amount-negative' : 'amount-positive'}>{formatEur(c.total)}</span>
                        </div>
                      </div>
                      <div style={{ background: '#242736', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: c.subcategories.length ? 6 : 0 }}>
                        <div style={{ width: `${(c.total / max) * 100}%`, height: '100%', background: c.color, borderRadius: 4, transition: 'width 0.3s ease' }} />
                      </div>
                      {c.subcategories.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12, borderLeft: `2px solid ${c.color}33` }}>
                          {c.subcategories.sort((a, b) => b.total - a.total).map((s) => {
                            const isSubHovered = hoveredCat === `cat/${c.category}/${s.category}`
                            return (
                              <div
                                key={s.category}
                                className="flex justify-between"
                                onClick={() => toggleCat(`${c.category} > ${s.category}`)}
                                onMouseEnter={() => setHoveredCat(`cat/${c.category}/${s.category}`)}
                                onMouseLeave={() => setHoveredCat(null)}
                                style={{ fontSize: 12, color: '#94a3b8', cursor: 'pointer', borderRadius: 3, padding: '1px 4px', marginLeft: -4, background: isSubHovered ? '#2e314744' : 'transparent', transition: 'background 0.15s' }}
                                title="Cliquer pour exclure du calcul"
                              >
                                <span>{s.category}</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 10, color: '#475569', opacity: isSubHovered ? 1 : 0, transition: 'opacity 0.15s' }}>exclure ×</span>
                                  <span>{formatEur(s.total)}</span>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )})()}
          </div>
        )
      })()}

      {/* Widget budgets */}
      {budgets.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title">Budgets</div>
            {onNavigate && (
              <button
                onClick={() => onNavigate('budget')}
                style={{ fontSize: 12, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Gérer →
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {budgets.map((b) => {
              const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0
              const over = b.spent > b.amount
              const color = over ? '#ef4444' : pct > 80 ? '#f59e0b' : '#22c55e'
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 13, minWidth: 130, flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.category}</span>
                  <div style={{ flex: 1, background: '#242736', borderRadius: 6, height: 7, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.3s ease' }} />
                  </div>
                  <span style={{ fontSize: 12, color, minWidth: 36, textAlign: 'right', fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                  <span style={{ fontSize: 12, color: '#64748b', minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {formatEur(b.spent)} / {formatEur(b.amount)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
