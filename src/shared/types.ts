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
  /** Token d'accès Powens permanent obtenu après la première connexion (interne). */
  powensToken?: string
}

/** État de la connexion Powens. */
export interface PowensStatus {
  configured: boolean
  connected: boolean
}

/** Résultat d'une connexion/synchronisation Powens. */
export interface PowensSyncResult {
  imported: number
  duplicates: number
  accounts: number
  /** Transactions automatiquement catégorisées par les règles lors de l'import. */
  categorized: number
  /** Date la plus ancienne disponible côté Powens/banque (YYYY-MM-DD), null si inconnue. */
  firstDate?: string | null
}

// --- Patrimoine ---

export type AssetType =
  | 'immobilier'
  | 'actions'
  | 'etf'
  | 'crypto'
  | 'liquidites'
  | 'assurance_vie'
  | 'autre'

/** Lot d'achat d'un actif boursier (prix de revient). */
export interface AssetLot {
  id: number
  asset_id: number
  date: string | null
  quantity: number
  /** Prix d'achat unitaire. */
  unit_price: number
  /** Frais d'achat (courtage…), optionnels. */
  fees: number
}

/** Lot saisi à la création/modification. */
export interface AssetLotInput {
  date: string | null
  quantity: number
  unit_price: number
  fees: number
}

/** Actif détenu (bien, ligne boursière, crypto, livret…). */
export interface Asset {
  id: number
  type: AssetType
  label: string
  /** Quantité saisie manuellement (pour les actifs sans lots). */
  quantity: number | null
  /** Valeur actuelle totale, en devise. */
  value: number
  currency: string
  /** Ticker/symbole, pour une future cotation automatique. */
  symbol: string | null
  notes: string | null
  created_at: string
  updated_at: string
  /** Prix de revient total calculé depuis les lots (0 si aucun lot). */
  cost_basis: number
  /** Quantité totale issue des lots (0 si aucun lot). */
  lot_quantity: number
}

/** Données saisies à la création/modification d'un actif. */
export interface AssetInput {
  type: AssetType
  label: string
  quantity: number | null
  value: number
  currency: string
  symbol: string | null
  notes: string | null
  /** Lots d'achat (actifs boursiers). Vide pour les autres actifs. */
  lots?: AssetLotInput[]
  /** Plan DCA (investissement programmé). Si présent, les lots sont générés automatiquement. */
  dca?: DcaPlanInput | null
}

export type DcaFrequency = 'hebdomadaire' | 'mensuel'

/** Plan d'investissement programmé (DCA). */
export interface DcaPlan {
  id: number
  asset_id: number
  amount: number
  frequency: DcaFrequency
  /** Jour de référence : jour du mois (1-28) ou jour de semaine (0=dimanche…6). */
  day_ref: number
  start_date: string
  fees: number
  active: number
}

export interface DcaPlanInput {
  amount: number
  frequency: DcaFrequency
  day_ref: number
  start_date: string
  fees: number
}

/** Résultat d'un rafraîchissement des cours. */
export interface QuoteRefreshResult {
  updated: { id: number; label: string; value: number }[]
  failed: { label: string; reason: string }[]
}

/** Répartition du patrimoine par classe d'actif. */
export interface AssetTypeBreakdown {
  type: AssetType
  total: number
  count: number
}

/** Synthèse du patrimoine net. */
export interface PatrimoineSummary {
  totalValue: number
  byType: AssetTypeBreakdown[]
  assets: Asset[]
  /** Historique de la valeur nette (un point par jour observé). */
  history: { date: string; value: number }[]
  /** Prix de revient total des actifs suivis en lots. */
  totalCostBasis: number
  /** Plus/moins-value latente totale (valeur actuelle − prix de revient) des actifs suivis en lots. */
  totalGain: number
}

// --- Budgets ---

export interface Budget {
  id: number
  category: string
  amount: number
  period: 'mensuel'
}

export interface BudgetWithSpent extends Budget {
  spent: number
}

// ---

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
  renameAccount: (id: number, name: string) => Promise<void>
  deleteAccount: (id: number) => Promise<void>
  updateAccountCurrency: (id: number, currency: string) => Promise<void>

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

  // Export / Restore
  exportDb: () => Promise<{ success: boolean }>
  exportCsv: () => Promise<{ success: boolean }>
  restoreDb: () => Promise<{ success: boolean; error?: string }>
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
  topIncomeCategories: CategoryStatsGrouped[]
  monthlyTrend: MonthlyStats[]
  /** Premier mois (YYYY-MM) de la période filtrée, à surligner dans la tendance. null = pas de surlignage (ex: "Tout"). */
  trendHighlightStart: string | null
  /** Dernier mois (YYYY-MM) de la période filtrée, à surligner dans la tendance. */
  trendHighlightEnd: string | null
}
