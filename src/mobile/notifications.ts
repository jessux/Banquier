import { LocalNotifications } from '@capacitor/local-notifications'
import { Preferences } from '@capacitor/preferences'
import * as preferences from './preferences'
import type { NotificationsStatus } from '../shared/types'

/**
 * Notifications système Android (barre de statut + bannière), via
 * `@capacitor/local-notifications`.
 *
 * Ce sont de vraies notifications de l'OS, pas les toasts HTML de `App.tsx` : elles
 * s'affichent même quand l'app est en arrière-plan — c'est justement le cas pendant
 * une synchronisation Powens, qui peut durer plusieurs minutes et pendant laquelle
 * l'utilisateur quitte l'app.
 *
 * Pourquoi des notifications *locales* et pas du push FCM : Banquier n'a pas de
 * serveur (toutes les données vivent dans le SQLite du téléphone), et le push FCM
 * suppose un backend qui pousse les messages. Toutes les notifications utiles ici
 * — fin de synchronisation, banque à reconnecter, budget dépassé — sont produites
 * par l'app elle-même, donc le canal local est le bon outil. Le rappel quotidien
 * (`setDailyHour`) est programmé côté OS et se déclenche même app fermée.
 */

/** Canaux Android : `IMPORTANCE_HIGH` (4) donne une bannière + son, ce qui est le
 *  comportement attendu d'une « notification push ». */
const CHANNEL_SYNC = 'banquier-sync'
const CHANNEL_ALERTS = 'banquier-alerts'

/** Drawable monochrome dédié (android/app/src/main/res/drawable/ic_stat_banquier.xml).
 *  Android n'affiche que la silhouette du small icon : réutiliser ic_launcher, qui
 *  est en couleur, produirait un carré blanc. */
const NOTIFICATION_ICON = 'ic_stat_banquier'

/** IDs stables : une nouvelle notification du même type remplace la précédente au
 *  lieu d'empiler des doublons dans la barre de statut. */
const ID_SYNC = 1001
const ID_SYNC_ERROR = 1002
const ID_BUDGET = 1003
const ID_DAILY = 1004

let channelsReady = false

/**
 * Crée les canaux de notification Android. Exporté parce que le runner de fond
 * (src/renderer/public/runners/background.js) publie sur ces mêmes canaux sans
 * pouvoir les créer : Android ignore purement et simplement une notification
 * adressée à un canal inexistant, donc l'app doit les avoir posés au préalable.
 */
export async function ensureChannels(): Promise<void> {
  if (channelsReady) return
  try {
    await LocalNotifications.createChannel({
      id: CHANNEL_SYNC,
      name: 'Synchronisation bancaire',
      description: 'Fin de synchronisation Powens et nouvelles transactions',
      importance: 4,
      visibility: 1
    })
    await LocalNotifications.createChannel({
      id: CHANNEL_ALERTS,
      name: 'Alertes budget',
      description: 'Budgets dépassés et banques à reconnecter',
      importance: 4,
      visibility: 1
    })
    channelsReady = true
  } catch (err) {
    // createChannel n'existe que sur Android — ailleurs on continue sans canal.
    console.warn('[notifications] création des canaux impossible', err)
  }
}

async function permissionGranted(): Promise<boolean> {
  try {
    const { display } = await LocalNotifications.checkPermissions()
    return display === 'granted'
  } catch {
    return false
  }
}

export async function status(): Promise<NotificationsStatus> {
  const settings = await preferences.getSettings()
  return {
    supported: true,
    granted: await permissionGranted(),
    // Par défaut activées : l'utilisateur qui accorde la permission veut être notifié.
    enabled: settings.notificationsEnabled !== false,
    dailyHour: settings.notificationsDailyHour ?? null
  }
}

/** Demande la permission POST_NOTIFICATIONS (obligatoire depuis Android 13). */
export async function request(): Promise<NotificationsStatus> {
  try {
    await LocalNotifications.requestPermissions()
    await ensureChannels()
  } catch (err) {
    console.warn('[notifications] permission refusée ou indisponible', err)
  }
  const granted = await permissionGranted()
  // Accorder la permission vaut activation : sinon l'utilisateur devrait accepter
  // la popup système *puis* basculer un second interrupteur dans les paramètres.
  if (granted) await preferences.saveSettings({ notificationsEnabled: true })
  return status()
}

export async function setEnabled(enabled: boolean): Promise<NotificationsStatus> {
  await preferences.saveSettings({ notificationsEnabled: enabled })
  if (enabled && !(await permissionGranted())) return request()
  if (!enabled) await cancelDailyReminder()
  return status()
}

/** Vrai seulement si l'utilisateur veut les notifications ET que l'OS les autorise. */
async function canNotify(): Promise<boolean> {
  const s = await status()
  return s.enabled && s.granted
}

