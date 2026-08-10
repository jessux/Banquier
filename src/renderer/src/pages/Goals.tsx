import { useEffect, useState } from 'react'
import type { Account, SavingsGoalWithProgress } from '../../../shared/types'

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthsUntil(iso: string): number {
  const today = new Date()
  const target = new Date(iso)
  return (target.getFullYear() - today.getFullYear()) * 12 + (target.getMonth() - today.getMonth())
}

function dateLabel(iso: string): { text: string; late: boolean } {
  const m = monthsUntil(iso)
  if (m < 0) return { text: `échéance dépassée (${formatDate(iso)})`, late: true }
  if (m === 0) return { text: 'échéance ce mois-ci', late: false }
  if (m === 1) return { text: 'échéance dans 1 mois', late: false }
  return { text: `échéance dans ${m} mois`, late: false }
}

function ProgressBar({ pct }: { pct: number }): JSX.Element {
  const filled = Math.min(pct, 100)
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden', flex: 1 }}>
      <div style={{
        width: `${filled}%`, height: '100%', borderRadius: 6,
        background: pct >= 100 ? 'var(--green)' : 'var(--accent)',
        transition: 'width 0.4s ease'
      }} />
    </div>
  )
}

interface FormState {
  id: number | null
  name: string
  targetAmount: string
  targetDate: string
  accountId: string
}

const EMPTY_FORM: FormState = { id: null, name: '', targetAmount: '', targetDate: '', accountId: '' }

export default function Goals(): JSX.Element {
  const [goals, setGoals] = useState<SavingsGoalWithProgress[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState | null>(null)
  const [depositId, setDepositId] = useState<number | null>(null)
  const [depositAmt, setDepositAmt] = useState('')

  const load = (): void => {
    setLoading(true)
    Promise.all([window.api.getSavingsGoals(), window.api.getAccounts()]).then(([g, a]) => {
      setGoals(g)
      setAccounts(a)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const openCreate = (): void => setForm({ ...EMPTY_FORM })
  const openEdit = (g: SavingsGoalWithProgress): void => setForm({
    id: g.id,
    name: g.name,
    targetAmount: String(g.target_amount),
    targetDate: g.target_date ?? '',
    accountId: g.account_id != null ? String(g.account_id) : ''
  })

  const save = async (): Promise<void> => {
    if (!form) return
    const amount = parseFloat(form.targetAmount.replace(',', '.'))
    if (!form.name.trim() || isNaN(amount) || amount <= 0) return
    const accountId = form.accountId ? parseInt(form.accountId, 10) : null
    const targetDate = form.targetDate || null
    if (form.id == null) {
      await window.api.createSavingsGoal(form.name, amount, targetDate, accountId)
    } else {
      await window.api.updateSavingsGoal(form.id, form.name, amount, targetDate, accountId)
    }
    setForm(null)
    load()
  }

  const remove = async (id: number): Promise<void> => {
    await window.api.deleteSavingsGoal(id)
    load()
  }

  const saveDeposit = async (id: number): Promise<void> => {
    const amount = parseFloat(depositAmt.replace(',', '.'))
    if (isNaN(amount) || amount < 0) return
    await window.api.updateSavingsGoalAmount(id, amount)
    setDepositId(null)
    setDepositAmt('')
    load()
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="page-header">
        <h1 className="page-title">Objectifs d'épargne</h1>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Vos objectifs</h3>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={openCreate}>+ Nouvel objectif</button>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
        ) : goals.length === 0 ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>Aucun objectif défini</p>
            <p className="text-muted text-sm">Fixez un montant cible et suivez votre progression, liée à un compte ou saisie à la main.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={openCreate}>+ Créer mon premier objectif</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? (g.currentAmount / g.target_amount) * 100 : 0
              const reached = pct >= 100
              const due = g.target_date ? dateLabel(g.target_date) : null
              return (
                <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</span>
                      {g.accountName ? (
                        <span className="category-badge" style={{ marginLeft: 8 }}>{g.accountName}</span>
                      ) : (
                        <span className="text-muted text-sm" style={{ marginLeft: 8 }}>saisie manuelle</span>
                      )}
                      {due && (
                        <div className="text-muted text-sm" style={{ color: due.late ? 'var(--red)' : undefined, marginTop: 2 }}>
                          {due.text}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!g.accountName && (
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 10px', fontSize: 12 }}
                          onClick={() => { setDepositId(g.id); setDepositAmt(String(g.currentAmount)) }}
                        >
                          Mettre à jour
                        </button>
                      )}
                      <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => openEdit(g)}>Modifier</button>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '3px 8px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}
                        onClick={() => remove(g.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {depositId === g.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        autoFocus
                        type="number"
                        value={depositAmt}
                        onChange={(e) => setDepositAmt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveDeposit(g.id); if (e.key === 'Escape') setDepositId(null) }}
                        style={{ width: 110, padding: '3px 8px', fontSize: 13 }}
                        placeholder="Montant épargné"
                      />
                      <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => saveDeposit(g.id)}>OK</button>
                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setDepositId(null)}>✕</button>
                    </div>
                  ) : !g.balanceKnown ? (
                    <p className="text-muted text-sm" style={{ margin: 0 }}>Solde du compte lié inconnu — progression indisponible.</p>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <ProgressBar pct={pct} />
                      <span style={{ fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 130, textAlign: 'right', color: reached ? 'var(--green)' : 'var(--text)' }}>
                        {fmt(g.currentAmount)} / {fmt(g.target_amount)}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, minWidth: 40, textAlign: 'right', color: reached ? 'var(--green)' : 'var(--text2)' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {form && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
              <label style={{ fontSize: 12 }}>Nom de l'objectif</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vacances, apport immobilier…" style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 130px' }}>
              <label style={{ fontSize: 12 }}>Montant cible (€)</label>
              <input type="number" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: e.target.value })} placeholder="3000" style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 150px' }}>
              <label style={{ fontSize: 12 }}>Échéance (optionnel)</label>
              <input type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} style={{ fontSize: 13 }} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 180px' }}>
              <label style={{ fontSize: 12 }}>Compte lié (optionnel)</label>
              <select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })} style={{ fontSize: 13 }}>
                <option value="">Aucun — saisie manuelle</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={save} disabled={!form.name.trim() || !form.targetAmount}>
                {form.id == null ? 'Créer' : 'Enregistrer'}
              </button>
              <button className="btn btn-secondary" onClick={() => setForm(null)}>Annuler</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
