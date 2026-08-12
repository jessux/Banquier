import { useEffect, useState } from 'react'
import type { PackCatalogEntry } from '../../../shared/rulePacks'
import { compareVersions } from '../../../shared/rulePacks'

interface Props {
  /** Appelé après toute modification, pour que la liste des règles se recharge. */
  onChange: () => void
  onToast: (message: string) => void
}

function hasUpdate(entry: PackCatalogEntry): boolean {
  return entry.installedVersion !== null && compareVersions(entry.version, entry.installedVersion) > 0
}

export default function RulePacks({ onChange, onToast }: Props): JSX.Element {
  const [entries, setEntries] = useState<PackCatalogEntry[]>([])
  const [remoteError, setRemoteError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const load = async (): Promise<void> => {
    setLoading(true)
    try {
      const result = await window.api.getRulePackCatalog()
      setEntries(result.entries)
      setRemoteError(result.remoteError)
    } catch (e) {
      setRemoteError((e as Error).message)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const install = async (entry: PackCatalogEntry): Promise<void> => {
    setBusy(entry.id)
    try {
      const { rules, categories } = await window.api.installRulePack(entry.id)
      onToast(
        `${entry.name} installé — ${rules} règle(s)` +
          (categories > 0 ? `, ${categories} catégorie(s) ajoutée(s)` : '')
      )
      await load()
      onChange()
    } catch (e) {
      onToast(`Échec : ${(e as Error).message}`)
    }
    setBusy(null)
  }

  const uninstall = async (entry: PackCatalogEntry): Promise<void> => {
    setBusy(entry.id)
    try {
      const removed = await window.api.uninstallRulePack(entry.id)
      onToast(`${entry.name} désinstallé — ${removed} règle(s) retirée(s)`)
      await load()
      onChange()
    } catch (e) {
      onToast(`Échec : ${(e as Error).message}`)
    }
    setBusy(null)
  }

  const installedCount = entries.filter((e) => e.installedVersion !== null).length
  const updatable = entries.filter(hasUpdate).length

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        marginBottom: 20,
        overflow: 'hidden'
      }}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          fontSize: 14,
          textAlign: 'left'
        }}
      >
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>{expanded ? '▼' : '▶'}</span>
        <span style={{ fontWeight: 500 }}>Packs de règles</span>
        <span className="text-muted text-sm">
          {loading ? 'chargement…' : `${installedCount} installé(s) sur ${entries.length}`}
        </span>
        {updatable > 0 && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              background: 'rgba(99,102,241,0.15)',
              color: 'var(--accent-light)',
              borderRadius: 4,
              padding: '2px 8px'
            }}
          >
            {updatable} mise(s) à jour
          </span>
        )}
      </button>

      {expanded && (
        <div style={{ padding: '0 16px 16px' }}>
          <p className="text-muted text-sm" style={{ marginTop: 0, marginBottom: 12 }}>
            Jeux de catégories et de règles maintenus par la communauté. Vos règles personnelles
            restent prioritaires : un pack ne les modifie jamais.
          </p>

          {remoteError && (
            <div
              style={{
                background: 'rgba(234,179,8,0.1)',
                border: '1px solid rgba(234,179,8,0.3)',
                borderRadius: 8,
                padding: '8px 12px',
                fontSize: 12,
                color: 'var(--text2)',
                marginBottom: 12
              }}
            >
              Dépôt communautaire injoignable ({remoteError}). Seuls les packs intégrés à
              l'application sont disponibles.
            </div>
          )}

          {entries.map((entry) => {
            const installed = entry.installedVersion !== null
            const updatable = hasUpdate(entry)
            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 0',
                  borderTop: '1px solid var(--border)'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{entry.name}</span>
                    <span className="text-muted" style={{ fontSize: 11, fontFamily: 'monospace' }}>
                      v{entry.version}
                    </span>
                    {entry.builtin && (
                      <span
                        style={{
                          fontSize: 10,
                          background: 'var(--bg3, rgba(255,255,255,0.06))',
                          color: 'var(--text3)',
                          borderRadius: 4,
                          padding: '1px 6px'
                        }}
                      >
                        intégré
                      </span>
                    )}
                    {updatable && (
                      <span style={{ fontSize: 11, color: 'var(--accent-light)' }}>
                        → mise à jour depuis v{entry.installedVersion}
                      </span>
                    )}
                  </div>
                  <div className="text-muted text-sm" style={{ marginTop: 2 }}>
                    {entry.ruleCount} règle(s){entry.description ? ` · ${entry.description}` : ''}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {(!installed || updatable) && (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '4px 12px', fontSize: 12 }}
                      disabled={busy === entry.id}
                      onClick={() => install(entry)}
                    >
                      {busy === entry.id ? <span className="spinner" /> : installed ? 'Mettre à jour' : 'Installer'}
                    </button>
                  )}
                  {installed && (
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }}
                      disabled={busy === entry.id}
                      onClick={() => uninstall(entry)}
                    >
                      Désinstaller
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {!loading && entries.length === 0 && (
            <p className="text-muted text-sm">Aucun pack disponible.</p>
          )}
        </div>
      )}
    </div>
  )
}
