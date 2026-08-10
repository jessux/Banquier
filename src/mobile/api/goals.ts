import { all, get, run } from '../db'
import type { Account, SavingsGoal, SavingsGoalWithProgress } from '../../shared/types'

export async function getSavingsGoals(): Promise<SavingsGoal[]> {
  return all<SavingsGoal>('SELECT * FROM savings_goals WHERE archived = 0 ORDER BY created_at DESC')
}

export async function createSavingsGoal(
  name: string,
  targetAmount: number,
  targetDate: string | null,
  accountId: number | null
): Promise<SavingsGoal> {
  const now = new Date().toISOString()
  const result = await run(
    'INSERT INTO savings_goals (name, target_amount, target_date, account_id, manual_amount, created_at, archived) VALUES (?, ?, ?, ?, 0, ?, 0)',
    [name.trim(), targetAmount, targetDate, accountId, now]
  )
  return get<SavingsGoal>('SELECT * FROM savings_goals WHERE id = ?', [result.lastInsertRowid]) as Promise<SavingsGoal>
}

export async function updateSavingsGoal(
  id: number,
  name: string,
  targetAmount: number,
  targetDate: string | null,
  accountId: number | null
): Promise<void> {
  await run(
    'UPDATE savings_goals SET name = ?, target_amount = ?, target_date = ?, account_id = ? WHERE id = ?',
    [name.trim(), targetAmount, targetDate, accountId, id]
  )
}

export async function updateSavingsGoalAmount(id: number, amount: number): Promise<void> {
  await run('UPDATE savings_goals SET manual_amount = ? WHERE id = ?', [Math.max(0, amount), id])
}

export async function deleteSavingsGoal(id: number): Promise<void> {
  await run('DELETE FROM savings_goals WHERE id = ?', [id])
}

export async function getSavingsGoalsWithProgress(): Promise<SavingsGoalWithProgress[]> {
  const goals = await getSavingsGoals()
  if (goals.length === 0) return []
  const accounts = await all<Account>('SELECT * FROM accounts')
  const accountById = new Map(accounts.map((a) => [a.id, a]))

  return goals.map((g) => {
    if (g.account_id != null) {
      const account = accountById.get(g.account_id)
      const balanceKnown = account?.balance != null
      const currentAmount = balanceKnown ? (account!.balance as number) * account!.fx_rate : 0
      return { ...g, currentAmount, balanceKnown, accountName: account?.name ?? null }
    }
    return { ...g, currentAmount: g.manual_amount, balanceKnown: true, accountName: null }
  })
}
