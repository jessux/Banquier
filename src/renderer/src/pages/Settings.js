import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
const CURRENCIES = ['EUR', 'USD', 'CHF', 'GBP', 'CAD'];
export default function SettingsPage() {
    const [settings, setSettings] = useState({
        openrouterApiKey: '',
        openrouterModel: 'openrouter/free',
        currency: 'EUR',
        locale: 'fr-FR'
    });
    const [saved, setSaved] = useState(false);
    const [accounts, setAccounts] = useState([]);
    const [newAccount, setNewAccount] = useState({ name: '', bank: '', currency: 'EUR' });
    const [accountSaved, setAccountSaved] = useState(false);
    const [editingAccount, setEditingAccount] = useState(null);
    const [showKey, setShowKey] = useState(false);
    const [exportStatus, setExportStatus] = useState('idle');
    const [restoreStep, setRestoreStep] = useState(0);
    const [restoreStatus, setRestoreStatus] = useState('idle');
    const [restoreError, setRestoreError] = useState('');
    const [clearStep, setClearStep] = useState(0);
    const [clearBusy, setClearBusy] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    const [updateChecking, setUpdateChecking] = useState(false);
    const [updateResult, setUpdateResult] = useState(null);
    const [deletingAccountId, setDeletingAccountId] = useState(null);
    const [editingCurrency, setEditingCurrency] = useState(null);
    const [editingFxRate, setEditingFxRate] = useState(null);
    const [mobileServer, setMobileServer] = useState(null);
    const [mobileLoading, setMobileLoading] = useState(false);
    const [urlCopied, setUrlCopied] = useState(false);
    const copyTimeoutRef = useRef(null);
    // Powens
    const [powens, setPowens] = useState({ configured: false, connected: false });
    const [powensBusy, setPowensBusy] = useState(false);
    const [powensMsg, setPowensMsg] = useState(null);
    const [powensError, setPowensError] = useState(null);
    const [showSyncModal, setShowSyncModal] = useState(false);
    const [syncMinDate, setSyncMinDate] = useState(() => {
        const d = new Date();
        d.setMonth(d.getMonth() - 1);
        return d.toISOString().slice(0, 10);
    });
    const [syncMaxDate, setSyncMaxDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [powensFirstDate, setPowensFirstDate] = useState(null);
    useEffect(() => {
        window.api.getSettings().then(setSettings);
        window.api.getAccounts().then(setAccounts);
        window.api.powensStatus().then(setPowens);
        window.api.getAppVersion().then(setAppVersion);
    }, []);
    const connectPowens = async () => {
        setPowensBusy(true);
        setPowensMsg("Connexion… autorisez l'accès dans la fenêtre de votre banque.");
        setPowensError(null);
        try {
            const res = await window.api.powensConnect();
            setPowensMsg(`Connecté : ${res.imported} transactions importées, ${res.duplicates} doublons (${res.accounts} compte(s)).`);
            window.api.powensStatus().then(setPowens);
            window.api.getAccounts().then(setAccounts);
        }
        catch (e) {
            const msg = String(e instanceof Error ? e.message : e);
            setPowensError(msg);
            setPowensMsg(null);
        }
        finally {
            setPowensBusy(false);
        }
    };
    const syncPowens = async (minDate, maxDate) => {
        setPowensBusy(true);
        setPowensMsg('Synchronisation…');
        setPowensError(null);
        try {
            const res = await window.api.powensSync(minDate, maxDate);
            if (res.firstDate) {
                setPowensFirstDate(res.firstDate);
                setSyncMinDate(res.firstDate);
            }
            setPowensMsg(`Synchronisé : ${res.imported} nouvelles transactions, ${res.duplicates} doublons.`);
        }
        catch (e) {
            const msg = String(e instanceof Error ? e.message : e);
            setPowensError(msg);
            setPowensMsg(null);
        }
        finally {
            setPowensBusy(false);
        }
    };
    const disconnectPowens = async () => {
        await window.api.powensDisconnect();
        window.api.powensStatus().then(setPowens);
        setPowensMsg('Déconnecté.');
    };
    const toggleMobileServer = async () => {
        setMobileLoading(true);
        try {
            if (mobileServer) {
                await window.api.stopMobileServer();
                setMobileServer(null);
            }
            else {
                const info = await window.api.startMobileServer();
                setMobileServer(info);
            }
        }
        finally {
            setMobileLoading(false);
        }
    };
    const copyUrl = () => {
        if (!mobileServer)
            return;
        const urlToCopy = mobileServer.externalUrl ?? mobileServer.url;
        navigator.clipboard.writeText(urlToCopy);
        setUrlCopied(true);
        if (copyTimeoutRef.current)
            clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => setUrlCopied(false), 2000);
    };
    const save = async () => {
        await window.api.saveSettings(settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };
    const clearAllTransactions = async () => {
        if (clearStep === 0) {
            setClearStep(1);
            return;
        }
        setClearBusy(true);
        try {
            await window.api.clearAllTransactions();
            setClearStep(0);
        }
        finally {
            setClearBusy(false);
        }
    };
    const doRestore = async () => {
        if (restoreStep === 0) {
            setRestoreStep(1);
            return;
        }
        setRestoreStatus('idle');
        const result = await window.api.restoreDb();
        if (!result.success) {
            setRestoreStatus('err');
            setRestoreError(result.error ?? 'Erreur inconnue');
            setRestoreStep(0);
        }
        // Si succès, la fenêtre se recharge automatiquement côté main
    };
    const doExport = async (type) => {
        const result = await (type === 'db' ? window.api.exportDb() : window.api.exportCsv());
        if (result.success) {
            setExportStatus('ok');
            setTimeout(() => setExportStatus('idle'), 2500);
        }
    };
    const addAccount = async () => {
        if (!newAccount.name)
            return;
        await window.api.createAccount(newAccount.name, newAccount.bank, newAccount.currency);
        setNewAccount({ name: '', bank: '', currency: 'EUR' });
        setAccountSaved(true);
        setTimeout(() => setAccountSaved(false), 2000);
        window.api.getAccounts().then(setAccounts);
    };
    const saveAccountName = async () => {
        if (!editingAccount || !editingAccount.name.trim())
            return;
        await window.api.renameAccount(editingAccount.id, editingAccount.name.trim());
        setEditingAccount(null);
        window.api.getAccounts().then(setAccounts);
    };
    const deleteAccount = async (id) => {
        await window.api.deleteAccount(id);
        setDeletingAccountId(null);
        window.api.getAccounts().then(setAccounts);
    };
    const saveCurrency = async () => {
        if (!editingCurrency)
            return;
        await window.api.updateAccountCurrency(editingCurrency.id, editingCurrency.currency);
        setEditingCurrency(null);
        window.api.getAccounts().then(setAccounts);
    };
    const saveFxRate = async () => {
        if (!editingFxRate)
            return;
        const rate = parseFloat(editingFxRate.rate.replace(',', '.'));
        if (isNaN(rate) || rate <= 0)
            return;
        await window.api.updateAccountFxRate(editingFxRate.id, rate);
        setEditingFxRate(null);
        window.api.getAccounts().then(setAccounts);
    };
    const checkForUpdates = async () => {
        setUpdateChecking(true);
        setUpdateResult(null);
        try {
            const result = await window.api.checkForUpdates();
            setUpdateResult(result);
        }
        finally {
            setUpdateChecking(false);
        }
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { style: { maxWidth: 600 }, children: [_jsx("div", { className: "page-header", children: _jsx("h1", { className: "page-title", children: "Param\u00E8tres" }) }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("h3", { style: { marginBottom: 16 }, children: "OpenRouter (LLM)" }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Cl\u00E9 API OpenRouter" }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("input", { type: showKey ? 'text' : 'password', value: settings.openrouterApiKey, onChange: (e) => setSettings({ ...settings, openrouterApiKey: e.target.value }), placeholder: "sk-or-v1-..." }), _jsx("button", { className: "btn btn-secondary", style: { flexShrink: 0 }, onClick: () => setShowKey(!showKey), children: showKey ? '🙈' : '👁️' })] }), _jsx("p", { className: "text-muted text-sm", style: { marginTop: 4 }, children: "Obtenez une cl\u00E9 sur openrouter.ai" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Mod\u00E8le" }), _jsx("input", { value: settings.openrouterModel, onChange: (e) => setSettings({ ...settings, openrouterModel: e.target.value }), placeholder: "ex: openrouter/free" }), _jsx("p", { className: "text-muted text-sm", style: { marginTop: 4 }, children: "Mod\u00E8les disponibles : openrouter/free, anthropic/claude-sonnet-4-6, openai/gpt-4o, google/gemini-flash-1.5" })] })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("h3", { style: { marginBottom: 16 }, children: "R\u00E9seau" }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Proxy HTTP/HTTPS" }), _jsx("input", { value: settings.proxyUrl ?? '', onChange: (e) => setSettings({ ...settings, proxyUrl: e.target.value }), placeholder: "http://proxy.entreprise.com:8080" }), _jsx("p", { className: "text-muted text-sm", style: { marginTop: 4 }, children: "Laisser vide pour la d\u00E9tection automatique. \u00C0 renseigner si vous \u00EAtes derri\u00E8re un proxy d'entreprise." })] })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("h3", { style: { marginBottom: 16 }, children: "Pr\u00E9f\u00E9rences" }), _jsxs("div", { className: "grid-2", children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Devise" }), _jsx("select", { value: settings.currency, onChange: (e) => setSettings({ ...settings, currency: e.target.value }), children: CURRENCIES.map((c) => _jsx("option", { children: c }, c)) })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Locale" }), _jsxs("select", { value: settings.locale, onChange: (e) => setSettings({ ...settings, locale: e.target.value }), children: [_jsx("option", { value: "fr-FR", children: "Fran\u00E7ais (FR)" }), _jsx("option", { value: "fr-BE", children: "Fran\u00E7ais (BE)" }), _jsx("option", { value: "fr-CH", children: "Fran\u00E7ais (CH)" }), _jsx("option", { value: "en-US", children: "English (US)" })] })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Th\u00E8me" }), _jsx("div", { style: { display: 'flex', gap: 6 }, children: ['dark', 'light'].map((t) => (_jsx("button", { type: "button", className: settings.theme === t || (!settings.theme && t === 'dark') ? 'btn btn-primary' : 'btn btn-secondary', style: { flex: 1 }, onClick: () => {
                                                        setSettings((s) => ({ ...s, theme: t }));
                                                        document.documentElement.setAttribute('data-theme', t);
                                                    }, children: t === 'dark' ? '🌙 Sombre' : '☀️ Clair' }, t))) })] })] })] }), _jsx("div", { style: { marginBottom: 24 }, children: _jsx("button", { className: "btn btn-primary", onClick: save, children: saved ? '✓ Sauvegardé' : 'Sauvegarder' }) }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }, children: [_jsxs("div", { children: [_jsx("h3", { style: { marginBottom: 4 }, children: "Acc\u00E8s mobile" }), _jsx("p", { className: "text-muted text-sm", children: "Consultez votre tableau de bord depuis votre t\u00E9l\u00E9phone. UPnP ouvre automatiquement le port sur votre box pour un acc\u00E8s en 4G." })] }), _jsx("button", { className: `btn ${mobileServer ? 'btn-secondary' : 'btn-primary'}`, style: { flexShrink: 0, marginLeft: 16 }, onClick: toggleMobileServer, disabled: mobileLoading, children: mobileLoading ? 'Démarrage...' : mobileServer ? 'Désactiver' : 'Activer' })] }), mobileServer && (_jsxs("div", { style: { marginTop: 16 }, children: [_jsxs("div", { style: {
                                            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                                            borderRadius: 20, fontSize: 12, fontWeight: 600, marginBottom: 14,
                                            background: mobileServer.upnpEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                            color: mobileServer.upnpEnabled ? '#059669' : 'var(--text-muted)',
                                            border: `1px solid ${mobileServer.upnpEnabled ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`
                                        }, children: [_jsx("span", { style: { fontSize: 8 }, children: "\u25CF" }), mobileServer.upnpEnabled ? 'UPnP actif — accessible en 4G' : 'Wi-Fi uniquement — UPnP non disponible'] }), _jsxs("div", { style: { display: 'flex', gap: 20, alignItems: 'flex-start' }, children: [_jsx("div", { style: {
                                                    flexShrink: 0, background: '#fff', borderRadius: 8, padding: 8,
                                                    border: '1px solid var(--border)', width: 120, height: 120,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }, dangerouslySetInnerHTML: { __html: mobileServer.qrSvg } }), _jsxs("div", { style: { flex: 1, minWidth: 0 }, children: [_jsx("p", { className: "text-sm", style: { marginBottom: 8, fontWeight: 500 }, children: mobileServer.upnpEnabled
                                                            ? "Scannez le QR code ou ouvrez l'URL externe (4G) :"
                                                            : 'Scannez le QR code ou ouvrez cette URL sur le même réseau :' }), mobileServer.upnpEnabled && mobileServer.externalUrl && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }, children: "URL externe (4G)" }), _jsx("div", { style: { background: 'var(--bg)', border: '1px solid rgba(16,185,129,0.4)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8, color: 'var(--text-muted)' }, children: mobileServer.externalUrl }), _jsx("div", { style: { fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }, children: "URL locale (Wi-Fi)" })] })), _jsx("div", { style: { background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all', marginBottom: 8, color: 'var(--text-muted)' }, children: mobileServer.url }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12 }, onClick: copyUrl, children: urlCopied ? '✓ Copié' : 'Copier le lien' }), _jsx("p", { className: "text-muted text-sm", style: { marginTop: 8 }, children: "Acc\u00E8s en lecture seule \u00B7 Session unique \u00B7 Se renouvelle au red\u00E9marrage" })] })] })] }))] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("h3", { style: { marginBottom: 16 }, children: "Comptes bancaires" }), accounts.length > 0 && (_jsx("div", { style: { marginBottom: 20 }, children: accounts.map((a) => (_jsx("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }, children: editingAccount?.id === a.id ? (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 }, children: [_jsx("input", { autoFocus: true, value: editingAccount.name, onChange: (e) => setEditingAccount({ id: a.id, name: e.target.value }), onKeyDown: (e) => { if (e.key === 'Enter')
                                                    saveAccountName(); if (e.key === 'Escape')
                                                    setEditingAccount(null); }, style: { flex: 1, maxWidth: 240 } }), _jsx("button", { className: "btn btn-primary", style: { padding: '4px 10px', fontSize: 12 }, onClick: saveAccountName, disabled: !editingAccount.name.trim(), children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => setEditingAccount(null), children: "\u2715" })] })) : deletingAccountId === a.id ? (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1 }, children: [_jsxs("span", { style: { fontSize: 13, color: 'var(--red)', flex: 1 }, children: ["Supprimer ", _jsx("strong", { children: a.name }), " et toutes ses transactions ?"] }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12, borderColor: 'rgba(239,68,68,0.5)', color: 'var(--red)' }, onClick: () => deleteAccount(a.id), children: "Confirmer" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => setDeletingAccountId(null), children: "Annuler" })] })) : editingCurrency?.id === a.id ? (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }, children: [_jsx("select", { value: editingCurrency.currency, onChange: (e) => setEditingCurrency({ id: a.id, currency: e.target.value }), style: { padding: '4px 8px', fontSize: 12 }, children: CURRENCIES.map((c) => _jsx("option", { children: c }, c)) }), _jsx("button", { className: "btn btn-primary", style: { padding: '4px 10px', fontSize: 12 }, onClick: saveCurrency, children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => setEditingCurrency(null), children: "\u2715" })] })) : (_jsxs(_Fragment, { children: [_jsxs("div", { children: [_jsx("span", { style: { fontWeight: 500 }, children: a.name }), a.bank && _jsx("span", { className: "text-muted", style: { marginLeft: 8, fontSize: 12 }, children: a.bank })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12 }, onClick: () => setEditingCurrency({ id: a.id, currency: a.currency }), children: a.currency }), a.currency !== settings.currency && (editingFxRate?.id === a.id ? (_jsxs(_Fragment, { children: [_jsxs("span", { style: { fontSize: 11, color: 'var(--text2)' }, children: ["1 ", a.currency, " ="] }), _jsx("input", { autoFocus: true, type: "number", step: "0.0001", value: editingFxRate.rate, onChange: (e) => setEditingFxRate({ id: a.id, rate: e.target.value }), onKeyDown: (e) => { if (e.key === 'Enter')
                                                                    saveFxRate(); if (e.key === 'Escape')
                                                                    setEditingFxRate(null); }, style: { width: 72, padding: '3px 6px', fontSize: 12 } }), _jsx("span", { style: { fontSize: 11, color: 'var(--text2)' }, children: settings.currency }), _jsx("button", { className: "btn btn-primary", style: { padding: '3px 8px', fontSize: 12 }, onClick: saveFxRate, children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 6px', fontSize: 12 }, onClick: () => setEditingFxRate(null), children: "\u2715" })] })) : (_jsxs("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12, color: 'var(--yellow)', borderColor: 'rgba(245,158,11,0.4)' }, title: `Taux de conversion utilisé dans les statistiques`, onClick: () => setEditingFxRate({ id: a.id, rate: String(a.fx_rate ?? 1) }), children: ["\u00D7", a.fx_rate ?? 1] }))), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12 }, onClick: () => setEditingAccount({ id: a.id, name: a.name }), children: "Renommer" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12, borderColor: 'rgba(239,68,68,0.3)', color: 'var(--red)' }, onClick: () => setDeletingAccountId(a.id), children: "\u2715" })] })] })) }, a.id))) })), _jsxs("div", { style: { borderTop: accounts.length > 0 ? '1px solid var(--border)' : 'none', paddingTop: accounts.length > 0 ? 16 : 0, marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }, children: [_jsx("p", { className: "text-sm", style: { fontWeight: 500 }, children: "Agr\u00E9gation Powens" }), powens.connected && _jsx("span", { style: { fontSize: 12, color: 'var(--green)' }, children: "\u2713 Connect\u00E9" })] }), _jsxs("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' }, children: [_jsx("button", { className: "btn btn-primary", onClick: connectPowens, disabled: powensBusy, children: powensBusy ? 'Patientez…' : powens.connected ? '+ Ajouter une banque' : 'Connecter ma banque' }), powens.connected && (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn btn-secondary", onClick: () => setShowSyncModal(true), disabled: powensBusy, children: "\u21BB Synchroniser" }), _jsx("button", { className: "btn btn-secondary", onClick: disconnectPowens, disabled: powensBusy, children: "D\u00E9connecter" })] }))] }), powensError && (_jsxs("div", { style: { marginTop: 12, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8 }, children: [_jsx("div", { style: { fontSize: 13, fontWeight: 600, color: 'var(--red)', marginBottom: 4 }, children: "Erreur de synchronisation" }), _jsx("div", { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 10 }, children: powensError }), _jsx("button", { className: "btn btn-primary", style: { fontSize: 12, padding: '4px 14px', background: 'rgba(239,68,68,0.2)', borderColor: 'rgba(239,68,68,0.5)', color: 'var(--red)' }, onClick: connectPowens, disabled: powensBusy, children: "Reconnecter ma banque" })] })), powensMsg && !powensError && (_jsx("p", { className: "text-sm", style: { marginTop: 10, color: 'var(--text2)' }, children: powensMsg }))] }), _jsxs("div", { style: { borderTop: '1px solid var(--border)', paddingTop: 16 }, children: [_jsx("p", { className: "text-sm", style: { fontWeight: 500, marginBottom: 12 }, children: "Ajouter manuellement" }), _jsxs("div", { className: "grid-3", style: { marginBottom: 12 }, children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Nom" }), _jsx("input", { value: newAccount.name, onChange: (e) => setNewAccount({ ...newAccount, name: e.target.value }), placeholder: "Compte courant" })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Banque" }), _jsx("input", { value: newAccount.bank, onChange: (e) => setNewAccount({ ...newAccount, bank: e.target.value }), placeholder: "BNP Paribas" })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Devise" }), _jsx("select", { value: newAccount.currency, onChange: (e) => setNewAccount({ ...newAccount, currency: e.target.value }), children: CURRENCIES.map((c) => _jsx("option", { children: c }, c)) })] })] }), _jsx("button", { className: "btn btn-secondary", onClick: addAccount, disabled: !newAccount.name, children: accountSaved ? '✓ Ajouté' : '+ Ajouter le compte' })] })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("h3", { style: { marginBottom: 8 }, children: "Donn\u00E9es" }), _jsx("p", { className: "text-muted text-sm", style: { marginBottom: 16 }, children: "Sauvegardez vos donn\u00E9es, exportez vos transactions ou restaurez une sauvegarde pr\u00E9c\u00E9dente." }), _jsxs("div", { style: { display: 'flex', gap: 10, flexWrap: 'wrap' }, children: [_jsx("button", { className: "btn btn-secondary", onClick: () => doExport('db'), children: "Backup SQLite (.db)" }), _jsx("button", { className: "btn btn-secondary", onClick: () => doExport('csv'), children: "Transactions CSV" }), restoreStep === 0 ? (_jsx("button", { className: "btn btn-secondary", onClick: doRestore, children: "Restaurer une sauvegarde\u2026" })) : (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { fontSize: 13, color: 'var(--yellow)' }, children: "L'application va recharger. Continuer ?" }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12, borderColor: 'rgba(245,158,11,0.5)', color: 'var(--yellow)' }, onClick: doRestore, children: "Choisir le fichier" }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12 }, onClick: () => setRestoreStep(0), children: "Annuler" })] }))] }), exportStatus === 'ok' && (_jsx("p", { style: { marginTop: 10, fontSize: 13, color: 'var(--green)' }, children: "Fichier export\u00E9 avec succ\u00E8s." })), restoreStatus === 'err' && (_jsxs("p", { style: { marginTop: 10, fontSize: 13, color: 'var(--red)' }, children: ["Erreur lors de la restauration : ", restoreError] }))] }), _jsx("div", { className: "card", style: { marginBottom: 20 }, children: _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("h3", { style: { marginBottom: 4 }, children: "Guide de d\u00E9marrage" }), _jsx("p", { className: "text-muted text-sm", children: "Revoir le wizard d'introduction pas-\u00E0-pas." })] }), _jsx("button", { className: "btn btn-secondary", onClick: async () => {
                                        await window.api.saveSettings({ onboardingDone: false });
                                        window.location.reload();
                                    }, children: "Revoir l'onboarding" })] }) }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsxs("div", { children: [_jsx("h3", { style: { marginBottom: 4 }, children: "Application" }), appVersion && _jsxs("p", { className: "text-muted text-sm", children: ["Version ", appVersion] })] }), _jsx("button", { className: "btn btn-secondary", onClick: checkForUpdates, disabled: updateChecking, children: updateChecking ? 'Vérification…' : '↻ Vérifier les mises à jour' })] }), updateResult && (_jsxs("div", { style: { marginTop: 12, fontSize: 13, padding: '8px 12px', borderRadius: 6, background: updateResult.status === 'up-to-date' ? 'rgba(34,197,94,0.08)' : updateResult.status === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.08)', color: updateResult.status === 'up-to-date' ? 'var(--green)' : updateResult.status === 'error' ? 'var(--red)' : 'var(--accent)' }, children: [updateResult.status === 'up-to-date' && '✓ Application à jour', updateResult.status === 'available' && `Mise à jour disponible : v${updateResult.version} — téléchargement en cours…`, updateResult.status === 'downloading' && `Téléchargement de la v${updateResult.version} en cours…`, updateResult.status === 'error' && `Erreur : ${updateResult.message}`] }))] }), _jsxs("div", { className: "card", style: { marginBottom: 20, borderColor: 'rgba(239,68,68,0.3)' }, children: [_jsx("h3", { style: { marginBottom: 8, color: 'var(--red)' }, children: "Zone danger" }), _jsx("p", { className: "text-muted text-sm", style: { marginBottom: 16 }, children: "Ces actions sont irr\u00E9versibles. Assurez-vous d'avoir export\u00E9 vos donn\u00E9es avant de continuer." }), clearStep === 0 && (_jsx("button", { className: "btn btn-secondary", style: { borderColor: 'rgba(239,68,68,0.5)', color: 'var(--red)' }, onClick: clearAllTransactions, children: "Vider toutes les transactions" })), clearStep === 1 && (_jsxs("div", { style: { background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '12px 16px' }, children: [_jsx("p", { className: "text-sm", style: { marginBottom: 12, color: 'var(--red)', fontWeight: 500 }, children: "Toutes les transactions et l'historique d'imports seront supprim\u00E9s d\u00E9finitivement. Cette action est irr\u00E9versible." }), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { className: "btn btn-secondary", style: { borderColor: 'rgba(239,68,68,0.5)', color: 'var(--red)' }, onClick: clearAllTransactions, disabled: clearBusy, children: clearBusy ? 'Suppression…' : 'Oui, tout supprimer' }), _jsx("button", { className: "btn btn-secondary", onClick: () => setClearStep(0), disabled: clearBusy, children: "Annuler" })] })] }))] })] }), showSyncModal && (_jsx("div", { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }, children: _jsxs("div", { style: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 28, width: 360 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 15, marginBottom: 4 }, children: "Plage de dates \u00E0 synchroniser" }), powensFirstDate && (_jsxs("div", { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 16 }, children: ["Donn\u00E9es disponibles depuis le ", new Date(powensFirstDate + 'T00:00:00').toLocaleDateString('fr-FR')] })), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Date de d\u00E9but" }), _jsx("input", { type: "date", value: syncMinDate, min: powensFirstDate ?? undefined, onChange: (e) => setSyncMinDate(e.target.value) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Date de fin" }), _jsx("input", { type: "date", value: syncMaxDate, onChange: (e) => setSyncMaxDate(e.target.value) })] }), _jsxs("div", { style: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }, children: [_jsx("button", { className: "btn btn-secondary", onClick: () => setShowSyncModal(false), children: "Annuler" }), _jsx("button", { className: "btn btn-primary", onClick: () => { setShowSyncModal(false); syncPowens(syncMinDate || undefined, syncMaxDate || undefined); }, children: "\u21BB Synchroniser" })] })] }) }))] }));
}
