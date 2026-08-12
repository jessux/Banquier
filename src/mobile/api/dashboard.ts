import { all, get } from '../db'
import { normalizeMerchant } from '../../shared/merchant'
import type {
  CategoryStats,
  CategoryStatsGrouped,
  DashboardSummary,
  MonthlyStats,
  MerchantStats,
  UncategorizedSummary,
  Transaction,
  PeriodComparison,
  PeriodComparisonRow,
  NetBalance,
  RecurringFrequency,
  RecurringExpense,
  RecurringSummary
} from '../../shared/types'

function buildExclClause(excludeCategories?: string[]): { clause: string; params: unknown[] } {
  if (!excludeCategories?.length) return { clause: '', params: [] }
  const excludeNull = excludeCategories.includes('Non catégorisé')
  const real = excludeCategories.filter((c) => c !== 'Non catégorisé')
  const parents = real.filter((c) => !c.includes(' > '))
  const p: unknown[] = []
  const parts: string[] = []
  if (real.length) {
    parts.push(`t.category NOT IN (${real.map(() => '?').join(',')})`)
    p.push(...real)
  }
  for (const parent of parents) {
    parts.push('t.category NOT LIKE ?')
    p.push(`${parent} > %`)
  }

  if (excludeNull && parts.length === 0) return { clause: 'AND t.category IS NOT NULL', params: [] }
  if (excludeNull) return { clause: `AND t.category IS NOT NULL AND ${parts.join(' AND ')}`, params: p }
  if (parts.length === 0) return { clause: '', params: [] }
  return { clause: `AND (t.category IS NULL OR (${parts.join(' AND ')}))`, params: p }
}

export async function getMonthlyStats(
  months = 6,
  anchorEnd?: string,
  excludeCategories?: string[]
): Promise<MonthlyStats[]> {
  const anchor = anchorEnd ?? new Date().toISOString().slice(0, 10)
  const { clause: exclClause, params: exclParams } = buildExclClause(excludeCategories)
  return all<MonthlyStats>(
    `SELECT
      strftime('%Y-%m', t.date) AS month,
      SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END) AS total_debit,
      SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END) AS total_credit
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.date >= date(?, 'start of month', '-' || ? || ' months')
      AND t.date <= date(?, 'start of month', '+1 month', '-1 day')
      AND t.is_internal = 0 ${exclClause}
    GROUP BY month
    ORDER BY month ASC`,
    [anchor, months - 1, anchor, ...exclParams]
  )
}

