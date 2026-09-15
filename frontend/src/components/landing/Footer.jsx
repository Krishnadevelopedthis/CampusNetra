import { Link } from 'react-router-dom'
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
    { label: 'Documentation', href: '/docs', isRoute: true },
    { label: 'API Reference', href: '/api-docs', isRoute: true },
    { label: 'Community', href: '/community', isRoute: true },
    { label: 'Support', href: '/support', isRoute: true },
  ],
}

export function Footer() {
  const currentYear = new Date().getFullYear()

  const handleAnchor = (e, href) => {
    e.preventDefault()
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

        {/* Sitemap Section */}
        <div className="mb-8 pt-8 border-t border-glass-border">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Public Website */}
            <div>
              <p className="text-label-caps text-ink uppercase tracking-wider mb-4 font-bold text-gradient-cyber">PUBLIC WEBSITE</p>
              <ul className="space-y-2 text-body-sm text-ink-muted font-mono">
                <li className="flex items-center gap-2"><ArrowRight size={10} className="text-ink-faint" /> /</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #platform</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #twin</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #ai</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #analytics</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #how-it-works</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> #faq</li>
                <li className="flex items-center gap-2"><ArrowRight size={10} className="text-ink-faint" /> /features</li>
                <li className="flex items-center gap-2"><ArrowRight size={10} className="text-ink-faint" /> /about</li>
              </ul>
            </div>

            {/* Sitemap */}
            <div>
              <p className="text-label-caps text-ink uppercase tracking-wider mb-4 font-bold text-gradient-cyber">SITEMAP</p>
              <ul className="space-y-2 text-body-sm text-ink-muted font-mono">
                <li className="flex items-center gap-2"><ArrowRight size={10} className="text-ink-faint" /> /</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /features</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /about</li>
              </ul>
            </div>

            {/* Private Application */}
            <div>
              <p className="text-label-caps text-ink uppercase tracking-wider mb-4 font-bold text-gradient-cyber">PRIVATE APPLICATION 🔒</p>
              <ul className="space-y-2 text-body-sm text-ink-muted font-mono">
                <li className="flex items-center gap-2"><ArrowRight size={10} className="text-ink-faint" /> /dashboard</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /issues</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /work-orders</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /inspections</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /lost-found</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /analytics</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /twin</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /profile</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /settings</li>
                <li className="flex items-center gap-2 pl-4"><ArrowRight size={10} className="text-ink-faint" /> /admin/*</li>
              </ul>
            </div>
          </div>
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