import type { Transaction } from './types'

// Parseur 100% local (aucun réseau, aucun LLM) pour les relevés bancaires PDF
// français. Fonctionne sur les positions (x/y) des fragments de texte du PDF
// plutôt que sur le texte brut : `pdf-parse`/`pdfjs-dist` ne réinsèrent pas
// fidèlement les espaces entre mots (deux fragments adjacents sans espace
// réel dans le flux du PDF se retrouvent collés), donc on reconstruit la
// table (colonnes Date/Nature/Valeur/Débit/Crédit, ou équivalent) à partir
// des coordonnées.
//
// Testé et calé sur deux mises en page très différentes :
// - BNP Paribas — Date/Nature des opérations/Valeur/Débit/Crédit, dates
//   compactes "26.12" (sans année, résolue via la période du relevé),
//   colonnes Débit/Crédit alignées à droite, montants > 999 scindés en
//   fragments PDF séparés par le séparateur de milliers ("1" + "809,00").
// - Revolut — Date/Description/Argent sortant/Argent entrant/Solde, dates
//   longues "1 juil. 2026" (année incluse), colonnes Argent sortant/entrant
//   alignées à gauche mais Solde à droite (une colonne à ignorer, pas un
//   montant de transaction), montants avec "€" et jamais scindés même
//   au-delà de 999.
// La détection des colonnes et de l'alignement est dynamique (à partir de
// l'en-tête), donc la plupart des banques françaises qui suivent l'une de
// ces deux conventions devraient être reconnues sans changement. Un relevé
// au format non reconnu (pas d'en-tête Débit/Crédit/Argent sortant-entrant
// ni Montant) donne simplement une liste vide plutôt qu'un résultat inventé.

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
  word: Word
}

interface MoneyColumn {
  kind: 'debit' | 'credit' | 'exclude'
  start: number
  end: number
}

const ROW_Y_TOLERANCE = 1.5
const WORD_GAP_THRESHOLD = 1.2

// Date compacte façon BNP ("26.12", "05/01/2026"), et date longue façon
// Revolut ("1 juil. 2026", "6 août 2026" — un seul fragment PDF, espaces
// internes conservés tels quels par `rowToWords`).
const DATE_RE = /^(\d{2})[./](\d{2})(?:[./](\d{2,4}))?$/
const LONG_DATE_RE = /^(\d{1,2})\s+([a-zéûôàè]+)\.?\s+(\d{4})$/i
// Nombre de chiffres avant la virgule non borné : certaines banques (BNP)
// scindent les milliers en fragments PDF séparés ("1 809,00" → "1" puis
// "809,00", absorbés ensemble par AMOUNT_GROUP_RE ci-dessous), d'autres
// (Revolut) gardent tout le nombre dans un seul fragment ("1500,00€") — le
// borner à 3 chiffres aurait silencieusement ignoré ces derniers.
const AMOUNT_SUFFIX_RE = /^-?\d+,\d{2}€?$/
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

// Trouve tous les montants d'une ligne (une transaction peut avoir plusieurs
// colonnes monétaires — ex: Argent sortant/entrant + Solde chez Revolut — et
// il faut les distinguer, pas juste prendre le dernier de la ligne). Absorbe
// au passage les groupes de milliers qui précèdent immédiatement un montant
// (ex: "1" + "809,00" → 1809.00).
function findAllAmounts(words: Word[]): AmountMatch[] {
  const matches: AmountMatch[] = []
  for (let i = 0; i < words.length; i++) {
    if (!AMOUNT_SUFFIX_RE.test(words[i].text)) continue
    let startIdx = i
    let digits = words[i].text.replace('€', '')
    let j = i - 1
    while (j >= 0 && AMOUNT_GROUP_RE.test(words[j].text)) {
      digits = words[j].text + digits
      startIdx = j
      j--
    }
    const value = parseFloat(digits.replace(',', '.'))
    if (!Number.isNaN(value)) matches.push({ value, startIdx, endIdx: i, word: words[i] })
  }
  return matches
}

function hasMontantHeader(allRows: PdfTextItem[][]): boolean {
  return allRows.some((row) => rowToWords(row).some((w) => /^montant$/i.test(w.text)))
}

interface TableLayout {
  // Bord gauche de la colonne Date (1re colonne de l'en-tête).
  leftEdge: number
  // Position de la colonne Nature/Libellé/Description (2e colonne), sur
  // laquelle les lignes de suite d'une description sont indentées.
  descColX: number
  // Colonnes monétaires détectées (Débit/Crédit, Argent sortant/entrant,
  // Solde à exclure...). Vide si le relevé n'a qu'une colonne "Montant".
  columns: MoneyColumn[]
}

// "Débit"/"Crédit" (BNP et la plupart des banques françaises), "Argent
// sortant"/"Argent entrant" (Revolut) désignent la même chose sous des noms
// différents ; "Solde" est un solde courant à ignorer, pas un montant de
// transaction.
function classifyColumnHeader(text: string): 'debit' | 'credit' | 'exclude' | null {
  if (/^d[ée]bit$/i.test(text) || /sortant/i.test(text)) return 'debit'
  if (/^cr[ée]dit$/i.test(text) || /entrant/i.test(text)) return 'credit'
  if (/^solde/i.test(text)) return 'exclude'
  return null
}

