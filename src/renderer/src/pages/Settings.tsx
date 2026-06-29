import { useEffect, useRef, useState } from 'react'
import type { Settings, MobileServerInfo, PowensStatus } from '../../../shared/types'
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
  const [editingAccount, setEditingAccount] = useState<{ id: number; name: string } | null>(null)
  const [showKey, setShowKey] = useState(false)
  const [exportStatus, setExportStatus] = useState<'idle' | 'ok' | 'err'>('idle')
  const [restoreStep, setRestoreStep] = useState<0 | 1>(0)
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'err'>('idle')
  const [restoreError, setRestoreError] = useState('')
  const [clearStep, setClearStep] = useState<0 | 1 | 2>(0)
  const [clearBusy, setClearBusy] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateResult, setUpdateResult] = useState<{ status: string; version?: string; message?: string } | null>(null)
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null)
  const [editingCurrency, setEditingCurrency] = useState<{ id: number; currency: string } | null>(null)
  const [mobileServer, setMobileServer] = useState<MobileServerInfo | null>(null)
  const [mobileLoading, setMobileLoading] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Powens
  const [powens, setPowens] = useState<PowensStatus>({ configured: false, connected: false })
  const [powensBusy, setPowensBusy] = useState(false)
  const [powensMsg, setPowensMsg] = useState<string | null>(null)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncMinDate, setSyncMinDate] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10)
  })
  const [syncMaxDate, setSyncMaxDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [powensFirstDate, setPowensFirstDate] = useState<string | null>(null)

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getAccounts().then(setAccounts)
    window.api.powensStatus().then(setPowens)
    window.api.getAppVersion().then(setAppVersion)
  }, [])

  const connectPowens = async (): Promise<void> => {
    setPowensBusy(true)
    setPowensMsg("Connexion… autorisez l'accès dans la fenêtre de votre banque.")
    try {
      const res = await window.api.powensConnect()
      setPowensMsg(
        `Connecté : ${res.imported} transactions importées, ${res.duplicates} doublons (${res.accounts} compte(s)).`
      )
      window.api.powensStatus().then(setPowens)
      window.api.getAccounts().then(setAccounts)
    } catch (e) {
      setPowensMsg(`Erreur : ${String(e instanceof Error ? e.message : e)}`)
    } finally {
      setPowensBusy(false)
    }
  }

  const syncPowens = async (minDate?: string, maxDate?: string): Promise<void> => {
    setPowensBusy(true)
    setPowensMsg('Synchronisation…')
    try {
      const res = await window.api.powensSync(minDate, maxDate)
      if (res.firstDate) {
        setPowensFirstDate(res.firstDate)
        setSyncMinDate(res.firstDate)
      }
      setPowensMsg(`Synchronisé : ${res.imported} nouvelles transactions, ${res.duplicates} doublons.`)
    } catch (e) {
      setPowensMsg(`Erreur : ${String(e instanceof Error ? e.message : e)}`)
    } finally {
      setPowensBusy(false)
    }
  }

  const disconnectPowens = async (): Promise<void> => {
    await window.api.powensDisconnect()
    window.api.powensStatus().then(setPowens)
    setPowensMsg('Déconnecté.')
  }

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

  const clearAllTransactions = async (): Promise<void> => {
    if (clearStep === 0) { setClearStep(1); return }
    setClearBusy(true)
    try {
      await window.api.clearAllTransactions()
      setClearStep(0)
    } finally {
      setClearBusy(false)
    }
  }

  const doRestore = async (): Promise<void> => {
    if (restoreStep === 0) { setRestoreStep(1); return }
    setRestoreStatus('idle')
    const result = await window.api.restoreDb()
    if (!result.success) {
      setRestoreStatus('err')
      setRestoreError(result.error ?? 'Erreur inconnue')
      setRestoreStep(0)
    }
    // Si succès, la fenêtre se recharge automatiquement côté main
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

  const saveAccountName = async (): Promise<void> => {
    if (!editingAccount || !editingAccount.name.trim()) return
    await window.api.renameAccount(editingAccount.id, editingAccount.name.trim())
    setEditingAccount(null)
    window.api.getAccounts().then(setAccounts)
  }

  const deleteAccount = async (id: number): Promise<void> => {
    await window.api.deleteAccount(id)
    setDeletingAccountId(null)
    window.api.getAccounts().then(setAccounts)
  }

  const saveCurrency = async (): Promise<void> => {
    if (!editingCurrency) return
    await window.api.updateAccountCurrency(editingCurrency.id, editingCurrency.currency)
    setEditingCurrency(null)
    window.api.getAccounts().then(setAccounts)
  }

  const checkForUpdates = async (): Promise<void> => {
    setUpdateChecking(true)
    setUpdateResult(null)
    try {
      const result = await window.api.checkForUpdates()
      setUpdateResult(result)
    } finally {
      setUpdateChecking(false)
    }
  }

  return (
    <>
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
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>Obtenez une clé sur openrouter.ai</p>
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
        <button className="btn btn-primary" onClick={save}>{saved ? '✓ Sauvegardé' : 'Sauvegarder'}</button>
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
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
              borderRadius: 20, fontSize: 12, fontWeight: 600, marginBottom: 14,
              background: mobileServer.upnpEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
              color: mobileServer.upnpEnabled ? '#059669' : 'var(--text-muted)',
              border: `1px solid ${mobileServer.upnpEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`
            }}>
              <span style={{ fontSize: 8 }}>●</span>
              {mobileServer.upnpEnabled ? 'UPnP actif — accessible en 4G' : 'Wi-Fi uniquement — UPnP non disponible'}
            </div>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
              <div style={{
                flexShrink: 0, background: '#fff', borderRadius: 8, padding: 8,
                border: '1px solid var(--border)', width: 120, height: 120,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }} dangerouslySetInnerHTML={{ __html: mobileServer.qrSvg }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-sm" style={{ marginBottom: 8, fontWeight: 500 }}>
                  {mobileServer.upnpEnabled
                    ? "Scannez le QR code ou ouvrez l'URL externe (4G) :"
                    : 'Scannez le QR code ou ouvrez cette URL sur le même réseau :'}
                </p>
                {mobileServer.upnpEnabled && mobileServer.externalUrl && (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>URL externe (4G)</div>
                    <div style={{ background: 'var(--bg)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8, color: 'var(--text-muted)' }}>
                      {mobileServer.externalUrl}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>URL locale (Wi-Fi)</div>
                  </>
                )}
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8, color: 'var(--text-muted)' }}>
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

      {/* Comptes bancaires + Powens */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 16 }}>Comptes bancaires</h3>

        {accounts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            {accounts.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                {editingAccount?.id === a.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <input
                      autoFocus
                      value={editingAccount.name}
                      onChange={(e) => setEditingAccount({ id: a.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveAccountName(); if (e.key === 'Escape') setEditingAccount(null) }}
                      style={{ flex: 1, maxWidth: 240 }}
                    />
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={saveAccountName} disabled={!editingAccount.name.trim()}>OK</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditingAccount(null)}>✕</button>
                  </div>
                ) : deletingAccountId === a.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    <span style={{ fontSize: 13, color: '#ef4444', flex: 1 }}>
                      Supprimer <strong>{a.name}</strong> et toutes ses transactions ?
                    </span>
                    <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12, borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }} onClick={() => deleteAccount(a.id)}>Confirmer</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setDeletingAccountId(null)}>Annuler</button>
                  </div>
                ) : editingCurrency?.id === a.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
                    <select value={editingCurrency.currency} onChange={(e) => setEditingCurrency({ id: a.id, currency: e.target.value })} style={{ padding: '4px 8px', fontSize: 12 }}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={saveCurrency}>OK</button>
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setEditingCurrency(null)}>✕</button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span style={{ fontWeight: 500 }}>{a.name}</span>
                      {a.bank && <span className="text-muted" style={{ marginLeft: 8, fontSize: 12 }}>{a.bank}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingCurrency({ id: a.id, currency: a.currency })}>
                        {a.currency}
                      </button>
                      <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingAccount({ id: a.id, name: a.name })}>Renommer</button>
                      <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: 12, borderColor: 'rgba(239,68,68,0.3)', color: '#ef4444' }} onClick={() => setDeletingAccountId(a.id)}>✕</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Powens */}
        <div style={{ borderTop: accounts.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: accounts.length > 0 ? 16 : 0, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p className="text-sm" style={{ fontWeight: 500 }}>Agrégation Powens</p>
            {powens.connected && <span style={{ fontSize: 12, color: '#22c55e' }}>✓ Connecté</span>}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={connectPowens} disabled={powensBusy}>
              {powensBusy ? 'Patientez…' : powens.connected ? '+ Ajouter une banque' : 'Connecter ma banque'}
            </button>
            {powens.connected && (
              <>
                <button className="btn btn-secondary" onClick={() => setShowSyncModal(true)} disabled={powensBusy}>↻ Synchroniser</button>
                <button className="btn btn-secondary" onClick={disconnectPowens} disabled={powensBusy}>Déconnecter</button>
              </>
            )}
          </div>
          {powensMsg && (
            <p className="text-sm" style={{ marginTop: 10, color: powensMsg.startsWith('Erreur') ? '#ef4444' : 'var(--text2)' }}>
              {powensMsg}
            </p>
          )}
        </div>

        {/* Ajouter manuellement */}
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <p className="text-sm" style={{ fontWeight: 500, marginBottom: 12 }}>Ajouter manuellement</p>
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

      {/* Export / Restauration */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 8 }}>Données</h3>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          Sauvegardez vos données, exportez vos transactions ou restaurez une sauvegarde précédente.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => doExport('db')}>Backup SQLite (.db)</button>
          <button className="btn btn-secondary" onClick={() => doExport('csv')}>Transactions CSV</button>
          {restoreStep === 0 ? (
            <button className="btn btn-secondary" onClick={doRestore}>Restaurer une sauvegarde…</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#f59e0b' }}>L'application va recharger. Continuer ?</span>
              <button className="btn btn-secondary" style={{ fontSize: 12, borderColor: 'rgba(245,158,11,0.5)', color: '#f59e0b' }} onClick={doRestore}>Choisir le fichier</button>
              <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setRestoreStep(0)}>Annuler</button>
            </div>
          )}
        </div>
        {exportStatus === 'ok' && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#22c55e' }}>Fichier exporté avec succès.</p>
        )}
        {restoreStatus === 'err' && (
          <p style={{ marginTop: 10, fontSize: 13, color: '#ef4444' }}>Erreur lors de la restauration : {restoreError}</p>
        )}
      </div>

      {/* Version & mises à jour */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ marginBottom: 4 }}>Application</h3>
            {appVersion && <p className="text-muted text-sm">Version {appVersion}</p>}
          </div>
          <button className="btn btn-secondary" onClick={checkForUpdates} disabled={updateChecking}>
            {updateChecking ? 'Vérification…' : '↻ Vérifier les mises à jour'}
          </button>
        </div>
        {updateResult && (
          <div style={{ marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 6, background: updateResult.status === 'up-to-date' ? 'rgba(34,197,94,0.08)' : updateResult.status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)', color: updateResult.status === 'up-to-date' ? '#22c55e' : updateResult.status === 'error' ? '#ef4444' : '#6366f1' }}>
            {updateResult.status === 'up-to-date' && '✓ Application à jour'}
            {updateResult.status === 'available' && `Mise à jour disponible : v${updateResult.version} — téléchargement en cours…`}
            {updateResult.status === 'downloading' && `Téléchargement de la v${updateResult.version} en cours…`}
            {updateResult.status === 'error' && `Erreur : ${updateResult.message}`}
          </div>
        )}
      </div>

      {/* Zone danger */}
      <div className="card" style={{ marginBottom: 20, borderColor: 'rgba(239,68,68,0.3)' }}>
        <h3 style={{ marginBottom: 8, color: '#ef4444' }}>Zone danger</h3>
        <p className="text-muted text-sm" style={{ marginBottom: 16 }}>
          Ces actions sont irréversibles. Assurez-vous d'avoir exporté vos données avant de continuer.
        </p>
        {clearStep === 0 && (
          <button
            className="btn btn-secondary"
            style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }}
            onClick={clearAllTransactions}
          >
            Vider toutes les transactions
          </button>
        )}
        {clearStep === 1 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px' }}>
            <p className="text-sm" style={{ marginBottom: 12, color: '#ef4444', fontWeight: 500 }}>
              Toutes les transactions et l'historique d'imports seront supprimés définitivement. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                className="btn btn-secondary"
                style={{ borderColor: 'rgba(239,68,68,0.5)', color: '#ef4444' }}
                onClick={clearAllTransactions}
                disabled={clearBusy}
              >
                {clearBusy ? 'Suppression…' : 'Oui, tout supprimer'}
              </button>
              <button className="btn btn-secondary" onClick={() => setClearStep(0)} disabled={clearBusy}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {showSyncModal && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
        <div style={{ background: '#1a1d27', border: '1px solid #2e3147', borderRadius: 10, padding: 28, width: 360 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Plage de dates à synchroniser</div>
          {powensFirstDate && (
            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 16 }}>
              Données disponibles depuis le {new Date(powensFirstDate + 'T00:00:00').toLocaleDateString('fr-FR')}
            </div>
          )}
          <div className="form-group">
            <label>Date de début</label>
            <input type="date" value={syncMinDate} min={powensFirstDate ?? undefined} onChange={(e) => setSyncMinDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Date de fin</label>
            <input type="date" value={syncMaxDate} onChange={(e) => setSyncMaxDate(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn btn-secondary" onClick={() => setShowSyncModal(false)}>Annuler</button>
            <button
              className="btn btn-primary"
              onClick={() => { setShowSyncModal(false); syncPowens(syncMinDate || undefined, syncMaxDate || undefined) }}
            >
              ↻ Synchroniser
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}