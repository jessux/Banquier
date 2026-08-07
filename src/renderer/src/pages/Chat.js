import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const QUICK_QUESTIONS = [
    'Résumé de mes finances ce mois',
    'Où est-ce que je dépense le plus ?',
    'Comment réduire mes dépenses ?',
    'Quelles sont mes dépenses inhabituelles ?',
    'Évolution de mes dépenses sur 3 mois'
];
const TOOL_LABELS = {
    get_transactions: '🔍 Transactions',
    get_category_stats: '📊 Catégories',
    get_monthly_stats: '📈 Tendance mensuelle',
    get_accounts: '🏦 Comptes',
    get_top_merchants: '🏪 Top marchands',
    get_largest_transactions: '💸 Grosses dépenses',
    compare_periods: '⚖️ Comparaison',
    get_uncategorized: '❓ Non catégorisé',
    get_net_balance: '💰 Solde net',
    save_memory: '🧠 Mémorisation'
};
export default function Chat() {
    const [threads, setThreads] = useState([]);
    const [activeThreadId, setActiveThreadId] = useState(null);
    const [messages, setMessages] = useState([]);
    const [memories, setMemories] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const lastSentTextRef = useRef('');
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    // Charge la liste des conversations au démarrage et ouvre la plus récente.
    useEffect(() => {
        void (async () => {
            const list = await window.api.chatThreadsList();
            setThreads(list);
            if (list.length > 0) {
                setActiveThreadId(list[0].id);
                await loadMessages(list[0].id);
            }
            setMemories(await window.api.memoriesList());
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const loadMessages = async (threadId) => {
        const stored = await window.api.chatThreadMessages(threadId);
        setMessages(stored.map((m) => ({ role: m.role, content: m.content, toolCalls: m.toolCalls, reasoning: m.reasoning })));
    };
    const deleteMemory = async (id) => {
        await window.api.memoryDelete(id);
        setMemories(await window.api.memoriesList());
    };
    const selectThread = async (threadId) => {
        if (loading || threadId === activeThreadId)
            return;
        setActiveThreadId(threadId);
        await loadMessages(threadId);
    };
    const newThread = async () => {
        if (loading)
            return;
        setActiveThreadId(null);
        setMessages([]);
        setInput('');
    };
    const deleteThread = async (threadId, e) => {
        e.stopPropagation();
        if (loading)
            return;
        if (!window.confirm('Supprimer cette conversation ?'))
            return;
        await window.api.chatThreadDelete(threadId);
        const list = await window.api.chatThreadsList();
        setThreads(list);
        if (threadId === activeThreadId) {
            if (list.length > 0) {
                setActiveThreadId(list[0].id);
                await loadMessages(list[0].id);
            }
            else {
                setActiveThreadId(null);
                setMessages([]);
            }
        }
    };
    const send = async (text) => {
        if (!text.trim() || loading)
            return;
        // Crée une conversation à la volée si aucune n'est active.
        let threadId = activeThreadId;
        if (threadId === null) {
            const thread = await window.api.chatThreadCreate();
            threadId = thread.id;
            setActiveThreadId(thread.id);
            setThreads((prev) => [thread, ...prev]);
        }
        lastSentTextRef.current = text.trim();
        const userMessage = { role: 'user', content: text.trim() };
        const newMessages = [...messages, userMessage];
        setMessages([...newMessages, { role: 'assistant', content: '' }]);
        setInput('');
        setLoading(true);
        let fullResponse = '';
        let fullReasoning = '';
        let collectedToolCalls = [];
        const updateAssistant = () => {
            setMessages([
                ...newMessages,
                { role: 'assistant', content: fullResponse, toolCalls: collectedToolCalls, reasoning: fullReasoning || undefined }
            ]);
        };
        try {
            await window.api.chat(threadId, text.trim(), (chunk) => {
                fullResponse += chunk;
                updateAssistant();
            }, (name) => {
                collectedToolCalls = [...collectedToolCalls, TOOL_LABELS[name] ?? name];
                updateAssistant();
            }, (chunk) => {
                fullReasoning += chunk;
                updateAssistant();
            });
            // Rafraîchit la liste (titre auto + ordre par dernière activité) et la
            // mémoire IA (le modèle a pu enregistrer de nouvelles informations).
            const list = await window.api.chatThreadsList();
            setThreads(list);
            setMemories(await window.api.memoriesList());
        }
        catch (e) {
            const msg = String(e);
            const isRateLimit = msg.includes('429') || /ratelimit|rate.limit|rate_limit/i.test(msg);
            setMessages([
                ...newMessages,
                {
                    role: 'assistant',
                    content: `Erreur : ${msg}`,
                    retryText: isRateLimit ? text.trim() : undefined
                }
            ]);
        }
        finally {
            setLoading(false);
        }
    };
    const retry = async (retryText) => {
        if (loading)
            return;
        // Remove the error assistant message (last entry); user message stays
        const withoutError = messages.slice(0, -1);
        const newMessages = withoutError;
        setMessages([...newMessages, { role: 'assistant', content: '' }]);
        setLoading(true);
        let threadId = activeThreadId;
        if (threadId === null)
            return;
        let fullResponse = '';
        let fullReasoning = '';
        let collectedToolCalls = [];
        const updateAssistant = () => {
            setMessages([
                ...newMessages,
                { role: 'assistant', content: fullResponse, toolCalls: collectedToolCalls, reasoning: fullReasoning || undefined }
            ]);
        };
        try {
            await window.api.chat(threadId, retryText, (chunk) => { fullResponse += chunk; updateAssistant(); }, (name) => { collectedToolCalls = [...collectedToolCalls, TOOL_LABELS[name] ?? name]; updateAssistant(); }, (chunk) => { fullReasoning += chunk; updateAssistant(); });
            const list = await window.api.chatThreadsList();
            setThreads(list);
            setMemories(await window.api.memoriesList());
        }
        catch (e) {
            const msg = String(e);
            const isRateLimit = msg.includes('429') || /ratelimit|rate.limit|rate_limit/i.test(msg);
            setMessages([
                ...newMessages,
                {
                    role: 'assistant',
                    content: `Erreur : ${msg}`,
                    retryText: isRateLimit ? retryText : undefined
                }
            ]);
        }
        finally {
            setLoading(false);
        }
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send(input);
        }
    };
    return (_jsxs("div", { className: "chat-layout", children: [_jsxs("aside", { className: "thread-sidebar", children: [_jsx("button", { className: "btn btn-primary thread-new-btn", onClick: newThread, disabled: loading, children: "+ Nouvelle conversation" }), _jsxs("div", { className: "thread-list", children: [threads.length === 0 && (_jsx("p", { className: "text-muted text-sm", style: { padding: '8px 4px' }, children: "Aucune conversation pour l'instant." })), threads.map((t) => (_jsxs("div", { className: `thread-item ${t.id === activeThreadId ? 'active' : ''}`, onClick: () => selectThread(t.id), children: [_jsx("span", { className: "thread-title", children: t.title }), _jsx("button", { className: "thread-delete", title: "Supprimer", onClick: (e) => deleteThread(t.id, e), children: "\u2715" })] }, t.id)))] }), memories.length > 0 && (_jsxs("div", { style: { marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }, children: [_jsxs("p", { style: { fontSize: 12, color: 'var(--text3)', margin: '0 4px 6px' }, children: ["\uD83E\uDDE0 M\u00E9moire IA (", memories.length, ")"] }), _jsx("div", { style: { maxHeight: 180, overflowY: 'auto' }, children: memories.map((m) => (_jsxs("div", { title: m.content, style: {
                                        display: 'flex', alignItems: 'center', gap: 6,
                                        padding: '4px 6px', borderRadius: 6, fontSize: 11, color: '#8b93a7'
                                    }, children: [_jsx("span", { style: {
                                                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }, children: m.content }), _jsx("button", { className: "thread-delete", title: "Oublier", onClick: () => deleteMemory(m.id), children: "\u2715" })] }, m.id))) })] }))] }), _jsxs("div", { className: "chat-container", children: [_jsx("div", { className: "page-header", style: { marginBottom: 12 }, children: _jsx("h1", { className: "page-title", children: "Analyse IA" }) }), messages.length === 0 && (_jsxs("div", { style: { marginBottom: 16 }, children: [_jsx("p", { className: "text-muted", style: { marginBottom: 12, fontSize: 13 }, children: "Questions rapides :" }), _jsx("div", { className: "quick-questions", children: QUICK_QUESTIONS.map((q) => (_jsx("button", { className: "quick-btn", onClick: () => send(q), children: q }, q))) })] })), _jsxs("div", { className: "chat-messages", children: [messages.length === 0 && (_jsxs("div", { className: "empty-state", style: { paddingTop: 32 }, children: [_jsx("div", { style: { fontSize: 48, marginBottom: 12 }, children: "\uD83E\uDD16" }), _jsx("p", { style: { fontSize: 16, marginBottom: 6 }, children: "Assistant financier IA" }), _jsx("p", { className: "text-muted text-sm", children: "Posez une question sur vos finances ou choisissez une suggestion ci-dessus." })] })), messages.map((msg, i) => {
                                // Detect rate-limit errors from content (handles DB-loaded messages too)
                                const effectiveRetryText = msg.retryText ??
                                    (msg.role === 'assistant' &&
                                        (msg.content.includes('429') || /RateLimitCapacity/i.test(msg.content)) &&
                                        i > 0 && messages[i - 1].role === 'user'
                                        ? messages[i - 1].content
                                        : undefined);
                                return (_jsxs("div", { className: `chat-message ${msg.role}`, children: [_jsx("div", { className: "chat-avatar", children: msg.role === 'user' ? '👤' : '🤖' }), _jsx("div", { className: "chat-bubble", children: msg.role === 'assistant' ? (_jsxs(_Fragment, { children: [msg.reasoning && (_jsxs("details", { open: loading && i === messages.length - 1 && !msg.content, style: {
                                                            marginBottom: 10, padding: '6px 10px', borderRadius: 8,
                                                            background: '#161927', border: '1px solid var(--border)'
                                                        }, children: [_jsx("summary", { style: { cursor: 'pointer', fontSize: 12, color: 'var(--text3)', userSelect: 'none' }, children: "\uD83E\uDDE0 Raisonnement du mod\u00E8le" }), _jsx("div", { style: {
                                                                    marginTop: 6, fontSize: 12, color: '#8b93a7', fontStyle: 'italic',
                                                                    whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto'
                                                                }, children: msg.reasoning })] })), msg.toolCalls && msg.toolCalls.length > 0 && (_jsx("div", { style: { display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: msg.content ? 10 : 0 }, children: msg.toolCalls.map((tc, j) => (_jsx("span", { style: {
                                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                                padding: '2px 8px', borderRadius: 999,
                                                                background: '#1e2130', border: '1px solid var(--border)',
                                                                fontSize: 11, color: 'var(--text3)'
                                                            }, children: tc }, j))) })), effectiveRetryText ? (_jsxs("div", { style: { display: 'flex', flexDirection: 'column', gap: 10 }, children: [_jsxs("div", { style: {
                                                                    padding: '10px 14px', borderRadius: 8,
                                                                    background: '#2a1a1a', border: '1px solid #7f1d1d',
                                                                    color: '#fca5a5', fontSize: 13
                                                                }, children: [_jsx("strong", { children: "\u26A0\uFE0F Limite de taux OpenRouter (429)" }), _jsxs("p", { style: { margin: '6px 0 0', lineHeight: 1.5 }, children: ["Les mod\u00E8les ", _jsx("strong", { children: "gratuits" }), " (suffixe ", _jsx("code", { children: ":free" }), ") sont limit\u00E9s \u00E0 :"] }), _jsxs("ul", { style: { margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.6 }, children: [_jsx("li", { children: _jsx("strong", { children: "20 requ\u00EAtes / minute" }) }), _jsxs("li", { children: [_jsx("strong", { children: "50 requ\u00EAtes / jour" }), " si vous n'avez jamais achet\u00E9 de cr\u00E9dits"] }), _jsxs("li", { children: [_jsx("strong", { children: "1 000 requ\u00EAtes / jour" }), " si vous avez achet\u00E9 au moins ", _jsx("strong", { children: "$10" }), " de cr\u00E9dits"] })] }), _jsxs("p", { style: { margin: '6px 0 0', lineHeight: 1.5 }, children: ["Attendez quelques secondes et r\u00E9essayez, ou passez \u00E0 un mod\u00E8le payant dans les ", _jsx("em", { children: "Param\u00E8tres" }), "."] })] }), _jsx("button", { className: "btn btn-primary", style: { alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6 }, onClick: () => retry(effectiveRetryText), disabled: loading, children: "\uD83D\uDD04 R\u00E9essayer" })] })) : msg.content
                                                        ? _jsx(ReactMarkdown, { remarkPlugins: [remarkGfm], children: msg.content })
                                                        : loading && i === messages.length - 1
                                                            ? _jsx("span", { className: "spinner" })
                                                            : null] })) : (msg.content) })] }, i));
                            }), _jsx("div", { ref: messagesEndRef })] }), _jsxs("div", { className: "chat-input-area", children: [_jsx("textarea", { value: input, onChange: (e) => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: "Posez une question sur vos finances... (Entr\u00E9e pour envoyer)", disabled: loading, rows: 1 }), _jsx("button", { className: "btn btn-primary", onClick: () => send(input), disabled: loading || !input.trim(), style: { height: 44 }, children: loading ? _jsx("span", { className: "spinner" }) : '↑' })] })] })] }));
}
