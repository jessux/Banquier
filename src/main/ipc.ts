import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import Store from 'electron-store'
import path from 'path'
import * as db from './database'
import { previewCsv, parseCsvToTransactions } from './parsers/csv'
import { extractPdfText, buildPdfParsePrompt, parseLlmJsonResponse } from './parsers/pdf'
import {
  callOpenRouterOnce,
  runFinancialChat,
  buildFinancialSystemPrompt,
  buildChatMessages,
  categorizeBatch
} from './llm'
import { startMobileServer, stopMobileServer, isMobileServerRunning } from './mobile-server'
import {
  listInstitutions,
  connectInstitution,
  getAccountDetails,
  getAccountTransactions
} from './openbanking'
import type { GcTransaction } from './openbanking'
import {
  checkWoob,
  installWoob,
  listBanks,
  getFields as getWoobFields,
  connectBank,
  type TwoFaRequest
} from './woob'
import { randomUUID } from 'crypto'
import type {
  Settings,
  CsvMapping,
  TransactionFilters,
  GoCardlessCreds,
  BankSyncResult,
  Transaction
} from '../shared/types'

interface StoreSchema {
  settings: Settings
}

// Résolveurs en attente pour les demandes 2FA Woob (clé = requestId).
const pending2fa = new Map<string, (answer: Record<string, unknown>) => void>()

const store = new Store<StoreSchema>({
  defaults: {
    settings: {
      openrouterApiKey: '',
      openrouterModel: 'openrouter/free',
      currency: 'EUR',
      locale: 'fr-FR'
    }
  }
})

