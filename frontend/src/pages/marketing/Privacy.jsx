import { StaticPage } from '@/pages/StaticPage'

export default function Privacy() {
  return (
    <StaticPage eyebrow="Legal" title="Privacy Policy" subtitle="Last updated: reflects what CampusNetra currently collects and why.">
      <div className="not-prose widget p-5 glass-panel border border-warning-border bg-warning-bg mb-8">
        <p className="text-body-sm text-warning-text">
          This page describes what the product actually does today. It is a starting draft, not
          reviewed by a lawyer — have it checked against your institution's actual data-handling
          obligations before relying on it.
        </p>
      </div>

      <h2 className="text-headline-md text-ink font-bold">What we collect</h2>
      <p>
        Account details you provide directly — name, email, phone number, and your enrollment or
        employee ID. If you report an issue or a lost/found item, whatever you include in that
        report: photos, a description, and the room or location. If you request a change to your
        name, a photo of your ID card, used once to verify the change and then kept in private,
        access-controlled storage rather than anywhere public.
      </p>

      <h2 className="text-headline-md text-ink font-bold">How verification works</h2>
      <p>
        Changing your email or phone number requires confirming a one-time code sent to the new
        address. Changing your name requires uploading an ID document, which is matched
        automatically where possible and reviewed by an administrator where it isn't. ID photos
        are stored privately and are only ever visible to an administrator handling that specific
        request.
      </p>

      <h2 className="text-headline-md text-ink font-bold">What we don't do</h2>
      <p>
        We don't sell account data to third parties. We don't use your reports, photos, or ID
        documents for anything beyond running the platform and, in aggregate and de-identified
        form, understanding how the platform is used.
      </p>

      <h2 className="text-headline-md text-ink font-bold">Your choices</h2>
      <p>
        You can review and update your profile at any time from your account settings, and you
        can request a copy of your data or deletion of your account from the same place.
      </p>

      <h2 className="text-headline-md text-ink font-bold">Contact</h2>
      <p>Questions about this policy — see the <a href="/support" className="text-secondary hover:underline">support page</a>.</p>
    </StaticPage>
  )
}
