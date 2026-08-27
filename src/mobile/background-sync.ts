import { BackgroundRunner } from '@capacitor/background-runner'
import * as preferences from './preferences'
import { ensureChannels } from './notifications'
import { POWENS_CREDS } from './powens'
import * as battery from './battery-optimization'
import type { BackgroundSyncStatus } from '../shared/types'

/**
 * Face « app » de la surveillance Powens en arrière-plan.
 *
 * Le travail de fond lui-même vit dans src/renderer/public/runners/background.js,
 * exécuté par l'OS dans un moteur JS séparé du webview — donc sans accès à SQLite
 * ni aux Preferences Capacitor. Ce module est le seul point de contact entre les
 * deux mondes : il pousse au runner ce dont il a besoin (domaine + token Powens,
 * interrupteur, symbole monétaire) et relit son état.
 *
 * Ce que le runner sait faire, et ce qu'il ne peut pas faire : il interroge Powens,
 * repère les transactions arrivées depuis son dernier passage et envoie une
 * notification système. L'écriture en base reste l'affaire de `powensStartupSync`
 * à la réouverture de l'app — un moteur JS sans SQLite ne peut pas insérer une
 * ligne. Le gain concret est donc d'être prévenu dans l'heure sans ouvrir l'app,
 * l'import étant ensuite immédiat puisque Powens a déjà tout rapatrié.
 */

/** Doit rester identique au `label` déclaré dans capacitor.config.ts : c'est lui
 *  qui désigne le runner auprès du plugin. */
const RUNNER_LABEL = 'com.banquier.app.background.sync'

/** Reflète `interval` dans capacitor.config.ts. Purement informatif ici (l'OS reste
 *  seul maître de la cadence réelle), affiché dans les Paramètres. */
const INTERVAL_MINUTES = 60

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
  CHF: 'CHF',
  CAD: '$'
}

/** Forme renvoyée par les événements `configure` et `status` du runner. */
interface RunnerStatus {
  enabled?: boolean
  configured?: boolean
  lastCheckAt?: string
  lastError?: string
  pendingCount?: number
  lastSeenId?: number
}

const UNSUPPORTED: BackgroundSyncStatus = {
  supported: false,
  enabled: false,
  configured: false,
  lastCheckAt: null,
  lastError: null,
  pendingCount: 0,
  intervalMinutes: INTERVAL_MINUTES,
  batteryExempt: null
}

/** Le plugin n'existe ni sur desktop ni dans un simple navigateur (npm run dev) :
 *  toute la fonctionnalité doit alors s'effacer proprement plutôt que de lever. */
let supported: boolean | null = null

/**
 * Le plugin prévient qu'un `dispatchEvent` déclenché depuis l'app au premier plan
 * peut ne jamais se résoudre quand le gestionnaire fait du travail asynchrone. Un
 * bouton « Vérifier maintenant » figé pour toujours serait le symptôme visible :
 * on abandonne donc l'attente au bout d'un délai. Ce n'est pas une perte, le
 * runner ayant déjà écrit son résultat dans son magasin — un `status()` derrière
 * le récupère.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      }
    )
  })
}

/** Lecture/écriture de clés : purement synchrone côté runner, donc immédiat. */
const QUICK_TIMEOUT_MS = 10_000
/** Vérification complète : deux appels réseau vers Powens. */
const CHECK_TIMEOUT_MS = 60_000

async function dispatch(event: string, details: Record<string, unknown> = {}): Promise<RunnerStatus | null> {
  if (supported === false) return null
  try {
    const result = await withTimeout(
      BackgroundRunner.dispatchEvent<RunnerStatus>({ label: RUNNER_LABEL, event, details }),
      event === 'checkTransactions' ? CHECK_TIMEOUT_MS : QUICK_TIMEOUT_MS
    )
    if (result === null) {
      // Délai dépassé : le runner existe peut-être très bien, on ne le déclare donc
      // pas indisponible — mais on n'a rien à renvoyer pour cet appel-ci.
      console.warn('[background-sync] événement « ' + event + ' » sans réponse')
      return null
    }
    supported = true
    return result
  } catch (err) {
    // Premier appel en échec : on considère le runner indisponible et on cesse
    // d'essayer, plutôt que de faire échouer chaque synchronisation ensuite.
    if (supported === null) supported = false
    console.warn('[background-sync] événement « ' + event + ' » injoignable', err)
    return null
  }
}

/**
 * Écrit dans le runner puis renvoie son état. Un `configure` ne fait qu'écrire des
 * clés — s'il n'a pas répondu dans les temps, c'est l'attente qui a lâché, pas
 * forcément l'écriture : on relit l'état plutôt que de conclure à un runner absent
 * et de faire disparaître la section des Paramètres.
 */
async function configure(details: Record<string, unknown>): Promise<RunnerStatus | null> {
  const result = await dispatch('configure', details)
  if (result === null && supported !== false) return dispatch('status')
  return result
}

