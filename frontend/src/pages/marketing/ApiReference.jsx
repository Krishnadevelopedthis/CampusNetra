import { StaticPage } from '@/pages/StaticPage'

export default function ApiReference() {
  return (
    <StaticPage
      path="/api-docs"
      noindex
      eyebrow="Developers"
      title="A public API reference isn't published yet"
      subtitle="CampusNetra's backend is a REST API under the hood, but a stable, documented public surface for third-party integrations doesn't exist yet."
    >
      <p>
        If you're integrating with CampusNetra for your institution and need programmatic
        access — a data export, a webhook, or a specific integration — reach out through the{' '}
        <a href="/support" className="text-secondary hover:underline">support page</a> with what
        you're trying to build. Early integration needs are exactly what should shape what a
        public API reference actually covers, rather than the other way around.
      </p>
    </StaticPage>
  )
}