export async function getCategoryStats(
  startDate?: string,
  endDate?: string,
  excludeCategories?: string[]
): Promise<CategoryStats[]> {
  const conditions: string[] = ['t.amount < 0', 't.is_internal = 0']
  const params: unknown[] = []

  if (startDate) {
    conditions.push('t.date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('t.date <= ?')
    params.push(endDate)
  }
  if (excludeCategories?.length) {
    const { clause, params: ep } = buildExclClause(excludeCategories)
    conditions.push(clause.replace(/^AND /, ''))
    params.push(...ep)
  }

  return all<CategoryStats>(
    `SELECT
      COALESCE(t.category, 'Non catégorisé') AS category,
      SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total,
      COUNT(*) AS count
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY t.category
    ORDER BY total DESC`,
    params
  )
}

export async function getCreditCategoryStats(
  startDate?: string,
  endDate?: string,
  excludeCategories?: string[]
): Promise<CategoryStats[]> {
  const conditions: string[] = ['t.amount > 0', 't.is_internal = 0']
  const params: unknown[] = []

  if (startDate) {
    conditions.push('t.date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('t.date <= ?')
    params.push(endDate)
  }
  if (excludeCategories?.length) {
    const { clause, params: ep } = buildExclClause(excludeCategories)
    conditions.push(clause.replace(/^AND /, ''))
    params.push(...ep)
  }

  return all<CategoryStats>(
    `SELECT
      COALESCE(t.category, 'Non catégorisé') AS category,
      SUM(t.amount * COALESCE(a.fx_rate, 1.0)) AS total,
      COUNT(*) AS count
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}
    GROUP BY t.category
    ORDER BY total DESC`,
    params
  )
}

function groupByParent(flat: CategoryStats[]): CategoryStatsGrouped[] {
  const parentMap = new Map<string, { total: number; count: number; subcategories: CategoryStats[] }>()

  for (const s of flat) {
    const sep = s.category.indexOf(' > ')
    if (sep !== -1) {
      const parent = s.category.slice(0, sep)
      const child = s.category.slice(sep + 3)
      if (!parentMap.has(parent)) parentMap.set(parent, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(parent)!
      entry.total += s.total
      entry.count += s.count
      entry.subcategories.push({ category: child, total: s.total, count: s.count })
    } else {
      if (!parentMap.has(s.category)) parentMap.set(s.category, { total: 0, count: 0, subcategories: [] })
      const entry = parentMap.get(s.category)!
      entry.total += s.total
      entry.count += s.count
    }
  }

  return Array.from(parentMap.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.total - a.total)
}

export async function getCategoryStatsGrouped(
  startDate?: string,
  endDate?: string,
  excludeCategories?: string[]
): Promise<CategoryStatsGrouped[]> {
  return groupByParent(await getCategoryStats(startDate, endDate, excludeCategories))
}

export async function getCreditCategoryStatsGrouped(
  startDate?: string,
  endDate?: string,
  excludeCategories?: string[]
): Promise<CategoryStatsGrouped[]> {
  return groupByParent(await getCreditCategoryStats(startDate, endDate, excludeCategories))
}

export async function getCategoryMonthlyHistory(
  category: string,
  months = 12
): Promise<{ month: string; total: number }[]> {
  const start = new Date()
  start.setMonth(start.getMonth() - months)
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
  return all<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', t.date) AS month,
      SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE t.amount < 0
      AND t.is_internal = 0
      AND (t.category = ? OR t.category LIKE ? || ' > %')
      AND t.date >= ?
    GROUP BY month
    ORDER BY month ASC`,
    [category, category, startStr]
  )
}

export async function getDashboardSummary(
  startDate?: string,
  endDate?: string,
  excludeCategories?: string[]
): Promise<DashboardSummary> {
  const today = new Date()
  const effectiveEnd = endDate ?? today.toISOString().slice(0, 10)

  let effectiveStart: string
  let prevStart: string
  let prevEnd: string

  const { clause: exclClause, params: exclParams } = buildExclClause(excludeCategories)

  if (startDate) {
    effectiveStart = startDate
    const start = new Date(startDate)
    const end = new Date(effectiveEnd)
    const durationMs = end.getTime() - start.getTime()
    const pe = new Date(start.getTime() - 86400000)
    const ps = new Date(pe.getTime() - durationMs)
    prevEnd = pe.toISOString().slice(0, 10)
    prevStart = ps.toISOString().slice(0, 10)
  } else {
    const firstRow = await get<{ d: string | null }>(
      `SELECT MIN(t.date) AS d FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id WHERE t.is_internal = 0 ${exclClause}`,
      exclParams
    )
    effectiveStart = firstRow?.d ?? today.toISOString().slice(0, 7) + '-01'
    const pmFirst = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const pmLast = new Date(today.getFullYear(), today.getMonth(), 0)
    prevStart = pmFirst.toISOString().slice(0, 10)
    prevEnd = pmLast.toISOString().slice(0, 10)
  }

  const periodStats = async (s: string, e: string): Promise<{ total_debit: number; total_credit: number }> => {
    const row = await get<{ total_debit: number | null; total_credit: number | null }>(
      `SELECT
        SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END) AS total_debit,
        SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END) AS total_credit
      FROM transactions t
      LEFT JOIN accounts a ON t.account_id = a.id
      WHERE t.date >= ? AND t.date <= ? AND t.is_internal = 0 ${exclClause}`,
      [s, e, ...exclParams]
    )
    return { total_debit: row?.total_debit ?? 0, total_credit: row?.total_credit ?? 0 }
  }

  const current = await periodStats(effectiveStart, effectiveEnd)
  const previous = await periodStats(prevStart, prevEnd)
  const countRow = await get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions')

  const monthSpan = (fromISO: string, toISO: string): number => {
    const f = new Date(fromISO)
    const t = new Date(toISO)
    return (t.getFullYear() - f.getFullYear()) * 12 + (t.getMonth() - f.getMonth()) + 1
  }
  let trendMonths = 6
  let trendAnchor: string | undefined
  let trendHighlightStart: string | null = null
  let trendHighlightEnd: string | null = null
  if (startDate) {
    trendMonths = Math.max(6, monthSpan(effectiveStart, effectiveEnd))
    trendAnchor = effectiveEnd
    trendHighlightStart = effectiveStart.slice(0, 7)
    trendHighlightEnd = effectiveEnd.slice(0, 7)
  } else {
    trendMonths = Math.max(6, monthSpan(effectiveStart, effectiveEnd))
    trendAnchor = effectiveEnd
  }

  return {
    periodDebit: current.total_debit,
    periodCredit: current.total_credit,
    previousPeriodDebit: previous.total_debit,
    totalTransactions: countRow?.n ?? 0,
    topCategories: await getCategoryStatsGrouped(effectiveStart, effectiveEnd, excludeCategories),
    topIncomeCategories: await getCreditCategoryStatsGrouped(effectiveStart, effectiveEnd, excludeCategories),
    monthlyTrend: await getMonthlyStats(trendMonths, trendAnchor, excludeCategories),
    trendHighlightStart,
    trendHighlightEnd
  }
}

export async function getTopMerchants(startDate?: string, endDate?: string, limit = 15): Promise<MerchantStats[]> {
  const conditions = ['amount < 0', 'is_internal = 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('date <= ?')
    params.push(endDate)
  }

  const rows = await all<{ description: string; amount: number }>(
    `SELECT description, amount FROM transactions WHERE ${conditions.join(' AND ')}`,
    params
  )

  const map = new Map<string, { total: number; count: number }>()
  for (const r of rows) {
    const key = normalizeMerchant(r.description)
    const entry = map.get(key) ?? { total: 0, count: 0 }
    entry.total += Math.abs(r.amount)
    entry.count += 1
    map.set(key, entry)
  }

  return Array.from(map.entries())
    .map(([merchant, v]) => ({ merchant, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.min(limit, 50))
}

export async function getLargestTransactions(
  startDate?: string,
  endDate?: string,
  limit = 10,
  direction: 'debit' | 'credit' = 'debit'
): Promise<Transaction[]> {
  const conditions = ['is_internal = 0', direction === 'credit' ? 'amount > 0' : 'amount < 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('date <= ?')
    params.push(endDate)
  }

  return all<Transaction>(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')}
     ORDER BY ABS(amount) DESC LIMIT ${Math.min(limit, 50)}`,
    params
  )
}

