import type { RulePackCatalogResult } from '../shared/rulePacks'
import type { SharePartition } from '../shared/ruleSharing'
import type {
  Account,
  Transaction,
  Import,
  Category,
  CategoryRule,
  TransactionFilters,
  CsvMapping,
  CsvPreview,
  ImportResult,
  MonthlyStats,
  CategoryStats,
  CategoryStatsGrouped,
  DashboardSummary,
  Settings,
  ChatThread,
  ChatMemory,
  StoredChatMessage,
  RecurringSummary,
  Asset,
  AssetInput,
  AssetLot,
  PatrimoineSummary,
  DcaPlan,
  QuoteRefreshResult,
  SymbolSuggestion,
  PowensStatus,
  PowensSyncResult,
  PowensProgress,
  NotificationsStatus,
  Budget,
  BudgetWithSpent,
  ProfilesState,
  SavingsGoal,
  SavingsGoalWithProgress,
  MerchantStats,
  UncategorizedSummary,
  PeriodComparison,
  CategorizationProposal
} from '../shared/types'

declare global {
  interface Window {
    api: {
      // Accounts
      getAccounts: () => Promise<Account[]>
      createAccount: (name: string, bank: string, currency: string) => Promise<Account>
      renameAccount: (id: number, name: string) => Promise<void>
      deleteAccount: (id: number) => Promise<void>
      updateAccountCurrency: (id: number, currency: string) => Promise<void>
      updateAccountFxRate: (id: number, fxRate: number) => Promise<void>

      // Transactions
      getTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>
      countTransactions: (filters?: TransactionFilters) => Promise<number>
      updateTransactionCategory: (id: number, category: string, applyToSimilar?: boolean) => Promise<void>
      deleteTransactions: (importId: number) => Promise<void>
      deleteTransaction: (id: number) => Promise<void>
      clearAllTransactions: () => Promise<void>
      setTransactionInternal: (id: number, isInternal: boolean) => Promise<void>
      setInternalByCategory: (category: string, isInternal: boolean) => Promise<number>
      setTransactionNote: (id: number, note: string | null) => Promise<void>
      setTransactionTags: (id: number, tags: string | null) => Promise<void>
      findDuplicates: () => Promise<Transaction[][]>

      // Categories
      getCategories: () => Promise<string[]>
      getCategoryTree: () => Promise<Category[]>
      getCategoryPaths: () => Promise<string[]>
      createCategory: (name: string, parentId?: number) => Promise<Category>
      deleteCategory: (id: number) => Promise<void>
      renameCategory: (id: number, name: string) => Promise<void>

      // Category rules
      getCategoryRulesAll: () => Promise<CategoryRule[]>
      deleteCategoryRule: (id: number) => Promise<void>
      updateCategoryRule: (id: number, pattern: string, category: string) => Promise<void>
      upsertCategoryRule: (pattern: string, category: string) => Promise<void>
      getRulePackCatalog: () => Promise<RulePackCatalogResult>
      installRulePack: (packId: string) => Promise<{ rules: number; categories: number }>
      uninstallRulePack: (packId: string) => Promise<number>
      getSharePartition: () => Promise<SharePartition>
      markRulesShared: (patterns: string[]) => Promise<void>
      countPattern: (pattern: string) => Promise<number>
      applyCategoryPattern: (category: string, pattern: string) => Promise<number>

      // Import
      previewCsv: (filePath: string) => Promise<CsvPreview>
      importCsv: (filePath: string, mapping: CsvMapping, accountId: number | null) => Promise<ImportResult>
      importPdf: (filePath: string, accountId: number | null) => Promise<ImportResult>
      getImports: () => Promise<Import[]>

      // Stats
      getMonthlyStats: (months?: number) => Promise<MonthlyStats[]>
      getCategoryStats: (startDate?: string, endDate?: string) => Promise<CategoryStats[]>
      getDashboardSummary: (startDate?: string, endDate?: string, excludeCategories?: string[]) => Promise<DashboardSummary>
      getRecurringExpenses: (startDate?: string, endDate?: string) => Promise<RecurringSummary>
      getRecurringIncome: (startDate?: string, endDate?: string) => Promise<RecurringSummary>
      getTopMerchants: (startDate?: string, endDate?: string, limit?: number) => Promise<MerchantStats[]>
      getUncategorized: (startDate?: string, endDate?: string, limit?: number) => Promise<UncategorizedSummary>
      comparePeriods: (aStart: string, aEnd: string, bStart: string, bEnd: string) => Promise<PeriodComparison>

      // Budgets
      getBudgets: () => Promise<Budget[]>
      getBudgetsWithSpent: (startDate?: string, endDate?: string) => Promise<BudgetWithSpent[]>
      upsertBudget: (category: string, amount: number) => Promise<Budget>
      deleteBudget: (id: number) => Promise<void>
      getCategoryMonthlyAverage: (category: string, months?: number) => Promise<{ average: number; monthsWithData: number }>
      getCategoryMonthlyHistory: (category: string, months?: number) => Promise<import('../shared/types').CategoryMonthlyPoint[]>

      // Objectifs d'épargne
      getSavingsGoals: () => Promise<SavingsGoalWithProgress[]>
      createSavingsGoal: (name: string, targetAmount: number, targetDate: string | null, accountId: number | null) => Promise<SavingsGoal>
      updateSavingsGoal: (id: number, name: string, targetAmount: number, targetDate: string | null, accountId: number | null) => Promise<void>
      updateSavingsGoalAmount: (id: number, amount: number) => Promise<void>
      deleteSavingsGoal: (id: number) => Promise<void>

      // AI Categorization
      categorizeAi: (
        onlyUncategorized: boolean,
        onProgress: (done: number, total: number) => void
      ) => Promise<{ proposals: CategorizationProposal[] }>
      applyCategorization: (updates: { id: number; category: string }[]) => Promise<number>

      // Chat threads
      chatThreadsList: () => Promise<ChatThread[]>
      chatThreadCreate: () => Promise<ChatThread>
      chatThreadMessages: (threadId: number) => Promise<StoredChatMessage[]>
      chatThreadRename: (id: number, title: string) => Promise<void>
      chatThreadDelete: (id: number) => Promise<void>

      // LLM Chat
      chat: (
        threadId: number,
        content: string,
        onChunk: (chunk: string) => void,
        onToolCall?: (name: string) => void,
        onReasoning?: (chunk: string) => void
      ) => Promise<void>
      onChatDone: (cb: () => void) => void

      // Mémoire IA (informations importantes, base du RAG)
      memoriesList: () => Promise<ChatMemory[]>
      memoryAdd: (content: string) => Promise<ChatMemory>
      memoryDelete: (id: number) => Promise<void>

      // Settings
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Partial<Settings>) => Promise<void>

      // File dialog
      openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
      openExternal: (url: string) => Promise<void>

      // Export / Restore
      exportDb: () => Promise<{ success: boolean }>
      exportCsv: () => Promise<{ success: boolean }>
      restoreDb: () => Promise<{ success: boolean; error?: string }>

      // Powens
      powensStatus: () => Promise<PowensStatus>
      powensConnect: () => Promise<PowensSyncResult>
      powensSync: (minDate?: string, maxDate?: string) => Promise<PowensSyncResult>
      powensDisconnect: () => Promise<void>
      powensStartupSync: () => Promise<PowensSyncResult | null>
      /** Avancement de la synchronisation en cours. Fourni uniquement par la couche
       *  mobile (src/mobile/window-api.ts) — sur desktop la sync est assez rapide pour
       *  qu'un simple « Patientez… » suffise. Renvoie une fonction de désabonnement. */
      onPowensProgress?: (cb: (progress: PowensProgress) => void) => () => void

      /** Notifications système. Android uniquement pour l'instant : sur desktop la
       *  propriété est absente et l'UI masque la section correspondante. */
      notifications?: {
        status: () => Promise<NotificationsStatus>
        request: () => Promise<NotificationsStatus>
        setEnabled: (enabled: boolean) => Promise<NotificationsStatus>
        setDailyHour: (hour: number | null) => Promise<NotificationsStatus>
        budgetAlert: (categories: string[], overCount: number) => Promise<void>
        test: () => Promise<void>
      }

      // Patrimoine
      getAssets: () => Promise<Asset[]>
      getPatrimoineSummary: () => Promise<PatrimoineSummary>
      getAssetLots: (assetId: number) => Promise<AssetLot[]>
      getDcaPlan: (assetId: number) => Promise<DcaPlan | null>
      createAsset: (input: AssetInput) => Promise<Asset>
      updateAsset: (id: number, input: AssetInput) => Promise<void>
      deleteAsset: (id: number) => Promise<void>
      searchSymbol: (type: string, query: string) => Promise<SymbolSuggestion[]>
      previewSymbol: (type: string, symbol: string) => Promise<{ price: number | null; error?: string }>
      refreshQuotes: () => Promise<QuoteRefreshResult>

      // Profiles
      getProfiles: () => Promise<ProfilesState>
      createProfile: (name: string) => Promise<ProfilesState>
      renameProfile: (id: string, name: string) => Promise<ProfilesState>
      deleteProfile: (id: string) => Promise<ProfilesState>
      switchProfile: (id: string) => Promise<void>

      // Mobile server
      startMobileServer: () => Promise<unknown>
      stopMobileServer: () => Promise<void>
      getMobileServerStatus: () => Promise<{ running: boolean }>

      // App info & updates
      getAppVersion: () => Promise<string>
      checkForUpdates: () => Promise<{ status: 'up-to-date' | 'available' | 'downloading' | 'error'; version?: string; message?: string }>
    }
  }
}
