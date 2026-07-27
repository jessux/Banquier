import { all, get, run } from '../db'
import type { Budget, BudgetWithSpent } from '../../shared/types'

export async function getBudgets(): Promise<Budget[]> {
  return all<Budget>('SELECT * FROM budgets ORDER BY category')
}

export async function upsertBudget(category: string, amount: number): Promise<Budget> {
  await run(
    'INSERT INTO budgets (category, amount, period) VALUES (?, ?, ?) ON CONFLICT(category) DO UPDATE SET amount = excluded.amount',
    [category, amount, 'mensuel']
  )
  return get<Budget>('SELECT * FROM budgets WHERE category = ?', [category]) as Promise<Budget>
}

export async function deleteBudget(id: number): Promise<void> {
  await run('DELETE FROM budgets WHERE id = ?', [id])
}

export async function getBudgetsWithSpent(
  startDate?: string,
  endDate?: string
): Promise<BudgetWithSpent[]> {
  const budgets = await getBudgets()
  if (budgets.length === 0) return []

  const conditions = ['t.amount < 0', 't.is_internal = 0']
  const params: unknown[] = []
  if (startDate) {
    conditions.push('t.date >= ?')
    params.push(startDate)
  }
  if (endDate) {
    conditions.push('t.date <= ?')
    params.push(endDate)
  }

  const spentRows = await all<{ category: string; total: number }>(
    `SELECT COALESCE(t.category, 'Non catégorisé') AS category, SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY t.category`,
    params
  )

  const spentMap = new Map(spentRows.map((r) => [r.category, r.total]))

  return budgets.map((b) => {
    let spent = 0
    for (const [cat, total] of spentMap) {
      if (cat === b.category || cat.startsWith(b.category + ' > ')) {
        spent += total
      }
    }
    return { ...b, spent }
  })
}

export async function getCategoryMonthlyAverage(
  category: string,
  months = 3
): Promise<{ average: number; monthsWithData: number }> {
  const escaped = category.replace(/[\\%_]/g, '\\$&')
  const rows = await all<{ month: string; total: number }>(
    `SELECT strftime('%Y-%m', t.date) AS month, SUM(ABS(t.amount * COALESCE(a.fx_rate, 1.0))) AS total
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE t.amount < 0 AND t.is_internal = 0
       AND (t.category = ? OR t.category LIKE ? ESCAPE '\\')
       AND t.date >= date('now', 'start of month', '-' || ? || ' months')
       AND t.date < date('now', 'start of month')
     GROUP BY month`,
    [category, `${escaped} > %`, months]
  )
  if (rows.length === 0) return { average: 0, monthsWithData: 0 }
  const total = rows.reduce((s, r) => s + r.total, 0)
  return { average: total / rows.length, monthsWithData: rows.length }
}
