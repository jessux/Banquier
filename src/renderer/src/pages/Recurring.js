import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const WINDOWS = [
    { key: '6m', label: '6 mois' },
    { key: '1a', label: '1 an' },
    { key: '2a', label: '2 ans' },
    { key: 'tout', label: 'Tout' }
];
const FREQ_LABEL = {
    hebdomadaire: 'Hebdomadaire',
    mensuel: 'Mensuel',
    bimestriel: 'Bimestriel',
    trimestriel: 'Trimestriel',
    semestriel: 'Semestriel',
    annuel: 'Annuel'
};
function windowStartDate(w) {
    if (w === 'tout')
        return undefined;
    const d = new Date();
    if (w === '6m')
        d.setMonth(d.getMonth() - 6);
    else if (w === '1a')
        d.setFullYear(d.getFullYear() - 1);
    else if (w === '2a')
        d.setFullYear(d.getFullYear() - 2);
    return d.toISOString().slice(0, 10);
}
function formatEur(n) {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
const DAY_MS = 86400_000;
/** Prochaine échéance estimée : dernier paiement + intervalle médian observé entre deux paiements. */
function nextDueDate(item) {
    return new Date(new Date(item.lastDate).getTime() + item.intervalDays * DAY_MS);
}
function daysUntil(d) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(d);
    target.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}
