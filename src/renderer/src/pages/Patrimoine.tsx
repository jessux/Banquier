import { useEffect, useMemo, useState } from 'react'
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import type {
  Asset,
  AssetInput,
  AssetLotInput,
  AssetType,
  PatrimoineSummary,
  DcaFrequency,
  DcaPlanInput
} from '../../../shared/types'

const ASSET_TYPES: { type: AssetType; label: string; icon: string }[] = [
  { type: 'immobilier', label: 'Immobilier', icon: '🏠' },
  { type: 'actions', label: 'Actions', icon: '📈' },
  { type: 'etf', label: 'ETF / Fonds', icon: '📊' },
  { type: 'crypto', label: 'Cryptomonnaies', icon: '₿' },
  { type: 'liquidites', label: 'Liquidités / Livrets', icon: '💵' },
  { type: 'assurance_vie', label: 'Assurance-vie', icon: '🛡️' },
  { type: 'autre', label: 'Autre', icon: '📦' }
]

/** Types pour lesquels on suit un prix de revient via des lots d'achat. */
const MARKET_TYPES: AssetType[] = ['actions', 'etf', 'crypto']

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']

const typeMeta = (type: AssetType): { label: string; icon: string } =>
  ASSET_TYPES.find((t) => t.type === type) ?? { label: type, icon: '📦' }

const euro = (n: number): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

const euro2 = (n: number, currency = 'EUR'): string =>
  n.toLocaleString('fr-FR', { style: 'currency', currency })

const num = (s: string): number => parseFloat(s.replace(',', '.')) || 0

const emptyForm: AssetInput = {
  type: 'immobilier',
  label: '',
  quantity: null,
  value: 0,
  currency: 'EUR',
  symbol: null,
  notes: null
}

const emptyLot = (): AssetLotInput => ({ date: null, quantity: 0, unit_price: 0, fees: 0 })

