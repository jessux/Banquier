import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

/**
 * Tests du runner de fond (src/renderer/public/runners/background.js).
 *
 * Le fichier ne peut pas être importé : il n'exporte rien et s'exécute normalement
 * dans un moteur JS sans modules. On l'évalue donc tel quel dans un `new Function`
 * en lui injectant les globales que lui fournissent Android/iOS. C'est un peu
 * inhabituel, mais ça teste l'artefact réellement embarqué plutôt qu'une copie de
 * sa logique — et c'est le seul moyen : ce code ne tourne jamais dans le webview,
 * donc jamais dans le reste de la suite.
 */

const SOURCE = readFileSync(
  fileURLToPath(new URL('../renderer/public/runners/background.js', import.meta.url)),
  'utf-8'
)

interface PowensTransaction {
  id: number
  value: number
  coming?: boolean
}

interface PowensConnection {
  id: number
  state?: string | null
  active?: boolean
  connector?: { name?: string }
}

interface ScheduledNotification {
  id: number
  channelId: string
  title: string
  body: string
}

type EventHandler = (
  resolve: (value?: unknown) => void,
  reject: (err?: unknown) => void,
  args: Record<string, unknown>
) => void

interface Harness {
  dispatch: (event: string, args?: Record<string, unknown>) => Promise<Record<string, unknown>>
  kv: Map<string, string>
  notifications: ScheduledNotification[]
  requests: string[]
}

interface Remote {
  transactions?: PowensTransaction[]
  connections?: PowensConnection[]
  /** Statut HTTP renvoyé pour /transactions, pour simuler une panne Powens. */
  transactionsStatus?: number
}

function loadRunner(remote: Remote, connected = true): Harness {
  const handlers = new Map<string, EventHandler>()
  const kv = new Map<string, string>()
  const notifications: ScheduledNotification[] = []
  const requests: string[] = []

  const addEventListener = (event: string, handler: EventHandler): void => {
    handlers.set(event, handler)
  }

  const CapacitorKV = {
    get: (key: string) => ({ value: kv.has(key) ? kv.get(key) : null }),
    set: (key: string, value: string) => {
      kv.set(key, String(value))
    },
    remove: (key: string) => {
      kv.delete(key)
    }
  }

  const CapacitorNotifications = {
    schedule: (list: ScheduledNotification[]) => {
      notifications.push(...list)
    }
  }

  const CapacitorDevice = { getNetworkStatus: () => ({ connected }) }

  const fetchStub = (url: string): Promise<unknown> => {
    requests.push(url)
    const isTransactions = url.includes('/users/me/transactions')
    const status = isTransactions ? (remote.transactionsStatus ?? 200) : 200
    const body = isTransactions
      ? { transactions: remote.transactions ?? [] }
      : { connections: remote.connections ?? [] }
    return Promise.resolve({
      ok: status >= 200 && status <= 299,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body))
    })
  }

  const silentConsole = { log: () => {}, info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }

  const evaluate = new Function(
    'addEventListener',
    'CapacitorKV',
    'CapacitorNotifications',
    'CapacitorDevice',
    'fetch',
    'console',
    SOURCE
  )
  evaluate(addEventListener, CapacitorKV, CapacitorNotifications, CapacitorDevice, fetchStub, silentConsole)

  const dispatch = (event: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> =>
    new Promise((resolve, reject) => {
      const handler = handlers.get(event)
      if (!handler) throw new Error(`Le runner n'écoute pas « ${event} »`)
      handler((value) => resolve((value ?? {}) as Record<string, unknown>), reject, args)
    })

  return { dispatch, kv, notifications, requests }
}

/** Raccourci : runner déjà configuré et actif, comme après un `refresh()` de l'app. */
async function activeRunner(remote: Remote, connected = true): Promise<Harness> {
  const runner = loadRunner(remote, connected)
  await runner.dispatch('configure', {
    enabled: true,
    domain: 'banquier-sandbox',
    token: 'tok',
    currencySymbol: '€'
  })
  return runner
}