export function registerIpcHandlers(): void {
  // --- Accounts ---
  ipcMain.handle('get-accounts', () => db.getAccounts())
  ipcMain.handle('create-account', (_, name: string, bank: string, currency: string) =>
    db.createAccount(name, bank, currency)
  )

  // --- Transactions ---
  ipcMain.handle('get-transactions', (_, filters?: TransactionFilters) =>
    db.getTransactions(filters)
  )
  ipcMain.handle('update-transaction-category', (_, id: number, category: string, applyToSimilar?: boolean) =>
    db.updateTransactionCategory(id, category, applyToSimilar)
  )
  ipcMain.handle('delete-transactions', (_, importId: number) =>
    db.deleteTransactionsByImport(importId)
  )
  ipcMain.handle('get-categories', () => db.getDistinctCategories())
  ipcMain.handle('count-pattern', (_, pattern: string) => db.countTransactionsByPattern(pattern))
  ipcMain.handle('apply-category-pattern', (_, category: string, pattern: string) => {
    const updated = db.updateCategoryByPattern(category, pattern)
    db.upsertCategoryRule(pattern, category)
    return updated
  })
  ipcMain.handle('get-category-tree', () => db.getCategoryTree())
  ipcMain.handle('get-category-paths', () => db.getCategoryPaths())
  ipcMain.handle('create-category', (_, name: string, parentId?: number) =>
    db.createCategory(name, parentId)
  )
  ipcMain.handle('delete-category', (_, id: number) => db.deleteCategory(id))
  ipcMain.handle('rename-category', (_, id: number, name: string) => db.renameCategory(id, name))
  ipcMain.handle('set-transaction-internal', (_, id: number, isInternal: boolean) =>
    db.setTransactionInternal(id, isInternal)
  )
  ipcMain.handle('set-internal-by-category', (_, category: string, isInternal: boolean) =>
    db.setTransactionInternalByCategory(category, isInternal)
  )
  ipcMain.handle('delete-transaction', (_, id: number) => db.deleteTransaction(id))
  ipcMain.handle('find-duplicates', () => db.findDuplicateTransactions())
  ipcMain.handle('get-category-rules-all', () => db.getCategoryRulesWithId())
  ipcMain.handle('delete-category-rule', (_, id: number) => db.deleteCategoryRule(id))
  ipcMain.handle('update-category-rule', (_, id: number, pattern: string, category: string) =>
    db.updateCategoryRule(id, pattern, category)
  )
  ipcMain.handle('upsert-category-rule', (_, pattern: string, category: string) =>
    db.upsertCategoryRule(pattern, category)
  )

  // --- CSV Import ---
  ipcMain.handle('preview-csv', (_, filePath: string) => previewCsv(filePath))

  ipcMain.handle(
    'import-csv',
    (_, filePath: string, mapping: CsvMapping, accountId: number | null) => {
      const transactions = parseCsvToTransactions(filePath, mapping, accountId)
      const filename = path.basename(filePath)
      const importRecord = db.createImport(filename, transactions.length)
      const txWithImport = transactions.map((t) => ({ ...t, import_id: importRecord.id }))
      const { imported, duplicates, insertedIds } = db.insertTransactions(txWithImport, importRecord.id)
      if (insertedIds.length > 0) db.applyRulesToTransactions(insertedIds)
      return { imported, duplicates, errors: 0, importId: importRecord.id }
    }
  )

  // --- PDF Import ---
  ipcMain.handle('import-pdf', async (_, filePath: string, accountId: number | null) => {
    const text = await extractPdfText(filePath)
    const prompt = buildPdfParsePrompt(text)
    const settings = store.get('settings')

    const response = await callOpenRouterOnce(
      [{ role: 'user', content: prompt }],
      settings
    )

    const transactions = parseLlmJsonResponse(response)
    if (transactions.length === 0) {
      return { imported: 0, duplicates: 0, errors: 1, importId: -1 }
    }

    const txWithAccount = transactions.map((t) => ({ ...t, account_id: accountId }))
    const filename = path.basename(filePath)
    const importRecord = db.createImport(filename, txWithAccount.length)
    const txWithImport = txWithAccount.map((t) => ({ ...t, import_id: importRecord.id }))
    const { imported, duplicates, insertedIds } = db.insertTransactions(txWithImport, importRecord.id)
    if (insertedIds.length > 0) db.applyRulesToTransactions(insertedIds)
    return { imported, duplicates, errors: 0, importId: importRecord.id }
  })

  // --- Imports ---
  ipcMain.handle('get-imports', () => db.getImports())

  // --- Stats ---
  ipcMain.handle('get-monthly-stats', (_, months?: number) => db.getMonthlyStats(months))
  ipcMain.handle('get-category-stats', (_, startDate?: string, endDate?: string) =>
    db.getCategoryStats(startDate, endDate)
  )
  ipcMain.handle('get-dashboard-summary', (_, startDate?: string, endDate?: string, excludeCategories?: string[]) =>
    db.getDashboardSummary(startDate, endDate, excludeCategories)
  )
  ipcMain.handle('get-recurring-expenses', (_, startDate?: string, endDate?: string) =>
    db.getRecurringExpenses(startDate, endDate)
  )

  // --- AI Categorization ---
  ipcMain.handle('categorize-ai', async (event, onlyUncategorized: boolean) => {
    const settings = store.get('settings')
    const rules = db.getCategoryRules()

    // First pass: apply pattern rules (deterministic, always takes priority)
    const allTxForRules = db.getTransactions({})
    const ruleTargets = onlyUncategorized ? allTxForRules.filter((t) => !t.category) : allTxForRules
    if (ruleTargets.length > 0) db.applyRulesToTransactions(ruleTargets.map((t) => t.id))

    // Second pass: AI for remaining uncategorized transactions
    const afterRules = db.getTransactions({})
    const toProcess = afterRules.filter((t) => !t.category)

    if (toProcess.length === 0) return { updated: 0 }

    const BATCH_SIZE = 30
    let updated = 0
    const batches = Math.ceil(toProcess.length / BATCH_SIZE)

    event.sender.send('categorize-progress', { done: 0, total: toProcess.length })

    for (let i = 0; i < batches; i++) {
      const batch = toProcess.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)

      try {
        const catPaths = db.getCategoryPaths()
        const results = await categorizeBatch(
          batch.map((t) => ({ id: t.id, description: t.description, amount: t.amount })),
          settings,
          catPaths.length > 0 ? catPaths : undefined,
          rules
        )
        db.batchUpdateCategories(results)
        updated += results.length
      } catch (err) {
        console.error(`[categorize-ai] batch ${i + 1}/${batches} failed:`, err)
      }

      event.sender.send('categorize-progress', {
        done: Math.min((i + 1) * BATCH_SIZE, toProcess.length),
        total: toProcess.length
      })
    }

    return { updated }
  })

  // --- Chat threads (mémoire conversationnelle) ---
  ipcMain.handle('chat-threads-list', () => db.getChatThreads())
  ipcMain.handle('chat-thread-create', () => db.createChatThread())
  ipcMain.handle('chat-thread-messages', (_, threadId: number) => db.getChatMessages(threadId))
  ipcMain.handle('chat-thread-rename', (_, id: number, title: string) => db.renameChatThread(id, title))
  ipcMain.handle('chat-thread-delete', (_, id: number) => db.deleteChatThread(id))

  // --- LLM Chat ---
  ipcMain.handle('chat', async (event, threadId: number, content: string) => {
    const settings = store.get('settings')

    // Persiste le message utilisateur et (au besoin) titre la conversation.
    db.addChatMessage(threadId, 'user', content)
    db.autoTitleChatThread(threadId, content)

    // Reconstruit l'historique complet du thread depuis la base.
    const history = db.getChatMessages(threadId)
    const summary = db.getDashboardSummary()
    const systemPrompt = buildFinancialSystemPrompt(summary, settings.currency)
    const initialMessages = buildChatMessages(history, systemPrompt)

    const toolExecutors = {
      getTransactions: (filters: Record<string, unknown>) =>
        db.getTransactions(filters as Parameters<typeof db.getTransactions>[0]),
      getCategoryStats: (startDate?: string, endDate?: string) =>
        db.getCategoryStats(startDate, endDate),
      getMonthlyStats: (months?: number) =>
        db.getMonthlyStats(months),
      getAccounts: () =>
        db.getAccounts(),
      getTopMerchants: (startDate?: string, endDate?: string, limit?: number) =>
        db.getTopMerchants(startDate, endDate, limit),
      getLargestTransactions: (startDate?: string, endDate?: string, limit?: number, direction?: 'debit' | 'credit') =>
        db.getLargestTransactions(startDate, endDate, limit, direction),
      comparePeriods: (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
        db.comparePeriods(aStart, aEnd, bStart, bEnd),
      getUncategorized: (startDate?: string, endDate?: string, limit?: number) =>
        db.getUncategorized(startDate, endDate, limit),
      getNetBalance: (startDate?: string, endDate?: string) =>
        db.getNetBalance(startDate, endDate)
    }

    const collectedTools: string[] = []
    let finalText = ''
    try {
      finalText = await runFinancialChat(
        initialMessages,
        settings,
        toolExecutors,
        (chunk) => event.sender.send('chat-chunk', chunk),
        (name) => {
          collectedTools.push(name)
          event.sender.send('chat-tool-call', name)
        }
      )
    } catch (e) {
      const errMsg = `\n\n*Erreur : ${String(e)}*`
      event.sender.send('chat-chunk', errMsg)
      finalText += errMsg
    }

    // Persiste la réponse de l'assistant (avec les outils utilisés).
    db.addChatMessage(threadId, 'assistant', finalText, collectedTools)
    event.sender.send('chat-done')
  })

  // --- Settings ---
  ipcMain.handle('get-settings', () => store.get('settings'))
  ipcMain.handle('save-settings', (_, settings: Partial<Settings>) => {
    const current = store.get('settings')
    store.set('settings', { ...current, ...settings })
  })

  // --- Open Banking (GoCardless, gratuit) ---
  ipcMain.handle('gocardless-institutions', (_, country?: string) => {
    const creds = getGoCardlessCreds()
    return listInstitutions(creds, country || 'fr')
  })

  ipcMain.handle('gocardless-connect', async (_, institutionId: string): Promise<BankSyncResult> => {
    const creds = getGoCardlessCreds()
    const parent = BrowserWindow.getFocusedWindow() ?? undefined
    const { requisitionId, accounts } = await connectInstitution(creds, institutionId, parent)

    let imported = 0
    let duplicates = 0
    for (const gcAccountId of accounts) {
      const details = await getAccountDetails(creds, gcAccountId).catch(() => ({}))
      const ibanTail = details.iban ? details.iban.slice(-4) : null
      const institutionName = details.institution_id || details.name || 'Banque'

      // Réutilise le compte Banquier déjà lié, sinon en crée un.
      const existing = db.getBankConnectionByGcId(gcAccountId)
      let accountId: number
      if (existing?.account_id) {
        accountId = existing.account_id
      } else {
        const label = ibanTail ? `${institutionName} ··${ibanTail}` : institutionName
        accountId = db.createAccount(label, institutionName, details.currency || 'EUR').id
      }

      db.upsertBankConnection({
        gcAccountId,
        accountId,
        institutionName,
        ibanTail,
        requisitionId
      })

      const res = await importGcAccount(creds, gcAccountId, accountId, institutionName)
      imported += res.imported
      duplicates += res.duplicates
    }

    return { imported, duplicates, accounts: accounts.length }
  })

  ipcMain.handle('gocardless-sync', async (): Promise<BankSyncResult> => {
    const creds = getGoCardlessCreds()
    const connections = db.getBankConnections()
    let imported = 0
    let duplicates = 0
    for (const conn of connections) {
      if (!conn.account_id) continue
      try {
        const res = await importGcAccount(
          creds,
          conn.gc_account_id,
          conn.account_id,
          conn.institution_name || 'Banque'
        )
        imported += res.imported
        duplicates += res.duplicates
      } catch (err) {
        console.error(`[gocardless-sync] compte ${conn.gc_account_id} échoué :`, err)
      }
    }
    return { imported, duplicates, accounts: connections.length }
  })

  ipcMain.handle('gocardless-connections', () => db.getBankConnections())

  // --- Open Banking (Woob, gratuit & local) ---
  ipcMain.handle('woob-check', () => checkWoob())
  ipcMain.handle('woob-install', (event) =>
    installWoob((line) => event.sender.send('woob-install-log', line))
  )
  ipcMain.handle('woob-list', () => listBanks())
  ipcMain.handle('woob-fields', (_, module: string) => getWoobFields(module))

  ipcMain.handle(
    'woob-connect',
    async (event, module: string, config: Record<string, string>): Promise<BankSyncResult> => {
      const on2fa = (req: TwoFaRequest): Promise<Record<string, unknown>> =>
        new Promise((resolve) => {
          const requestId = randomUUID()
          pending2fa.set(requestId, resolve)
          event.sender.send('woob-2fa', { requestId, ...req })
        })

      const { accounts, transactions } = await connectBank(module, config, on2fa)
      if (accounts.length === 0) return { imported: 0, duplicates: 0, accounts: 0 }

      // Un import unique pour toute la session, dédupliqué comme un import classique.
      const importRecord = db.createImport(`Woob — ${module}`, transactions.length)
      let imported = 0
      let duplicates = 0
      for (const acc of accounts) {
        const gcAccountId = `woob:${module}:${acc.id}`
        const existing = db.getBankConnectionByGcId(gcAccountId)
        const accountId =
          existing?.account_id ??
          db.createAccount(acc.label || module, module, acc.currency || 'EUR').id
        db.upsertBankConnection({
          gcAccountId,
          accountId,
          institutionName: module,
          ibanTail: acc.iban ? acc.iban.slice(-4) : null,
          requisitionId: ''
        })

        const rows = transactions
          .filter((t) => t.account === acc.id && t.date && t.amount !== null)
          .map((t) => ({
            account_id: accountId,
            date: t.date,
            description: (t.label || 'Transaction').trim(),
            amount: t.amount as number,
            category: null,
            import_id: importRecord.id,
            is_internal: 0
          }))
        const res = db.insertTransactions(rows, importRecord.id)
        if (res.insertedIds.length > 0) db.applyRulesToTransactions(res.insertedIds)
        imported += res.imported
        duplicates += res.duplicates
      }
      return { imported, duplicates, accounts: accounts.length }
    }
  )

  ipcMain.handle('woob-2fa-answer', (_, requestId: string, answer: Record<string, unknown>) => {
    const resolve = pending2fa.get(requestId)
    if (resolve) {
      resolve(answer)
      pending2fa.delete(requestId)
    }
  })

  // --- File Dialog ---
  ipcMain.handle(
    'open-file-dialog',
    async (_, filters: { name: string; extensions: string[] }[]) => {
      const win = BrowserWindow.getFocusedWindow()
      if (!win) return null
      const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters
      })
      return result.canceled ? null : result.filePaths[0]
    }
  )

  // --- Mobile Server ---
  ipcMain.handle('start-mobile-server', async () => {
    const settings = store.get('settings')
    store.set('settings', { ...settings, mobileServerEnabled: true })
    return startMobileServer(() => store.get('settings'))
  })

  ipcMain.handle('stop-mobile-server', async () => {
    const settings = store.get('settings')
    store.set('settings', { ...settings, mobileServerEnabled: false })
    await stopMobileServer()
  })

  ipcMain.handle('get-mobile-server-status', () => ({
    running: isMobileServerRunning()
  }))

  // --- Export ---
  ipcMain.handle('export-db', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false }
    const today = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(win, {
      title: 'Exporter la base de données',
      defaultPath: `banquier-backup-${today}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    db.exportDb(result.filePath)
    return { success: true }
  })

  ipcMain.handle('export-csv', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false }
    const today = new Date().toISOString().slice(0, 10)
    const result = await dialog.showSaveDialog(win, {
      title: 'Exporter les transactions',
      defaultPath: `transactions-${today}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (result.canceled || !result.filePath) return { success: false }
    const csv = db.exportTransactionsToCsv()
    fs.writeFileSync(result.filePath, csv, 'utf8')
    return { success: true }
  })
}

