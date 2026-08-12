import { describe, expect, it } from 'vitest'
import {
  findFuzzyCategory,
  groupByMerchant,
  literalToRulePattern,
  parseCategorizationResponse
} from './categorization'
import type { Transaction } from './types'

const catList = ['Alimentation', 'Transport', 'Autre']
const fallback = 'Autre'
const transactions = [
  { id: 1, description: 'CB FNAC', amount: -50 },
  { id: 2, description: 'CB CARREFOUR', amount: -30 },
  { id: 3, description: 'SNCF', amount: -20 }
]

describe('parseCategorizationResponse', () => {
  it('associe les catégories aux transactions par position quand les longueurs correspondent', () => {
    const response =
      'Voici le résultat: [{"categorie":"Alimentation","confiance":0.9},{"categorie":"Alimentation","confiance":0.8},{"categorie":"Transport","confiance":0.7}]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result).toEqual([
      { id: 1, category: 'Alimentation', confidence: 0.9 },
      { id: 2, category: 'Alimentation', confidence: 0.8 },
      { id: 3, category: 'Transport', confidence: 0.7 }
    ])
  })

  it("rejette le lot si le modèle renvoie moins d'éléments que de transactions envoyées", () => {
    // Un décalage de longueur (ligne fusionnée/omise) ferait assigner la
    // mauvaise catégorie à toutes les transactions suivantes si on mappait
    // quand même par position — on doit rejeter plutôt que mal classer.
    const response = '[{"categorie":"Alimentation","confiance":0.9},{"categorie":"Transport","confiance":0.9}]'
    expect(parseCategorizationResponse(response, transactions, catList, fallback)).toEqual([])
  })

  it("rejette le lot si le modèle renvoie plus d'éléments que de transactions envoyées", () => {
    const response = '[{"categorie":"Alimentation","confiance":0.9},{"categorie":"Alimentation","confiance":0.9},{"categorie":"Transport","confiance":0.9},{"categorie":"Autre","confiance":0.9}]'
    expect(parseCategorizationResponse(response, transactions, catList, fallback)).toEqual([])
  })

  it('retombe sur la catégorie de repli si une catégorie proposée est hors liste', () => {
    const response = '[{"categorie":"Loisirs","confiance":0.95},{"categorie":"Alimentation","confiance":0.9},{"categorie":"Transport","confiance":0.9}]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result[0].category).toBe('Autre')
    // La confiance annoncée ne vaut plus rien : ce n'est pas cette catégorie
    // qui est appliquée. La laisser passer ferait auto-accepter un repli.
    expect(result[0].confidence).toBe(0)
  })

  it('accepte encore le format historique en chaînes nues', () => {
    const response = '["Alimentation", "Alimentation", "Transport"]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result.map((r) => r.category)).toEqual(['Alimentation', 'Alimentation', 'Transport'])
    // Sans chiffre annoncé, la proposition ne doit pas passer pour une certitude.
    expect(result.every((r) => r.confidence < 0.8)).toBe(true)
  })

  it('borne la confiance à [0, 1]', () => {
    const response = '[{"categorie":"Alimentation","confiance":7},{"categorie":"Alimentation","confiance":-3},{"categorie":"Transport"}]'
    const result = parseCategorizationResponse(response, transactions, catList, fallback)
    expect(result.map((r) => r.confidence)).toEqual([1, 0, 0.5])
  })

  it('retourne un tableau vide si la réponse ne contient aucun JSON', () => {
    expect(parseCategorizationResponse('Désolé, je ne peux pas répondre.', transactions, catList, fallback)).toEqual([])
  })

  it('retourne un tableau vide si le JSON est invalide', () => {
    expect(parseCategorizationResponse('[Alimentation, Transport, Autre]', transactions, catList, fallback)).toEqual([])
  })
})

const tx = (
  id: number,
  description: string,
  amount: number,
  merchant_key: string | null
): Pick<Transaction, 'id' | 'description' | 'amount' | 'merchant_key'> => ({
  id,
  description,
  amount,
  merchant_key
})

