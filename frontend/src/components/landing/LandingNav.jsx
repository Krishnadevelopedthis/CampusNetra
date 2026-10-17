import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Chevron, Close, Menu, audiences } from './landingIcons'

// Section links scroll within the page; the rest are their own pages.
const links = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how' },
  { label: 'Digital Twin', href: '#twin' },
  { label: 'Solutions', menu: audiences },
  { label: 'Pricing', to: '/pricing' },
]

export function LandingNav({ onAnchor }) {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Transparent over the hero, a blurred bar once the page scrolls.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // The Solutions menu closes on Escape or a click anywhere else.
  useEffect(() => {
    if (!menuOpen && !open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') { setMenuOpen(false); setOpen(false) }
    }
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menuOpen, open])

  const go = (e, href) => {
    setOpen(false)
    onAnchor(e, href)
  }

  const item = (link, className, close) => (link.to
    ? <Link className={className} to={link.to} onClick={close}>{link.label}</Link>
    : <a className={className} href={link.href} onClick={(e) => go(e, link.href)}>{link.label}</a>)

  return (
    <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <Link className="lp-nav__brand" to="/" aria-label="CampusNetra home">
        <img className="lp-nav__logo" src="/logo-dark.svg" alt="" width="36" height="36" />
        <span>CampusNetra</span>
      </Link>

      <nav className="lp-nav__pill" aria-label="Primary">
        <ul>
          {links.map((link) => (
            <li key={link.label} ref={link.menu ? menuRef : undefined}>
              {link.menu ? (
                <>
                  <button
                    type="button"
                    className="lp-nav__link"
                    aria-expanded={menuOpen}
                    aria-haspopup="true"
                    onClick={() => setMenuOpen((v) => !v)}
                  >
                    {link.label}
                    <Chevron className="lp-nav__chev" />
                  </button>
                  {menuOpen && (
                    <ul className="lp-nav__menu">
                      {link.menu.map((m) => (
                        <li key={m.to}>
                          <Link to={m.to} onClick={() => setMenuOpen(false)}>{m.name}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : item(link, 'lp-nav__link')}
            </li>
          ))}
        </ul>
      </nav>

      <div className="lp-nav__actions">
        <Link className="lp-nav__signin" to="/login">Sign in</Link>
        <Link className="lp-btn lp-btn--light lp-nav__cta" to="/register">Get Started</Link>
        <button
          className="lp-nav__burger"
          type="button"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <Close /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="lp-nav__sheet">
          <ul>
            {links.filter((l) => !l.menu).map((link) => (
              <li key={link.label}>{item(link, undefined, () => setOpen(false))}</li>
            ))}
            <li className="lp-nav__sheet-label">Solutions</li>
            {audiences.map((m) => (
              <li key={m.to}>
                <Link to={m.to} onClick={() => setOpen(false)}>{m.name}</Link>
              </li>
            ))}
            <li><Link to="/login" onClick={() => setOpen(false)}>Sign in</Link></li>
          </ul>
          <Link className="lp-btn lp-btn--flame lp-nav__sheet-cta" to="/register" onClick={() => setOpen(false)}>
            Get Started
          </Link>
        </div>
      )}
    </header>
  )
}
