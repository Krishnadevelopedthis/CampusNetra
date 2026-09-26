import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Navbar,
  Hero,
  TrustSection,
  ProblemSolution,
  FeatureBento,
  RoleTabs,
  HowItWorks,
  DigitalTwinShowcase,
  AISection,
  AnalyticsShowcase,
  Testimonials,
  FeatureMarquee,
  PlatformArchitecture,
  Benefits,
  SecuritySection,
  FAQSection,
  CTA,
  Footer,
} from '@/components/landing'
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
    },
  ],
}

export default function LandingPage() {
  usePageSEO({
    title: 'Smart Campus Facility Management System',
    description:
      'CampusNetra is an intelligent campus facility management platform combining issue '
      + 'reporting, work order orchestration, digital twin visualisation, and AI-driven '
      + 'predictive maintenance.',
    path: '/',
    jsonLd: HOME_JSON_LD,
  })

  const location = useLocation()
  useEffect(() => {
    if (!location.hash) return
    // Arriving here via Footer's cross-page anchor links (from e.g. /pricing
    // clicking "Issue Management") lands with a hash but nothing scrolled
    // to yet -- a plain document.querySelector at mount time can also lose
    // the race against this page's own lazy-loaded sections still
    // rendering, so this retries for up to ~1s instead of trying once and
    // silently giving up if the target section isn't in the DOM yet.
    let attempts = 0
    const tryScroll = () => {
      const el = document.querySelector(location.hash)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' })
      } else if (attempts < 20) {
        attempts += 1
        setTimeout(tryScroll, 50)
      }
    }
    tryScroll()
  }, [location.hash])

  return (
    <div className="min-h-screen bg-surface-base text-ink flex flex-col">
      {/* 1. Sticky Navigation */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero Section */}
        <Hero />

        {/* 3. Trust & Social Proof */}
        <TrustSection />

        {/* 4. Problem -> Solution */}
        <ProblemSolution />

        {/* 5. Platform Bento Grid */}
        <FeatureBento />

        {/* 6. Interactive Role Tabs */}
        <RoleTabs />

        {/* 7. How It Works (6-step process) */}
        <HowItWorks />

        {/* 8. Digital Twin Showcase */}
        <DigitalTwinShowcase />

        {/* 9. AI Intelligence Section */}
        <AISection />

        {/* 10. Analytics & SLA Showcase */}
        <AnalyticsShowcase />

        {/* 11. Testimonials & Feedback */}
        <Testimonials />

        {/* 12. Feature Marquee */}
        <FeatureMarquee />

        {/* 13. Platform Architecture / Command Center */}
        <PlatformArchitecture />

        {/* 14. Core Benefits */}
        <Benefits />

        {/* 15. Security & Governance */}
        <SecuritySection />

        {/* 16. FAQ Accordion */}
        <FAQSection />

        {/* 17. Final Call to Action */}
        <CTA />
      </main>

      {/* 18. Footer */}
      <Footer />
    </div>
  )
}
