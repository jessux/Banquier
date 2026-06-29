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
  StoredChatMessage,
  RecurringSummary,
  Asset,
  AssetInput,
  AssetLot,
  PatrimoineSummary,
  DcaPlan,
  QuoteRefreshResult,
  PowensStatus,
  PowensSyncResult,
  Budget,
  BudgetWithSpent
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

      // Budgets
      getBudgets: () => Promise<Budget[]>
      getBudgetsWithSpent: (startDate?: string, endDate?: string) => Promise<BudgetWithSpent[]>
      upsertBudget: (category: string, amount: number) => Promise<Budget>
      deleteBudget: (id: number) => Promise<void>

      // AI Categorization
      categorizeAi: (onlyUncategorized: boolean, onProgress: (done: number, total: number) => void) => Promise<{ updated: number }>

      // Chat threads
      chatThreadsList: () => Promise<ChatThread[]>
      chatThreadCreate: () => Promise<ChatThread>
      chatThreadMessages: (threadId: number) => Promise<StoredChatMessage[]>
      chatThreadRename: (id: number, title: string) => Promise<void>
      chatThreadDelete: (id: number) => Promise<void>

      // LLM Chat
      chat: (threadId: number, content: string, onChunk: (chunk: string) => void, onToolCall?: (name: string) => void) => Promise<void>
      onChatDone: (cb: () => void) => void

      // Settings
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Partial<Settings>) => Promise<void>

      // File dialog
      openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>

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

      // Patrimoine
      getAssets: () => Promise<Asset[]>
      getPatrimoineSummary: () => Promise<PatrimoineSummary>
      getAssetLots: (assetId: number) => Promise<AssetLot[]>
      getDcaPlan: (assetId: number) => Promise<DcaPlan | null>
      createAsset: (input: AssetInput) => Promise<Asset>
      updateAsset: (id: number, input: AssetInput) => Promise<void>
      deleteAsset: (id: number) => Promise<void>
      previewSymbol: (type: string, symbol: string) => Promise<{ price: number | null; error?: string }>
      refreshQuotes: () => Promise<QuoteRefreshResult>

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
