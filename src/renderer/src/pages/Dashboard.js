import { jsxs as _jsxs, jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, BarChart, Bar } from 'recharts';
const COLORS = ['var(--accent)', 'var(--green)', 'var(--yellow)', 'var(--red)', '#8b5cf6', '#06b6d4', '#f97316'];
function PieTooltip({ active, payload }) {
    if (!active || !payload?.length)
        return null;
    const item = payload[0];
    const subs = item.payload.subcategories ?? [];
    return (_jsxs("div", { style: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', minWidth: 180 }, children: [_jsxs("div", { style: { fontWeight: 600, fontSize: 13, marginBottom: subs.length ? 8 : 0, color: 'var(--text)' }, children: [item.name, " \u2014 ", item.value.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })] }), subs.map((s) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', gap: 24, fontSize: 12, color: 'var(--text2)', paddingLeft: 8 }, children: [_jsx("span", { children: s.category }), _jsx("span", { children: s.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) })] }, s.category)))] }));
}
const MONTH_SHORT_MODAL = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function CategoryModal({ category, color, periodTotal, subcategories, onClose, onToggleExclude, isExcluded, }) {
    const [history, setHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    useEffect(() => {
        setLoadingHistory(true);
        window.api.getCategoryMonthlyHistory(category, 12).then((data) => {
            setHistory(data);
            setLoadingHistory(false);
        });
    }, [category]);
    const chartData = history.map((p) => {
        const [y, m] = p.month.split('-');
        return {
            month: `${MONTH_SHORT_MODAL[parseInt(m, 10) - 1]}-${y.slice(2)}`,
            total: Math.round(p.total),
        };
    });
    const maxTotal = Math.max(...chartData.map((d) => d.total), 1);
    const avg = history.length > 0 ? Math.round(history.reduce((s, p) => s + p.total, 0) / history.length) : 0;
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }, onClick: onClose, children: _jsxs("div", { style: {
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
                padding: 24, width: '100%', maxWidth: 560, boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }, onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }, children: [_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }, children: [_jsx("span", { style: { width: 12, height: 12, borderRadius: '50%', background: color, flexShrink: 0 } }), _jsx("span", { style: { fontSize: 17, fontWeight: 700, color: 'var(--text)' }, children: category })] }), _jsx("div", { style: { fontSize: 22, fontWeight: 700, color, paddingLeft: 22 }, children: periodTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) })] }), _jsx("button", { onClick: onClose, style: {
                                width: 28, height: 28, borderRadius: '50%', border: 'none', background: 'var(--border)',
                                color: 'var(--text2)', cursor: 'pointer', fontSize: 16, display: 'flex',
                                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                            }, children: "\u00D7" })] }), !loadingHistory && history.length > 0 && (_jsxs("div", { style: { display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }, children: [_jsxs("div", { style: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }, children: [_jsx("span", { style: { color: 'var(--text3)' }, children: "Moyenne mensuelle " }), _jsx("span", { style: { color: 'var(--text)', fontWeight: 600 }, children: avg.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) })] }), _jsxs("div", { style: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }, children: [_jsx("span", { style: { color: 'var(--text3)' }, children: "Sur " }), _jsxs("span", { style: { color: 'var(--text)', fontWeight: 600 }, children: [history.length, " mois"] })] }), history.length >= 2 && (() => {
                            const last = history[history.length - 1].total;
                            const prev = history[history.length - 2].total;
                            const diff = prev > 0 ? ((last - prev) / prev) * 100 : 0;
                            const sign = diff >= 0 ? '+' : '';
                            return (_jsxs("div", { style: { background: 'var(--bg3)', borderRadius: 8, padding: '8px 14px', fontSize: 12 }, children: [_jsx("span", { style: { color: 'var(--text3)' }, children: "Dernier mois " }), _jsxs("span", { style: { color: diff > 5 ? 'var(--red)' : diff < -5 ? 'var(--green)' : 'var(--text2)', fontWeight: 600 }, children: [sign, diff.toFixed(1), "%"] })] }));
                        })()] })), _jsxs("div", { style: { marginBottom: subcategories.length > 0 ? 20 : 0 }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text3)', marginBottom: 8 }, children: "\u00C9volution sur 12 mois" }), loadingHistory ? (_jsx("div", { style: { height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: _jsx("div", { className: "spinner", style: { width: 24, height: 24 } }) })) : chartData.length === 0 ? (_jsx("div", { style: { height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text4)', fontSize: 13 }, children: "Aucune donn\u00E9e sur les 12 derniers mois" })) : (_jsx(ResponsiveContainer, { width: "100%", height: 160, children: _jsxs(BarChart, { data: chartData, margin: { top: 4, right: 4, left: -16, bottom: 0 }, children: [_jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)", vertical: false }), _jsx(XAxis, { dataKey: "month", stroke: "var(--text3)", tick: { fontSize: 10 }, interval: 0 }), _jsx(YAxis, { stroke: "var(--text3)", tick: { fontSize: 10 }, tickFormatter: (v) => `${v}€` }), _jsx(Tooltip, { contentStyle: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }, labelStyle: { color: 'var(--text2)' }, itemStyle: { color: 'var(--text)' }, formatter: (v) => [v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), 'Total'], cursor: { fill: '#2e314733' } }), _jsx(Bar, { dataKey: "total", radius: [3, 3, 0, 0], children: chartData.map((d, i) => (_jsx(Cell, { fill: d.total === maxTotal ? color : color + '88' }, i))) })] }) }))] }), subcategories.length > 0 && (_jsxs("div", { style: { marginBottom: 20 }, children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text3)', marginBottom: 8 }, children: "Sous-cat\u00E9gories (p\u00E9riode)" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [...subcategories].sort((a, b) => b.total - a.total).map((s) => {
                                const pctW = Math.round((s.total / periodTotal) * 100);
                                return (_jsxs("div", { children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }, children: [_jsx("span", { style: { color: 'var(--text2)' }, children: s.category }), _jsxs("span", { style: { color: 'var(--text)' }, children: [s.total.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }), " ", _jsxs("span", { style: { color: 'var(--text4)' }, children: ["(", pctW, "%)"] })] })] }), _jsx("div", { style: { background: 'var(--bg3)', borderRadius: 3, height: 4 }, children: _jsx("div", { style: { width: `${pctW}%`, height: '100%', background: color + 'aa', borderRadius: 3 } }) })] }, s.category));
                            }) })] })), _jsxs("div", { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }, children: [_jsx("button", { onClick: () => { onToggleExclude(); onClose(); }, style: {
                                padding: '7px 16px', borderRadius: 8, border: `1px solid ${isExcluded ? '#22c55e44' : '#f59e0b44'}`,
                                background: isExcluded ? '#22c55e18' : '#f59e0b18',
                                color: isExcluded ? 'var(--green)' : 'var(--yellow)',
                                cursor: 'pointer', fontSize: 13, fontWeight: 500,
                            }, children: isExcluded ? 'Réactiver dans les calculs' : 'Exclure des calculs' }), _jsx("button", { onClick: onClose, style: {
                                padding: '7px 16px', borderRadius: 8, border: 'none',
                                background: 'var(--border)', color: 'var(--text2)',
                                cursor: 'pointer', fontSize: 13,
                            }, children: "Fermer" })] })] }) }));
}
const PERIODS = [
    { key: 'mois', label: 'Ce mois' },
    { key: '3m', label: '3 mois' },
    { key: '6m', label: '6 mois' },
    { key: '1a', label: '1 an' },
    { key: 'tout', label: 'Tout' },
    { key: 'custom', label: 'Personnalisé' }
];
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function periodDates(p, customStart, customEnd, monthOffset = 0) {
    const today = new Date();
    const fmt = (d) => d.toISOString().slice(0, 10);
    switch (p) {
        case 'mois': {
            const y = today.getFullYear(), m = today.getMonth() + monthOffset;
            const start = new Date(y, m, 1);
            const end = new Date(y, m + 1, 0);
            const isCurrentMonth = monthOffset === 0;
            return { startDate: fmt(start), endDate: fmt(isCurrentMonth ? today : end) };
        }
        case '3m': {
            const s = new Date(today);
            s.setMonth(s.getMonth() - 3);
            return { startDate: fmt(s), endDate: fmt(today) };
        }
        case '6m': {
            const s = new Date(today);
            s.setMonth(s.getMonth() - 6);
            return { startDate: fmt(s), endDate: fmt(today) };
        }
        case '1a': {
            const s = new Date(today);
            s.setFullYear(s.getFullYear() - 1);
            return { startDate: fmt(s), endDate: fmt(today) };
        }
        case 'tout': return {};
        case 'custom': return { startDate: customStart, endDate: customEnd };
    }
}
const MONTH_SHORT = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function monthTick(monthKey) {
    const [y, m] = monthKey.split('-');
    return `${MONTH_SHORT[parseInt(m, 10) - 1]}-${y.slice(2)}`;
}
function monthLabel(offset) {
    const d = new Date();
    d.setMonth(d.getMonth() + offset);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}
