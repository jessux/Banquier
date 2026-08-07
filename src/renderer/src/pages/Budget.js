import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
const MONTH_NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
function monthBounds(offset) {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth() + offset;
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0);
    const isCurrentMonth = offset === 0;
    const endDate = isCurrentMonth ? today.toISOString().slice(0, 10) : end.toISOString().slice(0, 10);
    const d = new Date(y, m, 1);
    return {
        startDate: start.toISOString().slice(0, 10),
        endDate,
        label: `${MONTH_NAMES[((m % 12) + 12) % 12]} ${d.getFullYear()}`
    };
}
function fmt(n) {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
}
function ProgressBar({ pct, over }) {
    const filled = Math.min(pct, 100);
    return (_jsx("div", { style: { background: 'var(--bg3)', borderRadius: 6, height: 8, overflow: 'hidden', flex: 1 }, children: _jsx("div", { style: {
                width: `${filled}%`, height: '100%', borderRadius: 6,
                background: over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)',
                transition: 'width 0.4s ease'
            } }) }));
}
export default function BudgetPage() {
    const [budgets, setBudgets] = useState([]);
    const [categories, setCategories] = useState([]);
    const [monthOffset, setMonthOffset] = useState(0);
    const [loading, setLoading] = useState(true);
    const [newCat, setNewCat] = useState('');
    const [newAmt, setNewAmt] = useState('');
    const [adding, setAdding] = useState(false);
    const [suggestion, setSuggestion] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editAmt, setEditAmt] = useState('');
    const { startDate, endDate, label } = monthBounds(monthOffset);
    const load = () => {
        setLoading(true);
        Promise.all([
            window.api.getBudgetsWithSpent(startDate, endDate),
            window.api.getCategoryPaths()
        ]).then(([b, cats]) => {
            setBudgets(b);
            const existingCats = b.map((x) => x.category);
            setCategories(cats.filter((c) => !existingCats.includes(c)).sort());
            setLoading(false);
        });
    };
    useEffect(() => { load(); }, [startDate, endDate]);
    const selectCategory = async (cat) => {
        setNewCat(cat);
        if (!cat) {
            setSuggestion(null);
            return;
        }
        const res = await window.api.getCategoryMonthlyAverage(cat, 3);
        setSuggestion(res.monthsWithData > 0 ? res : null);
        if (res.monthsWithData > 0)
            setNewAmt(String(Math.round(res.average)));
    };
    const addBudget = async () => {
        const amt = parseFloat(newAmt.replace(',', '.'));
        if (!newCat || isNaN(amt) || amt <= 0)
            return;
        await window.api.upsertBudget(newCat, amt);
        setNewCat('');
        setNewAmt('');
        setSuggestion(null);
        setAdding(false);
        load();
    };
    const saveEdit = async (id, category) => {
        const amt = parseFloat(editAmt.replace(',', '.'));
        if (isNaN(amt) || amt <= 0)
            return;
        await window.api.upsertBudget(category, amt);
        setEditingId(null);
        load();
    };
    const deleteBudget = async (id) => {
        await window.api.deleteBudget(id);
        load();
    };
    const totalBudget = budgets.reduce((s, b) => s + b.amount, 0);
    const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
    const overCount = budgets.filter((b) => b.spent > b.amount).length;
    const arrowBtn = (dir) => (_jsx("button", { onClick: () => setMonthOffset((o) => o + dir), disabled: dir === 1 && monthOffset >= 0, style: {
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            cursor: dir === 1 && monthOffset >= 0 ? 'default' : 'pointer',
            background: 'var(--bg3)', color: dir === 1 && monthOffset >= 0 ? '#3e4259' : 'var(--text2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0
        }, children: dir === -1 ? '‹' : '›' }));
    return (_jsxs("div", { style: { maxWidth: 700 }, children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Budgets" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [arrowBtn(-1), _jsx("span", { style: { fontSize: 14, fontWeight: 500, minWidth: 130, textAlign: 'center' }, children: label }), arrowBtn(1)] })] }), budgets.length > 0 && (_jsxs("div", { className: "grid-3", style: { marginBottom: 24 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Budget total" }), _jsx("div", { className: "card-value", children: fmt(totalBudget) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "D\u00E9pens\u00E9" }), _jsx("div", { className: `card-value ${totalSpent > totalBudget ? 'negative' : ''}`, children: fmt(totalSpent) })] }), _jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", children: "Restant" }), _jsx("div", { className: `card-value ${totalBudget - totalSpent < 0 ? 'negative' : 'positive'}`, children: fmt(totalBudget - totalSpent) }), overCount > 0 && (_jsxs("div", { style: { fontSize: 12, color: 'var(--red)', marginTop: 6 }, children: [overCount, " cat\u00E9gorie", overCount > 1 ? 's' : '', " d\u00E9pass\u00E9e", overCount > 1 ? 's' : ''] }))] })] })), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }, children: [_jsx("h3", { children: "Cat\u00E9gories" }), _jsx("button", { className: "btn btn-primary", style: { fontSize: 13 }, onClick: () => setAdding(true), children: "+ Ajouter" })] }), loading ? (_jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 28, height: 28, margin: '0 auto' } }) })) : budgets.length === 0 && !adding ? (_jsxs("div", { className: "empty-state", style: { padding: 32 }, children: [_jsx("p", { style: { fontSize: 15, marginBottom: 8 }, children: "Aucun budget d\u00E9fini" }), _jsx("p", { className: "text-muted text-sm", children: "D\u00E9finissez un plafond mensuel par cat\u00E9gorie pour suivre vos d\u00E9penses." }), _jsx("button", { className: "btn btn-primary", style: { marginTop: 16 }, onClick: () => setAdding(true), children: "+ Cr\u00E9er mon premier budget" })] })) : (_jsx("div", { style: { display: 'flex', flexDirection: 'column', gap: 14 }, children: budgets.map((b) => {
                            const pct = b.amount > 0 ? (b.spent / b.amount) * 100 : 0;
                            const over = b.spent > b.amount;
                            const isEditing = editingId === b.id;
                            return (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 6 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("span", { style: { fontWeight: 500, fontSize: 14, minWidth: 140, flex: '0 0 auto' }, children: b.category }), _jsx(ProgressBar, { pct: pct, over: over }), isEditing ? (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }, children: [_jsx("input", { autoFocus: true, type: "number", value: editAmt, onChange: (e) => setEditAmt(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                                            saveEdit(b.id, b.category); if (e.key === 'Escape')
                                                            setEditingId(null); }, style: { width: 90, padding: '3px 8px', fontSize: 13 }, placeholder: "Montant" }), _jsx("button", { className: "btn btn-primary", style: { padding: '3px 10px', fontSize: 12 }, onClick: () => saveEdit(b.id, b.category), children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 8px', fontSize: 12 }, onClick: () => setEditingId(null), children: "\u2715" })] })) : (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }, children: [_jsxs("span", { style: { fontSize: 13, color: over ? 'var(--red)' : 'var(--text)', fontVariantNumeric: 'tabular-nums', minWidth: 110, textAlign: 'right' }, children: [fmt(b.spent), " / ", fmt(b.amount)] }), _jsxs("span", { style: {
                                                            fontSize: 11, fontWeight: 600, minWidth: 42, textAlign: 'right',
                                                            color: over ? 'var(--red)' : pct > 80 ? 'var(--yellow)' : 'var(--green)'
                                                        }, children: [pct.toFixed(0), "%"] }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 10px', fontSize: 12 }, onClick: () => { setEditingId(b.id); setEditAmt(String(b.amount)); }, children: "Modifier" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 8px', fontSize: 12, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }, onClick: () => deleteBudget(b.id), children: "\u2715" })] }))] }), over && (_jsxs("div", { style: { fontSize: 11, color: 'var(--red)', paddingLeft: 150 }, children: ["D\u00E9passement de ", fmt(b.spent - b.amount)] }))] }, b.id));
                        }) })), adding && (_jsxs("div", { style: {
                            marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)',
                            display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap'
                        }, children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: '1 1 200px' }, children: [_jsx("label", { style: { fontSize: 12 }, children: "Cat\u00E9gorie" }), _jsxs("select", { value: newCat, onChange: (e) => selectCategory(e.target.value), style: { fontSize: 13 }, children: [_jsx("option", { value: "", children: "\u2014 Choisir \u2014" }), categories.map((c) => _jsx("option", { value: c, children: c }, c))] })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: '0 0 140px' }, children: [_jsx("label", { style: { fontSize: 12 }, children: "Plafond mensuel (\u20AC)" }), _jsx("input", { type: "number", value: newAmt, onChange: (e) => setNewAmt(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                            addBudget(); if (e.key === 'Escape')
                                            setAdding(false); }, placeholder: "300", style: { fontSize: 13 } })] }), _jsxs("div", { style: { display: 'flex', gap: 8, paddingBottom: 1 }, children: [_jsx("button", { className: "btn btn-primary", onClick: addBudget, disabled: !newCat || !newAmt, children: "Ajouter" }), _jsx("button", { className: "btn btn-secondary", onClick: () => { setAdding(false); setNewCat(''); setNewAmt(''); setSuggestion(null); }, children: "Annuler" })] }), suggestion && (_jsxs("div", { style: { flexBasis: '100%', fontSize: 12, color: 'var(--accent-light)' }, children: ["\uD83D\uDCA1 Montant pr\u00E9-rempli d'apr\u00E8s votre moyenne : ", fmt(suggestion.average), "/mois", ' ', "sur ", suggestion.monthsWithData === 1 ? 'le dernier mois' : `les ${suggestion.monthsWithData} derniers mois`, "."] }))] }))] })] }));
}
