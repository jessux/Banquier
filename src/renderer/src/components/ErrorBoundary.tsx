import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto' }}>
        <h1 style={{ fontSize: 18, marginBottom: 12 }}>Une erreur est survenue</h1>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          L'application a rencontré un problème inattendu. Vous pouvez essayer de recharger la page.
        </p>
        <pre style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
          padding: 12, fontSize: 12, color: 'var(--text2)', overflow: 'auto', marginBottom: 16
        }}>
          {this.state.error.message}
        </pre>
        <button
          onClick={() => { this.setState({ error: null }); window.location.reload() }}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600
          }}
        >
          Recharger l'application
        </button>
      </div>
    )
  }
}