function periodComparisonLabel(p) {
    switch (p) {
        case 'mois': return 'vs mois précédent';
        case '3m': return 'vs 3 mois précédents';
        case '6m': return 'vs 6 mois précédents';
        case '1a': return 'vs année précédente';
        case 'tout': return '';
        case 'custom': return '';
    }
}
function formatEur(n) {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
function formatCurrency(n, currency) {
    try {
        return n.toLocaleString('fr-FR', { style: 'currency', currency });
    }
    catch {
        return formatEur(n);
    }
}
function pct(current, previous) {
    if (previous === 0)
        return '';
    const diff = ((current - previous) / previous) * 100;
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
}
export default function Dashboard({ onNavigate }) {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('mois');
    const [monthOffset, setMonthOffset] = useState(0);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [excludedCats, setExcludedCats] = useState(new Set());
    const [hoveredCat, setHoveredCat] = useState(null);
    const [budgets, setBudgets] = useState([]);
    const [catView, setCatView] = useState('depenses');
    const [selectedCat, setSelectedCat] = useState(null);
    const [accounts, setAccounts] = useState([]);
    const [balancesOpen, setBalancesOpen] = useState(() => localStorage.getItem('dashboard.balancesOpen') !== 'false');
    const [topMerchants, setTopMerchants] = useState([]);
    const [uncategorized, setUncategorized] = useState(null);
    const [uncategorizedDismissed, setUncategorizedDismissed] = useState(false);
    useEffect(() => {
        window.api.getAccounts().then(setAccounts);
        window.api.getUncategorized().then(setUncategorized);
    }, []);
    const toggleBalancesOpen = () => {
        setBalancesOpen((prev) => {
            const next = !prev;
            localStorage.setItem('dashboard.balancesOpen', String(next));
            return next;
        });
    };
    useEffect(() => {
        if (period === 'custom' && (!customStart || !customEnd))
            return;
        setLoading(true);
        setError(null);
        const { startDate, endDate } = periodDates(period, customStart, customEnd, monthOffset);
        const excl = excludedCats.size > 0 ? Array.from(excludedCats) : undefined;
        Promise.all([
            window.api.getDashboardSummary(startDate, endDate, excl),
            window.api.getBudgetsWithSpent(startDate, endDate),
            window.api.getTopMerchants(startDate, endDate, 6)
        ]).then(([s, b, m]) => {
            setSummary(s);
            setBudgets(b);
            setTopMerchants(m);
            setLoading(false);
        }).catch((e) => {
            console.error('[Dashboard] chargement échoué', e);
            setError(e instanceof Error ? e.message : String(e));
            setLoading(false);
        });
    }, [period, monthOffset, customStart, customEnd, excludedCats]);
    const toggleCat = (cat) => {
        setExcludedCats((prev) => {
            const next = new Set(prev);
            next.has(cat) ? next.delete(cat) : next.add(cat);
            return next;
        });
    };
    const handlePieClick = (data, index) => {
        setSelectedCat({
            name: data.name,
            color: COLORS[index % COLORS.length],
            total: data.value,
            subcategories: data.payload.subcategories ?? [],
        });
    };
    const arrowBtn = (dir) => (_jsx("button", { onClick: () => setMonthOffset((o) => o + dir), disabled: dir === 1 && monthOffset >= 0, style: {
            width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: dir === 1 && monthOffset >= 0 ? 'default' : 'pointer',
            background: 'var(--bg3)', color: dir === 1 && monthOffset >= 0 ? '#3e4259' : 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
            transition: 'all 0.15s'
        }, children: dir === -1 ? '‹' : '›' }));
    const periodBar = (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }, children: [PERIODS.map((p) => (_jsx("button", { onClick: () => { setPeriod(p.key); if (p.key !== 'mois')
                    setMonthOffset(0); }, style: {
                    padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: period === p.key ? 600 : 400,
                    background: period === p.key ? 'var(--accent)' : 'var(--bg3)',
                    color: period === p.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s'
                }, children: p.label }, p.key))), period === 'mois' && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, background: 'var(--bg2)', borderRadius: 20, padding: '3px 8px' }, children: [arrowBtn(-1), _jsx("span", { style: { fontSize: 13, color: 'var(--text)', minWidth: 110, textAlign: 'center', fontWeight: 500 }, children: monthLabel(monthOffset) }), arrowBtn(1)] })), period === 'custom' && (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', marginLeft: 4 }, children: [_jsx("input", { type: "date", value: customStart, onChange: (e) => setCustomStart(e.target.value), style: {
                            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer'
                        } }), _jsx("span", { style: { color: 'var(--text3)', fontSize: 13 }, children: "\u2192" }), _jsx("input", { type: "date", value: customEnd, min: customStart || undefined, onChange: (e) => setCustomEnd(e.target.value), style: {
                            padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                            background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer'
                        } })] }))] }));
    if (loading) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Tableau de bord" }), periodBar] }), _jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 32, height: 32, margin: '0 auto' } }) })] }));
    }
    if (error) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Tableau de bord" }), periodBar] }), _jsxs("div", { className: "empty-state", children: [_jsx("div", { style: { fontSize: 48, marginBottom: 16 }, children: "\u26A0\uFE0F" }), _jsx("p", { style: { fontSize: 16, marginBottom: 8 }, children: "Impossible de charger le tableau de bord" }), _jsx("p", { className: "text-muted", style: { marginBottom: 8 }, children: error })] })] }));
    }
    if (!summary || summary.totalTransactions === 0) {
        return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Tableau de bord" }), periodBar] }), _jsxs("div", { className: "empty-state", children: [_jsx("div", { style: { fontSize: 48, marginBottom: 16 }, children: "\uD83D\uDCE5" }), _jsx("p", { style: { fontSize: 16, marginBottom: 8 }, children: "Aucune transaction" }), _jsx("p", { className: "text-muted", children: "Importez vos relev\u00E9s pour commencer l'analyse." })] })] }));
    }
    const cmpLabel = periodComparisonLabel(period);
    const variation = pct(summary.periodDebit, summary.previousPeriodDebit);
    const variationColor = summary.periodDebit > summary.previousPeriodDebit ? 'var(--red)' : 'var(--green)';
    const trendData = summary.monthlyTrend.map((m) => ({
        month: m.month,
        Dépenses: Math.round(m.total_debit),
        Revenus: Math.round(m.total_credit)
    }));
    // Bande « période observée » : on borne le surlignage aux mois réellement
    // présents dans la tendance (un mois sans transaction n'est pas tracé).
    const trendKeys = trendData.map((d) => d.month);
    const inWindow = (k) => !!k && k >= trendKeys[0] && k <= trendKeys[trendKeys.length - 1];
    const hlStart = inWindow(summary.trendHighlightStart)
        ? trendKeys.find((k) => k >= summary.trendHighlightStart)
        : undefined;
    const hlEnd = inWindow(summary.trendHighlightEnd)
        ? [...trendKeys].reverse().find((k) => k <= summary.trendHighlightEnd)
        : undefined;
    const showHighlight = trendKeys.length > 0 && hlStart !== undefined && hlEnd !== undefined;
    const trendSpan = trendKeys.length
        ? (() => {
            const [ys, ms] = trendKeys[0].split('-').map(Number);
            const [ye, me] = trendKeys[trendKeys.length - 1].split('-').map(Number);
            return (ye - ys) * 12 + (me - ms) + 1;
        })()
        : 6;
    const pieData = summary.topCategories.slice(0, 5).map((c) => ({
        name: c.category,
        value: Math.round(c.total),
        subcategories: c.subcategories
    }));
    const tooltipStyle = {
        contentStyle: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6 },
        labelStyle: { color: 'var(--text)' },
        itemStyle: { color: 'var(--text)' }
    };
    return (_jsxs("div", { children: [selectedCat && (_jsx(CategoryModal, { category: selectedCat.name, color: selectedCat.color, periodTotal: selectedCat.total, subcategories: selectedCat.subcategories, onClose: () => setSelectedCat(null), onToggleExclude: () => toggleCat(selectedCat.name), isExcluded: excludedCats.has(selectedCat.name) })), _jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Tableau de bord" }), periodBar] }), excludedCats.size > 0 && (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--text3)', flexShrink: 0 }, children: "Exclu du calcul :" }), Array.from(excludedCats).map((cat) => (_jsxs("button", { onClick: () => toggleCat(cat), title: "Cliquer pour r\u00E9activer", style: {
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '3px 10px 3px 12px', borderRadius: 20,
                            border: '1px solid #f59e0b44', background: '#f59e0b18',
                            color: 'var(--yellow)', cursor: 'pointer', fontSize: 12, fontWeight: 500
                        }, children: [cat, _jsx("span", { style: { fontSize: 14, lineHeight: 1, opacity: 0.7 }, children: "\u00D7" })] }, cat))), _jsx("button", { onClick: () => setExcludedCats(new Set()), style: {
                            padding: '3px 10px', borderRadius: 20, border: 'none',
                            background: 'var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12
                        }, children: "Tout r\u00E9activer" })] })), uncategorized && uncategorized.count > 0 && !uncategorizedDismissed && (_jsxs("div", { className: "card", style: {
                    marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14,
                    borderColor: 'var(--yellow)', background: 'rgba(245,158,11,0.08)'
                }, children: [_jsx("span", { style: { fontSize: 22 }, children: "\uD83C\uDFF7\uFE0F" }), _jsxs("div", { style: { flex: 1 }, children: [_jsxs("div", { style: { fontSize: 14, fontWeight: 600, color: 'var(--yellow)' }, children: [uncategorized.count, " transaction", uncategorized.count > 1 ? 's' : '', " sans cat\u00E9gorie"] }), _jsxs("div", { style: { fontSize: 12, color: 'var(--text2)', marginTop: 2 }, children: [formatEur(uncategorized.total), " au total \u2014 cat\u00E9gorisez-les pour affiner vos statistiques."] })] }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12, borderColor: 'var(--yellow)', color: 'var(--yellow)', whiteSpace: 'nowrap' }, onClick: () => onNavigate?.('transactions', { uncategorized: true }), children: "Traiter \u2192" }), _jsx("button", { onClick: () => setUncategorizedDismissed(true), title: "Masquer", style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: 0 }, children: "\u2715" })] })), accounts.length > 0 && (() => {
                const knownAccounts = accounts.filter((a) => a.balance != null);
                const totalBalance = knownAccounts.reduce((s, a) => s + (a.balance ?? 0) * a.fx_rate, 0);
                const hasUnknown = knownAccounts.length < accounts.length;
                return (_jsxs("div", { className: "card", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "flex justify-between", onClick: toggleBalancesOpen, style: { cursor: 'pointer', alignItems: 'center' }, children: [_jsxs("div", { className: "card-title", style: { marginBottom: 0, display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontSize: 11, color: 'var(--text3)' }, children: balancesOpen ? '▾' : '▸' }), "Soldes des comptes"] }), !balancesOpen && knownAccounts.length > 0 && (_jsx("span", { style: { fontSize: 13, fontWeight: 700 }, children: formatEur(totalBalance) }))] }), balancesOpen && (_jsxs(_Fragment, { children: [_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }, children: accounts.map((a) => (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { style: { fontSize: 13 }, children: a.name }), a.balance != null ? (_jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: formatCurrency(a.balance, a.currency) })) : (_jsx("span", { style: { fontSize: 12, color: 'var(--text3)' }, children: "Solde inconnu" }))] }, a.id))) }), knownAccounts.length > 0 && (_jsxs("div", { className: "flex justify-between", style: { borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12, fontSize: 14, fontWeight: 700 }, children: [_jsxs("span", { children: ["Total", hasUnknown ? ' (comptes connus)' : ''] }), _jsx("span", { children: formatEur(totalBalance) })] }))] }))] }));
            })(), _jsxs("div", { className: "grid-3", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "D\u00E9penses" }), _jsx("div", { className: "card-value negative", children: formatEur(summary.periodDebit) }), variation && cmpLabel && (_jsxs("div", { style: { color: variationColor, fontSize: 12, marginTop: 6 }, children: [variation, " ", cmpLabel] }))] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Revenus" }), _jsx("div", { className: "card-value positive", children: formatEur(summary.periodCredit) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Solde estim\u00E9" }), _jsx("div", { className: `card-value ${summary.periodCredit - summary.periodDebit >= 0 ? 'positive' : 'negative'}`, children: formatEur(summary.periodCredit - summary.periodDebit) }), _jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [summary.totalTransactions, " transactions au total"] })] })] }), _jsxs("div", { className: "grid-2", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "card", children: [_jsxs("div", { className: "flex justify-between", style: { alignItems: 'baseline', marginBottom: 16 }, children: [_jsxs("div", { className: "card-title", children: ["Tendance sur ", trendSpan, " mois"] }), showHighlight && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text2)' }, children: [_jsx("span", { style: { width: 12, height: 12, borderRadius: 3, background: 'var(--accent)', opacity: 0.25, border: '1px solid var(--accent)' } }), "P\u00E9riode observ\u00E9e"] }))] }), _jsx(ResponsiveContainer, { width: "100%", height: 220, children: _jsxs(AreaChart, { data: trendData, children: [_jsxs("defs", { children: [_jsxs("linearGradient", { id: "depGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "var(--red)", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "var(--red)", stopOpacity: 0 })] }), _jsxs("linearGradient", { id: "revGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "var(--green)", stopOpacity: 0.3 }), _jsx("stop", { offset: "95%", stopColor: "var(--green)", stopOpacity: 0 })] })] }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)" }), _jsx(XAxis, { dataKey: "month", stroke: "var(--text2)", tick: { fontSize: 11 }, tickFormatter: monthTick }), _jsx(YAxis, { stroke: "var(--text2)", tick: { fontSize: 11 }, tickFormatter: (v) => `${v}€` }), _jsx(Tooltip, { ...tooltipStyle, formatter: (v) => formatEur(v), labelFormatter: monthTick }), _jsx(Legend, { wrapperStyle: { fontSize: 12 } }), showHighlight && (_jsx(ReferenceArea, { x1: hlStart, x2: hlEnd, fill: "var(--accent)", fillOpacity: 0.12, stroke: "var(--accent)", strokeOpacity: 0.4, strokeDasharray: "3 3", ifOverflow: "extendDomain" })), _jsx(Area, { type: "monotone", dataKey: "D\u00E9penses", stroke: "var(--red)", fill: "url(#depGrad)", strokeWidth: 2 }), _jsx(Area, { type: "monotone", dataKey: "Revenus", stroke: "var(--green)", fill: "url(#revGrad)", strokeWidth: 2 })] }) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 0 }, children: "R\u00E9partition par cat\u00E9gorie" }), _jsx("span", { style: { fontSize: 11, color: 'var(--text4)' }, children: "Cliquer pour d\u00E9tails" })] }), pieData.length > 0 ? (_jsx(ResponsiveContainer, { width: "100%", height: 220, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: pieData, cx: "50%", cy: "50%", outerRadius: 80, dataKey: "value", label: ({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`, labelLine: false, onClick: handlePieClick, style: { cursor: 'pointer' }, children: pieData.map((_, index) => (_jsx(Cell, { fill: COLORS[index % COLORS.length], stroke: COLORS[index % COLORS.length], strokeWidth: 1 }, index))) }), _jsx(Tooltip, { content: _jsx(PieTooltip, {}) })] }) })) : (_jsx("div", { className: "empty-state", style: { padding: 24 }, children: _jsx("p", { className: "text-muted", children: "Cat\u00E9gorisez vos transactions pour voir la r\u00E9partition." }) }))] })] }), (summary.topCategories.length > 0 || summary.topIncomeCategories.length > 0) && (() => {
                const depItems = summary.topCategories;
                const revItems = summary.topIncomeCategories;
                // Combined: net balance per category (revenus − dépenses)
                const netMap = new Map();
                for (const c of depItems) {
                    const e = netMap.get(c.category) ?? { income: 0, expense: 0, subcategories: c.subcategories };
                    netMap.set(c.category, { ...e, expense: c.total, subcategories: c.subcategories });
                }
                for (const c of revItems) {
                    const e = netMap.get(c.category) ?? { income: 0, expense: 0, subcategories: c.subcategories };
                    netMap.set(c.category, { ...e, income: c.total });
                }
                const netItems = Array.from(netMap.entries())
                    .map(([cat, d]) => ({ category: cat, net: d.income - d.expense, income: d.income, expense: d.expense, subcategories: d.subcategories }))
                    .sort((a, b) => b.net - a.net);
                const depWithColor = depItems.map((c, i) => ({ ...c, catType: 'depense', color: COLORS[i % COLORS.length] }));
                const revWithColor = revItems.map(c => ({ ...c, catType: 'revenu', color: 'var(--green)' }));
                return (_jsxs("div", { className: "card", style: { marginBottom: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, children: [_jsx("div", { className: "card-title", style: {
                                        marginBottom: 0,
                                        color: catView === 'depenses' ? 'var(--red)' : catView === 'revenus' ? 'var(--green)' : undefined
                                    }, children: catView === 'depenses' ? 'Dépenses par catégorie' : catView === 'revenus' ? 'Revenus par catégorie' : 'Solde net par catégorie' }), _jsx("div", { style: { display: 'flex', gap: 4 }, children: ['depenses', 'combined', 'revenus'].map((v) => (_jsx("button", { onClick: () => setCatView(v), style: {
                                            padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                                            fontSize: 12, fontWeight: catView === v ? 600 : 400,
                                            background: catView === v
                                                ? (v === 'depenses' ? '#ef444420' : v === 'revenus' ? '#22c55e20' : '#6366f120')
                                                : 'var(--bg3)',
                                            color: catView === v
                                                ? (v === 'depenses' ? 'var(--red)' : v === 'revenus' ? 'var(--green)' : 'var(--accent)')
                                                : 'var(--text2)',
                                            transition: 'all 0.15s'
                                        }, children: v === 'depenses' ? 'Dépenses' : v === 'revenus' ? 'Revenus' : 'Combiné' }, v))) })] }), catView === 'combined' ? (netItems.length === 0 ? (_jsx("p", { className: "text-muted", style: { fontSize: 13 }, children: "Aucune donn\u00E9e." })) : (() => {
                            const maxAbs = Math.max(...netItems.map(c => Math.abs(c.net)), 1);
                            return (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: netItems.map((c) => {
                                    const isPos = c.net >= 0;
                                    const color = isPos ? 'var(--green)' : 'var(--red)';
                                    const isHovered = hoveredCat === `net/${c.category}`;
                                    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between", onClick: () => toggleCat(c.category), onMouseEnter: () => setHoveredCat(`net/${c.category}`), onMouseLeave: () => setHoveredCat(null), style: { marginBottom: 4, cursor: 'pointer', borderRadius: 4, padding: '2px 4px', marginLeft: -4, background: isHovered ? '#2e314733' : 'transparent', transition: 'background 0.15s' }, title: "Cliquer pour exclure du calcul", children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: c.category }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { fontSize: 10, color: 'var(--text4)', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }, children: "exclure \u00D7" }), (c.income > 0 || c.expense > 0) && (_jsxs("span", { style: { fontSize: 11, color: 'var(--text3)' }, children: [c.income > 0 && `+${formatEur(c.income)}`, c.income > 0 && c.expense > 0 && ' / ', c.expense > 0 && `-${formatEur(c.expense)}`] })), _jsxs("span", { style: { color, fontWeight: 600, fontSize: 13 }, children: [isPos ? '+' : '', formatEur(c.net)] })] })] }), _jsx("div", { style: { background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }, children: _jsx("div", { style: { width: `${(Math.abs(c.net) / maxAbs) * 100}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s ease' } }) })] }, c.category));
                                }) }));
                        })()) : (() => {
                            const activeItems = catView === 'depenses' ? depWithColor : revWithColor;
                            return activeItems.length === 0 ? (_jsx("p", { className: "text-muted", style: { fontSize: 13 }, children: "Aucune donn\u00E9e pour cette vue." })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: activeItems.map((c) => {
                                    const max = activeItems[0]?.total ?? 1;
                                    const isExpense = c.catType === 'depense';
                                    const isHovered = hoveredCat === `cat/${c.category}`;
                                    return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between", onClick: () => toggleCat(c.category), onMouseEnter: () => setHoveredCat(`cat/${c.category}`), onMouseLeave: () => setHoveredCat(null), style: { marginBottom: 4, cursor: 'pointer', borderRadius: 4, padding: '2px 4px', marginLeft: -4, background: isHovered ? '#2e314733' : 'transparent', transition: 'background 0.15s' }, title: "Cliquer pour exclure du calcul", children: [_jsx("span", { style: { fontSize: 13, fontWeight: 600 }, children: c.category }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { fontSize: 11, color: 'var(--text3)', opacity: isHovered ? 1 : 0, transition: 'opacity 0.15s' }, children: "exclure \u00D7" }), _jsx("span", { className: isExpense ? 'amount-negative' : 'amount-positive', children: formatEur(c.total) })] })] }), _jsx("div", { style: { background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: c.subcategories.length ? 6 : 0 }, children: _jsx("div", { style: { width: `${(c.total / max) * 100}%`, height: '100%', background: c.color, borderRadius: 4, transition: 'width 0.3s ease' } }) }), c.subcategories.length > 0 && (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 3, paddingLeft: 12, borderLeft: `2px solid ${c.color}33` }, children: [...c.subcategories].sort((a, b) => b.total - a.total).map((s) => {
                                                    const isSubHovered = hoveredCat === `cat/${c.category}/${s.category}`;
                                                    return (_jsxs("div", { className: "flex justify-between", onClick: () => toggleCat(`${c.category} > ${s.category}`), onMouseEnter: () => setHoveredCat(`cat/${c.category}/${s.category}`), onMouseLeave: () => setHoveredCat(null), style: { fontSize: 12, color: 'var(--text2)', cursor: 'pointer', borderRadius: 3, padding: '1px 4px', marginLeft: -4, background: isSubHovered ? '#2e314744' : 'transparent', transition: 'background 0.15s' }, title: "Cliquer pour exclure du calcul", children: [_jsx("span", { children: s.category }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx("span", { style: { fontSize: 10, color: 'var(--text4)', opacity: isSubHovered ? 1 : 0, transition: 'opacity 0.15s' }, children: "exclure \u00D7" }), _jsx("span", { children: formatEur(s.total) })] })] }, s.category));
                                                }) }))] }, `${c.catType}/${c.category}`));
                                }) }));
                        })()] }));
            })(), topMerchants.length > 0 && (_jsxs("div", { className: "card", style: { marginBottom: 24 }, children: [_jsx("div", { className: "card-title", children: "Top marchands" }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }, children: topMerchants.map((m) => {
                            const max = topMerchants[0]?.total ?? 1;
                            return (_jsxs("div", { children: [_jsxs("div", { className: "flex justify-between", style: { marginBottom: 4 }, children: [_jsxs("span", { style: { fontSize: 13, fontWeight: 500 }, children: [m.merchant, _jsxs("span", { style: { color: 'var(--text3)', fontWeight: 400 }, children: [" \u00B7 ", m.count, " transaction", m.count > 1 ? 's' : ''] })] }), _jsx("span", { className: "amount-negative", children: formatEur(m.total) })] }), _jsx("div", { style: { background: 'var(--bg3)', borderRadius: 4, height: 6, overflow: 'hidden' }, children: _jsx("div", { style: { width: `${(m.total / max) * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.3s ease' } }) })] }, m.merchant));
                        }) })] })), budgets.length > 0 && (_jsxs("div", { className: "card", style: { marginBottom: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, children: [_jsx("div", { className: "card-title", children: "Budgets" }), onNavigate && (_jsx("button", { onClick: () => onNavigate('budget'), style: { fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }, children: "G\u00E9rer \u2192" }))] }), _jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: budgets.map((b) => {
                            const pct = b.amount > 0 ? Math.min((b.spent / b.amount) * 100, 100) : 0;
                            const over = b.spent > b.amount;
                            const color = over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)';
                            return (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { style: { fontSize: 13, minWidth: 130, flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: b.category }), _jsx("div", { style: { flex: 1, background: 'var(--bg3)', borderRadius: 6, height: 7, overflow: 'hidden' }, children: _jsx("div", { style: { width: `${pct}%`, height: '100%', background: color, borderRadius: 6, transition: 'width 0.3s ease' } }) }), _jsxs("span", { style: { fontSize: 12, color, minWidth: 36, textAlign: 'right', fontWeight: 600 }, children: [pct.toFixed(0), "%"] }), _jsxs("span", { style: { fontSize: 12, color: 'var(--text3)', minWidth: 90, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }, children: [formatEur(b.spent), " / ", formatEur(b.amount)] })] }, b.id));
                        }) })] }))] }));
}
