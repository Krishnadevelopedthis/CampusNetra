import clsx from 'clsx'
import { Send, Smile, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Avatar } from '@/components/ui'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useAssistantStore } from './assistantStore'

const SUGGESTIONS = [
  'What are my open complaints?',
  'Which assets are currently in fault?',
  'How do I report a broken projector?',
  'Show SLA breaches this week',
]

// A curated set rather than a full emoji-picker library/dependency for
// what's a lightweight "add a bit of tone to a chat message" affordance,
// not a general-purpose picker.
const EMOJIS = [
  '😀', '😂', '🙂', '😉', '😍', '🤔', '😅', '😢', '😡', '👍',
  '👎', '🙏', '👏', '🎉', '🔥', '✅', '❌', '⚠️', '❓', '💡',
  '📌', '📷', '🛠️', '🔧', '🚪', '💻', '🖥️', '🪑', '🚽', '🧹',
  '💧', '⚡', '🌡️', '🏫', '🏢', '📅', '⏰', '📍', '👋', '❤️',
]

function EmojiPicker({ onPick, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-64 max-h-52 overflow-y-auto p-2 rounded-xl border border-border-subtle bg-surface shadow-level3 grid grid-cols-8 gap-1 z-10"
      role="menu" aria-label="Choose an emoji"
    >
      {EMOJIS.map((e, i) => (
        <button
          key={`${e}-${i}`}
          type="button"
          onClick={() => onPick(e)}
          className="h-7 w-7 grid place-items-center rounded hover:bg-surface-hover text-body-lg"
        >
          {e}
        </button>
      ))}
    </div>
  )
}

// The assistant's face wherever it appears (FAB, header, message avatar,
// typing indicator) — one place to keep all four in sync. The source gif
// is a small pinwheel mark centred in a much larger white canvas (400x300,
// mark is only ~103x103 in the middle) -- rendered at icon sizes with plain
// object-contain, that padding shrinks the mark to a near-invisible speck.
// scale(3) on the img inside an overflow-hidden square instead zooms into
// just the centred mark and crops the rest away, so it reads clearly even
// at 19-22px.
// `size` is a fixed pixel box (used everywhere the icon sits at one size
// regardless of viewport). Omitting it makes the circle fill its parent
// instead via w-full/h-full, so the FAB below can just resize itself with
// ordinary responsive Tailwind classes and have the icon follow -- a fixed
// px size passed in from JS can't respond to a media query on its own.
function AiFace({ size, rounded = 'rounded-lg', className }) {
  return (
    <div
      className={clsx(
        'overflow-hidden bg-white shrink-0',
        rounded, !size && 'w-full h-full', className,
      )}
      style={size ? { width: size, height: size } : undefined}
    >
      <img
        src="/img/ai-agent.gif"
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
  const open = useAssistantStore((s) => s.open)
  const setOpen = useAssistantStore((s) => s.setOpen)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const endRef = useRef(null)
  const inputRef = useRef(null)

  // Inserts at the cursor (or replaces a selection) rather than just
  // appending, so picking an emoji partway through a sentence lands where
  // you were actually typing.
  const insertEmoji = (emoji) => {
    const el = inputRef.current
    const start = el?.selectionStart ?? input.length
    const end = el?.selectionEnd ?? input.length
    const next = input.slice(0, start) + emoji + input.slice(end)
    setInput(next)
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + emoji.length
      el?.setSelectionRange(pos, pos)
    })
  }

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

  // Focus the input as soon as the panel finishes opening -- on a mouse/
  // trackpad device only. On a phone, focusing pops the on-screen keyboard
  // over half the chat before the person has decided to type; there the
  // keyboard opens when they tap the box. Also lock background scroll on
  // mobile where the panel is a full-height sheet (same reasoning as Modal:
  // a chat sheet you can't dismiss by scrolling the page behind it shouldn't
  // let that page scroll either).
  useEffect(() => {
    if (!open) return undefined
    const finePointer = window.matchMedia?.('(pointer: fine)').matches
    const t = finePointer ? setTimeout(() => inputRef.current?.focus(), 50) : undefined
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
        data-tour="assistant"
        aria-label={open ? 'Close Campus Assistant' : 'Open Campus Assistant chat'}
        aria-expanded={open}
        className={clsx(
          'fixed z-40 grid place-items-center rounded-full shadow-level3',
          // Smaller on narrow screens, same as every other size step in
          // this file (bottom/right position already did this; the button
          // itself stayed one fixed size regardless of viewport).
          // Below lg the bottom tab bar (floating, 4.5rem tall + the home-bar inset) sits underneath.
          'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-3 h-11 w-11 sm:right-6 sm:h-14 sm:w-14 lg:bottom-6',
          'transition-transform hover:scale-105 active:scale-95',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
        )}
      >
        <AiFace rounded="rounded-full" className="border-2 border-white" />
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
                  <div className={clsx('max-w-[85%] px-3.5 py-2.5',
                    m.role === 'user'
                      ? 'rounded-2xl rounded-tr-md bg-secondary text-on-secondary shadow-level2'
                      : m.error
                        ? 'rounded-2xl rounded-tl-md bg-danger-bg border border-danger-border text-danger-text'
                        : 'ai-answer rounded-2xl rounded-tl-md')}>
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
                  <div className="ai-answer rounded-2xl rounded-tl-md px-3.5 py-3 flex gap-1.5">
                    {[0, 150, 300].map((d) => (
                      <span key={d} className="w-1.5 h-1.5 rounded-full bg-secondary animate-bounce"
                            style={{ animationDelay: `${d}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* On a phone the box sits 2-4 cm above the bottom edge (more on taller
                screens, plus the home-bar inset) so it is easy to reach and clear
                of the gesture bar; on a desktop the panel is a card and needs none. */}
            <form
              onSubmit={(e) => { e.preventDefault(); send() }}
              className="px-3 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+clamp(4.75rem,10vh,9rem))] sm:p-4 border-t border-border-subtle shrink-0"
            >
              <div className="relative flex items-center gap-2">
                {showEmoji && (
                  <EmojiPicker
                    onPick={(e) => insertEmoji(e)}
                    onClose={() => setShowEmoji(false)}
                  />
                )}
                <button
                  type="button" disabled={busy}
                  onClick={() => setShowEmoji((v) => !v)}
                  className={clsx(
                    'grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-200 disabled:opacity-40',
                    'active:scale-95 motion-reduce:transform-none',
                    showEmoji
                      ? 'border-secondary/40 bg-secondary/15 text-secondary shadow-[0_0_0_3px_rgb(var(--c-secondary)/0.15)]'
                      : 'border-border-subtle bg-surface-sunken text-ink-muted hover:border-secondary/40 hover:bg-secondary/10 hover:text-secondary',
                  )}
                  aria-label="Add emoji" aria-expanded={showEmoji}
                >
                  <Smile size={20} strokeWidth={2} />
                </button>
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    value={input} onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask anything about your campus…"
                    className="input h-11 rounded-full pl-4 pr-12" disabled={busy}
                  />
                  <button
                    type="submit" disabled={!input.trim() || busy}
                    className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-secondary text-on-secondary shadow-level2 transition-transform active:scale-95 disabled:opacity-40 disabled:shadow-none"
                    aria-label="Send"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  )
}
