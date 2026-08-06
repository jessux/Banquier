import type { Transaction } from './types'

// Parseur 100% local (aucun réseau, aucun LLM) pour les relevés bancaires PDF
// français. Fonctionne sur les positions (x/y) des fragments de texte du PDF
// plutôt que sur le texte brut : `pdf-parse`/`pdfjs-dist` ne réinsèrent pas
// fidèlement les espaces entre mots (deux fragments adjacents sans espace
// réel dans le flux du PDF se retrouvent collés), donc on reconstruit la
// table (colonnes Date/Nature/Valeur/Débit/Crédit) à partir des coordonnées.
//
// Testé et calé sur un relevé BNP Paribas ; la mise en page Date/Libellé/
// Valeur/Débit/Crédit est partagée par la plupart des banques françaises. Un
// relevé au format non reconnu (pas d'en-tête Débit/Crédit ni Montant) donne
// simplement une liste vide plutôt qu'un résultat inventé.

export interface PdfTextItem {
  str: string
  x: number
  y: number
  width: number
}

interface Word {
  text: string
  x: number
  end: number
}

interface AmountMatch {
  value: number
  startIdx: number
  endIdx: number
  endWord: Word
}

interface ColumnBounds {
  debitEnd: number
  creditEnd: number
}

const ROW_Y_TOLERANCE = 1.5
const WORD_GAP_THRESHOLD = 1.2

const DATE_RE = /^(\d{2})[./](\d{2})(?:[./](\d{2,4}))?$/
const AMOUNT_SUFFIX_RE = /^-?\d{1,3},\d{2}$/
const AMOUNT_GROUP_RE = /^-?\d{1,3}$/

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  février: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  août: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
  décembre: 12
}

function groupRows(items: PdfTextItem[]): PdfTextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y)
  const rows: PdfTextItem[][] = []
  for (const item of sorted) {
    const current = rows[rows.length - 1]
    if (current && Math.abs(current[0].y - item.y) < ROW_Y_TOLERANCE) {
      current.push(item)
    } else {
      rows.push([item])
    }
  }
  for (const row of rows) row.sort((a, b) => a.x - b.x)
  return rows
}

// Reconstruit les "mots" d'une ligne à partir des fragments PDF : deux
// fragments quasi jointifs (pas d'espace réel dans le PDF entre eux) sont
// fusionnés, un vrai espace entre positions déclenche un nouveau mot — c'est
// aussi vrai pour le séparateur de milliers ("1" / "809,00" → deux fragments
// avec un espace, comme "VIR" / "CPTE").
function rowToWords(row: PdfTextItem[]): Word[] {
  const words: Word[] = []
  for (const item of row) {
    const text = item.str.trim()
    if (!text) continue
    const last = words[words.length - 1]
    if (last && item.x - last.end < WORD_GAP_THRESHOLD) {
      last.text += text
      last.end = item.x + item.width
    } else {
      words.push({ text, x: item.x, end: item.x + item.width })
    }
  }
  return words
}

function rowText(row: PdfTextItem[]): string {
  return rowToWords(row)
    .map((w) => w.text)
    .join(' ')
}

// Cherche le montant en fin de ligne, en absorbant les groupes de milliers
// qui le précèdent immédiatement (ex: "1" + "809,00" → 1809.00).
function findTrailingAmount(words: Word[]): AmountMatch | null {
  for (let i = words.length - 1; i >= 0; i--) {
    if (!AMOUNT_SUFFIX_RE.test(words[i].text)) continue
    let startIdx = i
    let digits = words[i].text
    let j = i - 1
    while (j >= 0 && AMOUNT_GROUP_RE.test(words[j].text)) {
      digits = words[j].text + digits
      startIdx = j
      j--
    }
    const value = parseFloat(digits.replace(',', '.'))
    if (Number.isNaN(value)) return null
    return { value, startIdx, endIdx: i, endWord: words[i] }
  }
  return null
}

function detectColumnBounds(allRows: PdfTextItem[][]): ColumnBounds | null {
  for (const row of allRows) {
    const words = rowToWords(row)
    const debit = words.find((w) => /^d[ée]bit$/i.test(w.text))
    const credit = words.find((w) => /^cr[ée]dit$/i.test(w.text))
    if (debit && credit) return { debitEnd: debit.end, creditEnd: credit.end }
  }
  return null
}

function hasMontantHeader(allRows: PdfTextItem[][]): boolean {
  return allRows.some((row) => rowToWords(row).some((w) => /^montant$/i.test(w.text)))
}

interface TableLayout {
  // Bord gauche de la colonne Date (1re colonne de l'en-tête).
  leftEdge: number
  // Position de la colonne Nature/Libellé (2e colonne), sur laquelle les
  // lignes de suite d'une description sont indentées.
  descColX: number
}

// Trouve la ligne d'en-tête du tableau (celle qui porte "Débit"/"Crédit" ou
// "Montant") et ses repères de colonnes. Les mentions légales de bas de page
// et autres identifiants de document isolés dans la marge ne respectent pas
// ces alignements : ça permet de les exclure sans dépendre de leur texte
// exact, qui varie d'une banque à l'autre.
function detectTableLayout(allRows: PdfTextItem[][]): TableLayout | null {
  for (const row of allRows) {
    const words = rowToWords(row)
    const isHeader = words.some(
      (w) => /^d[ée]bit$/i.test(w.text) || /^cr[ée]dit$/i.test(w.text) || /^montant$/i.test(w.text)
    )
    if (isHeader && words.length > 1) {
      const sorted = [...words].sort((a, b) => a.x - b.x)
      return { leftEdge: sorted[0].x, descColX: sorted[1].x }
    }
  }
  return null
}

