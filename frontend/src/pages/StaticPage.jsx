import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'

/**
 * Wraps a simple content page with the same nav/footer as the landing
 * page, so these don't feel like a different, unstyled site. Content
 * pages pass children; kept deliberately plain (no glass/spotlight
 * decoration) since dense reading content needs contrast and stillness,
 * not the landing page's marketing motion.
 */
export function StaticPage({ eyebrow, title, subtitle, children }) {
  return (
    <div className="min-h-screen bg-surface-base">
      <Navbar />
      <main className="pt-32 pb-24">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
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
