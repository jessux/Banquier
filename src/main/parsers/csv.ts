import fs from 'fs'
import Papa from 'papaparse'
import type { CsvMapping, CsvPreview, Transaction } from '../../shared/types'

export function previewCsv(filePath: string): CsvPreview {
  // Try UTF-8 first, fall back to latin1 for French bank exports
  let content: string
  try {
    content = fs.readFileSync(filePath, { encoding: 'utf-8' })
    if (content.includes('�')) {
      content = fs.readFileSync(filePath, { encoding: 'latin1' })
    }
  } catch {
    content = fs.readFileSync(filePath, { encoding: 'latin1' })
  }

  // Strip BOM if present
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
    preview: 10
  })

  const rows = result.data as string[][]
  if (rows.length === 0) return { headers: [], rows: [], detectedDelimiter: ',' }

  const detectedDelimiter = (result.meta as { delimiter?: string }).delimiter || ','
  const headers = rows[0]
  const dataRows = rows.slice(1)
  return { headers, rows: dataRows, detectedDelimiter }
}

function parseDate(raw: string, format: string): string {
  raw = raw.trim()
  // Strip time component if present (e.g. "2025-12-31 16:34:10" → "2025-12-31")
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10)
  if (format === 'YYYY-MM-DD') return raw.slice(0, 10)
  if (format === 'DD/MM/YYYY') {
    const [d, m, y] = raw.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (format === 'DD/MM/YY') {
    const [d, m, y] = raw.split('/')
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (format === 'MM/DD/YYYY') {
    const [m, d, y] = raw.split('/')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return raw
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  const cleaned = raw
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[€$£]/g, '')
  return parseFloat(cleaned) || 0
}

export function parseCsvToTransactions(
  filePath: string,
  mapping: CsvMapping,
  accountId: number | null
): Omit<Transaction, 'id'>[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, { encoding: 'utf-8' })
    if (content.includes('�')) {
      content = fs.readFileSync(filePath, { encoding: 'latin1' })
    }
  } catch {
    content = fs.readFileSync(filePath, { encoding: 'latin1' })
  }
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)

  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
    delimiter: mapping.delimiter || ','
  })

  const rows = result.data as string[][]
  const dataRows = rows.slice(1 + (mapping.skipRows || 0))
  const headers = rows[0]

  const colIndex = (name: string): number => headers.indexOf(name)
  const dateIdx = colIndex(mapping.dateCol)
  const descIdx = colIndex(mapping.descriptionCol)
  const amountIdx = mapping.amountCol ? colIndex(mapping.amountCol) : -1
  const debitIdx = mapping.debitCol ? colIndex(mapping.debitCol) : -1
  const creditIdx = mapping.creditCol ? colIndex(mapping.creditCol) : -1

  const transactions: Omit<Transaction, 'id'>[] = []

  for (const row of dataRows) {
    if (row.length < 2) continue
    const rawDate = row[dateIdx]
    if (!rawDate) continue

    const date = parseDate(rawDate, mapping.dateFormat)
    const description = (row[descIdx] || '').trim()

    let amount: number
    if (amountIdx >= 0) {
      amount = parseAmount(row[amountIdx])
    } else {
      const debit = debitIdx >= 0 ? parseAmount(row[debitIdx]) : 0
      const credit = creditIdx >= 0 ? parseAmount(row[creditIdx]) : 0
      amount = credit > 0 ? credit : -Math.abs(debit)
    }

    if (!description && amount === 0) continue

    transactions.push({ account_id: accountId, date, description, amount, category: null, import_id: null })
  }

  return transactions
}
