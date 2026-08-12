import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import * as db from './database'
import type { Transaction } from '../shared/types'
import { FR_BASE_PACK } from '../shared/rulePacks'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banquier-db-test-'))
  db.initDatabase(path.join(tmpDir, 'test.db'))
})

afterEach(() => {
  db.closeDatabase()
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

type TestTxInput = Pick<Transaction, 'account_id' | 'date' | 'description' | 'amount' | 'category' | 'is_internal'>

/** Insère des transactions de test via le pipeline public (import + insertTransactions). */
function insertTx(rows: TestTxInput[]): number[] {
  const imp = db.createImport('test.csv', rows.length)
  const { insertedIds } = db.insertTransactions(
    rows.map((r) => ({ ...r, import_id: imp.id, note: null, tags: null })),
    imp.id
  )
  return insertedIds
}

describe('getRecurringExpenses', () => {
  it('détecte un abonnement mensuel régulier', () => {
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'PRLV NETFLIX.COM PARIS', amount: -13.49, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-05', description: 'PRLV NETFLIX.COM PARIS', amount: -13.49, category: null, is_internal: 0 },
      { account_id: null, date: '2025-03-05', description: 'PRLV NETFLIX.COM PARIS', amount: -13.49, category: null, is_internal: 0 },
      { account_id: null, date: '2025-04-05', description: 'PRLV NETFLIX.COM PARIS', amount: -13.49, category: null, is_internal: 0 }
    ])

    const { items } = db.getRecurringExpenses()
    expect(items).toHaveLength(1)
    expect(items[0].frequency).toBe('mensuel')
    expect(items[0].occurrences).toBe(4)
    expect(items[0].averageAmount).toBeCloseTo(13.49)
  })

  it('ignore les marchands avec moins de 3 occurrences', () => {
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'PRLV SPOTIFY', amount: -9.99, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-05', description: 'PRLV SPOTIFY', amount: -9.99, category: null, is_internal: 0 }
    ])
    expect(db.getRecurringExpenses().items).toHaveLength(0)
  })

  it('ignore les paiements irréguliers (coefficient de variation trop élevé)', () => {
    insertTx([
      { account_id: null, date: '2025-01-01', description: 'CB SUPERMARCHE', amount: -20, category: null, is_internal: 0 },
      { account_id: null, date: '2025-01-04', description: 'CB SUPERMARCHE', amount: -35, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-20', description: 'CB SUPERMARCHE', amount: -18, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-22', description: 'CB SUPERMARCHE', amount: -40, category: null, is_internal: 0 }
    ])
    expect(db.getRecurringExpenses().items).toHaveLength(0)
  })

  it('exclut les transactions marquées comme virement interne', () => {
    // insertTransactions n'écrit pas is_internal (toujours 0 à l'import) — le
    // marquage se fait après coup, via setTransactionInternal ou une règle.
    const ids = insertTx([
      { account_id: null, date: '2025-01-05', description: 'VIR EPARGNE', amount: -100, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-05', description: 'VIR EPARGNE', amount: -100, category: null, is_internal: 0 },
      { account_id: null, date: '2025-03-05', description: 'VIR EPARGNE', amount: -100, category: null, is_internal: 0 }
    ])
    ids.forEach((id) => db.setTransactionInternal(id, true))
    expect(db.getRecurringExpenses().items).toHaveLength(0)
  })
})

