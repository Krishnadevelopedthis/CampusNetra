import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { LandingNav } from '@/components/landing/LandingNav'
import { LandingFooter } from '@/components/landing/LandingSections'
import { usePageSEO } from '@/hooks/usePageSEO'

/**
 * Wraps a public content page (features, pricing, solutions, legal...) in
 * the landing page's shell: the same navbar, footer, ember palette and
 * typography, so the marketing site reads as one place. The body stays a
 * calm reading column — dense content needs contrast and stillness, not the
 * homepage's motion.
 *
 * Pages keep writing their content with the app's usual utility classes
 * (text-ink, text-secondary, widget, btn-primary...). Inside .lp-page those
 * colour tokens are re-pointed at the ember palette (styles/landing.css), so
 * nothing in the individual pages needs to know about the theme.
 *
 * `path`/`description`/`noindex`/`jsonLd` feed usePageSEO.
 */
export function StaticPage({
  eyebrow, title, subtitle, children, path, description, noindex, jsonLd,
}) {
  const navigate = useNavigate()

  usePageSEO({ title, description: description || subtitle, path, noindex, jsonLd })

  // A real "go back" when there is somewhere to go back to; Home otherwise
  // (a bookmark, a fresh tab, a link from another site).
  const goBack = (e) => {
    if (window.history.state?.idx > 0) {
      e.preventDefault()
      navigate(-1)
    }
  }

  // Section links in the nav and footer live on the homepage.
  const onAnchor = useCallback((e, hash) => {
    e.preventDefault()
    navigate(`/${hash}`)
  }, [navigate])

  return (
    <div className="lp lp-page">
      <a className="lp-skip" href="#main">Skip to content</a>
      <LandingNav onAnchor={onAnchor} />
      <main id="main" className="lp-page__main">
        <div className="lp-page__glow" aria-hidden="true" />
        <div className="lp-page__col">
          <Link to="/" onClick={goBack} className="lp-page__back">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </Link>
          {eyebrow ? <p className="lp-eyebrow">{eyebrow}</p> : null}
          <h1 className="lp-page__title">{title}</h1>
          {subtitle ? <p className="lp-page__sub">{subtitle}</p> : null}
          <div className="lp-prose">
            {children}
          </div>
        </div>
      </main>
      <LandingFooter onAnchor={onAnchor} />
    </div>
  )
}
