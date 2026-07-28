import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import type { PluginListenerHandle } from '@capacitor/core'
import { domainParam, type PowensCreds } from './powens'

interface WebviewResult {
  connectionId?: string
  code?: string
  error?: string
  errorDescription?: string
}

/** Délai laissé au deep link pour arriver après la fermeture du Custom Tab,
 *  avant de considérer que l'utilisateur a vraiment annulé. 1500ms s'est avéré
 *  trop juste sur device réel (Custom Tab + retour d'authentification forte
 *  bancaire type App2App), provoquant un faux « Connexion annulée. » alors
 *  que la connexion avait réussi. */
const DEEPLINK_GRACE_MS = 8000

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
            finish(() => reject(new Error('Connexion annulée.')))
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
