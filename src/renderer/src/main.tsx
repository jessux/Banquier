import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

/** Affiche une erreur bloquante avant même que React ait pu se monter — l'app
 *  n'existe pas encore, donc pas de composant, pas de styles, rien qui dépende
 *  d'un état plus haut que le DOM lui-même. */
function renderBootFailure(err: unknown): void {
  const root = document.getElementById('root')
  if (!root) return
  const message = err instanceof Error ? err.message : String(err)
  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#0b0c10;color:#e5e7eb;font-family:system-ui,sans-serif;text-align:center">
      <div style="max-width:420px">
        <div style="font-size:40px;margin-bottom:12px">⚠️</div>
        <h1 style="font-size:18px;margin-bottom:8px">Échec du démarrage</h1>
        <p style="font-size:13px;color:#9ca3af;margin-bottom:16px">
          L'application n'a pas pu s'initialiser. Redémarrez-la ; si le problème
          persiste, signalez ce message.
        </p>
        <pre style="font-size:11px;color:#f87171;white-space:pre-wrap;word-break:break-word;text-align:left;background:#1a1c22;padding:12px;border-radius:8px">${message.replace(/</g, '&lt;')}</pre>
      </div>
    </div>
  `
}

async function bootstrap(): Promise<void> {
  // Under Electron, window.api is already injected by the preload script.
  // Under Capacitor (Android), install the native window.api polyfill first.
  //
  // Cette étape peut échouer (init base de données, migration…) — et comme
  // rien n'est encore monté, l'ErrorBoundary plus bas ne peut pas la
  // rattraper : sans ce try/catch, un rejet silencieux laisse l'écran sombre
  // (fond de styles.css) sans que React n'ait jamais rendu quoi que ce soit,
  // indiscernable d'un simple blocage.
  if (!window.api) {
    try {
      const { installMobileApi } = await import('../../mobile/entry')
      await installMobileApi()
    } catch (err) {
      console.error('[bootstrap] échec de installMobileApi', err)
      renderBootFailure(err)
      return
    }
  }

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
}

bootstrap()
