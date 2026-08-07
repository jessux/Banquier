import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { Transaction } from '../../shared/types'
import { extractTransactionsFromPages, type PdfTextItem } from '../../shared/pdfBankStatement'
import { getCachedFile } from '../file-picker'

// Pas de `GlobalWorkerOptions.workerSrc` ici, volontairement : voir le commentaire
// détaillé au-dessus d'`extractPdfTransactions` plus bas, et docs/mobile.md (section Phase 5).

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Extrait les transactions d'un PDF déjà mis en cache par file-picker.ts (voir
 *  getCachedFile). Équivalent mobile d'`extractPdfTransactions` dans
 *  `src/main/parsers/pdf.ts` : même logique de reconstruction du tableau par
 *  positions (`src/shared/pdfBankStatement.ts`, partagée), mais lecture des
 *  fragments de texte via pdf.js/WASM côté client au lieu du `pdf-parse`
 *  Node-only du desktop (basé sur `fs.readFileSync` + le module natif
 *  `pdf-parse`, indisponibles dans le bundle renderer mobile).
 *
 *  Web Worker désactivé intentionnellement (aucun `GlobalWorkerOptions.workerSrc`
 *  configuré) : pdf.js retombe alors automatiquement sur son "fake worker", qui
 *  exécute le parsing sur le thread principal au lieu d'un Worker dédié (avec un
 *  simple `console.warn("Setting up fake worker.")`, sans erreur). C'est un
 *  compromis délibéré plutôt qu'un oubli — voir docs/mobile.md pour le détail
 *  du raisonnement (chargement de Worker peu fiable dans une WebView Capacitor :
 *  URL blob/module Worker, CSP, origine `file://`/`https://localhost` selon la
 *  plateforme…) et le risque que ça représente, non vérifiable sans appareil réel. */
export async function extractPdfTransactions(handle: string): Promise<Omit<Transaction, 'id'>[]> {
  const cached = getCachedFile(handle)
  if (!cached) throw new Error('Fichier introuvable — veuillez le resélectionner')

  const data = decodeBase64ToBytes(cached.base64)
  const doc = await pdfjsLib.getDocument({ data, isEvalSupported: false }).promise

  const pages: PdfTextItem[][] = []
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const content = await page.getTextContent()
    pages.push(
      content.items
        .filter((item): item is typeof item & { str: string; width: number; transform: number[] } => 'str' in item)
        .map((item) => ({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width }))
    )
  }
  await doc.destroy()

  return extractTransactionsFromPages(pages)
}
