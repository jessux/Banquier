import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Component } from 'react';
export class ErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error, info) {
        console.error('[ErrorBoundary]', error, info.componentStack);
    }
    render() {
        if (!this.state.error)
            return this.props.children;
        return (_jsxs("div", { style: { padding: 32, maxWidth: 640, margin: '0 auto' }, children: [_jsx("h1", { style: { fontSize: 18, marginBottom: 12 }, children: "Une erreur est survenue" }), _jsx("p", { className: "text-muted", style: { marginBottom: 16 }, children: "L'application a rencontr\u00E9 un probl\u00E8me inattendu. Vous pouvez essayer de recharger la page." }), _jsx("pre", { style: {
                        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6,
                        padding: 12, fontSize: 12, color: 'var(--text2)', overflow: 'auto', marginBottom: 16
                    }, children: this.state.error.message }), _jsx("button", { onClick: () => { this.setState({ error: null }); window.location.reload(); }, style: {
                        padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600
                    }, children: "Recharger l'application" })] }));
    }
}
