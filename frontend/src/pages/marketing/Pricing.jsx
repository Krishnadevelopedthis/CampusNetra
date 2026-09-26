import { StaticPage } from '@/pages/StaticPage'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

const INCLUDED = [
  'Issue reporting, work orders, and inspections',
  'Digital twin and live campus map',
  'Predictive maintenance and analytics',
  'Lost & found',
  'Role-based admin console',
  'Verified accounts — OTP on phone/email changes, ID-checked name changes',
]

export default function Pricing() {
  return (
    <StaticPage
      path="/pricing"
      eyebrow="Pricing"
      title="Priced around your campus, not a seat count"
      subtitle="Every campus is a different size with a different mix of buildings, staff, and students — pricing is worked out per deployment rather than a generic per-seat rate that doesn't fit either a small college or a large university system."
    >
      <div className="not-prose widget p-8 glass-panel border border-glass-border">
        <p className="text-body-sm text-ink-faint uppercase tracking-wider font-semibold mb-1">Included on every plan</p>
        <ul className="mt-4 space-y-3">
          {INCLUDED.map((item) => (
            <li key={item} className="flex items-start gap-3 text-body-md text-ink">
              <Check size={18} className="text-secondary mt-0.5 flex-shrink-0" />
              {item}
            </li>
          ))}
        </ul>
        <Link
          to="/support"
          className="btn-primary mt-8 inline-flex"
        >
          Talk to us about your campus
        </Link>
      </div>
      <p className="mt-8 text-body-sm text-ink-faint">
        Already have an account? <Link to="/login" className="text-secondary hover:underline">Log in</Link> —
        or <Link to="/register" className="text-secondary hover:underline">register</Link> to try it directly.
      </p>
    </StaticPage>
  )
}
