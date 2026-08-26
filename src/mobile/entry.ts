import { initDatabase } from './db'
import { ensureChannels, restoreSchedule } from './notifications'
import { refresh as refreshBackgroundSync } from './background-sync'
import { createMobileApi } from './window-api'

/** Installs a native Android window.api when running outside Electron (i.e. under
 *  Capacitor). Imported conditionally from src/renderer/src/main.tsx before the
 *  React app mounts. */
export async function installMobileApi(): Promise<void> {
  await initDatabase()
  window.api = createMobileApi()
  // Android efface les notifications planifiées après un redémarrage du téléphone
  // ou une mise à jour de l'app : on reprogramme le rappel quotidien à chaque
  // lancement. Volontairement non bloquant — l'app ne doit pas attendre ça.
  void restoreSchedule().catch((err) => console.warn('[notifications] restauration', err))

  // Les canaux doivent exister avant que le runner de fond ne publie dessus — lui
  // ne peut pas les créer, et Android jette sans un mot toute notification adressée
  // à un canal inconnu.
  void ensureChannels().catch((err) => console.warn('[notifications] canaux', err))

  // Le token Powens et l'interrupteur vivent dans les Preferences Capacitor, que le
  // runner ne sait pas lire : chaque lancement les lui repousse. C'est aussi ce qui
  // rétablit la surveillance après une mise à jour de l'app ou un redémarrage du
  // téléphone, où le magasin du runner peut avoir été vidé.
  void refreshBackgroundSync().catch((err) => console.warn('[background-sync] init', err))
}
