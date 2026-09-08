import { useEffect } from 'react'
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

export default function LandingPage() {
  useEffect(() => {
    // Set document title for SEO
    document.title = 'CampusNetra | Smart Campus Facility Management System'
  }, [])

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
