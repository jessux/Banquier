import { autoUpdater } from 'electron-updater'
import { dialog, BrowserWindow } from 'electron'

// Intervalle de vérification périodique (en plus de la vérification au démarrage).
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 heures

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string }
  | { status: 'error'; message: string }

/**
 * Configure la mise à jour automatique via GitHub Releases.
 * La nouvelle version est téléchargée en arrière-plan ; l'utilisateur est
 * invité à redémarrer une fois le téléchargement terminé.
 *
 * À n'appeler qu'en production (app packagée). En dev, electron-updater
 * échoue car il n'y a pas d'installeur ni de métadonnées `latest.yml`.
 */
export function initAutoUpdater(getWindow: () => BrowserWindow | null): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[updater] recherche de mise à jour…')
  })

  autoUpdater.on('update-available', (info) => {
    console.log(`[updater] mise à jour disponible : ${info.version}`)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] application à jour')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] erreur :', err)
  })

  autoUpdater.on('download-progress', (p) => {
    console.log(`[updater] téléchargement ${Math.round(p.percent)}%`)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow()
    const options = {
      type: 'info' as const,
      buttons: ['Redémarrer maintenant', 'Plus tard'],
      defaultId: 0,
      cancelId: 1,
      title: 'Mise à jour disponible',
      message: `La version ${info.version} de Banquier a été téléchargée.`,
      detail: "Redémarrez l'application pour installer la mise à jour."
    }
    const { response } = win
      ? await dialog.showMessageBox(win, options)
      : await dialog.showMessageBox(options)
    if (response === 0) {
      autoUpdater.quitAndInstall()
    }
  })

  const check = (): void => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] échec de la vérification :', err)
    })
  }

  check()
  setInterval(check, CHECK_INTERVAL_MS)
}

/** Vérification manuelle déclenchée depuis les Paramètres. */
export async function checkForUpdatesManual(): Promise<UpdateCheckResult> {
  return new Promise((resolve) => {
    const onAvailable = (info: { version: string }): void => {
      cleanup()
      resolve({ status: 'available', version: info.version })
    }
    const onNotAvailable = (): void => {
      cleanup()
      resolve({ status: 'up-to-date' })
    }
    const onError = (err: Error): void => {
      cleanup()
      resolve({ status: 'error', message: err.message })
    }
    const onProgress = (info: { version: string }): void => {
      cleanup()
      resolve({ status: 'downloading', version: info.version })
    }

    const cleanup = (): void => {
      autoUpdater.removeListener('update-available', onAvailable)
      autoUpdater.removeListener('update-not-available', onNotAvailable)
      autoUpdater.removeListener('error', onError)
      autoUpdater.removeListener('download-progress', onProgress)
    }

    autoUpdater.once('update-available', onAvailable)
    autoUpdater.once('update-not-available', onNotAvailable)
    autoUpdater.once('error', onError)
    autoUpdater.once('download-progress', onProgress)

    autoUpdater.checkForUpdates().catch((err: Error) => {
      cleanup()
      resolve({ status: 'error', message: err.message })
    })
  })
}
