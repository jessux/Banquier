import { ipcMain, dialog, BrowserWindow, app, shell } from 'electron'
import fs from 'fs'
import Store from 'electron-store'
import path from 'path'
import * as db from './database'
import * as profiles from './profiles'
import { previewCsv, parseCsvToTransactions } from './parsers/csv'
import { extractPdfTransactions } from './parsers/pdf'
import {
  callOpenRouterOnce,
  runFinancialChat,
  buildFinancialSystemPrompt,
  buildChatMessages,
  categorizeBatch
} from './llm'
import { retrieveRelevantMemories } from './memory'
import { startMobileServer, stopMobileServer, isMobileServerRunning } from './mobile-server'
import { checkForUpdatesManual, type UpdateCheckResult } from './updater'
import { is } from '@electron-toolkit/utils'
import {
  getCurrentPriceEur,
  getHistoricalSeriesEur,
  priceAt,
  isMarketType,
  searchSymbols
} from './quotes'
import {
  initAuth,
  getTempCode,
  getAccounts as getPowensAccounts,
  getTransactions as getPowensTransactions,
  openConnectWebview,
  POWENS_CREDS,
  type PowensCreds
} from './powens'
import { setConfiguredProxy } from './proxy'
import type {
  Settings,
  CsvMapping,
  TransactionFilters,
  AssetInput,
  AssetType,
  QuoteRefreshResult,
  DcaPlan,
  PowensStatus,
  PowensSyncResult
} from '../shared/types'


