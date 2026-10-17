import { useCallback, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'

import { LandingHero } from '@/components/landing/LandingHero'
import { LandingNav } from '@/components/landing/LandingNav'
import {
  AISection, CTASection, FAQSection, FeaturesSection, HowItWorksSection,
  LandingFooter, RolesSection, SecuritySection, TwinSection,
} from '@/components/landing/LandingSections'
import { SITE_URL, usePageSEO } from '@/hooks/usePageSEO'

const HOME_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: 'CampusNetra',
      url: SITE_URL,
      logo: `${SITE_URL}/logo-dark.svg`,
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'CampusNetra',
      url: SITE_URL,
      description: 'Campus facility management software for issue reporting, work orders, digital twins, inspections, and predictive maintenance.',
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'CampusNetra',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description:
        'AI-powered campus facility management: issue reporting, work order orchestration, '
        + 'digital twin visualisation, and predictive maintenance for universities, colleges '
        + 'and research facilities.',
      url: SITE_URL,
      publisher: { '@id': `${SITE_URL}/#organization` },
      featureList: [
        'Campus issue reporting',
        'Work order management',
        'Digital twin and campus maps',
        'AI-assisted incident triage',
        'Predictive maintenance',
      ],
    },
  ],
}

export default function LandingPage() {
  usePageSEO({
    title: 'Campus facility management software',
    description:
      'CampusNetra is campus facility management software for issue reporting, work orders, '
      + 'digital twins, inspections, and predictive maintenance.',
    path: '/',
    jsonLd: HOME_JSON_LD,
  })

  const rootRef = useRef(null)
  const location = useLocation()

  const scrollTo = useCallback((hash, smooth = true) => {
    const el = hash && document.querySelector(hash)
    if (!el) return false
    el.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
    return true
  }, [])

  // In-page links scroll smoothly and keep the hash in the address bar.
  const onAnchor = useCallback((e, hash) => {
    e.preventDefault()
    if (scrollTo(hash)) window.history.replaceState(null, '', hash)
  }, [scrollTo])

  // Arriving with a hash (e.g. /#features from another page) lands on it.
  useEffect(() => {
    if (location.hash) scrollTo(location.hash, false)
  }, [location.hash, scrollTo])

  // Sections rise into view as they scroll in. Content stays visible without
  // JavaScript: the hidden starting state only applies once .lp-js is set.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    const items = root.querySelectorAll('.lp-reveal')
    if (!('IntersectionObserver' in window)) return undefined
    root.classList.add('lp-js')
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in')
          io.unobserve(entry.target)
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })
    items.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return (
    <div className="lp" ref={rootRef}>
      <a className="lp-skip" href="#main">Skip to content</a>
      <LandingNav onAnchor={onAnchor} />
      <main id="main">
        <LandingHero />
        <FeaturesSection />
        <HowItWorksSection />
        <TwinSection />
        <AISection />
        <RolesSection />
        <SecuritySection />
        <FAQSection />
        <CTASection />
      </main>
      <LandingFooter onAnchor={onAnchor} />
    </div>
  )
}
