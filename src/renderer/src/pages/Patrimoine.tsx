import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import type { Asset, AssetInput, AssetType, PatrimoineSummary } from '../../../shared/types'

const ASSET_TYPES: { type: AssetType; label: string; icon: string }[] = [
  { type: 'immobilier', label: 'Immobilier', icon: '🏠' },
  { type: 'actions', label: 'Actions', icon: '📈' },
  { type: 'etf', label: 'ETF / Fonds', icon: '📊' },
  { type: 'crypto', label: 'Cryptomonnaies', icon: '₿' },
  { type: 'liquidites', label: 'Liquidités / Livrets', icon: '💵' },
  { type: 'assurance_vie', label: 'Assurance-vie', icon: '🛡️' },
  { type: 'autre', label: 'Autre', icon: '📦' }
]

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

const typeMeta = (type: AssetType): { label: string; icon: string } =>
  ASSET_TYPES.find((t) => t.type === type) ?? { label: type, icon: '📦' }

const euro = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const emptyForm: AssetInput = {
  type: 'immobilier',
  label: '',
  quantity: null,
  value: 0,
  currency: 'EUR',
  symbol: null,
  notes: null
}

export default function Patrimoine(): JSX.Element {
  const [summary, setSummary] = useState<PatrimoineSummary | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<AssetInput>(emptyForm)
  const [valueStr, setValueStr] = useState('')
  const [qtyStr, setQtyStr] = useState('')

  const load = (): void => {
    window.api.getPatrimoineSummary().then(setSummary)
  }
  useEffect(() => { load() }, [])

  const openNew = (): void => {
    setEditId(null)
    setForm(emptyForm)
    setValueStr('')
    setQtyStr('')
    setShowForm(true)
  }

  const openEdit = (a: Asset): void => {
    setEditId(a.id)
    setForm({
      type: a.type,
      label: a.label,
      quantity: a.quantity,
      value: a.value,
      currency: a.currency,
      symbol: a.symbol,
      notes: a.notes
    })
    setValueStr(String(a.value))
    setQtyStr(a.quantity != null ? String(a.quantity) : '')
    setShowForm(true)
  }

  const save = async (): Promise<void> => {
    const payload: AssetInput = {
      ...form,
      value: parseFloat(valueStr.replace(',', '.')) || 0,
      quantity: qtyStr.trim() ? parseFloat(qtyStr.replace(',', '.')) : null
    }
    if (!payload.label.trim() || payload.value <= 0) return
    if (editId != null) await window.api.updateAsset(editId, payload)
    else await window.api.createAsset(payload)
    setShowForm(false)
    load()
  }

  const remove = async (id: number): Promise<void> => {
    await window.api.deleteAsset(id)
    load()
  }

  const pieData = useMemo(
    () =>
      (summary?.byType ?? []).map((b) => ({
        name: typeMeta(b.type).label,
        value: b.total
      })),
    [summary]
  )

  const assetsByType = useMemo(() => {
    const groups = new Map<AssetType, Asset[]>()
    for (const a of summary?.assets ?? []) {
      if (!groups.has(a.type)) groups.set(a.type, [])
      groups.get(a.type)!.push(a)
    }
    return groups
  }, [summary])

  if (!summary) {
    return (
      <div>
        <div className="page-header"><h1 className="page-title">Patrimoine</h1></div>
        <p className="text-muted">Chargement…</p>
      </div>
    )
  }

  const isEmpty = summary.assets.length === 0

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Patrimoine</h1>
        <button className="btn btn-primary" onClick={openNew}>+ Ajouter un actif</button>
      </div>

      {isEmpty && !showForm && (
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <p style={{ fontSize: 16, marginBottom: 8 }}>Aucun actif pour l'instant</p>
          <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
            Ajoutez vos biens immobiliers, actions, ETF, cryptos, livrets… pour suivre votre valeur nette.
          </p>
          <button className="btn btn-primary" onClick={openNew}>+ Ajouter un premier actif</button>
        </div>
      )}

      {!isEmpty && (
        <>
          {/* Synthèse */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="text-muted text-sm">Valeur nette totale</div>
            <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4 }}>
              {summary.totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 20, gap: 20 }}>
            {/* Répartition */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Répartition</div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => euro(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ marginTop: 8 }}>
                {summary.byType.map((b, i) => (
                  <div key={b.type} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] }} />
                      {typeMeta(b.type).icon} {typeMeta(b.type).label}
                    </span>
                    <span className="text-muted">
                      {euro(b.total)} · {Math.round((b.total / summary.totalValue) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Évolution */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 12 }}>Évolution de la valeur nette</div>
              {summary.history.length > 1 ? (
                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={summary.history}>
                    <defs>
                      <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2e3147" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(d) => d.slice(5)} />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickFormatter={(v) => euro(v)} width={70} />
                    <Tooltip formatter={(v: number) => euro(v)} />
                    <Area type="monotone" dataKey="value" stroke="#6366f1" fill="url(#nw)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted text-sm" style={{ padding: '40px 0', textAlign: 'center' }}>
                  L'historique se construit au fil du temps, à chaque mise à jour de vos actifs.
                </p>
              )}
            </div>
          </div>

          {/* Liste des actifs */}
          {[...assetsByType.entries()].map(([type, assets]) => (
            <div className="card" style={{ marginBottom: 16 }} key={type}>
              <div className="card-title" style={{ marginBottom: 12 }}>
                {typeMeta(type).icon} {typeMeta(type).label}
              </div>
              {assets.map((a) => (
                <div
                  key={a.id}
                  className="flex justify-between items-center"
                  style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                >
                  <div>
                    <span style={{ fontWeight: 500 }}>{a.label}</span>
                    {a.quantity != null && (
                      <span className="text-muted text-sm" style={{ marginLeft: 8 }}>× {a.quantity}</span>
                    )}
                    {a.symbol && <span className="badge" style={{ marginLeft: 8 }}>{a.symbol}</span>}
                    {a.notes && <div className="text-muted text-sm" style={{ marginTop: 2 }}>{a.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 600 }}>
                      {a.value.toLocaleString('fr-FR', { style: 'currency', currency: a.currency })}
                    </span>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(a)}>Modifier</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => remove(a.id)}>Supprimer</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* Formulaire ajout/édition */}
      {showForm && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginBottom: 16 }}>{editId != null ? 'Modifier l\'actif' : 'Nouvel actif'}</h3>
          <div className="grid-2" style={{ gap: 12 }}>
            <div className="form-group">
              <label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AssetType })}>
                {ASSET_TYPES.map((t) => (
                  <option key={t.type} value={t.type}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Libellé</label>
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Appartement Paris 11e" />
            </div>
            <div className="form-group">
              <label>Valeur actuelle (€)</label>
              <input value={valueStr} onChange={(e) => setValueStr(e.target.value)} placeholder="250000" inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Quantité (optionnel)</label>
              <input value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} placeholder="10 (nb d'actions/parts)" inputMode="decimal" />
            </div>
            <div className="form-group">
              <label>Symbole / Ticker (optionnel)</label>
              <input value={form.symbol ?? ''} onChange={(e) => setForm({ ...form, symbol: e.target.value || null })} placeholder="AAPL, BTC, CW8…" />
            </div>
            <div className="form-group">
              <label>Note (optionnel)</label>
              <input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} placeholder="PEA, compte-titres…" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-primary" onClick={save} disabled={!form.label.trim() || !valueStr.trim()}>
              {editId != null ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
