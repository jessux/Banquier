import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
const navItems = [
    { id: 'dashboard', label: 'Tableau de bord', icon: '📊' },
    { id: 'transactions', label: 'Transactions', icon: '📋' },
    { id: 'recurring', label: 'Récurrences', icon: '🔁' },
    { id: 'budget', label: 'Budgets', icon: '🎯' },
    { id: 'comparaison', label: 'Comparer', icon: '⚖️' },
    { id: 'patrimoine', label: 'Patrimoine', icon: '💎' },
    { id: 'simulateur', label: 'Simulateur épargne', icon: '🎓' },
    { id: 'categories', label: 'Catégories', icon: '🏷️' },
    { id: 'rules', label: 'Règles auto', icon: '⚡' },
    { id: 'chat', label: 'Analyser avec IA', icon: '🤖' },
    { id: 'settings', label: 'Paramètres', icon: '⚙️' }
];
export default function Sidebar({ activePage, onNavigate }) {
    const [state, setState] = useState(null);
    const [showMenu, setShowMenu] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState('');
    const [renamingId, setRenamingId] = useState(null);
    const [renameName, setRenameName] = useState('');
    const [deletingId, setDeletingId] = useState(null);
    const menuRef = useRef(null);
    useEffect(() => {
        window.api.getProfiles().then(setState);
    }, []);
    useEffect(() => {
        if (!showMenu)
            return;
        const handler = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) {
                closeMenu();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showMenu]);
    const closeMenu = () => {
        setShowMenu(false);
        setCreating(false);
        setNewName('');
        setRenamingId(null);
        setRenameName('');
        setDeletingId(null);
    };
    const activeName = state?.profiles.find((p) => p.id === state.active)?.name ?? '…';
    const handleSwitch = async (id) => {
        if (id === state?.active) {
            closeMenu();
            return;
        }
        await window.api.switchProfile(id);
        closeMenu();
    };
    const handleCreate = async () => {
        const trimmed = newName.trim();
        if (!trimmed)
            return;
        const next = await window.api.createProfile(trimmed);
        setState(next);
        setCreating(false);
        setNewName('');
        await window.api.switchProfile(next.profiles[next.profiles.length - 1].id);
    };
    const handleRename = async (id) => {
        const trimmed = renameName.trim();
        if (!trimmed)
            return;
        const next = await window.api.renameProfile(id, trimmed);
        setState(next);
        setRenamingId(null);
        setRenameName('');
    };
    const handleDelete = async (id) => {
        const next = await window.api.deleteProfile(id);
        setState(next);
        setDeletingId(null);
        if (state?.active === id) {
            await window.api.switchProfile('default');
        }
    };
    return (_jsxs("nav", { className: "sidebar", children: [_jsxs("div", { className: "sidebar-logo", children: [_jsx("span", { children: "B" }), "anquier"] }), _jsx("div", { className: "sidebar-nav", children: navItems.map((item) => (_jsxs("button", { className: `nav-item ${activePage === item.id ? 'active' : ''}`, onClick: () => onNavigate(item.id), children: [_jsx("span", { className: "nav-icon", children: item.icon }), item.label] }, item.id))) }), _jsxs("div", { style: { marginTop: 'auto', padding: '12px 12px 16px', position: 'relative' }, ref: menuRef, children: [_jsxs("button", { onClick: () => setShowMenu((v) => !v), style: {
                            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)',
                            background: showMenu ? 'var(--bg-hover)' : 'transparent',
                            cursor: 'pointer', color: 'var(--text2)', fontSize: 13
                        }, children: [_jsx("span", { style: { fontSize: 15 }, children: "\uD83D\uDC64" }), _jsx("span", { style: { flex: 1, textAlign: 'left', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, children: activeName }), _jsx("span", { style: { fontSize: 10, opacity: 0.5 }, children: "\u25B2" })] }), showMenu && state && (_jsxs("div", { style: {
                            position: 'absolute', bottom: '100%', left: 12, right: 12,
                            background: 'var(--card-bg)', border: '1px solid var(--border)',
                            borderRadius: 10, padding: '8px 0', zIndex: 200,
                            boxShadow: '0 -4px 20px rgba(0,0,0,0.3)'
                        }, children: [_jsx("div", { style: { padding: '4px 12px 8px', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }, children: "Profils" }), state.profiles.map((p) => (_jsx("div", { children: renamingId === p.id ? (_jsxs("div", { style: { display: 'flex', gap: 4, padding: '4px 8px' }, children: [_jsx("input", { autoFocus: true, value: renameName, onChange: (e) => setRenameName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                                handleRename(p.id); if (e.key === 'Escape') {
                                                setRenamingId(null);
                                            } }, style: { flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 5 } }), _jsx("button", { className: "btn btn-primary", style: { padding: '3px 8px', fontSize: 11 }, onClick: () => handleRename(p.id), children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 6px', fontSize: 11 }, onClick: () => setRenamingId(null), children: "\u2715" })] })) : deletingId === p.id ? (_jsxs("div", { style: { padding: '6px 12px', fontSize: 12 }, children: [_jsxs("div", { style: { color: 'var(--red)', marginBottom: 6 }, children: ["Supprimer ", _jsx("strong", { children: p.name }), " ?"] }), _jsxs("div", { style: { display: 'flex', gap: 6 }, children: [_jsx("button", { className: "btn btn-secondary", style: { padding: '2px 8px', fontSize: 11, color: 'var(--red)', borderColor: 'rgba(239,68,68,0.4)' }, onClick: () => handleDelete(p.id), children: "Oui" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '2px 8px', fontSize: 11 }, onClick: () => setDeletingId(null), children: "Non" })] })] })) : (_jsxs("div", { style: { display: 'flex', alignItems: 'center', padding: '6px 8px 6px 12px', gap: 4 }, children: [_jsxs("button", { onClick: () => handleSwitch(p.id), style: {
                                                flex: 1, textAlign: 'left', background: 'none', border: 'none',
                                                cursor: 'pointer', fontSize: 13, color: p.id === state.active ? 'var(--primary)' : 'var(--text2)',
                                                fontWeight: p.id === state.active ? 600 : 400, padding: 0
                                            }, children: [p.id === state.active && _jsx("span", { style: { marginRight: 6 }, children: "\u2713" }), p.name] }), _jsx("button", { title: "Renommer", onClick: () => { setRenamingId(p.id); setRenameName(p.name); }, style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12, padding: '2px 4px', borderRadius: 4 }, children: "\u270F\uFE0F" }), p.id !== 'default' && (_jsx("button", { title: "Supprimer", onClick: () => setDeletingId(p.id), style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: 12, padding: '2px 4px', borderRadius: 4, opacity: 0.7 }, children: "\u2715" }))] })) }, p.id))), _jsx("div", { style: { borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }, children: creating ? (_jsxs("div", { style: { display: 'flex', gap: 4, padding: '6px 8px' }, children: [_jsx("input", { autoFocus: true, value: newName, onChange: (e) => setNewName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter')
                                                handleCreate(); if (e.key === 'Escape') {
                                                setCreating(false);
                                                setNewName('');
                                            } }, placeholder: "Nom du profil", style: { flex: 1, fontSize: 12, padding: '4px 6px', borderRadius: 5 } }), _jsx("button", { className: "btn btn-primary", style: { padding: '3px 8px', fontSize: 11 }, onClick: handleCreate, disabled: !newName.trim(), children: "OK" }), _jsx("button", { className: "btn btn-secondary", style: { padding: '3px 6px', fontSize: 11 }, onClick: () => { setCreating(false); setNewName(''); }, children: "\u2715" })] })) : (_jsx("button", { onClick: () => setCreating(true), style: {
                                        width: '100%', textAlign: 'left', padding: '7px 12px', background: 'none',
                                        border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)'
                                    }, children: "+ Nouveau profil" })) })] }))] })] }));
}
