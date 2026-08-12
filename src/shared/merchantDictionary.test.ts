import { describe, expect, it } from 'vitest'
import { MERCHANT_DICTIONARY, lookupMerchantDictionary } from './merchantDictionary'
import { normalizeMerchant } from './merchant'

/** Passe par la normalisation réelle : c'est sur cette clé que le dictionnaire
 *  est consulté en production, pas sur le libellé brut. */
const lookup = (description: string, amount = -20): string | null =>
  lookupMerchantDictionary(normalizeMerchant(description), amount)

describe('lookupMerchantDictionary', () => {
  it('reconnaît une enseigne dans un libellé bancaire réel', () => {
    expect(lookup('CB CARREFOUR MARKET 12/03 PARIS 4589')).toBe('Alimentation > Épicerie')
    expect(lookup('PRLV SEPA NETFLIX.COM')).toBe('Abonnements > Streaming')
    expect(lookup('CB SNCF CONNECT 03/04')).toBe('Transport > Transports en commun')
  })

  it('fait primer le motif le plus long', () => {
    expect(lookup('CB UBER EATS 12/03')).toBe('Restaurants > Livraison repas')
    expect(lookup('CB UBER TRIP 12/03')).toBe('Transport > Taxi / VTC')
    // L'Orange Bleue est une salle de sport, pas un opérateur télécom.
    expect(lookup('CB ORANGE BLEUE 05/01')).toBe('Loisirs > Sport')
    expect(lookup('PRLV ORANGE 05/01')).toBe('Logement > Internet / Téléphone')
  })

  it('distingue une boulangerie du distributeur Boulanger', () => {
    expect(lookup('CB BOULANGERIE DUPONT')).toBe('Alimentation > Boulangerie / Traiteur')
    expect(lookup('CB BOULANGER 12/03')).toBe('Shopping > Électronique')
  })

  it("tient compte du sens de l'opération", () => {
    expect(lookup('VIR MUTUELLE HARMONIE', -60)).toBe('Santé > Mutuelle')
    expect(lookup('VIR MUTUELLE HARMONIE', 60)).toBe('Revenus > Remboursements')
    expect(lookup('VIR SEPA SALAIRE MARS', 2400)).toBe('Salaire')
    // Un débit ne peut pas être un salaire.
    expect(lookup('VIR SEPA SALAIRE MARS', -2400)).toBeNull()
  })

  it('exige des bornes de mots', () => {
    // « CORA » ne doit pas matcher « CORAIL », ni « CAF » matcher « CAFETERIA ».
    expect(lookup('CB CORAIL VOYAGES')).toBeNull()
    expect(lookup('CB CAFETERIA DU PARC', 12)).toBeNull()
  })

  it('ne propose rien pour un marchand inconnu', () => {
    expect(lookup('CB ETS MARTIN ET FILS')).toBeNull()
    expect(lookup('')).toBeNull()
  })
})

describe('MERCHANT_DICTIONARY', () => {
  it('ne contient que des motifs déjà normalisés', () => {
    // Un motif accentué ou minuscule ne matcherait jamais : la clé marchand est
    // en majuscules sans accent.
    const invalid = MERCHANT_DICTIONARY.filter((e) => !/^[A-Z0-9 ]+$/.test(e.match))
    expect(invalid).toEqual([])
  })

  it('ne contient pas de motif réduit à néant par la normalisation', () => {
    // Ex. « H&M » se réduit à rien : l'entrée serait morte à l'écriture.
    const dead = MERCHANT_DICTIONARY.filter((e) => normalizeMerchant(e.match) === '')
    expect(dead).toEqual([])
  })

  it('ne contient pas de doublon de motif pour un même sens', () => {
    const seen = new Set<string>()
    const duplicates: string[] = []
    for (const entry of MERCHANT_DICTIONARY) {
      const key = `${entry.match}|${entry.direction ?? 'any'}`
      if (seen.has(key)) duplicates.push(key)
      seen.add(key)
    }
    expect(duplicates).toEqual([])
  })
})
