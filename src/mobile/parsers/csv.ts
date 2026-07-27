import Papa from 'papaparse'
import type { CsvMapping, CsvPreview, Transaction } from '../../shared/types'
import { getCachedFile } from '../file-picker'

function decodeBase64ToText(base64: string): string {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  // Try UTF-8 first, fall back to latin1 for French bank exports (same heuristic as desktop)
  let content = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (content.includes('�')) {
    content = new TextDecoder('iso-8859-1').decode(bytes)
  }
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1)
  return content
}

function readHandleContent(handle: string): string {
  const cached = getCachedFile(handle)
  if (!cached) throw new Error('Fichier introuvable — veuillez le resélectionner')
  return decodeBase64ToText(cached.base64)
}

// Pick the delimiter that occurs most across the first lines.
function detectDelimiter(content: string): string {
  const candidates = [';', ',', '\t', '|']
  const lines = content.split(/\r?\n/).filter((l) => l.trim()).slice(0, 30)
  let best = ','
  let bestScore = -1
  for (const d of candidates) {
    let total = 0
    for (const line of lines) total += line.split(d).length - 1
    if (total > bestScore) {
      bestScore = total
      best = d
    }
  }
  return best
}

// Locate the real header row, skipping any preamble lines some banks prepend.
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 25); i++) {
    const cells = rows[i].map((c) => c.toLowerCase().trim())
    const hasDate = cells.some((c) => c === 'date' || c.startsWith('date '))
    const hasMoney = cells.some(
      (c) =>
        c.includes('montant') ||
        c.includes('débit') ||
        c.includes('debit') ||
        c.includes('crédit') ||
        c.includes('credit') ||
        c.includes('libell') ||
        c.includes('opér')
    )
    if (hasDate && hasMoney) return i
  }
  return 0
}

function parseDate(raw: string, format: string): string {
  raw = raw.trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}[ T]/.test(raw)) return raw.slice(0, 10)
  if (format === 'YYYY-MM-DD') return raw.slice(0, 10)
  const sep = raw.includes('/') ? '/' : raw.includes('.') ? '.' : '-'
  const parts = raw.split(sep)
  if (format === 'DD/MM/YYYY') {
    const [d, m, y] = parts
    if (!d || !m || !y) return raw
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (format === 'DD/MM/YY') {
    const [d, m, y] = parts
    if (!d || !m || !y) return raw
    const fullYear = parseInt(y) > 50 ? `19${y}` : `20${y}`
    return `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (format === 'MM/DD/YYYY') {
    const [m, d, y] = parts
    if (!m || !d || !y) return raw
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

export function previewCsv(handle: string): CsvPreview {
  const content = readHandleContent(handle)
  const detectedDelimiter = detectDelimiter(content)

  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
    delimiter: detectedDelimiter,
    preview: 25
  })

  const rows = result.data as string[][]
  if (rows.length === 0) return { headers: [], rows: [], detectedDelimiter }

  const headerRow = findHeaderRow(rows)
  const headers = rows[headerRow]
  const dataRows = rows.slice(headerRow + 1)
  return { headers, rows: dataRows, detectedDelimiter }
}

export function parseCsvToTransactions(
  handle: string,
  mapping: CsvMapping,
  accountId: number | null
): Omit<Transaction, 'id'>[] {
  const content = readHandleContent(handle)

  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: true,
    delimiter: mapping.delimiter || detectDelimiter(content)
  })

  const rows = result.data as string[][]
  const headerRow = findHeaderRow(rows)
  const headers = rows[headerRow]
  const dataRows = rows.slice(headerRow + 1 + (mapping.skipRows || 0))

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
    const description = (row[descIdx] || '').replace(/\s+/g, ' ').trim()

    let amount: number
    if (amountIdx >= 0) {
      amount = parseAmount(row[amountIdx])
    } else {
      const debit = debitIdx >= 0 ? parseAmount(row[debitIdx]) : 0
      const credit = creditIdx >= 0 ? parseAmount(row[creditIdx]) : 0
      amount = credit > 0 ? credit : -Math.abs(debit)
    }

    if (!description && amount === 0) continue

    transactions.push({
      account_id: accountId,
      date,
      description,
      amount,
      category: null,
      import_id: null,
      is_internal: 0,
      note: null,
      tags: null
    })
  }

  return transactions
}
