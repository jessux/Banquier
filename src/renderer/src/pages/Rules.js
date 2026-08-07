import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import CategoryPicker from '../components/CategoryPicker';
const COMMON_CATEGORIES = [
    'Alimentation', 'Logement', 'Transport', 'Restaurants', 'Loisirs',
    'Santé', 'Shopping', 'Abonnements', 'Épargne', 'Salaire', 'Autre'
];
export default function Rules() {
    const [rules, setRules] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [adding, setAdding] = useState(false);
    const [newRule, setNewRule] = useState({ pattern: '', category: '' });
    const [toast, setToast] = useState(null);
    const [applying, setApplying] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const patternInputRef = useRef(null);
    const newPatternRef = useRef(null);
    const load = async () => {
        setLoading(true);
        const [r, existing, paths] = await Promise.all([
            window.api.getCategoryRulesAll(),
            window.api.getCategories(),
            window.api.getCategoryPaths()
        ]);
        setRules(r);
        setCategories([...new Set([...paths, ...existing])].sort());
        setLoading(false);
    };
    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (editing)
            setTimeout(() => patternInputRef.current?.focus(), 0);
    }, [editing?.id]);
    useEffect(() => {
        if (adding)
            setTimeout(() => newPatternRef.current?.focus(), 0);
    }, [adding]);
    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };
    const deleteRule = async (id) => {
        await window.api.deleteCategoryRule(id);
        setRules((prev) => prev.filter((r) => r.id !== id));
        showToast('Règle supprimée');
    };
    const saveEdit = async () => {
        if (!editing || !editing.pattern.trim() || !editing.category.trim())
            return;
        await window.api.updateCategoryRule(editing.id, editing.pattern.trim(), editing.category.trim());
        setRules((prev) => prev.map((r) => r.id === editing.id ? { ...r, pattern: editing.pattern.trim(), category: editing.category.trim() } : r));
        setEditing(null);
        showToast('Règle mise à jour');
    };
    const addRule = async () => {
        if (!newRule.pattern.trim() || !newRule.category.trim())
            return;
        await window.api.upsertCategoryRule(newRule.pattern.trim(), newRule.category.trim());
        setAdding(false);
        setNewRule({ pattern: '', category: '' });
        await load();
        showToast('Règle ajoutée');
    };
    const applyAll = async () => {
        setApplying(true);
        const allTx = await window.api.getTransactions({});
        let count = 0;
        for (const tx of allTx) {
            for (const rule of rules) {
                try {
                    if (new RegExp(rule.pattern, 'i').test(tx.description)) {
                        if (tx.category !== rule.category) {
                            await window.api.updateTransactionCategory(tx.id, rule.category);
                            count++;
                        }
                        break;
                    }
                }
                catch { /* invalid regex */ }
            }
        }
        setApplying(false);
        showToast(`${count} transaction(s) mises à jour`);
    };
    const allCats = [...new Set([...COMMON_CATEGORIES, ...categories])].sort();
    // Catégories réellement présentes dans les règles, pour le filtre.
    const ruleCategories = [...new Set(rules.map((r) => r.category))].sort();
    // On conserve l'index d'origine (l'ordre = priorité des règles).
    const q = search.trim().toLowerCase();
    const filteredRules = rules
        .map((rule, idx) => ({ rule, idx }))
        .filter(({ rule }) => {
        const matchesSearch = !q || rule.pattern.toLowerCase().includes(q) || rule.category.toLowerCase().includes(q);
        const matchesCat = !filterCat || rule.category === filterCat;
        return matchesSearch && matchesCat;
    });
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "R\u00E8gles automatiques" }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center' }, children: [_jsxs("button", { className: "btn btn-secondary", onClick: applyAll, disabled: applying || rules.length === 0, children: [applying ? _jsx("span", { className: "spinner" }) : '▶', " Appliquer toutes les r\u00E8gles"] }), _jsx("button", { className: "btn btn-primary", onClick: () => { setAdding(true); setEditing(null); }, children: "+ Nouvelle r\u00E8gle" })] })] }), _jsx("p", { className: "text-muted text-sm", style: { marginBottom: 16 }, children: "Les r\u00E8gles sont appliqu\u00E9es automatiquement \u00E0 chaque import. L'ordre est important \u2014 la premi\u00E8re r\u00E8gle qui correspond est utilis\u00E9e." }), !loading && rules.length > 0 && (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }, children: [_jsxs("div", { style: { position: 'relative', flex: 1, minWidth: 220 }, children: [_jsx("span", { style: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', fontSize: 13, pointerEvents: 'none' }, children: "\uD83D\uDD0D" }), _jsx("input", { value: search, onChange: (e) => setSearch(e.target.value), placeholder: "Rechercher un pattern ou une cat\u00E9gorie\u2026", style: { width: '100%', paddingLeft: 34, fontSize: 13 } })] }), _jsxs("select", { value: filterCat, onChange: (e) => setFilterCat(e.target.value), style: {
                            padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)',
                            background: 'var(--bg2)', color: filterCat ? 'var(--text)' : 'var(--text2)', fontSize: 13, cursor: 'pointer'
                        }, children: [_jsx("option", { value: "", children: "Toutes les cat\u00E9gories" }), ruleCategories.map((cat) => (_jsx("option", { value: cat, children: cat }, cat)))] }), (search || filterCat) && (_jsxs(_Fragment, { children: [_jsxs("span", { className: "text-muted text-sm", style: { whiteSpace: 'nowrap' }, children: [filteredRules.length, " / ", rules.length] }), _jsx("button", { className: "btn btn-secondary", style: { padding: '6px 12px', fontSize: 12 }, onClick: () => { setSearch(''); setFilterCat(''); }, children: "R\u00E9initialiser" })] }))] })), adding && (_jsxs("div", { style: {
                    background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10,
                    padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap'
                }, children: [_jsx("span", { style: { fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }, children: "Nouvelle r\u00E8gle :" }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }, children: "Regex :" }), _jsx("input", { ref: newPatternRef, value: newRule.pattern, onChange: (e) => setNewRule((p) => ({ ...p, pattern: e.target.value })), style: { flex: 1, fontFamily: 'monospace', fontSize: 12 }, placeholder: "ex: SNCF.*", onKeyDown: (e) => { if (e.key === 'Enter')
                                    addRule(); if (e.key === 'Escape')
                                    setAdding(false); } })] }), _jsx(CategoryPicker, { value: newRule.category, onChange: (v) => setNewRule((p) => ({ ...p, category: v })), categories: allCats, placeholder: "Cat\u00E9gorie", style: { width: 180 } }), _jsx("button", { className: "btn btn-primary", onClick: addRule, disabled: !newRule.pattern.trim() || !newRule.category.trim(), children: "Ajouter" }), _jsx("button", { className: "btn btn-secondary", onClick: () => setAdding(false), children: "\u2715" })] })), toast && (_jsx("div", { style: {
                    position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
                    background: 'var(--green)', color: '#fff', borderRadius: 8,
                    padding: '10px 18px', fontSize: 13, fontWeight: 500,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                }, children: toast })), loading ? (_jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 32, height: 32, margin: '0 auto' } }) })) : rules.length === 0 ? (_jsxs("div", { className: "empty-state", children: [_jsx("p", { children: "Aucune r\u00E8gle d\u00E9finie." }), _jsx("p", { className: "text-muted text-sm", children: "Cr\u00E9ez des r\u00E8gles pour cat\u00E9goriser automatiquement les transactions lors de l'import." })] })) : filteredRules.length === 0 ? (_jsxs("div", { className: "empty-state", children: [_jsx("p", { children: "Aucune r\u00E8gle ne correspond." }), _jsx("p", { className: "text-muted text-sm", children: "Modifiez votre recherche ou le filtre par cat\u00E9gorie." })] })) : (_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { width: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }, children: "#" }), _jsx("th", { children: "Pattern (Regex)" }), _jsx("th", { children: "Cat\u00E9gorie" }), _jsx("th", { style: { width: 100 } })] }) }), _jsx("tbody", { children: filteredRules.map(({ rule, idx }) => (_jsxs("tr", { children: [_jsx("td", { style: { textAlign: 'center', color: 'var(--text3)', fontSize: 12 }, children: idx + 1 }), _jsx("td", { children: editing?.id === rule.id ? (_jsx("input", { ref: patternInputRef, value: editing.pattern, onChange: (e) => setEditing((p) => p ? { ...p, pattern: e.target.value } : null), style: { fontFamily: 'monospace', fontSize: 12, width: '100%' }, onKeyDown: (e) => { if (e.key === 'Enter')
                                                saveEdit(); if (e.key === 'Escape')
                                                setEditing(null); } })) : (_jsx("code", { style: { fontFamily: 'monospace', fontSize: 12, color: '#a78bfa' }, children: rule.pattern })) }), _jsx("td", { children: editing?.id === rule.id ? (_jsx(CategoryPicker, { value: editing.category, onChange: (v) => setEditing((p) => p ? { ...p, category: v } : null), categories: allCats, placeholder: "Cat\u00E9gorie", style: { width: 180 }, onConfirm: saveEdit, onCancel: () => setEditing(null) })) : (_jsx("span", { style: {
                                                display: 'inline-block', fontSize: 12, fontWeight: 500,
                                                background: 'rgba(99,102,241,0.12)', color: 'var(--accent-light)',
                                                borderRadius: 4, padding: '2px 8px'
                                            }, children: rule.category })) }), _jsx("td", { children: editing?.id === rule.id ? (_jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { className: "btn btn-primary", style: { padding: '4px 10px', fontSize: 12 }, onClick: saveEdit, children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => setEditing(null), children: "\u2715" })] })) : (_jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12 }, onClick: () => { setEditing({ id: rule.id, pattern: rule.pattern, category: rule.category }); setAdding(false); }, children: "Modifier" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)' }, onClick: () => deleteRule(rule.id), children: "Supprimer" })] })) })] }, rule.id))) })] }) }))] }));
}
