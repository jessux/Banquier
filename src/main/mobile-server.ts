import http from 'http'
import os from 'os'
import crypto from 'crypto'
import QRCode from 'qrcode'
import * as db from './database'
import type { Settings } from '../shared/types'

export interface MobileServerInfo {
  url: string
  qrSvg: string
  port: number
  running: true
}

let server: http.Server | null = null
let currentToken = ''
let currentPort = 0

function getLocalIp(): string {
  const nets = os.networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return '127.0.0.1'
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  })
  res.end(body)
}

function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  getSettings: () => Settings
): void {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' })
    res.end()
    return
  }

  const url = new URL(req.url || '/', `http://localhost`)
  const pathname = url.pathname

  if (pathname === '/') {
    const tokenFromUrl = url.searchParams.get('token') || ''
    const html = buildMobileHtml(tokenFromUrl)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  const providedToken = url.searchParams.get('token') || req.headers['x-token']
  if (providedToken !== currentToken) {
    sendJson(res, 401, { error: 'Unauthorized' })
    return
  }

  if (pathname === '/api/dashboard') {
    const settings = getSettings()
    const summary = db.getDashboardSummary()
    sendJson(res, 200, { ...summary, currency: settings.currency, locale: settings.locale })
    return
  }

  if (pathname === '/api/transactions') {
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '25', 10), 100)
    const txs = db.getTransactions({ limit })
    sendJson(res, 200, txs)
    return
  }

  if (pathname === '/api/monthly-stats') {
    const stats = db.getMonthlyStats(6)
    sendJson(res, 200, stats)
    return
  }

  sendJson(res, 404, { error: 'Not found' })
}

export async function startMobileServer(getSettings: () => Settings): Promise<MobileServerInfo> {
  if (server) stopMobileServer()

  currentToken = crypto.randomBytes(16).toString('hex')

  server = http.createServer((req, res) => handleRequest(req, res, getSettings))

  await new Promise<void>((resolve, reject) => {
    server!.on('error', reject)
    server!.listen(0, '0.0.0.0', () => resolve())
  })

  currentPort = (server.address() as { port: number }).port
  const ip = getLocalIp()
  const url = `http://${ip}:${currentPort}?token=${currentToken}`
  const qrSvg = await QRCode.toString(url, { type: 'svg', margin: 1 })

  return { url, qrSvg, port: currentPort, running: true }
}

export function stopMobileServer(): void {
  if (server) {
    server.close()
    server = null
    currentToken = ''
    currentPort = 0
  }
}

export function isMobileServerRunning(): boolean {
  return server !== null
}

