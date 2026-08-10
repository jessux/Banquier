import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import type { Account, RecurringExpense, RecurringSummary } from '../../../shared/types'

type Horizon = 3 | 6 | 12

const HORIZONS: { key: Horizon; label: string }[] = [
  { key: 3, label: '3 mois' },
  { key: 6, label: '6 mois' },
  { key: 12, label: '12 mois' }
]

const DAY_MS = 86400_000

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface ProjectedEvent {
  date: Date
  merchant: string
  category: string | null
  amount: number // signé : positif = revenu, négatif = dépense
}

/** Projette les occurrences futures d'une récurrence active, au pas de son intervalle médian, jusqu'à la date horizon. */
function projectOccurrences(item: RecurringExpense, sign: 1 | -1, horizonDate: Date): ProjectedEvent[] {
  const events: ProjectedEvent[] = []
  let next = new Date(new Date(item.lastDate).getTime() + item.intervalDays * DAY_MS)
  let guard = 0
  while (next <= horizonDate && guard < 1000) {
    events.push({ date: new Date(next), merchant: item.merchant, category: item.category, amount: sign * item.averageAmount })
    next = new Date(next.getTime() + item.intervalDays * DAY_MS)
    guard++
  }
  return events
}

export default function Previsionnel(): JSX.Element {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [expenses, setExpenses] = useState<RecurringSummary | null>(null)
  const [income, setIncome] = useState<RecurringSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [horizon, setHorizon] = useState<Horizon>(6)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      window.api.getAccounts(),
      window.api.getRecurringExpenses(),
      window.api.getRecurringIncome()
    ]).then(([a, e, i]) => {
      setAccounts(a)
      setExpenses(e)
      setIncome(i)
      setLoading(false)
    })
  }, [])

  const knownAccounts = accounts.filter((a) => a.balance != null)
  const currentBalance = knownAccounts.reduce((s, a) => s + (a.balance ?? 0) * a.fx_rate, 0)
  const hasUnknownBalance = knownAccounts.length < accounts.length

  const { events, chartData, projectedBalance } = useMemo(() => {
    if (!expenses || !income) return { events: [] as ProjectedEvent[], chartData: [] as { date: string; balance: number }[], projectedBalance: currentBalance }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const horizonDate = new Date(today.getTime() + horizon * 30 * DAY_MS)

    const evts: ProjectedEvent[] = []
    for (const item of expenses.items) if (item.active) evts.push(...projectOccurrences(item, -1, horizonDate))
    for (const item of income.items) if (item.active) evts.push(...projectOccurrences(item, 1, horizonDate))
    evts.sort((a, b) => a.date.getTime() - b.date.getTime())

    const chart: { date: string; balance: number }[] = [{ date: today.toISOString().slice(0, 10), balance: currentBalance }]
    let running = currentBalance
    for (const e of evts) {
      running += e.amount
      chart.push({ date: e.date.toISOString().slice(0, 10), balance: parseFloat(running.toFixed(2)) })
    }
    if (evts.length === 0) chart.push({ date: horizonDate.toISOString().slice(0, 10), balance: currentBalance })

    return { events: evts, chartData: chart, projectedBalance: running }
  }, [expenses, income, horizon, currentBalance])

  const netMonthlyFlow = (income?.totalMonthlyActive ?? 0) - (expenses?.totalMonthlyActive ?? 0)

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Prévisionnel de trésorerie</h1></div>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">Chargement…</p>
        </div>
      </div>
    )
  }

  if (knownAccounts.length === 0) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Prévisionnel de trésorerie</h1></div>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p className="text-muted">
            Aucun solde de compte connu — le prévisionnel a besoin d'au moins un solde (synchronisé via Powens, ou saisi manuellement dans Paramètres) pour projeter votre trésorerie.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Prévisionnel de trésorerie</h1>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {HORIZONS.map((h) => (
          <button
            key={h.key}
            className={`btn ${horizon === h.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setHorizon(h.key)}
          >
            {h.label}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-muted text-sm">Solde actuel</span>
              <span style={{ fontWeight: 600 }}>{formatEur(currentBalance)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-muted text-sm">Flux récurrent net</span>
              <span style={{ fontWeight: 600, color: netMonthlyFlow >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {netMonthlyFlow >= 0 ? '+' : ''}{formatEur(netMonthlyFlow)}/mois
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <span className="text-muted text-sm">Solde projeté ({horizon} mois)</span>
              <span style={{ fontWeight: 700, fontSize: 18, color: projectedBalance >= currentBalance ? 'var(--green)' : 'var(--red)' }}>
                {formatEur(projectedBalance)}
              </span>
            </div>
          </div>
        </div>

        <div className="card" style={{ textAlign: 'center', padding: 28 }}>
          <div className="text-muted text-sm">Échéances récurrentes projetées</div>
          <div style={{ fontSize: 36, fontWeight: 700, color: 'var(--accent)', margin: '10px 0 4px' }}>
            {events.length}
          </div>
          <div className="text-muted text-sm">
            sur les {horizon} prochains mois
          </div>
        </div>
      </div>

      {hasUnknownBalance && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            ⚠️ Certains comptes n'ont pas de solde connu (comptes ajoutés manuellement sans synchronisation) — ils ne sont pas inclus dans le solde de départ.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>Évolution projetée du solde</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="previGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--text2)' }}
              tickFormatter={(v) => formatDate(new Date(v))}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--text2)' }}
              tickFormatter={(v) => formatEur(v)}
              width={95}
            />
            <Tooltip
              formatter={(v: number) => [formatEur(v), 'Solde projeté']}
              labelFormatter={(v) => formatDate(new Date(v))}
            />
            <Area type="stepAfter" dataKey="balance" stroke="var(--accent)" fill="url(#previGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 12 }}>Prochaines échéances récurrentes</div>
        {events.length === 0 ? (
          <p className="text-muted text-sm">Aucune récurrence active détectée pour projeter une échéance.</p>
        ) : (
          <div className="table-wrapper" style={{ border: 'none' }}>
            <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse', minWidth: 520 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text2)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Date</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Marchand</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Catégorie</th>
                  <th style={{ padding: '6px 8px', fontWeight: 500 }}>Montant</th>
                </tr>
              </thead>
              <tbody>
                {events.slice(0, 60).map((e, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 8px' }}>{formatDate(e.date)}</td>
                    <td style={{ padding: '6px 8px' }}>{e.merchant}</td>
                    <td style={{ padding: '6px 8px' }}>
                      {e.category ? <span className="category-badge">{e.category}</span> : <span className="text-muted text-sm">—</span>}
                    </td>
                    <td style={{ padding: '6px 8px', fontWeight: 600, color: e.amount >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {e.amount >= 0 ? '+' : ''}{formatEur(e.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {events.length > 60 && (
              <p className="text-muted text-sm" style={{ marginTop: 8, textAlign: 'center' }}>
                … et {events.length - 60} échéances supplémentaires
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-muted text-sm" style={{ marginTop: 16, textAlign: 'center' }}>
        Projection basée uniquement sur les revenus et dépenses récurrents détectés — les dépenses ponctuelles ne sont pas prises en compte.
      </p>
    </div>
  )
}
