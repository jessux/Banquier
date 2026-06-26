import { useEffect, useRef, useState } from 'react'
import type { Settings, MobileServerInfo } from '../../../shared/types'
import type { Account } from '../../../shared/types'

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'CAD']

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings>({
    openrouterApiKey: '',
    openrouterModel: 'openrouter/free',
    currency: 'EUR',
    locale: 'fr-FR'
  })
  const [saved, setSaved] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [newAccount, setNewAccount] = useState({ name: '', bank: '', currency: 'EUR' })
  const [accountSaved, setAccountSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [exportStatus, setExportStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [mobileServer, setMobileServer] = useState<MobileServerInfo | null>(null)
  const [mobileLoading, setMobileLoading] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getAccounts().then(setAccounts)
  }, [])

  const toggleMobileServer = async (): Promise<void> => {
    setMobileLoading(true)
    try {
      if (mobileServer) {
        await window.api.stopMobileServer()
        setMobileServer(null)
      } else {
        const info = await window.api.startMobileServer()
        setMobileServer(info as MobileServerInfo)
      }
    } finally {
      setMobileLoading(false)
    }
  }

  const copyUrl = (): void => {
    if (!mobileServer) return
    const urlToCopy = mobileServer.externalUrl ?? mobileServer.url
    navigator.clipboard.writeText(urlToCopy)
    setUrlCopied(true)
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setUrlCopied(false), 2000)
  }

  const save = async (): Promise<void> => {
    await window.api.saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const doExport = async (type: 'db' | 'csv'): Promise<void> => {
    const result = await (type === 'db' ? window.api.exportDb() : window.api.exportCsv())
    if (result.success) {
      setExportStatus('ok')
      setTimeout(() => setExportStatus('idle'), 2500)
    }
  }

  const addAccount = async (): Promise<void> => {
    if (!newAccount.name) return
    await window.api.createAccount(newAccount.name, newAccount.bank, newAccount.currency)
    setNewAccount({ name: '', bank: '', currency: 'EUR' })
    setAccountSaved(true)
    setTimeout(() => setAccountSaved(false), 2000)
    window.api.getAccounts().then(setAccounts)
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <h1 className="page-title">Paramètres</h1>
      </div>

      {/* LLM */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>OpenRouter (LLM)</h3>

        <div className="form-group">
          <label>Clé API OpenRouter</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={settings.openrouterApiKey}
              onChange={(e) => setSettings({ ...settings, openrouterApiKey: e.target.value })}
              placeholder="sk-or-v1-..."
            />
            <button className="btn btn-secondary" style={{ flexShrink: 0 }} onClick={() => setShowKey(!showKey)}>
              {showKey ? '🙈' : '👁️'}
            </button>
          </div>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Obtenez une clé sur openrouter.ai
          </p>
        </div>

        <div className="form-group">
          <label>Modèle</label>
          <input
            value={settings.openrouterModel}
            onChange={(e) => setSettings({ ...settings, openrouterModel: e.target.value })}
            placeholder="ex: openrouter/free"
          />
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Modèles disponibles : openrouter/free, anthropic/claude-sonnet-4-6, openai/gpt-4o, google/gemini-flash-1.5
          </p>
        </div>
      </div>

      {/* Préférences */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Préférences</h3>
        <div className="grid-2">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Devise</label>
            <select value={settings.currency} onChange={(e) => setSettings({ ...settings, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Locale</label>
            <select value={settings.locale} onChange={(e) => setSettings({ ...settings, locale: e.target.value })}>
              <option value="fr-FR">Français (FR)</option>
              <option value="fr-BE">Français (BE)</option>
              <option value="fr-CH">Français (CH)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-primary" onClick={save}>
          {saved ? '✓ Sauvegardé' : 'Sauvegarder'}
        </button>
      </div>

      {/* Accès mobile */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>Accès mobile</h3>
            <p className="text-muted text-sm">
              Consultez votre tableau de bord depuis votre téléphone. UPnP ouvre automatiquement le port sur votre box pour un accès en 4G.
            </p>
          </div>
          <button
            className={`btn ${mobileServer ? 'btn-secondary' : 'btn-primary'}`}
            style={{ flexShrink: 0, marginLeft: 16 }}
            onClick={toggleMobileServer}
            disabled={mobileLoading}
          >
            {mobileLoading ? 'Démarrage...' : mobileServer ? 'Désactiver' : 'Activer'}
          </button>
        </div>

        {mobileServer && (
          <div style={{ marginTop: 16 }}>
            {/* Statut UPnP */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 600,
              marginBottom: 14,
              background: mobileServer.upnpEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
              color: mobileServer.upnpEnabled ? '#059669' : 'var(--text-muted)',
              border: `1px solid ${mobileServer.upnpEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`
            }}>
              <span style={{ fontSize: 8 }}>{mobileServer.upnpEnabled ? '●' : '●'}</span>
              {mobileServer.upnpEnabled ? 'UPnP actif — accessible en 4G' : 'Wi-Fi uniquement — UPnP non disponible'}
            </div>

            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              {/* QR code (pointe vers l'URL externe si UPnP, locale sinon) */}
              <div
                style={{
                  flexShrink: 0,
                  background: '#fff',
                  borderRadius: 8,
                  padding: 8,
                  border: '1px solid var(--border)',
                  width: 120,
                  height: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                dangerouslySetInnerHTML={{ __html: mobileServer.qrSvg }}
              />
              {/* URLs + instructions */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-sm" style={{ marginBottom: 8, fontWeight: 500 }}>
                  {mobileServer.upnpEnabled
                    ? 'Scannez le QR code ou ouvrez l\'URL externe (4G) :'
                    : 'Scannez le QR code ou ouvrez cette URL sur le même réseau :'}
                </p>

                {mobileServer.upnpEnabled && mobileServer.externalUrl && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>URL externe (4G)</div>
                    <div
                      style={{
                        background: 'var(--bg)',
                        border: '1px solid rgba(16,185,129,0.4)',
                        borderRadius: 6,
                        padding: '6px 10px',
                        fontFamily: 'monospace',
                        fontSize: 11,
                        wordBreak: 'break-all',
                        marginBottom: 8,
                        color: 'var(--text-muted)'
                      }}
                    >
                      {mobileServer.externalUrl}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>URL locale (Wi-Fi)</div>
                  </>
                )}

                <div
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    fontFamily: 'monospace',
                    fontSize: 11,
                    wordBreak: 'break-all',
                    marginBottom: 8,
                    color: 'var(--text-muted)'
                  }}
                >
                  {mobileServer.url}
                </div>

                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={copyUrl}>
                  {urlCopied ? '✓ Copié' : 'Copier le lien'}
                </button>
                <p className="text-muted text-sm" style={{ marginTop: 8 }}>
                  Accès en lecture seule · Session unique · Se renouvelle au redémarrage
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Exporter</h3>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          Sauvegardez vos données ou exportez vos transactions dans un tableur.
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => doExport('db')}>
            Backup SQLite (.db)
          </button>
          <button className="btn btn-secondary" onClick={() => doExport('csv')}>
            Transactions CSV
          </button>
        </div>
        {exportStatus === 'ok' && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#22c55e' }}>Fichier exporté avec succès.</p>
        )}
      </div>

      {/* Comptes */}
      <div className="card">
        <h3 style={{ marginBottom: 16 }}>Comptes bancaires</h3>

        {accounts.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            {accounts.map((a) => (
              <div key={a.id} className="flex justify-between items-center" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{a.name}</span>
                  {a.bank && <span className="text-muted" style={{ marginLeft: 8 }}>{a.bank}</span>}
                </div>
                <span className="badge badge-success">{a.currency}</span>
              </div>
            ))}
          </div>
        )}

        <h4 style={{ marginBottom: 12, fontSize: 13 }}>Ajouter un compte</h4>
        <div className="grid-3" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Nom</label>
            <input value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} placeholder="Compte courant" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Banque</label>
            <input value={newAccount.bank} onChange={(e) => setNewAccount({ ...newAccount, bank: e.target.value })} placeholder="BNP Paribas" />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Devise</label>
            <select value={newAccount.currency} onChange={(e) => setNewAccount({ ...newAccount, currency: e.target.value })}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={addAccount} disabled={!newAccount.name}>
          {accountSaved ? '✓ Ajouté' : '+ Ajouter le compte'}
        </button>
      </div>
    </div>
  )
}
