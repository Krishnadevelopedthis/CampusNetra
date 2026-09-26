import { StaticPage } from '@/pages/StaticPage'

export default function Community() {
  return (
    <StaticPage
      path="/community"
      noindex
      eyebrow="Community"
      title="No public community space yet"
      subtitle="There isn't a forum or chat server to point you to at the moment — that's worth building once there's an active user base to build it around, not before."
    >
      <p>
        If you're using CampusNetra at your institution and want to compare notes with other
        facility teams, or if you'd genuinely use a community space and want to say so, the{' '}
        <a href="/support" className="text-secondary hover:underline">support page</a> is the
        way to reach us in the meantime.
      </p>
    </StaticPage>
  )
}
