import { all, get, run } from '../db'
import type { Import } from '../../shared/types'

export async function createImport(filename: string, transactionCount: number): Promise<Import> {
  const now = new Date().toISOString()
  const result = await run('INSERT INTO imports (filename, imported_at, transaction_count) VALUES (?, ?, ?)', [
    filename,
    now,
    transactionCount
  ])
  return get<Import>('SELECT * FROM imports WHERE id = ?', [result.lastInsertRowid]) as Promise<Import>
}

export async function getImports(): Promise<Import[]> {
  return all<Import>('SELECT * FROM imports ORDER BY imported_at DESC')
}