interface StoreSchema {
  settings: Settings
}

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
  // Initialise le proxy configuré dès le démarrage
  setConfiguredProxy(store.get('settings').proxyUrl)
  // --- Accounts ---
  ipcMain.handle('get-accounts', () => db.getAccounts())
  ipcMain.handle('rename-account', (_, id: number, name: string) => db.renameAccount(id, name))
  ipcMain.handle('create-account', (_, name: string, bank: string, currency: string) =>
    db.createAccount(name, bank, currency)
  )

  // --- Transactions ---
  ipcMain.handle('get-transactions', (_, filters?: TransactionFilters) =>
    db.getTransactions(filters)
  )
  ipcMain.handle('count-transactions', (_, filters?: TransactionFilters) =>
    db.countTransactions(filters)
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
  ipcMain.handle('clear-all-transactions', () => db.clearAllTransactions())
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
  // Analyse 100% locale (aucun appel réseau) : le tableau du relevé est
  // reconstruit à partir des positions du texte dans le PDF. Voir
  // src/shared/pdfBankStatement.ts.
  ipcMain.handle('import-pdf', async (_, filePath: string, accountId: number | null) => {
    const transactions = await extractPdfTransactions(filePath)
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
  ipcMain.handle('get-category-monthly-history', (_, category: string, months?: number) =>
    db.getCategoryMonthlyHistory(category, months)
  )
  ipcMain.handle('get-recurring-expenses', (_, startDate?: string, endDate?: string) =>
    db.getRecurringExpenses(startDate, endDate)
  )
  ipcMain.handle('get-top-merchants', (_, startDate?: string, endDate?: string, limit?: number) =>
    db.getTopMerchants(startDate, endDate, limit)
  )
  ipcMain.handle('get-uncategorized', (_, startDate?: string, endDate?: string, limit?: number) =>
    db.getUncategorized(startDate, endDate, limit)
  )
  ipcMain.handle('compare-periods', (_, aStart: string, aEnd: string, bStart: string, bEnd: string) =>
    db.comparePeriods(aStart, aEnd, bStart, bEnd)
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

  // --- Mémoire IA (informations importantes, base du RAG) ---
  ipcMain.handle('memories-list', () => db.getChatMemories())
  ipcMain.handle('memory-add', (_, content: string) => db.addChatMemory(content))
  ipcMain.handle('memory-delete', (_, id: number) => db.deleteChatMemory(id))

  // --- LLM Chat ---
  ipcMain.handle('chat', async (event, threadId: number, content: string) => {
    const settings = store.get('settings')

    // Persiste le message utilisateur et (au besoin) titre la conversation.
    db.addChatMessage(threadId, 'user', content)
    db.autoTitleChatThread(threadId, content)

    // Reconstruit l'historique complet du thread depuis la base.
    const history = db.getChatMessages(threadId)
    const summary = db.getDashboardSummary()

    // RAG : récupère les mémoires pertinentes pour la question et les injecte
    // dans le prompt système.
    const relevantMemories = retrieveRelevantMemories(content, db.getChatMemories())
    const systemPrompt = buildFinancialSystemPrompt(
      summary,
      settings.currency,
      relevantMemories.map((m) => m.content)
    )
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
        db.getNetBalance(startDate, endDate),
      saveMemory: (memoryContent: string) => {
        db.addChatMemory(memoryContent)
      }
    }

    const collectedTools: string[] = []
    let finalText = ''
    let reasoningText = ''
    try {
      const result = await runFinancialChat(
        initialMessages,
        settings,
        toolExecutors,
        (chunk) => event.sender.send('chat-chunk', chunk),
        (name) => {
          collectedTools.push(name)
          event.sender.send('chat-tool-call', name)
        },
        (chunk) => event.sender.send('chat-reasoning', chunk)
      )
      finalText = result.text
      reasoningText = result.reasoning
    } catch (e) {
      const errStr = String(e)
      const errMsg = `\n\n*Erreur : ${errStr}*`
      event.sender.send('chat-chunk', errMsg)
      finalText += errMsg
      if (errStr.includes('429') || errStr.toLowerCase().includes('ratelimit') || errStr.toLowerCase().includes('rate limit')) {
        event.sender.send('chat-error', 'rate_limit')
      }
    }

    // Persiste la réponse de l'assistant (avec les outils utilisés et le raisonnement).
    db.addChatMessage(threadId, 'assistant', finalText, collectedTools, reasoningText || undefined)
    event.sender.send('chat-done')
  })

  // --- Settings ---
  ipcMain.handle('get-settings', () => store.get('settings'))
  ipcMain.handle('save-settings', (_, settings: Partial<Settings>) => {
    const current = store.get('settings')
    const merged = { ...current, ...settings }
    store.set('settings', merged)
    setConfiguredProxy(merged.proxyUrl)
  })

  // --- Patrimoine ---
  ipcMain.handle('get-assets', () => db.getAssets())
  ipcMain.handle('get-patrimoine-summary', () => db.getPatrimoineSummary())
  ipcMain.handle('get-asset-lots', (_, assetId: number) => db.getAssetLots(assetId))
  ipcMain.handle('get-dca-plan', (_, assetId: number) => db.getDcaPlanByAsset(assetId) ?? null)
  ipcMain.handle('delete-asset', (_, id: number) => db.deleteAsset(id))

  ipcMain.handle('create-asset', async (_, input: AssetInput) => {
    const asset = db.createAsset(input)
    if (input.dca && isMarketType(input.type) && input.symbol) {
      const planId = db.createDcaPlan(asset.id, input.dca)
      await applyDca(asset.id, input.type, input.symbol, { ...input.dca, id: planId, asset_id: asset.id, active: 1 })
    }
    return db.getAssets().find((a) => a.id === asset.id)
  })

  ipcMain.handle('update-asset', async (_, id: number, input: AssetInput) => {
    db.updateAsset(id, input)
    db.deleteDcaPlansByAsset(id)
    if (input.dca && isMarketType(input.type) && input.symbol) {
      const planId = db.createDcaPlan(id, input.dca)
      await applyDca(id, input.type, input.symbol, { ...input.dca, id: planId, asset_id: id, active: 1 })
    }
  })

  // Suggestions de tickers pour la liste déroulante de recherche du formulaire.
  ipcMain.handle('search-symbol', async (_, type: AssetType, query: string) => {
    try {
      return await searchSymbols(type, query)
    } catch {
      return []
    }
  })

  // Aperçu d'un cours pour valider un ticker dans le formulaire.
  ipcMain.handle('preview-symbol', async (_, type: AssetType, symbol: string) => {
    try {
      return { price: await getCurrentPriceEur(type, symbol) }
    } catch (e) {
      return { price: null, error: String(e instanceof Error ? e.message : e) }
    }
  })

  // Met à jour les cours (et régénère les lots DCA jusqu'à aujourd'hui).
  ipcMain.handle('refresh-quotes', async (): Promise<QuoteRefreshResult> => {
    const assets = db.getAssets().filter((a) => a.symbol && isMarketType(a.type))
    const updated: QuoteRefreshResult['updated'] = []
    const failed: QuoteRefreshResult['failed'] = []
    for (const a of assets) {
      try {
        const plan = db.getDcaPlanByAsset(a.id)
        if (plan) {
          const value = await applyDca(a.id, a.type, a.symbol as string, plan)
          updated.push({ id: a.id, label: a.label, value })
          continue
        }
        const qty = a.lot_quantity > 0 ? a.lot_quantity : a.quantity ?? 0
        if (qty <= 0) {
          failed.push({ label: a.label, reason: 'quantité inconnue' })
          continue
        }
        const price = await getCurrentPriceEur(a.type, a.symbol as string)
        if (price == null) {
          failed.push({ label: a.label, reason: 'cours introuvable' })
          continue
        }
        const value = qty * price
        db.setAssetValue(a.id, value)
        updated.push({ id: a.id, label: a.label, value })
      } catch (e) {
        failed.push({ label: a.label, reason: String(e instanceof Error ? e.message : e) })
      }
    }
    return { updated, failed }
  })

  // --- Powens (agrégation bancaire) ---
  ipcMain.handle('powens-status', (): PowensStatus => {
    return { configured: true, connected: !!store.get('settings').powensToken }
  })

  ipcMain.handle('powens-connect', async (): Promise<PowensSyncResult> => {
    const creds = POWENS_CREDS
    const parent = BrowserWindow.getFocusedWindow() ?? undefined

    // Token permanent d'abord (création de l'utilisateur Powens au besoin).
    let token = store.get('settings').powensToken
    if (!token) {
      token = await initAuth(creds)
      const s = store.get('settings')
      store.set('settings', { ...s, powensToken: token })
    }

    // Webview rattaché à notre utilisateur via un code temporaire.
    const tempCode = await getTempCode(creds, token)
    const result = await openConnectWebview(creds, tempCode, parent)
    if (result.error) {
      throw new Error(result.errorDescription || `Connexion refusée (${result.error}).`)
    }

    const now = new Date()
    const minDate = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    return importPowens(creds, token, minDate)
  })

  ipcMain.handle('powens-sync', async (_, minDate?: string, maxDate?: string): Promise<PowensSyncResult> => {
    const creds = POWENS_CREDS
    const token = store.get('settings').powensToken
    if (!token) throw new Error('Aucune connexion Powens. Connectez d\'abord une banque.')
    return importPowens(creds, token, minDate, maxDate)
  })

  ipcMain.handle('powens-disconnect', () => {
    const s = store.get('settings')
    store.set('settings', { ...s, powensToken: undefined })
  })

  ipcMain.handle('powens-startup-sync', async (): Promise<PowensSyncResult | null> => {
    const token = store.get('settings').powensToken
    if (!token) return null
    try {
      const latest = db.getLatestPowensTransactionDate()
      const minDate = latest
        ? new Date(new Date(latest + 'T00:00:00Z').getTime() - 2 * 86400000).toISOString().slice(0, 10)
        : undefined
      return await importPowens(POWENS_CREDS, token, minDate)
    } catch (err) {
      console.error('[powens-startup-sync]', err)
      const msg = err instanceof Error ? err.message : String(err)
      return { imported: 0, duplicates: 0, accounts: 0, categorized: 0, firstDate: null, error: msg }
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

  ipcMain.handle('restore-db', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return { success: false }
    const result = await dialog.showOpenDialog(win, {
      title: 'Restaurer une sauvegarde',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db'] }]
    })
    if (result.canceled || !result.filePaths[0]) return { success: false }
    try {
      db.restoreDb(result.filePaths[0])
      win.webContents.reload()
      return { success: true }
    } catch (e) {
      return { success: false, error: String(e instanceof Error ? e.message : e) }
    }
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

  // --- Profiles ---
  ipcMain.handle('get-profiles', () => profiles.getProfiles())
  ipcMain.handle('create-profile', (_, name: string) => profiles.createProfile(name))
  ipcMain.handle('rename-profile', (_, id: string, name: string) => profiles.renameProfile(id, name))
  ipcMain.handle('delete-profile', (_, id: string) => profiles.deleteProfile(id))
  ipcMain.handle('switch-profile', (_, id: string) => {
    const newPath = profiles.switchProfile(id)
    db.initDatabase(newPath)
    BrowserWindow.getFocusedWindow()?.webContents.reload()
  })

  ipcMain.handle('shell-open-external', (_, url: string) => shell.openExternal(url))

  ipcMain.handle('get-app-version', () => app.getVersion())

  ipcMain.handle('check-for-updates', async (): Promise<UpdateCheckResult> => {
    if (is.dev) return { status: 'error', message: 'Vérification indisponible en mode développement.' }
    return checkForUpdatesManual()
  })

  // --- Notes / Tags ---
  ipcMain.handle('set-transaction-note', (_, id: number, note: string | null) =>
    db.setTransactionNote(id, note)
  )
  ipcMain.handle('set-transaction-tags', (_, id: number, tags: string | null) =>
    db.setTransactionTags(id, tags)
  )

  // --- Budgets ---
  ipcMain.handle('get-budgets', () => db.getBudgets())
  ipcMain.handle('get-budgets-with-spent', (_, startDate?: string, endDate?: string) =>
    db.getBudgetsWithSpent(startDate, endDate)
  )
  ipcMain.handle('upsert-budget', (_, category: string, amount: number) =>
    db.upsertBudget(category, amount)
  )
  ipcMain.handle('delete-budget', (_, id: number) => db.deleteBudget(id))
  ipcMain.handle('get-category-monthly-average', (_, category: string, months?: number) =>
    db.getCategoryMonthlyAverage(category, months)
  )

  ipcMain.handle('delete-account', (_, id: number) => db.deleteAccount(id))

  ipcMain.handle('update-account-currency', (_, id: number, currency: string) =>
    db.updateAccountCurrency(id, currency)
  )

  ipcMain.handle('update-account-fx-rate', (_, id: number, fxRate: number) =>
    db.updateAccountFxRate(id, fxRate)
  )
}

// --- Helpers Powens ---

/** Récupère comptes + transactions Powens et les importe dans la base locale. */
async function importPowens(
  creds: PowensCreds,
  token: string,
  minDate?: string,
  maxDate?: string
): Promise<PowensSyncResult> {
  // Powens synchronise la banque de façon asynchrone. On attend :
  //   1. qu'au moins un compte apparaisse (jusqu'à ~30 s, 10 × 3 s)
  //   2. que les transactions arrivent (jusqu'à ~60 s supplémentaires, 12 × 5 s)
  //      — surtout nécessaire lors de la première connexion où l'historique
  //      est récupéré en arrière-plan par Powens.
  let accounts = await getPowensAccounts(creds, token)
  for (let i = 0; i < 10 && accounts.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    accounts = await getPowensAccounts(creds, token)
  }
  let result = accounts.length > 0
    ? await getPowensTransactions(creds, token, minDate, maxDate)
    : { transactions: [], firstDate: null }

  // Si les comptes existent mais que les transactions sont vides, la banque est
  // encore en cours de synchronisation → on patiente et on réessaie.
  if (accounts.length > 0 && result.transactions.length === 0) {
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
  const excludedPowensIds = db.getExcludedPowensAccountIds()
  const existing = db.getAccounts()
  const accountIdByPowens = new Map<number, number>()
  for (const acc of accounts) {
    if (excludedPowensIds.has(String(acc.id))) continue
    const key = `powens:${acc.id}`
    const found = existing.find((a) => a.bank === key)
    const accountId = found?.id ?? db.createAccount(acc.name || 'Compte', key, acc.currency?.id || 'EUR').id
    accountIdByPowens.set(acc.id, accountId)
    if (acc.balance != null) db.updateAccountBalance(accountId, acc.balance)
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
      is_internal: 0
    }))
    .filter((r) => r.date && r.amount != null)

  if (rows.length === 0) return { imported: 0, duplicates: 0, accounts: accounts.length, categorized: 0, firstDate }

  const importRecord = db.createImport('Powens', rows.length)
  const withImport = rows.map((r) => ({ ...r, import_id: importRecord.id }))
  const { imported, duplicates, insertedIds } = db.insertTransactions(withImport, importRecord.id)

  // On ré-applique les règles aux transactions nouvellement insérées ET à toutes
  // celles encore non catégorisées de ces comptes : Powens dédoublonne à chaque
  // synchro, donc des transactions importées avant la création d'une règle ne
  // seraient sinon jamais catégorisées automatiquement.
  const accountIds = [...accountIdByPowens.values()]
  const targetIds = new Set<number>(insertedIds)
  for (const id of db.getUncategorizedTransactionIds(accountIds)) targetIds.add(id)
  const categorized = targetIds.size > 0 ? db.applyRulesToTransactions([...targetIds]) : 0
  return { imported, duplicates, accounts: accounts.length, categorized, firstDate }
}

// --- Helpers DCA (investissement programmé) ---

const dayMs = 86400_000
const toSec = (isoDate: string): number => Math.floor(Date.parse(`${isoDate}T12:00:00Z`) / 1000)
const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)

/** Dates programmées d'un plan DCA, du début jusqu'à aujourd'hui. */
function scheduledDates(plan: DcaPlan): string[] {
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
      if (m > 11) { m = 0; y++ }
    }
  }
  return out
}

/**
 * Génère les lots d'un plan DCA à partir des cours historiques, met à jour la
 * valeur actuelle de l'actif, et renvoie cette valeur.
 */
async function applyDca(
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
    db.replaceDcaLots(assetId, plan.id, [])
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
  db.replaceDcaLots(assetId, plan.id, lots)

  const totalQty = lots.reduce((s, l) => s + l.quantity, 0)
  const current = await getCurrentPriceEur(type, symbol)
  const value = current ? totalQty * current : 0
  db.setAssetValue(assetId, value)
  return value
}
