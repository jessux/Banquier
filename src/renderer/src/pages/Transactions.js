import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import CategoryPicker from '../components/CategoryPicker';
import { categoryBadgeStyle } from '../utils/categoryColor';
const PAGE_SIZE = 75;
function formatEur(n) {
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}
const COMMON_CATEGORIES = [
    'Alimentation', 'Logement', 'Transport', 'Restaurants', 'Loisirs',
    'Santé', 'Shopping', 'Abonnements', 'Épargne', 'Salaire', 'Autre'
];
function autoPattern(description) {
    return description
        .replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
        .replace(/\d+/g, '\\d+');
}
export default function Transactions({ onImport, initialUncategorized }) {
    const [transactions, setTransactions] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(0);
    const [loading, setLoading] = useState(true);
    // Filters
    const [search, setSearch] = useState('');
    const [category, setCategory] = useState(initialUncategorized ? '__none__' : '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [tagsFilter, setTagsFilter] = useState('');
    const [internalFilter, setInternalFilter] = useState('all');
    const [showAdvanced, setShowAdvanced] = useState(false);
    // Sort (DB-side)
    const [sortField, setSortField] = useState('date');
    const [sortDir, setSortDir] = useState('desc');
    // Data
    const [categories, setCategories] = useState([]);
    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState(null);
    const [monthOffset, setMonthOffset] = useState(null);
    // Edit states
    const [categorizing, setCategorizing] = useState(false);
    const [catProgress, setCatProgress] = useState(null);
    const [proposals, setProposals] = useState(null);
    const [applyingProposals, setApplyingProposals] = useState(false);
    const [editing, setEditing] = useState(null);
    const [newCategory, setNewCategory] = useState('');
    const [regexPanel, setRegexPanel] = useState(null);
    const [toast, setToast] = useState(null);
    const [duplicates, setDuplicates] = useState(null);
    const [checkingDuplicates, setCheckingDuplicates] = useState(false);
    const [editingNote, setEditingNote] = useState(null);
    const editRef = useRef(null);
    const patternRef = useRef(null);
    const debounceRef = useRef(null);
    const searchRef = useRef(null);
    const buildFilters = (currentPage = page) => ({
        search: search || undefined,
        category: category || undefined,
        accountId: accountId ?? undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        minAmount: minAmount !== '' ? parseFloat(minAmount) : undefined,
        maxAmount: maxAmount !== '' ? parseFloat(maxAmount) : undefined,
        tags: tagsFilter || undefined,
        isInternal: internalFilter === 'all' ? undefined : internalFilter === 'internal',
        sortField,
        sortDir,
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE,
    });
    const load = (currentPage = page) => {
        setLoading(true);
        const filters = buildFilters(currentPage);
        const countFilters = { ...filters, limit: undefined, offset: undefined };
        Promise.all([
            window.api.getTransactions(filters),
            window.api.countTransactions(countFilters),
        ]).then(([txs, count]) => {
            setTransactions(txs);
            setTotalCount(count);
            setLoading(false);
        });
    };
    const resetAndLoad = () => {
        setPage(0);
        load(0);
    };
    useEffect(() => {
        Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
            setCategories([...new Set([...paths, ...existing])].sort());
        });
        window.api.getAccounts().then(setAccounts);
    }, []);
    // Raccourci clavier "/" : focus la recherche, sauf si un champ est déjà en cours d'édition.
    useEffect(() => {
        const handler = (e) => {
            if (e.key !== '/')
                return;
            const target = e.target;
            const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
            if (isEditable)
                return;
            e.preventDefault();
            searchRef.current?.focus();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);
    // Reload when filters or sort change — reset to page 0
    useEffect(() => { resetAndLoad(); }, [search, category, accountId, startDate, endDate, minAmount, maxAmount, tagsFilter, internalFilter, sortField, sortDir]);
    // Reload when page changes (without resetting)
    useEffect(() => { load(page); }, [page]);
    useEffect(() => {
        if (!editing)
            return;
        const id = setTimeout(() => editRef.current?.focus(), 0);
        return () => clearTimeout(id);
    }, [editing]);
    useEffect(() => {
        if (!regexPanel)
            return;
        const id = setTimeout(() => patternRef.current?.focus(), 0);
        return () => clearTimeout(id);
    }, [regexPanel !== null]);
    useEffect(() => {
        if (!regexPanel)
            return;
        if (debounceRef.current)
            clearTimeout(debounceRef.current);
        setRegexPanel((p) => p ? { ...p, checking: true, matchCount: null } : null);
        debounceRef.current = setTimeout(async () => {
            try {
                const count = await window.api.countPattern(regexPanel.pattern);
                setRegexPanel((p) => p ? { ...p, matchCount: count, checking: false } : null);
            }
            catch {
                setRegexPanel((p) => p ? { ...p, matchCount: null, checking: false } : null);
            }
        }, 350);
        return () => { if (debounceRef.current)
            clearTimeout(debounceRef.current); };
    }, [regexPanel?.pattern]);
    const startEdit = (tx) => {
        setRegexPanel(null);
        setEditing({ id: tx.id, currentCategory: tx.category });
        setNewCategory(tx.category || '');
    };
    const commitEdit = (id, cat) => {
        setEditing(null);
        const isIntern = cat.toLowerCase().includes('intern');
        setTransactions((prev) => prev.map((tx) => tx.id === id ? { ...tx, category: cat, is_internal: isIntern ? 1 : tx.is_internal } : tx));
        window.api.updateTransactionCategory(id, cat)
            .then(() => isIntern ? window.api.setTransactionInternal(id, true) : Promise.resolve())
            .then(() => {
            load();
            Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
                setCategories([...new Set([...paths, ...existing])].sort());
            });
        });
    };
    const openRegexPanel = (tx) => {
        setEditing(null);
        setRegexPanel({
            category: newCategory || tx.category || '',
            pattern: autoPattern(tx.description),
            matchCount: null,
            checking: true
        });
    };
    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3000);
    };
    const applyRegex = () => {
        if (!regexPanel)
            return;
        const { category: cat, pattern } = regexPanel;
        setRegexPanel(null);
        window.api.applyCategoryPattern(cat, pattern).then((updated) => {
            load();
            Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
                setCategories([...new Set([...paths, ...existing])].sort());
            });
            showToast(`${updated} transaction(s) catégorisée(s) en "${cat}"`);
        });
    };
    const runAiCategorization = async (onlyUncategorized) => {
        setCategorizing(true);
        setCatProgress({ done: 0, total: 0 });
        try {
            const result = await window.api.categorizeAi(onlyUncategorized, (done, total) => {
                setCatProgress({ done, total });
            });
            load();
            Promise.all([window.api.getCategories(), window.api.getCategoryPaths()]).then(([existing, paths]) => {
                setCategories([...new Set([...paths, ...existing])].sort());
            });
            if (result.proposals.length === 0) {
                alert('Aucune nouvelle suggestion de catégorie (règles déjà appliquées).');
            }
            else {
                setProposals(result.proposals.map((p) => ({ ...p, accepted: true })));
            }
        }
        catch (e) {
            alert(`Erreur : ${String(e)}`);
        }
        finally {
            setCategorizing(false);
            setCatProgress(null);
        }
    };
    const applyProposals = async () => {
        if (!proposals)
            return;
        const updates = proposals.filter((p) => p.accepted).map(({ id, category }) => ({ id, category }));
        setApplyingProposals(true);
        try {
            await window.api.applyCategorization(updates);
            setProposals(null);
            load();
            showToast(`${updates.length} transaction(s) catégorisée(s)`);
        }
        finally {
            setApplyingProposals(false);
        }
    };
    const checkDuplicates = async () => {
        setCheckingDuplicates(true);
        const groups = await window.api.findDuplicates();
        setDuplicates(groups.map((txs) => ({ transactions: txs })));
        setCheckingDuplicates(false);
    };
    const deleteDuplicate = async (id, groupIdx) => {
        await window.api.deleteTransaction(id);
        setDuplicates((prev) => {
            if (!prev)
                return prev;
            return prev.map((g, i) => i !== groupIdx ? g : { transactions: g.transactions.filter((t) => t.id !== id) }).filter((g) => g.transactions.length > 1);
        });
        load();
        showToast('Transaction supprimée');
    };
    const saveNote = async () => {
        if (!editingNote)
            return;
        await window.api.setTransactionNote(editingNote.id, editingNote.note || null);
        await window.api.setTransactionTags(editingNote.id, editingNote.tags || null);
        setEditingNote(null);
        load();
    };
    const toggleSort = (field) => {
        if (sortField === field)
            setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
        else {
            setSortField(field);
            setSortDir('desc');
        }
    };
    const applyMonth = (offset) => {
        const now = new Date();
        const y = now.getFullYear(), m = now.getMonth() + offset;
        const first = new Date(y, m, 1);
        const last = new Date(y, m + 1, 0);
        const fmt = (d) => d.toISOString().slice(0, 10);
        setStartDate(fmt(first));
        setEndDate(fmt(offset === 0 ? now : last));
        setMonthOffset(offset);
    };
    const clearMonth = () => { setStartDate(''); setEndDate(''); setMonthOffset(null); };
    const monthLabel = (offset) => {
        const NAMES = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return `${NAMES[d.getMonth()]} ${d.getFullYear()}`;
    };
    const hasAdvancedFilter = minAmount !== '' || maxAmount !== '' || tagsFilter !== '';
    const totalPages = Math.ceil(totalCount / PAGE_SIZE);
    const hasFilters = search || category || accountId !== null || startDate || endDate || internalFilter !== 'all' || hasAdvancedFilter;
    const SortHeader = ({ field, label, align }) => (_jsxs("th", { onClick: () => toggleSort(field), style: { cursor: 'pointer', userSelect: 'none', textAlign: align, whiteSpace: 'nowrap' }, children: [label, ' ', _jsx("span", { style: { color: sortField === field ? 'var(--accent)' : 'var(--border)', fontSize: 10 }, children: sortField === field ? (sortDir === 'asc' ? '▲' : '▼') : '⇅' })] }));
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Transactions" }), _jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx("button", { className: "btn btn-primary", onClick: onImport, children: "\uD83D\uDCE5 Importer" }), catProgress && catProgress.total > 0 && (_jsxs("span", { className: "text-muted text-sm", children: [_jsx("span", { className: "spinner", style: { marginRight: 6 } }), catProgress.done, "/", catProgress.total] })), _jsxs("button", { className: "btn btn-secondary", onClick: () => runAiCategorization(true), disabled: categorizing, title: "Propose une cat\u00E9gorie (via recherche web) pour les transactions sans cat\u00E9gorie, \u00E0 valider ensuite", children: [categorizing ? _jsx("span", { className: "spinner" }) : '🤖', " Cat\u00E9goriser non cat\u00E9goris\u00E9es"] }), _jsx("button", { className: "btn btn-secondary", onClick: () => runAiCategorization(false), disabled: categorizing, children: "\u21BA Tout recat\u00E9goriser" }), _jsxs("button", { className: "btn btn-secondary", onClick: checkDuplicates, disabled: checkingDuplicates, children: [checkingDuplicates ? _jsx("span", { className: "spinner" }) : '🔍', " V\u00E9rifier doublons"] }), _jsxs("span", { className: "text-muted", children: [totalCount, " r\u00E9sultat", totalCount > 1 ? 's' : ''] })] })] }), _jsxs("div", { className: "filters-bar", children: [_jsx("input", { ref: searchRef, placeholder: "Rechercher... (/)", value: search, onChange: (e) => setSearch(e.target.value), style: { minWidth: 200 } }), _jsxs("select", { value: category, onChange: (e) => setCategory(e.target.value), children: [_jsx("option", { value: "", children: "Toutes les cat\u00E9gories" }), _jsx("option", { value: "__none__", children: "\u2014 Sans cat\u00E9gorie" }), categories.map((c) => _jsx("option", { value: c, children: c }, c))] }), accounts.length > 0 && (_jsxs("select", { value: accountId ?? '', onChange: (e) => setAccountId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Tous les comptes" }), accounts.map((a) => _jsx("option", { value: a.id, children: a.name }, a.id))] })), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 2, background: 'var(--bg2)', borderRadius: 20, padding: '3px 6px', border: monthOffset !== null ? '1px solid var(--accent)' : '1px solid var(--border)' }, children: [_jsx("button", { onClick: () => applyMonth((monthOffset ?? 0) - 1), style: { width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--text2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "\u2039" }), _jsx("span", { onClick: () => monthOffset === null ? applyMonth(0) : clearMonth(), style: { fontSize: 13, color: monthOffset !== null ? 'var(--text)' : 'var(--text3)', minWidth: 110, textAlign: 'center', cursor: 'pointer', fontWeight: monthOffset !== null ? 500 : 400, userSelect: 'none' }, children: monthOffset !== null ? monthLabel(monthOffset) : 'Mois…' }), _jsx("button", { onClick: () => applyMonth((monthOffset ?? 0) + 1), disabled: monthOffset !== null && monthOffset >= 0, style: { width: 26, height: 26, borderRadius: '50%', border: 'none', cursor: monthOffset !== null && monthOffset >= 0 ? 'default' : 'pointer', background: 'transparent', color: monthOffset !== null && monthOffset >= 0 ? '#3e4259' : 'var(--text2)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }, children: "\u203A" })] }), _jsx("input", { type: "date", value: startDate, onChange: (e) => { setStartDate(e.target.value); setMonthOffset(null); }, style: { width: 140 } }), _jsx("input", { type: "date", value: endDate, onChange: (e) => { setEndDate(e.target.value); setMonthOffset(null); }, style: { width: 140 } }), _jsxs("select", { value: internalFilter, onChange: (e) => setInternalFilter(e.target.value), style: { width: 160 }, children: [_jsx("option", { value: "all", children: "Toutes" }), _jsx("option", { value: "external", children: "Hors internes" }), _jsx("option", { value: "internal", children: "Internes uniquement" })] }), _jsxs("button", { className: "btn btn-secondary", style: { fontSize: 12, borderColor: hasAdvancedFilter ? 'var(--accent)' : undefined, color: hasAdvancedFilter ? 'var(--accent-light)' : undefined }, onClick: () => setShowAdvanced((v) => !v), children: [showAdvanced ? '▲' : '▼', " Filtres avanc\u00E9s", hasAdvancedFilter ? ' •' : ''] }), hasFilters && (_jsx("button", { className: "btn btn-secondary", onClick: () => {
                            setSearch('');
                            setCategory('');
                            setAccountId(null);
                            setStartDate('');
                            setEndDate('');
                            setInternalFilter('all');
                            setMonthOffset(null);
                            setMinAmount('');
                            setMaxAmount('');
                            setTagsFilter('');
                        }, children: "Effacer filtres" })), category && (_jsxs("button", { className: "btn btn-secondary", style: { fontSize: 12, color: 'var(--accent)', borderColor: 'var(--accent)' }, onClick: async () => {
                            const allInternal = transactions.every((t) => t.is_internal === 1);
                            await window.api.setInternalByCategory(category, !allInternal);
                            load();
                        }, children: ["\u21C4 ", transactions.every((t) => t.is_internal === 1) ? 'Marquer externes' : 'Marquer internes'] }))] }), showAdvanced && (_jsxs("div", { style: { display: 'flex', gap: 10, padding: '10px 0', alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--text3)' }, children: "Montant :" }), _jsx("input", { type: "number", value: minAmount, onChange: (e) => setMinAmount(e.target.value), placeholder: "Min", style: { width: 90 } }), _jsx("span", { style: { fontSize: 12, color: 'var(--text3)' }, children: "\u2192" }), _jsx("input", { type: "number", value: maxAmount, onChange: (e) => setMaxAmount(e.target.value), placeholder: "Max", style: { width: 90 } }), _jsx("span", { style: { fontSize: 12, color: 'var(--text3)', marginLeft: 12 }, children: "Tag :" }), _jsx("input", { value: tagsFilter, onChange: (e) => setTagsFilter(e.target.value), placeholder: "remboursement\u2026", style: { width: 160 } })] })), proposals !== null && (_jsxs("div", { style: { background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }, children: [_jsxs("span", { style: { fontSize: 14, fontWeight: 600, color: 'var(--accent-light)' }, children: ["\uD83C\uDF10 ", proposals.length, " suggestion(s) de cat\u00E9gorie (recherche web) \u2014 ", proposals.filter((p) => p.accepted).length, " s\u00E9lectionn\u00E9e(s)"] }), _jsxs("div", { style: { display: 'flex', gap: 8 }, children: [_jsx("button", { className: "btn btn-secondary", onClick: () => setProposals((prev) => prev?.map((p) => ({ ...p, accepted: true })) ?? null), children: "Tout cocher" }), _jsx("button", { className: "btn btn-secondary", onClick: () => setProposals((prev) => prev?.map((p) => ({ ...p, accepted: false })) ?? null), children: "Tout d\u00E9cocher" }), _jsxs("button", { className: "btn btn-primary", onClick: applyProposals, disabled: applyingProposals || proposals.every((p) => !p.accepted), children: [applyingProposals ? _jsx("span", { className: "spinner" }) : '✓', " Appliquer"] }), _jsx("button", { className: "btn btn-secondary", onClick: () => setProposals(null), children: "\u2715 Annuler" })] })] }), _jsx("div", { style: { maxHeight: 360, overflowY: 'auto' }, children: proposals.map((p, idx) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }, children: [_jsx("input", { type: "checkbox", checked: p.accepted, onChange: (e) => setProposals((prev) => prev?.map((x, i) => (i === idx ? { ...x, accepted: e.target.checked } : x)) ?? null), style: { width: 'auto', flexShrink: 0 } }), _jsx("span", { style: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: p.description }), _jsx("span", { style: { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }, children: formatEur(p.amount) }), _jsx(CategoryPicker, { value: p.category, onChange: (v) => setProposals((prev) => prev?.map((x, i) => (i === idx ? { ...x, category: v } : x)) ?? null), categories: [...new Set([...COMMON_CATEGORIES, ...categories])].sort(), style: { width: 180 } })] }, p.id))) })] })), duplicates !== null && (_jsxs("div", { style: { background: 'var(--bg2)', border: '1px solid var(--yellow)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }, children: [_jsx("span", { style: { fontSize: 14, fontWeight: 600, color: 'var(--yellow)' }, children: duplicates.length === 0 ? 'Aucun doublon détecté' : `${duplicates.length} groupe(s) de doublons potentiels` }), _jsx("button", { className: "btn btn-secondary", onClick: () => setDuplicates(null), children: "\u2715 Fermer" })] }), duplicates.map((group, gIdx) => (_jsxs("div", { style: { background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10 }, children: [_jsxs("div", { style: { fontSize: 12, color: 'var(--text2)', marginBottom: 8 }, children: [new Date(group.transactions[0].date).toLocaleDateString('fr-FR'), " \u2014 ", group.transactions[0].amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })] }), group.transactions.map((tx) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }, children: [_jsx("span", { style: { flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: tx.description }), tx.category && _jsx("span", { style: { fontSize: 11, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }, children: tx.category }), _jsxs("span", { style: { fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }, children: ["id:", tx.id] }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 10px', fontSize: 12, color: 'var(--red)', borderColor: 'var(--red)', whiteSpace: 'nowrap' }, onClick: () => deleteDuplicate(tx.id, gIdx), children: "Supprimer" })] }, tx.id)))] }, gIdx)))] })), regexPanel && (_jsxs("div", { style: { background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10, padding: '14px 18px', marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx("span", { style: { fontSize: 13, color: 'var(--text2)', whiteSpace: 'nowrap' }, children: "Cat\u00E9goriser en masse :" }), _jsx(CategoryPicker, { value: regexPanel.category, onChange: (v) => setRegexPanel((p) => p ? { ...p, category: v } : null), categories: [...new Set([...COMMON_CATEGORIES, ...categories])].sort(), placeholder: "Cat\u00E9gorie", style: { width: 160 } }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 260 }, children: [_jsx("span", { style: { fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }, children: "Regex :" }), _jsx("input", { ref: patternRef, value: regexPanel.pattern, onChange: (e) => setRegexPanel((p) => p ? { ...p, pattern: e.target.value } : null), style: { flex: 1, fontFamily: 'monospace', fontSize: 12 }, placeholder: "ex: SNCF.*", onKeyDown: (e) => { if (e.key === 'Enter')
                                    applyRegex(); if (e.key === 'Escape')
                                    setRegexPanel(null); } })] }), _jsx("span", { style: { fontSize: 13, color: regexPanel.checking ? 'var(--text3)' : regexPanel.matchCount === 0 ? 'var(--red)' : 'var(--green)', whiteSpace: 'nowrap' }, children: regexPanel.checking ? '...' : regexPanel.matchCount === null ? '—' : `${regexPanel.matchCount} transaction(s)` }), _jsx("button", { className: "btn btn-primary", onClick: applyRegex, disabled: !regexPanel.matchCount || regexPanel.checking || !regexPanel.category, style: { whiteSpace: 'nowrap' }, children: "Appliquer" }), _jsx("button", { className: "btn btn-secondary", onClick: () => setRegexPanel(null), children: "\u2715" })] })), toast && (_jsx("div", { style: { position: 'fixed', bottom: 24, right: 24, zIndex: 9999, background: 'var(--green)', color: '#fff', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 500, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }, children: toast })), loading ? (_jsx("div", { className: "empty-state", children: _jsx("div", { className: "spinner", style: { width: 32, height: 32, margin: '0 auto' } }) })) : transactions.length === 0 ? (_jsx("div", { className: "empty-state", children: _jsx("p", { children: "Aucune transaction trouv\u00E9e." }) })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "table-wrapper", children: _jsxs("table", { children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx(SortHeader, { field: "date", label: "Date" }), _jsx(SortHeader, { field: "description", label: "Description" }), _jsx(SortHeader, { field: "category", label: "Cat\u00E9gorie" }), _jsx(SortHeader, { field: "amount", label: "Montant", align: "right" }), _jsx("th", { style: { width: 56 } })] }) }), _jsx("tbody", { children: transactions.map((tx) => {
                                        const isInternal = tx.is_internal === 1;
                                        const hasNote = !!tx.note;
                                        const txTags = tx.tags ? tx.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
                                        const isEditingNote = editingNote?.id === tx.id;
                                        const toggleInternal = async () => {
                                            await window.api.setTransactionInternal(tx.id, !isInternal);
                                            load();
                                        };
                                        return (_jsxs(_Fragment, { children: [_jsxs("tr", { style: { background: isInternal ? 'rgba(99,102,241,0.04)' : undefined }, children: [_jsx("td", { style: { whiteSpace: 'nowrap', color: 'var(--text2)', fontSize: 13, opacity: isInternal ? 0.5 : 1 }, children: new Date(tx.date).toLocaleDateString('fr-FR') }), _jsx("td", { style: { maxWidth: 320 }, children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 3 }, children: [_jsxs("div", { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: [isInternal && (_jsx("span", { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.03em', color: 'var(--accent)', background: 'rgba(99,102,241,0.15)', borderRadius: 4, padding: '1px 5px', marginRight: 6 }, children: "interne" })), _jsx("span", { style: { opacity: isInternal ? 0.45 : 1 }, children: tx.description })] }), txTags.length > 0 && (_jsx("div", { style: { display: 'flex', gap: 4, flexWrap: 'wrap' }, children: txTags.map((tag) => (_jsx("span", { style: { fontSize: 10, padding: '1px 6px', borderRadius: 10, background: 'rgba(99,102,241,0.15)', color: 'var(--accent-light)', fontWeight: 500 }, children: tag }, tag))) })), tx.note && (_jsx("span", { style: { fontSize: 11, color: 'var(--text3)', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: tx.note }))] }) }), _jsx("td", { children: editing?.id === tx.id ? (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center' }, children: [_jsx(CategoryPicker, { inputRef: editRef, value: newCategory, onChange: setNewCategory, categories: [...new Set([...COMMON_CATEGORIES, ...categories])].sort(), onConfirm: () => commitEdit(tx.id, newCategory), onCancel: () => setEditing(null), style: { width: 160 } }), _jsx("button", { className: "btn btn-primary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => commitEdit(tx.id, newCategory), children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => openRegexPanel(tx), title: "Appliquer \u00E0 des transactions similaires", children: "OK pour tous" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 8px', fontSize: 12 }, onClick: () => setEditing(null), children: "\u2715" })] })) : (_jsx("span", { className: "category-badge", style: categoryBadgeStyle(tx.category), onClick: () => startEdit(tx), title: "Cliquer pour modifier", children: tx.category || '+ Catégorie' })) }), _jsx("td", { style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: isInternal ? 0.4 : 1 }, children: _jsx("span", { className: tx.amount < 0 ? 'amount-negative' : 'amount-positive', children: formatEur(tx.amount) }) }), _jsxs("td", { style: { textAlign: 'center', whiteSpace: 'nowrap' }, children: [_jsx("button", { onClick: () => setEditingNote(isEditingNote ? null : { id: tx.id, note: tx.note ?? '', tags: tx.tags ?? '' }), title: "Ajouter une note ou des tags", style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '2px 4px', lineHeight: 1, color: hasNote || txTags.length > 0 ? 'var(--yellow)' : 'var(--border)', opacity: hasNote || txTags.length > 0 || isEditingNote ? 1 : 0 }, className: "internal-toggle", children: "\uD83D\uDCDD" }), _jsx("button", { onClick: toggleInternal, title: isInternal ? 'Marquer comme externe' : 'Marquer comme virement interne', style: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: '2px 4px', lineHeight: 1, color: isInternal ? 'var(--accent)' : 'var(--border)', opacity: isInternal ? 1 : 0 }, className: "internal-toggle", children: "\u21C4" })] })] }, tx.id), isEditingNote && (_jsx("tr", { children: _jsx("td", { colSpan: 5, style: { padding: '0 0 10px 0', background: 'rgba(245,158,11,0.04)', borderBottom: '1px solid rgba(245,158,11,0.15)' }, children: _jsxs("div", { style: { display: 'flex', gap: 10, padding: '10px 12px', alignItems: 'flex-start', flexWrap: 'wrap' }, children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: '1 1 200px' }, children: [_jsx("label", { style: { fontSize: 11, color: 'var(--text2)' }, children: "Note" }), _jsx("textarea", { autoFocus: true, value: editingNote.note, onChange: (e) => setEditingNote({ ...editingNote, note: e.target.value }), rows: 2, style: { fontSize: 12, resize: 'vertical', minHeight: 48 }, placeholder: "Ajouter une note\u2026" })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0, flex: '1 1 160px' }, children: [_jsx("label", { style: { fontSize: 11, color: 'var(--text2)' }, children: "Tags (s\u00E9par\u00E9s par des virgules)" }), _jsx("input", { value: editingNote.tags, onChange: (e) => setEditingNote({ ...editingNote, tags: e.target.value }), style: { fontSize: 12 }, placeholder: "remboursement, m\u00E9decin\u2026" })] }), _jsxs("div", { style: { display: 'flex', gap: 6, paddingTop: 18 }, children: [_jsx("button", { className: "btn btn-primary", style: { fontSize: 12, padding: '4px 12px' }, onClick: saveNote, children: "Sauvegarder" }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12, padding: '4px 8px' }, onClick: () => setEditingNote(null), children: "Annuler" })] })] }) }) }, `note-${tx.id}`))] }));
                                    }) })] }) }), totalPages > 1 && (_jsxs("div", { style: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '16px 0', marginTop: 4 }, children: [_jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 13 }, onClick: () => setPage(0), disabled: page === 0, children: "\u00AB" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 13 }, onClick: () => setPage((p) => Math.max(0, p - 1)), disabled: page === 0, children: "\u2039 Pr\u00E9c." }), _jsxs("span", { style: { fontSize: 13, color: 'var(--text2)', minWidth: 120, textAlign: 'center' }, children: ["Page ", page + 1, " / ", totalPages] }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 13 }, onClick: () => setPage((p) => Math.min(totalPages - 1, p + 1)), disabled: page >= totalPages - 1, children: "Suiv. \u203A" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 13 }, onClick: () => setPage(totalPages - 1), disabled: page >= totalPages - 1, children: "\u00BB" })] }))] }))] }));
}