async function show(
  id: number,
  channelId: string,
  title: string,
  body: string
): Promise<void> {
  if (!(await canNotify())) return
  await ensureChannels()
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          channelId,
          title,
          body,
          smallIcon: NOTIFICATION_ICON,
          // Sans `schedule`, la notification part immédiatement.
          ongoing: false,
          autoCancel: true
        }
      ]
    })
  } catch (err) {
    console.warn('[notifications] envoi impossible', err)
  }
}

/** Fin de synchronisation Powens. Silencieuse quand rien n'a bougé : notifier
 *  « 0 nouvelle transaction » à chaque ouverture de l'app serait du bruit. */
export async function syncDone(imported: number, categorized: number): Promise<void> {
  if (imported <= 0) return
  const plural = imported > 1 ? 's' : ''
  const body =
    categorized > 0
      ? `${imported} nouvelle${plural} transaction${plural} · ${categorized} catégorisée${categorized > 1 ? 's' : ''} automatiquement`
      : `${imported} nouvelle${plural} transaction${plural} importée${plural}`
  await show(ID_SYNC, CHANNEL_SYNC, 'Synchronisation terminée', body)
}

/** Banque en erreur côté Powens (identifiants, authentification forte…). */
export async function syncWarning(warning: string): Promise<void> {
  await show(ID_SYNC_ERROR, CHANNEL_ALERTS, 'Banque à reconnecter', warning.slice(0, 200))
}

export async function syncFailed(message: string): Promise<void> {
  // Contrairement aux autres, cet événement peut se produire à chaque lancement
  // (téléphone hors ligne, par exemple). Quand l'app est à l'écran, le toast de
  // `App.tsx` porte déjà l'information : inutile d'y ajouter une notification.
  if (document.visibilityState === 'visible') return
  await show(
    ID_SYNC_ERROR,
    CHANNEL_ALERTS,
    'Synchronisation échouée',
    message.slice(0, 200) || 'Réessayez depuis les paramètres.'
  )
}

/** Marqueur anti-répétition du rappel budget (clé Preferences dédiée : c'est un
 *  détail d'implémentation, pas un réglage utilisateur). */
const BUDGET_LAST_KEY = 'banquier-budget-notified-on'

export async function budgetAlert(categories: string[], overCount: number): Promise<void> {
  if (overCount <= 0) return
  // Vérifié avant de poser le marqueur : sinon un refus de permission
  // consommerait le rappel du jour sans que rien ne s'affiche.
  if (!(await canNotify())) return

  // L'alerte est calculée à chaque démarrage de l'app : sans garde, rouvrir
  // Banquier trois fois dans la journée enverrait trois fois la même notification.
  const today = new Date().toISOString().slice(0, 10)
  const { value } = await Preferences.get({ key: BUDGET_LAST_KEY })
  if (value === today) return
  await Preferences.set({ key: BUDGET_LAST_KEY, value: today })

  const plural = overCount > 1 ? 's' : ''
  const extra = overCount > categories.length ? ` +${overCount - categories.length} autre(s)` : ''
  await show(
    ID_BUDGET,
    CHANNEL_ALERTS,
    `Budget${plural} dépassé${plural}`,
    `${categories.join(', ')}${extra}`
  )
}

export async function test(): Promise<void> {
  await show(
    ID_SYNC,
    CHANNEL_SYNC,
    'Notifications activées',
    'Banquier vous préviendra des nouvelles transactions et des budgets dépassés.'
  )
}

async function cancelDailyReminder(): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: ID_DAILY }] })
  } catch {
    // Rien à annuler.
  }
}

/**
 * Rappel quotidien « pensez à synchroniser ». Programmé auprès de l'OS avec
 * `repeats: true`, il se déclenche donc même app fermée — c'est la seule
 * notification qui n'a pas besoin que Banquier tourne.
 */
export async function setDailyHour(hour: number | null): Promise<NotificationsStatus> {
  await preferences.saveSettings({ notificationsDailyHour: hour })
  await cancelDailyReminder()

  if (hour == null) return status()
  if (!(await canNotify())) return status()
  await ensureChannels()

  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: ID_DAILY,
          channelId: CHANNEL_SYNC,
          title: 'Banquier',
          body: 'Ouvrez l’app pour récupérer vos dernières transactions.',
          smallIcon: NOTIFICATION_ICON,
          schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true }
        }
      ]
    })
  } catch (err) {
    console.warn('[notifications] programmation du rappel quotidien impossible', err)
  }
  return status()
}

/** Reprogramme le rappel quotidien au démarrage : Android efface les notifications
 *  planifiées après un redémarrage du téléphone ou une mise à jour de l'app. */
export async function restoreSchedule(): Promise<void> {
  const settings = await preferences.getSettings()
  const hour = settings.notificationsDailyHour
  if (hour == null) return
  if (!(await canNotify())) return
  await setDailyHour(hour)
}
