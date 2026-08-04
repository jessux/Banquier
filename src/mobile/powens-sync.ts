import * as accounts from './api/accounts'
import * as importsApi from './api/imports'
import * as transactionsApi from './api/transactions'
import * as rulesApi from './api/rules'
import * as notifications from './notifications'
import {
  getAccounts as getPowensAccounts,
  getConnections,
  getTransactions as getPowensTransactions,
  classifyConnection,
  connectionErrorLabel,
  type PowensCreds
} from './powens'
import type { PowensProgress, PowensSyncResult } from '../shared/types'

/** Port de l'helper importPowens de src/main/ipc.ts : récupère comptes +
 *  transactions Powens et les importe dans la base SQLite locale du téléphone. */
let syncQueue: Promise<unknown> = Promise.resolve()

// --- Avancement observable ---------------------------------------------------

/**
 * Un import peut durer plusieurs minutes (le temps que la banque réponde à
 * Powens). Sans retour d'étape, l'UI ne peut afficher qu'un « Patientez… » figé,
 * ce qui donne l'impression que l'app est bloquée. On publie donc l'étape courante
 * à qui veut l'écouter (voir `onPowensProgress` dans window-api.ts).
 */
type ProgressListener = (p: PowensProgress) => void
const listeners = new Set<ProgressListener>()
let lastProgress: PowensProgress = { phase: 'idle', message: '' }

export function onProgress(cb: ProgressListener): () => void {
  listeners.add(cb)
  if (lastProgress.phase !== 'idle') cb(lastProgress)
  return () => listeners.delete(cb)
}

export function emitProgress(phase: PowensProgress['phase'], message: string): void {
  lastProgress = { phase, message }
  for (const cb of listeners) {
    try {
      cb(lastProgress)
    } catch (err) {
      console.error('[powens-progress]', err)
    }
  }
}

// --- Attente de la banque ----------------------------------------------------

/** Powens interroge la banque de façon asynchrone. Tant qu'une connexion n'a pas
 *  de `last_update`, ses transactions n'existent pas encore côté API. */
const CONNECTION_POLL_MS = 3000
const CONNECTION_TIMEOUT_MS = 240_000

interface ConnectionWait {
  /** Au moins une banque a fini de se synchroniser. */
  ready: boolean
  /** Banques en erreur (identifiants refusés, authentification forte…). */
  errors: string[]
  /** La banque n'a pas répondu dans le délai imparti. */
  timedOut: boolean
}

/**
 * Attend que Powens ait fini de rapatrier les données bancaires, en lisant l'état
 * réel des connexions plutôt qu'en attendant un délai fixe.
 *
 * C'est ce qui remplace l'ancien polling à l'aveugle (10 × 3 s puis 12 × 5 s) : on
 * repart dès que la banque a répondu — souvent en quelques secondes — au lieu
 * d'attendre systématiquement, et surtout on sait *pourquoi* rien n'arrive quand
 * la connexion est en erreur, au lieu de renvoyer silencieusement 0 transaction.
 */
async function waitForConnections(creds: PowensCreds, token: string): Promise<ConnectionWait> {
  const deadline = Date.now() + CONNECTION_TIMEOUT_MS
  let errors: string[] = []

  for (;;) {
    let connections
    try {
      connections = await getConnections(creds, token)
    } catch (err) {
      // L'endpoint connections n'est pas indispensable : en cas d'échec on laisse
      // l'import tenter sa chance plutôt que de tout faire échouer.
      console.warn('[powens-sync] lecture des connexions impossible', err)
      return { ready: true, errors: [], timedOut: false }
    }

    const active = connections.filter((c) => c.active !== false)
    if (active.length === 0) return { ready: true, errors: [], timedOut: false }

    const statuses = active.map(classifyConnection)
    errors = active.filter((c) => classifyConnection(c) === 'error').map(connectionErrorLabel)

    const syncing = statuses.filter((s) => s === 'syncing').length
    if (syncing === 0) {
      return { ready: statuses.includes('ok'), errors, timedOut: false }
    }

    if (Date.now() >= deadline) return { ready: statuses.includes('ok'), errors, timedOut: true }

    emitProgress(
      'waiting',
      syncing > 1
        ? `Votre banque prépare vos données (${syncing} connexions en cours)…`
        : 'Votre banque prépare vos données…'
    )
    await new Promise((r) => setTimeout(r, CONNECTION_POLL_MS))
  }
}

