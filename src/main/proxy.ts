import { HttpsProxyAgent } from 'https-proxy-agent'
import { session } from 'electron'
import { fetch as undiciFetch, Agent, ProxyAgent, type Dispatcher } from 'undici'

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

/**
 * Équivalent de resolveAgent pour les clients basés sur fetch/undici
 * (SDK OpenAI utilisé par LangChain). Même ordre de résolution.
 */
async function resolveDispatcher(url: string): Promise<Dispatcher | undefined> {
  const insecureTls = { rejectUnauthorized: false }
  const proxyUrl = _configuredProxy || process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (proxyUrl) return new ProxyAgent({ uri: proxyUrl, requestTls: insecureTls, proxyTls: insecureTls })

  try {
    const pac = await session.defaultSession.resolveProxy(url)
    const first = pac.split(';')[0].trim()
    const m = first.match(/^(?:PROXY|HTTPS)\s+(.+)$/i)
    if (m) {
      return new ProxyAgent({ uri: `http://${m[1]}`, requestTls: insecureTls, proxyTls: insecureTls })
    }
  } catch {
    // session non disponible (tests, démarrage anticipé) — ignoré
  }
  return undefined
}

/**
 * fetch proxifié pour les connexions directes : en cas d'erreur de certificat
 * (inspection SSL d'entreprise), réessaie sans vérification TLS — même
 * comportement que le fallback historique de llm.ts basé sur node-fetch.
 */
export async function proxyFetch(
  input: Parameters<typeof undiciFetch>[0],
  init?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  const dispatcher = await resolveDispatcher(String(input))
  try {
    return await undiciFetch(input, { ...init, dispatcher })
  } catch (err: unknown) {
    const cause = (err as { cause?: NodeJS.ErrnoException }).cause
    const code = cause?.code ?? (err as NodeJS.ErrnoException).code ?? ''
    if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) {
      const fallback = new Agent({ connect: { rejectUnauthorized: false } })
      return undiciFetch(input, { ...init, dispatcher: fallback })
    }
    throw err
  }
}
