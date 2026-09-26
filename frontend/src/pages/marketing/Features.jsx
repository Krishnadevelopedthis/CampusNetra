import { StaticPage } from '@/pages/StaticPage'
import { AlertTriangle, ClipboardList, Layers, Brain, ClipboardCheck, Search } from 'lucide-react'

const FEATURES = [
  {
    icon: AlertTriangle,
    title: 'Issue reporting',
    body: 'Structured reports with the room, one or more photos, and automatic severity triage — not a message in a group chat that gets lost by the next morning.',
  },
  {
    icon: ClipboardList,
    title: 'Work orders',
    body: 'Every report becomes a trackable work order with an assignee, a status, and a full history — as a list or a kanban board, whichever a team actually works from.',
  },
  {
    icon: ClipboardCheck,
    title: 'Inspections',
    body: 'Scheduled, checklist-driven inspections per building, with pass/fail items that raise their own issues automatically when something fails.',
  },
  {
    icon: Layers,
    title: 'Digital twin & campus map',
    body: 'A live map of every building, and a 3D floor-by-floor view of the ones that need it — see where problems cluster before sending anyone out.',
  },
  {
    icon: Brain,
    title: 'Predictive maintenance',
    body: 'Flags assets trending toward failure from their service and repair history, instead of waiting for something to actually break.',
  },
  {
    icon: Search,
    title: 'Lost & found',
    body: 'A shared, searchable log for lost and found items across campus, instead of a table by the front desk nobody checks.',
  },
]

export default function Features() {
  return (
    <StaticPage
      path="/features"
      eyebrow="Features"
      title="Everything a campus facilities team actually needs, in one place"
      subtitle="Nine connected modules sharing one source of truth — no separate tool for issues, work orders, and the inspection schedule that never gets checked."
    >
      <div className="not-prose grid sm:grid-cols-2 gap-5 mt-2">
        {FEATURES.map(({ icon: Icon, title, body }) => (
          <div key={title} className="widget p-5 glass-panel border border-glass-border">
            <div className="w-9 h-9 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center justify-center mb-3">
              <Icon size={16} className="text-secondary" />
            </div>
            <h3 className="text-headline-md text-ink font-bold mb-1.5">{title}</h3>
            <p className="text-body-sm text-ink-muted leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </StaticPage>
  )
}
