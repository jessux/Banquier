import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMemory, ChatMessage, ChatThread } from '../../../shared/types'

type DisplayMessage = ChatMessage & { toolCalls?: string[] }

const QUICK_QUESTIONS = [
  'Résumé de mes finances ce mois',
  'Où est-ce que je dépense le plus ?',
  'Comment réduire mes dépenses ?',
  'Quelles sont mes dépenses inhabituelles ?',
  'Évolution de mes dépenses sur 3 mois'
]

const TOOL_LABELS: Record<string, string> = {
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
}

export default function Chat(): JSX.Element {
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [memories, setMemories] = useState<ChatMemory[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Charge la liste des conversations au démarrage et ouvre la plus récente.
  useEffect(() => {
    void (async () => {
      const list = await window.api.chatThreadsList()
      setThreads(list)
      if (list.length > 0) {
        setActiveThreadId(list[0].id)
        await loadMessages(list[0].id)
      }
      setMemories(await window.api.memoriesList())
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadMessages = async (threadId: number): Promise<void> => {
    const stored = await window.api.chatThreadMessages(threadId)
    setMessages(
      stored.map((m) => ({ role: m.role, content: m.content, toolCalls: m.toolCalls, reasoning: m.reasoning }))
    )
  }

  const deleteMemory = async (id: number): Promise<void> => {
    await window.api.memoryDelete(id)
    setMemories(await window.api.memoriesList())
  }

  const selectThread = async (threadId: number): Promise<void> => {
    if (loading || threadId === activeThreadId) return
    setActiveThreadId(threadId)
    await loadMessages(threadId)
  }

  const newThread = async (): Promise<void> => {
    if (loading) return
    setActiveThreadId(null)
    setMessages([])
    setInput('')
  }

  const deleteThread = async (threadId: number, e: React.MouseEvent): Promise<void> => {
    e.stopPropagation()
    if (loading) return
    if (!window.confirm('Supprimer cette conversation ?')) return
    await window.api.chatThreadDelete(threadId)
    const list = await window.api.chatThreadsList()
    setThreads(list)
    if (threadId === activeThreadId) {
      if (list.length > 0) {
        setActiveThreadId(list[0].id)
        await loadMessages(list[0].id)
      } else {
        setActiveThreadId(null)
        setMessages([])
      }
    }
  }

  const send = async (text: string): Promise<void> => {
    if (!text.trim() || loading) return

    // Crée une conversation à la volée si aucune n'est active.
    let threadId = activeThreadId
    if (threadId === null) {
      const thread = await window.api.chatThreadCreate()
      threadId = thread.id
      setActiveThreadId(thread.id)
      setThreads((prev) => [thread, ...prev])
    }

    const userMessage: DisplayMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMessage]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    let fullResponse = ''
    let fullReasoning = ''
    let collectedToolCalls: string[] = []

    const updateAssistant = (): void => {
      setMessages([
        ...newMessages,
        { role: 'assistant', content: fullResponse, toolCalls: collectedToolCalls, reasoning: fullReasoning || undefined }
      ])
    }

    try {
      await window.api.chat(
        threadId,
        text.trim(),
        (chunk) => {
          fullResponse += chunk
          updateAssistant()
        },
        (name) => {
          collectedToolCalls = [...collectedToolCalls, TOOL_LABELS[name] ?? name]
          updateAssistant()
        },
        (chunk) => {
          fullReasoning += chunk
          updateAssistant()
        }
      )
      // Rafraîchit la liste (titre auto + ordre par dernière activité) et la
      // mémoire IA (le modèle a pu enregistrer de nouvelles informations).
      const list = await window.api.chatThreadsList()
      setThreads(list)
      setMemories(await window.api.memoriesList())
    } catch (e) {
      setMessages([...newMessages, { role: 'assistant', content: `Erreur : ${String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="chat-layout">
      <aside className="thread-sidebar">
        <button className="btn btn-primary thread-new-btn" onClick={newThread} disabled={loading}>
          + Nouvelle conversation
        </button>
        <div className="thread-list">
          {threads.length === 0 && (
            <p className="text-muted text-sm" style={{ padding: '8px 4px' }}>
              Aucune conversation pour l'instant.
            </p>
          )}
          {threads.map((t) => (
            <div
              key={t.id}
              className={`thread-item ${t.id === activeThreadId ? 'active' : ''}`}
              onClick={() => selectThread(t.id)}
            >
              <span className="thread-title">{t.title}</span>
              <button
                className="thread-delete"
                title="Supprimer"
                onClick={(e) => deleteThread(t.id, e)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {memories.length > 0 && (
          <div style={{ marginTop: 12, borderTop: '1px solid #2e3147', paddingTop: 10 }}>
            <p style={{ fontSize: 12, color: '#64748b', margin: '0 4px 6px' }}>
              🧠 Mémoire IA ({memories.length})
            </p>
            <div style={{ maxHeight: 180, overflowY: 'auto' }}>
              {memories.map((m) => (
                <div
                  key={m.id}
                  title={m.content}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 6px', borderRadius: 6, fontSize: 11, color: '#8b93a7'
                  }}
                >
                  <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {m.content}
                  </span>
                  <button
                    className="thread-delete"
                    title="Oublier"
                    onClick={() => deleteMemory(m.id)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="chat-container">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 className="page-title">Analyse IA</h1>
        </div>

        {messages.length === 0 && (
          <div style={{ marginBottom: 16 }}>
            <p className="text-muted" style={{ marginBottom: 12, fontSize: 13 }}>Questions rapides :</p>
            <div className="quick-questions">
              {QUICK_QUESTIONS.map((q) => (
                <button key={q} className="quick-btn" onClick={() => send(q)}>{q}</button>
              ))}
            </div>
          </div>
        )}

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="empty-state" style={{ paddingTop: 32 }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <p style={{ fontSize: 16, marginBottom: 6 }}>Assistant financier IA</p>
              <p className="text-muted text-sm">Posez une question sur vos finances ou choisissez une suggestion ci-dessus.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              <div className="chat-avatar">{msg.role === 'user' ? '👤' : '🤖'}</div>
              <div className="chat-bubble">
                {msg.role === 'assistant' ? (
                  <>
                    {msg.reasoning && (
                      <details
                        open={loading && i === messages.length - 1 && !msg.content}
                        style={{
                          marginBottom: 10, padding: '6px 10px', borderRadius: 8,
                          background: '#161927', border: '1px solid #2e3147'
                        }}
                      >
                        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#64748b', userSelect: 'none' }}>
                          🧠 Raisonnement du modèle
                        </summary>
                        <div style={{
                          marginTop: 6, fontSize: 12, color: '#8b93a7', fontStyle: 'italic',
                          whiteSpace: 'pre-wrap', maxHeight: 240, overflowY: 'auto'
                        }}>
                          {msg.reasoning}
                        </div>
                      </details>
                    )}
                    {msg.toolCalls && msg.toolCalls.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: msg.content ? 10 : 0 }}>
                        {msg.toolCalls.map((tc, j) => (
                          <span key={j} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 999,
                            background: '#1e2130', border: '1px solid #2e3147',
                            fontSize: 11, color: '#64748b'
                          }}>
                            {tc}
                          </span>
                        ))}
                      </div>
                    )}
                    {msg.content
                      ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                      : loading && i === messages.length - 1
                        ? <span className="spinner" />
                        : null
                    }
                  </>
                ) : (
                  msg.content
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-area">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Posez une question sur vos finances... (Entrée pour envoyer)"
            disabled={loading}
            rows={1}
          />
          <button
            className="btn btn-primary"
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            style={{ height: 44 }}
          >
            {loading ? <span className="spinner" /> : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
