import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs'
import { Database } from 'node-sqlite3-wasm'
import os from 'os'
import path from 'path'
import * as db from './database'
import type { Transaction } from '../shared/types'

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

  it('marque is_internal quand la catégorie contient "intern"', () => {
    db.upsertCategoryRule('VIR EPARGNE', 'Virement interne')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'VIR EPARGNE LIVRET A', amount: -200, category: null, is_internal: 0 }
    ])
    db.applyRulesToTransactions(ids)

    const [tx] = db.getTransactions({})
    expect(tx.is_internal).toBe(1)
  })

  it("ne touche pas aux transactions qui ne correspondent à aucune règle", () => {
    db.upsertCategoryRule('AMAZON', 'Shopping')
    const ids = insertTx([
      { account_id: null, date: '2025-01-01', description: 'CB FNAC PARIS', amount: -25, category: null, is_internal: 0 }
    ])
    const updated = db.applyRulesToTransactions(ids)
    expect(updated).toBe(0)
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

describe('retrait des packs de regles (rollback 1.33.0)', () => {
  /** Reproduit une base telle que la 1.33.0 l'avait migrée, puis rouvre. */
  function reopenWithPacksSchema(): void {
    db.closeDatabase()
    const file = path.join(tmpDir, 'legacy.db')
    const legacy = new Database(file)
    legacy.exec(`
      CREATE TABLE category_rules (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        pattern  TEXT NOT NULL,
        category TEXT NOT NULL,
        source   TEXT NOT NULL DEFAULT 'user',
        priority INTEGER NOT NULL DEFAULT 0,
        internal INTEGER NOT NULL DEFAULT 0,
        UNIQUE(pattern, source)
      );
      CREATE TABLE rule_packs (id TEXT PRIMARY KEY, version TEXT NOT NULL, name TEXT NOT NULL, installed_at TEXT NOT NULL);
      CREATE TABLE shared_rules (pattern TEXT PRIMARY KEY, shared_at TEXT NOT NULL);
      INSERT INTO category_rules (pattern, category, source, priority) VALUES
        ('AMAZON', 'Loisirs', 'user', 0),
        ('AMAZON', 'Shopping', 'pack:fr-base', 100000),
        ('CARREFOUR', 'Alimentation', 'pack:fr-base', 100001);
    `)
    legacy.close()
    db.initDatabase(file)
  }

  it('restaure UNIQUE(pattern) pour que la creation de regles refonctionne', () => {
    reopenWithPacksSchema()
    // Échouait avec « ON CONFLICT clause does not match any PRIMARY KEY
    // or UNIQUE constraint » tant que UNIQUE(pattern, source) subsistait.
    expect(() => db.upsertCategoryRule('FNAC', 'Shopping')).not.toThrow()
  })

  it('conserve les regles, la version utilisateur primant sur celle du pack', () => {
    reopenWithPacksSchema()
    const rules = db.getCategoryRulesWithId()
    expect(rules.map((r) => r.pattern).sort()).toEqual(['AMAZON', 'CARREFOUR'])
    expect(rules.find((r) => r.pattern === 'AMAZON')?.category).toBe('Loisirs')
  })

  it('supprime les tables devenues inutiles', () => {
    reopenWithPacksSchema()
    db.upsertCategoryRule('LIDL', 'Alimentation')
    expect(db.getCategoryRules().some((r) => r.pattern === 'LIDL')).toBe(true)
  })
})

describe('merchant_key', () => {
  it("est calculée à l'insertion", () => {
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 12/03 PARIS 4589', amount: -42, category: null, is_internal: 0 }
    ])
    const [tx] = db.getTransactions({})
    expect(tx.merchant_key).toBe('CARREFOUR MARKET PARIS')
  })

  it('regroupe le même marchand malgré des libellés différents', () => {
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 12/03 PARIS 4589', amount: -42, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-08', description: 'PAIEMENT CARREFOUR MARKET 08/02 PARIS 7712', amount: -31, category: null, is_internal: 0 }
    ])
    const keys = db.getTransactions({}).map((t) => t.merchant_key)
    expect(keys).toHaveLength(2)
    expect(new Set(keys).size).toBe(1)
  })

  it('est renseignée rétroactivement pour les transactions importées avant la colonne', () => {
    // Simule une base d'avant la migration : colonne présente mais vide.
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'PRLV NETFLIX.COM PARIS', amount: -13.49, category: null, is_internal: 0 }
    ])
    const dbPath = db.getActiveDbPath()
    db.closeDatabase()
    const raw = new Database(dbPath)
    raw.exec('UPDATE transactions SET merchant_key = NULL')
    raw.close()

    db.initDatabase(dbPath)
    const [tx] = db.getTransactions({})
    expect(tx.merchant_key).toBe('NETFLIX COM PARIS')
  })
})

