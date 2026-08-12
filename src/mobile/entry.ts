import { initDatabase } from './db'
import { seedDefaults } from './api/rulePacks'
import { restoreSchedule } from './notifications'
import { createMobileApi } from './window-api'

/** Installs a native Android window.api when running outside Electron (i.e. under
 *  Capacitor). Imported conditionally from src/renderer/src/main.tsx before the
 *  React app mounts. */
export async function installMobileApi(): Promise<void> {
  const { fresh } = await initDatabase()
  await seedDefaults(fresh)
  window.api = createMobileApi()
  // Android efface les notifications planifiées après un redémarrage du téléphone
  // ou une mise à jour de l'app : on reprogramme le rappel quotidien à chaque
  // lancement. Volontairement non bloquant — l'app ne doit pas attendre ça.
  void restoreSchedule().catch((err) => console.warn('[notifications] restauration', err))
}
