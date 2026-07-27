import * as accounts from './api/accounts'
import * as transactionsApi from './api/transactions'
import * as categoriesApi from './api/categories'
import * as rulesApi from './api/rules'
import * as budgetsApi from './api/budgets'
import * as importsApi from './api/imports'
import * as dashboardApi from './api/dashboard'
import * as chatApi from './api/chat'
import * as csv from './parsers/csv'
import * as preferences from './preferences'
import { openFileDialog as pickFile } from './file-picker'
import { runFinancialChat, buildFinancialSystemPrompt, buildChatMessages, categorizeBatch, type ToolExecutors } from './llm'
import { retrieveRelevantMemories } from '../main/memory'
import { POWENS_CREDS, initAuth, getTempCode } from './powens'
import { openConnectWebview } from './powens-webview'
import { importPowens } from './powens-sync'
import type { TransactionFilters } from '../shared/types'
import pkg from '../../package.json'

const NOT_YET = ' n’est pas encore disponible dans Banquier Android (arrive dans une prochaine mise à jour).'

function notImplemented(feature: string): () => Promise<never> {
  return () => Promise.reject(new Error(feature + NOT_YET))
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
      if (insertedIds.length > 0) await rulesApi.applyRulesToTransactions(insertedIds)
      return { imported, duplicates, errors: 0, importId: importRecord.id }
    },
    importPdf: notImplemented("L'import PDF"),
    getImports: importsApi.getImports,

    // Stats
    getMonthlyStats: dashboardApi.getMonthlyStats,
    getCategoryStats: dashboardApi.getCategoryStats,
    getDashboardSummary: dashboardApi.getDashboardSummary,
    getRecurringExpenses: notImplemented('La détection des dépenses récurrentes'),
    getTopMerchants: dashboardApi.getTopMerchants,
    getUncategorized: dashboardApi.getUncategorized,
    comparePeriods: notImplemented('La comparaison de périodes'),

    // Budgets
    getBudgets: budgetsApi.getBudgets,
    getBudgetsWithSpent: budgetsApi.getBudgetsWithSpent,
    upsertBudget: budgetsApi.upsertBudget,
    deleteBudget: budgetsApi.deleteBudget,
    getCategoryMonthlyAverage: budgetsApi.getCategoryMonthlyAverage,
    getCategoryMonthlyHistory: dashboardApi.getCategoryMonthlyHistory,

    // AI Categorization
    categorizeAi: async (onlyUncategorized, onProgress) => {
      const settings = await preferences.getSettings()
      const rules = await rulesApi.getCategoryRules()

      // First pass: apply pattern rules (deterministic, always takes priority)
      const allTxForRules = await transactionsApi.getTransactions({})
      const ruleTargets = onlyUncategorized ? allTxForRules.filter((t) => !t.category) : allTxForRules
      if (ruleTargets.length > 0) await rulesApi.applyRulesToTransactions(ruleTargets.map((t) => t.id))

      // Second pass: AI for remaining uncategorized transactions
      const afterRules = await transactionsApi.getTransactions({})
      const toProcess = afterRules.filter((t) => !t.category)
      if (toProcess.length === 0) return { updated: 0 }

      const BATCH_SIZE = 30
      let updated = 0
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
          await transactionsApi.batchUpdateCategories(results)
          updated += results.length
        } catch (err) {
          console.error(`[categorize-ai] batch ${i + 1}/${batches} failed:`, err)
        }
        onProgress(Math.min((i + 1) * BATCH_SIZE, toProcess.length), toProcess.length)
      }

      return { updated }
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

      // Token permanent d'abord (création de l'utilisateur Powens au besoin).
      let token = settings.powensToken
      if (!token) {
        token = await initAuth(creds)
        await preferences.saveSettings({ powensToken: token })
      }

      // Webview rattaché à notre utilisateur via un code temporaire.
      const tempCode = await getTempCode(creds, token)
      const result = await openConnectWebview(creds, tempCode)
      if (result.error) {
        throw new Error(result.errorDescription || `Connexion refusée (${result.error}).`)
      }

      const now = new Date()
      const minDate = `${now.getFullYear() - 1}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      return importPowens(creds, token, minDate)
    },
    powensSync: async (minDate, maxDate) => {
      const settings = await preferences.getSettings()
      const token = settings.powensToken
      if (!token) throw new Error("Aucune connexion Powens. Connectez d'abord une banque.")
      return importPowens(POWENS_CREDS, token, minDate, maxDate)
    },
    powensDisconnect: async () => {
      await preferences.saveSettings({ powensToken: undefined })
    },
    powensStartupSync: async () => {
      const settings = await preferences.getSettings()
      const token = settings.powensToken
      if (!token) return null
      try {
        const latest = await transactionsApi.getLatestPowensTransactionDate()
        const minDate = latest
          ? new Date(new Date(latest + 'T00:00:00Z').getTime() - 2 * 86400000).toISOString().slice(0, 10)
          : undefined
        return await importPowens(POWENS_CREDS, token, minDate)
      } catch (err) {
        console.error('[powens-startup-sync]', err)
        const msg = err instanceof Error ? err.message : String(err)
        return { imported: 0, duplicates: 0, accounts: 0, categorized: 0, firstDate: null, error: msg }
      }
    },

    // Patrimoine
    getAssets: notImplemented('Le suivi du patrimoine'),
    getPatrimoineSummary: notImplemented('Le suivi du patrimoine'),
    getAssetLots: notImplemented('Le suivi du patrimoine'),
    getDcaPlan: notImplemented('Le suivi du patrimoine'),
    createAsset: notImplemented('Le suivi du patrimoine'),
    updateAsset: notImplemented('Le suivi du patrimoine'),
    deleteAsset: notImplemented('Le suivi du patrimoine'),
    searchSymbol: notImplemented('La recherche de cours'),
    previewSymbol: notImplemented('La recherche de cours'),
    refreshQuotes: notImplemented('La mise à jour des cours'),

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
    checkForUpdates: async () => ({ status: 'up-to-date' as const })
  }
}
