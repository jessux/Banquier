import * as accounts from './api/accounts'
import * as importsApi from './api/imports'
import * as transactionsApi from './api/transactions'
import * as rulesApi from './api/rules'
import {
  getAccounts as getPowensAccounts,
  getTransactions as getPowensTransactions,
  type PowensCreds
} from './powens'
import type { PowensSyncResult } from '../shared/types'

/** Port de l'helper importPowens de src/main/ipc.ts : récupère comptes +
 *  transactions Powens et les importe dans la base SQLite locale du téléphone. */
let syncQueue: Promise<unknown> = Promise.resolve()

export function importPowens(
  creds: PowensCreds,
  token: string,
  minDate?: string,
  maxDate?: string
): Promise<PowensSyncResult> {
  // La sync auto au démarrage (App.tsx) peut tourner ~90 s. Deux imports
  // concurrents créaient des comptes en double (createAccount tourne hors
  // transaction) — on les met donc à la queue leu leu.
  //
  // On sérialise, sans jamais partager le résultat d'un import déjà en cours :
  // celui-ci a photographié la liste des comptes AVANT que l'utilisateur ne
  // connecte sa banque, donc le renvoyer à powensConnect ferait disparaître le
  // compte tout juste ajouté. Chaque appel doit refaire son propre fetch.
  const result = syncQueue.then(() => doImportPowens(creds, token, minDate, maxDate))
  syncQueue = result.then(
    () => undefined,
    () => undefined
  )
  return result
}

async function doImportPowens(
  creds: PowensCreds,
  token: string,
  minDate?: string,
  maxDate?: string
): Promise<PowensSyncResult> {
  // Powens synchronise la banque de façon asynchrone. On attend :
  //   1. qu'au moins un compte apparaisse (jusqu'à ~30 s, 10 × 3 s)
  //   2. que les transactions arrivent (jusqu'à ~60 s supplémentaires, 12 × 5 s)
  let powensAccounts = await getPowensAccounts(creds, token)
  for (let i = 0; i < 10 && powensAccounts.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    powensAccounts = await getPowensAccounts(creds, token)
  }
  let result =
    powensAccounts.length > 0
      ? await getPowensTransactions(creds, token, minDate, maxDate)
      : { transactions: [], firstDate: null }

  if (powensAccounts.length > 0 && result.transactions.length === 0) {
    for (let i = 0; i < 12 && result.transactions.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      result = await getPowensTransactions(creds, token, minDate, maxDate)
    }
  }

  let transactions = result.transactions
  const firstDate = result.firstDate
  if (minDate) transactions = transactions.filter((t) => (t.rdate || t.date || '').slice(0, 10) >= minDate)
  if (maxDate) transactions = transactions.filter((t) => (t.rdate || t.date || '').slice(0, 10) <= maxDate)

  // Mappe chaque compte Powens vers un compte Banquier (clé : bank = "powens:<id>"),
  // en ignorant les comptes que l'utilisateur a explicitement supprimés côté Banquier.
  const excludedPowensIds = await accounts.getExcludedPowensAccountIds()
  const existing = await accounts.getAccounts()
  const accountIdByPowens = new Map<number, number>()
  for (const acc of powensAccounts) {
    if (excludedPowensIds.has(String(acc.id))) continue
    const key = `powens:${acc.id}`
    const found = existing.find((a) => a.bank === key)
    const accountId = found?.id ?? (await accounts.createAccount(acc.name || 'Compte', key, acc.currency?.id || 'EUR')).id
    accountIdByPowens.set(acc.id, accountId)
    if (acc.balance != null) await accounts.updateAccountBalance(accountId, acc.balance)
  }

  const rows = transactions
    .filter((t) => !t.coming)
    .filter((t) => !excludedPowensIds.has(String(t.id_account)))
    .map((t) => ({
      account_id: accountIdByPowens.get(t.id_account) ?? null,
      date: (t.rdate || t.date || '').slice(0, 10),
      description: (t.wording || t.original_wording || t.simplified_wording || 'Transaction').trim(),
      amount: t.value,
      category: null,
      import_id: null,
      is_internal: 0,
      note: null,
      tags: null
    }))
    .filter((r) => r.date && r.amount != null)

  if (rows.length === 0) {
    return { imported: 0, duplicates: 0, accounts: powensAccounts.length, categorized: 0, firstDate }
  }

  const importRecord = await importsApi.createImport('Powens', rows.length)
  const withImport = rows.map((r) => ({ ...r, import_id: importRecord.id }))
  const { imported, duplicates, insertedIds } = await transactionsApi.insertTransactions(withImport, importRecord.id)

  // On ré-applique les règles aux transactions nouvellement insérées ET à toutes
  // celles encore non catégorisées de ces comptes.
  const accountIds = [...accountIdByPowens.values()]
  const targetIds = new Set<number>(insertedIds)
  for (const id of await transactionsApi.getUncategorizedTransactionIds(accountIds)) targetIds.add(id)
  const categorized = targetIds.size > 0 ? await rulesApi.applyRulesToTransactions([...targetIds]) : 0

  return { imported, duplicates, accounts: powensAccounts.length, categorized, firstDate }
}
