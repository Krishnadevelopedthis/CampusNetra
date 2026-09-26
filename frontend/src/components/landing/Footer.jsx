import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Sparkles, ArrowRight } from 'lucide-react'
import clsx from 'clsx'

const FOOTER_LINKS = {
  Platform: [
    { label: 'Issue Management', href: '#platform' },
    { label: 'Work Orders', href: '#platform' },
    { label: 'Digital Twin', href: '#twin' },
    { label: 'Predictive AI', href: '#ai' },
    { label: 'Lost & Found', href: '#platform' },
  ],
  Solutions: [
    { label: 'Universities', href: '/solutions/universities', isRoute: true },
    { label: 'Colleges', href: '/solutions/colleges', isRoute: true },
    { label: 'Research Facilities', href: '/solutions/research', isRoute: true },
    { label: 'Facility Managers', href: '/solutions/managers', isRoute: true },
  ],
  Company: [
    { label: 'About', href: '/about', isRoute: true },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Privacy Policy', href: '/privacy', isRoute: true },
    { label: 'Terms of Service', href: '/terms', isRoute: true },
  ],
  Account: [
    { label: 'Log In', href: '/login', isRoute: true },
    { label: 'Register', href: '/register', isRoute: true },
    { label: 'Report Lost Item', href: '/lost-found/report', isRoute: true },
  ],
  Resources: [
    { label: 'Features', href: '/features', isRoute: true },
    { label: 'Pricing', href: '/pricing', isRoute: true },
    { label: 'Security', href: '/security', isRoute: true },
    { label: 'Support', href: '/support', isRoute: true },
  ],
}
// Documentation, API Reference and Community are deliberately left out --
// all three are still genuinely "coming soon" placeholder pages (see
// pages/marketing/Docs.jsx etc.), not real content. Linking to them from
// primary site navigation invited real visitors to click through to a
// dead end, and search engines to treat thin placeholder pages as if they
// mattered as much as the real ones -- the pages themselves still exist
// and are reachable directly, just marked noindex (see usePageSEO calls
// in each) and no longer promoted from the footer.

export function Footer() {
  const currentYear = new Date().getFullYear()
  const location = useLocation()
  const navigate = useNavigate()

  // This footer is shared by every page (StaticPage renders it too, not
  // just the homepage) -- these anchors only ever point at sections that
  // exist on the homepage. Clicking "Issue Management" while already
  // reading the Pricing page used to just silently do nothing: preventDefault
  // fired, but document.querySelector(href) found nothing on this page to
  // scroll to. Off the homepage, this now navigates to "/" + the hash
  // instead; LandingPage's own mount effect (see LandingPage.jsx) picks up
  // that hash and scrolls to it once the section actually exists in the DOM.
  const handleAnchor = (e, href) => {
    e.preventDefault()
    if (location.pathname !== '/') {
      navigate(`/${href}`)
      return
    }
    const el = document.querySelector(href)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <footer className="bg-surface-base border-t border-glass-border py-16 relative overflow-hidden">
      {/* Radial spotlight accents */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[400px] h-[200px] bg-spotlight-primary opacity-20 -z-10" />
        <div className="absolute top-0 right-1/4 w-[350px] h-[180px] bg-spotlight-secondary opacity-15 -z-10" />
      </div>

      {/* Grid beam subtle overlay */}
      <div className="absolute inset-0 bg-grid-beam opacity-10 pointer-events-none" aria-hidden="true" />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-8 mb-12">
          {/* Brand col */}
          <div className="col-span-2">
            <Link to="/" className="inline-block mb-4">
              <Logo subtitle={false} size={36} isDynamic />
            </Link>
            <p className="text-body-sm text-ink-muted max-w-sm leading-relaxed mb-6">
              CampusNetra is an intelligent campus facility management platform combining issue reporting,
              work order orchestration, digital twin visualisation, and AI-driven predictive maintenance.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border border-glass-border text-body-sm font-semibold text-secondary mb-4">
              <Sparkles size={14} className="text-secondary" />
              <span className="text-gradient-electric">Powered by CampusNetra</span>
            </div>
            <p className="text-body-sm text-ink-faint">
              © {currentYear} CampusNetra. All rights reserved.
            </p>
          </div>

          {/* Nav columns */}
          {Object.entries(FOOTER_LINKS).map(([category, links]) => (
            <div key={category}>
              <p className="text-label-caps text-ink uppercase tracking-wider mb-4 font-bold text-gradient-cyber">{category}</p>
              <ul className="space-y-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    {link.isRoute ? (
                      <Link
                        to={link.href}
                        className={clsx(
                          'text-body-sm text-ink-muted hover:text-secondary transition-colors duration-200 flex items-center gap-1.5 group',
                        )}
                      >
                        {link.label}
                        <ArrowRight size={12} className="text-ink-faint group-hover:text-secondary group-hover:translate-x-1 transition-all duration-200" />
                      </Link>
                    ) : (
                      <a
                        href={link.href}
                        onClick={(e) => handleAnchor(e, link.href)}
                        className={clsx(
                          'text-body-sm text-ink-muted hover:text-secondary transition-colors duration-200 flex items-center gap-1.5 group',
                        )}
                      >
                        {link.label}
                        <ArrowRight size={12} className="text-ink-faint group-hover:text-secondary group-hover:translate-x-1 transition-all duration-200" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-glass-border flex flex-col sm:flex-row items-center justify-between gap-4 text-body-sm text-ink-faint">
          <p className="text-gradient-emerald font-medium">CampusNetra — Smart Campus Facility Management System</p>
          <div className="flex gap-6">
            <Link to="/privacy" className="hover:text-secondary cursor-pointer transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-secondary cursor-pointer transition-colors">Terms</Link>
            <Link to="/security" className="hover:text-secondary cursor-pointer transition-colors">Security</Link>
          </div>
        </div>
      </div>
    </footer>
  )
}