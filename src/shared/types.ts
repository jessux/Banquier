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
  fx_rate: number
  /** Dernier solde connu (récupéré via Powens), null si inconnu (compte manuel). */
  balance: number | null
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
  note: string | null
  tags: string | null
  /** Libellé réduit au marchand, dérivé de `description` (voir shared/merchant.ts).
   *  Calculé à l'insertion : absent des objets construits par les parsers. */
  merchant_key?: string | null
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
  /** Catégorisées sans intervention à l'import (règles, mémoire, dictionnaire). */
  categorized: number
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

export interface CategoryMonthlyPoint {
  month: string
  total: number
}

export interface CategoryRule {
  id: number
  pattern: string
  category: string
}

export interface Profile {
  id: string
  name: string
}

export interface ProfilesState {
  active: string
  profiles: Profile[]
}

export interface Settings {
  openrouterApiKey: string
  openrouterModel: string
  currency: string
  locale: string
  mobileServerEnabled?: boolean
  /** Token d'accès Powens permanent obtenu après la première connexion (interne). */
  powensToken?: string
  /** Mis à true après que l'utilisateur a terminé ou passé l'onboarding. */
  onboardingDone?: boolean
  /** Proxy HTTP/HTTPS configuré manuellement (ex: http://proxy.entreprise.com:8080). */
  proxyUrl?: string
  /** Thème de l'interface. Par défaut : sombre. */
  theme?: 'dark' | 'light'
  /** Lance la catégorisation IA après chaque import et applique d'office les
   *  propositions sûres. Désactivé par défaut : la fonctionnalité appelle un
   *  service externe et écrit sans validation ligne à ligne. */
  autoCategorizeAi?: boolean
  /** Notifications système (Android). Par défaut : activées si la permission est accordée. */
  notificationsEnabled?: boolean
  /** Heure (0-23) du rappel quotidien de synchronisation. null/undefined = pas de rappel. */
  notificationsDailyHour?: number | null
  /** Marqueur interne : un parcours de connexion Powens a été lancé et n'a pas encore
   *  abouti. Sur Android, l'activité peut être détruite pendant le Custom Tab bancaire ;
   *  ce drapeau permet de reprendre l'import au redémarrage au lieu de perdre la banque
   *  tout juste rattachée. */
  powensConnectPending?: boolean
  /** Surveillance Powens en arrière-plan (Android/iOS). Désactivée par défaut :
   *  elle réveille l'app périodiquement et consomme donc un peu de batterie et de
   *  données, ce qui doit rester un choix explicite. */
  backgroundSyncEnabled?: boolean
}

/**
 * État de la surveillance Powens en arrière-plan (src/mobile/background-sync.ts).
 *
 * À ne pas confondre avec une synchronisation complète : la tâche de fond tourne
 * hors du webview, sans accès à SQLite. Elle repère les nouvelles transactions
 * côté Powens et notifie ; l'import en base a lieu à la réouverture de l'app.
 */
export interface BackgroundSyncStatus {
  /** false hors mobile, ou si le runner de fond est injoignable. La section
   *  correspondante des Paramètres est alors masquée. */
  supported: boolean
  enabled: boolean
  /** Une banque est rattachée : sans token Powens, il n'y a rien à surveiller. */
  configured: boolean
  /** Horodatage ISO du dernier réveil, null tant que l'OS n'en a déclenché aucun. */
  lastCheckAt: string | null
  /** Dernière erreur rencontrée en fond (réseau coupé, Powens indisponible…). */
  lastError: string | null
  /** Transactions repérées en fond et pas encore importées en base. */
  pendingCount: number
  /** Intervalle demandé à l'OS, en minutes. Indicatif : Doze et les optimisations
   *  constructeur peuvent l'étirer largement. */
  intervalMinutes: number
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
  /** Transactions catégorisées sans intervention lors de l'import. */
  categorized: number
  /** Date la plus ancienne disponible côté Powens/banque (YYYY-MM-DD), null si inconnue. */
  firstDate?: string | null
  /** Message d'erreur si la sync a échoué (token expiré, réseau…). */
  error?: string
  /** Avertissement non bloquant : l'import a abouti mais une banque est en erreur
   *  côté Powens (identifiants refusés, authentification forte à revalider…). */
  warning?: string
}

