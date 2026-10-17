import { LandingHero } from '@/components/landing/LandingHero'
import { LandingNav } from '@/components/landing/LandingNav'
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

  // One full-screen hero; the longer feature tour lives on /features.
  return (
    <div className="lp">
      <a className="lp-skip" href="#main">Skip to content</a>
      <LandingNav />
      <main id="main">
        <LandingHero />
      </main>
    </div>
  )
}
