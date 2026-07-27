import { initDatabase } from './db'
import { createMobileApi } from './window-api'

/** Installs a native Android window.api when running outside Electron (i.e. under
 *  Capacitor). Imported conditionally from src/renderer/src/main.tsx before the
 *  React app mounts. */
export async function installMobileApi(): Promise<void> {
  await initDatabase()
  window.api = createMobileApi()
}
