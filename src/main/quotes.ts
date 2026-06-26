import nodeFetch from 'node-fetch'
import { HttpsProxyAgent } from 'https-proxy-agent'
import type { AssetType } from '../shared/types'

/**
 * Cotations gratuites, sans clé API :
 *  - Crypto  → CoinGecko (prix en €, historique limité à 365 jours en gratuit)
 *  - Actions / ETF → Yahoo Finance (prix + devise, historique sur plusieurs années)
 *
 * Les prix sont renvoyés en euros (conversion via le change Yahoo si besoin).
 */

const COINGECKO = 'https://api.coingecko.com/api/v3'
const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart'

function agent(): HttpsProxyAgent<string> | undefined {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  return proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined
}

async function getJson<T>(url: string): Promise<T> {
  const res = await nodeFetch(url, {
    agent: agent(),
    headers: { 'User-Agent': 'Mozilla/5.0', accept: 'application/json' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`)
  return (await res.json()) as T
}

// --- Résolution symbole crypto -> id CoinGecko (ex: BTC -> bitcoin) ---
const cryptoIdCache = new Map<string, string>()

export async function resolveCryptoId(symbol: string): Promise<string | null> {
  const key = symbol.trim().toLowerCase()
  if (!key) return null
  if (cryptoIdCache.has(key)) return cryptoIdCache.get(key) ?? null
  const data = await getJson<{ coins: { id: string; symbol: string; market_cap_rank: number | null }[] }>(
    `${COINGECKO}/search?query=${encodeURIComponent(symbol)}`
  )
  // Meilleur match : symbole exact, mieux classé en capitalisation.
  const exact = data.coins
    .filter((c) => c.symbol.toLowerCase() === key)
    .sort((a, b) => (a.market_cap_rank ?? 1e9) - (b.market_cap_rank ?? 1e9))
  const id = (exact[0] ?? data.coins[0])?.id ?? null
  if (id) cryptoIdCache.set(key, id)
  return id
}

// --- Change vers l'euro ---
const fxCache = new Map<string, { rate: number; at: number }>()

async function fxToEur(currency: string): Promise<number> {
  const cur = currency.toUpperCase()
  if (cur === 'EUR') return 1
  const cached = fxCache.get(cur)
  if (cached && Date.now() - cached.at < 3600_000) return cached.rate
  // EUR<cur>=X : 1 EUR = rate <cur>. Donc 1 <cur> = 1/rate EUR.
  const data = await getJson<YahooChart>(`${YAHOO}/EUR${cur}=X?interval=1d&range=1d`)
  const rate = data.chart?.result?.[0]?.meta?.regularMarketPrice
  if (!rate) throw new Error(`Change EUR/${cur} indisponible`)
  const toEur = 1 / rate
  fxCache.set(cur, { rate: toEur, at: Date.now() })
  return toEur
}

interface YahooChart {
  chart?: {
    result?: {
      meta?: { regularMarketPrice?: number; currency?: string }
      timestamp?: number[]
      indicators?: { quote?: { close?: (number | null)[] }[] }
    }[]
  }
}

const MARKET_TYPES: AssetType[] = ['actions', 'etf', 'crypto']
export const isMarketType = (t: AssetType): boolean => MARKET_TYPES.includes(t)

/** Cours actuel d'un actif, en euros. */
export async function getCurrentPriceEur(type: AssetType, symbol: string): Promise<number | null> {
  if (type === 'crypto') {
    const id = await resolveCryptoId(symbol)
    if (!id) return null
    const data = await getJson<Record<string, { eur?: number }>>(
      `${COINGECKO}/simple/price?ids=${id}&vs_currencies=eur`
    )
    return data[id]?.eur ?? null
  }
  // actions / etf -> Yahoo
  const data = await getJson<YahooChart>(`${YAHOO}/${encodeURIComponent(symbol)}?interval=1d&range=1d`)
  const meta = data.chart?.result?.[0]?.meta
  if (!meta?.regularMarketPrice) return null
  const fx = await fxToEur(meta.currency || 'EUR')
  return meta.regularMarketPrice * fx
}

/** Cours actuel de plusieurs cryptos en un seul appel. Map symbole(min) -> prix €. */
export async function getCryptoPricesEur(symbols: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const idBySym = new Map<string, string>()
  for (const s of symbols) {
    const id = await resolveCryptoId(s)
    if (id) idBySym.set(s.toLowerCase(), id)
  }
  const ids = [...new Set(idBySym.values())]
  if (ids.length === 0) return out
  const data = await getJson<Record<string, { eur?: number }>>(
    `${COINGECKO}/simple/price?ids=${ids.join(',')}&vs_currencies=eur`
  )
  for (const [sym, id] of idBySym) {
    const price = data[id]?.eur
    if (price != null) out.set(sym, price)
  }
  return out
}

export interface PricePoint {
  ts: number // secondes
  price: number // en euros
}

/**
 * Série de prix (en €) couvrant [fromSec, toSec].
 * Crypto : CoinGecko (≤ 365 jours). Actions/ETF : Yahoo (multi-années).
 */
export async function getHistoricalSeriesEur(
  type: AssetType,
  symbol: string,
  fromSec: number,
  toSec: number
): Promise<PricePoint[]> {
  if (type === 'crypto') {
    const id = await resolveCryptoId(symbol)
    if (!id) return []
    const data = await getJson<{ prices?: [number, number][] }>(
      `${COINGECKO}/coins/${id}/market_chart/range?vs_currency=eur&from=${fromSec}&to=${toSec}`
    )
    return (data.prices ?? []).map(([tsMs, price]) => ({ ts: Math.floor(tsMs / 1000), price }))
  }
  const data = await getJson<YahooChart>(
    `${YAHOO}/${encodeURIComponent(symbol)}?interval=1d&period1=${fromSec}&period2=${toSec}`
  )
  const result = data.chart?.result?.[0]
  const ts = result?.timestamp ?? []
  const closes = result?.indicators?.quote?.[0]?.close ?? []
  const fx = await fxToEur(result?.meta?.currency || 'EUR')
  const points: PricePoint[] = []
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i]
    if (c != null) points.push({ ts: ts[i], price: c * fx })
  }
  return points
}

/** Prix de la série le plus proche (au plus tard) d'une date cible. */
export function priceAt(series: PricePoint[], targetSec: number): number | null {
  if (series.length === 0) return null
  let best: PricePoint | null = null
  for (const p of series) {
    if (p.ts <= targetSec) best = p
    else if (best == null) best = p // avant le 1er point : prend le plus ancien
    else break
  }
  return best?.price ?? series[series.length - 1].price
}
