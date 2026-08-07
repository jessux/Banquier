import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
function AddRow({ under, addingUnder, inputRef, newName, setNewName, setError, error, confirmAdd, cancelAdd }) {
    if (addingUnder !== under)
        return null;
    return (_jsxs("div", { style: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0' }, children: [_jsx("input", { ref: inputRef, value: newName, onChange: (e) => { setNewName(e.target.value); setError(''); }, placeholder: "Nom de la cat\u00E9gorie", style: { width: 220 }, onKeyDown: (e) => { if (e.key === 'Enter')
                    confirmAdd(); if (e.key === 'Escape')
                    cancelAdd(); } }), _jsx("button", { className: "btn btn-primary", style: { padding: '4px 12px' }, onClick: confirmAdd, children: "Ajouter" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '4px 10px' }, onClick: cancelAdd, children: "\u2715" }), error && _jsx("span", { style: { color: 'var(--red)', fontSize: 12 }, children: error })] }));
}
function EditInline({ id, currentName, siblings, onDone }) {
    const [value, setValue] = useState(currentName);
    const [error, setError] = useState('');
    const ref = useRef(null);
    useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
    const confirm = async () => {
        const name = value.trim();
        if (!name)
            return;
        if (name === currentName) {
            onDone();
            return;
        }
        if (siblings.some((c) => c.id !== id && c.name.toLowerCase() === name.toLowerCase())) {
            setError('Ce nom existe déjà.');
            return;
        }
        await window.api.renameCategory(id, name);
        onDone();
    };
    return (_jsxs("div", { style: { display: 'flex', gap: 6, alignItems: 'center', flex: 1 }, children: [_jsx("input", { ref: ref, value: value, onChange: (e) => { setValue(e.target.value); setError(''); }, style: { width: 200 }, onKeyDown: (e) => { if (e.key === 'Enter')
                    confirm(); if (e.key === 'Escape')
                    onDone(); } }), _jsx("button", { className: "btn btn-primary", style: { padding: '3px 10px', fontSize: 12 }, onClick: confirm, children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 8px', fontSize: 12 }, onClick: onDone, children: "\u2715" }), error && _jsx("span", { style: { color: 'var(--red)', fontSize: 12 }, children: error })] }));
}
export default function Categories() {
    const [tree, setTree] = useState([]);
    const [addingUnder, setAddingUnder] = useState(null);
    const [newName, setNewName] = useState('');
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const inputRef = useRef(null);
    const load = () => window.api.getCategoryTree().then(setTree);
    useEffect(() => { load(); }, []);
    useEffect(() => {
        if (addingUnder !== null && inputRef.current)
            inputRef.current.focus();
    }, [addingUnder]);
    const topLevel = tree.filter((c) => c.parent_id === null);
    const childrenOf = (id) => tree.filter((c) => c.parent_id === id);
    const startAdd = (under) => {
        setEditingId(null);
        setAddingUnder(under);
        setNewName('');
        setError('');
    };
    const cancelAdd = () => { setAddingUnder(null); setNewName(''); setError(''); };
    const confirmAdd = async () => {
        const name = newName.trim();
        if (!name)
            return;
        const parentId = addingUnder === 'top' ? undefined : addingUnder;
        const siblings = parentId == null ? topLevel : childrenOf(parentId);
        if (siblings.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
            setError('Ce nom existe déjà à ce niveau.');
            return;
        }
        await window.api.createCategory(name, parentId);
        cancelAdd();
        load();
    };
    const deleteCategory = async (id, name, hasChildren) => {
        const msg = hasChildren
            ? `Supprimer "${name}" et toutes ses sous-catégories ?`
            : `Supprimer "${name}" ?`;
        if (!confirm(msg))
            return;
        await window.api.deleteCategory(id);
        load();
    };
    const finishEdit = () => { setEditingId(null); load(); };
    const addRowProps = { addingUnder, inputRef, newName, setNewName, setError, error, confirmAdd, cancelAdd };
    const editBtn = (id) => (_jsx("button", { style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px', lineHeight: 1 }, onClick: () => { setAddingUnder(null); setEditingId(id); }, title: "Renommer", children: "\u270E" }));
    return (_jsxs("div", { children: [_jsxs("div", { className: "page-header", children: [_jsx("h1", { className: "page-title", children: "Cat\u00E9gories" }), _jsx("button", { className: "btn btn-primary", onClick: () => startAdd('top'), children: "+ Nouvelle cat\u00E9gorie" })] }), _jsxs("div", { style: { maxWidth: 640 }, children: [addingUnder === 'top' && (_jsx("div", { className: "card", style: { marginBottom: 16, padding: '12px 16px' }, children: _jsx(AddRow, { under: "top", ...addRowProps }) })), topLevel.length === 0 && addingUnder !== 'top' && (_jsx("div", { className: "empty-state", children: _jsx("p", { className: "text-muted", children: "Aucune cat\u00E9gorie. Cr\u00E9ez-en une pour commencer." }) })), topLevel.map((cat) => {
                        const children = childrenOf(cat.id);
                        return (_jsxs("div", { className: "card", style: { marginBottom: 10, padding: 0 }, children: [_jsxs("div", { style: {
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '12px 16px',
                                        borderBottom: children.length > 0 || addingUnder === cat.id ? '1px solid var(--border)' : 'none'
                                    }, children: [editingId === cat.id ? (_jsx(EditInline, { id: cat.id, currentName: cat.name, siblings: topLevel, onDone: finishEdit })) : (_jsx("span", { style: { fontWeight: 600, flex: 1, fontSize: 14 }, children: cat.name })), editingId !== cat.id && _jsxs(_Fragment, { children: [editBtn(cat.id), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 10px', fontSize: 12 }, onClick: () => startAdd(cat.id), title: "Ajouter une sous-cat\u00E9gorie", children: "+ Sous-cat\u00E9gorie" }), _jsx("button", { style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 16, padding: '0 4px', lineHeight: 1 }, onClick: () => deleteCategory(cat.id, cat.name, children.length > 0), title: "Supprimer", children: "\u2715" })] })] }), children.map((sub, idx) => (_jsxs("div", { style: {
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '9px 16px 9px 32px',
                                        borderBottom: idx < children.length - 1 || addingUnder === cat.id ? '1px solid #1e2130' : 'none',
                                        background: '#171a24'
                                    }, children: [_jsx("span", { style: { color: 'var(--text3)', marginRight: 4, fontSize: 12 }, children: "\u2514\u2500" }), editingId === sub.id ? (_jsx(EditInline, { id: sub.id, currentName: sub.name, siblings: children, onDone: finishEdit })) : (_jsx("span", { style: { flex: 1, fontSize: 13 }, children: sub.name })), editingId !== sub.id && _jsxs(_Fragment, { children: [editBtn(sub.id), _jsx("button", { style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', fontSize: 14, padding: '0 4px', lineHeight: 1 }, onClick: () => deleteCategory(sub.id, sub.name, false), title: "Supprimer", children: "\u2715" })] })] }, sub.id))), addingUnder === cat.id && (_jsx("div", { style: { padding: '10px 16px 10px 32px', background: '#171a24' }, children: _jsx(AddRow, { under: cat.id, ...addRowProps }) }))] }, cat.id));
                    })] })] }));
}
