import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, X, ChevronDown } from 'lucide-react'
import clsx from 'clsx'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Digital Twin', href: '#twin' },
  { label: 'AI Triage', href: '#ai' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'FAQ', href: '#faq' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()
  const mobileRef = useRef(null)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close mobile menu on Escape
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleAnchor = (e, href) => {
    e.preventDefault()
    setMobileOpen(false)
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleGetStarted = (e) => {
    e.preventDefault()
    setMobileOpen(false)
    navigate('/register')
  }

  return (
    <header
      className={clsx(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled
          ? 'bg-spotlight-primary bg-[length:100%_100%] glass-panel shadow-level3 border-b border-border-subtle'
          : 'bg-transparent',
      )}
    >
      {/* Grid beam backdrop on dark */}
      <div className="absolute inset-0 bg-grid-beam pointer-events-none opacity-50" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex-shrink-0">
            <Logo subtitle={false} size={36} isDynamic />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => handleAnchor(e, link.href)}
                className={clsx(
                  'px-3 py-2 rounded-lg text-body-md font-medium transition-colors duration-150 relative overflow-hidden',
                  scrolled
                    ? 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
                    : 'text-white/80 hover:text-white hover:bg-white/10',
                )}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Desktop CTA - single Get Started button */}
          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={handleGetStarted}
              className="px-4 h-9 rounded-lg text-body-md font-medium bg-gradient-to-r from-secondary-400 to-primary text-white hover:from-secondary-600 hover:to-primary-800 transition-all duration-150 inline-flex items-center shadow-glow-secondary border-shimmer"
            >
              Get Started
            </button>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className={clsx(
              'md:hidden p-2 rounded-lg transition-colors',
              scrolled ? 'text-ink hover:bg-surface-sunken' : 'text-white hover:bg-white/10',
            )}
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        ref={mobileRef}
        className={clsx(
          'md:hidden overflow-hidden transition-all duration-300',
          mobileOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0 pointer-events-none',
          scrolled ? 'bg-surface/95 backdrop-blur-md border-b border-border-subtle' : 'bg-primary/95 backdrop-blur-md',
        )}
        aria-hidden={!mobileOpen}
      >
        <div className="px-6 py-4 space-y-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              onClick={(e) => handleAnchor(e, link.href)}
              className={clsx(
                'block px-3 py-2.5 rounded-lg text-body-md font-medium transition-colors',
                scrolled ? 'text-ink-muted hover:text-ink hover:bg-surface-sunken' : 'text-white/80 hover:text-white hover:bg-white/10',
              )}
            >
              {link.label}
            </a>
          ))}
          <div className="pt-3 flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <ThemeToggle variant="segmented" />
            </div>
            <button
              type="button"
              onClick={handleGetStarted}
              className="block px-4 py-2.5 rounded-lg text-body-md font-medium bg-gradient-to-r from-secondary-400 to-primary text-white hover:from-secondary-600 hover:to-primary-800 text-center transition-all border-shimmer shadow-glow-secondary"
            >
              Get Started
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}