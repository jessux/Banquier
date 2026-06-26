import nodeFetch from 'node-fetch'
import type { RequestInit } from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import { BrowserWindow } from 'electron'
import type { GoCardlessCreds, Institution } from '../shared/types'

/**
 * Intégration « open banking » 100 % gratuite via GoCardless Bank Account Data
 * (anciennement Nordigen). GoCardless est l'établissement agréé AISP (PSD2) ;
 * l'utilisateur fournit ses propres identifiants gratuits (secret_id / secret_key
 * obtenus sur bankaccountdata.gocardless.com) et toutes les données récupérées
 * sont écrites dans la base SQLite locale — rien n'est envoyé ailleurs.
 */

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'
// URI de redirection après consentement bancaire. La fenêtre de consentement
// est interceptée avant que cette URL ne soit réellement chargée, elle n'a donc
// pas besoin de pointer vers un serveur existant.
const REDIRECT_URI = 'https://localhost/banquier-callback'

function getAgent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

// --- Cache du token d'accès (valable ~24 h) ---
let tokenCache: { access: string; expires: number } | null = null

async function getAccessToken(creds: GoCardlessCreds): Promise<string> {
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.access

  const res = await nodeFetch(`${BASE}/token/new/`, {
    method: 'POST',
    agent: getAgent(),
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ secret_id: creds.secretId, secret_key: creds.secretKey })
  })
  if (!res.ok) {
    throw new Error(`GoCardless : authentification refusée (${res.status}). Vérifiez vos identifiants.`)
  }
  const json = (await res.json()) as { access: string; access_expires: number }
  tokenCache = { access: json.access, expires: Date.now() + json.access_expires * 1000 }
  return json.access
}

async function gcFetch<T>(creds: GoCardlessCreds, path: string, init?: RequestInit): Promise<T> {
  const token = await getAccessToken(creds)
  const res = await nodeFetch(`${BASE}${path}`, {
    ...init,
    agent: getAgent(),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
      ...(init?.headers as Record<string, string> | undefined)
    }
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GoCardless ${res.status} sur ${path} : ${body}`)
  }
  return (await res.json()) as T
}

/** Liste les banques disponibles pour un pays (codes ISO : fr, be, ch…). */
export async function listInstitutions(
  creds: GoCardlessCreds,
  country = 'fr'
): Promise<Institution[]> {
  const list = await gcFetch<{ id: string; name: string; bic?: string; logo?: string }[]>(
    creds,
    `/institutions/?country=${encodeURIComponent(country)}`
  )
  return list.map((i) => ({ id: i.id, name: i.name, bic: i.bic ?? null, logo: i.logo ?? null }))
}

interface Requisition {
  id: string
  link: string
  status: string
  accounts: string[]
}

/** Crée une demande de consentement (requisition) et renvoie l'identifiant + le lien à ouvrir. */
async function createRequisition(
  creds: GoCardlessCreds,
  institutionId: string
): Promise<{ id: string; link: string }> {
  const json = await gcFetch<Requisition>(creds, '/requisitions/', {
    method: 'POST',
    body: JSON.stringify({
      institution_id: institutionId,
      redirect: REDIRECT_URI,
      reference: `banquier-${Date.now()}`,
      user_language: 'FR'
    })
  })
  return { id: json.id, link: json.link }
}

/**
 * Ouvre une fenêtre Electron sur le lien de consentement de la banque et se
 * résout dès que la banque redirige vers `REDIRECT_URI`. Rejette si l'utilisateur
 * ferme la fenêtre avant la fin.
 */
function openConsentWindow(link: string, parent?: BrowserWindow): Promise<void> {
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

    const check = (url: string): void => {
      if (url.startsWith(REDIRECT_URI)) finish(resolve)
    }

    win.webContents.on('will-redirect', (_e, url) => check(url))
    win.webContents.on('will-navigate', (_e, url) => check(url))
    win.on('closed', () => {
      if (!settled) {
        settled = true
        reject(new Error('Connexion annulée.'))
      }
    })

    win.loadURL(link)
  })
}

async function getRequisition(creds: GoCardlessCreds, reqId: string): Promise<Requisition> {
  return gcFetch<Requisition>(creds, `/requisitions/${reqId}/`)
}

export interface GcAccountDetails {
  iban?: string
  currency?: string
  ownerName?: string
  name?: string
  institution_id?: string
}

export async function getAccountDetails(
  creds: GoCardlessCreds,
  gcAccountId: string
): Promise<GcAccountDetails> {
  const json = await gcFetch<{ account: GcAccountDetails }>(
    creds,
    `/accounts/${gcAccountId}/details/`
  )
  return json.account ?? {}
}

export interface GcTransaction {
  transactionId?: string
  bookingDate?: string
  valueDate?: string
  bookingDateTime?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  creditorName?: string
  debtorName?: string
}

export async function getAccountTransactions(
  creds: GoCardlessCreds,
  gcAccountId: string
): Promise<GcTransaction[]> {
  const json = await gcFetch<{ transactions: { booked: GcTransaction[]; pending?: GcTransaction[] } }>(
    creds,
    `/accounts/${gcAccountId}/transactions/`
  )
  return json.transactions?.booked ?? []
}

/**
 * Lance le flux complet de connexion à une banque :
 * crée la requisition, ouvre la fenêtre de consentement, attend la redirection,
 * puis renvoie la requisition liée (avec la liste des comptes accessibles).
 */
export async function connectInstitution(
  creds: GoCardlessCreds,
  institutionId: string,
  parent?: BrowserWindow
): Promise<{ requisitionId: string; accounts: string[] }> {
  const { id, link } = await createRequisition(creds, institutionId)
  await openConsentWindow(link, parent)

  // Après le consentement, on récupère la requisition (statut LN = liée).
  // Petite tolérance : on relit quelques fois si les comptes ne sont pas encore prêts.
  let req = await getRequisition(creds, id)
  for (let i = 0; i < 5 && (!req.accounts || req.accounts.length === 0); i++) {
    await new Promise((r) => setTimeout(r, 1000))
    req = await getRequisition(creds, id)
  }

  if (!req.accounts || req.accounts.length === 0) {
    throw new Error("Aucun compte accessible après le consentement (statut : " + req.status + ').')
  }
  return { requisitionId: id, accounts: req.accounts }
}
