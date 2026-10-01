import clsx from 'clsx'
import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MAX_LIST_HEIGHT = 280

/**
 * A select you can type into. Options are `{ value, label, code?, keywords? }`;
 * typing filters by label, code and keywords (any letter narrows it), with
 * labels that start with the query ranked first. The list renders in a
 * portal so a scrolling modal body can't clip it.
 */
export function SearchSelect({
  value, onChange, options, placeholder = 'Select…', searchPlaceholder = 'Type to search…',
  error, disabled, emptyText = 'No matches',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [pos, setPos] = useState(null)
  const buttonRef = useRef(null)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => o.value === value)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.map((o) => ({ ...o, via: null }))
    const scored = []
    for (const o of options) {
      const label = o.label.toLowerCase()
      const code = (o.code || '').toLowerCase()
      let score = -1
      let via = null
      if (label.startsWith(q)) score = 0
      else if (label.split(/[\s/&-]+/).some((w) => w.startsWith(q))) score = 1
      else if (label.includes(q) || code.includes(q)) score = 2
      else {
        const kw = (o.keywords || []).find((k) => k.toLowerCase().includes(q))
        if (kw) { score = 3; via = kw }
      }
      if (score >= 0) scored.push({ ...o, score, via })
    }
    return scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
  }, [options, query])

  const place = () => {
    const r = buttonRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom
    const up = below < MAX_LIST_HEIGHT + 60 && r.top > below
    setPos({ left: r.left, width: r.width, top: up ? undefined : r.bottom + 6, bottom: up ? window.innerHeight - r.top + 6 : undefined })
  }

  useLayoutEffect(() => { if (open) place() }, [open])

  useEffect(() => {
    if (!open) return undefined
    const onOutside = (e) => {
      if (buttonRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onMove = (e) => {
      if (listRef.current?.contains(e.target)) return
      place()
    }
    document.addEventListener('mousedown', onOutside)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', onMove, true)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      document.removeEventListener('mousedown', onOutside)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [open])

  useEffect(() => { setActive(0) }, [query])

  const choose = (o) => {
    onChange(o.value)
    setOpen(false)
    setQuery('')
    buttonRef.current?.focus()
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) choose(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); buttonRef.current?.focus() }
  }

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true) }
          else if (!open && e.key.length === 1 && !e.metaKey && !e.ctrlKey) { setQuery(e.key); setOpen(true) }
        }}
        className={clsx(
          'input flex items-center justify-between gap-2 text-left',
          error && 'input-error',
          !selected && 'text-ink-faint',
        )}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} className={clsx('shrink-0 text-ink-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          className="fixed z-[200] overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-popover animate-slide-up"
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom }}
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-3">
            <Search size={15} className="shrink-0 text-ink-faint" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-10 min-w-0 flex-1 border-0 bg-transparent text-body-md text-ink shadow-none !outline-none !ring-0 placeholder:text-ink-faint"
            />
          </div>
          <ul role="listbox" className="overflow-y-auto py-1" style={{ maxHeight: MAX_LIST_HEIGHT }}>
            {results.length === 0 && (
              <li className="px-3 py-3 text-center text-body-sm text-ink-faint">{emptyText}</li>
            )}
            {results.map((o, i) => (
              <li
                key={o.value}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o) }}
                className={clsx(
                  'flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-body-md',
                  i === active ? 'bg-surface-sunken text-ink' : 'text-ink-muted',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.via && <span className="block truncate text-[11px] text-ink-faint">matches “{o.via}”</span>}
                </span>
                {o.value === value && <Check size={15} className="shrink-0 text-secondary" />}
              </li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </>
  )
}
