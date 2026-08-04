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
  const account = await get<Account>('SELECT * FROM accounts WHERE id = ?', [id])
  // Un compte Powens réapparaîtrait à la prochaine synchro si on ne mémorise pas
  // qu'il a été supprimé volontairement (Powens le renvoie toujours dans la liste).
  if (account?.bank?.startsWith('powens:')) {
    const powensId = account.bank.slice('powens:'.length)
    await run(
      `INSERT INTO excluded_powens_accounts (powens_id, deleted_at) VALUES (?, ?)
       ON CONFLICT(powens_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      [powensId, new Date().toISOString()]
    )
  }
  await run('DELETE FROM transactions WHERE account_id = ?', [id])
  await run('DELETE FROM accounts WHERE id = ?', [id])
}

export async function getExcludedPowensAccountIds(): Promise<Set<string>> {
  const rows = await all<{ powens_id: string }>('SELECT powens_id FROM excluded_powens_accounts')
  return new Set(rows.map((r) => r.powens_id))
}

/** Lève les exclusions posées par deleteAccount(). Réservé au parcours de
 *  connexion explicite : sans ça, un compte supprimé une fois ne pourrait plus
 *  jamais être réimporté, même en reconnectant volontairement sa banque. Les
 *  synchros (auto ou manuelle) continuent de respecter les exclusions. */
export async function clearExcludedPowensAccounts(): Promise<void> {
  await run('DELETE FROM excluded_powens_accounts')
}

export async function updateAccountCurrency(id: number, currency: string): Promise<void> {
  await run('UPDATE accounts SET currency = ? WHERE id = ?', [currency, id])
}

export async function updateAccountFxRate(id: number, fxRate: number): Promise<void> {
  await run('UPDATE accounts SET fx_rate = ? WHERE id = ?', [fxRate, id])
}

export async function updateAccountBalance(id: number, balance: number): Promise<void> {
  await run('UPDATE accounts SET balance = ? WHERE id = ?', [balance, id])
}