describe('runner de fond — vérification des transactions', () => {
  let remote: Remote

  beforeEach(() => {
    remote = { transactions: [], connections: [] }
  })

  it('pose le curseur sans notifier au tout premier passage', async () => {
    remote.transactions = [
      { id: 10, value: -12 },
      { id: 42, value: -30 }
    ]
    const runner = await activeRunner(remote)

    const result = await runner.dispatch('checkTransactions')

    // Sans cette garde, activer la surveillance annoncerait comme « nouvelles »
    // toutes les transactions déjà en base.
    expect(result.newCount).toBe(0)
    expect(runner.notifications).toHaveLength(0)
    expect(runner.kv.get('lastSeenId')).toBe('42')
  })

  it('notifie les transactions arrivées depuis le passage précédent', async () => {
    remote.transactions = [{ id: 42, value: -30 }]
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')

    remote.transactions = [
      { id: 42, value: -30 },
      { id: 43, value: -10.5 },
      { id: 44, value: -4.5 }
    ]
    const result = await runner.dispatch('checkTransactions')

    expect(result.newCount).toBe(2)
    expect(runner.notifications).toHaveLength(1)
    expect(runner.notifications[0].title).toBe('2 nouvelles transactions')
    expect(runner.notifications[0].body).toContain('-15,00 €')
    expect(runner.kv.get('lastSeenId')).toBe('44')
    expect(runner.kv.get('pendingCount')).toBe('2')
  })

  it('accumule le compteur tant que l’app n’a pas importé', async () => {
    remote.transactions = [{ id: 1, value: -1 }]
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')

    remote.transactions = [{ id: 2, value: -1 }]
    await runner.dispatch('checkTransactions')
    remote.transactions = [{ id: 3, value: -1 }]
    await runner.dispatch('checkTransactions')

    expect(runner.kv.get('pendingCount')).toBe('2')

    // …jusqu'à ce que powensStartupSync le remette à zéro.
    const status = await runner.dispatch('configure', { pendingCount: 0 })
    expect(status.pendingCount).toBe(0)
  })

  it('ignore les écritures à venir, que l’import n’insère pas non plus', async () => {
    remote.transactions = [{ id: 1, value: -1 }]
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')

    remote.transactions = [
      { id: 1, value: -1 },
      { id: 2, value: -50, coming: true }
    ]
    const result = await runner.dispatch('checkTransactions')

    expect(result.newCount).toBe(0)
    expect(runner.notifications).toHaveLength(0)
    expect(runner.kv.get('lastSeenId')).toBe('1')
  })

  it('reste muet quand rien n’a bougé', async () => {
    remote.transactions = [{ id: 7, value: -3 }]
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')
    await runner.dispatch('checkTransactions')

    expect(runner.notifications).toHaveLength(0)
  })

  it('ne touche pas au réseau tant que la surveillance est désactivée', async () => {
    remote.transactions = [{ id: 7, value: -3 }]
    const runner = loadRunner(remote)
    await runner.dispatch('configure', { enabled: false, domain: 'banquier-sandbox', token: 'tok' })

    const result = await runner.dispatch('checkTransactions')

    expect(result.skipped).toBe(true)
    expect(runner.requests).toHaveLength(0)
  })

  it('ne touche pas au réseau sans connexion Powens', async () => {
    const runner = loadRunner(remote)
    await runner.dispatch('configure', { enabled: true })

    const result = await runner.dispatch('checkTransactions')

    expect(result.skipped).toBe(true)
    expect(runner.requests).toHaveLength(0)
  })

  it('passe son tour quand le téléphone est hors ligne', async () => {
    remote.transactions = [{ id: 7, value: -3 }]
    const runner = await activeRunner(remote, false)

    const result = await runner.dispatch('checkTransactions')

    expect(result.skipped).toBe(true)
    expect(runner.requests).toHaveLength(0)
  })

  it('retient l’erreur sans échouer quand Powens répond mal', async () => {
    remote.transactionsStatus = 503
    const runner = await activeRunner(remote)

    // Un rejet marquerait la tâche OS en échec sans rien apporter : l'erreur est
    // presque toujours transitoire, le prochain réveil réessaiera.
    const result = await runner.dispatch('checkTransactions')

    expect(result.error).toContain('503')
    expect(runner.kv.get('lastError')).toContain('503')
  })

  it('efface l’erreur précédente après une vérification réussie', async () => {
    remote.transactionsStatus = 503
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')

    remote.transactionsStatus = 200
    remote.transactions = [{ id: 1, value: -1 }]
    await runner.dispatch('checkTransactions')

    expect(runner.kv.get('lastError')).toBe('')
  })
})

