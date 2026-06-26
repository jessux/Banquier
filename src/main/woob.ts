import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import type { Institution } from '../shared/types'

/**
 * Pont vers Woob (open banking gratuit, 100 % local).
 *
 * Woob est un outil Python qui se connecte au site de la banque avec les
 * identifiants de l'utilisateur. On l'isole dans un environnement virtuel dédié
 * sous `userData/woobenv` pour ne pas toucher au Python système. La logique métier
 * (install module, 2FA, récupération) vit dans `resources/woob_bank.py`.
 */

const SENTINEL = '@@WOOB@@ '

export interface WoobField {
  id: string
  label: string
  masked: boolean
  required: boolean
  default: string
  choices: [string, string][] | null
}

export interface WoobAccount {
  id: string
  label: string
  balance: number
  currency: string
  iban: string
}

export interface WoobTransaction {
  date: string
  label: string
  amount: number | null
  account: string
}

/** Demande de 2FA transmise à l'UI ; `answer` est résolu par la réponse utilisateur. */
export interface TwoFaRequest {
  subtype: 'question' | 'decoupled'
  message: string
  fields?: { id: string; label: string; masked: boolean }[]
}
export type TwoFaHandler = (req: TwoFaRequest) => Promise<Record<string, unknown>>

function venvDir(): string {
  return path.join(app.getPath('userData'), 'woobenv')
}

function venvPython(): string {
  return process.platform === 'win32'
    ? path.join(venvDir(), 'Scripts', 'python.exe')
    : path.join(venvDir(), 'bin', 'python')
}

function scriptPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'woob_bank.py')
    : path.join(app.getAppPath(), 'resources', 'woob_bank.py')
}

/** Cherche un interpréteur Python système pour amorcer le venv. */
function findSystemPython(): Promise<string> {
  const candidates =
    process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']
  return new Promise((resolve, reject) => {
    const tryNext = (i: number): void => {
      if (i >= candidates.length) {
        reject(new Error('Python introuvable. Installez Python 3 puis réessayez.'))
        return
      }
      const p = spawn(candidates[i], ['--version'])
      p.on('error', () => tryNext(i + 1))
      p.on('close', (code) => (code === 0 ? resolve(candidates[i]) : tryNext(i + 1)))
    }
    tryNext(0)
  })
}

function run(
  cmd: string,
  args: string[],
  opts: { onLog?: (line: string) => void; timeoutMs?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args)
    let out = ''
    let err = ''
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill()
          reject(new Error('Délai dépassé.'))
        }, opts.timeoutMs)
      : null
    child.stdout.on('data', (d) => (out += d.toString()))
    child.stderr.on('data', (d) => {
      err += d.toString()
      opts.onLog?.(d.toString())
    })
    child.on('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      if (code === 0) resolve(out)
      else reject(new Error(err || `Code de sortie ${code}`))
    })
  })
}

/** Extrait le dernier message protocole (ligne `@@WOOB@@ {...}`) d'une sortie. */
function parseLast(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split('\n').filter((l) => l.startsWith(SENTINEL))
  if (lines.length === 0) return null
  return JSON.parse(lines[lines.length - 1].slice(SENTINEL.length))
}

/** Vérifie que le venv + Woob sont prêts. */
export async function checkWoob(): Promise<{ ok: boolean; woobVersion?: string; error?: string }> {
  if (!fs.existsSync(venvPython())) return { ok: false, error: 'venv absent' }
  try {
    const out = await run(venvPython(), [scriptPath(), 'check'], { timeoutMs: 60000 })
    const msg = parseLast(out)
    if (msg?.ok) return { ok: true, woobVersion: String(msg.woobVersion) }
    return { ok: false, error: String(msg?.error ?? 'inconnu') }
  } catch (e) {
    return { ok: false, error: String(e instanceof Error ? e.message : e) }
  }
}

/** Crée le venv (si besoin) et installe Woob. Long : streame les logs via onLog. */
export async function installWoob(onLog: (line: string) => void): Promise<void> {
  if (!fs.existsSync(venvPython())) {
    onLog('Création de l\'environnement Python isolé…\n')
    const sys = await findSystemPython()
    await run(sys, ['-m', 'venv', venvDir()], { onLog, timeoutMs: 120000 })
  }
  onLog('Installation de Woob (peut prendre 1 à 2 minutes)…\n')
  await run(venvPython(), ['-m', 'pip', 'install', '--upgrade', 'pip'], { onLog, timeoutMs: 300000 })
  await run(venvPython(), ['-m', 'pip', 'install', 'woob'], { onLog, timeoutMs: 600000 })
  onLog('Initialisation des dépôts de modules…\n')
  await run(venvPython(), [scriptPath(), 'check'], { onLog, timeoutMs: 120000 })
  onLog('Woob est prêt.\n')
}

export async function listBanks(): Promise<Institution[]> {
  const out = await run(venvPython(), [scriptPath(), 'list'], { timeoutMs: 120000 })
  const msg = parseLast(out)
  const modules = (msg?.modules as { id: string; name: string }[]) ?? []
  return modules.map((m) => ({ id: m.id, name: m.name, bic: null, logo: null }))
}

export async function getFields(module: string): Promise<WoobField[]> {
  const out = await run(venvPython(), [scriptPath(), 'fields', module], { timeoutMs: 120000 })
  const msg = parseLast(out)
  return (msg?.fields as WoobField[]) ?? []
}

/**
 * Connecte une banque : lance `fetch`, gère la 2FA via `on2fa`, et renvoie les
 * comptes + transactions récupérés. Le process Python reste vivant le temps de
 * l'échange 2FA (l'état du navigateur est conservé en mémoire).
 */
export function connectBank(
  module: string,
  config: Record<string, string>,
  on2fa: TwoFaHandler
): Promise<{ accounts: WoobAccount[]; transactions: WoobTransaction[] }> {
  return new Promise((resolve, reject) => {
    const child = spawn(venvPython(), [scriptPath(), 'fetch', module])
    let buffer = ''
    let settled = false

    const fail = (e: Error): void => {
      if (settled) return
      settled = true
      child.kill()
      reject(e)
    }

    const handleMessage = async (msg: Record<string, unknown>): Promise<void> => {
      switch (msg.type) {
        case 'need_2fa': {
          const answer = await on2fa({
            subtype: msg.subtype as 'question' | 'decoupled',
            message: String(msg.message ?? ''),
            fields: msg.fields as TwoFaRequest['fields']
          })
          const reply =
            msg.subtype === 'question' ? { answers: answer } : { resume: true, ...answer }
          child.stdin.write(JSON.stringify(reply) + '\n')
          break
        }
        case 'result':
          if (!settled) {
            settled = true
            resolve({
              accounts: (msg.accounts as WoobAccount[]) ?? [],
              transactions: (msg.transactions as WoobTransaction[]) ?? []
            })
          }
          child.stdin.end()
          break
        case 'error':
          fail(new Error(String(msg.message ?? 'Erreur Woob')))
          break
      }
    }

    child.stdout.on('data', (d) => {
      buffer += d.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith(SENTINEL)) continue
        try {
          handleMessage(JSON.parse(line.slice(SENTINEL.length)))
        } catch {
          /* ligne protocole malformée, ignorée */
        }
      }
    })
    child.on('error', (e) => fail(e))
    child.on('close', (code) => {
      if (!settled) fail(new Error(`Woob s'est arrêté (code ${code}).`))
    })

    // Envoie la configuration (identifiants) sur stdin.
    child.stdin.write(JSON.stringify({ config }) + '\n')
  })
}
