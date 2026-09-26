import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { usePageSEO } from '@/hooks/usePageSEO'

/**
 * Wraps a simple content page with the same nav/footer as the landing
 * page, so these don't feel like a different, unstyled site. Content
 * pages pass children; kept deliberately plain (no glass/spotlight
 * decoration) since dense reading content needs contrast and stillness,
 * not the landing page's marketing motion.
 *
 * `path`/`description`/`noindex`/`jsonLd` feed usePageSEO -- every caller
 * already has a real per-page title/subtitle, so this is the one place
 * that turns those into an actual <title>/meta/canonical instead of every
 * one of these pages silently sharing index.html's single static set.
 */
export function StaticPage({
  eyebrow, title, subtitle, children, path, description, noindex, jsonLd,
}) {
  const navigate = useNavigate()

  usePageSEO({ title, description: description || subtitle, path, noindex, jsonLd })

  // A real "go back", not always Home: arriving here from a mid-scroll
  // anchor on the landing page (or from a search result, another site
  // page, wherever) and landing back at the very top of Home on the way
  // out read as "back" not actually going back. `-1` returns to wherever
  // history actually came from -- same behaviour a browser/mobile back
  // gesture already gives, just as a visible, tappable affordance too.
  // Falls back to Home only when there's nowhere to go back to (a
  // bookmark, a fresh tab, a link from another site).
  const goBack = (e) => {
    if (window.history.state?.idx > 0) {
      e.preventDefault()
      navigate(-1)
    }
  }

  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />
      <main className="pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <Link
            to="/"
            onClick={goBack}
            className="inline-flex items-center gap-1.5 text-body-sm font-medium text-ink-muted hover:text-secondary transition-colors mb-8 -ml-1 px-1 py-1 min-h-[44px] items-center"
          >
            <ArrowLeft size={16} />
            Back
          </Link>
          {eyebrow ? (
            <p className="text-label-caps uppercase tracking-wider text-secondary font-semibold mb-3">{eyebrow}</p>
          ) : null}
          <h1 className="text-headline-lg text-ink font-bold" style={{ textWrap: 'balance' }}>{title}</h1>
          {subtitle ? <p className="mt-4 text-body-lg text-ink-muted leading-relaxed">{subtitle}</p> : null}
          <div className="mt-10 prose-content text-body-md text-ink-muted leading-relaxed space-y-6">
            {children}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
