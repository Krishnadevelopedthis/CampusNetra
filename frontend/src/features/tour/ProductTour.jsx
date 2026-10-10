import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Sparkles, X } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useAuth } from '@/lib/auth'
import { stepsFor } from './tourSteps'
import { useTour } from './tourStore'

/**
 * First-run product tour: dims and slightly blurs the screen, cuts a clear
 * window around one button at a time, and explains it in a card with
 * Back / Next / Skip. Works the same on a phone (it points at the bottom tab
 * bar) and on a desktop (the sidebar), because each step resolves to
 * whichever matching element is actually visible.
 */
const PAD = 8          // space between the element and the clear window
const GAP = 14         // space between the window and the card
const MARGIN = 12      // keep the card this far from the screen edges

function findVisible(target) {
  if (!target) return null
  for (const el of document.querySelectorAll(`[data-tour="${target}"]`)) {
    // Not offsetParent: fixed-position buttons (QR, assistant) have none.
    const r = el.getBoundingClientRect()
    const shown = el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : true
    if (r.width > 0 && r.height > 0 && shown) return el
  }
  return null
}

function holeFor(el, shape) {
  const r = el.getBoundingClientRect()
  if (shape === 'circle') {
    const size = Math.max(r.width, r.height) + PAD * 2
    return { x: r.left + r.width / 2 - size / 2, y: r.top + r.height / 2 - size / 2, w: size, h: size, radius: size / 2 }
  }
  return { x: r.left - PAD, y: r.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2, radius: 14 }
}

export function ProductTour() {
  const open = useTour((s) => s.open)
  const close = useTour((s) => s.close)
  const user = useAuth((s) => s.user)
  const firstName = user?.full_name?.split(' ')[0]

  // Steps whose target is not on this screen are dropped when the tour starts.
  const [steps, setSteps] = useState([])
  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState(null)
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  const [cardSize, setCardSize] = useState({ w: 0, h: 0 })
  const cardRef = useRef(null)
  const primaryRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const all = stepsFor(user?.role, firstName)
    setSteps(all.filter((s) => !s.target || findVisible(s.target)))
    setIndex(0)
  }, [open, user?.role, firstName])

  const step = steps[index]
  const last = index === steps.length - 1

  // Follow the target: it can move as the page lays out, scrolls or resizes.
  useEffect(() => {
    if (!open || !step) return undefined
    const el = findVisible(step.target)
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    const measure = () => {
      setView({ w: window.innerWidth, h: window.innerHeight })
      const current = findVisible(step.target)
      setHole(current ? holeFor(current, step.shape) : null)
    }
    measure()
    const id = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, step])

  useLayoutEffect(() => {
    if (!cardRef.current) return
    const r = cardRef.current.getBoundingClientRect()
    setCardSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }))
  })

  useEffect(() => { primaryRef.current?.focus({ preventScroll: true }) }, [index, open])

  const next = useCallback(() => (last ? close() : setIndex((i) => i + 1)), [last, close])
  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close, next, back])

  // Where the card goes: below the window if it fits, else above; centred
  // when there is no window (welcome and finish).
  const cardStyle = useMemo(() => {
    const width = Math.min(380, view.w - MARGIN * 2)
    if (!hole) return { width, left: (view.w - width) / 2, top: Math.max(MARGIN, (view.h - cardSize.h) / 2) }
    const below = hole.y + hole.h + GAP
    const fitsBelow = below + cardSize.h <= view.h - MARGIN
    const top = fitsBelow ? below : Math.max(MARGIN, hole.y - GAP - cardSize.h)
    const centred = hole.x + hole.w / 2 - width / 2
    const left = Math.min(Math.max(MARGIN, centred), view.w - width - MARGIN)
    return { width, left, top }
  }, [hole, view, cardSize.h])

  if (!open || !step) return null

  // One dimmed, slightly blurred layer over the whole screen, with the clear
  // window cut out of it by a mask (a rounded rectangle or a circle).
  const h = hole
  const maskStyle = h ? (() => {
    const r = Math.min(h.radius, h.w / 2, h.h / 2)
    const { x, y, w, h: hh } = h
    const d = `M0 0H${view.w}V${view.h}H0Z M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}`
      + `V${y + hh - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + hh}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + hh - r}`
      + `V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${view.w}' height='${view.h}'><path fill-rule='evenodd' d='${d}'/></svg>`
    const url = `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`
    return { maskImage: url, WebkitMaskImage: url, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }
  })() : {}

  const isIntro = step.welcome
  const counted = steps.filter((s) => !s.welcome && !s.finish)
  const position = counted.indexOf(step) + 1

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      <div className="absolute inset-0 bg-[rgb(10_10_15/0.55)] backdrop-blur-[3px]" style={maskStyle} />
      {h && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute border-2 border-secondary shadow-[0_0_0_4px_rgb(var(--c-secondary)/0.25),0_0_24px_rgb(var(--c-secondary)/0.45)] transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: h.x, top: h.y, width: h.w, height: h.h, borderRadius: h.radius }}
        />
      )}

      <div
        ref={cardRef}
        className="absolute rounded-2xl border border-border-subtle bg-surface/95 p-4 text-ink shadow-level3 backdrop-blur-xl
                   transition-[top,left] duration-300 ease-out motion-reduce:transition-none sm:p-5"
        style={cardStyle}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[clamp(0.68rem,2.6vw,0.75rem)] font-semibold uppercase tracking-[0.12em] text-secondary">
            <Sparkles size={13} aria-hidden="true" />
            {isIntro ? 'Quick tour' : step.finish ? 'Tour complete' : `Step ${position} of ${counted.length}`}
          </span>
          <button type="button" onClick={close} aria-label="Close tour"
                  className="grid h-7 w-7 place-items-center rounded-full text-ink-faint hover:bg-surface-sunken hover:text-ink">
            <X size={15} />
          </button>
        </div>

        {!isIntro && !step.finish && (
          <div className="mb-3 h-1 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
            <div className="h-full rounded-full bg-secondary transition-[width] duration-300" style={{ width: `${(position / counted.length) * 100}%` }} />
          </div>
        )}

        <h2 id="tour-title" className="text-[clamp(1rem,4.2vw,1.15rem)] font-semibold leading-snug">{step.title}</h2>
        <p id="tour-body" className="mt-1.5 text-[clamp(0.86rem,3.6vw,0.94rem)] leading-relaxed text-ink-muted">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          {isIntro || step.finish ? <span /> : (
            <button type="button" onClick={close} className="text-body-sm font-medium text-ink-faint hover:text-ink">
              Skip tour
            </button>
          )}
          <div className="flex items-center gap-2">
            {isIntro && (
              <button type="button" onClick={close} className="btn-ghost h-10 rounded-xl px-3 text-body-sm">Not now</button>
            )}
            {index > 0 && !step.finish && (
              <button type="button" onClick={back} aria-label="Previous step"
                      className="btn-secondary grid h-10 w-10 place-items-center rounded-xl p-0">
                <ArrowLeft size={16} />
              </button>
            )}
            <button
              ref={primaryRef} type="button" onClick={next}
              className={clsx('btn-primary h-10 rounded-xl px-4 text-body-sm', 'inline-flex items-center gap-1.5')}
            >
              {isIntro ? 'Start tour' : last ? 'Finish' : 'Next'}
              {!last && <ArrowRight size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