// Trouve la (les) ligne(s) d'en-tête du tableau — celles dont le premier mot
// commence par "Date" et qui portent une colonne Débit/Crédit ou équivalent —
// et leurs repères de colonnes. Les mentions légales de bas de page et autres
// identifiants de document isolés dans la marge ne respectent pas ces
// alignements : ça permet de les exclure sans dépendre de leur texte exact,
// qui varie d'une banque à l'autre. Certains relevés répètent un en-tête
// incomplet sur une section annexe (ex: transactions "en attente" chez
// Revolut, sans colonne Solde) : on fusionne les colonnes trouvées sur
// toutes les lignes d'en-tête plutôt que de s'arrêter à la première, tant
// que leurs positions restent cohérentes d'une occurrence à l'autre.
function detectTableLayout(allRows: PdfTextItem[][]): TableLayout | null {
  let leftEdge: number | null = null
  let descColX: number | null = null
  const columns = new Map<string, MoneyColumn>()

  for (const row of allRows) {
    const words = rowToWords(row)
    if (words.length < 2 || !/^date/i.test(words[0].text)) continue
    const kinds = words.map((w) => classifyColumnHeader(w.text))
    if (!kinds.some((k) => k === 'debit' || k === 'credit')) continue

    if (leftEdge === null) {
      const sorted = [...words].sort((a, b) => a.x - b.x)
      leftEdge = sorted[0].x
      descColX = sorted[1].x
    }

    words.forEach((w, i) => {
      const kind = kinds[i]
      if (!kind) return
      const key = `${kind}:${Math.round(w.x)}`
      if (!columns.has(key)) columns.set(key, { kind, start: w.x, end: w.end })
    })
  }

  if (leftEdge === null || descColX === null) return null
  return { leftEdge, descColX, columns: [...columns.values()] }
}

// Classe un montant selon la colonne monétaire la plus proche. Certaines
// colonnes sont alignées à gauche (Revolut : "Argent sortant"/"entrant"
// démarrent exactement sous l'en-tête), d'autres à droite (BNP : Débit/
// Crédit finissent exactement sous l'en-tête, Revolut : Solde) — on compare
// donc aux deux bords plutôt que de supposer un alignement fixe.
function classifyAmount(word: Word, columns: MoneyColumn[]): 'debit' | 'credit' | 'exclude' {
  let best: MoneyColumn | null = null
  let bestDist = Infinity
  for (const col of columns) {
    const dist = Math.min(Math.abs(word.x - col.start), Math.abs(word.end - col.end))
    if (dist < bestDist) {
      bestDist = dist
      best = col
    }
  }
  return best ? best.kind : 'exclude'
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

// Résout un nom de mois français, abrégé ou non, avec ou sans point
// ("juil.", "juillet", "août" → 7, 7, 8).
function resolveMonthToken(token: string): number | null {
  const clean = token.replace(/\.$/, '').toLowerCase()
  if (FRENCH_MONTHS[clean]) return FRENCH_MONTHS[clean]
  if (clean.length < 3) return null
  for (const [name, num] of Object.entries(FRENCH_MONTHS)) {
    if (name.startsWith(clean)) return num
  }
  return null
}

// Reconnaît une date en tout début de ligne, compacte ("26.12", résolue via
// la période du relevé) ou longue ("1 juil. 2026", année déjà incluse).
function matchTransactionDate(word: string, yearForMonth: (month: number) => number): string | null {
  const compact = word.match(DATE_RE)
  if (compact) {
    const [, dd, mm, yy] = compact
    const year = yy ? (yy.length === 2 ? 2000 + Number(yy) : Number(yy)) : yearForMonth(Number(mm))
    return `${year}-${mm}-${dd}`
  }
  const long = word.match(LONG_DATE_RE)
  if (long) {
    const month = resolveMonthToken(long[2])
    if (!month) return null
    return `${long[3]}-${String(month).padStart(2, '0')}-${long[1].padStart(2, '0')}`
  }
  return null
}

function isDateWord(text: string): boolean {
  return DATE_RE.test(text) || LONG_DATE_RE.test(text)
}

export function extractTransactionsFromPages(pages: PdfTextItem[][]): Omit<Transaction, 'id'>[] {
  const pageRows = pages.map(groupRows)
  const allRows = pageRows.flat()
  const layout = detectTableLayout(allRows)
  const hasMontant = hasMontantHeader(allRows)
  if ((!layout || layout.columns.length === 0) && !hasMontant) return []

  const yearForMonth = buildYearResolver(allRows)

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
      if (layout !== null && Math.abs(words[0].x - layout.descColX) > 3 && !isDateWord(first)) {
        openIdx = null
        continue
      }

      if (/^(solde|total)/i.test(first)) {
        openIdx = null
        continue
      }

      const date = matchTransactionDate(first, yearForMonth)
      if (date) {
        const amounts = findAllAmounts(words)
        const consumed = new Set<number>()
        let signedAmount: number | null = null

        if (layout && layout.columns.length > 0) {
          for (const amt of amounts) {
            for (let k = amt.startIdx; k <= amt.endIdx; k++) consumed.add(k)
            const kind = classifyAmount(amt.word, layout.columns)
            if (kind === 'exclude') continue
            if (signedAmount === null) signedAmount = Math.abs(amt.value) * (kind === 'debit' ? -1 : 1)
          }
        } else if (hasMontant) {
          const amt = amounts[amounts.length - 1]
          if (amt) {
            for (let k = amt.startIdx; k <= amt.endIdx; k++) consumed.add(k)
            signedAmount = amt.value
          }
        }

        if (signedAmount === null) {
          openIdx = null
          continue
        }

        const rest: string[] = []
        for (let i = 1; i < words.length; i++) {
          if (consumed.has(i)) continue
          if (isDateWord(words[i].text)) continue
          rest.push(words[i].text)
        }

        transactions.push({
          account_id: null,
          date,
          description: '',
          amount: Math.round(signedAmount * 100) / 100,
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