describe('getRecurringIncome', () => {
  it('détecte un salaire mensuel régulier et ignore les dépenses', () => {
    insertTx([
      { account_id: null, date: '2025-01-01', description: 'VIR SALAIRE EMPLOYEUR', amount: 2500, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-01', description: 'VIR SALAIRE EMPLOYEUR', amount: 2500, category: null, is_internal: 0 },
      { account_id: null, date: '2025-03-01', description: 'VIR SALAIRE EMPLOYEUR', amount: 2500, category: null, is_internal: 0 },
      // Dépenses présentes dans la même base : ne doivent pas apparaître ici
      // (c'est le rôle de getRecurringExpenses), ni l'inverse.
      { account_id: null, date: '2025-01-05', description: 'PRLV NETFLIX.COM', amount: -13.49, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-05', description: 'PRLV NETFLIX.COM', amount: -13.49, category: null, is_internal: 0 },
      { account_id: null, date: '2025-03-05', description: 'PRLV NETFLIX.COM', amount: -13.49, category: null, is_internal: 0 }
    ])

    const income = db.getRecurringIncome()
    expect(income.items).toHaveLength(1)
    expect(income.items[0].frequency).toBe('mensuel')
    expect(income.items[0].averageAmount).toBeCloseTo(2500)

    const expenses = db.getRecurringExpenses()
    expect(expenses.items).toHaveLength(1)
    expect(expenses.items[0].merchant).toContain('NETFLIX')
  })
})

describe('applyRulesToTransactions', () => {
  it('applique la première règle correspondante et catégorise', () => {
    db.upsertCategoryRule('AMAZON', 'Shopping')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'CB AMAZON.FR PARIS', amount: -25, category: null, is_internal: 0 }
    ])

    const updated = db.applyRulesToTransactions(ids)
    expect(updated).toBe(1)

    const [tx] = db.getTransactions({})
    expect(tx.category).toBe('Shopping')
  })

  it('marque is_internal quand la catégorie est un mouvement interne', () => {
    db.upsertCategoryRule('VIR EPARGNE', 'Virement interne')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'VIR EPARGNE LIVRET A', amount: -200, category: null, is_internal: 0 }
    ])
    db.applyRulesToTransactions(ids)

    const [tx] = db.getTransactions({})
    expect(tx.is_internal).toBe(1)
  })

  it('ne marque pas is_internal sur « Internet / Téléphone »', () => {
    // Régression : le moteur testait `category.includes('intern')`, ce qui
    // sortait les factures internet des totaux de dépenses.
    db.upsertCategoryRule('BOUYGUES TEL', 'Logement > Internet / Téléphone')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'PRLV BOUYGUES TELECOM', amount: -30, category: null, is_internal: 0 }
    ])
    db.applyRulesToTransactions(ids)

    const [tx] = db.getTransactions({})
    expect(tx.category).toBe('Logement > Internet / Téléphone')
    expect(tx.is_internal).toBe(0)
  })

  it("ne touche pas aux transactions qui ne correspondent à aucune règle", () => {
    db.upsertCategoryRule('AMAZON', 'Shopping')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'XYZQ 4712', amount: -25, category: null, is_internal: 0 }
    ])
    const updated = db.applyRulesToTransactions(ids)
    expect(updated).toBe(0)
  })

  it('donne la priorité à la règle utilisateur sur celle du pack', () => {
    // fr-base est installé d'office sur une base vierge et classe AMAZON en
    // « Shopping ». Une règle utilisateur doit gagner malgré un id plus grand.
    db.upsertCategoryRule('AMAZON', 'Loisirs > Jeux / Hobbies')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'CB AMAZON EU SARL', amount: -25, category: null, is_internal: 0 }
    ])
    db.applyRulesToTransactions(ids)

    const [tx] = db.getTransactions({})
    expect(tx.category).toBe('Loisirs > Jeux / Hobbies')
  })
})

describe('rule packs', () => {
  it('installe fr-base sur une base vierge', () => {
    const installed = db.getInstalledPacks()
    expect(installed.map((p) => p.id)).toContain('fr-base')
    expect(installed[0].rule_count).toBeGreaterThan(0)
  })

  it('catégorise un import dès la première synchro', () => {
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'CB CARREFOUR MARKET', amount: -42, category: null, is_internal: 0 },
      { account_id: null, date: '2025-01-02', description: 'PRLV SEPA EDF', amount: -80, category: null, is_internal: 0 }
    ])
    expect(db.applyRulesToTransactions(ids)).toBe(2)

    const categories = db.getTransactions({}).map((t) => t.category).sort()
    expect(categories).toEqual(['Alimentation > Épicerie', 'Logement > Électricité / Gaz'])
  })

  it('réinstalle un pack sans toucher aux règles utilisateur', () => {
    db.upsertCategoryRule('AMAZON', 'Loisirs > Jeux / Hobbies')
    const before = db.getCategoryRulesWithId().filter((r) => r.source === 'user')

    db.installRulePack(FR_BASE_PACK)

    const after = db.getCategoryRulesWithId().filter((r) => r.source === 'user')
    expect(after).toEqual(before)
  })

  it('accepte un pattern déjà utilisé par une règle utilisateur', () => {
    // UNIQUE(pattern, source) : le même pattern peut coexister dans les deux
    // sources sans faire échouer l'installation.
    db.upsertCategoryRule('CARREFOUR', 'Autre')
    expect(() => db.installRulePack(FR_BASE_PACK)).not.toThrow()

    const carrefour = db.getCategoryRulesWithId().filter((r) => r.pattern === 'CARREFOUR')
    expect(carrefour).toHaveLength(1)
    expect(carrefour[0].source).toBe('user')
  })

  it('désinstalle les règles du pack en conservant les catégories', () => {
    const categoriesBefore = db.getCategoryPaths().length
    const removed = db.uninstallRulePack('fr-base')

    expect(removed).toBeGreaterThan(0)
    expect(db.getInstalledPacks()).toHaveLength(0)
    expect(db.getCategoryRulesWithId().filter((r) => r.source === 'pack:fr-base')).toHaveLength(0)
    // Des transactions sont probablement rattachées aux catégories : on les garde.
    expect(db.getCategoryPaths().length).toBe(categoriesBefore)
  })
})

