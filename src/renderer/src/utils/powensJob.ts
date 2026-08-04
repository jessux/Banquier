import { useEffect, useState } from 'react'
import type { PowensJobState, PowensSyncResult } from '../../../shared/types'

/**
 * Pilote unique des synchronisations Powens, partagé par toute l'interface.
 *
 * Pourquoi : jusqu'ici, chaque écran appelait `window.api.powensConnect()` et
 * `await`-ait le résultat en désactivant ses boutons. Sur mobile, l'opération dure
 * de quelques secondes à plusieurs minutes (le temps que la banque réponde à
 * Powens), ce qui laissait un « Patientez… » figé et donnait l'impression d'une
 * app bloquée — voire d'un échec quand l'utilisateur changeait d'écran.
 *
 * Ici le job vit en dehors de React : il survit aux changements de page et au
 * démontage de l'onboarding, publie son avancement à tous les abonnés, et refuse
 * de démarrer deux synchronisations concurrentes. L'UI ne fait plus qu'afficher
 * l'état courant.
 */

const IDLE: PowensJobState = {
  phase: 'idle',
  message: '',
  kind: null,
  startedAt: null,
  result: null,
  error: null
}

let state: PowensJobState = IDLE
const listeners = new Set<(s: PowensJobState) => void>()
let progressUnsubscribe: (() => void) | null = null

function set(patch: Partial<PowensJobState>): void {
  state = { ...state, ...patch }
  for (const cb of listeners) {
    try {
      cb(state)
    } catch (err) {
      console.error('[powens-job]', err)
    }
  }
}

export function getState(): PowensJobState {
  return state
}

export function isRunning(): boolean {
  return state.phase === 'webview' || state.phase === 'waiting' || state.phase === 'importing'
}

export function subscribe(cb: (s: PowensJobState) => void): () => void {
  listeners.add(cb)
  cb(state)

  // La couche mobile pousse l'étape courante (attente banque, import, catégorisation).
  // Sur desktop la méthode est absente : l'état se limite alors à démarré/terminé.
  if (!progressUnsubscribe && window.api.onPowensProgress) {
    progressUnsubscribe = window.api.onPowensProgress((p) => {
      // Un progrès arrivé après la fin du job (ou hors job) ne doit pas ressusciter
      // un état terminé affiché à l'écran.
      if (!isRunning()) return
      set({ phase: p.phase, message: p.message })
    })
  }

  return () => {
    listeners.delete(cb)
  }
}

/** Efface le résultat/l'erreur affichés, sans toucher à un job en cours. */
export function dismiss(): void {
  if (isRunning()) return
  set(IDLE)
}

async function run(
  kind: NonNullable<PowensJobState['kind']>,
  startMessage: string,
  task: () => Promise<PowensSyncResult | null>
): Promise<void> {
  if (isRunning()) return
  set({
    kind,
    phase: kind === 'connect' ? 'webview' : 'waiting',
    message: startMessage,
    startedAt: Date.now(),
    result: null,
    error: null
  })

  try {
    const result = await task()
    if (result?.error) {
      set({ phase: 'error', message: '', error: result.error, result: null })
      return
    }
    set({
      phase: 'done',
      message: '',
      result,
      error: null
    })
  } catch (e) {
    set({
      phase: 'error',
      message: '',
      error: String(e instanceof Error ? e.message : e),
      result: null
    })
  }
}

export function startConnect(): Promise<void> {
  return run('connect', "Autorisez l'accès dans la fenêtre de votre banque…", () =>
    window.api.powensConnect()
  )
}

export function startSync(minDate?: string, maxDate?: string): Promise<void> {
  return run('sync', 'Synchronisation…', () => window.api.powensSync(minDate, maxDate))
}

export function startStartupSync(): Promise<void> {
  return run('startup', 'Synchronisation…', () => window.api.powensStartupSync())
}

/** Abonne un composant à l'état du job. L'état étant hors React, un écran monté
 *  en cours de synchronisation récupère immédiatement l'avancement réel. */
export function usePowensJob(): PowensJobState {
  const [jobState, setJobState] = useState<PowensJobState>(getState)
  useEffect(() => subscribe(setJobState), [])
  return jobState
}
