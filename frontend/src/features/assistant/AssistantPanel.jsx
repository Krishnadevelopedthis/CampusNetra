import clsx from 'clsx'
import { Send, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'

const SUGGESTIONS = [
  'What are my open complaints?',
  'Which assets are currently in fault?',
  'How do I report a broken projector?',
  'Show SLA breaches this week',
]

/** Level-3 overlay drawer: glassmorphic backdrop over the spatial map. */
export function AssistantPanel({ open, onClose }) {
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const send = async (text) => {
    const question = (text ?? input).trim()
    if (!question || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: question }])
    setBusy(true)
    try {
      const res = await api.post('/ai/assistant', { message: question })
      setMessages((m) => [...m, {
        role: 'assistant',
        content: res.reply,
        confidence: res.confidence,
        sources: res.sources,
      }])
    } catch (err) {
      setMessages((m) => [...m, {
        role: 'assistant',
        content: err.detail || 'I could not reach the assistant service just now.',
        error: true,
      }])
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-primary-950/30 backdrop-blur-sm animate-fade-in" onClick={onClose} />

      <aside className="relative w-full max-w-md h-full bg-surface shadow-level3 flex flex-col animate-slide-up">
        <header className="flex items-center justify-between px-5 h-16 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary grid place-items-center">
              <Sparkles size={16} className="text-white" />
            </div>
            <div>
              <p className="text-headline-md leading-tight">Campus Assistant</p>
              <p className="text-body-sm text-ink-faint">Ask about issues, assets or policy</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost h-8 w-8 p-0 rounded" aria-label="Close assistant">
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <div className="ai-surface p-4">
                <p className="text-body-lg text-ink">
                  Hello {user?.full_name?.split(' ')[0]}. I can look up complaints, asset
                  status and campus procedures for you.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-label-caps uppercase text-ink-muted">Try asking</p>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s} onClick={() => send(s)}
                    className="w-full text-left px-3 py-2.5 rounded border border-border-subtle text-body-md text-ink hover:bg-surface-sunken transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={clsx('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
              {m.role === 'assistant' ? (
                <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center shrink-0">
                  <Sparkles size={13} className="text-white" />
                </div>
              ) : (
                <Avatar name={user?.full_name} size={28} />
              )}
              <div className={clsx('max-w-[85%] rounded-xl px-3.5 py-2.5',
                m.role === 'user'
                  ? 'bg-secondary text-white'
                  : m.error
                    ? 'bg-danger-bg border border-danger-border text-danger-text'
                    : 'ai-surface text-ink')}>
                {/* AI responses use body-lg to read as conversational, per the spec. */}
                <p className={clsx('whitespace-pre-wrap', m.role === 'assistant' ? 'text-body-lg' : 'text-body-md')}>
                  {m.content}
                </p>
                {m.confidence != null && (
                  <span className="pill bg-info-bg text-info-text mt-2 text-body-sm">
                    {Math.round(m.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            </div>
          ))}

          {busy && (
            <div className="flex gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary grid place-items-center shrink-0">
                <Sparkles size={13} className="text-white" />
              </div>
              <div className="ai-surface px-3.5 py-3 flex gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span key={d} className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce"
                        style={{ animationDelay: `${d}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); send() }}
          className="p-4 border-t border-border-subtle shrink-0"
        >
          <div className="relative">
            <input
              value={input} onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your campus…"
              className="input pr-11" disabled={busy}
            />
            <button
              type="submit" disabled={!input.trim() || busy}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded grid place-items-center bg-secondary text-white disabled:opacity-40"
              aria-label="Send"
            >
              <Send size={14} />
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