/** Étape courante d'une synchronisation Powens, telle qu'affichée à l'utilisateur. */
export type PowensPhase = 'idle' | 'webview' | 'waiting' | 'importing' | 'done' | 'error'

/** Avancement d'une synchronisation Powens, poussé par la couche mobile. */
export interface PowensProgress {
  phase: PowensPhase
  message: string
}

/** État observable du job Powens (connexion ou synchronisation) tournant en fond. */
export interface PowensJobState extends PowensProgress {
  kind: 'connect' | 'sync' | 'startup' | null
  startedAt: number | null
  result: PowensSyncResult | null
  error: string | null
}

/** État des notifications système (Android uniquement). */
export interface NotificationsStatus {
  /** false sur desktop : les notifications système ne sont pas encore portées. */
  supported: boolean
  /** Permission Android POST_NOTIFICATIONS accordée. */
  granted: boolean
  /** Préférence utilisateur (indépendante de la permission système). */
  enabled: boolean
  /** Heure du rappel quotidien, null si désactivé. */
  dailyHour: number | null
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

/** Suggestion de ticker retournée par la recherche de symboles boursiers/crypto. */
export interface SymbolSuggestion {
  symbol: string
  name: string
  exchange?: string
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

export interface SavingsGoal {
  id: number
  name: string
  target_amount: number
  target_date: string | null
  account_id: number | null
  manual_amount: number
  created_at: string
  archived: number
}

export interface SavingsGoalWithProgress extends SavingsGoal {
  currentAmount: number
  balanceKnown: boolean
  accountName: string | null
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
  reasoning?: string
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
  reasoning?: string
  created_at: string
}

/** Information importante mémorisée par l'assistant IA (base du RAG). */
export interface ChatMemory {
  id: number
  content: string
  created_at: string
}

/**
 * Qui a posé la catégorie d'une transaction.
 * `null` pour celles catégorisées avant l'introduction du suivi.
 */
export type CategorySource = 'user' | 'rule' | 'memory' | 'fuzzy' | 'dict' | 'ai'

/** Une décision de catégorisation mémorisée pour un marchand. */
export interface MerchantMemoryEntry {
  merchant_key: string
  category: string
  /** Nombre de décisions enregistrées pour ce marchand. */
  count: number
  last_used: string
}

/**
 * Mesure de la pénibilité restante : la part des transactions catégorisées
 * sans que l'utilisateur ait eu à intervenir.
 */
export interface CategorizationStats {
  total: number
  categorized: number
  uncategorized: number
  /** Posées par les règles, la mémoire, le rattrapage flou ou le dictionnaire. */
  automatic: number
  /** Posées à la main, ou via une proposition IA validée une par une. */
  manual: number
  /** Catégorisées avant l'introduction du suivi de provenance. */
  unknownSource: number
  /** automatic / (automatic + manual), de 0 à 1. null si rien n'est catégorisé. */
  automaticRate: number | null
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

/** Suggestion de catégorie IA en attente de validation par l'utilisateur. */
/**
 * Proposition de catégorie pour un **marchand**, pas pour une transaction.
 *
 * Le LLM ne voit qu'un représentant par marchand : un relevé de 300 lignes
 * inconnues ne contient souvent qu'une quinzaine de marchands distincts. La
 * proposition s'applique ensuite à toutes les transactions du groupe — ce qui
 * divise d'autant le coût de l'appel et le nombre de décisions à prendre.
 */
export interface CategorizationProposal {
  /** Clé marchand (voir shared/merchant.ts). */
  merchant: string
  category: string
  /** Confiance déclarée par le modèle, de 0 à 1. */
  confidence: number
  /** Transactions auxquelles la proposition s'appliquera. */
  transactionIds: number[]
  /** Libellé d'une transaction du groupe, pour reconnaître le marchand. */
  description: string
  /** Somme signée des montants concernés — sert aussi à trier par impact. */
  total: number
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
  tags?: string
  limit?: number
  offset?: number
  sortField?: 'date' | 'amount' | 'description' | 'category'
  sortDir?: 'asc' | 'desc'
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
