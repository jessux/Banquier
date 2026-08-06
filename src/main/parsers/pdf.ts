import fs from 'fs'
import type { Transaction } from '../../shared/types'
import { extractTransactionsFromPages, type PdfTextItem } from '../../shared/pdfBankStatement'

// pdf-parse has no default ESM export — use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

interface PdfJsTextItem {
  str: string
  width: number
  transform: number[]
}

interface PdfJsTextContent {
  items: PdfJsTextItem[]
}

interface PdfJsPage {
  getTextContent(options: { normalizeWhitespace: boolean; disableCombineTextItems: boolean }): Promise<PdfJsTextContent>
}

// Récupère les fragments de texte de chaque page avec leurs coordonnées
// (nécessaire pour distinguer les colonnes Débit/Crédit) via le hook
// `pagerender` de pdf-parse, plutôt que son texte à plat par défaut.
async function extractPages(filePath: string): Promise<PdfTextItem[][]> {
  const buffer = fs.readFileSync(filePath)
  const pages: PdfTextItem[][] = []

  await pdfParse(buffer, {
    pagerender: (page: PdfJsPage) =>
      page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false }).then((content) => {
        pages.push(
          content.items.map((item) => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width
          }))
        )
        return ''
      })
  })

  return pages
}

export async function extractPdfTransactions(filePath: string): Promise<Omit<Transaction, 'id'>[]> {
  const pages = await extractPages(filePath)
  return extractTransactionsFromPages(pages)
}
