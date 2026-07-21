import { useEffect, useState } from 'react'
import type { BudgetWithSpent } from '../../../shared/types'

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function monthBounds(offset: number): { startDate: string; endDate: string; label: string } {
  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth() + offset
  const start = new Date(y, m, 1)
  const end = new Date(y, m + 1, 0)
  const isCurrentMonth = offset === 0
  const endDate = isCurrentMonth ? today.toISOString().slice(0, 10) : end.toISOString().slice(0, 10)
  const d = new Date(y, m, 1)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate,
    label: `${MONTH_NAMES[((m % 12) + 12) % 12]} ${d.getFullYear()}`
  }
}

function fmt(n: number): string {
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
}

function ProgressBar({ pct, over }: { pct: number; over: boolean }) {
  const filled = Math.min(pct, 100)
  return (
    <div style={{ background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden', flex: 1 }}>
      <div style={{
        width: `${filled}%`, height: '100%', borderRadius: 6,
        background: over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)',
        transition: 'width 0.4s ease'
      }} />
    </div>
  )
}

export default function BudgetPage(): JSX.Element {
  const [budgets, setBudgets] = useState<BudgetWithSpent[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [monthOffset, setMonthOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const [newCat, setNewCat] = useState('')
  const [newAmt, setNewAmt] = useState('')
  const [adding, setAdding] = useState(false)
  const [suggestion, setSuggestion] = useState<{ average: number; monthsWithData: number } | null>(null)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editAmt, setEditAmt] = useState('')

  const { startDate, endDate, label } = monthBounds(monthOffset)

  const load = (): void => {
    setLoading(true)
    Promise.all([
      window.api.getBudgetsWithSpent(startDate, endDate),
      window.api.getCategoryPaths()
    ]).then(([b, cats]) => {
      setBudgets(b as BudgetWithSpent[])
      const existingCats = (b as BudgetWithSpent[]).map((x: BudgetWithSpent) => x.category)
      setCategories((cats as string[]).filter((c: string) => !existingCats.includes(c)).sort())
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [startDate, endDate])

  const selectCategory = async (cat: string): Promise<void> => {
    setNewCat(cat)
    if (!cat) { setSuggestion(null); return }
    const res = await window.api.getCategoryMonthlyAverage(cat, 3)
    setSuggestion(res.monthsWithData > 0 ? res : null)
    if (res.monthsWithData > 0) setNewAmt(String(Math.round(res.average)))
  }

  const addBudget = async (): Promise<void> => {
    const amt = parseFloat(newAmt.replace(',', '.'))
    if (!newCat || isNaN(amt) || amt <= 0) return
    await window.api.upsertBudget(newCat, amt)
    setNewCat('')
    setNewAmt('')
    setSuggestion(null)
    setAdding(false)
    load()
  }

  const saveEdit = async (id: number, category: string): Promise<void> => {
    const amt = parseFloat(editAmt.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) return
    await window.api.upsertBudget(category, amt)
    setEditingId(null)
    load()
  }

  const deleteBudget = async (id: number): Promise<void> => {
    await window.api.deleteBudget(id)
    load()
  }

  const totalBudget = budgets.reduce((s, b) => s + b.amount, 0)
  const totalSpent = budgets.reduce((s, b) => s + b.spent, 0)
  const overCount = budgets.filter((b) => b.spent > b.amount).length

  const arrowBtn = (dir: -1 | 1) => (
    <button
      onClick={() => setMonthOffset((o) => o + dir)}
      disabled={dir === 1 && monthOffset >= 0}
      style={{
        width: 28, height: 28, borderRadius: '50%', border: 'none',
        cursor: dir === 1 && monthOffset >= 0 ? 'default' : 'pointer',
        background: 'var(--bg3)', color: dir === 1 && monthOffset >= 0 ? '#3e4259' : 'var(--text2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0
      }}
    >
      {dir === -1 ? '‹' : '›'}
    </button>
  )

  return (
    <div style={{ maxWidth: 700 }}>
      <div className="page-header">
        <h1 className="page-title">Budgets</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {arrowBtn(-1)}
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 130, textAlign: 'center' }}>{label}</span>
          {arrowBtn(1)}
        </div>
      </div>

      {/* Résumé global */}
      {budgets.length > 0 && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="card">
            <div className="card-title">Budget total</div>
            <div className="card-value">{fmt(totalBudget)}</div>
          </div>
          <div className="card">
            <div className="card-title">Dépensé</div>
            <div className={`card-value ${totalSpent > totalBudget ? 'negative' : ''}`}>{fmt(totalSpent)}</div>
          </div>
          <div className="card">
            <div className="card-title">Restant</div>
            <div className={`card-value ${totalBudget - totalSpent < 0 ? 'negative' : 'positive'}`}>
              {fmt(totalBudget - totalSpent)}
            </div>
            {overCount > 0 && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 6 }}>
                {overCount} catégorie{overCount > 1 ? 's' : ''} dépassée{overCount > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Liste des budgets */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3>Catégories</h3>
          <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={() => setAdding(true)}>
            + Ajouter
          </button>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner" style={{ width: 28, height: 28, margin: '0 auto' }} /></div>
        ) : budgets.length === 0 && !adding ? (
          <div className="empty-state" style={{ padding: 32 }}>
            <p style={{ fontSize: 15, marginBottom: 8 }}>Aucun budget défini</p>
            <p className="text-muted text-sm">Définissez un plafond mensuel par catégorie pour suivre vos dépenses.</p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setAdding(true)}>
              + Créer mon premier budget
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {budgets.map((b) => {
              const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0
              const over = b.spent > b.amount
              const isEditing = editingId === b.id
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontWeight: 500, fontSize: 14, minWidth: 140, flex: '0 0 auto' }}>{b.category}</span>
                    <ProgressBar pct={pct} over={over} />
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <input
                          autoFocus
                          type="number"
                          value={editAmt}
                          onChange={(e) => setEditAmt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(b.id, b.category); if (e.key === 'Escape') setEditingId(null) }}
                          style={{ width: 90, padding: '3px 8px', fontSize: 13 }}
                          placeholder="Montant"
                        />
                        <button className="btn btn-primary" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => saveEdit(b.id, b.category)}>OK</button>
                        <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: 12 }} onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 13, color: over ? 'var(--red)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>
                          {fmt(b.spent)} / {fmt(b.amount)}
                        </span>
                        <span style={{
                          fontSize: 11, fontWeight: 600, minWidth: 42, textAlign: 'right',
                          color: over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)'
                        }}>
                          {pct.toFixed(0)}%
                        </span>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 10px', fontSize: 12 }}
                          onClick={() => { setEditingId(b.id); setEditAmt(String(b.amount)) }}
                        >
                          Modifier
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '3px 8px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}
                          onClick={() => deleteBudget(b.id)}
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                  {over && (
                    <div style={{ fontSize: 11, color: 'var(--red)', paddingLeft: 150 }}>
                      Dépassement de {fmt(b.spent - b.amount)}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Formulaire ajout */}
        {adding && (
          <div style={{
            marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
            display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap'
          }}>
            <div className="form-group" style={{ marginBottom: 0, flex: '1 1 200px' }}>
              <label style={{ fontSize: 12 }}>Catégorie</label>
              <select value={newCat} onChange={(e) => selectCategory(e.target.value)} style={{ fontSize: 13 }}>
                <option value="">— Choisir —</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: '0 0 140px' }}>
              <label style={{ fontSize: 12 }}>Plafond mensuel (€)</label>
              <input
                type="number"
                value={newAmt}
                onChange={(e) => setNewAmt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addBudget(); if (e.key === 'Escape') setAdding(false) }}
                placeholder="300"
                style={{ fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
              <button className="btn btn-primary" onClick={addBudget} disabled={!newCat || !newAmt}>Ajouter</button>
              <button className="btn btn-secondary" onClick={() => { setAdding(false); setNewCat(''); setNewAmt(''); setSuggestion(null) }}>Annuler</button>
            </div>
            {suggestion && (
              <div style={{ flexBasis: '100%', fontSize: 12, color: 'var(--accent-light)' }}>
                💡 Montant pré-rempli d'après votre moyenne : {fmt(suggestion.average)}/mois
                {' '}sur {suggestion.monthsWithData === 1 ? 'le dernier mois' : `les ${suggestion.monthsWithData} derniers mois`}.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
