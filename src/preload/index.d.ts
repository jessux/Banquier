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
  ChatMessage
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
      categorizeAi: (onlyUncategorized: boolean, onProgress: (done: number, total: number) => void) => Promise<{ updated: number }>
      chat: (messages: ChatMessage[], onChunk: (chunk: string) => void, onToolCall?: (name: string) => void) => Promise<void>
      onChatDone: (cb: () => void) => void
      getSettings: () => Promise<Settings>
      saveSettings: (settings: Partial<Settings>) => Promise<void>
      openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
      exportDb: () => Promise<{ success: boolean }>
      exportCsv: () => Promise<{ success: boolean }>
    }
  }
}
