import { useEffect, useState } from 'react'
import type { RecurringSummary, RecurringExpense, RecurringFrequency } from '../../../shared/types'

type Window = '6m' | '1a' | '2a' | 'tout'

const WINDOWS: { key: Window; label: string }[] = [
  { key: '6m',   label: '6 mois' },
  { key: '1a',   label: '1 an'   },
  { key: '2a',   label: '2 ans'  },
  { key: 'tout', label: 'Tout'   }
]

const FREQ_LABEL: Record<RecurringFrequency, string> = {
  hebdomadaire: 'Hebdomadaire',
  mensuel: 'Mensuel',
  bimestriel: 'Bimestriel',
  trimestriel: 'Trimestriel',
  semestriel: 'Semestriel',
  annuel: 'Annuel'
}

function windowStartDate(w: Window): string | undefined {
  if (w === 'tout') return undefined
  const d = new Date()
  if (w === '6m') d.setMonth(d.getMonth() - 6)
  else if (w === '1a') d.setFullYear(d.getFullYear() - 1)
  else if (w === '2a') d.setFullYear(d.getFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

function formatEur(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

const DAY_MS = 86400_000

/** Prochaine échéance estimée : dernier paiement + intervalle médian observé entre deux paiements. */
function nextDueDate(item: RecurringExpense): Date {
  return new Date(new Date(item.lastDate).getTime() + item.intervalDays * DAY_MS)
}

function daysUntil(d: Date): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / DAY_MS)
}

function dueLabel(days: number): string {
  if (days < 0) return `en retard de ${Math.abs(days)} j`
  if (days === 0) return "aujourd'hui"
  if (days === 1) return 'demain'
  return `dans ${days} j`
}

export default function Recurring(): JSX.Element {
  const [data, setData] = useState<RecurringSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [win, setWin] = useState<Window>('1a')
  const [showInactive, setShowInactive] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    window.api.getRecurringExpenses(windowStartDate(win)).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [win])

  const windowBar = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {WINDOWS.map((w) => (
        <button
          key={w.key}
          onClick={() => setWin(w.key)}
          style={{
            padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: win === w.key ? 600 : 400,
            background: win === w.key ? 'var(--accent)' : 'var(--bg3)',
            color: win === w.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s'
          }}
        >
          {w.label}
        </button>
      ))}
    </div>
  )

  if (loading) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Récurrences</h1>{windowBar}</div>
        <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Récurrences</h1>{windowBar}</div>
        <div className="empty-state">
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔁</div>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Aucune dépense récurrente détectée</p>
          <p className="text-muted">
            Il faut au moins 3 paiements réguliers chez un même marchand sur la période.
          </p>
        </div>
      </div>
    )
  }

  const visible = data.items.filter((i) => showInactive || i.active)
  const activeCount = data.items.filter((i) => i.active).length
  const upcoming = data.items
    .filter((i) => i.active)
    .map((i) => ({ item: i, next: nextDueDate(i) }))
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Récurrences</h1>
        {windowBar}
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">Coût mensuel récurrent</div>
          <div className="card-value negative">{formatEur(data.totalMonthlyActive)}</div>
          <div className="text-muted text-sm" style={{ marginTop: 6 }}>
            {activeCount} abonnement{activeCount > 1 ? 's' : ''} actif{activeCount > 1 ? 's' : ''}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Coût annuel récurrent</div>
          <div className="card-value negative">{formatEur(data.totalYearlyActive)}</div>
        </div>
        <div className="card">
          <div className="card-title">Récurrences détectées</div>
          <div className="card-value">{data.items.length}</div>
          <div className="text-muted text-sm" style={{ marginTop: 6 }}>
            {data.items.length - activeCount} probablement résilié{data.items.length - activeCount > 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">Prochaines échéances estimées</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
            {upcoming.map(({ item, next }) => {
              const days = daysUntil(next)
              const soon = days <= 3
              return (
                <div key={item.merchant} className="flex justify-between" style={{ alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{item.merchant}</span>
                    {item.category && <span className="category-badge">{item.category}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="amount-negative" style={{ fontSize: 13 }}>{formatEur(item.averageAmount)}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                      color: soon ? 'var(--yellow)' : 'var(--text2)',
                      background: soon ? 'rgba(245,158,11,0.12)' : 'var(--bg3)'
                    }}>
                      {dueLabel(days)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex justify-between" style={{ alignItems: 'center', marginBottom: 12 }}>
        <div className="card-title">Détail des récurrences</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            style={{ accentColor: 'var(--accent)' }}
          />
          Afficher les inactives
        </label>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Marchand</th>
              <th>Fréquence</th>
              <th>Catégorie</th>
              <th style={{ textAlign: 'right' }}>Montant moyen</th>
              <th style={{ textAlign: 'right' }}>Coût mensuel</th>
              <th>Dernier paiement</th>
              <th>Prochaine échéance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <RecurringRow
                key={item.merchant}
                item={item}
                expanded={expanded === item.merchant}
                onToggle={() => setExpanded(expanded === item.merchant ? null : item.merchant)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RecurringRow({
  item,
  expanded,
  onToggle
}: {
  item: RecurringExpense
  expanded: boolean
  onToggle: () => void
}): JSX.Element {
  return (
    <>
      <tr onClick={onToggle} style={{ cursor: 'pointer', opacity: item.active ? 1 : 0.55 }}>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text3)', width: 10 }}>{expanded ? '▾' : '▸'}</span>
            <span style={{ fontWeight: 600 }}>{item.merchant}</span>
            {!item.active && <span className="badge badge-warning">résilié ?</span>}
          </div>
          <div className="text-muted text-sm" style={{ marginLeft: 18 }}>
            {item.occurrences} paiements · tous les ~{item.intervalDays} j
          </div>
        </td>
        <td>{FREQ_LABEL[item.frequency]}</td>
        <td>
          {item.category
            ? <span className="category-badge">{item.category}</span>
            : <span className="text-muted text-sm">—</span>}
        </td>
        <td style={{ textAlign: 'right' }} className="amount-negative">{formatEur(item.averageAmount)}</td>
        <td style={{ textAlign: 'right' }} className="amount-negative">{formatEur(item.monthlyEstimate)}</td>
        <td>{formatDate(item.lastDate)}</td>
        <td>
          {item.active ? (() => {
            const days = daysUntil(nextDueDate(item))
            return (
              <span style={{ fontSize: 12, color: days <= 3 ? 'var(--yellow)' : 'var(--text2)' }}>
                {dueLabel(days)}
              </span>
            )
          })() : <span className="text-muted text-sm">—</span>}
        </td>
        <td></td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} style={{ background: 'var(--bg)', padding: '12px 16px 16px 32px' }}>
            <div className="text-muted text-sm" style={{ marginBottom: 8 }}>
              Coût annuel estimé : <span className="amount-negative">{formatEur(item.yearlyEstimate)}</span>
              {' · '}depuis le {formatDate(item.firstDate)}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {item.transactions.map((t) => (
                <div key={t.id} className="flex justify-between" style={{ fontSize: 13 }}>
                  <span style={{ color: 'var(--text2)' }}>{formatDate(t.date)}</span>
                  <span style={{ flex: 1, margin: '0 16px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.description}
                  </span>
                  <span className="amount-negative">{formatEur(Math.abs(t.amount))}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