// --- Import ------------------------------------------------------------------

export function importPowens(
  creds: PowensCreds,
  token: string,
  minDate?: string,
  maxDate?: string
): Promise<PowensSyncResult> {
  // La sync auto au démarrage (App.tsx) peut tourner plusieurs minutes. Deux
  // imports concurrents créaient des comptes en double (createAccount tourne hors
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
  emitProgress('waiting', 'Vérification de vos connexions bancaires…')
  const wait = await waitForConnections(creds, token)

  emitProgress('importing', 'Récupération de vos comptes…')
  let powensAccounts = await getPowensAccounts(creds, token)
  // Les comptes apparaissent juste après la fin de synchro de la connexion : une
  // courte attente suffit ici, l'attente longue a déjà été faite ci-dessus.
  for (let i = 0; i < 5 && powensAccounts.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    powensAccounts = await getPowensAccounts(creds, token)
  }

  const warning = buildWarning(wait, powensAccounts.length)

  if (powensAccounts.length === 0) {
    emitProgress('done', 'Aucun compte récupéré.')
    return { imported: 0, duplicates: 0, accounts: 0, categorized: 0, firstDate: null, warning }
  }

  emitProgress('importing', 'Récupération de vos transactions…')
  let result = await getPowensTransactions(creds, token, minDate, maxDate)

  // Powens expose parfois les comptes avant d'avoir fini d'écrire les
  // transactions : on retente brièvement, mais seulement si la banque a bien
  // terminé sa synchro (sinon c'est l'attente ci-dessus qui a déjà échoué).
  if (result.transactions.length === 0 && wait.ready && !wait.timedOut) {
    for (let i = 0; i < 6 && result.transactions.length === 0; i++) {
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
    emitProgress('done', 'Aucune nouvelle transaction.')
    return {
      imported: 0,
      duplicates: 0,
      accounts: powensAccounts.length,
      categorized: 0,
      firstDate,
      warning
    }
  }

  emitProgress('importing', `Enregistrement de ${rows.length} transactions…`)
  const importRecord = await importsApi.createImport('Powens', rows.length)
  const withImport = rows.map((r) => ({ ...r, import_id: importRecord.id }))
  const { imported, duplicates, insertedIds } = await transactionsApi.insertTransactions(withImport, importRecord.id)

  // On ré-applique les règles aux transactions nouvellement insérées ET à toutes
  // celles encore non catégorisées de ces comptes.
  emitProgress('importing', 'Catégorisation automatique…')
  const accountIds = [...accountIdByPowens.values()]
  const targetIds = new Set<number>(insertedIds)
  for (const id of await transactionsApi.getUncategorizedTransactionIds(accountIds)) targetIds.add(id)
  const categorized = targetIds.size > 0 ? await rulesApi.applyRulesToTransactions([...targetIds]) : 0

  emitProgress('done', `${imported} nouvelle(s) transaction(s).`)

  // Notification système : la synchro est longue, l'utilisateur a très
  // probablement quitté l'app entre-temps — un toast HTML ne l'atteindrait pas.
  void notifications.syncDone(imported, categorized)
  if (warning) void notifications.syncWarning(warning)

  return { imported, duplicates, accounts: powensAccounts.length, categorized, firstDate, warning }
}

/** Message expliquant pourquoi la récupération est vide ou partielle. */
function buildWarning(wait: ConnectionWait, accountCount: number): string | undefined {
  if (wait.errors.length > 0) return wait.errors.join(' · ')
  if (wait.timedOut) {
    return "Votre banque met plus longtemps que prévu à répondre. Les transactions manquantes arriveront à la prochaine synchronisation."
  }
  if (accountCount === 0) {
    return "Aucun compte n'a été renvoyé par Powens. Vérifiez que la banque est bien rattachée."
  }
  return undefined
}
