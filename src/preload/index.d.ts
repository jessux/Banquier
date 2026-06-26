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
  QuoteRefreshResult
} from '../shared/types'

declare global {
  interface Window {
    api: {
      getAccounts: () => Promise<Account[]>
      createAccount: (name: string, bank: string, currency: string) => Promise<Account>
      getTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>
      updateTransactionCategory: (id: number, category: string, applyToSimilar?: boolean) => Promise<void>
      deleteTransactions: (importId: number) => Promise<void>
      getCategories: () => Promise<string[]>
      countPattern: (pattern: string) => Promise<number>
      applyCategoryPattern: (category: string, pattern: string) => Promise<number>
      getCategoryTree: () => Promise<Category[]>
      getCategoryPaths: () => Promise<string[]>
      createCategory: (name: string, parentId?: number) => Promise<Category>
      deleteCategory: (id: number) => Promise<void>
      renameCategory: (id: number, name: string) => Promise<void>
      setTransactionInternal: (id: number, isInternal: boolean) => Promise<void>
      setInternalByCategory: (category: string, isInternal: boolean) => Promise<number>
      deleteTransaction: (id: number) => Promise<void>
      findDuplicates: () => Promise<Transaction[][]>
      getCategoryRulesAll: () => Promise<CategoryRule[]>
      deleteCategoryRule: (id: number) => Promise<void>
      updateCategoryRule: (id: number, pattern: string, category: string) => Promise<void>
      upsertCategoryRule: (pattern: string, category: string) => Promise<void>
      previewCsv: (filePath: string) => Promise<CsvPreview>
      importCsv: (filePath: string, mapping: CsvMapping, accountId: number | null) => Promise<ImportResult>
      importPdf: (filePath: string, accountId: number | null) => Promise<ImportResult>
      getImports: () => Promise<Import[]>
      getMonthlyStats: (months?: number) => Promise<MonthlyStats[]>
      getCategoryStats: (startDate?: string, endDate?: string) => Promise<CategoryStats[]>
      getDashboardSummary: (startDate?: string, endDate?: string, excludeCategories?: string[]) => Promise<DashboardSummary>
      getRecurringExpenses: (startDate?: string, endDate?: string) => Promise<RecurringSummary>
      categorizeAi: (onlyUncategorized: boolean, onProgress: (done: number, total: number) => void) => Promise<{ updated: number }>
      chatThreadsList: () => Promise<ChatThread[]>
      chatThreadCreate: () => Promise<ChatThread>
      chatThreadMessages: (threadId: number) => Promise<StoredChatMessage[]>
      chatThreadRename: (id: number, title: string) => Promise<void>
      chatThreadDelete: (id: number) => Promise<void>
      chat: (threadId: number, content: string, onChunk: (chunk: string) => void, onToolCall?: (name: string) => void) => Promise<void>
      onChatDone: (cb: () => void) => void
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Partial<Settings>) => Promise<void>
      openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
      exportDb: () => Promise<{ success: boolean }>
      exportCsv: () => Promise<{ success: boolean }>
      getAssets: () => Promise<Asset[]>
      getPatrimoineSummary: () => Promise<PatrimoineSummary>
      getAssetLots: (assetId: number) => Promise<AssetLot[]>
      getDcaPlan: (assetId: number) => Promise<DcaPlan | null>
      createAsset: (input: AssetInput) => Promise<Asset>
      updateAsset: (id: number, input: AssetInput) => Promise<void>
      deleteAsset: (id: number) => Promise<void>
      previewSymbol: (type: string, symbol: string) => Promise<{ price: number | null; error?: string }>
      refreshQuotes: () => Promise<QuoteRefreshResult>
    }
  }
}
