export interface Category {
  id: number
  name: string
  parent_id: number | null
}

export interface Account {
  id: number
  name: string
  bank: string | null
  currency: string
}

export interface Transaction {
  id: number
  account_id: number | null
  date: string
  description: string
  amount: number
  category: string | null
  import_id: number | null
  is_internal: number
}

export interface Import {
  id: number
  filename: string | null
  imported_at: string
  transaction_count: number
}

export interface CsvMapping {
  dateCol: string
  descriptionCol: string
  amountCol: string | null
  debitCol: string | null
  creditCol: string | null
  dateFormat: string
  delimiter: string
  skipRows: number
}

export interface CsvPreview {
  headers: string[]
  rows: string[][]
  detectedDelimiter: string
}

export interface ImportResult {
  imported: number
  duplicates: number
  errors: number
  importId: number
}

export interface MonthlyStats {
  month: string
  total_debit: number
  total_credit: number
}

export interface CategoryStats {
  category: string
  total: number
  count: number
}

export interface CategoryStatsGrouped {
  category: string
  total: number
  count: number
  subcategories: CategoryStats[]
}

export interface CategoryRule {
  id: number
  pattern: string
  category: string
}

export interface Settings {
  openrouterApiKey: string
  openrouterModel: string
  currency: string
  locale: string
  mobileServerEnabled?: boolean
}

export interface MobileServerInfo {
  url: string
  qrSvg: string
  port: number
  running: true
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface IpcApi {
  // Accounts
  getAccounts: () => Promise<Account[]>
  createAccount: (name: string, bank: string, currency: string) => Promise<Account>

  // Transactions
  getTransactions: (filters?: TransactionFilters) => Promise<Transaction[]>
  updateTransactionCategory: (id: number, category: string, applyToSimilar?: boolean) => Promise<void>
  deleteTransactions: (importId: number) => Promise<void>

  // Import
  previewCsv: (filePath: string) => Promise<CsvPreview>
  importCsv: (filePath: string, mapping: CsvMapping, accountId: number | null) => Promise<ImportResult>
  importPdf: (filePath: string, accountId: number | null) => Promise<ImportResult>
  getImports: () => Promise<Import[]>

  // Stats
  getMonthlyStats: (months?: number) => Promise<MonthlyStats[]>
  getCategoryStats: (startDate?: string, endDate?: string) => Promise<CategoryStats[]>
  getDashboardSummary: (startDate?: string, endDate?: string, excludeCategories?: string[]) => Promise<DashboardSummary>

  // Category management
  getCategoryTree: () => Promise<Category[]>
  getCategoryPaths: () => Promise<string[]>
  createCategory: (name: string, parentId?: number) => Promise<Category>
  deleteCategory: (id: number) => Promise<void>
  renameCategory: (id: number, name: string) => Promise<void>

  // LLM
  chat: (messages: ChatMessage[], onChunk: (chunk: string) => void) => Promise<void>

  // Settings
  getSettings: () => Promise<Settings>
  saveSettings: (settings: Partial<Settings>) => Promise<void>

  // File dialog
  openFileDialog: (filters: { name: string; extensions: string[] }[]) => Promise<string | null>
}

export interface TransactionFilters {
  search?: string
  category?: string
  accountId?: number
  startDate?: string
  endDate?: string
  minAmount?: number
  maxAmount?: number
  limit?: number
  isInternal?: boolean
}

export interface DashboardSummary {
  periodDebit: number
  periodCredit: number
  previousPeriodDebit: number
  totalTransactions: number
  topCategories: CategoryStatsGrouped[]
  monthlyTrend: MonthlyStats[]
}
