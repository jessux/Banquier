import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage } from '../../../shared/types'

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
  get_accounts: '🏦 Comptes'
}

export default function Chat(): JSX.Element {
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string): Promise<void> => {
    if (!text.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: text.trim() }
    const newMessages = [...messages, userMessage]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)

    let fullResponse = ''
    let collectedToolCalls: string[] = []

    const updateAssistant = () => {
      setMessages([...newMessages, { role: 'assistant', content: fullResponse, toolCalls: collectedToolCalls }])
    }

    try {
      await window.api.chat(
        newMessages as ChatMessage[],
        (chunk) => {
          fullResponse += chunk
          updateAssistant()
        },
        (name) => {
          collectedToolCalls = [...collectedToolCalls, TOOL_LABELS[name] ?? name]
          updateAssistant()
        }
      )
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
  )
}