function classifySign(endWord: Word, bounds: ColumnBounds): 1 | -1 {
  const midpoint = (bounds.debitEnd + bounds.creditEnd) / 2
  return endWord.end < midpoint ? -1 : 1
}

// Détermine l'année de chaque mois à partir de la période du relevé
// ("du 24 décembre 2025 au 24 janvier 2026"), avec repli sur les dates
// complètes (JJ.MM.AAAA) trouvées dans le document, puis sur l'année en cours.
function buildYearResolver(allRows: PdfTextItem[][]): (month: number) => number {
  const currentYear = new Date().getFullYear()
  let startMonth = 0
  let startYear = currentYear
  let endMonth = 0
  let endYear = currentYear
  let found = false

  for (const row of allRows) {
    const text = rowText(row)
    const m = text.match(/du\s+(\d{1,2})\s+([a-zéûôà]+)\s+(\d{4})\s+au\s+(\d{1,2})\s+([a-zéûôà]+)\s+(\d{4})/i)
    if (!m) continue
    const sm = FRENCH_MONTHS[m[2].toLowerCase()]
    const em = FRENCH_MONTHS[m[5].toLowerCase()]
    if (sm && em) {
      startMonth = sm
      startYear = Number(m[3])
      endMonth = em
      endYear = Number(m[6])
      found = true
      break
    }
  }

  if (!found) {
    const dates: { month: number; year: number }[] = []
    for (const row of allRows) {
      for (const m of rowText(row).matchAll(/\b(\d{2})\.(\d{2})\.(\d{4})\b/g)) {
        dates.push({ month: Number(m[2]), year: Number(m[3]) })
      }
    }
    if (dates.length > 0) {
      dates.sort((a, b) => a.year - b.year || a.month - b.month)
      startMonth = dates[0].month
      startYear = dates[0].year
      endMonth = dates[dates.length - 1].month
      endYear = dates[dates.length - 1].year
      found = true
    }
  }

  return (month: number): number => {
    if (!found) return currentYear
    if (month === startMonth) return startYear
    if (month === endMonth) return endYear
    // La période chevauche une fin d'année (ex: décembre → janvier)
    if (startMonth > endMonth) return month >= startMonth ? startYear : endYear
    return startYear
  }
}

export function extractTransactionsFromPages(pages: PdfTextItem[][]): Omit<Transaction, 'id'>[] {
  const pageRows = pages.map(groupRows)
  const allRows = pageRows.flat()
  const bounds = detectColumnBounds(allRows)
  if (!bounds && !hasMontantHeader(allRows)) return []

  const yearForMonth = buildYearResolver(allRows)
  const layout = detectTableLayout(allRows)

  const transactions: Omit<Transaction, 'id'>[] = []
  const descParts: string[][] = []

  // Une description ne continue jamais d'une page à l'autre : chaque page
  // répète son propre en-tête (adresse, "Date Nature ... Débit Crédit"...),
  // qui serait sinon happé comme suite de la dernière transaction de la page
  // précédente.
  for (const rows of pageRows) {
    let openIdx: number | null = null

    for (const row of rows) {
      const words = rowToWords(row)
      if (words.length === 0) continue
      const first = words[0].text

      // En dehors du tableau (mentions légales, identifiants de document
      // dans la marge...) : on arrête d'alimenter la transaction en cours
      // plutôt que de deviner. Une ligne de suite légitime est toujours
      // indentée exactement sur la colonne Nature/Libellé.
      if (layout !== null && Math.abs(words[0].x - layout.descColX) > 3 && !DATE_RE.test(first)) {
        openIdx = null
        continue
      }

      if (/^(solde|total)/i.test(first)) {
        openIdx = null
        continue
      }

      const dateMatch = first.match(DATE_RE)
      if (dateMatch) {
        const amount = findTrailingAmount(words)
        if (!amount) {
          openIdx = null
          continue
        }

        const [, dd, mm, yy] = dateMatch
        const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : yearForMonth(Number(mm))
        const date = `${year}-${mm}-${dd}`
        const value = bounds ? Math.abs(amount.value) * classifySign(amount.endWord, bounds) : amount.value

        const rest: string[] = []
        for (let i = 1; i < words.length; i++) {
          if (i >= amount.startIdx && i <= amount.endIdx) continue
          if (DATE_RE.test(words[i].text)) continue
          rest.push(words[i].text)
        }

        transactions.push({
          account_id: null,
          date,
          description: '',
          amount: Math.round(value * 100) / 100,
          category: null,
          import_id: null,
          is_internal: 0,
          note: null,
          tags: null
        })
        descParts.push(rest)
        openIdx = transactions.length - 1
        continue
      }

      if (openIdx !== null) {
        const text = words.map((w) => w.text).join(' ')
        if (text.trim()) descParts[openIdx].push(text)
      }
    }
  }

  transactions.forEach((t, i) => {
    t.description = descParts[i].join(' ').replace(/\s+/g, ' ').trim()
  })

  return transactions.filter((t) => t.description || t.amount !== 0)
}
