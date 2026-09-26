import { StaticPage } from '@/pages/StaticPage'

export default function Docs() {
  return (
    <StaticPage
      path="/docs"
      noindex
      eyebrow="Documentation"
      title="Documentation is still being written"
      subtitle="CampusNetra is under active development, and a full documentation site isn't published yet."
    >
      <p>
        In the meantime, the fastest way to understand how something works is to use it directly
        — the app is built to be workable without a manual for its core flows: reporting an
        issue, tracking a work order, or reviewing a request as an admin.
      </p>
      <p>
        If you're stuck on something specific, the{' '}
        <a href="/support" className="text-secondary hover:underline">support page</a> is the
        quickest path to an actual answer while the written docs catch up.
      </p>
    </StaticPage>
  )
}
