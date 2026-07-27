import * as accounts from './api/accounts'
import * as transactionsApi from './api/transactions'
import * as categoriesApi from './api/categories'
import * as rulesApi from './api/rules'
import * as budgetsApi from './api/budgets'
import * as importsApi from './api/imports'
import * as dashboardApi from './api/dashboard'
import * as csv from './parsers/csv'
import * as preferences from './preferences'
import { openFileDialog as pickFile } from './file-picker'
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
    categorizeAi: notImplemented('La catégorisation par IA'),

    // Chat threads
    chatThreadsList: notImplemented('Le chat financier'),
    chatThreadCreate: notImplemented('Le chat financier'),
    chatThreadMessages: notImplemented('Le chat financier'),
    chatThreadRename: notImplemented('Le chat financier'),
    chatThreadDelete: notImplemented('Le chat financier'),

    // LLM Chat
    chat: notImplemented('Le chat financier'),
    onChatDone: () => {},

    // Mémoire IA
    memoriesList: notImplemented('La mémoire IA'),
    memoryAdd: notImplemented('La mémoire IA'),
    memoryDelete: notImplemented('La mémoire IA'),

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

    // Powens — pas de synchro bancaire automatique sur mobile pour l'instant
    powensStatus: async () => ({ configured: false, connected: false }),
    powensConnect: notImplemented('La connexion Powens'),
    powensSync: notImplemented('La synchronisation Powens'),
    powensDisconnect: async () => {},
    powensStartupSync: async () => null,

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
