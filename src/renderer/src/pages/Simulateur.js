import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
const euro = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const num = (s) => parseFloat(s.replace(',', '.')) || 0;
const FREQ_OPTIONS = [
    {
        label: 'Quotidien',
        value: 1 / 365,
        periodLabel: (i) => `Jour ${i + 1}`,
        summaryLabel: 'par jour'
    },
    {
        label: 'Hebdomadaire',
        value: 1 / 52,
        periodLabel: (i) => `Semaine ${i + 1}`,
        summaryLabel: 'par semaine'
    },
    {
        label: 'Mensuel',
        value: 1 / 12,
        periodLabel: (i) => `Mois ${i + 1}`,
        summaryLabel: 'par mois'
    },
    {
        label: 'Trimestriel',
        value: 0.25,
        periodLabel: (i) => `Trimestre ${i + 1}`,
        summaryLabel: 'par trimestre'
    },
    {
        label: 'Semestriel',
        value: 0.5,
        periodLabel: (i) => `Semestre ${i + 1}`,
        summaryLabel: 'par semestre'
    },
    {
        label: 'Annuel',
        value: 1,
        periodLabel: (i) => `An ${i}`,
        summaryLabel: 'par an'
    },
    {
        label: 'Tous les 2 ans',
        value: 2,
        periodLabel: (i) => `An ${i * 2}`,
        summaryLabel: 'tous les 2 ans'
    },
    {
        label: 'Tous les 3 ans',
        value: 3,
        periodLabel: (i) => `An ${i * 3}`,
        summaryLabel: 'tous les 3 ans'
    },
    {
        label: 'Tous les 5 ans',
        value: 5,
        periodLabel: (i) => `An ${i * 5}`,
        summaryLabel: 'tous les 5 ans'
    },
];
function buildResult(initialCapital, durationYears, freqYears, freqCompYears, annualRate, rPeriod, pmt, targetCapital, freq) {
    const nPeriods = Math.floor(durationYears / freqYears + 1e-9);
    const nPayments = nPeriods + 1;
    // Show interest only on compounding dates when compounding is less frequent than payments
    const compRatio = freqCompYears / freqYears;
    const showCompSeparately = freqCompYears > freqYears + 1e-9 && Math.abs(compRatio - Math.round(compRatio)) < 1e-9;
    const schedule = [];
    let cap = initialCapital;
    let prevCap = initialCapital;
    let lastCompoundCap = initialCapital;
    let paymentsSinceLastComp = 0;
    for (let i = 0; i < nPayments; i++) {
        const compPeriodsElapsed = i * freqYears / freqCompYears;
        const isCompDate = showCompSeparately && i > 0 && Math.abs(compPeriodsElapsed % 1) < 1e-9;
        let interest = 0;
        if (isCompDate) {
            interest = cap - lastCompoundCap - pmt * paymentsSinceLastComp;
        }
        else if (!showCompSeparately) {
            interest = i === 0 ? 0 : cap - prevCap;
        }
        cap += pmt;
        if (showCompSeparately) {
            if (isCompDate) {
                // Le versement du jour est déjà inclus dans lastCompoundCap : repartir de zéro.
                lastCompoundCap = cap;
                paymentsSinceLastComp = 0;
            }
            else {
                paymentsSinceLastComp++;
            }
        }
        schedule.push({ index: i + 1, period: freq.periodLabel(i), paid: pmt, interest, capital: cap });
        prevCap = cap;
        if (i < nPayments - 1)
            cap *= 1 + rPeriod;
    }
    // Chart always year-by-year, interpolated from schedule points
    const chartYears = Math.ceil(durationYears);
    const chartData = [];
    for (let y = 0; y <= chartYears; y++) {
        const lastIdx = Math.min(nPeriods, Math.floor(y / freqYears + 1e-9));
        const yearsGrown = y - lastIdx * freqYears;
        const c = schedule[lastIdx].capital * Math.pow(1 + annualRate, yearsGrown);
        chartData.push({ year: y, capital: parseFloat(c.toFixed(2)) });
    }
    const totalPaid = pmt * nPayments;
    const totalInterest = targetCapital - initialCapital - totalPaid;
    return { pmt, targetCapital, nPayments, totalPaid, totalInterest, schedule, chartData, noPaymentNeeded: false };
}
function computeForward(targetCapital, durationYears, freq, freqCompound, annualRate, initialCapital) {
    if (durationYears <= 0 || targetCapital <= 0)
        return null;
    const freqYears = freq.value;
    const nPeriods = Math.floor(durationYears / freqYears + 1e-9);
    const nPayments = nPeriods + 1;
    const remainder = durationYears - nPeriods * freqYears;
    const rPeriod = annualRate > 1e-10 ? Math.pow(1 + annualRate, freqYears) - 1 : 0;
    const adjustedTarget = targetCapital / Math.pow(1 + annualRate, remainder);
    const adjustedC0 = initialCapital * Math.pow(1 + annualRate, nPeriods * freqYears);
    if (adjustedC0 >= adjustedTarget) {
        const chartData = [];
        let c = initialCapital;
        for (let y = 0; y <= Math.ceil(durationYears); y++) {
            chartData.push({ year: y, capital: parseFloat(c.toFixed(2)) });
            if (y < durationYears)
                c *= 1 + annualRate;
        }
        return {
            pmt: 0, targetCapital, nPayments: 0, totalPaid: 0,
            totalInterest: adjustedC0 * Math.pow(1 + annualRate, remainder) - initialCapital,
            schedule: [], chartData, noPaymentNeeded: true
        };
    }
    const annuityFactor = rPeriod > 1e-10
        ? (Math.pow(1 + rPeriod, nPayments) - 1) / rPeriod
        : nPayments;
    const pmt = (adjustedTarget - adjustedC0) / annuityFactor;
    return buildResult(initialCapital, durationYears, freqYears, freqCompound.value, annualRate, rPeriod, pmt, targetCapital, freq);
}
function computeInverse(pmt, durationYears, freq, freqCompound, annualRate, initialCapital) {
    if (durationYears <= 0 || pmt < 0)
        return null;
    const freqYears = freq.value;
    const nPeriods = Math.floor(durationYears / freqYears + 1e-9);
    const nPayments = nPeriods + 1;
    const remainder = durationYears - nPeriods * freqYears;
    const rPeriod = annualRate > 1e-10 ? Math.pow(1 + annualRate, freqYears) - 1 : 0;
    const c0AtLastPayment = initialCapital * Math.pow(1 + annualRate, nPeriods * freqYears);
    const annuityFactor = rPeriod > 1e-10
        ? (Math.pow(1 + rPeriod, nPayments) - 1) / rPeriod
        : nPayments;
    const targetCapital = (c0AtLastPayment + pmt * annuityFactor) * Math.pow(1 + annualRate, remainder);
    return buildResult(initialCapital, durationYears, freqYears, freqCompound.value, annualRate, rPeriod, pmt, targetCapital, freq);
}
const SCHEDULE_HEAD = 24;
const SCHEDULE_TAIL = 6;
export default function Simulateur() {
    const [mode, setMode] = useState('forward');
    const [targetStr, setTargetStr] = useState('10000');
    const [pmtStr, setPmtStr] = useState('100');
    const [durationStr, setDurationStr] = useState('10');
    const [freqKey, setFreqKey] = useState('Mensuel');
    const [freqCompoundKey, setFreqCompoundKey] = useState('Annuel');
    const [rateStr, setRateStr] = useState('3');
    const [initialStr, setInitialStr] = useState('0');
    const freq = FREQ_OPTIONS.find(f => f.label === freqKey) ?? FREQ_OPTIONS[2];
    const freqCompound = FREQ_OPTIONS.find(f => f.label === freqCompoundKey) ?? FREQ_OPTIONS[5];
    const result = useMemo(() => {
        const duration = num(durationStr);
        const rate = num(rateStr) / 100;
        const initial = num(initialStr);
        if (duration <= 0)
            return null;
        if (mode === 'forward')
            return computeForward(num(targetStr), duration, freq, freqCompound, rate, initial);
        return computeInverse(num(pmtStr), duration, freq, freqCompound, rate, initial);
    }, [mode, targetStr, pmtStr, durationStr, freq, freqCompound, rateStr, initialStr]);
    const scheduleRows = result?.schedule ?? [];
    const tooLong = scheduleRows.length > SCHEDULE_HEAD + SCHEDULE_TAIL;
    const visibleRows = tooLong
        ? [...scheduleRows.slice(0, SCHEDULE_HEAD), ...scheduleRows.slice(-SCHEDULE_TAIL)]
        : scheduleRows;
    const hiddenCount = tooLong ? scheduleRows.length - SCHEDULE_HEAD - SCHEDULE_TAIL : 0;
    return (_jsxs("div", { children: [_jsx("div", { className: "page-header", children: _jsx("h1", { className: "page-title", children: "Simulateur d'\u00E9pargne" }) }), _jsxs("div", { style: { display: 'flex', gap: 8, marginBottom: 20 }, children: [_jsx("button", { className: `btn ${mode === 'forward' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setMode('forward'), children: "Calculer le versement" }), _jsx("button", { className: `btn ${mode === 'inverse' ? 'btn-primary' : 'btn-secondary'}`, onClick: () => setMode('inverse'), children: "Calculer le capital final" })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 16 }, children: "Param\u00E8tres" }), _jsxs("div", { className: "grid-2", style: { gap: 16 }, children: [mode === 'forward' ? (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Capital cible (\u20AC)" }), _jsx("input", { value: targetStr, onChange: (e) => setTargetStr(e.target.value), placeholder: "10000", inputMode: "decimal" })] })) : (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Versement (\u20AC)" }), _jsx("input", { value: pmtStr, onChange: (e) => setPmtStr(e.target.value), placeholder: "100", inputMode: "decimal" })] })), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Dur\u00E9e (ann\u00E9es)" }), _jsx("input", { value: durationStr, onChange: (e) => setDurationStr(e.target.value), placeholder: "10", inputMode: "decimal" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Fr\u00E9quence des versements" }), _jsx("select", { value: freqKey, onChange: (e) => setFreqKey(e.target.value), children: FREQ_OPTIONS.map((f) => (_jsx("option", { value: f.label, children: f.label }, f.label))) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Fr\u00E9quence de capitalisation" }), _jsx("select", { value: freqCompoundKey, onChange: (e) => setFreqCompoundKey(e.target.value), children: FREQ_OPTIONS.map((f) => (_jsx("option", { value: f.label, children: f.label }, f.label))) })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Taux de rendement annuel (%)" }), _jsx("input", { value: rateStr, onChange: (e) => setRateStr(e.target.value), placeholder: "3", inputMode: "decimal" })] }), _jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Capital de d\u00E9part (\u20AC)" }), _jsx("input", { value: initialStr, onChange: (e) => setInitialStr(e.target.value), placeholder: "0", inputMode: "decimal" })] })] })] }), !result && (_jsx("div", { className: "card", style: { textAlign: 'center', padding: 40 }, children: _jsx("p", { className: "text-muted", children: "Renseignez les param\u00E8tres pour lancer la simulation." }) })), result?.noPaymentNeeded && (_jsxs("div", { className: "card", style: { textAlign: 'center', padding: 32 }, children: [_jsx("p", { style: { fontWeight: 600, fontSize: 16 }, children: "Aucun versement n\u00E9cessaire" }), _jsxs("p", { className: "text-muted text-sm", style: { marginTop: 4 }, children: ["Votre capital de d\u00E9part suffit \u00E0 atteindre l'objectif au taux de ", rateStr, " %."] })] })), result && !result.noPaymentNeeded && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid-2", style: { gap: 16, marginBottom: 20 }, children: [_jsx("div", { className: "card", style: { textAlign: 'center', padding: 28 }, children: mode === 'forward' ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-muted text-sm", children: "Versement \u00E0 effectuer" }), _jsx("div", { style: { fontSize: 36, fontWeight: 700, color: 'var(--accent)', margin: '10px 0 4px' }, children: euro(result.pmt) }), _jsxs("div", { className: "text-muted text-sm", children: [freq.summaryLabel, " \u00B7 ", result.nPayments, " versements"] })] })) : (_jsxs(_Fragment, { children: [_jsx("div", { className: "text-muted text-sm", children: "Capital final" }), _jsx("div", { style: { fontSize: 36, fontWeight: 700, color: 'var(--accent)', margin: '10px 0 4px' }, children: euro(result.targetCapital) }), _jsxs("div", { className: "text-muted text-sm", children: [euro(result.pmt), " ", freq.summaryLabel, " \u00B7 ", result.nPayments, " versements"] })] })) }), _jsx("div", { className: "card", children: _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { className: "text-muted text-sm", children: "Dur\u00E9e" }), _jsxs("span", { style: { fontWeight: 600 }, children: [durationStr, " ans"] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { className: "text-muted text-sm", children: "Total vers\u00E9" }), _jsx("span", { style: { fontWeight: 600 }, children: euro(result.totalPaid) })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between' }, children: [_jsx("span", { className: "text-muted text-sm", children: "Int\u00E9r\u00EAts g\u00E9n\u00E9r\u00E9s" }), _jsxs("span", { style: { fontWeight: 600, color: 'var(--green)' }, children: ["+", euro(result.totalInterest)] })] }), _jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 12 }, children: [_jsx("span", { className: "text-muted text-sm", children: "Capital final" }), _jsx("span", { style: { fontWeight: 700, fontSize: 18 }, children: euro(result.targetCapital) })] })] }) })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 12 }, children: "\u00C9volution du capital" }), _jsx(ResponsiveContainer, { width: "100%", height: 220, children: _jsxs(AreaChart, { data: result.chartData, children: [_jsx("defs", { children: _jsxs("linearGradient", { id: "simGrad", x1: "0", y1: "0", x2: "0", y2: "1", children: [_jsx("stop", { offset: "5%", stopColor: "var(--accent)", stopOpacity: 0.4 }), _jsx("stop", { offset: "95%", stopColor: "var(--accent)", stopOpacity: 0 })] }) }), _jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "var(--border)" }), _jsx(XAxis, { dataKey: "year", tick: { fontSize: 11, fill: 'var(--text2)' }, tickFormatter: (v) => `An ${v}` }), _jsx(YAxis, { tick: { fontSize: 11, fill: 'var(--text2)' }, tickFormatter: (v) => euro(v), width: 95 }), _jsx(Tooltip, { formatter: (v) => [euro(v), 'Capital'], labelFormatter: (v) => `Année ${v}` }), _jsx(Area, { type: "monotone", dataKey: "capital", stroke: "var(--accent)", fill: "url(#simGrad)", strokeWidth: 2 })] }) })] }), _jsxs("div", { className: "card", children: [_jsxs("div", { className: "card-title", style: { marginBottom: 12 }, children: ["\u00C9ch\u00E9ancier", tooLong && (_jsxs("span", { className: "text-muted text-sm", style: { marginLeft: 8, fontWeight: 400 }, children: ["(", result.nPayments, " versements \u2014 extrait)"] }))] }), _jsxs("table", { style: { width: '100%', fontSize: 13, borderCollapse: 'collapse' }, children: [_jsx("thead", { children: _jsxs("tr", { style: { textAlign: 'left', color: 'var(--text2, var(--text2))', borderBottom: '1px solid var(--border)' }, children: [_jsx("th", { style: { padding: '6px 8px', fontWeight: 500 }, children: "#" }), _jsx("th", { style: { padding: '6px 8px', fontWeight: 500 }, children: "P\u00E9riode" }), _jsx("th", { style: { padding: '6px 8px', fontWeight: 500 }, children: "Versement" }), _jsx("th", { style: { padding: '6px 8px', fontWeight: 500 }, children: "Int\u00E9r\u00EAts" }), _jsx("th", { style: { padding: '6px 8px', fontWeight: 500 }, children: "Capital acquis" })] }) }), _jsx("tbody", { children: visibleRows.map((row, idx) => (_jsxs(Fragment, { children: [tooLong && idx === SCHEDULE_HEAD && (_jsx("tr", { children: _jsxs("td", { colSpan: 5, style: { padding: '10px 8px', textAlign: 'center', color: 'var(--text2, var(--text2))', fontSize: 12 }, children: ["\u00B7\u00B7\u00B7 ", hiddenCount, " versements \u00B7\u00B7\u00B7"] }) })), _jsxs("tr", { style: {
                                                        borderBottom: '1px solid var(--border)',
                                                        background: row.index === result.nPayments ? 'rgba(99,102,241,0.08)' : undefined
                                                    }, children: [_jsx("td", { style: { padding: '6px 8px', color: 'var(--text2, var(--text2))' }, children: row.index }), _jsx("td", { style: { padding: '6px 8px' }, children: row.period }), _jsx("td", { style: { padding: '6px 8px' }, children: euro(row.paid) }), _jsx("td", { style: { padding: '6px 8px', color: row.interest > 0 ? 'var(--green)' : 'var(--text2, var(--text2))' }, children: row.interest > 0 ? `+${euro(row.interest)}` : '—' }), _jsx("td", { style: { padding: '6px 8px', fontWeight: row.index === result.nPayments ? 700 : undefined }, children: euro(row.capital) })] })] }, row.index))) })] })] })] }))] }));
}
