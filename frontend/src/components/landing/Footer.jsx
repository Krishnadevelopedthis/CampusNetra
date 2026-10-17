import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Sparkles, ArrowRight } from 'lucide-react'
import clsx from 'clsx'

const FOOTER_LINKS = {
  Platform: [
    { label: 'Issue Management', href: '/features' },
    { label: 'Work Orders', href: '/features' },
    { label: 'Digital Twin', href: '/features' },
    { label: 'Predictive AI', href: '/features' },
    { label: 'Lost & Found', href: '/features' },
  ],
  Solutions: [
    { label: 'Universities', href: '/solutions/universities' },
    { label: 'Colleges', href: '/solutions/colleges' },
    { label: 'Research Facilities', href: '/solutions/research' },
    { label: 'Facility Managers', href: '/solutions/managers' },
  ],
  Company: [
    { label: 'About', href: '/about' },
    { label: 'How It Works', href: '/features' },
    { label: 'Privacy Policy', href: '/privacy' },
    { label: 'Terms of Service', href: '/terms' },
  ],
  Account: [
    { label: 'Log In', href: '/login' },
    { label: 'Register', href: '/register' },
    { label: 'Report Lost Item', href: '/lost-found/report' },
  ],
  Resources: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Security', href: '/security' },
    { label: 'Support', href: '/support' },
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
                    <Link
                      to={link.href}
                      className={clsx(
                        'text-body-sm text-ink-muted hover:text-secondary transition-colors duration-200 flex items-center gap-1.5 group',
                      )}
                    >
                      {link.label}
                      <ArrowRight size={12} className="text-ink-faint group-hover:text-secondary group-hover:translate-x-1 transition-all duration-200" />
                    </Link>
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