// --- Helpers Open Banking ---

function getGoCardlessCreds(): GoCardlessCreds {
  const settings = store.get('settings')
  const secretId = settings.gocardlessSecretId?.trim()
  const secretKey = settings.gocardlessSecretKey?.trim()
  if (!secretId || !secretKey) {
    throw new Error(
      'Identifiants GoCardless manquants. Renseignez-les dans Paramètres → Open Banking.'
    )
  }
  return { secretId, secretKey }
}

/** Convertit une transaction GoCardless au format Banquier (débit négatif, crédit positif). */
function mapGcTransaction(tx: GcTransaction, accountId: number): Omit<Transaction, 'id'> {
  const amount = parseFloat(tx.transactionAmount.amount)
  const date =
    tx.bookingDate || tx.valueDate || (tx.bookingDateTime ? tx.bookingDateTime.slice(0, 10) : '')
  const description =
    tx.remittanceInformationUnstructured ||
    (tx.remittanceInformationUnstructuredArray || []).join(' ') ||
    (amount < 0 ? tx.creditorName : tx.debtorName) ||
    tx.creditorName ||
    tx.debtorName ||
    'Transaction'
  return {
    account_id: accountId,
    date,
    description: description.trim(),
    amount,
    category: null,
    import_id: null,
    is_internal: 0
  }
}

/** Récupère et insère les transactions d'un compte GoCardless dans la base locale. */
async function importGcAccount(
  creds: GoCardlessCreds,
  gcAccountId: string,
  accountId: number,
  institutionName: string
): Promise<{ imported: number; duplicates: number }> {
  const gcTx = await getAccountTransactions(creds, gcAccountId)
  const mapped = gcTx
    .map((t) => mapGcTransaction(t, accountId))
    .filter((t) => t.date) // ignore les lignes sans date exploitable

  if (mapped.length === 0) {
    db.touchBankConnectionSync(gcAccountId)
    return { imported: 0, duplicates: 0 }
  }

  const importRecord = db.createImport(`Open Banking — ${institutionName}`, mapped.length)
  const withImport = mapped.map((t) => ({ ...t, import_id: importRecord.id }))
  const { imported, duplicates, insertedIds } = db.insertTransactions(withImport, importRecord.id)
  if (insertedIds.length > 0) db.applyRulesToTransactions(insertedIds)
  db.touchBankConnectionSync(gcAccountId)
  return { imported, duplicates }
}
