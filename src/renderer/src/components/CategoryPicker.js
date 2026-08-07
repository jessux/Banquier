import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { categoryHue } from '../utils/categoryColor';
function buildItems(categories, filter) {
    const lower = filter.toLowerCase().trim();
    const childMap = new Map();
    const topLevelSet = new Set();
    for (const cat of categories) {
        const sep = cat.indexOf(' > ');
        if (sep === -1) {
            topLevelSet.add(cat);
        }
        else {
            const parent = cat.slice(0, sep);
            if (!childMap.has(parent))
                childMap.set(parent, []);
            childMap.get(parent).push(cat);
        }
    }
    const allParents = [...new Set([...topLevelSet, ...Array.from(childMap.keys())])].sort();
    const items = [];
    for (const parent of allParents) {
        const children = childMap.get(parent) ?? [];
        const parentMatches = !lower || parent.toLowerCase().includes(lower);
        const matchingChildren = lower ? children.filter((c) => c.toLowerCase().includes(lower)) : children;
        if (!parentMatches && matchingChildren.length === 0)
            continue;
        items.push({ label: parent, value: parent, isGroup: matchingChildren.length > 0, depth: 0 });
        for (const child of matchingChildren) {
            const childLabel = child.slice(child.indexOf(' > ') + 3);
            items.push({ label: childLabel, value: child, isGroup: false, depth: 1 });
        }
    }
    return items;
}
export default function CategoryPicker({ value, onChange, categories, onConfirm, onCancel, inputRef, style, placeholder }) {
    const [open, setOpen] = useState(false);
    const [hilite, setHilite] = useState(-1);
    const [dropPos, setDropPos] = useState({ left: 0, width: 220 });
    const ownRef = useRef(null);
    const ref = inputRef ?? ownRef;
    const listRef = useRef(null);
    const MAX_DROP_HEIGHT = 260;
    const items = useMemo(() => buildItems(categories, value), [categories, value]);
    const updatePos = () => {
        if (!ref.current)
            return;
        const r = ref.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const width = Math.max(r.width, 220);
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
    const select = (item) => {
        onChange(item.value);
        setOpen(false);
        setHilite(-1);
        ref.current?.focus();
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setOpen(false);
            onCancel?.();
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            openDrop();
            setHilite((h) => Math.min(h + 1, items.length - 1));
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHilite((h) => Math.max(h - 1, 0));
            return;
        }
        if (e.key === 'Enter') {
            if (open && hilite >= 0 && hilite < items.length) {
                e.preventDefault();
                select(items[hilite]);
            }
            else {
                onConfirm?.();
            }
        }
    };
    return (_jsxs("div", { style: { position: 'relative', display: 'inline-block', ...style }, children: [_jsx("input", { ref: ref, value: value, placeholder: placeholder, onChange: (e) => { onChange(e.target.value); openDrop(); setHilite(-1); }, onFocus: openDrop, onKeyDown: handleKeyDown, style: { width: '100%' } }), open && items.length > 0 && createPortal(_jsx("div", { ref: listRef, style: {
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
                }, children: items.map((item, i) => {
                    const hue = categoryHue(item.value);
                    const dotColor = i === hilite ? 'rgba(255,255,255,0.7)' : `hsl(${hue},65%,60%)`;
                    return (_jsxs("div", { "data-idx": i, onMouseDown: (e) => { e.preventDefault(); select(item); }, onMouseEnter: () => setHilite(i), style: {
                            padding: item.depth === 1 ? '5px 12px 5px 24px' : '7px 12px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: i === hilite ? 'var(--accent)' : 'transparent',
                            color: i === hilite ? '#fff' : 'var(--text)',
                            fontSize: item.depth === 1 ? 12 : 13,
                            fontWeight: item.depth === 0 && item.isGroup ? 600 : 400,
                            borderTop: item.depth === 0 && i > 0 ? '1px solid rgba(46,49,71,0.4)' : 'none'
                        }, children: [item.depth === 1
                                ? _jsx("span", { style: { color: i === hilite ? 'rgba(255,255,255,0.4)' : 'var(--border)', flexShrink: 0 }, children: "\u2514\u2500" })
                                : _jsx("span", { style: { width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 } }), item.label] }, `${item.value}-${i}`));
                }) }), document.body)] }));
}
