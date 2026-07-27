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

/**
 * Équivalent mobile de src/main/powens.ts's openConnectWebview : au lieu d'une
 * BrowserWindow Electron interceptant la navigation, on ouvre le webview de
 * connexion Powens dans un Custom Tab (@capacitor/browser) et on récupère la
 * redirection via un deep link (@capacitor/app's appUrlOpen), grâce au schéma
 * custom `banquier://powens-callback` déclaré dans AndroidManifest.xml.
 *
 * Non testé sur un appareil réel — Powens n'exige pas d'enregistrement préalable
 * du redirect_uri pour ce widget (le desktop utilise déjà un `http://localhost`
 * qui n'écoute jamais), donc un schéma custom devrait être accepté de la même
 * façon, mais ça reste à confirmer en conditions réelles.
 */
export function openConnectWebview(creds: PowensCreds, code: string | null): Promise<WebviewResult> {
  const params = new URLSearchParams({
    domain: domainParam(creds.domain),
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    max_connections: '100000000000'
  })
  if (code) params.set('code', code)
  const url = `https://webview.powens.com/connect?${params.toString()}`

  return new Promise((resolve, reject) => {
    let settled = false
    let urlListener: PluginListenerHandle | undefined
    let closeListener: PluginListenerHandle | undefined

    const cleanup = (): void => {
      void urlListener?.remove()
      void closeListener?.remove()
    }

    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
      cleanup()
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

    App.addListener('appUrlOpen', (event) => check(event.url)).then((handle) => {
      urlListener = handle
    })

    Browser.addListener('browserFinished', () => {
      finish(() => reject(new Error('Connexion annulée.')))
    }).then((handle) => {
      closeListener = handle
    })

    Browser.open({ url })
  })
}
