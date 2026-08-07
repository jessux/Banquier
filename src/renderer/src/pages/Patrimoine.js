import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import TickerPicker from '../components/TickerPicker';
const ASSET_TYPES = [
    { type: 'immobilier', label: 'Immobilier', icon: '🏠' },
    { type: 'actions', label: 'Actions', icon: '📈' },
    { type: 'etf', label: 'ETF / Fonds', icon: '📊' },
    { type: 'crypto', label: 'Cryptomonnaies', icon: '₿' },
    { type: 'liquidites', label: 'Liquidités / Livrets', icon: '💵' },
    { type: 'assurance_vie', label: 'Assurance-vie', icon: '🛡️' },
    { type: 'autre', label: 'Autre', icon: '📦' }
];
/** Types pour lesquels on suit un prix de revient via des lots d'achat. */
const MARKET_TYPES = ['actions', 'etf', 'crypto'];
const COLORS = ['var(--accent)', 'var(--green)', 'var(--yellow)', 'var(--red)', '#8b5cf6', '#06b6d4', '#f97316'];
const typeMeta = (type) => ASSET_TYPES.find((t) => t.type === type) ?? { label: type, icon: '📦' };
const euro = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro2 = (n, currency = 'EUR') => n.toLocaleString('fr-FR', { style: 'currency', currency });
const num = (s) => parseFloat(s.replace(',', '.')) || 0;
const emptyForm = {
    type: 'immobilier',
    label: '',
    quantity: null,
    value: 0,
    currency: 'EUR',
    symbol: null,
    notes: null
};
const emptyLot = () => ({ date: null, quantity: 0, unit_price: 0, fees: 0 });
export default function Patrimoine() {
    const [summary, setSummary] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [valueStr, setValueStr] = useState('');
    const [qtyStr, setQtyStr] = useState('');
    const [lots, setLots] = useState([]);
    const [dcaEnabled, setDcaEnabled] = useState(false);
    const [dca, setDca] = useState({ amount: 0, frequency: 'mensuel', day_ref: 1, start_date: '', fees: 0 });
    const [dcaAmountStr, setDcaAmountStr] = useState('');
    const [dcaFeesStr, setDcaFeesStr] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [histPeriod, setHistPeriod] = useState('all');
    const [quoteMsg, setQuoteMsg] = useState(null);
    const [unitPrice, setUnitPrice] = useState(null);
    const [priceLoading, setPriceLoading] = useState(false);
    const [priceError, setPriceError] = useState(null);
    const isMarket = MARKET_TYPES.includes(form.type);
    const load = () => {
        window.api.getPatrimoineSummary().then(setSummary);
    };
    useEffect(() => { load(); }, []);
    // Cours en direct du ticker sélectionné, pour calculer automatiquement la valeur du poste.
    useEffect(() => {
        if (!isMarket || !showForm) {
            setUnitPrice(null);
            setPriceError(null);
            setPriceLoading(false);
            return;
        }
        const symbol = (form.symbol ?? '').trim();
        if (!symbol) {
            setUnitPrice(null);
            setPriceError(null);
            setPriceLoading(false);
            return;
        }
        let cancelled = false;
        setPriceLoading(true);
        setPriceError(null);
        const timer = setTimeout(async () => {
            try {
                const res = await window.api.previewSymbol(form.type, symbol);
                if (cancelled)
                    return;
                setUnitPrice(res.price);
                if (res.price == null)
                    setPriceError(res.error ?? 'Cours introuvable pour ce ticker');
            }
            catch (e) {
                if (!cancelled)
                    setPriceError(String(e instanceof Error ? e.message : e));
            }
            finally {
                if (!cancelled)
                    setPriceLoading(false);
            }
        }, 500);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [isMarket, showForm, form.symbol, form.type]);
    const resetDca = () => {
        setDcaEnabled(false);
        setDca({ amount: 0, frequency: 'mensuel', day_ref: 1, start_date: '', fees: 0 });
        setDcaAmountStr('');
        setDcaFeesStr('');
    };
    const resetPrice = () => {
        setUnitPrice(null);
        setPriceError(null);
        setPriceLoading(false);
    };
    const openNew = () => {
        setEditId(null);
        setForm(emptyForm);
        setValueStr('');
        setQtyStr('');
        setLots([]);
        resetDca();
        resetPrice();
        setShowForm(true);
    };
    const openEdit = async (a) => {
        setEditId(a.id);
        setForm({
            type: a.type,
            label: a.label,
            quantity: a.quantity,
            value: a.value,
            currency: a.currency,
            symbol: a.symbol,
            notes: a.notes
        });
        setValueStr(String(a.value));
        setQtyStr(a.quantity != null ? String(a.quantity) : '');
        resetDca();
        resetPrice();
        const plan = await window.api.getDcaPlan(a.id);
        if (plan) {
            setDcaEnabled(true);
            setDca({ amount: plan.amount, frequency: plan.frequency, day_ref: plan.day_ref, start_date: plan.start_date, fees: plan.fees });
            setDcaAmountStr(String(plan.amount));
            setDcaFeesStr(plan.fees ? String(plan.fees) : '');
            setLots([]);
        }
        else {
            const loaded = await window.api.getAssetLots(a.id);
            setLots(loaded.map((l) => ({ date: l.date, quantity: l.quantity, unit_price: l.unit_price, fees: l.fees })));
        }
        setShowForm(true);
    };
    const refreshQuotes = async () => {
        setRefreshing(true);
        setQuoteMsg('Mise à jour des cours…');
        try {
            const res = await window.api.refreshQuotes();
            const parts = [`${res.updated.length} actif(s) mis à jour`];
            if (res.failed.length)
                parts.push(`${res.failed.length} échec(s) : ${res.failed.map((f) => f.label).join(', ')}`);
            setQuoteMsg(parts.join(' · '));
            load();
        }
        catch (e) {
            setQuoteMsg(`Erreur : ${String(e instanceof Error ? e.message : e)}`);
        }
        finally {
            setRefreshing(false);
        }
    };
    // Calculs en direct dans le formulaire (lots).
    const formCostBasis = useMemo(() => lots.reduce((s, l) => s + l.quantity * l.unit_price + (l.fees || 0), 0), [lots]);
    const formLotQty = useMemo(() => lots.reduce((s, l) => s + l.quantity, 0), [lots]);
    const marketQty = formLotQty > 0 ? formLotQty : num(qtyStr);
    const marketValue = unitPrice != null ? marketQty * unitPrice : 0;
    const formValue = isMarket ? marketValue : num(valueStr);
    const formGain = formValue - formCostBasis;
    const updateLot = (i, patch) => setLots(lots.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
    const useDca = isMarket && dcaEnabled;
    const save = async () => {
        const cleanLots = isMarket && !useDca ? lots.filter((l) => l.quantity > 0 && l.unit_price > 0) : [];
        const dcaPayload = useDca
            ? {
                amount: num(dcaAmountStr),
                frequency: dca.frequency,
                day_ref: dca.day_ref,
                start_date: dca.start_date,
                fees: num(dcaFeesStr)
            }
            : null;
        const payload = {
            ...form,
            // Pour le DCA la valeur est calculée côté serveur ; pour les autres actifs boursiers,
            // elle est déduite automatiquement du cours en direct × la quantité détenue.
            value: useDca ? 0 : formValue,
            quantity: isMarket
                ? useDca || cleanLots.length > 0 ? null : qtyStr.trim() ? num(qtyStr) : null
                : qtyStr.trim() ? num(qtyStr) : null,
            lots: cleanLots,
            dca: dcaPayload
        };
        if (!payload.label.trim())
            return;
        if (useDca) {
            if (!payload.symbol || !dcaPayload.amount || !dcaPayload.start_date)
                return;
        }
        else if (isMarket) {
            if (!payload.symbol || marketQty <= 0 || unitPrice == null)
                return;
        }
        else if (payload.value <= 0)
            return;
        setRefreshing(true);
        try {
            if (editId != null)
                await window.api.updateAsset(editId, payload);
            else
                await window.api.createAsset(payload);
            setShowForm(false);
            load();
        }
        finally {
            setRefreshing(false);
        }
    };
    const remove = async (a) => {
        if (!window.confirm(`Supprimer « ${a.label} » (${euro2(a.value, a.currency)}) ?`))
            return;
        await window.api.deleteAsset(a.id);
        load();
    };
    const pieData = useMemo(() => (summary?.byType ?? []).map((b) => ({ name: typeMeta(b.type).label, value: b.total })), [summary]);
    const assetsByType = useMemo(() => {
        const groups = new Map();
        for (const a of summary?.assets ?? []) {
            if (!groups.has(a.type))
                groups.set(a.type, []);
            groups.get(a.type).push(a);
        }
        return groups;
    }, [summary]);
    const filteredHistory = useMemo(() => {
        const history = summary?.history ?? [];
        if (histPeriod === 'all')
            return history;
        const months = histPeriod === '3m' ? 3 : histPeriod === '6m' ? 6 : 12;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        const iso = cutoff.toISOString().slice(0, 10);
        return history.filter((h) => h.date >= iso);
    }, [summary, histPeriod]);
    const histVariation = useMemo(() => {
        if (filteredHistory.length < 2)
            return null;
        const first = filteredHistory[0].value;
        const last = filteredHistory[filteredHistory.length - 1].value;
        return { delta: last - first, pct: first > 0 ? ((last - first) / first) * 100 : null };
    }, [filteredHistory]);
    if (!summary) {
        return (_jsxs("div", { children: [_jsx("div", { className: "page-header", children: _jsx("h1", { className: "page-title", children: "Patrimoine" }) }), _jsx("p", { className: "text-muted", children: "Chargement\u2026" })] }));
    }
    const isEmpty = summary.assets.length === 0;
    const gainColor = (g) => (g >= 0 ? 'var(--green)' : 'var(--red)');
    const gainLabel = (gain, basis) => {
        const pct = basis > 0 ? ` (${gain >= 0 ? '+' : ''}${Math.round((gain / basis) * 100)} %)` : '';
        return `${gain >= 0 ? '+' : ''}${euro2(gain)}${pct}`;
    };
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("h1", { className: "page-title", children: "Patrimoine" }), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { className: "btn btn-secondary", onClick: refreshQuotes, disabled: refreshing, children: refreshing ? '…' : '↻ Mettre à jour les cours' }), _jsx("button", { className: "btn btn-primary", onClick: openNew, children: "+ Ajouter un actif" })] })] }), quoteMsg && (_jsx("p", { className: "text-sm", style: { marginBottom: 12, color: quoteMsg.startsWith('Erreur') ? 'var(--red)' : 'var(--text-muted)' }, children: quoteMsg })), isEmpty && !showForm && (_jsxs("div", { className: "card", style: { textAlign: 'center', padding: 40 }, children: [_jsx("p", { style: { fontSize: 16, marginBottom: 8 }, children: "Aucun actif pour l'instant" }), _jsx("p", { className: "text-muted text-sm", style: { marginBottom: 16 }, children: "Ajoutez vos biens immobiliers, actions, ETF, cryptos, livrets\u2026 pour suivre votre valeur nette." }), _jsx("button", { className: "btn btn-primary", onClick: openNew, children: "+ Ajouter un premier actif" })] })), !isEmpty && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "card", style: { marginBottom: 20, display: 'flex', gap: 40, flexWrap: 'wrap' }, children: [_jsxs("div", { children: [_jsx("div", { className: "text-muted text-sm", children: "Valeur nette totale" }), _jsx("div", { style: { fontSize: 34, fontWeight: 700, marginTop: 4 }, children: summary.totalValue.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) })] }), summary.totalCostBasis > 0 && (_jsxs("div", { children: [_jsx("div", { className: "text-muted text-sm", children: "Plus/moins-value latente (titres)" }), _jsx("div", { style: { fontSize: 34, fontWeight: 700, marginTop: 4, color: gainColor(summary.totalGain) }, children: gainLabel(summary.totalGain, summary.totalCostBasis) }), _jsxs("div", { className: "text-muted text-sm", children: ["Prix de revient : ", euro(summary.totalCostBasis)] })] }))] }), _jsxs("div", { className: "grid-2", style: { marginBottom: 20, gap: 20 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { className: "card-title", style: { marginBottom: 12 }, children: "R\u00E9partition" }), _jsx(ResponsiveContainer, { width: "100%", height: 240, children: _jsxs(PieChart, { children: [_jsx(Pie, { data: pieData, dataKey: "value", nameKey: "name", innerRadius: 55, outerRadius: 90, paddingAngle: 2, children: pieData.map((_, i) => _jsx(Cell, { fill: COLORS[i % COLORS.length] }, i)) }), _jsx(Tooltip, { formatter: (v) => euro(v) })] }) }), _jsx("div", { style: { marginTop: 8 }, children: summary.byType.map((b, i) => (_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, padding: '3px 0' }, children: [_jsxs("span", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx("span", { style: { width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length] } }), typeMeta(b.type).icon, " ", typeMeta(b.type).label] }), _jsxs("span", { className: "text-muted", children: [euro(b.total), " \u00B7 ", Math.round((b.total / summary.totalValue) * 100), "%"] })] }, b.type))) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 0 }, children: "\u00C9volution de la valeur nette" }), _jsx("div", { style: { display: 'flex', gap: 4 }, children: [['3m', '3 mois'], ['6m', '6 mois'], ['1y', '1 an'], ['all', 'Tout']].map(([k, lbl]) => (_jsx("button", { className: `btn ${histPeriod === k ? 'btn-primary' : 'btn-secondary'}`, style: { padding: '2px 10px', fontSize: 12 }, onClick: () => setHistPeriod(k), children: lbl }, k))) })] }), histVariation && (_jsxs("div", { className: "text-sm", style: { marginBottom: 8 }, children: [_jsx("span", { className: "text-muted", children: "Variation sur la p\u00E9riode : " }), _jsxs("span", { style: { color: gainColor(histVariation.delta), fontWeight: 600 }, children: [histVariation.delta >= 0 ? '+' : '', euro2(histVariation.delta), histVariation.pct != null && ` (${histVariation.pct >= 0 ? '+' : ''}${histVariation.pct.toFixed(1)} %)`] })] })), filteredHistory.length > 1 ? (_jsx(ResponsiveContainer, { width: "100%", height: 240, children: _jsxs(AreaChart, { data: filteredHistory, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "nw", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "var(--accent)", stopOpacity: 0.4 }), _jsx("stop", { offset: "95%", stopColor: "var(--accent)", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)" }), _jsx(XAxis, { dataKey: "date", tick: { fontSize: 11, fill: 'var(--text2)' }, tickFormatter: (d) => d.slice(5) }), _jsx(YAxis, { tick: { fontSize: 11, fill: 'var(--text2)' }, tickFormatter: (v) => euro(v), width: 70 }), _jsx(Tooltip, { formatter: (v) => euro(v) }), _jsx(Area, { type: "monotone", dataKey: "value", stroke: "var(--accent)", fill: "url(#nw)" })] }) })) : (_jsx("p", { className: "text-muted text-sm", style: { padding: '40px 0', textAlign: 'center' }, children: summary.history.length > 1
                                            ? 'Pas assez de points sur cette période. Essayez une période plus longue.'
                                            : "L'historique se construit au fil du temps, à chaque mise à jour de vos actifs." }))] })] }), [...assetsByType.entries()].map(([type, assets]) => {
                        const groupTotal = assets.reduce((s, a) => s + a.value, 0);
                        const groupTracked = assets.filter((a) => a.cost_basis > 0);
                        const groupBasis = groupTracked.reduce((s, a) => s + a.cost_basis, 0);
                        const groupGain = groupTracked.reduce((s, a) => s + (a.value - a.cost_basis), 0);
                        return (_jsxs("div", { className: "card", style: { marginBottom: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12, flexWrap: 'wrap', gap: 8 }, children: [_jsxs("div", { className: "card-title", style: { marginBottom: 0 }, children: [typeMeta(type).icon, " ", typeMeta(type).label, _jsxs("span", { className: "text-muted", style: { fontWeight: 400, marginLeft: 8, fontSize: 12 }, children: [assets.length, " actif", assets.length > 1 ? 's' : '', " \u00B7 ", summary.totalValue > 0 ? Math.round((groupTotal / summary.totalValue) * 100) : 0, "% du patrimoine"] })] }), _jsxs("div", { style: { fontSize: 14 }, children: [groupBasis > 0 && (_jsx("span", { style: { color: gainColor(groupGain), fontWeight: 500, marginRight: 12 }, children: gainLabel(groupGain, groupBasis) })), _jsx("span", { style: { fontWeight: 600 }, children: euro(groupTotal) })] })] }), assets.map((a) => {
                                    const gain = a.value - a.cost_basis;
                                    const qty = a.lot_quantity > 0 ? a.lot_quantity : a.quantity;
                                    return (_jsxs("div", { className: "flex justify-between items-center", style: { padding: '10px 0', borderBottom: '1px solid var(--border)' }, children: [_jsxs("div", { children: [_jsx("span", { style: { fontWeight: 500 }, children: a.label }), qty != null && (_jsxs("span", { className: "text-muted text-sm", style: { marginLeft: 8 }, children: ["\u00D7 ", qty] })), a.symbol && _jsx("span", { className: "badge", style: { marginLeft: 8 }, children: a.symbol }), a.cost_basis > 0 && (_jsxs("div", { className: "text-sm", style: { marginTop: 2 }, children: [_jsxs("span", { className: "text-muted", children: ["Prix de revient ", euro2(a.cost_basis, a.currency), " \u00B7 "] }), _jsx("span", { style: { color: gainColor(gain), fontWeight: 500 }, children: gainLabel(gain, a.cost_basis) })] })), a.notes && _jsx("div", { className: "text-muted text-sm", style: { marginTop: 2 }, children: a.notes }), _jsxs("div", { className: "text-muted", style: { fontSize: 11, marginTop: 2 }, children: [summary.totalValue > 0 && `${((a.value / summary.totalValue) * 100).toFixed(1)}% du patrimoine`, qty != null && qty > 0 && ` · ${euro2(a.value / qty, a.currency)}/unité`, a.updated_at && ` · MAJ le ${new Date(a.updated_at).toLocaleDateString('fr-FR')}`] })] }), _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 12 }, children: [_jsx("span", { style: { fontWeight: 600 }, children: euro2(a.value, a.currency) }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12 }, onClick: () => openEdit(a), children: "Modifier" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px', fontSize: 12 }, onClick: () => remove(a), children: "Supprimer" })] })] }, a.id));
                                })] }, type));
                    })] })), showForm && (_jsxs("div", { className: "card", style: { marginTop: 16 }, children: [_jsx("h3", { style: { marginBottom: 16 }, children: editId != null ? 'Modifier l\'actif' : 'Nouvel actif' }), _jsxs("div", { className: "grid-2", style: { gap: 12 }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Type" }), _jsx("select", { value: form.type, onChange: (e) => setForm({ ...form, type: e.target.value }), children: ASSET_TYPES.map((t) => (_jsxs("option", { value: t.type, children: [t.icon, " ", t.label] }, t.type))) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Libell\u00E9" }), _jsx("input", { value: form.label, onChange: (e) => setForm({ ...form, label: e.target.value }), placeholder: isMarket ? 'Apple, Bitcoin, MSCI World…' : 'Appartement Paris 11e' })] }), !isMarket && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Valeur actuelle totale (\u20AC)" }), _jsx("input", { value: valueStr, onChange: (e) => setValueStr(e.target.value), placeholder: "250000", inputMode: "decimal" })] })), _jsxs("div", { className: "form-group", children: [_jsxs("label", { children: ["Symbole / Ticker", isMarket ? '' : ' (optionnel)'] }), isMarket ? (_jsx(TickerPicker, { type: form.type, value: form.symbol ?? '', onChange: (v) => setForm({ ...form, symbol: v || null }), placeholder: "Rechercher : AAPL, Bitcoin, MSCI World\u2026" })) : (_jsx("input", { value: form.symbol ?? '', onChange: (e) => setForm({ ...form, symbol: e.target.value || null }), placeholder: "AAPL, BTC, CW8.PA\u2026" })), isMarket && (form.symbol ?? '').trim() && (_jsx("p", { className: "text-muted text-sm", style: { marginTop: 4 }, children: priceLoading
                                            ? 'Recherche du cours…'
                                            : priceError
                                                ? `⚠ ${priceError}`
                                                : unitPrice != null
                                                    ? `Cours actuel : ${euro2(unitPrice, form.currency)}`
                                                    : null }))] }), (!isMarket || (!useDca && formLotQty === 0)) && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: isMarket ? 'Quantité possédée' : 'Quantité (optionnel)' }), _jsx("input", { value: qtyStr, onChange: (e) => setQtyStr(e.target.value), placeholder: isMarket ? "nb d'actions/parts" : 'nb de parts/unités', inputMode: "decimal" })] })), isMarket && !useDca && marketQty > 0 && unitPrice != null && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Valeur estim\u00E9e" }), _jsx("div", { style: { padding: '9px 0', fontWeight: 600 }, children: euro2(marketValue, form.currency) })] })), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Note (optionnel)" }), _jsx("input", { value: form.notes ?? '', onChange: (e) => setForm({ ...form, notes: e.target.value || null }), placeholder: "PEA, compte-titres\u2026" })] })] }), isMarket && (_jsx("div", { style: { marginTop: 4, marginBottom: 8 }, children: _jsxs("label", { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }, children: [_jsx("input", { type: "checkbox", checked: dcaEnabled, onChange: (e) => setDcaEnabled(e.target.checked), style: { width: 'auto' } }), "Investissement programm\u00E9 (DCA) \u2014 g\u00E9n\u00E8re les achats automatiquement \u00E0 partir des cours historiques"] }) })), useDca && (_jsxs("div", { style: { marginTop: 8 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 8 }, children: "Plan d'investissement programm\u00E9" }), _jsxs("div", { className: "grid-2", style: { gap: 12 }, children: [_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Montant par versement (\u20AC)" }), _jsx("input", { value: dcaAmountStr, onChange: (e) => setDcaAmountStr(e.target.value), placeholder: "100", inputMode: "decimal" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Fr\u00E9quence" }), _jsxs("select", { value: dca.frequency, onChange: (e) => setDca({ ...dca, frequency: e.target.value }), children: [_jsx("option", { value: "mensuel", children: "Mensuel" }), _jsx("option", { value: "hebdomadaire", children: "Hebdomadaire" })] })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: dca.frequency === 'mensuel' ? 'Jour du mois (1-28)' : 'Jour de la semaine' }), dca.frequency === 'mensuel' ? (_jsx("input", { value: dca.day_ref, onChange: (e) => setDca({ ...dca, day_ref: Math.min(28, Math.max(1, parseInt(e.target.value) || 1)) }), inputMode: "numeric" })) : (_jsx("select", { value: dca.day_ref, onChange: (e) => setDca({ ...dca, day_ref: parseInt(e.target.value) }), children: ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'].map((d, i) => (_jsx("option", { value: i, children: d }, i))) }))] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Date de d\u00E9but" }), _jsx("input", { type: "date", value: dca.start_date, onChange: (e) => setDca({ ...dca, start_date: e.target.value }) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Frais par versement (\u20AC, optionnel)" }), _jsx("input", { value: dcaFeesStr, onChange: (e) => setDcaFeesStr(e.target.value), placeholder: "0", inputMode: "decimal" })] })] }), _jsx("p", { className: "text-muted text-sm", children: "\u00C0 l'enregistrement, Banquier r\u00E9cup\u00E8re les cours \u00E0 chaque date et cr\u00E9e les achats automatiquement, puis calcule la valeur actuelle et la plus/moins-value. (Crypto : historique limit\u00E9 \u00E0 1 an.)" })] })), isMarket && !useDca && (_jsxs("div", { style: { marginTop: 8 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 8 }, children: "Lots d'achat (optionnel, pour suivre le prix de revient)" }), _jsxs("table", { style: { width: '100%', fontSize: 13 }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: 'var(--text2, var(--text2))' }, children: [_jsx("th", { style: { fontWeight: 500, padding: '4px 6px' }, children: "Date" }), _jsx("th", { style: { fontWeight: 500, padding: '4px 6px' }, children: "Quantit\u00E9" }), _jsx("th", { style: { fontWeight: 500, padding: '4px 6px' }, children: "Prix unitaire" }), _jsx("th", { style: { fontWeight: 500, padding: '4px 6px' }, children: "Frais" }), _jsx("th", {})] }) }), _jsx("tbody", { children: lots.map((l, i) => (_jsxs("tr", { children: [_jsx("td", { style: { padding: '3px 6px' }, children: _jsx("input", { type: "date", value: l.date ?? '', onChange: (e) => updateLot(i, { date: e.target.value || null }) }) }), _jsx("td", { style: { padding: '3px 6px' }, children: _jsx("input", { value: l.quantity || '', onChange: (e) => updateLot(i, { quantity: num(e.target.value) }), placeholder: "10", inputMode: "decimal", style: { width: 90 } }) }), _jsx("td", { style: { padding: '3px 6px' }, children: _jsx("input", { value: l.unit_price || '', onChange: (e) => updateLot(i, { unit_price: num(e.target.value) }), placeholder: "150", inputMode: "decimal", style: { width: 100 } }) }), _jsx("td", { style: { padding: '3px 6px' }, children: _jsx("input", { value: l.fees || '', onChange: (e) => updateLot(i, { fees: num(e.target.value) }), placeholder: "0", inputMode: "decimal", style: { width: 80 } }) }), _jsx("td", { style: { padding: '3px 6px' }, children: _jsx("button", { className: "btn btn-secondary", style: { padding: '2px 8px', fontSize: 12 }, onClick: () => setLots(lots.filter((_, idx) => idx !== i)), children: "\u2715" }) })] }, i))) })] }), _jsx("button", { className: "btn btn-secondary", style: { fontSize: 12, marginTop: 8 }, onClick: () => setLots([...lots, emptyLot()]), children: "+ Ajouter un lot" }), formCostBasis > 0 && (_jsxs("div", { className: "text-sm", style: { marginTop: 10 }, children: [_jsxs("span", { className: "text-muted", children: ["Quantit\u00E9 totale ", formLotQty, " \u00B7 Prix de revient ", euro2(formCostBasis)] }), formValue > 0 && (_jsxs(_Fragment, { children: [_jsx("span", { className: "text-muted", children: " \u00B7 +/- value " }), _jsx("span", { style: { color: gainColor(formGain), fontWeight: 600 }, children: gainLabel(formGain, formCostBasis) })] }))] }))] })), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 16 }, children: [_jsx("button", { className: "btn btn-primary", onClick: save, disabled: refreshing ||
                                    !form.label.trim() ||
                                    (useDca
                                        ? !form.symbol || !dcaAmountStr.trim() || !dca.start_date
                                        : isMarket
                                            ? !form.symbol || marketQty <= 0 || priceLoading || unitPrice == null
                                            : !valueStr.trim()), children: refreshing ? 'Calcul…' : priceLoading ? 'Cours…' : editId != null ? 'Enregistrer' : 'Ajouter' }), _jsx("button", { className: "btn btn-secondary", onClick: () => setShowForm(false), children: "Annuler" })] })] }))] }));
}
