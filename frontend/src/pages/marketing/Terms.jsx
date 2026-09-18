import { StaticPage } from '@/pages/StaticPage'

export default function Terms() {
  return (
    <StaticPage eyebrow="Legal" title="Terms of Service" subtitle="The basics of using CampusNetra.">
      <div className="not-prose widget p-5 glass-panel border border-warning-border bg-warning-bg mb-8">
        <p className="text-body-sm text-warning-text">
          Starting draft, not reviewed by a lawyer — have it checked before relying on it,
          especially anything touching liability or your institution's specific policies.
        </p>
      </div>

      <h2 className="text-headline-md text-ink font-bold">Using CampusNetra</h2>
      <p>
        Your account is issued through your campus or institution and tied to your enrollment or
        employee ID. You're responsible for reports, requests, and content submitted under your
        account, and for keeping your login credentials to yourself.
      </p>

      <h2 className="text-headline-md text-ink font-bold">Accurate reporting</h2>
      <p>
        Issue reports, lost & found listings, and name/contact-change requests should be genuine.
        Deliberately false reports or fraudulent verification attempts (including submitting an ID
        document that isn't yours) can result in account suspension.
      </p>

      <h2 className="text-headline-md text-ink font-bold">Availability</h2>
      <p>
        CampusNetra is provided as-is. We work to keep it available and accurate, but we don't
        guarantee uninterrupted access, and it shouldn't be the sole channel for reporting a
        genuine safety emergency — follow your campus's emergency procedures for anything urgent.
      </p>

      <h2 className="text-headline-md text-ink font-bold">Changes</h2>
      <p>These terms may be updated as the product changes; material changes will be reflected here.</p>

      <h2 className="text-headline-md text-ink font-bold">Contact</h2>
      <p>Questions — see the <a href="/support" className="text-secondary hover:underline">support page</a>.</p>
    </StaticPage>
  )
}
