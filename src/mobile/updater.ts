import pkg from '../../package.json'

/**
 * Vérification de mise à jour pour l'app Android, pendant utile de
 * `src/main/updater.ts` (electron-updater) côté desktop.
 *
 * Contrairement au desktop, il n'y a pas de téléchargement + installation
 * automatique en arrière-plan : ça demanderait la permission Android
 * `REQUEST_INSTALL_PACKAGES` et un flux de téléchargement/installation natif
 * dédié, jamais validé sur un appareil réel. On se limite donc à détecter
 * qu'une version plus récente existe (via l'API GitHub Releases, comme le fait
 * déjà `android-build.yml` pour publier les APK) et à ouvrir le lien de
 * téléchargement direct de l'APK dans le navigateur — l'utilisateur l'installe
 * ensuite comme n'importe quelle APK téléchargée.
 *
 * Volontairement pas `@capacitor/browser` (`Browser.open`) : ce plugin ouvre
 * une Chrome Custom Tab, dont le téléchargement reste bloqué à 100 % sans
 * jamais se finaliser sur certains appareils/connexions (observé en 4G avec
 * signal faible) — le même lien copié dans Chrome directement se télécharge
 * sans problème. `window.open(url, '_blank')` laisse le WebViewClient par
 * défaut de Capacitor déléguer l'URL au navigateur système via une intent
 * `ACTION_VIEW` classique, exactement comme un lien tapé manuellement.
 */

const REPO = 'jessux/Banquier'

export type UpdateCheckResult =
  | { status: 'up-to-date' }
  | { status: 'available'; version: string }
  | { status: 'error'; message: string }

interface GitHubAsset {
  name: string
  browser_download_url: string
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  assets: GitHubAsset[]
}

/** Compare deux versions "major.minor.patch" (préfixe "v" toléré). */
function isNewer(remote: string, local: string): boolean {
  const parse = (v: string): number[] =>
    v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0)
  const [rMaj, rMin, rPatch] = parse(remote)
  const [lMaj, lMin, lPatch] = parse(local)
  if (rMaj !== lMaj) return rMaj > lMaj
  if (rMin !== lMin) return rMin > lMin
  return rPatch > lPatch
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'Banquier-Android' }
    })
    if (!res.ok) throw new Error(`GitHub a répondu ${res.status}`)
    const release = (await res.json()) as GitHubRelease

    if (!isNewer(release.tag_name, pkg.version)) {
      return { status: 'up-to-date' }
    }

    // Priorité au lien direct de l'APK ; à défaut, la page de la release (l'APK
    // peut manquer si le build Android a échoué pour cette version précise).
    const apkAsset = release.assets.find((a) => a.name.endsWith('.apk'))
    window.open(apkAsset?.browser_download_url ?? release.html_url, '_blank')

    return { status: 'available', version: release.tag_name.replace(/^v/, '') }
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) }
  }
}