describe('mémoire marchand', () => {
  it('rejoue une correction sur les transactions importées ensuite', () => {
    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB BOULANGERIE DUPONT 05/01 LYON', amount: -4.2, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(id, 'Alimentation')

    // Nouveau relevé : même marchand, libellé différent (date et référence).
    const [next] = insertTx([
      { account_id: null, date: '2025-02-11', description: 'CB BOULANGERIE DUPONT 11/02 LYON 8871', amount: -3.8, category: null, is_internal: 0 }
    ])
    expect(db.autoCategorize([next])).toBe(1)
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Alimentation')
  })

  it('ne réécrit pas une catégorie déjà posée', () => {
    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB AMAZON 05/01', amount: -30, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(id, 'Shopping')

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'CB AMAZON 05/02', amount: -20, category: 'Loisirs', is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Loisirs')
  })

  it('fait primer la dernière décision de l\'utilisateur', () => {
    const [first] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB AMAZON 05/01', amount: -30, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(first, 'Shopping')
    db.updateTransactionCategory(first, 'Loisirs')

    const [next] = insertTx([
      { account_id: null, date: '2025-03-05', description: 'CB AMAZON 05/03', amount: -12, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Loisirs')
  })

  it('propage aux similaires par clé marchand, pas par libellé exact', () => {
    const ids = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB SNCF 05/01 PARIS 111', amount: -45, category: null, is_internal: 0 },
      { account_id: null, date: '2025-02-05', description: 'CB SNCF 05/02 PARIS 222', amount: -60, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(ids[0], 'Transport', true)

    const categories = db.getTransactions({}).map((t) => t.category)
    expect(categories).toEqual(['Transport', 'Transport'])
  })

  it('les propositions IA validées nourrissent la mémoire', () => {
    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'PRLV SPOTIFY 05/01', amount: -11.99, category: null, is_internal: 0 }
    ])
    db.batchUpdateCategories([{ id, category: 'Abonnements > Streaming' }])

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'PRLV SPOTIFY 05/02', amount: -11.99, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Abonnements > Streaming')
  })

  it('les règles priment sur la mémoire', () => {
    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB FNAC 05/01', amount: -30, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(id, 'Loisirs')
    db.upsertCategoryRule('FNAC', 'Shopping')

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'CB FNAC 05/02', amount: -25, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Shopping')
  })

  it('suit le renommage d\'une catégorie', () => {
    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB DECATHLON 05/01', amount: -60, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(id, 'Loisirs')
    const loisirs = db.getCategoryTree().find((c) => c.name === 'Loisirs' && c.parent_id === null)!
    db.renameCategory(loisirs.id, 'Sport & Loisirs')

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'CB DECATHLON 05/02', amount: -20, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    // Sans propagation, la mémoire ressusciterait « Loisirs », catégorie morte.
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Sport & Loisirs')
  })

  it("s'amorce depuis l'historique déjà catégorisé, la catégorie majoritaire l'emportant", () => {
    insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB MONOPRIX 05/01', amount: -30, category: 'Alimentation', is_internal: 0 },
      { account_id: null, date: '2025-01-12', description: 'CB MONOPRIX 12/01', amount: -22, category: 'Alimentation', is_internal: 0 },
      { account_id: null, date: '2025-01-20', description: 'CB MONOPRIX 20/01', amount: -18, category: 'Shopping', is_internal: 0 }
    ])

    // Simule une base d'avant l'introduction de la mémoire.
    const dbPath = db.getActiveDbPath()
    db.closeDatabase()
    const raw = new Database(dbPath)
    raw.exec('DROP TABLE merchant_categories')
    raw.close()
    db.initDatabase(dbPath)

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'CB MONOPRIX 05/02', amount: -25, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Alimentation')
  })
})

describe('dictionnaire marchand', () => {
  it('catégorise les enseignes connues dès le premier import, mémoire vide', () => {
    const ids = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 05/01 PARIS', amount: -42, category: null, is_internal: 0 },
      { account_id: null, date: '2025-01-06', description: 'PRLV NETFLIX.COM', amount: -13.49, category: null, is_internal: 0 }
    ])
    expect(db.autoCategorize(ids)).toBe(2)

    const byId = new Map(db.getTransactions({}).map((t) => [t.id, t.category]))
    expect(byId.get(ids[0])).toBe('Alimentation > Épicerie')
    expect(byId.get(ids[1])).toBe('Abonnements > Streaming')
  })

  it('retombe sur la catégorie parente si la sous-catégorie a été supprimée', () => {
    const epicerie = db.getCategoryTree().find((c) => c.name === 'Épicerie')!
    db.deleteCategory(epicerie.id)

    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 05/01', amount: -42, category: null, is_internal: 0 }
    ])
    db.autoCategorize([id])
    expect(db.getTransactions({})[0].category).toBe('Alimentation')
  })

  it("n'invente pas de catégorie absente de l'arborescence de l'utilisateur", () => {
    const alimentation = db.getCategoryTree().find((c) => c.name === 'Alimentation' && c.parent_id === null)!
    db.deleteCategory(alimentation.id) // supprime aussi ses enfants

    const [id] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 05/01', amount: -42, category: null, is_internal: 0 }
    ])
    db.autoCategorize([id])
    expect(db.getTransactions({})[0].category).toBeNull()
  })

  it('la mémoire de l\'utilisateur prime sur le dictionnaire', () => {
    const [first] = insertTx([
      { account_id: null, date: '2025-01-05', description: 'CB CARREFOUR MARKET 05/01', amount: -42, category: null, is_internal: 0 }
    ])
    db.updateTransactionCategory(first, 'Shopping')

    const [next] = insertTx([
      { account_id: null, date: '2025-02-05', description: 'CB CARREFOUR MARKET 05/02', amount: -30, category: null, is_internal: 0 }
    ])
    db.autoCategorize([next])
    expect(db.getTransactions({}).find((t) => t.id === next)?.category).toBe('Shopping')
  })
})
