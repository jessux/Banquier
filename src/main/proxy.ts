import { HttpsProxyAgent } from 'https-proxy-agent'
import { session } from 'electron'

let _configuredProxy: string | undefined

/** Appelé depuis ipc.ts lors du chargement et de la sauvegarde des paramètres. */
export function setConfiguredProxy(url: string | undefined): void {
  _configuredProxy = url || undefined
}

/**
 * Résout l'agent proxy à utiliser pour une URL donnée.
 * 1. Proxy configuré manuellement dans les paramètres (prioritaire)
 * 2. Variable d'environnement HTTPS_PROXY / HTTP_PROXY
 * 3. Proxy système Windows via Electron (PAC/WPAD/Options Internet)
 * 4. undefined → connexion directe
 *
 * rejectUnauthorized est toujours false car les proxies d'entreprise font de
 * l'inspection SSL et présentent leur propre certificat auto-signé.
 */
export async function resolveAgent(url: string): Promise<HttpsProxyAgent<string> | undefined> {
  const proxyUrl = _configuredProxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxyUrl) return new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false })

  try {
    const pac = await session.defaultSession.resolveProxy(url)
    const first = pac.split(';')[0].trim()
    const m = first.match(/^(?:PROXY|HTTPS|SOCKS5?)\s+(.+)$/i)
    if (m) {
      const scheme = first.toUpperCase().startsWith('SOCKS') ? 'socks5' : 'http'
      return new HttpsProxyAgent(`${scheme}://${m[1]}`, { rejectUnauthorized: false })
    }
  } catch {
    // session non disponible (tests, démarrage anticipé) — ignoré
  }
  return undefined
}
