import { useEffect, useState } from 'react'
import type { Settings } from '../../../shared/types'
import type { Account } from '../../../shared/types'

const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'CAD']

export default function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<Settings>({
    openrouterApiKey: '',
    openrouterModel: 'anthropic/claude-sonnet-4-5',
    currency: 'EUR',
    locale: 'fr-FR'
  })
  const [saved, setSaved] = useState(false)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [newAccount, setNewAccount] = useState({ name: '', bank: '', currency: 'EUR' })
  const [accountSaved, setAccountSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [exportStatus, setExportStatus] = useState<'idle' | 'ok' | 'err'>('idle')

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getAccounts().then(setAccounts)
  }, [])

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
            placeholder="ex: anthropic/claude-sonnet-4-5"
          />
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Modèles disponibles : anthropic/claude-sonnet-4-5, openai/gpt-4o, google/gemini-flash-1.5
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