describe('groupByMerchant', () => {
  it('regroupe les transactions d\'un même marchand', () => {
    const groups = groupByMerchant([
      tx(1, 'CB CARREFOUR 05/01', -20, 'CARREFOUR'),
      tx(2, 'CB CARREFOUR 12/02', -30, 'CARREFOUR'),
      tx(3, 'CB SNCF 03/03', -80, 'SNCF')
    ])

    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.merchant)).toEqual(['SNCF', 'CARREFOUR'])
    expect(groups[1].transactionIds).toEqual([1, 2])
    expect(groups[1].total).toBe(-50)
  })

  it('trie par impact décroissant, pour que l\'essentiel soit traité en premier', () => {
    const groups = groupByMerchant([
      tx(1, 'CB PETIT 05/01', -5, 'PETIT'),
      tx(2, 'CB GROS 05/01', -500, 'GROS')
    ])
    expect(groups.map((g) => g.merchant)).toEqual(['GROS', 'PETIT'])
  })

  it('prend la plus grosse transaction comme représentant', () => {
    const groups = groupByMerchant([
      tx(1, 'CB AMAZON 05/01', -9, 'AMAZON'),
      tx(2, 'CB AMAZON MARKETPLACE 12/02', -120, 'AMAZON')
    ])
    expect(groups[0].description).toBe('CB AMAZON MARKETPLACE 12/02')
    expect(groups[0].amount).toBe(-120)
  })

  it('retombe sur la normalisation quand la clé marchand est absente', () => {
    const groups = groupByMerchant([
      tx(1, 'CB MONOPRIX 05/01 PARIS', -20, null),
      tx(2, 'PAIEMENT MONOPRIX 12/02 PARIS', -30, null)
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].transactionIds).toEqual([1, 2])
  })
})

describe('findFuzzyCategory', () => {
  const memory = [
    { merchant_key: 'CARREFOUR MARKET PARIS', category: 'Alimentation', count: 4 },
    { merchant_key: 'BOULANGERIE DUPONT', category: 'Alimentation > Boulangerie / Traiteur', count: 3 }
  ]

  it('rapproche deux magasins d\'une même enseigne', () => {
    expect(findFuzzyCategory('CARREFOUR MARKET LYON', memory)).toBe('Alimentation')
  })

  it('rapproche une clé plus longue de sa version courte', () => {
    expect(findFuzzyCategory('BOULANGERIE DUPONT LYON', memory)).toBe(
      'Alimentation > Boulangerie / Traiteur'
    )
  })

  it('ne confond pas deux commerces qui ne partagent que le métier', () => {
    // Un seul mot commun : « BOULANGERIE » désigne le métier, pas le commerçant.
    expect(findFuzzyCategory('BOULANGERIE MARTIN', memory)).toBeNull()
  })

  it('ignore une correspondance exacte, déjà traitée en amont', () => {
    expect(findFuzzyCategory('CARREFOUR MARKET PARIS', memory)).toBeNull()
  })

  it('ne tranche pas entre deux candidats aussi bien placés qui divergent', () => {
    const ambiguous = [
      { merchant_key: 'CENTRE COMMERCIAL NORD', category: 'Shopping', count: 2 },
      { merchant_key: 'CENTRE COMMERCIAL SUD', category: 'Loisirs', count: 2 }
    ]
    expect(findFuzzyCategory('CENTRE COMMERCIAL EST', ambiguous)).toBeNull()
  })

  const rivals = [
    { merchant_key: 'CENTRE COMMERCIAL', category: 'Shopping', count: 9 },
    { merchant_key: 'CENTRE COMMERCIAL NORD', category: 'Loisirs', count: 1 }
  ]

  it('privilégie la clé la plus proche, même moins établie', () => {
    // Trois mots communs battent deux, quel que soit le nombre de décisions.
    expect(findFuzzyCategory('CENTRE COMMERCIAL NORD OUEST', rivals)).toBe('Loisirs')
  })

  it('départage deux clés aussi proches par le nombre de décisions', () => {
    // Deux mots communs de chaque côté : la décision la plus répétée l'emporte.
    expect(findFuzzyCategory('CENTRE COMMERCIAL OUEST', rivals)).toBe('Shopping')
  })

  it('ne renvoie rien sur une mémoire vide ou une clé vide', () => {
    expect(findFuzzyCategory('CARREFOUR MARKET LYON', [])).toBeNull()
    expect(findFuzzyCategory('', memory)).toBeNull()
  })
})

describe('literalToRulePattern', () => {
  it('laisse un mot simple intact', () => {
    expect(literalToRulePattern('SNCF')).toBe('SNCF')
  })

  it('échappe les caractères qui feraient dérailler la regex', () => {
    // Sans échappement, « E.LECLERC » matcherait « EXLECLERC », et « 100% BIO »
    // ou « CAFE (LE) » feraient carrément planter la compilation.
    expect(new RegExp(literalToRulePattern('E.LECLERC'), 'i').test('EXLECLERC')).toBe(false)
    expect(new RegExp(literalToRulePattern('E.LECLERC'), 'i').test('CB E.LECLERC LYON')).toBe(true)
    expect(() => new RegExp(literalToRulePattern('CAFE (LE)'), 'i')).not.toThrow()
    expect(new RegExp(literalToRulePattern('CAFE (LE)'), 'i').test('CB CAFE (LE) PARIS')).toBe(true)
  })

  it('ignore les espaces de bord', () => {
    expect(literalToRulePattern('  SNCF  ')).toBe('SNCF')
  })
})
