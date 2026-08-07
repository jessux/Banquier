import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import type { PluginListenerHandle } from '@capacitor/core'
import { domainParam, type PowensCreds } from './powens'

export interface WebviewResult {
  connectionId?: string
  code?: string
  error?: string
  errorDescription?: string
  /** Le Custom Tab s'est fermé sans qu'aucun deep link n'arrive. Ce n'est *pas*
   *  forcément une annulation : certaines banques (parcours App2App) ramènent
   *  l'utilisateur au navigateur sans déclencher la redirection. L'appelant doit
   *  vérifier auprès de Powens si une connexion a malgré tout été créée. */
  dismissed?: boolean
}

/** Délai laissé au deep link pour arriver après la fermeture du Custom Tab, avant
 *  de considérer que la redirection ne viendra pas et de vérifier directement
 *  auprès de Powens (voir `dismissed` dans WebviewResult). Initialement remonté
 *  à 8s car un timer trop court provoquait un faux « Connexion annulée. » sur
 *  device réel (App2App bancaire) — mais depuis que ce timer ne fait plus que
 *  déclencher une vérification (au lieu de rejeter directement), un délai court
 *  ne coûte plus qu'un aller-retour réseau superflu si le deep link était sur le
 *  point d'arriver, au lieu d'un vrai risque de faux négatif. */
const DEEPLINK_GRACE_MS = 2000

/**
 * Équivalent mobile de src/main/powens.ts's openConnectWebview : au lieu d'une
 * BrowserWindow Electron interceptant la navigation, on ouvre le webview de
 * connexion Powens dans un Custom Tab (@capacitor/browser) et on récupère la
 * redirection via un deep link (@capacitor/app's appUrlOpen), grâce au schéma
 * custom `banquier://powens-callback` déclaré dans AndroidManifest.xml.
 *
 * ⚠️ Ce `redirect_uri` doit être déclaré dans la console d'administration Powens
 * (liste blanche), sinon le webview répond « invalid 'redirect_uri' ». Le
 * `http://localhost:8645` du desktop y est déjà, le schéma custom doit être
 * ajouté à côté.
 */
export async function openConnectWebview(creds: PowensCreds, code: string | null): Promise<WebviewResult> {
  const params = new URLSearchParams({
    domain: domainParam(creds.domain),
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    max_connections: '100000000000'
  })
  if (code) params.set('code', code)
  const url = `https://webview.powens.com/connect?${params.toString()}`

  let urlListener: PluginListenerHandle | undefined
  let closeListener: PluginListenerHandle | undefined

  try {
    return await new Promise<WebviewResult>((resolve, reject) => {
      let settled = false
      let cancelTimer: ReturnType<typeof setTimeout> | undefined

      const finish = (fn: () => void): void => {
        if (settled) return
        settled = true
        if (cancelTimer) clearTimeout(cancelTimer)
        fn()
        Browser.close().catch(() => {})
      }

      const check = (navUrl: string): void => {
        if (!navUrl.startsWith(creds.redirectUri)) return
        try {
          const u = new URL(navUrl)
          const q = u.searchParams
          finish(() =>
            resolve({
              connectionId: q.get('connection_id') ?? undefined,
              code: q.get('code') ?? undefined,
              error: q.get('error') ?? undefined,
              errorDescription: q.get('error_description') ?? undefined
            })
          )
        } catch {
          finish(() => resolve({}))
        }
      }

      // Les listeners doivent être posés AVANT d'ouvrir le Custom Tab, sinon un
      // retour très rapide peut arriver avant qu'ils ne soient attachés.
      Promise.all([
        App.addListener('appUrlOpen', (event) => check(event.url)).then((h) => {
          urlListener = h
        }),
        Browser.addListener('browserFinished', () => {
          if (settled) return
          // Le deep link ramène l'app au premier plan, ce qui ferme aussi le
          // Custom Tab : `browserFinished` peut donc précéder `appUrlOpen`. On
          // laisse un délai de grâce avant de conclure à une vraie annulation,
          // sinon une connexion réussie serait rejetée.
          cancelTimer = setTimeout(() => {
            // On ne rejette plus : `dismissed` laisse l'appelant vérifier auprès
            // de Powens si la banque a quand même été rattachée (cf. WebviewResult).
            finish(() => resolve({ dismissed: true }))
          }, DEEPLINK_GRACE_MS)
        }).then((h) => {
          closeListener = h
        })
      ])
        .then(() => Browser.open({ url }))
        .catch((e) => finish(() => reject(e instanceof Error ? e : new Error(String(e)))))
    })
  } finally {
    void urlListener?.remove()
    void closeListener?.remove()
  }
}