describe('runner de fond — banques à reconnecter', () => {
  it('alerte une fois, puis se tait tant que l’état ne change pas', async () => {
    const remote: Remote = {
      transactions: [],
      connections: [{ id: 3, state: 'wrongpass', connector: { name: 'Crédit Agricole' } }]
    }
    const runner = await activeRunner(remote)

    await runner.dispatch('checkTransactions')
    expect(runner.notifications).toHaveLength(1)
    expect(runner.notifications[0].title).toBe('Banque à reconnecter')
    expect(runner.notifications[0].body).toContain('Crédit Agricole')

    // Réveil toutes les heures : répéter l'alerte serait insupportable.
    await runner.dispatch('checkTransactions')
    expect(runner.notifications).toHaveLength(1)
  })

  it('ne prend pas une synchronisation en cours pour une erreur', async () => {
    const remote: Remote = {
      transactions: [],
      connections: [{ id: 3, state: 'validating', connector: { name: 'Boursorama' } }]
    }
    const runner = await activeRunner(remote)

    await runner.dispatch('checkTransactions')

    expect(runner.notifications).toHaveLength(0)
  })

  it('alerte de nouveau si une AUTRE banque tombe en erreur', async () => {
    const remote: Remote = {
      transactions: [],
      connections: [{ id: 3, state: 'wrongpass', connector: { name: 'Crédit Agricole' } }]
    }
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')

    remote.connections = [
      { id: 3, state: 'wrongpass', connector: { name: 'Crédit Agricole' } },
      { id: 4, state: 'SCARequired', connector: { name: 'Boursorama' } }
    ]
    await runner.dispatch('checkTransactions')

    expect(runner.notifications).toHaveLength(2)
    expect(runner.notifications[1].body).toContain('Boursorama')
  })
})

describe('runner de fond — configuration', () => {
  it('remet le curseur à blanc à la déconnexion', async () => {
    const remote: Remote = { transactions: [{ id: 9, value: -1 }] }
    const runner = await activeRunner(remote)
    await runner.dispatch('checkTransactions')
    expect(runner.kv.get('lastSeenId')).toBe('9')

    const status = await runner.dispatch('configure', { enabled: false, token: '', reset: true })

    // Sans cette remise à blanc, reconnecter la banque plus tard ferait passer tout
    // l'historique rapatrié par Powens pour des nouveautés.
    expect(status.enabled).toBe(false)
    expect(status.configured).toBe(false)
    expect(runner.kv.get('lastSeenId')).toBe('')
    expect(runner.kv.get('pendingCount')).toBe('0')
  })

  it('ne modifie que les clés fournies', async () => {
    const remote: Remote = { transactions: [] }
    const runner = await activeRunner(remote)

    await runner.dispatch('configure', { enabled: false })

    expect(runner.kv.get('token')).toBe('tok')
    expect(runner.kv.get('domain')).toBe('banquier-sandbox')
  })

  it('ne renvoie jamais le token à l’app', async () => {
    const runner = await activeRunner({ transactions: [] })
    const status = await runner.dispatch('status')

    expect(status.configured).toBe(true)
    expect(Object.keys(status)).not.toContain('token')
  })
})