export default function Patrimoine(): JSX.Element {
  const [summary, setSummary] = useState<PatrimoineSummary | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<AssetInput>(emptyForm)
  const [valueStr, setValueStr] = useState('')
  const [qtyStr, setQtyStr] = useState('')
  const [lots, setLots] = useState<AssetLotInput[]>([])
  const [dcaEnabled, setDcaEnabled] = useState(false)
  const [dca, setDca] = useState<DcaPlanInput>({ amount: 0, frequency: 'mensuel', day_ref: 1, start_date: '', fees: 0 })
  const [dcaAmountStr, setDcaAmountStr] = useState('')
  const [dcaFeesStr, setDcaFeesStr] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [quoteMsg, setQuoteMsg] = useState<string | null>(null)

  const isMarket = MARKET_TYPES.includes(form.type)

  const load = (): void => {
    window.api.getPatrimoineSummary().then(setSummary)
  }
  useEffect(() => { load() }, [])

  const resetDca = (): void => {
    setDcaEnabled(false)
    setDca({ amount: 0, frequency: 'mensuel', day_ref: 1, start_date: '', fees: 0 })
    setDcaAmountStr('')
    setDcaFeesStr('')
  }

  const openNew = (): void => {
    setEditId(null)
    setForm(emptyForm)
    setValueStr('')
    setQtyStr('')
    setLots([])
    resetDca()
    setShowForm(true)
  }

  const openEdit = async (a: Asset): Promise<void> => {
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
    resetDca()
    const plan = await window.api.getDcaPlan(a.id)
    if (plan) {
      setDcaEnabled(true)
      setDca({ amount: plan.amount, frequency: plan.frequency, day_ref: plan.day_ref, start_date: plan.start_date, fees: plan.fees })
      setDcaAmountStr(String(plan.amount))
      setDcaFeesStr(plan.fees ? String(plan.fees) : '')
      setLots([])
    } else {
      const loaded = await window.api.getAssetLots(a.id)
      setLots(loaded.map((l) => ({ date: l.date, quantity: l.quantity, unit_price: l.unit_price, fees: l.fees })))
    }
    setShowForm(true)
  }

  const refreshQuotes = async (): Promise<void> => {
    setRefreshing(true)
    setQuoteMsg('Mise à jour des cours…')
    try {
      const res = await window.api.refreshQuotes()
      const parts = [`${res.updated.length} actif(s) mis à jour`]
      if (res.failed.length) parts.push(`${res.failed.length} échec(s) : ${res.failed.map((f) => f.label).join(', ')}`)
      setQuoteMsg(parts.join(' · '))
      load()
    } catch (e) {
      setQuoteMsg(`Erreur : ${String(e instanceof Error ? e.message : e)}`)
    } finally {
      setRefreshing(false)
    }
  }

  // Calculs en direct dans le formulaire (lots).
  const formCostBasis = useMemo(
    () => lots.reduce((s, l) => s + l.quantity * l.unit_price + (l.fees || 0), 0),
    [lots]
  )
  const formLotQty = useMemo(() => lots.reduce((s, l) => s + l.quantity, 0), [lots])
  const formValue = num(valueStr)
  const formGain = formValue - formCostBasis

  const updateLot = (i: number, patch: Partial<AssetLotInput>): void =>
    setLots(lots.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  const useDca = isMarket && dcaEnabled

  const save = async (): Promise<void> => {
    const cleanLots = isMarket && !useDca ? lots.filter((l) => l.quantity > 0 && l.unit_price > 0) : []
    const dcaPayload: DcaPlanInput | null = useDca
      ? {
          amount: num(dcaAmountStr),
          frequency: dca.frequency,
          day_ref: dca.day_ref,
          start_date: dca.start_date,
          fees: num(dcaFeesStr)
        }
      : null
    const payload: AssetInput = {
      ...form,
      value: useDca ? 0 : formValue, // pour le DCA, la valeur est calculée côté serveur
      quantity: isMarket ? null : qtyStr.trim() ? num(qtyStr) : null,
      lots: cleanLots,
      dca: dcaPayload
    }
    if (!payload.label.trim()) return
    if (useDca) {
      if (!payload.symbol || !dcaPayload!.amount || !dcaPayload!.start_date) return
    } else if (payload.value <= 0) return

    setRefreshing(true)
    try {
      if (editId != null) await window.api.updateAsset(editId, payload)
      else await window.api.createAsset(payload)
      setShowForm(false)
      load()
    } finally {
      setRefreshing(false)
    }
  }

  const remove = async (id: number): Promise<void> => {
    await window.api.deleteAsset(id)
    load()
  }

  const pieData = useMemo(
    () => (summary?.byType ?? []).map((b) => ({ name: typeMeta(b.type).label, value: b.total })),
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
  const gainColor = (g: number): string => (g >= 0 ? '#22c55e' : '#ef4444')
  const gainLabel = (gain: number, basis: number): string => {
    const pct = basis > 0 ? ` (${gain >= 0 ? '+' : ''}${Math.round((gain / basis) * 100)} %)` : ''
    return `${gain >= 0 ? '+' : ''}${euro2(gain)}${pct}`
  }

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Patrimoine</h1>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={refreshQuotes} disabled={refreshing}>
            {refreshing ? '…' : '↻ Mettre à jour les cours'}
          </button>
          <button className="btn btn-primary" onClick={openNew}>+ Ajouter un actif</button>
        </div>
      </div>
      {quoteMsg && (
        <p className="text-sm" style={{ marginBottom: 12, color: quoteMsg.startsWith('Erreur') ? '#ef4444' : 'var(--text-muted)' }}>
          {quoteMsg}
        </p>
      )}

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
          <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 40, flexWrap: 'wrap' }}>
            <div>
              <div className="text-muted text-sm">Valeur nette totale</div>
              <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4 }}>
                {summary.totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
            {summary.totalCostBasis > 0 && (
              <div>
                <div className="text-muted text-sm">Plus/moins-value latente (titres)</div>
                <div style={{ fontSize: 34, fontWeight: 700, marginTop: 4, color: gainColor(summary.totalGain) }}>
                  {gainLabel(summary.totalGain, summary.totalCostBasis)}
                </div>
                <div className="text-muted text-sm">Prix de revient : {euro(summary.totalCostBasis)}</div>
              </div>
            )}
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
              {assets.map((a) => {
                const gain = a.value - a.cost_basis
                const qty = a.lot_quantity > 0 ? a.lot_quantity : a.quantity
                return (
                  <div
                    key={a.id}
                    className="flex justify-between items-center"
                    style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}
                  >
                    <div>
                      <span style={{ fontWeight: 500 }}>{a.label}</span>
                      {qty != null && (
                        <span className="text-muted text-sm" style={{ marginLeft: 8 }}>× {qty}</span>
                      )}
                      {a.symbol && <span className="badge" style={{ marginLeft: 8 }}>{a.symbol}</span>}
                      {a.cost_basis > 0 && (
                        <div className="text-sm" style={{ marginTop: 2 }}>
                          <span className="text-muted">Prix de revient {euro2(a.cost_basis, a.currency)} · </span>
                          <span style={{ color: gainColor(gain), fontWeight: 500 }}>{gainLabel(gain, a.cost_basis)}</span>
                        </div>
                      )}
                      {a.notes && <div className="text-muted text-sm" style={{ marginTop: 2 }}>{a.notes}</div>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 600 }}>{euro2(a.value, a.currency)}</span>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => openEdit(a)}>Modifier</button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => remove(a.id)}>Supprimer</button>
                    </div>
                  </div>
                )
              })}
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
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={isMarket ? 'Apple, Bitcoin, MSCI World…' : 'Appartement Paris 11e'} />
            </div>
            {!useDca && (
              <div className="form-group">
                <label>Valeur actuelle totale (€)</label>
                <input value={valueStr} onChange={(e) => setValueStr(e.target.value)} placeholder="250000" inputMode="decimal" />
              </div>
            )}
            {!isMarket && (
              <div className="form-group">
                <label>Quantité (optionnel)</label>
                <input value={qtyStr} onChange={(e) => setQtyStr(e.target.value)} placeholder="nb de parts/unités" inputMode="decimal" />
              </div>
            )}
            <div className="form-group">
              <label>Symbole / Ticker{useDca ? '' : ' (optionnel)'}</label>
              <input value={form.symbol ?? ''} onChange={(e) => setForm({ ...form, symbol: e.target.value || null })} placeholder="AAPL, BTC, CW8.PA…" />
            </div>
            <div className="form-group">
              <label>Note (optionnel)</label>
              <input value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || null })} placeholder="PEA, compte-titres…" />
            </div>
          </div>

          {/* Choix lots manuels / DCA pour les actifs boursiers */}
          {isMarket && (
            <div style={{ marginTop: 4, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={dcaEnabled} onChange={(e) => setDcaEnabled(e.target.checked)} style={{ width: 'auto' }} />
                Investissement programmé (DCA) — génère les achats automatiquement à partir des cours historiques
              </label>
            </div>
          )}

          {/* Plan DCA */}
          {useDca && (
            <div style={{ marginTop: 8 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Plan d'investissement programmé</div>
              <div className="grid-2" style={{ gap: 12 }}>
                <div className="form-group">
                  <label>Montant par versement (€)</label>
                  <input value={dcaAmountStr} onChange={(e) => setDcaAmountStr(e.target.value)} placeholder="100" inputMode="decimal" />
                </div>
                <div className="form-group">
                  <label>Fréquence</label>
                  <select value={dca.frequency} onChange={(e) => setDca({ ...dca, frequency: e.target.value as DcaFrequency })}>
                    <option value="mensuel">Mensuel</option>
                    <option value="hebdomadaire">Hebdomadaire</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>{dca.frequency === 'mensuel' ? 'Jour du mois (1-28)' : 'Jour de la semaine'}</label>
                  {dca.frequency === 'mensuel' ? (
                    <input value={dca.day_ref} onChange={(e) => setDca({ ...dca, day_ref: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) })} inputMode="numeric" />
                  ) : (
                    <select value={dca.day_ref} onChange={(e) => setDca({ ...dca, day_ref: parseInt(e.target.value) })}>
                      {['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="form-group">
                  <label>Date de début</label>
                  <input type="date" value={dca.start_date} onChange={(e) => setDca({ ...dca, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Frais par versement (€, optionnel)</label>
                  <input value={dcaFeesStr} onChange={(e) => setDcaFeesStr(e.target.value)} placeholder="0" inputMode="decimal" />
                </div>
              </div>
              <p className="text-muted text-sm">
                À l'enregistrement, Banquier récupère les cours à chaque date et crée les achats automatiquement,
                puis calcule la valeur actuelle et la plus/moins-value. (Crypto : historique limité à 1 an.)
              </p>
            </div>
          )}

          {/* Lots d'achat manuels (actifs boursiers, hors DCA) */}
          {isMarket && !useDca && (
            <div style={{ marginTop: 8 }}>
              <div className="card-title" style={{ marginBottom: 8 }}>Lots d'achat (prix de revient)</div>
              <table style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text2, #94a3b8)' }}>
                    <th style={{ fontWeight: 500, padding: '4px 6px' }}>Date</th>
                    <th style={{ fontWeight: 500, padding: '4px 6px' }}>Quantité</th>
                    <th style={{ fontWeight: 500, padding: '4px 6px' }}>Prix unitaire</th>
                    <th style={{ fontWeight: 500, padding: '4px 6px' }}>Frais</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((l, i) => (
                    <tr key={i}>
                      <td style={{ padding: '3px 6px' }}>
                        <input type="date" value={l.date ?? ''} onChange={(e) => updateLot(i, { date: e.target.value || null })} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <input value={l.quantity || ''} onChange={(e) => updateLot(i, { quantity: num(e.target.value) })} placeholder="10" inputMode="decimal" style={{ width: 90 }} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <input value={l.unit_price || ''} onChange={(e) => updateLot(i, { unit_price: num(e.target.value) })} placeholder="150" inputMode="decimal" style={{ width: 100 }} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <input value={l.fees || ''} onChange={(e) => updateLot(i, { fees: num(e.target.value) })} placeholder="0" inputMode="decimal" style={{ width: 80 }} />
                      </td>
                      <td style={{ padding: '3px 6px' }}>
                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => setLots(lots.filter((_, idx) => idx !== i))}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn btn-secondary" style={{ fontSize: 12, marginTop: 8 }} onClick={() => setLots([...lots, emptyLot()])}>
                + Ajouter un lot
              </button>

              {formCostBasis > 0 && (
                <div className="text-sm" style={{ marginTop: 10 }}>
                  <span className="text-muted">Quantité totale {formLotQty} · Prix de revient {euro2(formCostBasis)}</span>
                  {formValue > 0 && (
                    <>
                      <span className="text-muted"> · +/- value </span>
                      <span style={{ color: gainColor(formGain), fontWeight: 600 }}>{gainLabel(formGain, formCostBasis)}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={save}
              disabled={
                refreshing ||
                !form.label.trim() ||
                (useDca
                  ? !form.symbol || !dcaAmountStr.trim() || !dca.start_date
                  : !valueStr.trim())
              }
            >
              {refreshing ? 'Calcul…' : editId != null ? 'Enregistrer' : 'Ajouter'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  )
}
