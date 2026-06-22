import { useEffect, useRef, useState } from 'react'
import type { CategoryRule } from '../../../shared/types'
import CategoryPicker from '../components/CategoryPicker'

const COMMON_CATEGORIES = [
  'Alimentation', 'Logement', 'Transport', 'Restaurants', 'Loisirs',
  'Santé', 'Shopping', 'Abonnements', 'Épargne', 'Salaire', 'Remboursement', 'Autre'
]

interface EditingRule {
  id: number
  pattern: string
  category: string
}

interface NewRule {
  pattern: string
  category: string
}

export default function Rules(): JSX.Element {
  const [rules, setRules] = useState<CategoryRule[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingRule | null>(null)
  const [adding, setAdding] = useState(false)
  const [newRule, setNewRule] = useState<NewRule>({ pattern: '', category: '' })
  const [toast, setToast] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const patternInputRef = useRef<HTMLInputElement>(null)
  const newPatternRef = useRef<HTMLInputElement>(null)

  const load = async (): Promise<void> => {
    setLoading(true)
    const [r, existing, paths] = await Promise.all([
      window.api.getCategoryRulesAll(),
      window.api.getCategories(),
      window.api.getCategoryPaths()
    ])
    setRules(r)
    setCategories([...new Set([...paths, ...existing])].sort())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (editing) setTimeout(() => patternInputRef.current?.focus(), 0)
  }, [editing?.id])

  useEffect(() => {
    if (adding) setTimeout(() => newPatternRef.current?.focus(), 0)
  }, [adding])

  const showToast = (msg: string): void => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const deleteRule = async (id: number): Promise<void> => {
    await window.api.deleteCategoryRule(id)
    setRules((prev) => prev.filter((r) => r.id !== id))
    showToast('Règle supprimée')
  }

  const saveEdit = async (): Promise<void> => {
    if (!editing || !editing.pattern.trim() || !editing.category.trim()) return
    await window.api.updateCategoryRule(editing.id, editing.pattern.trim(), editing.category.trim())
    setRules((prev) => prev.map((r) => r.id === editing.id ? { ...r, pattern: editing.pattern.trim(), category: editing.category.trim() } : r))
    setEditing(null)
    showToast('Règle mise à jour')
  }

  const addRule = async (): Promise<void> => {
    if (!newRule.pattern.trim() || !newRule.category.trim()) return
    await window.api.upsertCategoryRule(newRule.pattern.trim(), newRule.category.trim())
    setAdding(false)
    setNewRule({ pattern: '', category: '' })
    await load()
    showToast('Règle ajoutée')
  }

  const applyAll = async (): Promise<void> => {
    setApplying(true)
    const allTx = await window.api.getTransactions({})
    let count = 0
    for (const tx of allTx) {
      for (const rule of rules) {
        try {
          if (new RegExp(rule.pattern, 'i').test(tx.description)) {
            if (tx.category !== rule.category) {
              await window.api.updateTransactionCategory(tx.id, rule.category)
              count++
            }
            break
          }
        } catch { /* invalid regex */ }
      }
    }
    setApplying(false)
    showToast(`${count} transaction(s) mises à jour`)
  }

  const allCats = [...new Set([...COMMON_CATEGORIES, ...categories])].sort()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Règles automatiques</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={applyAll} disabled={applying || rules.length === 0}>
            {applying ? <span className="spinner" /> : '▶'} Appliquer toutes les règles
          </button>
          <button className="btn btn-primary" onClick={() => { setAdding(true); setEditing(null) }}>
            + Nouvelle règle
          </button>
        </div>
      </div>

      <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
        Les règles sont appliquées automatiquement à chaque import. L'ordre est important — la première règle qui correspond est utilisée.
      </p>

      {adding && (
        <div style={{
          background: '#1a1d27', border: '1px solid #6366f1', borderRadius: 10,
          padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'
        }}>
          <span style={{ fontSize: 13, color: '#94a3b8', whiteSpace: 'nowrap' }}>Nouvelle règle :</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }}>
            <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>Regex :</span>
            <input
              ref={newPatternRef}
              value={newRule.pattern}
              onChange={(e) => setNewRule((p) => ({ ...p, pattern: e.target.value }))}
              style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
              placeholder="ex: SNCF.*"
              onKeyDown={(e) => { if (e.key === 'Enter') addRule(); if (e.key === 'Escape') setAdding(false) }}
            />
          </div>
          <CategoryPicker
            value={newRule.category}
            onChange={(v) => setNewRule((p) => ({ ...p, category: v }))}
            categories={allCats}
            placeholder="Catégorie"
            style={{ width: 180 }}
          />
          <button className="btn btn-primary" onClick={addRule} disabled={!newRule.pattern.trim() || !newRule.category.trim()}>
            Ajouter
          </button>
          <button className="btn btn-secondary" onClick={() => setAdding(false)}>✕</button>
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          background: '#22c55e', color: '#fff', borderRadius: 8,
          padding: '10px 18px', fontSize: 13, fontWeight: 500,
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
        }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="spinner" style={{ width: 32, height: 32, margin: '0 auto' }} /></div>
      ) : rules.length === 0 ? (
        <div className="empty-state">
          <p>Aucune règle définie.</p>
          <p className="text-muted text-sm">Créez des règles pour catégoriser automatiquement les transactions lors de l'import.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center', color: '#64748b', fontSize: 11 }}>#</th>
                <th>Pattern (Regex)</th>
                <th>Catégorie</th>
                <th style={{ width: 100 }} />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, idx) => (
                <tr key={rule.id}>
                  <td style={{ textAlign: 'center', color: '#64748b', fontSize: 12 }}>{idx + 1}</td>
                  <td>
                    {editing?.id === rule.id ? (
                      <input
                        ref={patternInputRef}
                        value={editing.pattern}
                        onChange={(e) => setEditing((p) => p ? { ...p, pattern: e.target.value } : null)}
                        style={{ fontFamily: 'monospace', fontSize: 12, width: '100%' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditing(null) }}
                      />
                    ) : (
                      <code style={{ fontFamily: 'monospace', fontSize: 12, color: '#a78bfa' }}>{rule.pattern}</code>
                    )}
                  </td>
                  <td>
                    {editing?.id === rule.id ? (
                      <CategoryPicker
                        value={editing.category}
                        onChange={(v) => setEditing((p) => p ? { ...p, category: v } : null)}
                        categories={allCats}
                        placeholder="Catégorie"
                        style={{ width: 180 }}
                        onConfirm={saveEdit}
                        onCancel={() => setEditing(null)}
                      />
                    ) : (
                      <span style={{
                        display: 'inline-block', fontSize: 12, fontWeight: 500,
                        background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                        borderRadius: 4, padding: '2px 8px'
                      }}>
                        {rule.category}
                      </span>
                    )}
                  </td>
                  <td>
                    {editing?.id === rule.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={saveEdit}>OK</button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditing(null)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: 12 }}
                          onClick={() => { setEditing({ id: rule.id, pattern: rule.pattern, category: rule.category }); setAdding(false) }}
                        >
                          Modifier
                        </button>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 8px', fontSize: 12, color: '#ef4444', borderColor: '#ef4444' }}
                          onClick={() => deleteRule(rule.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
