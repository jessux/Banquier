import { all, get, run } from '../db'
import { getCurrentPriceEur, getHistoricalSeriesEur, priceAt } from '../quotes'
import type {
  Asset,
  AssetLot,
  AssetLotInput,
  AssetInput,
  AssetType,
  DcaPlan,
  DcaPlanInput,
  PatrimoineSummary,
  AssetTypeBreakdown
} from '../../shared/types'

// Port de src/main/database.ts (fonctions Patrimoine, ~lignes 437-589) vers le
// style async utilisé partout ailleurs dans src/mobile/api/*.ts.

export async function getAssets(): Promise<Asset[]> {
  return all<Asset>(
    `SELECT a.*,
       (SELECT COALESCE(SUM(l.quantity * l.unit_price + l.fees), 0)
          FROM asset_lots l WHERE l.asset_id = a.id) AS cost_basis,
       (SELECT COALESCE(SUM(l.quantity), 0)
          FROM asset_lots l WHERE l.asset_id = a.id) AS lot_quantity
     FROM assets a
     ORDER BY a.type, a.value DESC`
  )
}

export async function getAssetLots(assetId: number): Promise<AssetLot[]> {
  return all<AssetLot>('SELECT * FROM asset_lots WHERE asset_id = ? ORDER BY date', [assetId])
}

async function replaceAssetLots(assetId: number, lots: AssetLotInput[] | undefined): Promise<void> {
  // Ne touche qu'aux lots manuels (plan_id NULL) ; les lots DCA sont gérés à part.
  await run('DELETE FROM asset_lots WHERE asset_id = ? AND plan_id IS NULL', [assetId])
  for (const lot of lots ?? []) {
    if (!lot.quantity || lot.unit_price == null) continue
    await run(
      'INSERT INTO asset_lots (asset_id, date, quantity, unit_price, fees, plan_id) VALUES (?, ?, ?, ?, ?, NULL)',
      [assetId, lot.date ?? null, lot.quantity, lot.unit_price, lot.fees ?? 0]
    )
  }
}

// --- DCA (investissement programmé) ---

export async function getDcaPlanByAsset(assetId: number): Promise<DcaPlan | undefined> {
  return get<DcaPlan>('SELECT * FROM dca_plans WHERE asset_id = ? AND active = 1', [assetId])
}

export async function createDcaPlan(assetId: number, input: DcaPlanInput): Promise<number> {
  await run('DELETE FROM dca_plans WHERE asset_id = ?', [assetId])
  const result = await run(
    `INSERT INTO dca_plans (asset_id, amount, frequency, day_ref, start_date, fees, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [assetId, input.amount, input.frequency, input.day_ref, input.start_date, input.fees ?? 0]
  )
  return result.lastInsertRowid
}

export async function deleteDcaPlansByAsset(assetId: number): Promise<void> {
  await run('DELETE FROM asset_lots WHERE asset_id = ? AND plan_id IS NOT NULL', [assetId])
  await run('DELETE FROM dca_plans WHERE asset_id = ?', [assetId])
}

/** Remplace les lots générés par un plan DCA. */
export async function replaceDcaLots(
  assetId: number,
  planId: number,
  lots: { date: string; quantity: number; unit_price: number; fees: number }[]
): Promise<void> {
  await run('DELETE FROM asset_lots WHERE plan_id = ?', [planId])
  for (const lot of lots) {
    await run(
      'INSERT INTO asset_lots (asset_id, date, quantity, unit_price, fees, plan_id) VALUES (?, ?, ?, ?, ?, ?)',
      [assetId, lot.date, lot.quantity, lot.unit_price, lot.fees, planId]
    )
  }
}

/** Met à jour la valeur actuelle d'un actif et enregistre un instantané. */
export async function setAssetValue(id: number, value: number): Promise<void> {
  await run('UPDATE assets SET value = ?, updated_at = ? WHERE id = ?', [
    value,
    new Date().toISOString(),
    id
  ])
  await snapshotNetWorth()
}

/** Enregistre un instantané de la valeur nette totale pour aujourd'hui (un point/jour). */
async function snapshotNetWorth(): Promise<void> {
  const row = await get<{ total: number }>('SELECT COALESCE(SUM(value), 0) AS total FROM assets')
  const today = new Date().toISOString().slice(0, 10)
  await run(
    `INSERT INTO networth_snapshots (date, value) VALUES (?, ?)
     ON CONFLICT(date) DO UPDATE SET value = excluded.value`,
    [today, row?.total ?? 0]
  )
}

export async function createAsset(input: AssetInput): Promise<Asset> {
  const now = new Date().toISOString()
  const result = await run(
    `INSERT INTO assets (type, label, quantity, value, currency, symbol, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.type,
      input.label,
      input.quantity ?? null,
      input.value,
      input.currency || 'EUR',
      input.symbol ?? null,
      input.notes ?? null,
      now,
      now
    ]
  )
  const assetId = result.lastInsertRowid
  await replaceAssetLots(assetId, input.lots)
  await snapshotNetWorth()
  const assets = await getAssets()
  return assets.find((a) => a.id === assetId) as Asset
}

