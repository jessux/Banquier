import { all, get, run } from '../db'
import type { Account } from '../../shared/types'

export async function getAccounts(): Promise<Account[]> {
  return all<Account>('SELECT * FROM accounts ORDER BY name')
}

export async function createAccount(name: string, bank: string, currency: string): Promise<Account> {
  const result = await run('INSERT INTO accounts (name, bank, currency) VALUES (?, ?, ?)', [
    name,
    bank,
    currency
  ])
  return get<Account>('SELECT * FROM accounts WHERE id = ?', [result.lastInsertRowid]) as Promise<Account>
}

export async function renameAccount(id: number, name: string): Promise<void> {
  await run('UPDATE accounts SET name = ? WHERE id = ?', [name, id])
}

export async function deleteAccount(id: number): Promise<void> {
  await run('DELETE FROM transactions WHERE account_id = ?', [id])
  await run('DELETE FROM accounts WHERE id = ?', [id])
}

export async function updateAccountCurrency(id: number, currency: string): Promise<void> {
  await run('UPDATE accounts SET currency = ? WHERE id = ?', [currency, id])
}

export async function updateAccountFxRate(id: number, fxRate: number): Promise<void> {
  await run('UPDATE accounts SET fx_rate = ? WHERE id = ?', [fxRate, id])
}
