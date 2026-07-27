/**
 * Client REST Powens (ex-Budget Insight / biapi) pour l'app Android — port de
 * src/main/powens.ts sans la détection de proxy d'entreprise (inutile sur
 * mobile) : les appels passent par fetch(), routé nativement via le plugin
 * CapacitorHttp (voir capacitor.config.ts), donc pas de souci de CORS non plus.
 *
 * Les identifiants (client_id/client_secret) sont ceux du même tenant Powens
 * sandbox que la version desktop ("banquier-sandbox") — obfusqués de la même
 * façon, à l'identique de src/main/powens.ts.
 */

export interface PowensCreds {
  domain: string
  clientId: string
  clientSecret: string
  redirectUri: string
}

// prettier-ignore
const _k=[0xc3,0x7a,0x91,0xf4,0x2d,0x58,0xe6,0xb0]
// prettier-ignore
const _a=[0xf5,0x4e,0xa7,0xc5,0x14,0x6e,0xd5,0x88]
// prettier-ignore
const _b=[0xbb,0x1d,0xf3,0x87,0x68,0x15,0x84,0xc9,0xa7,0x4c,0xe7,0xae,0x55,0x77,0x97,0xea,0xa1,0x08,0xa9,0x9a,0x1a,0x0c,0xa7,0xe8,0xad,0x20,0xa2,0x9b,0x45,0x2b,0xb6,0xdf]
function _r(bytes: number[]): string {
  const decoded = bytes.map((v, i) => v ^ _k[i % _k.length])
  return new TextDecoder('utf-8').decode(new Uint8Array(decoded))
}

/** Redirection custom-scheme interceptée par l'app via un deep link (voir
 *  src/mobile/powens-webview.ts et l'intent-filter dans AndroidManifest.xml). */
const MOBILE_REDIRECT_URI = 'banquier://powens-callback'

export const POWENS_CREDS: PowensCreds = {
  domain: 'banquier-sandbox',
  clientId: _r(_a),
  clientSecret: _r(_b),
  redirectUri: MOBILE_REDIRECT_URI
}

function baseUrl(domain: string): string {
  const name = domain.trim().replace(/\.biapi\.pro\/?$/i, '').replace(/^https?:\/\//, '')
  return `https://${name}.biapi.pro/2.0`
}

export function domainParam(domain: string): string {
  const name = domain.trim().replace(/\.biapi\.pro\/?$/i, '').replace(/^https?:\/\//, '')
  return `${name}.biapi.pro`
}

async function api<T>(
  domain: string,
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const targetUrl = `${baseUrl(domain)}${path}`
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.body) headers['content-type'] = 'application/json'
  if (init.token) headers['authorization'] = `Bearer ${init.token}`

  const res = await fetch(targetUrl, {
    method: init.method ?? 'GET',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined
  })

  if (!res.ok) {
    const txt = await res.text()
    throw new Error(`Powens ${res.status} sur ${path} : ${txt.slice(0, 300)}`)
  }
  return (await res.json()) as T
}

/** Crée (ou ré-obtient) un utilisateur Powens permanent et renvoie son token. */
export async function initAuth(creds: PowensCreds): Promise<string> {
  const json = await api<{ auth_token?: string }>(creds.domain, '/auth/init', {
    method: 'POST',
    body: { client_id: creds.clientId, client_secret: creds.clientSecret }
  })
  if (!json.auth_token) throw new Error('Token Powens absent de la réponse /auth/init.')
  return json.auth_token
}

/** Génère un code temporaire (utilisateur existant) pour rouvrir le webview. */
export async function getTempCode(creds: PowensCreds, token: string): Promise<string> {
  const json = await api<{ code: string }>(creds.domain, '/auth/token/code', { token })
  return json.code
}

export interface PowensAccount {
  id: number
  name: string
  currency?: { id?: string }
  balance?: number
}

export async function getAccounts(creds: PowensCreds, token: string): Promise<PowensAccount[]> {
  const json = await api<{ accounts: PowensAccount[] }>(creds.domain, '/users/me/accounts', { token })
  return json.accounts ?? []
}

export interface PowensTransaction {
  id: number
  id_account: number
  date: string
  rdate?: string
  value: number
  wording?: string
  original_wording?: string
  simplified_wording?: string
  coming?: boolean
}

export interface PowensTransactionsResult {
  transactions: PowensTransaction[]
  firstDate: string | null
}

interface PowensTransactionsPage {
  transactions: PowensTransaction[]
  total: number
  first_date?: string
  _links?: { next?: { href: string } }
}

export async function getTransactions(
  creds: PowensCreds,
  token: string,
  minDate?: string,
  maxDate?: string
): Promise<PowensTransactionsResult> {
  const PAGE = 1000
  const all: PowensTransaction[] = []
  let firstDate: string | null = null

  const initialParams = new URLSearchParams({ limit: String(PAGE) })
  if (minDate) initialParams.set('min_date', minDate)
  if (maxDate) initialParams.set('max_date', maxDate)

  let nextPath: string | null = `/users/me/transactions?${initialParams.toString()}`

  while (nextPath) {
    const json: PowensTransactionsPage = await api<PowensTransactionsPage>(creds.domain, nextPath, { token })

    const page = json.transactions ?? []
    all.push(...page)

    if (json.first_date && !firstDate) firstDate = json.first_date

    const nextHref = json._links?.next?.href
    if (nextHref) {
      const u = new URL(nextHref)
      nextPath = u.pathname.replace('/2.0', '') + u.search
    } else {
      nextPath = null
    }
  }

  return { transactions: all, firstDate }
}