export async function updateAsset(id: number, input: AssetInput): Promise<void> {
  await run(
    `UPDATE assets SET type = ?, label = ?, quantity = ?, value = ?, currency = ?, symbol = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.type,
      input.label,
      input.quantity ?? null,
      input.value,
      input.currency || 'EUR',
      input.symbol ?? null,
      input.notes ?? null,
      new Date().toISOString(),
      id
    ]
  )
  await replaceAssetLots(id, input.lots)
  await snapshotNetWorth()
}

export async function deleteAsset(id: number): Promise<void> {
  await run('DELETE FROM assets WHERE id = ?', [id])
  await snapshotNetWorth()
}

export async function getPatrimoineSummary(): Promise<PatrimoineSummary> {
  const assets = await getAssets()
  const totalValue = assets.reduce((sum, a) => sum + a.value, 0)
  const byType = await all<AssetTypeBreakdown>(
    `SELECT type, SUM(value) AS total, COUNT(*) AS count
     FROM assets GROUP BY type ORDER BY total DESC`
  )
  const history = await all<{ date: string; value: number }>(
    'SELECT date, value FROM networth_snapshots ORDER BY date ASC'
  )
  // Plus/moins-value latente : uniquement les actifs suivis en lots (prix de revient connu).
  const tracked = assets.filter((a) => a.cost_basis > 0)
  const totalCostBasis = tracked.reduce((sum, a) => sum + a.cost_basis, 0)
  const totalGain = tracked.reduce((sum, a) => sum + (a.value - a.cost_basis), 0)
  return { totalValue, byType, assets, history, totalCostBasis, totalGain }
}

// --- Helpers DCA (investissement programmé) ---
// Port de src/main/ipc.ts (~lignes 681-757) : purement fonctionnel, pas d'accès DB
// ni réseau pour scheduledDates/toSec/fmtDate — applyDca combine ça avec la DB
// (replaceDcaLots/setAssetValue) et les cours (getHistoricalSeriesEur/getCurrentPriceEur).

const dayMs = 86400_000
const toSec = (isoDate: string): number => Math.floor(Date.parse(`${isoDate}T12:00:00Z`) / 1000)
const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Dates programmées d'un plan DCA, du début jusqu'à aujourd'hui. */
export function scheduledDates(plan: DcaPlan): string[] {
  const out: string[] = []
  const start = new Date(`${plan.start_date}T12:00:00Z`)
  const today = new Date()
  if (isNaN(start.getTime())) return out

  if (plan.frequency === 'hebdomadaire') {
    const target = ((plan.day_ref % 7) + 7) % 7
    const d = new Date(start)
    while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1)
    while (d.getTime() <= today.getTime()) {
      out.push(fmtDate(d))
      d.setTime(d.getTime() + 7 * dayMs)
    }
  } else {
    // mensuel
    let y = start.getUTCFullYear()
    let m = start.getUTCMonth()
    while (true) {
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
      const day = Math.min(Math.max(plan.day_ref, 1), daysInMonth)
      const d = new Date(Date.UTC(y, m, day, 12))
      if (d.getTime() > today.getTime()) break
      if (d.getTime() >= start.getTime()) out.push(fmtDate(d))
      m++
      if (m > 11) {
        m = 0
        y++
      }
    }
  }
  return out
}

/**
 * Génère les lots d'un plan DCA à partir des cours historiques, met à jour la
 * valeur actuelle de l'actif, et renvoie cette valeur.
 */
export async function applyDca(
  assetId: number,
  type: AssetType,
  symbol: string,
  plan: DcaPlan
): Promise<number> {
  let dates = scheduledDates(plan)
  // CoinGecko gratuit : historique crypto limité à ~365 jours.
  if (type === 'crypto') {
    const minSec = Math.floor(Date.now() / 1000) - 364 * 86400
    dates = dates.filter((d) => toSec(d) >= minSec)
  }
  if (dates.length === 0) {
    await replaceDcaLots(assetId, plan.id, [])
    return 0
  }

  const fromSec = toSec(dates[0]) - 3 * 86400
  const toSecNow = Math.floor(Date.now() / 1000)
  const series = await getHistoricalSeriesEur(type, symbol, fromSec, toSecNow)

  const lots: { date: string; quantity: number; unit_price: number; fees: number }[] = []
  for (const d of dates) {
    const price = priceAt(series, toSec(d))
    if (!price || price <= 0) continue
    lots.push({ date: d, quantity: plan.amount / price, unit_price: price, fees: plan.fees || 0 })
  }
  await replaceDcaLots(assetId, plan.id, lots)

  const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
  const current = await getCurrentPriceEur(type, symbol)
  const value = current ? totalQty * current : 0
  await setAssetValue(assetId, value)
  return value
}
