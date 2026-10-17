import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { Chevron, Close, Menu, audiences } from './landingIcons'

const links = [
  { label: 'Features', to: '/features' },
  { label: 'Solutions', menu: audiences },
  { label: 'Security', to: '/security' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'Support', to: '/support' },
]

export function LandingNav() {
  const [open, setOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

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

  return (
    <header className="lp-nav">
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
                      {link.menu.map((item) => (
                        <li key={item.to}>
                          <Link to={item.to} onClick={() => setMenuOpen(false)}>{item.name}</Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <Link className="lp-nav__link" to={link.to}>{link.label}</Link>
              )}
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
            {links.filter((l) => l.to).map((link) => (
              <li key={link.label}>
                <Link to={link.to} onClick={() => setOpen(false)}>{link.label}</Link>
              </li>
            ))}
            <li className="lp-nav__sheet-label">Solutions</li>
            {audiences.map((item) => (
              <li key={item.to}>
                <Link to={item.to} onClick={() => setOpen(false)}>{item.name}</Link>
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
