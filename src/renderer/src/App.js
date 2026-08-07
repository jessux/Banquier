import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Categories from './pages/Categories';
import Rules from './pages/Rules';
import Recurring from './pages/Recurring';
import Patrimoine from './pages/Patrimoine';
import Budget from './pages/Budget';
import Simulateur from './pages/Simulateur';
import Comparaison from './pages/Comparaison';
import OnboardingModal from './components/OnboardingModal';
export default function App() {
    const [page, setPage] = useState('dashboard');
    const [syncNotif, setSyncNotif] = useState(null);
    const [budgetAlert, setBudgetAlert] = useState(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [loadedSettings, setLoadedSettings] = useState(null);
    const [pendingUncategorizedFilter, setPendingUncategorizedFilter] = useState(false);
    useEffect(() => {
        window.api.getSettings().then((s) => {
            setLoadedSettings(s);
            if (!s.onboardingDone)
                setShowOnboarding(true);
            document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark');
        });
        window.api.powensStartupSync().then((result) => {
            if (!result)
                return;
            if (result.error) {
                setSyncNotif({ imported: -1, categorized: 0, error: result.error });
                return;
            }
            if (result.imported > 0) {
                setSyncNotif({ imported: result.imported, categorized: result.categorized });
                const timer = setTimeout(() => setSyncNotif(null), 8000);
                return () => clearTimeout(timer);
            }
        }).catch(() => { });
        // Alerte budgets dépassés ce mois-ci
        const today = new Date();
        const startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const endDate = today.toISOString().slice(0, 10);
        window.api.getBudgetsWithSpent(startDate, endDate).then((budgets) => {
            const over = budgets.filter((b) => b.spent > b.amount);
            if (over.length > 0) {
                setBudgetAlert({ overCount: over.length, overCategories: over.slice(0, 3).map((b) => b.category) });
            }
        }).catch(() => { });
    }, []);
    const navigate = (p, opts) => {
        setPendingUncategorizedFilter(!!opts?.uncategorized);
        setPage(p);
    };
    const renderPage = () => {
        switch (page) {
            case 'dashboard': return _jsx(Dashboard, { onNavigate: navigate });
            case 'transactions': return _jsx(Transactions, { onImport: () => navigate('import'), initialUncategorized: pendingUncategorizedFilter });
            case 'recurring': return _jsx(Recurring, {});
            case 'patrimoine': return _jsx(Patrimoine, {});
            case 'budget': return _jsx(Budget, {});
            case 'simulateur': return _jsx(Simulateur, {});
            case 'comparaison': return _jsx(Comparaison, {});
            case 'import': return _jsx(Import, {});
            case 'chat': return _jsx(Chat, {});
            case 'categories': return _jsx(Categories, {});
            case 'rules': return _jsx(Rules, {});
            case 'settings': return _jsx(Settings, {});
        }
    };
    const uncategorized = syncNotif ? syncNotif.imported - syncNotif.categorized : 0;
    const handleOnboardingDone = async (saved) => {
        await window.api.saveSettings(saved);
        setShowOnboarding(false);
    };
    return (_jsxs("div", { className: "layout", children: [_jsx(Sidebar, { activePage: page, onNavigate: navigate }), _jsx("main", { className: "main-content", children: renderPage() }), showOnboarding && loadedSettings && (_jsx(OnboardingModal, { settings: loadedSettings, onDone: handleOnboardingDone, onNavigate: (p) => { setPage(p); setShowOnboarding(false); } })), budgetAlert && (_jsxs("div", { className: "sync-toast", style: { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }, children: [_jsx("div", { className: "sync-toast-icon", children: "\uD83C\uDFAF" }), _jsxs("div", { className: "sync-toast-body", children: [_jsxs("strong", { style: { color: '#ef4444' }, children: ["Budget", budgetAlert.overCount > 1 ? 's' : '', " d\u00E9pass\u00E9", budgetAlert.overCount > 1 ? 's' : ''] }), _jsxs("span", { children: [budgetAlert.overCategories.join(', '), budgetAlert.overCount > 3 ? ` +${budgetAlert.overCount - 3} autre(s)` : ''] }), _jsx("button", { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 0, textAlign: 'left' }, onClick: () => { setPage('budget'); setBudgetAlert(null); }, children: "Voir les budgets \u2192" })] }), _jsx("button", { className: "sync-toast-close", onClick: () => setBudgetAlert(null), children: "\u2715" })] })), syncNotif && syncNotif.error && (_jsxs("div", { className: "sync-toast", style: { borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }, children: [_jsx("div", { className: "sync-toast-icon", children: "\uD83C\uDFE6" }), _jsxs("div", { className: "sync-toast-body", children: [_jsx("strong", { style: { color: '#ef4444' }, children: "Synchronisation Powens \u00E9chou\u00E9e" }), _jsx("span", { style: { fontSize: 11, color: '#94a3b8' }, children: syncNotif.error.slice(0, 120) }), _jsx("button", { style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#ef4444', padding: 0, textAlign: 'left' }, onClick: () => { setPage('settings'); setSyncNotif(null); }, children: "Reconnecter dans les param\u00E8tres \u2192" })] }), _jsx("button", { className: "sync-toast-close", onClick: () => setSyncNotif(null), children: "\u2715" })] })), syncNotif && !syncNotif.error && (_jsxs("div", { className: "sync-toast", children: [_jsx("div", { className: "sync-toast-icon", children: "\uD83C\uDFE6" }), _jsxs("div", { className: "sync-toast-body", children: [_jsx("strong", { children: "Synchronisation Powens" }), _jsxs("span", { children: [syncNotif.imported, " nouvelle", syncNotif.imported > 1 ? 's' : '', " transaction", syncNotif.imported > 1 ? 's' : ''] }), _jsxs("span", { children: [syncNotif.categorized, " cat\u00E9goris\u00E9e", syncNotif.categorized !== 1 ? 's' : '', " auto", uncategorized > 0 && _jsxs(_Fragment, { children: [" \u00B7 ", _jsxs("em", { children: [uncategorized, " \u00E0 classer"] })] })] })] }), _jsx("button", { className: "sync-toast-close", onClick: () => setSyncNotif(null), children: "\u2715" })] }))] }));
}
