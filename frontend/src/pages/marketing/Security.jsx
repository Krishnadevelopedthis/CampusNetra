import { StaticPage } from '@/pages/StaticPage'
import { ShieldCheck, KeyRound, ImageOff, UserCheck } from 'lucide-react'

const MEASURES = [
  {
    icon: KeyRound,
    title: 'Verified changes, not silent edits',
    body: 'Changing your email or phone requires confirming a one-time code sent to the new address. A wrong-code attempt actually counts against a limit — guessing repeatedly gets locked out, not silently retried forever.',
  },
  {
    icon: UserCheck,
    title: 'ID-checked name changes',
    body: 'Changing your legal name on your account requires an ID document that both matches the requested name and carries your own account\u2019s enrollment or employee number — a name match alone isn\u2019t enough.',
  },
  {
    icon: ImageOff,
    title: 'Private document storage',
    body: 'Uploaded ID photos are never placed on a public path. They\u2019re stored separately from public media, path-checked on every read, and only reachable by an administrator reviewing that specific request.',
  },
  {
    icon: ShieldCheck,
    title: 'CAPTCHA that can\u2019t be replayed',
    body: 'Login and password-reset are protected by a CAPTCHA that\u2019s invalidated the moment it\u2019s used once, closing off automated retry attempts against a single solved challenge.',
  },
]

export default function Security() {
  return (
    <StaticPage
      eyebrow="Security"
      title="How CampusNetra protects your account"
      subtitle="Specific, real measures — not a generic 'we take security seriously' paragraph."
    >
      <div className="not-prose space-y-5">
        {MEASURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="widget p-5 glass-panel border border-glass-border flex gap-4">
            <div className="w-10 h-10 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
              <Icon size={18} className="text-secondary" />
            </div>
            <div>
              <h3 className="text-headline-md text-ink font-bold mb-1">{title}</h3>
              <p className="text-body-sm text-ink-muted leading-relaxed">{body}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-8">
        Found a security issue? Please report it through the{' '}
        <a href="/support" className="text-secondary hover:underline">support page</a> rather than
        a public channel, so it can be fixed before it's widely known.
      </p>
    </StaticPage>
  )
}