/**
 * L'exemption de batterie est lue à chaque fois plutôt que mémorisée : l'utilisateur
 * peut la révoquer depuis les réglages Android sans que l'app en soit informée, et
 * afficher « autorisé » alors qu'Android bride de nouveau les réveils serait le pire
 * des mensonges pour cet écran.
 */
async function toStatus(runner: RunnerStatus | null): Promise<BackgroundSyncStatus> {
  const exemption = await battery.status()
  const batteryExempt = exemption.supported ? exemption.granted : null

  if (!runner) return { ...UNSUPPORTED, batteryExempt }
  return {
    supported: true,
    enabled: runner.enabled === true,
    configured: runner.configured === true,
    lastCheckAt: runner.lastCheckAt || null,
    lastError: runner.lastError || null,
    pendingCount: runner.pendingCount ?? 0,
    intervalMinutes: INTERVAL_MINUTES,
    batteryExempt
  }
}

export async function status(): Promise<BackgroundSyncStatus> {
  return toStatus(await dispatch('status'))
}

/**
 * Pousse au runner l'état courant de la connexion Powens. À appeler après chaque
 * événement qui change ce que le runner doit surveiller : démarrage de l'app,
 * rattachement d'une banque, déconnexion.
 *
 * Le token Powens quitte donc les Preferences Capacitor pour le magasin du runner.
 * Ce sont deux zones privées à l'application (SharedPreferences / UserDefaults),
 * mais c'est une copie de plus : elle est effacée dès la déconnexion (`reset`).
 */
export async function refresh(): Promise<BackgroundSyncStatus> {
  const settings = await preferences.getSettings()
  const token = settings.powensToken

  if (!token) {
    // Plus de banque rattachée : rien à surveiller, et le curseur doit repartir de
    // zéro pour que la prochaine connexion ne prenne pas son historique pour des
    // nouveautés.
    return toStatus(await configure({ enabled: false, token: '', reset: true }))
  }

  // Le canal de notification doit exister AVANT que le runner ne tente d'y publier :
  // Android jette silencieusement toute notification adressée à un canal inconnu, et
  // le runner, lui, n'a pas de quoi le créer.
  await ensureChannels()

  return toStatus(
    await configure({
      enabled: settings.backgroundSyncEnabled === true,
      domain: POWENS_CREDS.domain,
      token,
      currencySymbol: CURRENCY_SYMBOLS[settings.currency] || settings.currency || '€'
    })
  )
}

export async function setEnabled(enabled: boolean): Promise<BackgroundSyncStatus> {
  await preferences.saveSettings({ backgroundSyncEnabled: enabled })
  if (!enabled) {
    // Désactivation : on remet le curseur à blanc. Sans ça, réactiver après deux
    // semaines annoncerait d'un coup toutes les transactions de l'intervalle,
    // dont l'app a déjà importé la plus grande partie au fil de ses démarrages.
    return toStatus(await configure({ enabled: false, reset: true }))
  }

  const next = await refresh()

  // Activer la surveillance sans l'exemption de batterie donne une fonctionnalité
  // qui a l'air active et ne se déclenche presque jamais. On enchaîne donc tout de
  // suite sur la demande d'autorisation, au seul moment où l'utilisateur a le
  // contexte pour comprendre ce qu'on lui demande. Un refus n'annule pas
  // l'activation : la tâche tournera, plus rarement, et l'écran le dit.
  if (next.batteryExempt === false) return requestBatteryExemption()
  return next
}

/** Remet le compteur à zéro après un import réussi : ces transactions ne sont plus
 *  « en attente », elles sont en base. */
export async function clearPending(): Promise<void> {
  await dispatch('configure', { pendingCount: 0 })
}

/** Déclenche une vérification immédiate, sans attendre le réveil de l'OS. Sert au
 *  bouton de test des Paramètres : sans lui, vérifier que la surveillance marche
 *  demanderait d'attendre une heure app fermée. */
export async function checkNow(): Promise<BackgroundSyncStatus> {
  await dispatch('checkTransactions')
  return status()
}

/**
 * Ouvre la boîte de dialogue Android « Autoriser l'application à s'exécuter en
 * arrière-plan ? ».
 *
 * Sans cette exemption, la tâche périodique est bien enregistrée mais le Doze la
 * regroupe avec les autres réveils du système : l'intervalle d'une heure demandé
 * devient facilement plusieurs heures, et sur un téléphone peu utilisé elle peut ne
 * pas se déclencher du tout avant qu'il soit rebranché. C'est donc l'autorisation
 * qui fait la différence entre « surveillance activée » et « surveillance qui
 * fonctionne vraiment ».
 */
export async function requestBatteryExemption(): Promise<BackgroundSyncStatus> {
  await battery.request()
  return status()
}

/** Écran système des applications optimisées : recours quand la boîte de dialogue
 *  n'existe pas sur l'appareil, et seul moyen de revenir sur l'autorisation. */
export async function openBatterySettings(): Promise<BackgroundSyncStatus> {
  await battery.openSettings()
  return status()
}