describe('comparePeriods', () => {
  it('calcule l’écart absolu et en pourcentage par catégorie', () => {
    insertTx([
      { account_id: null, date: '2025-01-10', description: 'A', amount: -100, category: 'Alimentation', is_internal: 0 },
      { account_id: null, date: '2025-02-10', description: 'A', amount: -150, category: 'Alimentation', is_internal: 0 }
    ])

    const result = db.comparePeriods('2025-01-01', '2025-01-31', '2025-02-01', '2025-02-28')
    const row = result.categories.find((c) => c.category === 'Alimentation')
    expect(row).toBeDefined()
    expect(row!.totalA).toBe(100)
    expect(row!.totalB).toBe(150)
    expect(row!.diff).toBe(50)
    expect(row!.pct).toBe(50)
  })
})

describe('renameCategory', () => {
  it("échappe % et _ dans le nom pour ne pas déraper vers des catégories sans rapport", () => {
    const parent = db.createCategory('100% Bio')
    db.createCategory('Fruits', parent.id)

    const [realId, decoyId] = insertTx([
      { account_id: null, date: '2025-01-01', description: 'A', amount: -10, category: '100% Bio > Fruits', is_internal: 0 },
      // Sans échappement, le motif LIKE '100% Bio > %' matcherait aussi ceci
      // ('%' agissant comme joker), alors que ce nom n'a aucun rapport.
      { account_id: null, date: '2025-01-02', description: 'B', amount: -20, category: '1000000 Bio > Autre', is_internal: 0 }
    ])

    db.renameCategory(parent.id, '100% Fruits et Légumes')

    const real = db.getTransactions({}).find((t) => t.id === realId)!
    const decoy = db.getTransactions({}).find((t) => t.id === decoyId)!
    expect(real.category).toBe('100% Fruits et Légumes > Fruits')
    expect(decoy.category).toBe('1000000 Bio > Autre')
  })
})

describe('getBudgetsWithSpent', () => {
  it('agrège les dépenses des sous-catégories dans le budget parent', () => {
    db.upsertBudget('Alimentation', 300)
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'A', amount: -40, category: 'Alimentation', is_internal: 0 },
      { account_id: null, date: '2025-01-06', description: 'B', amount: -25, category: 'Alimentation > Épicerie', is_internal: 0 }
    ])

    const [budget] = db.getBudgetsWithSpent('2025-01-01', '2025-01-31')
    expect(budget.spent).toBe(65)
  })
})

describe('objectifs d’épargne', () => {
  it('un objectif sans compte lié suit le montant saisi manuellement', () => {
    const goal = db.createSavingsGoal('Vacances', 3000, '2026-06-30', null)
    db.updateSavingsGoalManualAmount(goal.id, 450)

    const [withProgress] = db.getSavingsGoalsWithProgress()
    expect(withProgress.currentAmount).toBe(450)
    expect(withProgress.balanceKnown).toBe(true)
    expect(withProgress.accountName).toBeNull()
  })

  it('un objectif lié à un compte suit le solde du compte (converti via fx_rate)', () => {
    const account = db.createAccount('Livret A', 'Banque Test', 'EUR')
    db.updateAccountBalance(account.id, 1200)
    db.updateAccountFxRate(account.id, 1.1)
    const goal = db.createSavingsGoal('Épargne de précaution', 5000, null, account.id)

    const [withProgress] = db.getSavingsGoalsWithProgress()
    expect(withProgress.currentAmount).toBeCloseTo(1320) // 1200 * 1.1
    expect(withProgress.balanceKnown).toBe(true)
    expect(withProgress.accountName).toBe('Livret A')
  })

  it('un objectif lié à un compte sans solde connu affiche une progression indisponible plutôt que 0 trompeur', () => {
    const account = db.createAccount('Compte manuel', 'Banque Test', 'EUR')
    const goal = db.createSavingsGoal('Achat voiture', 8000, null, account.id)

    const [withProgress] = db.getSavingsGoalsWithProgress()
    expect(withProgress.balanceKnown).toBe(false)
    expect(withProgress.currentAmount).toBe(0)
    expect(withProgress.id).toBe(goal.id)
  })

  it('update et delete fonctionnent', () => {
    const goal = db.createSavingsGoal('Objectif', 1000, null, null)
    db.updateSavingsGoal(goal.id, 'Objectif renommé', 1500, '2026-12-31', null)

    let [updated] = db.getSavingsGoalsWithProgress()
    expect(updated.name).toBe('Objectif renommé')
    expect(updated.target_amount).toBe(1500)
    expect(updated.target_date).toBe('2026-12-31')

    db.deleteSavingsGoal(goal.id)
    expect(db.getSavingsGoalsWithProgress()).toHaveLength(0)
  })
})
