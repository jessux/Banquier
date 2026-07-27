import { all, get } from '../db'
import type { CategoryStats, CategoryStatsGrouped, DashboardSummary, MonthlyStats, MerchantStats, UncategorizedSummary, Transaction } from '../../shared/types'

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

const MERCHANT_NOISE =
  /\b(CB|CARTE|PAIEMENT|PAIMT|ACHAT|RETRAIT|DU|LE|FACTURE|FACT|PRLV|PRELEVEMENT|PRELVT|VIR|VIREMENT|SEPA|REF|MANDAT|ID|EUR)\b/g

function normalizeMerchant(desc: string): string {
  const cleaned = desc
    .toUpperCase()
    .replace(/[0-9]+([./-][0-9]+)*/g, ' ')
    .replace(MERCHANT_NOISE, ' ')
    .replace(/[^A-ZÀ-Ü ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join(' ')
  return cleaned || desc.trim().slice(0, 30).toUpperCase()
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
