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

/** Échange le code renvoyé par le webview contre un token d'accès permanent. */
export async function exchangeCode(creds: PowensCreds, code: string): Promise<string> {
  const json = await api<{ access_token: string }>(creds.domain, '/auth/token/access', {
    method: 'POST',
    body: {
      grant_type: 'authorization_code',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code
    }
  })
  if (!json.access_token) throw new Error('Token Powens absent de la réponse.')
  return json.access_token
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

export async function getTransactions(creds: PowensCreds, token: string): Promise<PowensTransaction[]> {
  const json = await api<{ transactions: PowensTransaction[] }>(
    creds.domain,
    '/users/me/transactions?limit=1000',
    { token }
  )
  return json.transactions ?? []
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
    redirect_uri: creds.redirectUri
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
    win.on('closed', () => {
      if (!settled) {
        settled = true
        reject(new Error('Connexion annulée.'))
      }
    })

    win.loadURL(url)
  })
}
