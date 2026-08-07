import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
const MAX_DROP_HEIGHT = 260;
export default function TickerPicker({ type, value, onChange, onSelect, placeholder }) {
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [hilite, setHilite] = useState(-1);
    const [dropPos, setDropPos] = useState({ left: 0, width: 280 });
    const ref = useRef(null);
    const listRef = useRef(null);
    const reqId = useRef(0);
    useEffect(() => {
        const q = value.trim();
        if (q.length < 1) {
            setResults([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        const id = ++reqId.current;
        const timer = setTimeout(async () => {
            try {
                const res = await window.api.searchSymbol(type, q);
                if (id === reqId.current)
                    setResults(res);
            }
            finally {
                if (id === reqId.current)
                    setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [value, type]);
    const updatePos = () => {
        if (!ref.current)
            return;
        const r = ref.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const width = Math.max(r.width, 280);
        if (spaceBelow < MAX_DROP_HEIGHT && r.top > spaceBelow) {
            setDropPos({ bottom: window.innerHeight - r.top + 2, left: r.left, width });
        }
        else {
            setDropPos({ top: r.bottom + 2, left: r.left, width });
        }
    };
    const openDrop = () => { updatePos(); setOpen(true); };
    useEffect(() => {
        if (!open)
            return;
        const close = (e) => {
            if (ref.current?.contains(e.target))
                return;
            if (listRef.current?.contains(e.target))
                return;
            setOpen(false);
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [open]);
    useEffect(() => {
        if (!listRef.current || hilite < 0)
            return;
        const el = listRef.current.querySelector(`[data-idx="${hilite}"]`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [hilite]);
    const select = (s) => {
        onChange(s.symbol);
        onSelect?.(s);
        setOpen(false);
        setHilite(-1);
        ref.current?.focus();
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setOpen(false);
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            openDrop();
            setHilite((h) => Math.min(h + 1, results.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHilite((h) => Math.max(h - 1, 0));
            return;
        }
        if (e.key === 'Enter' && open && hilite >= 0 && hilite < results.length) {
            e.preventDefault();
            select(results[hilite]);
        }
    };
    return (_jsxs("div", { style: { position: 'relative' }, children: [_jsx("input", { ref: ref, value: value, placeholder: placeholder, onChange: (e) => { onChange(e.target.value); openDrop(); setHilite(-1); }, onFocus: openDrop, onKeyDown: handleKeyDown, autoComplete: "off" }), open && (loading || results.length > 0 || value.trim().length > 0) && createPortal(_jsxs("div", { ref: listRef, style: {
                    position: 'fixed',
                    top: dropPos.top,
                    bottom: dropPos.bottom,
                    left: dropPos.left,
                    width: dropPos.width,
                    maxHeight: MAX_DROP_HEIGHT,
                    overflowY: 'auto',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    zIndex: 9999,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)'
                }, children: [loading && (_jsx("div", { style: { padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }, children: "Recherche\u2026" })), !loading && results.length === 0 && (_jsx("div", { style: { padding: '8px 12px', fontSize: 12, color: 'var(--text2)' }, children: "Aucun r\u00E9sultat" })), !loading && results.map((s, i) => (_jsxs("div", { "data-idx": i, onMouseDown: (e) => { e.preventDefault(); select(s); }, onMouseEnter: () => setHilite(i), style: {
                            padding: '7px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                            background: i === hilite ? 'var(--accent)' : 'transparent',
                            color: i === hilite ? '#fff' : 'var(--text)',
                            fontSize: 13
                        }, children: [_jsx("span", { style: { fontWeight: 600, flexShrink: 0 }, children: s.symbol }), _jsxs("span", { style: {
                                    color: i === hilite ? 'rgba(255,255,255,0.75)' : 'var(--text2)',
                                    fontSize: 12,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textAlign: 'right'
                                }, children: [s.name, s.exchange ? ` · ${s.exchange}` : ''] })] }, `${s.symbol}-${i}`)))] }), document.body)] }));
}