export async function comparePeriods(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): Promise<PeriodComparison> {
  const a = await getCategoryStats(aStart, aEnd)
  const b = await getCategoryStats(bStart, bEnd)
  const byCat = new Map<string, { totalA: number; totalB: number }>()

  for (const s of a) {
    const e = byCat.get(s.category) ?? { totalA: 0, totalB: 0 }
    e.totalA += s.total
    byCat.set(s.category, e)
  }
  for (const s of b) {
    const e = byCat.get(s.category) ?? { totalA: 0, totalB: 0 }
    e.totalB += s.total
    byCat.set(s.category, e)
  }

  const categories: PeriodComparisonRow[] = Array.from(byCat.entries())
    .map(([category, v]) => ({
      category,
      totalA: v.totalA,
      totalB: v.totalB,
      diff: v.totalB - v.totalA,
      pct: v.totalA > 0 ? ((v.totalB - v.totalA) / v.totalA) * 100 : null
    }))
    .sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff))

  const sum = (rows: CategoryStats[]): number => rows.reduce((acc, r) => acc + r.total, 0)

  return {
    periodA: { startDate: aStart, endDate: aEnd, totalDebit: sum(a) },
    periodB: { startDate: bStart, endDate: bEnd, totalDebit: sum(b) },
    categories
  }
}

export async function getNetBalance(startDate?: string, endDate?: string): Promise<NetBalance> {
  const conditions = ['t.is_internal = 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('t.date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('t.date <= ?')
    params.push(endDate)
  }

  const row = await get<{ total_credit: number; total_debit: number }>(
    `SELECT
      COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount * COALESCE(a.fx_rate, 1.0) ELSE 0 END), 0) AS total_credit,
      COALESCE(SUM(CASE WHEN t.amount < 0 THEN ABS(t.amount * COALESCE(a.fx_rate, 1.0)) ELSE 0 END), 0) AS total_debit
    FROM transactions t
    LEFT JOIN accounts a ON t.account_id = a.id
    WHERE ${conditions.join(' AND ')}`,
    params
  )

  const totalCredit = row?.total_credit ?? 0
  const totalDebit = row?.total_debit ?? 0

  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    totalCredit,
    totalDebit,
    net: totalCredit - totalDebit
  }
}

export async function getUncategorized(startDate?: string, endDate?: string, limit = 20): Promise<UncategorizedSummary> {
  const conditions = ['category IS NULL', 'is_internal = 0', 'amount < 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('date <= ?')
    params.push(endDate)
  }
  const where = `WHERE ${conditions.join(' AND ')}`

  const agg = await get<{ count: number; total: number }>(
    `SELECT COUNT(*) AS count, COALESCE(SUM(ABS(amount)), 0) AS total FROM transactions ${where}`,
    params
  )

  const sample = await all<Transaction>(
    `SELECT * FROM transactions ${where} ORDER BY ABS(amount) DESC LIMIT ${Math.min(limit, 50)}`,
    params
  )

  return { count: agg?.count ?? 0, total: agg?.total ?? 0, sample }
}

// --- Dépenses récurrentes (abonnements, prélèvements réguliers) ---

