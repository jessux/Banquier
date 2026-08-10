import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { previewCsv, parseCsvToTransactions } from './csv'
import type { CsvMapping } from '../../shared/types'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banquier-csv-test-'))
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

function writeCsv(content: string): string {
  const filePath = path.join(tmpDir, 'statement.csv')
  fs.writeFileSync(filePath, content, { encoding: 'utf-8' })
  return filePath
}

describe('previewCsv', () => {
  it('détecte le délimiteur point-virgule (export Crédit Agricole)', () => {
    const filePath = writeCsv(
      'Date;Libellé;Débit;Crédit\n' +
      '01/06/2025;VIREMENT SALAIRE;;2500,00\n' +
      '02/06/2025;CB CARREFOUR;45,30;\n'
    )
    const preview = previewCsv(filePath)
    expect(preview.detectedDelimiter).toBe(';')
    expect(preview.headers).toEqual(['Date', 'Libellé', 'Débit', 'Crédit'])
    expect(preview.rows).toHaveLength(2)
  })

  it("n'est pas trompé par des virgules décimales dans un préambule", () => {
    // Une ligne de préambule "Solde au ... 239,43 €" contient une virgule
    // qui peut faire pencher une détection naïve vers ',' comme délimiteur.
    const filePath = writeCsv(
      'Relevé de compte\n' +
      'Solde au 01/06/2025 : 239,43 €\n' +
      'Date;Libellé;Montant\n' +
      '01/06/2025;CB FNAC;-59,90\n'
    )
    const preview = previewCsv(filePath)
    expect(preview.detectedDelimiter).toBe(';')
  })

  it('localise la ligne d’en-tête après un préambule', () => {
    const filePath = writeCsv(
      'Relevé de compte\n' +
      'Compte;1234567890\n' +
      'Date;Libellé;Montant\n' +
      '01/06/2025;CB FNAC;-59,90\n'
    )
    const preview = previewCsv(filePath)
    expect(preview.headers).toEqual(['Date', 'Libellé', 'Montant'])
    expect(preview.rows).toEqual([['01/06/2025', 'CB FNAC', '-59,90']])
  })

  it('retire le BOM UTF-8 en tête de fichier', () => {
    const filePath = path.join(tmpDir, 'bom.csv')
    fs.writeFileSync(filePath, '﻿' + 'Date;Libellé;Montant\n01/06/2025;CB FNAC;-59,90\n')
    const preview = previewCsv(filePath)
    expect(preview.headers[0]).toBe('Date')
  })
})

describe('parseCsvToTransactions', () => {
  const baseMapping: CsvMapping = {
    dateCol: 'Date',
    descriptionCol: 'Libellé',
    amountCol: 'Montant',
    debitCol: null,
    creditCol: null,
    dateFormat: 'DD/MM/YYYY',
    delimiter: ';',
    skipRows: 0
  }

  it('parse une colonne montant unique avec virgule décimale et symbole devise', () => {
    const filePath = writeCsv(
      'Date;Libellé;Montant\n' +
      '01/06/2025;CB FNAC;-59,90 €\n' +
      '02/06/2025;VIREMENT SALAIRE;2 500,00 €\n'
    )
    const txs = parseCsvToTransactions(filePath, baseMapping, 1)
    expect(txs).toHaveLength(2)
    expect(txs[0]).toMatchObject({ date: '2025-06-01', description: 'CB FNAC', amount: -59.9, account_id: 1 })
    expect(txs[1].amount).toBe(2500)
  })

  it('combine des colonnes Débit/Crédit distinctes en un montant signé', () => {
    const filePath = writeCsv(
      'Date;Libellé;Débit;Crédit\n' +
      '01/06/2025;CB FNAC;45,30;\n' +
      '02/06/2025;VIREMENT SALAIRE;;2500,00\n'
    )
    const mapping: CsvMapping = {
      dateCol: 'Date',
      descriptionCol: 'Libellé',
      amountCol: null,
      debitCol: 'Débit',
      creditCol: 'Crédit',
      dateFormat: 'DD/MM/YYYY',
      delimiter: ';',
      skipRows: 0
    }
    const txs = parseCsvToTransactions(filePath, mapping, 1)
    expect(txs[0].amount).toBe(-45.3)
    expect(txs[1].amount).toBe(2500)
  })

  it.each([
    ['DD/MM/YYYY', '25/12/2025', '2025-12-25'],
    ['DD/MM/YY', '25/12/25', '2025-12-25'],
    ['MM/DD/YYYY', '12/25/2025', '2025-12-25'],
    ['YYYY-MM-DD', '2025-12-25', '2025-12-25']
  ])('convertit le format de date %s', (dateFormat, raw, expected) => {
    const filePath = writeCsv(`Date;Libellé;Montant\n${raw};TEST;-10,00\n`)
    const mapping: CsvMapping = { ...baseMapping, dateFormat }
    const txs = parseCsvToTransactions(filePath, mapping, null)
    expect(txs[0].date).toBe(expected)
  })

  it('ignore les lignes sans description ni montant', () => {
    const filePath = writeCsv(
      'Date;Libellé;Montant\n' +
      '01/06/2025;;0\n' +
      '02/06/2025;CB FNAC;-10,00\n'
    )
    const txs = parseCsvToTransactions(filePath, baseMapping, null)
    expect(txs).toHaveLength(1)
    expect(txs[0].description).toBe('CB FNAC')
  })
})