function buildMobileHtml(accessToken: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="theme-color" content="#6366f1">
<title>Banquier</title>
<style>
:root{--bg:#f1f5f9;--s:#fff;--b:#e2e8f0;--t:#0f172a;--m:#64748b;--p:#6366f1;--g:#10b981;--r:#ef4444}
@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--s:#1e293b;--b:#334155;--t:#f1f5f9;--m:#94a3b8}}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--t);min-height:100vh;padding:0 0 24px}
.hd{background:var(--s);border-bottom:1px solid var(--b);padding:14px 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:10}
.logo{width:30px;height:30px;background:var(--p);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:15px;font-weight:700;flex-shrink:0}
h1{font-size:17px;font-weight:700}
.wrap{padding:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
.card{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:12px 10px;text-align:center}
.lbl{font-size:10px;color:var(--m);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;font-weight:600}
.val{font-size:14px;font-weight:700;line-height:1.2}
.inc{color:var(--g)}.exp{color:var(--r)}.neu{color:var(--p)}
.sec{background:var(--s);border:1px solid var(--b);border-radius:12px;padding:14px;margin-bottom:14px}
.sec-title{font-size:11px;color:var(--m);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px;font-weight:600}
.ci{margin-bottom:10px}
.ci:last-child{margin-bottom:0}
.ch{display:flex;justify-content:space-between;margin-bottom:5px}
.cn{font-size:13px;font-weight:500}
.ca{font-size:12px;color:var(--m)}
.pb{height:5px;background:var(--b);border-radius:3px}
.pf{height:100%;background:var(--p);border-radius:3px;transition:width .5s ease}
.tx{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--b)}
.tx:last-child{border-bottom:none}
.td{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px}
.tc{font-size:11px;color:var(--m);margin-top:2px}
.ta{font-size:13px;font-weight:700;white-space:nowrap}
.ta.neg{color:var(--r)}.ta.pos{color:var(--g)}
.empty{font-size:13px;color:var(--m);text-align:center;padding:10px 0}
.spin{display:flex;justify-content:center;align-items:center;padding:80px 16px;color:var(--m);font-size:15px}
.err{margin:16px;background:var(--s);border:1px solid var(--b);border-radius:12px;padding:24px;text-align:center}
.err p{color:var(--r);font-size:15px;font-weight:500}
.err small{color:var(--m);font-size:12px;display:block;margin-top:6px}
.ft{text-align:center;font-size:11px;color:var(--m);margin-top:8px}
</style>
</head>
<body>
<div class="hd"><div class="logo">B</div><h1>Banquier</h1></div>
<div id="app"><div class="spin">Chargement...</div></div>
<script>
var T='${accessToken}';
function g(p){var s=p.includes('?')?'&':'?';return fetch(location.origin+p+s+'token='+T).then(function(r){if(!r.ok)throw new Error('Accès non autorisé ('+r.status+')');return r.json()})}
function fc(n,c,l){try{return new Intl.NumberFormat(l||'fr-FR',{style:'currency',currency:c||'EUR',maximumFractionDigits:0}).format(n)}catch(e){return n.toFixed(0)+' '+(c||'€')}}
function fd(d){return new Date(d).toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function render(d,ts){
  var c=d.currency||'EUR',l=d.locale||'fr-FR',fmt=function(n){return fc(n,c,l)};
  var bal=(d.periodCredit||0)-(d.periodDebit||0);
  var cats=d.topCategories||[];
  var mx=cats.reduce(function(a,x){return Math.max(a,Math.abs(x.total))},1);
  var catHtml=cats.slice(0,6).map(function(x){
    var pct=Math.round(Math.abs(x.total)/mx*100);
    return '<div class="ci"><div class="ch"><span class="cn">'+esc(x.category||'Non catégorisé')+'</span><span class="ca">'+fmt(Math.abs(x.total))+'</span></div><div class="pb"><div class="pf" style="width:'+pct+'%"></div></div></div>'
  }).join('');
  var txHtml=(ts||[]).map(function(t){
    var neg=t.amount<0;
    return '<div class="tx"><div style="min-width:0"><div class="td" title="'+esc(t.description)+'">'+esc(t.description)+'</div><div class="tc">'+esc(t.category||'—')+' · '+fd(t.date)+'</div></div><div class="ta '+(neg?'neg':'pos')+'">'+fmt(t.amount)+'</div></div>'
  }).join('');
  document.getElementById('app').innerHTML=
    '<div class="wrap">'+
    '<div class="grid">'+
      '<div class="card"><div class="lbl">Revenus</div><div class="val inc">'+fmt(d.periodCredit||0)+'</div></div>'+
      '<div class="card"><div class="lbl">Dépenses</div><div class="val exp">'+fmt(d.periodDebit||0)+'</div></div>'+
      '<div class="card"><div class="lbl">Net</div><div class="val neu">'+fmt(bal)+'</div></div>'+
    '</div>'+
    (catHtml?'<div class="sec"><div class="sec-title">Top catégories</div>'+catHtml+'</div>':'')+
    '<div class="sec"><div class="sec-title">Transactions récentes</div>'+(txHtml||'<div class="empty">Aucune transaction</div>')+'</div>'+
    '<div class="ft">Banquier · Lecture seule · Réseau local</div>'+
    '</div>'
}
Promise.all([g('/api/dashboard'),g('/api/transactions?limit=25')]).then(function(r){render(r[0],r[1])}).catch(function(e){
  document.getElementById('app').innerHTML='<div class="err"><p>Erreur de connexion</p><small>'+esc(e.message)+'</small></div>'
})
</script>
</body>
</html>`
}
