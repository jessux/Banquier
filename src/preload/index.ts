import { contextBridge, ipcRenderer } from 'electron'
import type {
  TransactionFilters,
  CsvMapping,
  Settings
} from '../shared/types'

const api = {
  // Accounts
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  createAccount: (name: string, bank: string, currency: string) =>
    ipcRenderer.invoke('create-account', name, bank, currency),
  renameAccount: (id: number, name: string) => ipcRenderer.invoke('rename-account', id, name),

  // Transactions
  getTransactions: (filters?: TransactionFilters) =>
    ipcRenderer.invoke('get-transactions', filters),
  updateTransactionCategory: (id: number, category: string, applyToSimilar?: boolean) =>
    ipcRenderer.invoke('update-transaction-category', id, category, applyToSimilar),
  deleteTransactions: (importId: number) => ipcRenderer.invoke('delete-transactions', importId),
  getCategories: () => ipcRenderer.invoke('get-categories'),
  countPattern: (pattern: string) => ipcRenderer.invoke('count-pattern', pattern),
  applyCategoryPattern: (category: string, pattern: string) =>
    ipcRenderer.invoke('apply-category-pattern', category, pattern),
  getCategoryTree: () => ipcRenderer.invoke('get-category-tree'),
  getCategoryPaths: () => ipcRenderer.invoke('get-category-paths'),
  createCategory: (name: string, parentId?: number) =>
    ipcRenderer.invoke('create-category', name, parentId),
  deleteCategory: (id: number) => ipcRenderer.invoke('delete-category', id),
  renameCategory: (id: number, name: string) => ipcRenderer.invoke('rename-category', id, name),
  setTransactionInternal: (id: number, isInternal: boolean) =>
    ipcRenderer.invoke('set-transaction-internal', id, isInternal),
  setInternalByCategory: (category: string, isInternal: boolean) =>
    ipcRenderer.invoke('set-internal-by-category', category, isInternal),
  deleteTransaction: (id: number) => ipcRenderer.invoke('delete-transaction', id),
  findDuplicates: () => ipcRenderer.invoke('find-duplicates'),
  getCategoryRulesAll: () => ipcRenderer.invoke('get-category-rules-all'),
  deleteCategoryRule: (id: number) => ipcRenderer.invoke('delete-category-rule', id),
  updateCategoryRule: (id: number, pattern: string, category: string) =>
    ipcRenderer.invoke('update-category-rule', id, pattern, category),
  upsertCategoryRule: (pattern: string, category: string) =>
    ipcRenderer.invoke('upsert-category-rule', pattern, category),

  // Import
  previewCsv: (filePath: string) => ipcRenderer.invoke('preview-csv', filePath),
  importCsv: (filePath: string, mapping: CsvMapping, accountId: number | null) =>
    ipcRenderer.invoke('import-csv', filePath, mapping, accountId),
  importPdf: (filePath: string, accountId: number | null) =>
    ipcRenderer.invoke('import-pdf', filePath, accountId),
  getImports: () => ipcRenderer.invoke('get-imports'),

  // Stats
  getMonthlyStats: (months?: number) => ipcRenderer.invoke('get-monthly-stats', months),
  getCategoryStats: (startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('get-category-stats', startDate, endDate),
  getDashboardSummary: (startDate?: string, endDate?: string, excludeCategories?: string[]) =>
    ipcRenderer.invoke('get-dashboard-summary', startDate, endDate, excludeCategories),
  getRecurringExpenses: (startDate?: string, endDate?: string) =>
    ipcRenderer.invoke('get-recurring-expenses', startDate, endDate),

  // AI Categorization
  categorizeAi: (onlyUncategorized: boolean, onProgress: (done: number, total: number) => void) => {
    ipcRenderer.on('categorize-progress', (_, p: { done: number; total: number }) =>
      onProgress(p.done, p.total)
    )
    const promise = ipcRenderer.invoke('categorize-ai', onlyUncategorized)
    promise.finally(() => ipcRenderer.removeAllListeners('categorize-progress'))
    return promise as Promise<{ updated: number }>
  },

  // Chat threads (mémoire conversationnelle)
  chatThreadsList: () => ipcRenderer.invoke('chat-threads-list'),
  chatThreadCreate: () => ipcRenderer.invoke('chat-thread-create'),
  chatThreadMessages: (threadId: number) => ipcRenderer.invoke('chat-thread-messages', threadId),
  chatThreadRename: (id: number, title: string) => ipcRenderer.invoke('chat-thread-rename', id, title),
  chatThreadDelete: (id: number) => ipcRenderer.invoke('chat-thread-delete', id),

  // LLM Chat
  chat: (threadId: number, content: string, onChunk: (chunk: string) => void, onToolCall?: (name: string) => void) => {
    ipcRenderer.on('chat-chunk', (_, chunk: string) => onChunk(chunk))
    if (onToolCall) ipcRenderer.on('chat-tool-call', (_, name: string) => onToolCall(name))
    const promise = ipcRenderer.invoke('chat', threadId, content)
    promise.finally(() => {
      ipcRenderer.removeAllListeners('chat-chunk')
      ipcRenderer.removeAllListeners('chat-tool-call')
      ipcRenderer.removeAllListeners('chat-done')
    })
    return promise
  },
  onChatDone: (cb: () => void) => {
    ipcRenderer.once('chat-done', cb)
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings: Partial<Settings>) => ipcRenderer.invoke('save-settings', settings),

  // File dialog
  openFileDialog: (filters: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-file-dialog', filters),

  // Powens (agrégation bancaire)
  powensStatus: () => ipcRenderer.invoke('powens-status'),
  powensConnect: () => ipcRenderer.invoke('powens-connect'),
  powensSync: () => ipcRenderer.invoke('powens-sync'),
  powensDisconnect: () => ipcRenderer.invoke('powens-disconnect'),
  powensStartupSync: () => ipcRenderer.invoke('powens-startup-sync') as Promise<import('../shared/types').PowensSyncResult | null>,

  // Patrimoine
  getAssets: () => ipcRenderer.invoke('get-assets'),
  getPatrimoineSummary: () => ipcRenderer.invoke('get-patrimoine-summary'),
  getAssetLots: (assetId: number) => ipcRenderer.invoke('get-asset-lots', assetId),
  getDcaPlan: (assetId: number) => ipcRenderer.invoke('get-dca-plan', assetId),
  createAsset: (input: unknown) => ipcRenderer.invoke('create-asset', input),
  updateAsset: (id: number, input: unknown) => ipcRenderer.invoke('update-asset', id, input),
  deleteAsset: (id: number) => ipcRenderer.invoke('delete-asset', id),
  previewSymbol: (type: string, symbol: string) =>
    ipcRenderer.invoke('preview-symbol', type, symbol),
  refreshQuotes: () => ipcRenderer.invoke('refresh-quotes'),

  // Export
  exportDb: () => ipcRenderer.invoke('export-db') as Promise<{ success: boolean }>,
  exportCsv: () => ipcRenderer.invoke('export-csv') as Promise<{ success: boolean }>,

  // Mobile server
  startMobileServer: () => ipcRenderer.invoke('start-mobile-server'),
  stopMobileServer: () => ipcRenderer.invoke('stop-mobile-server'),
  getMobileServerStatus: () => ipcRenderer.invoke('get-mobile-server-status') as Promise<{ running: boolean }>
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.api = api
}
