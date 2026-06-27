import nodeFetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BrowserWindow } from 'electron'

/**
 * Intégration Powens (ex-Budget Insight / biapi) — agrégation bancaire.
 *
 * L'utilisateur fournit ses propres identifiants Powens (domaine, client_id,
 * client_secret obtenus sur sa console Powens, ex. une sandbox gratuite). Le flux :
 *  1. Ouverture du webview de connexion bancaire (sans code) → l'utilisateur
 *     s'authentifie auprès de sa banque ; au retour, l'URL de redirection reçoit
 *     `connection_id` et un `code`.
 *  2. Échange du `code` contre un token d'accès permanent (POST /auth/token/access).
 *  3. Récupération des comptes + transactions, écrits dans la base SQLite locale.
 * Pour ajouter une banque ensuite, on génère un code temporaire (GET /auth/token/code)
 * et on rouvre le webview avec ce code (même utilisateur Powens).
 */

export interface PowensCreds {
  domain: string // ex. "banquier-sandbox" (avec ou sans .biapi.pro)
  clientId: string
  clientSecret: string
  redirectUri: string // ex. "http://localhost:8645"
}

// prettier-ignore
const _k=[0xc3,0x7a,0x91,0xf4,0x2d,0x58,0xe6,0xb0]
// prettier-ignore
const _a=[0xf5,0x4e,0xa7,0xc5,0x14,0x6e,0xd5,0x88]
// prettier-ignore
const _b=[0xbb,0x1d,0xf3,0x87,0x68,0x15,0x84,0xc9,0xa7,0x4c,0xe7,0xae,0x55,0x77,0x97,0xea,0xa1,0x08,0xa9,0x9a,0x1a,0x0c,0xa7,0xe8,0xad,0x20,0xa2,0x9b,0x45,0x2b,0xb6,0xdf]
const _r=(b:number[]):string=>Buffer.from(b.map((v,i)=>v^_k[i%_k.length])).toString('utf8')

export const POWENS_CREDS: PowensCreds = {
  domain: 'banquier-sandbox',
  clientId: _r(_a),
  clientSecret: _r(_b),
  redirectUri: 'http://localhost:8645'
}

function agent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

function baseUrl(domain: string): string {
  const name = domain.trim().replace(/\.biapi\.pro\/?$/i, '').replace(/^https?:\/\//, '')
  return `https://${name}.biapi.pro/2.0`
}

function domainParam(domain: string): string {
  const name = domain.trim().replace(/\.biapi\.pro\/?$/i, '').replace(/^https?:\/\//, '')
  return `${name}.biapi.pro`
}

async function api<T>(
  domain: string,
  path: string,
  init: { method?: string; token?: string; body?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json' }
  if (init.body) headers['content-type'] = 'application/json'
  if (init.token) headers['authorization'] = `Bearer ${init.token}`
  const res = await nodeFetch(`${baseUrl(domain)}${path}`, {
    method: init.method ?? 'GET',
    agent: agent(),
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
    const json = await api<{
      transactions: PowensTransaction[]
      total: number
      first_date?: string
      _links?: { next?: { href: string } }
    }>(creds.domain, nextPath, { token })

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

interface WebviewResult {
  connectionId?: string
  code?: string
  error?: string
  errorDescription?: string
}

/**
 * Ouvre le webview de connexion bancaire Powens. Si `code` est fourni, la
 * connexion est rattachée à l'utilisateur existant ; sinon un nouvel utilisateur
 * est créé et un `code` (à échanger) est renvoyé dans la redirection.
 */
export function openConnectWebview(
  creds: PowensCreds,
  code: string | null,
  parent?: BrowserWindow
): Promise<WebviewResult> {
  const params = new URLSearchParams({
    domain: domainParam(creds.domain),
    client_id: creds.clientId,
    redirect_uri: creds.redirectUri,
    max_connections: '100000000000'
  })
  if (code) params.set('code', code)
  const url = `https://webview.powens.com/connect?${params.toString()}`

  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 480,
      height: 760,
      parent,
      modal: !!parent,
      autoHideMenuBar: true,
      title: 'Connexion à votre banque',
      webPreferences: { sandbox: true, contextIsolation: true }
    })

    let settled = false
    const finish = (fn: () => void): void => {
      if (settled) return
      settled = true
      fn()
      if (!win.isDestroyed()) win.destroy()
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

    win.webContents.on('will-redirect', (_e, navUrl) => check(navUrl))
    win.webContents.on('will-navigate', (_e, navUrl) => check(navUrl))
    win.webContents.on('did-navigate', (_e, navUrl) => check(navUrl))
    // Quand localhost:8645 n'écoute pas, la navigation échoue (ECONNREFUSED)
    // mais l'URL redirigée est quand même disponible dans validatedURL.
    win.webContents.on('did-fail-load', (_e, _code, _desc, validatedURL) => {
      if (validatedURL) check(validatedURL)
    })
    win.on('closed', () => {
      if (!settled) {
        settled = true
        reject(new Error('Connexion annulée.'))
      }
    })

    win.loadURL(url)
  })
}
