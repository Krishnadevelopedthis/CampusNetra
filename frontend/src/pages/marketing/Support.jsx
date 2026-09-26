import { StaticPage } from '@/pages/StaticPage'
import { Mail } from 'lucide-react'

export default function Support() {
  return (
    <StaticPage
      path="/support"
      eyebrow="Support"
      title="Get help"
      subtitle="Something broken, confusing, or missing? This is the place to say so."
    >
      <div className="not-prose widget p-6 glass-panel border border-glass-border flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center flex-shrink-0">
          <Mail size={18} className="text-secondary" />
        </div>
        <div>
          <p className="text-body-sm text-ink-faint">Email</p>
          <a href="mailto:support@campusnetra.dpdns.org" className="text-body-lg text-ink font-semibold hover:text-secondary transition-colors">
            support@campusnetra.dpdns.org
          </a>
        </div>
      </div>
      <p className="mt-6 text-body-sm text-ink-faint">
        If you're reporting a security issue specifically, say so in the subject line so it gets
        prioritized appropriately.
      </p>
    </StaticPage>
  )
}
