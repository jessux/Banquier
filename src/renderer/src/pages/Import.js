import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
const DATE_FORMATS = ['DD/MM/YYYY', 'DD/MM/YY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const DELIMITERS = [
    { label: 'Virgule (,)', value: ',' },
    { label: 'Point-virgule (;)', value: ';' },
    { label: 'Tabulation', value: '\t' }
];
const FIELD_OPTIONS = [
    { value: '', label: '— ignorer —' },
    { value: '__date__', label: 'Date' },
    { value: '__description__', label: 'Description' },
    { value: '__amount__', label: 'Montant (signé)' },
    { value: '__debit__', label: 'Débit' },
    { value: '__credit__', label: 'Crédit' }
];
export default function Import() {
    const [step, setStep] = useState('drop');
    const [filePath, setFilePath] = useState(null);
    const [fileType, setFileType] = useState(null);
    const [preview, setPreview] = useState(null);
    const [columnMap, setColumnMap] = useState({});
    const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
    const [delimiter, setDelimiter] = useState(',');
    const [skipRows, setSkipRows] = useState(0);
    const [accounts, setAccounts] = useState([]);
    const [accountId, setAccountId] = useState(null);
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const dropRef = useRef(null);
    useEffect(() => {
        window.api.getAccounts().then(setAccounts);
    }, []);
    const handleFilePick = async () => {
        const path = await window.api.openFileDialog([
            { name: 'Relevés bancaires', extensions: ['csv', 'pdf'] }
        ]);
        if (!path)
            return;
        await loadFile(path);
    };
    const loadFile = async (path) => {
        setError(null);
        setFilePath(path);
        const ext = path.split('.').pop()?.toLowerCase();
        if (ext === 'csv') {
            setFileType('csv');
            try {
                const p = await window.api.previewCsv(path);
                setPreview(p);
                setDelimiter(p.detectedDelimiter);
                // Auto-map common column names — first match wins to avoid duplicate date columns
                const autoMap = {};
                const used = new Set();
                p.headers.forEach((h) => {
                    const lower = h.toLowerCase();
                    // Date: prefer "début" or exact "date", avoid "fin" if date already mapped
                    if (!used.has('__date__') && lower.includes('date') && !lower.includes('fin')) {
                        autoMap[h] = '__date__';
                        used.add('__date__');
                    }
                    else if (!used.has('__description__') && (lower.includes('lib') || lower.includes('opér') || lower.includes('label') || lower === 'description' || lower.includes('desc'))) {
                        autoMap[h] = '__description__';
                        used.add('__description__');
                    }
                    else if (!used.has('__amount__') && (lower.includes('montant') || lower === 'amount')) {
                        autoMap[h] = '__amount__';
                        used.add('__amount__');
                    }
                    else if (!used.has('__debit__') && (lower.includes('débit') || lower.includes('debit'))) {
                        autoMap[h] = '__debit__';
                        used.add('__debit__');
                    }
                    else if (!used.has('__credit__') && (lower.includes('crédit') || lower.includes('credit'))) {
                        autoMap[h] = '__credit__';
                        used.add('__credit__');
                    }
                });
                // Auto-detect date format from first data row
                const firstDateVal = p.rows[0]?.[p.headers.findIndex(h => autoMap[h] === '__date__')];
                if (firstDateVal && /^\d{4}-\d{2}-\d{2}/.test(firstDateVal.trim())) {
                    setDateFormat('YYYY-MM-DD');
                }
                else if (firstDateVal && /^\d{2}\/\d{2}\/\d{4}/.test(firstDateVal.trim())) {
                    setDateFormat('DD/MM/YYYY');
                }
                setColumnMap(autoMap);
                setStep('mapping');
            }
            catch (e) {
                setError(String(e));
            }
        }
        else if (ext === 'pdf') {
            setFileType('pdf');
            setStep('mapping');
        }
        else {
            setError('Format non supporté. Utilisez un fichier CSV ou PDF.');
        }
    };
    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (!file)
            return;
        // In Electron, we can get the path from the file object
        const path = file.path;
        loadFile(path);
    };
    const buildMapping = () => {
        if (!preview)
            return null;
        let dateCol = '', descriptionCol = '', amountCol = null;
        let debitCol = null, creditCol = null;
        Object.entries(columnMap).forEach(([header, role]) => {
            if (role === '__date__')
                dateCol = header;
            else if (role === '__description__')
                descriptionCol = header;
            else if (role === '__amount__')
                amountCol = header;
            else if (role === '__debit__')
                debitCol = header;
            else if (role === '__credit__')
                creditCol = header;
        });
        if (!dateCol || !descriptionCol || (!amountCol && !debitCol)) {
            setError('Veuillez mapper au moins : Date, Description, et Montant (ou Débit).');
            return null;
        }
        return { dateCol, descriptionCol, amountCol, debitCol, creditCol, dateFormat, delimiter, skipRows };
    };
    const handleImport = async () => {
        if (!filePath)
            return;
        setError(null);
        setLoading(true);
        try {
            let res;
            if (fileType === 'csv') {
                const mapping = buildMapping();
                if (!mapping) {
                    setLoading(false);
                    return;
                }
                res = await window.api.importCsv(filePath, mapping, accountId);
            }
            else {
                res = await window.api.importPdf(filePath, accountId);
            }
            setResult(res);
            setStep('result');
        }
        catch (e) {
            setError(String(e));
        }
        finally {
            setLoading(false);
        }
    };
    const reset = () => {
        setStep('drop');
        setFilePath(null);
        setFileType(null);
        setPreview(null);
        setColumnMap({});
        setResult(null);
        setError(null);
    };
    const filename = filePath ? filePath.split(/[\\/]/).pop() : '';
    return (_jsxs("div", { children: [_jsx("div", { className: "page-header", children: _jsx("h1", { className: "page-title", children: "Importer un relev\u00E9" }) }), step === 'drop' && (_jsxs(_Fragment, { children: [_jsxs("div", { ref: dropRef, className: `drop-zone ${dragOver ? 'drag-over' : ''}`, onClick: handleFilePick, onDragOver: (e) => { e.preventDefault(); setDragOver(true); }, onDragLeave: () => setDragOver(false), onDrop: handleDrop, children: [_jsx("div", { className: "drop-zone-icon", children: "\uD83D\uDCC2" }), _jsx("p", { style: { fontSize: 16, marginBottom: 6 }, children: "Glissez un fichier ici ou cliquez pour parcourir" }), _jsx("p", { className: "text-muted text-sm", children: "Formats support\u00E9s : CSV, PDF" })] }), error && _jsx("p", { style: { color: 'var(--red)', marginTop: 12 }, children: error })] })), step === 'mapping' && (_jsxs("div", { style: { maxWidth: 700 }, children: [_jsxs("p", { className: "text-muted", style: { marginBottom: 20 }, children: ["Fichier : ", _jsx("strong", { children: filename })] }), accounts.length > 0 && (_jsxs("div", { className: "form-group", children: [_jsx("label", { children: "Compte bancaire (optionnel)" }), _jsxs("select", { value: accountId ?? '', onChange: (e) => setAccountId(e.target.value ? Number(e.target.value) : null), children: [_jsx("option", { value: "", children: "Aucun compte associ\u00E9" }), accounts.map((a) => (_jsxs("option", { value: a.id, children: [a.name, " \u2014 ", a.bank] }, a.id)))] })] })), fileType === 'csv' && preview && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "grid-2", style: { marginBottom: 16 }, children: [_jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "Format de date" }), _jsx("select", { value: dateFormat, onChange: (e) => setDateFormat(e.target.value), children: DATE_FORMATS.map((f) => _jsx("option", { children: f }, f)) })] }), _jsxs("div", { className: "form-group", style: { marginBottom: 0 }, children: [_jsx("label", { children: "S\u00E9parateur CSV" }), _jsx("select", { value: delimiter, onChange: (e) => setDelimiter(e.target.value), children: DELIMITERS.map((d) => _jsx("option", { value: d.value, children: d.label }, d.value)) })] })] }), _jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("div", { className: "card-title", style: { marginBottom: 12 }, children: "Correspondance des colonnes" }), _jsxs("table", { className: "mapping-table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { style: { background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }, children: "Colonne CSV" }), _jsx("th", { style: { background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }, children: "Correspond \u00E0" }), _jsx("th", { style: { background: 'none', padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }, children: "Exemple" })] }) }), _jsx("tbody", { children: preview.headers.map((h, i) => (_jsxs("tr", { children: [_jsx("td", { style: { fontWeight: 500 }, children: h }), _jsx("td", { children: _jsx("select", { value: columnMap[h] ?? '', onChange: (e) => setColumnMap({ ...columnMap, [h]: e.target.value }), style: { width: 200 }, children: FIELD_OPTIONS.map((o) => (_jsx("option", { value: o.value, children: o.label }, o.value))) }) }), _jsx("td", { className: "text-muted text-sm", children: preview.rows[0]?.[i] ?? '' })] }, h))) })] })] })] })), fileType === 'pdf' && (_jsxs("div", { className: "card", style: { marginBottom: 20 }, children: [_jsx("p", { style: { marginBottom: 8 }, children: "Le PDF sera analys\u00E9 automatiquement par le LLM pour extraire les transactions." }), _jsx("p", { className: "text-muted text-sm", children: "Assurez-vous que votre cl\u00E9 API OpenRouter est configur\u00E9e dans les Param\u00E8tres." })] })), error && _jsx("p", { style: { color: 'var(--red)', marginBottom: 12 }, children: error }), _jsxs("div", { style: { display: 'flex', gap: 10 }, children: [_jsx("button", { className: "btn btn-secondary", onClick: reset, children: "Retour" }), _jsx("button", { className: "btn btn-primary", onClick: handleImport, disabled: loading, children: loading ? _jsxs(_Fragment, { children: [_jsx("span", { className: "spinner" }), "Importation..."] }) : 'Importer' })] })] })), step === 'result' && result && (_jsxs("div", { style: { maxWidth: 500 }, children: [_jsxs("div", { className: "card", children: [_jsx("div", { style: { fontSize: 48, textAlign: 'center', marginBottom: 16 }, children: result.errors > 0 ? '⚠️' : '✅' }), _jsx("h2", { style: { textAlign: 'center', marginBottom: 20 }, children: "Import termin\u00E9" }), _jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Transactions import\u00E9es" }), _jsx("span", { className: "badge badge-success", children: result.imported })] }), _jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Doublons ignor\u00E9s" }), _jsx("span", { className: "badge badge-warning", children: result.duplicates })] }), result.errors > 0 && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { children: "Erreurs" }), _jsx("span", { className: "badge badge-error", children: result.errors })] }))] })] }), _jsx("div", { style: { display: 'flex', gap: 10, marginTop: 16 }, children: _jsx("button", { className: "btn btn-secondary", onClick: reset, children: "Importer un autre fichier" }) })] }))] }));
}
