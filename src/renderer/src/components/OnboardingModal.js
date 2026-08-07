import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
const STEPS = ['Connexion', 'Transactions', 'Catégorisation', 'Configuration IA'];
// ---------- step sub-components ----------
function StepPowens({ onConnect, onImport, }) {
    const [status, setStatus] = useState('idle');
    const [msg, setMsg] = useState('');
    const [imported, setImported] = useState(null);
    const connect = async () => {
        setStatus('busy');
        setMsg("Autorisez l'accès dans la fenêtre de votre banque…");
        try {
            await onConnect();
            // onConnect sets internal state — we just reflect success
            setStatus('done');
            setMsg('');
        }
        catch (e) {
            setStatus('error');
            setMsg(String(e instanceof Error ? e.message : e));
        }
    };
    // Exposed so parent can read back result
    void imported;
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 20 }, children: [_jsx("div", { style: {
                    border: status === 'done' ? '1.5px solid var(--green)' : '1.5px solid var(--accent)',
                    borderRadius: 12, padding: '18px 20px',
                    background: status === 'done' ? 'rgba(34,197,94,0.06)' : 'rgba(99,102,241,0.06)',
                    transition: 'all 0.2s'
                }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 14 }, children: [_jsx("span", { style: { fontSize: 28, lineHeight: 1 }, children: "\uD83C\uDFE6" }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 15, marginBottom: 4 }, children: "Connexion automatique" }), _jsx("div", { style: { fontSize: 13, color: 'var(--text2)', marginBottom: 14 }, children: "Powens synchronise vos banques fran\u00E7aises en quelques secondes. Aucun identifiant stock\u00E9 \u2014 Powens utilise OAuth2 directement avec votre banque." }), status === 'done' ? (_jsxs("div", { style: { fontSize: 13, color: 'var(--green)', fontWeight: 500 }, children: ["\u2713 Banque connect\u00E9e", imported !== null ? ` · ${imported} transactions importées` : ''] })) : (_jsx("button", { className: "btn btn-primary", onClick: connect, disabled: status === 'busy', style: { fontSize: 13 }, children: status === 'busy' ? _jsxs(_Fragment, { children: [_jsx("span", { className: "spinner", style: { marginRight: 6 } }), "Connexion\u2026"] }) : 'Connecter ma banque' })), status === 'error' && (_jsx("div", { style: { marginTop: 10, fontSize: 12, color: 'var(--red)' }, children: msg })), status === 'busy' && (_jsx("div", { style: { marginTop: 10, fontSize: 12, color: 'var(--text2)' }, children: msg }))] })] }) }), _jsx("div", { style: { border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', background: 'rgba(255,255,255,0.02)' }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'flex-start', gap: 14 }, children: [_jsx("span", { style: { fontSize: 28, lineHeight: 1 }, children: "\uD83D\uDCC2" }), _jsxs("div", { style: { flex: 1 }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 15, marginBottom: 4 }, children: "Import manuel" }), _jsx("div", { style: { fontSize: 13, color: 'var(--text2)', marginBottom: 14 }, children: "Importez vos relev\u00E9s CSV ou PDF depuis votre espace client bancaire. Compatible avec toutes les banques fran\u00E7aises." }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 13 }, onClick: onImport, children: "Importer un fichier CSV / PDF" })] })] }) }), _jsx("p", { style: { fontSize: 12, color: 'var(--text4)', textAlign: 'center' }, children: "Vous pourrez ajouter d'autres comptes ou banques \u00E0 tout moment dans les Param\u00E8tres." })] }));
}
function StepTransactions() {
    const features = [
        { icon: '🔍', label: 'Recherche et filtres', desc: 'Texte libre, catégorie, compte, mois, montant, tags…' },
        { icon: '🗂️', label: 'Tri multi-critères', desc: 'Par date, montant, description ou catégorie — côté base de données.' },
        { icon: '📝', label: 'Notes & tags', desc: 'Annotez et taguez librement chaque transaction.' },
        { icon: '⇄', label: 'Virements internes', desc: 'Marquez les transferts entre vos comptes pour les exclure des stats.' },
    ];
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 14 }, children: [_jsx("div", { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }, children: features.map((f) => (_jsxs("div", { style: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }, children: [_jsx("div", { style: { fontSize: 22, marginBottom: 8 }, children: f.icon }), _jsx("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 4 }, children: f.label }), _jsx("div", { style: { fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }, children: f.desc })] }, f.label))) }), _jsx("p", { style: { fontSize: 12, color: 'var(--text4)', textAlign: 'center' }, children: "La page Transactions est votre vue principale \u2014 tout part de l\u00E0." })] }));
}
function StepCategorization() {
    const methods = [
        {
            num: '1',
            color: 'var(--accent)',
            title: 'Clic direct',
            desc: 'Cliquez sur le badge de catégorie d\'une transaction pour la modifier instantanément.',
            detail: 'Idéal pour une transaction isolée.',
        },
        {
            num: '2',
            color: 'var(--yellow)',
            title: '"OK pour tous"',
            desc: 'Lors d\'une édition, "OK pour tous" crée une règle regex et catégorise toutes les transactions similaires.',
            detail: 'Parfait pour les marchands récurrents : Amazon, SNCF, Netflix…',
        },
        {
            num: '3',
            color: 'var(--green)',
            title: 'IA (1 clic)',
            desc: 'Avec une clé OpenRouter, le bouton "Catégoriser" traite tout en automatique.',
            detail: 'L\'IA apprend de vos règles existantes pour rester cohérente.',
        },
    ];
    return (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: methods.map((m) => (_jsxs("div", { style: { display: 'flex', gap: 14, alignItems: 'flex-start', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(255,255,255,0.02)' }, children: [_jsx("div", { style: { width: 28, height: 28, borderRadius: '50%', background: m.color, color: '#fff', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, children: m.num }), _jsxs("div", { children: [_jsx("div", { style: { fontWeight: 600, fontSize: 14, marginBottom: 3 }, children: m.title }), _jsx("div", { style: { fontSize: 13, color: 'var(--text2)', marginBottom: 4 }, children: m.desc }), _jsx("div", { style: { fontSize: 11, color: 'var(--text4)', fontStyle: 'italic' }, children: m.detail })] })] }, m.num))) }));
}
function StepAI({ apiKey, setApiKey, model, setModel, }) {
    const MODELS = [
        { value: 'openrouter/free', label: 'Auto (gratuit)' },
        { value: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5 (rapide)' },
        { value: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (puissant)' },
        { value: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'google/gemini-flash-1.5', label: 'Gemini Flash 1.5' },
    ];
    const openLink = () => {
        window.api.openExternal('https://openrouter.ai/workspaces/default/keys');
    };
    return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 16 }, children: [_jsxs("div", { style: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', background: 'rgba(99,102,241,0.04)' }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 8, color: 'var(--text)' }, children: "Qu'est-ce qu'OpenRouter ?" }), _jsxs("div", { style: { fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }, children: ["OpenRouter est un service qui donne acc\u00E8s \u00E0 des dizaines de mod\u00E8les d'IA (Claude, GPT-4, Gemini\u2026) via ", _jsx("strong", { style: { color: 'var(--text)' }, children: "une seule cl\u00E9 API" }), ". Banquier l'utilise pour cat\u00E9goriser vos transactions automatiquement."] }), _jsxs("div", { style: { marginTop: 10, fontSize: 13, color: 'var(--text2)', lineHeight: 1.65 }, children: ["Le mod\u00E8le ", _jsx("strong", { style: { color: 'var(--accent-light)' }, children: "openrouter/free" }), " est ", _jsx("strong", { style: { color: 'var(--text)' }, children: "enti\u00E8rement gratuit" }), " et largement suffisant pour la cat\u00E9gorisation."] })] }), _jsxs("div", { style: { border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }, children: [_jsx("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: 12, color: 'var(--text)' }, children: "Comment obtenir votre cl\u00E9 ?" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [
                            { n: '1', text: 'Créez un compte gratuit sur openrouter.ai' },
                            { n: '2', text: 'Allez dans Workspaces → Keys' },
                            { n: '3', text: 'Cliquez "Create key" et copiez la clé générée' },
                        ].map(({ n, text }) => (_jsxs("div", { style: { display: 'flex', gap: 10, alignItems: 'center' }, children: [_jsx("div", { style: { width: 22, height: 22, borderRadius: '50%', background: '#1e2130', border: '1px solid var(--border)', color: 'var(--accent)', fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }, children: n }), _jsx("span", { style: { fontSize: 13, color: 'var(--text2)' }, children: text })] }, n))) }), _jsxs("button", { onClick: openLink, style: { marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', color: 'var(--accent-light)', fontSize: 13, fontWeight: 500 }, children: [_jsx("span", { children: "Ouvrir openrouter.ai/keys" }), _jsx("span", { style: { fontSize: 11 }, children: "\u2197" })] })] }), _jsxs("div", { style: { display: 'flex', gap: 12 }, children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: 1 }, children: [_jsx("label", { style: { fontSize: 12 }, children: "Votre cl\u00E9 API" }), _jsx("input", { type: "password", value: apiKey, onChange: (e) => setApiKey(e.target.value), placeholder: "sk-or-v1-\u2026", style: { fontSize: 13 } })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: 1 }, children: [_jsx("label", { style: { fontSize: 12 }, children: "Mod\u00E8le" }), _jsx("select", { value: model, onChange: (e) => setModel(e.target.value), style: { fontSize: 13 }, children: MODELS.map((m) => _jsx("option", { value: m.value, children: m.label }, m.value)) })] })] }), _jsx("p", { style: { fontSize: 11, color: 'var(--text4)', margin: 0 }, children: "Optionnel \u2014 sans cl\u00E9, tout le reste de Banquier fonctionne normalement." })] }));
}
// ---------- main modal ----------
export default function OnboardingModal({ settings, onDone, onNavigate }) {
    const [step, setStep] = useState(0);
    const [powensResult, setPowensResult] = useState(null);
    const [apiKey, setApiKey] = useState(settings.openrouterApiKey || '');
    const [model, setModel] = useState(settings.openrouterModel || 'openrouter/free');
    const connectPowens = async () => {
        const res = await window.api.powensConnect();
        setPowensResult({ imported: res.imported });
    };
    const finish = async () => {
        onDone({ openrouterApiKey: apiKey, openrouterModel: model, onboardingDone: true });
    };
    const skip = async () => {
        onDone({ onboardingDone: true });
    };
    const stepContent = [
        _jsx(StepPowens, { onConnect: connectPowens, onImport: () => { skip(); onNavigate('import'); } }, "powens"),
        _jsx(StepTransactions, {}, "tx"),
        _jsx(StepCategorization, {}, "cat"),
        _jsx(StepAI, { apiKey: apiKey, setApiKey: setApiKey, model: model, setModel: setModel }, "ai"),
    ];
    void powensResult;
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
        }, children: _jsxs("div", { style: {
                background: '#13151f', border: '1px solid var(--border)', borderRadius: 18,
                width: 540, maxWidth: '92vw', maxHeight: '90vh', overflowY: 'auto',
                padding: '28px 32px', boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
            }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }, children: ["\u00C9tape ", step + 1, " sur ", STEPS.length] }), _jsx("h2", { style: { fontSize: 22, fontWeight: 700, margin: 0 }, children: STEPS[step] })] }), _jsx("button", { onClick: skip, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 18, padding: '2px 4px', lineHeight: 1 }, title: "Fermer l'onboarding", children: "\u2715" })] }), _jsx("div", { style: { display: 'flex', gap: 5, margin: '20px 0' }, children: STEPS.map((_, i) => (_jsx("div", { style: {
                            flex: 1, height: 4, borderRadius: 3,
                            background: i < step ? '#4f46e5' : i === step ? 'var(--accent-light)' : '#1e2130',
                            transition: 'background 0.3s',
                        } }, i))) }), _jsx("div", { style: { minHeight: 220 }, children: stepContent[step] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 28, paddingTop: 20, borderTop: '1px solid #1e2130' }, children: [_jsx("button", { className: "btn btn-secondary", onClick: () => setStep((s) => s - 1), style: { visibility: step === 0 ? 'hidden' : 'visible' }, children: "\u2190 Pr\u00E9c\u00E9dent" }), _jsx("div", { style: { display: 'flex', gap: 10, alignItems: 'center' }, children: step < STEPS.length - 1 ? (_jsxs(_Fragment, { children: [_jsx("button", { onClick: () => setStep((s) => s + 1), style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 13, padding: '4px 8px' }, children: "Passer cette \u00E9tape" }), _jsx("button", { className: "btn btn-primary", onClick: () => setStep((s) => s + 1), children: "Suivant \u2192" })] })) : (_jsxs(_Fragment, { children: [_jsx("button", { onClick: finish, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text4)', fontSize: 13, padding: '4px 8px' }, children: "Passer cette \u00E9tape" }), _jsx("button", { className: "btn btn-primary", onClick: finish, style: { padding: '8px 24px' }, children: "Commencer \uD83D\uDE80" })] })) })] })] }) }));
}