const RECURRING_FREQUENCIES: { freq: RecurringFrequency; days: number; perMonth: number }[] = [
  { freq: 'hebdomadaire', days: 7, perMonth: 52 / 12 },
  { freq: 'mensuel', days: 30, perMonth: 1 },
  { freq: 'bimestriel', days: 60, perMonth: 1 / 2 },
  { freq: 'trimestriel', days: 91, perMonth: 1 / 3 },
  { freq: 'semestriel', days: 182, perMonth: 1 / 6 },
  { freq: 'annuel', days: 365, perMonth: 1 / 12 }
]

/** Associe un intervalle médian (en jours) à la fréquence la plus proche, ou null si trop éloigné. */
function classifyFrequency(medianDays: number): { freq: RecurringFrequency; perMonth: number } | null {
  let best: { freq: RecurringFrequency; perMonth: number } | null = null
  let bestErr = Infinity
  for (const f of RECURRING_FREQUENCIES) {
    const err = Math.abs(medianDays - f.days) / f.days
    // tolérance de 25 % autour de la fréquence théorique
    if (err <= 0.25 && err < bestErr) {
      bestErr = err
      best = { freq: f.freq, perMonth: f.perMonth }
    }
  }
  return best
}

function mostCommonCategory(txs: Transaction[]): string | null {
  const counts = new Map<string, number>()
  for (const t of txs) {
    if (!t.category) continue
    counts.set(t.category, (counts.get(t.category) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [cat, n] of counts) {
    if (n > bestN) {
      best = cat
      bestN = n
    }
  }
  return best
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

export async function getRecurringExpenses(startDate?: string, endDate?: string): Promise<RecurringSummary> {
  return detectRecurringTransactions('debit', startDate, endDate)
}

/** Revenus récurrents (salaire, virements réguliers…) — même algorithme que
 *  getRecurringExpenses, appliqué aux transactions créditrices. */
export async function getRecurringIncome(startDate?: string, endDate?: string): Promise<RecurringSummary> {
  return detectRecurringTransactions('credit', startDate, endDate)
}

async function detectRecurringTransactions(
  direction: 'debit' | 'credit',
  startDate?: string,
  endDate?: string
): Promise<RecurringSummary> {
  const conditions = [direction === 'debit' ? 'amount < 0' : 'amount > 0', 'is_internal = 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('date <= ?')
    params.push(endDate)
  }

  const rows = await all<Transaction>(
    `SELECT * FROM transactions WHERE ${conditions.join(' AND ')} ORDER BY date ASC`,
    params
  )

  // Regroupe par marchand normalisé.
  const groups = new Map<string, Transaction[]>()
  for (const r of rows) {
    const key = normalizeMerchant(r.description)
    if (!key) continue
    const arr = groups.get(key)
    if (arr) arr.push(r)
    else groups.set(key, [r])
  }

  const items: RecurringExpense[] = []
  const now = Date.now()

  for (const [merchant, txs] of groups) {
    // Au moins 3 occurrences pour confirmer une régularité.
    if (txs.length < 3) continue

    const times = txs.map((t) => new Date(t.date).getTime())
    const intervals: number[] = []
    for (let i = 1; i < times.length; i++) {
      intervals.push((times[i] - times[i - 1]) / 86_400_000)
    }
    const med = median(intervals)
    if (med <= 0) continue

    const classified = classifyFrequency(med)
    if (!classified) continue

    // Vérifie la régularité : coefficient de variation des intervalles.
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / intervals.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1
    if (cv > 0.5) continue // intervalles trop irréguliers : ce n'est pas un abonnement

    const amounts = txs.map((t) => Math.abs(t.amount))
    const averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length
    const last = txs[txs.length - 1]
    const daysSinceLast = (now - new Date(last.date).getTime()) / 86_400_000
    const active = daysSinceLast <= med * 2 // actif si dernière occurrence < 2 intervalles attendus

    const monthlyEstimate = averageAmount * classified.perMonth

    items.push({
      merchant,
      category: mostCommonCategory(txs),
      frequency: classified.freq,
      occurrences: txs.length,
      averageAmount,
      lastAmount: Math.abs(last.amount),
      firstDate: txs[0].date,
      lastDate: last.date,
      intervalDays: Math.round(med),
      monthlyEstimate,
      yearlyEstimate: monthlyEstimate * 12,
      active,
      transactions: [...txs].reverse()
    })
  }

  items.sort((a, b) => b.monthlyEstimate - a.monthlyEstimate)

  const activeItems = items.filter((i) => i.active)
  return {
    items,
    totalMonthlyActive: activeItems.reduce((acc, i) => acc + i.monthlyEstimate, 0),
    totalYearlyActive: activeItems.reduce((acc, i) => acc + i.yearlyEstimate, 0)
  }
}
