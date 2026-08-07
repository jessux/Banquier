import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function fmt(d) {
    return d.toISOString().slice(0, 10);
}
function monthBounds(offset) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + offset;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const isCurrentMonth = offset === 0;
    const d = new Date(y, m, 1);
    return {
        start: fmt(start),
        end: fmt(isCurrentMonth ? today : end),
        label: `${MONTH_NAMES[((m % 12) + 12) % 12]} ${d.getFullYear()}`
    };
}
function yearBounds(offset) {
    const today = new Date();
    const y = today.getFullYear() + offset;
    const start = new Date(y, 0, 1);
    const end = new Date(y, 11, 31);
    const isCurrentYear = offset === 0;
    return {
        start: fmt(start),
        end: fmt(isCurrentYear ? today : end),
        label: String(y)
    };
}
function formatEur(n) {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
export default function Comparaison() {
    const [mode, setMode] = useState('mois');
    const [offset, setOffset] = useState(0);
    const [customAStart, setCustomAStart] = useState('');
    const [customAEnd, setCustomAEnd] = useState('');
    const [customBStart, setCustomBStart] = useState('');
    const [customBEnd, setCustomBEnd] = useState('');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const periodA = mode === 'mois' ? monthBounds(offset - 1) : mode === 'annee' ? yearBounds(offset - 1) : null;
    const periodB = mode === 'mois' ? monthBounds(offset) : mode === 'annee' ? yearBounds(offset) : null;
    const aStart = mode === 'custom' ? customAStart : periodA?.start;
    const aEnd = mode === 'custom' ? customAEnd : periodA?.end;
    const bStart = mode === 'custom' ? customBStart : periodB?.start;
    const bEnd = mode === 'custom' ? customBEnd : periodB?.end;
    useEffect(() => {
        if (!aStart || !aEnd || !bStart || !bEnd) {
            setData(null);
            return;
        }
        setLoading(true);
        window.api.comparePeriods(aStart, aEnd, bStart, bEnd).then((res) => {
            setData(res);
            setLoading(false);
        });
    }, [aStart, aEnd, bStart, bEnd]);
    const modeBar = (_jsx("div", { style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }, children: [
            { key: 'mois', label: 'Mois vs mois précédent' },
            { key: 'annee', label: 'Année vs année précédente' },
            { key: 'custom', label: 'Personnalisé' }
        ].map((m) => (_jsx("button", { onClick: () => { setMode(m.key); setOffset(0); }, style: {
                padding: '5px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: mode === m.key ? 600 : 400,
                background: mode === m.key ? 'var(--accent)' : 'var(--bg3)',
                color: mode === m.key ? '#fff' : 'var(--text2)', transition: 'all 0.15s'
            }, children: m.label }, m.key))) }));
    const total = data ? data.categories.reduce((s, c) => s + c.totalB, 0) : 0;
    const totalPrev = data ? data.categories.reduce((s, c) => s + c.totalA, 0) : 0;
    const totalDiff = total - totalPrev;
    const totalPct = totalPrev > 0 ? (totalDiff / totalPrev) * 100 : null;
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Comparer deux p\u00E9riodes" }), modeBar] }), (mode === 'mois' || mode === 'annee') && periodA && periodB && (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }, children: [_jsx("button", { onClick: () => setOffset((o) => o - 1), style: { width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 14 }, children: "\u2039" }), _jsxs("span", { style: { fontSize: 14 }, children: [_jsx("strong", { children: periodB.label }), " ", _jsx("span", { style: { color: 'var(--text2)' }, children: "vs" }), " ", _jsx("strong", { children: periodA.label })] }), _jsx("button", { onClick: () => setOffset((o) => o + 1), disabled: offset >= 0, style: { width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: offset >= 0 ? 'default' : 'pointer', background: 'var(--bg3)', color: offset >= 0 ? 'var(--border)' : 'var(--text2)', fontSize: 14 }, children: "\u203A" })] })), mode === 'custom' && (_jsxs("div", { style: { display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }, children: [_jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 6 }, children: "P\u00E9riode A" }), _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx("input", { type: "date", value: customAStart, onChange: (e) => setCustomAStart(e.target.value), style: { width: 140 } }), _jsx("span", { style: { color: 'var(--text3)' }, children: "\u2192" }), _jsx("input", { type: "date", value: customAEnd, onChange: (e) => setCustomAEnd(e.target.value), style: { width: 140 } })] })] }), _jsxs("div", { children: [_jsx("div", { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 6 }, children: "P\u00E9riode B" }), _jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx("input", { type: "date", value: customBStart, onChange: (e) => setCustomBStart(e.target.value), style: { width: 140 } }), _jsx("span", { style: { color: 'var(--text3)' }, children: "\u2192" }), _jsx("input", { type: "date", value: customBEnd, onChange: (e) => setCustomBEnd(e.target.value), style: { width: 140 } })] })] })] })), loading ? (_jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 32, height: 32, margin: '0 auto' } }) })) : !data || (mode === 'custom' && (!aStart || !aEnd || !bStart || !bEnd)) ? (_jsx("div", { className: "empty-state", children: _jsx("p", { className: "text-muted", children: "Choisissez deux p\u00E9riodes \u00E0 comparer." }) })) : data.categories.length === 0 ? (_jsx("div", { className: "empty-state", children: _jsx("p", { className: "text-muted", children: "Aucune d\u00E9pense sur ces p\u00E9riodes." }) })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid-3", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "D\u00E9penses \u2014 p\u00E9riode A" }), _jsx("div", { className: "card-value", children: formatEur(totalPrev) }), _jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [data.periodA.startDate, " \u2192 ", data.periodA.endDate] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "D\u00E9penses \u2014 p\u00E9riode B" }), _jsx("div", { className: "card-value", children: formatEur(total) }), _jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [data.periodB.startDate, " \u2192 ", data.periodB.endDate] })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "\u00C9cart" }), _jsxs("div", { className: `card-value ${totalDiff > 0 ? 'negative' : totalDiff < 0 ? 'positive' : ''}`, children: [totalDiff >= 0 ? '+' : '', formatEur(totalDiff)] }), totalPct !== null && (_jsxs("div", { className: "text-muted text-sm", style: { marginTop: 6 }, children: [totalDiff >= 0 ? '+' : '', totalPct.toFixed(1), " %"] }))] })] }), _jsx("div", { className: "card-title", style: { marginBottom: 12 }, children: "\u00C9cart par cat\u00E9gorie" }), _jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Cat\u00E9gorie" }), _jsx("th", { style: { textAlign: 'right' }, children: "P\u00E9riode A" }), _jsx("th", { style: { textAlign: 'right' }, children: "P\u00E9riode B" }), _jsx("th", { style: { textAlign: 'right' }, children: "\u00C9cart" }), _jsx("th", { style: { textAlign: 'right' }, children: "%" })] }) }), _jsx("tbody", { children: data.categories.map((c) => (_jsxs("tr", { children: [_jsx("td", { children: c.category }), _jsx("td", { style: { textAlign: 'right', color: 'var(--text2)' }, children: formatEur(c.totalA) }), _jsx("td", { style: { textAlign: 'right', color: 'var(--text2)' }, children: formatEur(c.totalB) }), _jsxs("td", { style: { textAlign: 'right' }, className: c.diff > 0 ? 'amount-negative' : c.diff < 0 ? 'amount-positive' : undefined, children: [c.diff >= 0 ? '+' : '', formatEur(c.diff)] }), _jsx("td", { style: { textAlign: 'right', color: c.diff > 0 ? 'var(--red)' : c.diff < 0 ? 'var(--green)' : 'var(--text3)' }, children: c.pct !== null ? `${c.diff >= 0 ? '+' : ''}${c.pct.toFixed(0)}%` : '—' })] }, c.category))) })] }) })] }))] }));
}
