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
  /** Identifiants GoCardless Bank Account Data (open banking gratuit). */
  gocardlessSecretId?: string
  gocardlessSecretKey?: string
}

/** Identifiants GoCardless transmis au client open banking. */
export interface GoCardlessCreds {
  secretId: string
  secretKey: string
}

/** Banque proposée par GoCardless pour la connexion. */
export interface Institution {
  id: string
  name: string
  bic: string | null
  logo: string | null
}

/** Compte bancaire relié via open banking, persisté localement. */
export interface BankConnection {
  id: number
  gc_account_id: string
  account_id: number | null
  institution_name: string | null
  iban_tail: string | null
  requisition_id: string | null
  created_at: string
  last_sync: string | null
}

/** Résultat d'une connexion ou d'une synchronisation open banking. */
export interface BankSyncResult {
  imported: number
  duplicates: number
  accounts: number
}

export interface MobileServerInfo {
  url: string
  qrSvg: string
  port: number
  upnpEnabled: boolean
  externalUrl?: string
  running: true
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
}

export interface ChatThread {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface StoredChatMessage {
  id: number
  thread_id: number
  role: 'user' | 'assistant'
  content: string
  toolCalls?: string[]
  created_at: string
}

export interface MerchantStats {
  merchant: string
  total: number
  count: number
}

export interface PeriodComparisonRow {
  category: string
  totalA: number
  totalB: number
  diff: number
  pct: number | null
}

export interface PeriodComparison {
  periodA: { startDate: string; endDate: string; totalDebit: number }
  periodB: { startDate: string; endDate: string; totalDebit: number }
  categories: PeriodComparisonRow[]
}

export interface UncategorizedSummary {
  count: number
  total: number
  sample: Transaction[]
}

export interface NetBalance {
  startDate: string | null
  endDate: string | null
  totalCredit: number
  totalDebit: number
  net: number
}

export type RecurringFrequency =
  | 'hebdomadaire'
  | 'mensuel'
  | 'bimestriel'
  | 'trimestriel'
  | 'semestriel'
  | 'annuel'

export interface RecurringExpense {
  /** Libellé marchand normalisé (regroupe les transactions). */
  merchant: string
  /** Catégorie majoritaire des transactions du groupe (null si non catégorisé). */
  category: string | null
  frequency: RecurringFrequency
  /** Nombre d'occurrences détectées. */
  occurrences: number
  /** Montant moyen d'une occurrence (valeur absolue, en €). */
  averageAmount: number
  /** Montant de la dernière occurrence. */
  lastAmount: number
  firstDate: string
  lastDate: string
  /** Intervalle médian entre deux occurrences, en jours. */
  intervalDays: number
  /** Coût mensuel estimé (montant moyen ramené au mois selon la fréquence). */
  monthlyEstimate: number
  /** Coût annuel estimé. */
  yearlyEstimate: number
  /** true si la dernière occurrence est récente au regard de la fréquence (abonnement toujours actif). */
  active: boolean
  /** Transactions du groupe, de la plus récente à la plus ancienne. */
  transactions: Transaction[]
}

export interface RecurringSummary {
  items: RecurringExpense[]
  /** Somme des coûts mensuels estimés des récurrences encore actives. */
  totalMonthlyActive: number
  /** Somme des coûts annuels estimés des récurrences encore actives. */
  totalYearlyActive: number
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
  getRecurringExpenses: (startDate?: string, endDate?: string) => Promise<RecurringSummary>

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

  // Open banking (GoCardless)
  gocardlessInstitutions: (country?: string) => Promise<Institution[]>
  gocardlessConnect: (institutionId: string) => Promise<BankSyncResult>
  gocardlessSync: () => Promise<BankSyncResult>
  gocardlessConnections: () => Promise<BankConnection[]>
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
  /** Premier mois (YYYY-MM) de la période filtrée, à surligner dans la tendance. null = pas de surlignage (ex: "Tout"). */
  trendHighlightStart: string | null
  /** Dernier mois (YYYY-MM) de la période filtrée, à surligner dans la tendance. */
  trendHighlightEnd: string | null
}
