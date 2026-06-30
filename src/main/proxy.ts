import { HttpsProxyAgent } from 'https-proxy-agent'
import { session } from 'electron'

/**
 * Résout l'agent proxy à utiliser pour une URL donnée.
 * 1. Variable d'environnement HTTPS_PROXY / HTTP_PROXY (prioritaire)
 * 2. Proxy système Windows via Electron (PAC/WPAD/Options Internet)
 * 3. undefined → connexion directe
 *
 * rejectUnauthorized est toujours false pour les proxies car les proxies
 * d'entreprise font de l'inspection SSL et présentent leur propre certificat.
 */
export async function resolveAgent(url: string): Promise<HttpsProxyAgent<string> | undefined> {
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (envProxy) return new HttpsProxyAgent(envProxy, { rejectUnauthorized: false })

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
