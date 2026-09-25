import clsx from 'clsx'
import { Send, X } from 'lucide-react'
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

// The assistant's face wherever it appears (FAB, header, message avatar,
// typing indicator) — one place to keep all four in sync. The source gif
// is a small pinwheel mark centred in a much larger white canvas (400x300,
// mark is only ~103x103 in the middle) -- rendered at icon sizes with plain
// object-contain, that padding shrinks the mark to a near-invisible speck.
// scale(3) on the img inside an overflow-hidden square instead zooms into
// just the centred mark and crops the rest away, so it reads clearly even
// at 19-22px.
function AiFace({ size, rounded = 'rounded-lg' }) {
  return (
    <div
      className={clsx('overflow-hidden bg-white shrink-0', rounded)}
      style={{ width: size, height: size }}
    >
      <img
        src="/assets/ai-agent.gif"
        alt="" aria-hidden="true"
        className="w-full h-full object-cover"
        style={{ transform: 'scale(3)' }}
      />
    </div>
  )
}

/**
 * Floating chat widget — the standard "bubble in the corner" pattern from
 * Intercom/Crisp-style production sites, replacing the old sidebar
 * "AI Assistant" button + full-height side drawer.
 *
 * Self-contained: owns its own open/closed state, so it only needs to be
 * mounted once (in AppLayout, alongside the rest of the authenticated
 * shell) with no props. Talks to the same POST /ai/assistant endpoint the
 * old panel used — nothing changed on the backend.
 */
export function AssistantWidget() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  // Escape closes it, matching the existing Modal component's convention.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Focus the input as soon as the panel finishes opening, and lock
  // background scroll on mobile where the panel is a full-height sheet
  // (same reasoning as Modal: a chat sheet you can't dismiss by scrolling
  // the page behind it shouldn't let that page scroll either).
  useEffect(() => {
    if (!open) return undefined
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      clearTimeout(t)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

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
        usedFallback: res.used_fallback,
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

  return (
    <>
      {/* ---- Floating action button ----
          Fixed to the viewport (not a page element), bottom-right, sitting
          just above the corner rather than flush against it. z-40 keeps it
          below the app's Modal/toast layer (z-50) so a real modal always
          wins if both are ever open at once. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close Campus Assistant' : 'Open Campus Assistant chat'}
        aria-expanded={open}
        className={clsx(
          'fixed z-40 grid place-items-center rounded-full shadow-level3',
          'bottom-5 right-4 h-14 w-14 sm:bottom-6 sm:right-6',
          'transition-transform hover:scale-105 active:scale-95',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
        )}
      >
        <AiFace size={56} rounded="rounded-full" />
      </button>

      {!open ? null : (
        <>
          {/* Backdrop — only meaningfully visible/clickable on mobile, where
              the panel covers most of the screen; on desktop it's there for
              click-outside-to-close but stays transparent so the app
              underneath remains readable, matching an anchored popover
              rather than a full modal. */}
          <div
            className="fixed inset-0 z-40 bg-primary-950/30 backdrop-blur-sm sm:bg-transparent sm:backdrop-blur-0 animate-fade-in"
            onClick={() => setOpen(false)}
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Campus Assistant chat"
            className={clsx(
              'fixed z-40 flex flex-col bg-surface/95 backdrop-blur-2xl border border-border-subtle shadow-level3 animate-slide-up',
              // Mobile: a near-full-height bottom sheet — the same pattern
              // production chat widgets use once the viewport is too narrow
              // for a floating card to make sense.
              'inset-x-0 bottom-0 h-[88vh] rounded-t-2xl',
              // Desktop/tablet: an anchored card above the FAB, not a
              // full-screen takeover.
              'sm:inset-x-auto sm:bottom-24 sm:right-6 sm:h-[min(70vh,600px)] sm:w-[380px] sm:rounded-2xl',
            )}
          >
            <header className="flex items-center justify-between px-4 sm:px-5 h-14 sm:h-16 border-b border-border-subtle shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <AiFace size={32} />
                <div className="min-w-0">
                  <p className="text-headline-md leading-tight truncate">Campus Assistant</p>
                  <p className="text-body-sm text-ink-faint truncate">Ask about issues, assets or policy</p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="btn-ghost h-8 w-8 p-0 rounded shrink-0"
                aria-label="Close assistant"
              >
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
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
                    <AiFace size={28} />
                  ) : (
                    <Avatar name={user?.full_name} size={28} />
                  )}
                  <div className={clsx('max-w-[85%] rounded-xl px-3.5 py-2.5',
                    m.role === 'user'
                      ? 'bg-secondary text-on-secondary'
                      : m.error
                        ? 'bg-danger-bg border border-danger-border text-danger-text'
                        : 'ai-surface text-ink')}>
                    <p className={clsx('whitespace-pre-wrap break-words', m.role === 'assistant' ? 'text-body-lg' : 'text-body-md')}>
                      {m.content}
                    </p>
                    {/* Neither response path ever produced a meaningful
                        per-answer confidence score (the "agent" path hardcoded
                        0.9, the fallback path hardcoded 0.55) — a fake number
                        is worse than none. This only appears for the genuinely
                        degraded case: no live model call, answering from a
                        cached campus summary instead. */}
                    {m.usedFallback && (
                      <span className="pill bg-warning-bg text-warning-text mt-2 text-body-sm whitespace-normal break-words max-w-full h-auto">
                        Limited data mode — AI temporarily unavailable
                      </span>
                    )}
                  </div>
                </div>
              ))}

              {busy && (
                <div className="flex gap-2.5">
                  <AiFace size={28} />
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
              className="p-3 sm:p-4 border-t border-border-subtle shrink-0"
            >
              <div className="relative">
                <input
                  ref={inputRef}
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your campus…"
                  className="input pr-11" disabled={busy}
                />
                <button
                  type="submit" disabled={!input.trim() || busy}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7 rounded grid place-items-center bg-secondary text-on-secondary disabled:opacity-40"
                  aria-label="Send"
                >
                  <Send size={14} />
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  )
}
