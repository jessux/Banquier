import * as accounts from './api/accounts'
import * as transactionsApi from './api/transactions'
import * as categoriesApi from './api/categories'
import * as rulesApi from './api/rules'
import * as merchantMemoryApi from './api/merchantMemory'
import * as budgetsApi from './api/budgets'
import * as goalsApi from './api/goals'
import * as importsApi from './api/imports'
import * as dashboardApi from './api/dashboard'
import * as chatApi from './api/chat'
import * as patrimoineApi from './api/patrimoine'
import * as csv from './parsers/csv'
import * as pdf from './parsers/pdf'
import * as preferences from './preferences'
import { openFileDialog as pickFile } from './file-picker'
import { runFinancialChat, buildFinancialSystemPrompt, buildChatMessages, categorizeBatch, type ToolExecutors } from './llm'
import { retrieveRelevantMemories } from '../main/memory'
import * as notifications from './notifications'
import { checkForUpdates } from './updater'
import { POWENS_CREDS, initAuth, getTempCode, getConnections, type PowensCreds } from './powens'
import { openConnectWebview } from './powens-webview'
import { importPowens, onProgress as onPowensProgress, emitProgress } from './powens-sync'
import { getCurrentPriceEur, isMarketType, searchSymbols } from './quotes'
import type {
  Asset,
  AssetInput,
  AssetType,
  CategorizationProposal,
  QuoteRefreshResult,
  TransactionFilters
} from '../shared/types'
import pkg from '../../package.json'

const NOT_YET = ' n’est pas encore disponible dans Banquier Android (arrive dans une prochaine mise à jour).'

function notImplemented(feature: string): () => Promise<never> {
  return () => Promise.reject(new Error(feature + NOT_YET))
}