function dueLabel(days) {
    if (days < 0)
        return `en retard de ${Math.abs(days)} j`;
    if (days === 0)
        return "aujourd'hui";
    if (days === 1)
        return 'demain';
    return `dans ${days} j`;
}
export default function Recurring() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [win, setWin] = useState('1a');
    const [showInactive, setShowInactive] = useState(false);
    const [expanded, setExpanded] = useState(null);
    useEffect(() => {
        setLoading(true);
        window.api.getRecurringExpenses(windowStartDate(win)).then((d) => {
            setData(d);
            setLoading(false);
        });
    }, [win]);
    const windowBar = (_jsx("div", { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }, children: WINDOWS.map((w) => (_jsx("button", { onClick: () => setWin(w.key), style: {
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: win === w.key ? 600 : 400,
                background: win === w.key ? 'var(--accent)' : 'var(--bg3)',
                color: win === w.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s'
            }, children: w.label }, w.key))) }));
    if (loading) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "R\u00E9currences" }), windowBar] }), _jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 32, height: 32, margin: '0 auto' } }) })] }));
    }
    if (!data || data.items.length === 0) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "R\u00E9currences" }), windowBar] }), _jsxs("div", { className: "empty-state", children: [_jsx("div", { style: { fontSize: 48, marginBottom: 16 }, children: "\uD83D\uDD01" }), _jsx("p", { style: { fontSize: 16, marginBottom: 8 }, children: "Aucune d\u00E9pense r\u00E9currente d\u00E9tect\u00E9e" }), _jsx("p", { className: "text-muted", children: "Il faut au moins 3 paiements r\u00E9guliers chez un m\u00EAme marchand sur la p\u00E9riode." })] })] }));
    }
    const visible = data.items.filter((i) => showInactive || i.active);
    const activeCount = data.items.filter((i) => i.active).length;
    const upcoming = data.items
        .filter((i) => i.active)
        .map((i) => ({ item: i, next: nextDueDate(i) }))
        .sort((a, b) => a.next.getTime() - b.next.getTime())
        .slice(0, 5);
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "R\u00E9currences" }), windowBar] }), _jsxs("div", { className: "grid-3", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Co\u00FBt mensuel r\u00E9current" }), _jsx("div", { className: "card-value negative", children: formatEur(data.totalMonthlyActive) }), _jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [activeCount, " abonnement", activeCount > 1 ? 's' : '', " actif", activeCount > 1 ? 's' : ''] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Co\u00FBt annuel r\u00E9current" }), _jsx("div", { className: "card-value negative", children: formatEur(data.totalYearlyActive) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "R\u00E9currences d\u00E9tect\u00E9es" }), _jsx("div", { className: "card-value", children: data.items.length }), _jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [data.items.length - activeCount, " probablement r\u00E9sili\u00E9", data.items.length - activeCount > 1 ? 's' : ''] })] })] }), upcoming.length > 0 && (_jsxs("div", { className: "card", style: { marginBottom: 24 }, children: [_jsx("div", { className: "card-title", children: "Prochaines \u00E9ch\u00E9ances estim\u00E9es" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }, children: upcoming.map(({ item, next }) => {
                            const days = daysUntil(next);
                            const soon = days <= 3;
                            return (_jsxs("div", { className: "flex justify-between", style: { alignItems: 'center' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { style: { fontWeight: 500, fontSize: 13 }, children: item.merchant }), item.category && _jsx("span", { className: "category-badge", children: item.category })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { className: "amount-negative", style: { fontSize: 13 }, children: formatEur(item.averageAmount) }), _jsx("span", { style: {
                                                    fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
                                                    color: soon ? 'var(--yellow)' : 'var(--text2)',
                                                    background: soon ? 'rgba(245,158,11,0.12)' : 'var(--bg3)'
                                                }, children: dueLabel(days) })] })] }, item.merchant));
                        }) })] })), _jsxs("div", { className: "flex justify-between", style: { alignItems: 'center', marginBottom: 12 }, children: [_jsx("div", { className: "card-title", children: "D\u00E9tail des r\u00E9currences" }), _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text2)', cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: showInactive, onChange: (e) => setShowInactive(e.target.checked), style: { accentColor: 'var(--accent)' } }), "Afficher les inactives"] })] }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Marchand" }), _jsx("th", { children: "Fr\u00E9quence" }), _jsx("th", { children: "Cat\u00E9gorie" }), _jsx("th", { style: { textAlign: 'right' }, children: "Montant moyen" }), _jsx("th", { style: { textAlign: 'right' }, children: "Co\u00FBt mensuel" }), _jsx("th", { children: "Dernier paiement" }), _jsx("th", { children: "Prochaine \u00E9ch\u00E9ance" }), _jsx("th", {})] }) }), _jsx("tbody", { children: visible.map((item) => (_jsx(RecurringRow, { item: item, expanded: expanded === item.merchant, onToggle: () => setExpanded(expanded === item.merchant ? null : item.merchant) }, item.merchant))) })] }) })] }));
}
function RecurringRow({ item, expanded, onToggle }) {
    return (_jsxs(_Fragment, { children: [_jsxs("tr", { onClick: onToggle, style: { cursor: 'pointer', opacity: item.active ? 1 : 0.55 }, children: [_jsxs("td", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { fontSize: 11, color: 'var(--text3)', width: 10 }, children: expanded ? '▾' : '▸' }), _jsx("span", { style: { fontWeight: 600 }, children: item.merchant }), !item.active && _jsx("span", { className: "badge badge-warning", children: "r\u00E9sili\u00E9 ?" })] }), _jsxs("div", { className: "text-muted text-sm", style: { marginLeft: 18 }, children: [item.occurrences, " paiements \u00B7 tous les ~", item.intervalDays, " j"] })] }), _jsx("td", { children: FREQ_LABEL[item.frequency] }), _jsx("td", { children: item.category
                            ? _jsx("span", { className: "category-badge", children: item.category })
                            : _jsx("span", { className: "text-muted text-sm", children: "\u2014" }) }), _jsx("td", { style: { textAlign: 'right' }, className: "amount-negative", children: formatEur(item.averageAmount) }), _jsx("td", { style: { textAlign: 'right' }, className: "amount-negative", children: formatEur(item.monthlyEstimate) }), _jsx("td", { children: formatDate(item.lastDate) }), _jsx("td", { children: item.active ? (() => {
                            const days = daysUntil(nextDueDate(item));
                            return (_jsx("span", { style: { fontSize: 12, color: days <= 3 ? 'var(--yellow)' : 'var(--text2)' }, children: dueLabel(days) }));
                        })() : _jsx("span", { className: "text-muted text-sm", children: "\u2014" }) }), _jsx("td", {})] }), expanded && (_jsx("tr", { children: _jsxs("td", { colSpan: 8, style: { background: 'var(--bg)', padding: '12px 16px 16px 32px' }, children: [_jsxs("div", { className: "text-muted text-sm", style: { marginBottom: 8 }, children: ["Co\u00FBt annuel estim\u00E9 : ", _jsx("span", { className: "amount-negative", children: formatEur(item.yearlyEstimate) }), ' · ', "depuis le ", formatDate(item.firstDate)] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 4 }, children: item.transactions.map((t) => (_jsxs("div", { className: "flex justify-between", style: { fontSize: 13 }, children: [_jsx("span", { style: { color: 'var(--text2)' }, children: formatDate(t.date) }), _jsx("span", { style: { flex: 1, margin: '0 16px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: t.description }), _jsx("span", { className: "amount-negative", children: formatEur(Math.abs(t.amount)) })] }, t.id))) })] }) }))] }));
}
