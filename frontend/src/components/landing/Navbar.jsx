import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Digital twin', href: '#twin' },
  { label: 'AI triage', href: '#ai' },
  { label: 'How it works', href: '#how-it-works' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const mobileRef = useRef(null)
  const toggleRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return undefined
    const onPointerDown = (event) => {
      if (mobileRef.current && !mobileRef.current.contains(event.target) && toggleRef.current && !toggleRef.current.contains(event.target)) setMobileOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
    }
  }, [mobileOpen])

  const handleAnchor = (event, href) => {
    event.preventDefault()
    setMobileOpen(false)
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleGetStarted = () => {
    setMobileOpen(false)
    navigate('/register')
  }

  const linkTone = scrolled ? 'text-ink-muted hover:text-ink hover:bg-surface-sunken' : 'text-ink-muted hover:text-ink hover:bg-white/70'

  return (
    <header className={clsx('fixed inset-x-0 top-0 z-50 transition-all duration-300', scrolled ? 'border-b border-border-subtle bg-surface/90 shadow-level2 backdrop-blur-xl' : 'bg-surface-base/75 backdrop-blur-md')}>
      <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-6 lg:px-8">
        <Link to="/" className="shrink-0" aria-label="CampusNetra home"><Logo subtitle={false} size={34} isDynamic /></Link>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main navigation">
          {NAV_LINKS.map((link) => <a key={link.label} href={link.href} onClick={(event) => handleAnchor(event, link.href)} className={clsx('rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors', linkTone)}>{link.label}</a>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link to="/login" className={clsx('rounded-lg px-3 py-2 text-[13px] font-semibold transition-colors', linkTone)}>Sign in</Link>
          <button type="button" onClick={handleGetStarted} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white transition hover:bg-primary-800">Get started <ArrowUpRight size={14} /></button>
        </div>
        <button ref={toggleRef} type="button" className={clsx('rounded-lg p-2.5 transition-colors md:hidden', linkTone)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileOpen} onClick={() => setMobileOpen((open) => !open)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button>
      </div>
      <div ref={mobileRef} className={clsx('overflow-hidden border-t border-border-subtle bg-surface/95 backdrop-blur-xl transition-all md:hidden', mobileOpen ? 'max-h-96 opacity-100' : 'pointer-events-none max-h-0 opacity-0')} aria-hidden={!mobileOpen}>
        <div className="space-y-1 px-6 py-4">
          {NAV_LINKS.map((link) => <a key={link.label} href={link.href} onClick={(event) => handleAnchor(event, link.href)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink">{link.label}</a>)}
          <Link to="/login" onClick={() => setMobileOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-sunken hover:text-ink">Sign in</Link>
          <div className="flex items-center justify-between gap-3 pt-3"><ThemeToggle variant="segmented" /><button type="button" onClick={handleGetStarted} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-bold text-white">Get started <ArrowUpRight size={15} /></button></div>
        </div>
      </div>
    </header>
  )
}