/** Profondeur d'historique demandée lors d'un rattachement de banque : un an. */
function defaultConnectMinDate(): string {
  const now = new Date()
  return `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/** IDs des connexions bancaires actuelles, ou un ensemble vide si l'appel échoue :
 *  sert uniquement à comparer un avant/après, jamais à bloquer le parcours. */
async function safeConnectionIds(creds: PowensCreds, token: string): Promise<Set<number>> {
  try {
    return new Set((await getConnections(creds, token)).map((c) => c.id))
  } catch (err) {
    console.warn('[powens] lecture des connexions impossible', err)
    return new Set()
  }
}

/** Native-Android implementation of the same window.api surface the Electron preload
 *  exposes. Phase 1 covers the offline core (accounts, transactions, CSV import,
 *  categories, rules, budgets, dashboard, settings) — everything else is a clearly
 *  labelled stub until later phases land. See docs/mobile.md for the roadmap. */
export function createMobileApi(): Window['api'] {
  return {
    // Accounts
    getAccounts: accounts.getAccounts,
    createAccount: accounts.createAccount,
    renameAccount: accounts.renameAccount,
    deleteAccount: accounts.deleteAccount,
    updateAccountCurrency: accounts.updateAccountCurrency,
    updateAccountFxRate: accounts.updateAccountFxRate,

    // Transactions
    getTransactions: transactionsApi.getTransactions,
    countTransactions: transactionsApi.countTransactions,
    updateTransactionCategory: transactionsApi.updateTransactionCategory,
    deleteTransactions: transactionsApi.deleteTransactionsByImport,
    deleteTransaction: transactionsApi.deleteTransaction,
    clearAllTransactions: transactionsApi.clearAllTransactions,
    setTransactionInternal: transactionsApi.setTransactionInternal,
    setInternalByCategory: transactionsApi.setTransactionInternalByCategory,
    setTransactionNote: transactionsApi.setTransactionNote,
    setTransactionTags: transactionsApi.setTransactionTags,
    findDuplicates: transactionsApi.findDuplicateTransactions,

    // Categories
    getCategories: categoriesApi.getDistinctCategories,
    getCategoryTree: categoriesApi.getCategoryTree,
    getCategoryPaths: categoriesApi.getCategoryPaths,
    createCategory: categoriesApi.createCategory,
    deleteCategory: categoriesApi.deleteCategory,
    renameCategory: categoriesApi.renameCategory,

    // Category rules
    getCategoryRulesAll: rulesApi.getCategoryRulesWithId,
    deleteCategoryRule: rulesApi.deleteCategoryRule,
    updateCategoryRule: rulesApi.updateCategoryRule,
    upsertCategoryRule: rulesApi.upsertCategoryRule,
    countPattern: transactionsApi.countTransactionsByPattern,
    applyCategoryPattern: async (category: string, pattern: string) => {
      const updated = await transactionsApi.updateCategoryByPattern(category, pattern)
      await rulesApi.upsertCategoryRule(pattern, category)
      return updated
    },

    // Import
    previewCsv: async (handle: string) => csv.previewCsv(handle),
    importCsv: async (handle, mapping, accountId) => {
      const parsed = csv.parseCsvToTransactions(handle, mapping, accountId)
      const importRecord = await importsApi.createImport(handle.replace(/^mobile-file-\d+-/, ''), parsed.length)
      const { imported, duplicates, insertedIds } = await transactionsApi.insertTransactions(
        parsed,
        importRecord.id
      )
      if (insertedIds.length > 0) await merchantMemoryApi.autoCategorize(insertedIds)
      return { imported, duplicates, errors: 0, importId: importRecord.id }
    },
    importPdf: async (handle, accountId) => {
      const transactions = await pdf.extractPdfTransactions(handle)
      if (transactions.length === 0) {
        return { imported: 0, duplicates: 0, errors: 1, importId: -1 }
      }

      const txWithAccount = transactions.map((t) => ({ ...t, account_id: accountId }))
      const importRecord = await importsApi.createImport(
        handle.replace(/^mobile-file-\d+-/, ''),
        txWithAccount.length
      )
      const txWithImport = txWithAccount.map((t) => ({ ...t, import_id: importRecord.id }))
      const { imported, duplicates, insertedIds } = await transactionsApi.insertTransactions(
        txWithImport,
        importRecord.id
      )
      if (insertedIds.length > 0) await merchantMemoryApi.autoCategorize(insertedIds)
      return { imported, duplicates, errors: 0, importId: importRecord.id }
    },
    getImports: importsApi.getImports,

    // Stats
    getMonthlyStats: dashboardApi.getMonthlyStats,
    getCategoryStats: dashboardApi.getCategoryStats,
    getDashboardSummary: dashboardApi.getDashboardSummary,
    getRecurringExpenses: dashboardApi.getRecurringExpenses,
    getRecurringIncome: dashboardApi.getRecurringIncome,
    getTopMerchants: dashboardApi.getTopMerchants,
    getUncategorized: dashboardApi.getUncategorized,
    comparePeriods: dashboardApi.comparePeriods,

    // Budgets
    getBudgets: budgetsApi.getBudgets,
    getBudgetsWithSpent: budgetsApi.getBudgetsWithSpent,
    upsertBudget: budgetsApi.upsertBudget,
    deleteBudget: budgetsApi.deleteBudget,
    getCategoryMonthlyAverage: budgetsApi.getCategoryMonthlyAverage,
    getSavingsGoals: goalsApi.getSavingsGoalsWithProgress,
    createSavingsGoal: goalsApi.createSavingsGoal,
    updateSavingsGoal: goalsApi.updateSavingsGoal,
    updateSavingsGoalAmount: goalsApi.updateSavingsGoalAmount,
    deleteSavingsGoal: goalsApi.deleteSavingsGoal,
    getCategoryMonthlyHistory: dashboardApi.getCategoryMonthlyHistory,

    // AI Categorization — ne fait que proposer, comme sur desktop (src/main/ipc.ts) :
    // l'utilisateur valide les suggestions via applyCategorization.
    categorizeAi: async (onlyUncategorized, onProgress) => {
      const settings = await preferences.getSettings()
      const rules = await rulesApi.getCategoryRules()

      // First pass: apply pattern rules (deterministic, always takes priority)
      const allTxForRules = await transactionsApi.getTransactions({})
      const ruleTargets = onlyUncategorized ? allTxForRules.filter((t) => !t.category) : allTxForRules
      if (ruleTargets.length > 0) await merchantMemoryApi.autoCategorize(ruleTargets.map((t) => t.id))

      // Second pass: AI proposals for remaining uncategorized transactions
      const afterRules = await transactionsApi.getTransactions({})
      const toProcess = afterRules.filter((t) => !t.category)
      if (toProcess.length === 0) return { proposals: [] }

      const BATCH_SIZE = 30
      const proposals: CategorizationProposal[] = []
      const batches = Math.ceil(toProcess.length / BATCH_SIZE)
      onProgress(0, toProcess.length)

      for (let i = 0; i < batches; i++) {
        const batch = toProcess.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE)
        try {
          const catPaths = await categoriesApi.getCategoryPaths()
          const results = await categorizeBatch(
            batch.map((t) => ({ id: t.id, description: t.description, amount: t.amount })),
            settings,
            catPaths.length > 0 ? catPaths : undefined,
            rules
          )
          const byId = new Map(batch.map((t) => [t.id, t]))
          for (const r of results) {
            const t = byId.get(r.id)
            if (t) proposals.push({ id: t.id, description: t.description, amount: t.amount, category: r.category })
          }
        } catch (err) {
          console.error(`[categorize-ai] batch ${i + 1}/${batches} failed:`, err)
        }
        onProgress(Math.min((i + 1) * BATCH_SIZE, toProcess.length), toProcess.length)
      }

      return { proposals }
    },
    applyCategorization: async (updates) => {
      await transactionsApi.batchUpdateCategories(updates)
      return updates.length
    },

    // Chat threads
    chatThreadsList: chatApi.getChatThreads,
    chatThreadCreate: () => chatApi.createChatThread(),
    chatThreadMessages: chatApi.getChatMessages,
    chatThreadRename: chatApi.renameChatThread,
    chatThreadDelete: chatApi.deleteChatThread,

    // LLM Chat
    chat: async (threadId, content, onChunk, onToolCall, onReasoning) => {
      const settings = await preferences.getSettings()

      await chatApi.addChatMessage(threadId, 'user', content)
      await chatApi.autoTitleChatThread(threadId, content)

      const history = await chatApi.getChatMessages(threadId)
      const summary = await dashboardApi.getDashboardSummary()
      const allMemories = await chatApi.getChatMemories()
      const relevantMemories = retrieveRelevantMemories(content, allMemories)
      const systemPrompt = buildFinancialSystemPrompt(summary, settings.currency, relevantMemories.map((m) => m.content))
      const initialMessages = buildChatMessages(history, systemPrompt)

      const toolExecutors: ToolExecutors = {
        getTransactions: (filters) => transactionsApi.getTransactions(filters as TransactionFilters),
        getCategoryStats: (startDate, endDate) => dashboardApi.getCategoryStats(startDate, endDate),
        getMonthlyStats: (months) => dashboardApi.getMonthlyStats(months),
        getAccounts: () => accounts.getAccounts(),
        getTopMerchants: (startDate, endDate, limit) => dashboardApi.getTopMerchants(startDate, endDate, limit),
        getLargestTransactions: (startDate, endDate, limit, direction) =>
          dashboardApi.getLargestTransactions(startDate, endDate, limit, direction),
        comparePeriods: (aStart, aEnd, bStart, bEnd) => dashboardApi.comparePeriods(aStart, aEnd, bStart, bEnd),
        getUncategorized: (startDate, endDate, limit) => dashboardApi.getUncategorized(startDate, endDate, limit),
        getNetBalance: (startDate, endDate) => dashboardApi.getNetBalance(startDate, endDate),
        saveMemory: async (memoryContent) => {
          await chatApi.addChatMemory(memoryContent)
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
          onChunk,
          (name) => {
            collectedTools.push(name)
            onToolCall?.(name)
          },
          onReasoning
        )
        finalText = result.text
        reasoningText = result.reasoning
      } catch (e) {
        const errMsg = `\n\n*Erreur : ${String(e)}*`
        onChunk(errMsg)
        finalText += errMsg
      }

      await chatApi.addChatMessage(threadId, 'assistant', finalText, collectedTools, reasoningText || undefined)
    },
    onChatDone: () => {},

    // Mémoire IA
    memoriesList: chatApi.getChatMemories,
    memoryAdd: chatApi.addChatMemory,
    memoryDelete: chatApi.deleteChatMemory,

    // Settings
    getSettings: preferences.getSettings,
    saveSettings: async (settings) => {
      await preferences.saveSettings(settings)
    },

    // File dialog
    openFileDialog: async () => pickFile(),
    openExternal: async (url: string) => {
      window.open(url, '_blank')
    },

    // Export / Restore
    exportDb: notImplemented("L'export de la base de données"),
    exportCsv: notImplemented("L'export CSV"),
    restoreDb: notImplemented('La restauration de sauvegarde'),

    // Powens (agrégation bancaire)
    powensStatus: async () => {
      const settings = await preferences.getSettings()
      return { configured: true, connected: !!settings.powensToken }
    },
    powensConnect: async () => {
      const creds = POWENS_CREDS
      const settings = await preferences.getSettings()

      emitProgress('webview', 'Ouverture de la connexion bancaire…')

      // Token permanent d'abord (création de l'utilisateur Powens au besoin).
      let token = settings.powensToken
      if (!token) {
        token = await initAuth(creds)
        await preferences.saveSettings({ powensToken: token })
      }

      // Le parcours bancaire se déroule dans un Custom Tab, donc app en arrière-plan :
      // Android peut détruire l'activité entre-temps (mémoire, « Ne pas conserver les
      // activités »). On note l'intention pour que powensStartupSync reprenne l'import
      // au prochain démarrage au lieu de perdre la banque tout juste rattachée.
      await preferences.saveSettings({ powensConnectPending: true })

      // Photo des connexions avant ouverture : permet de détecter un rattachement
      // réussi même si le deep link de redirection n'arrive jamais.
      const before = await safeConnectionIds(creds, token)

      // Webview rattaché à notre utilisateur via un code temporaire.
      const tempCode = await getTempCode(creds, token)
      const result = await openConnectWebview(creds, tempCode)

      if (result.error) {
        await preferences.saveSettings({ powensConnectPending: false })
        emitProgress('idle', '')
        throw new Error(result.errorDescription || `Connexion refusée (${result.error}).`)
      }

      if (result.dismissed) {
        // Custom Tab fermé sans redirection : on vérifie auprès de Powens plutôt
        // que de conclure directement à une annulation. Les parcours App2App
        // renvoient souvent l'utilisateur au navigateur sans déclencher le deep
        // link, ET Powens peut mettre nettement plus que quelques secondes à
        // enregistrer la connexion côté serveur après la fin de l'authentification
        // bancaire — un délai d'attente limité ici concluait à tort à une
        // « Connexion annulée » alors que la banque venait tout juste d'être
        // rattachée. Symptôme observé : le compte n'apparaissait qu'après avoir
        // quitté et rouvert l'app, ce qui relance powensStartupSync — lequel
        // fonctionne car il attend, lui, sans jamais transformer l'attente en
        // erreur (voir waitForConnections dans powens-sync.ts).
        //
        // On attend donc ici aussi, mais SANS jamais rejeter sur un simple délai
        // écoulé : que la connexion soit détectée ou pas d'ici là, on laisse
        // toujours importPowens() trancher — il sait déjà attendre patiemment
        // (jusqu'à 4 min) et renvoyer un avertissement clair plutôt qu'une
        // erreur bloquante si vraiment rien n'est arrivé.
        emitProgress('waiting', 'Vérification de la connexion auprès de votre banque…')
        for (let i = 0; i < 20; i++) {
          if (i > 0) await new Promise((r) => setTimeout(r, 3000))
          const after = await safeConnectionIds(creds, token)
          if ([...after].some((id) => !before.has(id))) break
        }
      }

      // L'utilisateur vient de rattacher une banque de façon explicite : on lève
      // les exclusions d'anciens comptes supprimés, sinon reconnecter la même
      // banque n'y ferait jamais réapparaître ses comptes.
      await accounts.clearExcludedPowensAccounts()

      try {
        return await importPowens(creds, token, defaultConnectMinDate())
      } finally {
        await preferences.saveSettings({ powensConnectPending: false })
      }
    },
    powensSync: async (minDate, maxDate) => {
      const settings = await preferences.getSettings()
      const token = settings.powensToken
      if (!token) throw new Error("Aucune connexion Powens. Connectez d'abord une banque.")
      try {
        return await importPowens(POWENS_CREDS, token, minDate, maxDate)
      } catch (err) {
        emitProgress('error', err instanceof Error ? err.message : String(err))
        void notifications.syncFailed(err instanceof Error ? err.message : String(err))
        throw err
      }
    },
    powensDisconnect: async () => {
      await preferences.saveSettings({ powensToken: undefined, powensConnectPending: false })
    },
    powensStartupSync: async () => {
      const settings = await preferences.getSettings()
      const token = settings.powensToken
      if (!token) return null

      // Un parcours de connexion interrompu (activité détruite pendant le Custom
      // Tab) laisse ce drapeau : la banque est rattachée côté Powens mais rien n'a
      // encore été importé. On refait donc un import large plutôt qu'un incrément,
      // qui ne remonterait que les tout derniers jours.
      const pending = settings.powensConnectPending === true

      try {
        if (pending) {
          emitProgress('waiting', 'Reprise de la connexion bancaire…')
          await accounts.clearExcludedPowensAccounts()
        }

        const latest = pending ? null : await transactionsApi.getLatestPowensTransactionDate()
        const minDate = pending
          ? defaultConnectMinDate()
          : latest
            ? new Date(new Date(latest + 'T00:00:00Z').getTime() - 2 * 86400000).toISOString().slice(0, 10)
            : undefined

        const res = await importPowens(POWENS_CREDS, token, minDate)
        if (pending) await preferences.saveSettings({ powensConnectPending: false })
        return res
      } catch (err) {
        console.error('[powens-startup-sync]', err)
        const msg = err instanceof Error ? err.message : String(err)
        emitProgress('error', msg)
        void notifications.syncFailed(msg)
        return { imported: 0, duplicates: 0, accounts: 0, categorized: 0, firstDate: null, error: msg }
      }
    },
    onPowensProgress: (cb) => onPowensProgress(cb),

    // Notifications système (barre de statut Android)
    notifications: {
      status: notifications.status,
      request: notifications.request,
      setEnabled: notifications.setEnabled,
      setDailyHour: notifications.setDailyHour,
      budgetAlert: notifications.budgetAlert,
      test: notifications.test
    },

    // Patrimoine
    getAssets: patrimoineApi.getAssets,
    getPatrimoineSummary: patrimoineApi.getPatrimoineSummary,
    getAssetLots: patrimoineApi.getAssetLots,
    getDcaPlan: async (assetId: number) => (await patrimoineApi.getDcaPlanByAsset(assetId)) ?? null,
    deleteAsset: patrimoineApi.deleteAsset,

    createAsset: async (input: AssetInput): Promise<Asset> => {
      const asset = await patrimoineApi.createAsset(input)
      if (input.dca && isMarketType(input.type) && input.symbol) {
        const planId = await patrimoineApi.createDcaPlan(asset.id, input.dca)
        await patrimoineApi.applyDca(asset.id, input.type, input.symbol, {
          ...input.dca,
          id: planId,
          asset_id: asset.id,
          active: 1
        })
      }
      const assets = await patrimoineApi.getAssets()
      return assets.find((a) => a.id === asset.id) as Asset
    },

    updateAsset: async (id: number, input: AssetInput) => {
      await patrimoineApi.updateAsset(id, input)
      await patrimoineApi.deleteDcaPlansByAsset(id)
      if (input.dca && isMarketType(input.type) && input.symbol) {
        const planId = await patrimoineApi.createDcaPlan(id, input.dca)
        await patrimoineApi.applyDca(id, input.type, input.symbol, {
          ...input.dca,
          id: planId,
          asset_id: id,
          active: 1
        })
      }
    },

    // Suggestions de tickers pour la liste déroulante de recherche du formulaire.
    searchSymbol: async (type: string, query: string) => {
      try {
        return await searchSymbols(type as AssetType, query)
      } catch {
        return []
      }
    },

    // Aperçu d'un cours pour valider un ticker dans le formulaire.
    previewSymbol: async (type: string, symbol: string) => {
      try {
        return { price: await getCurrentPriceEur(type as AssetType, symbol) }
      } catch (e) {
        return { price: null, error: String(e instanceof Error ? e.message : e) }
      }
    },

    // Met à jour les cours (et régénère les lots DCA jusqu'à aujourd'hui).
    refreshQuotes: async (): Promise<QuoteRefreshResult> => {
      const assets = (await patrimoineApi.getAssets()).filter((a) => a.symbol && isMarketType(a.type))
      const updated: QuoteRefreshResult['updated'] = []
      const failed: QuoteRefreshResult['failed'] = []
      for (const a of assets) {
        try {
          const plan = await patrimoineApi.getDcaPlanByAsset(a.id)
          if (plan) {
            const value = await patrimoineApi.applyDca(a.id, a.type, a.symbol as string, plan)
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
          await patrimoineApi.setAssetValue(a.id, value)
          updated.push({ id: a.id, label: a.label, value })
        } catch (e) {
          failed.push({ label: a.label, reason: String(e instanceof Error ? e.message : e) })
        }
      }
      return { updated, failed }
    },

    // Profiles — un seul profil sur mobile pour l'instant
    getProfiles: async () => ({ active: 'default', profiles: [{ id: 'default', name: 'Mon compte' }] }),
    createProfile: notImplemented('Les profils multiples'),
    renameProfile: notImplemented('Les profils multiples'),
    deleteProfile: notImplemented('Les profils multiples'),
    switchProfile: notImplemented('Les profils multiples'),

    // Mobile server — sans objet, l'app tourne déjà nativement sur le téléphone
    startMobileServer: notImplemented('Le serveur mobile'),
    stopMobileServer: async () => {},
    getMobileServerStatus: async () => ({ running: false }),

    // App info & updates
    getAppVersion: async () => pkg.version,
    checkForUpdates
  }
}
