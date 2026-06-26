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
  getCurrentPriceEur,
  getHistoricalSeriesEur,
  priceAt,
  isMarketType
} from './quotes'
import {
  initAuth,
  getTempCode,
  getAccounts as getPowensAccounts,
  getTransactions as getPowensTransactions,
  openConnectWebview,
  type PowensCreds
} from './powens'
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
      await applyDca(asset.id, input.type, input.symbol, { ...input.dca, id: planId })
    }
    return db.getAssets().find((a) => a.id === asset.id)
  })

  ipcMain.handle('update-asset', async (_, id: number, input: AssetInput) => {
    db.updateAsset(id, input)
    db.deleteDcaPlansByAsset(id)
    if (input.dca && isMarketType(input.type) && input.symbol) {
      const planId = db.createDcaPlan(id, input.dca)
      await applyDca(id, input.type, input.symbol, { ...input.dca, id: planId })
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
    const s = store.get('settings')
    return {
      configured: !!(s.powensDomain && s.powensClientId && s.powensClientSecret),
      connected: !!s.powensToken
    }
  })

  ipcMain.handle('powens-connect', async (): Promise<PowensSyncResult> => {
    const creds = getPowensCreds()
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

    return importPowens(creds, token)
  })

  ipcMain.handle('powens-sync', async (): Promise<PowensSyncResult> => {
    const creds = getPowensCreds()
    const token = store.get('settings').powensToken
    if (!token) throw new Error('Aucune connexion Powens. Connectez d\'abord une banque.')
    return importPowens(creds, token)
  })

  ipcMain.handle('powens-disconnect', () => {
    const s = store.get('settings')
    store.set('settings', { ...s, powensToken: undefined })
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

// --- Helpers Powens ---

function getPowensCreds(): PowensCreds {
  const s = store.get('settings')
  if (!s.powensDomain || !s.powensClientId || !s.powensClientSecret) {
    throw new Error('Identifiants Powens manquants. Renseignez-les dans Paramètres → Powens.')
  }
  return {
    domain: s.powensDomain,
    clientId: s.powensClientId,
    clientSecret: s.powensClientSecret,
    redirectUri: s.powensRedirectUri || 'http://localhost:8645'
  }
}

/** Récupère comptes + transactions Powens et les importe dans la base locale. */
async function importPowens(creds: PowensCreds, token: string): Promise<PowensSyncResult> {
  // Powens récupère les données de la banque de façon asynchrone : on attend
  // qu'au moins un compte apparaisse (jusqu'à ~30 s).
  let accounts = await getPowensAccounts(creds, token)
  for (let i = 0; i < 10 && accounts.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    accounts = await getPowensAccounts(creds, token)
  }
  const transactions = accounts.length > 0 ? await getPowensTransactions(creds, token) : []

  // Mappe chaque compte Powens vers un compte Banquier (clé : bank = "powens:<id>").
  const existing = db.getAccounts()
  const accountIdByPowens = new Map<number, number>()
  for (const acc of accounts) {
    const key = `powens:${acc.id}`
    const found = existing.find((a) => a.bank === key)
    accountIdByPowens.set(
      acc.id,
      found?.id ?? db.createAccount(acc.name || 'Compte', key, acc.currency?.id || 'EUR').id
    )
  }

  const rows = transactions
    .filter((t) => !t.coming)
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

  if (rows.length === 0) return { imported: 0, duplicates: 0, accounts: accounts.length }

  const importRecord = db.createImport('Powens', rows.length)
  const withImport = rows.map((r) => ({ ...r, import_id: importRecord.id }))
  const { imported, duplicates, insertedIds } = db.insertTransactions(withImport, importRecord.id)
  if (insertedIds.length > 0) db.applyRulesToTransactions(insertedIds)
  return { imported, duplicates, accounts: accounts.length }
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
