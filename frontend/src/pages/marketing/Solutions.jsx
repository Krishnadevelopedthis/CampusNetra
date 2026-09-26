import { useParams, Link, Navigate } from 'react-router-dom'
import { StaticPage } from '@/pages/StaticPage'

const AUDIENCES = {
  universities: {
    title: 'CampusNetra for universities',
    subtitle: 'Multi-campus, multi-building facilities management that stays coherent across a large, spread-out institution.',
    points: [
      'One issue and work-order queue across every campus and building, instead of a separate process per department.',
      'A live map and digital twin covering the whole footprint, so a facilities director can see where problems cluster.',
      'Role-based access so a building manager sees their buildings and a system administrator sees everything.',
    ],
  },
  colleges: {
    title: 'CampusNetra for colleges',
    subtitle: 'Facility management sized for a single, tighter campus — without the overhead built for something bigger.',
    points: [
      'Fast issue reporting for students and staff, with automatic routing to the right technician.',
      'Scheduled inspections that actually happen, with a checklist and a record of what passed and what didn\u2019t.',
      'A shared lost & found that replaces the notice board by the front desk.',
    ],
  },
  research: {
    title: 'CampusNetra for research facilities',
    subtitle: 'Lab and equipment-heavy environments where a maintenance gap can mean lost research time, not just an inconvenience.',
    points: [
      'Asset tracking built for equipment, not just buildings — service history, warranty status, and repair cost per item.',
      'Predictive maintenance that flags equipment trending toward failure before it takes down an experiment.',
      'An audit trail on every change, which matters when equipment access ties into compliance requirements.',
    ],
  },
  managers: {
    title: 'CampusNetra for facility managers',
    subtitle: 'Built around the actual daily job — triaging what came in, dispatching who\u2019s free, and knowing what\u2019s about to break.',
    points: [
      'A work-order board that mirrors how a facilities team actually works, not a generic ticket queue.',
      'SLA tracking that shows compliance in real time, not a report assembled at the end of the month.',
      'Predictive alerts, so the first sign of a failing asset is a maintenance flag, not a call from an angry building.',
    ],
  },
}

export default function Solutions() {
  const { audience } = useParams()
  const data = AUDIENCES[audience]

  if (!data) return <Navigate to="/" replace />

  return (
    <StaticPage path={`/solutions/${audience}`} eyebrow="Solutions" title={data.title} subtitle={data.subtitle}>
      <ul className="not-prose space-y-4">
        {data.points.map((point) => (
          <li key={point} className="flex gap-3 text-body-md text-ink-muted leading-relaxed">
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0" />
            {point}
          </li>
        ))}
      </ul>
      <Link to="/register" className="btn-primary mt-8 inline-flex">
        Get started
      </Link>
    </StaticPage>
  )
}
