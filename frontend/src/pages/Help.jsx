import {
  Boxes, Brain, Camera, ChevronDown, Mail, MapPin, MessageSquare, PackageSearch,
  Phone, Radar, Send, ShieldCheck, Sparkles, Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { Widget } from '@/components/ui'
import { useAuth } from '@/lib/auth'

const SUPPORT_EMAIL = 'techcareit.in@gmail.com'
const SUPPORT_PHONE = '9867943963'

const CAPABILITIES = [
  {
    icon: Camera,
    title: 'Report in seconds',
    body: 'Photograph a fault, pick the room, submit. No forms to route by hand and no ticket numbers to remember.',
  },
  {
    icon: Brain,
    title: 'AI triage and routing',
    body: 'Every complaint is classified, prioritised and sent to the department that owns that kind of fault — with duplicates folded into the original.',
  },
  {
    icon: Radar,
    title: 'A live digital twin',
    body: 'Each campus, building, floor and room is drawn to scale. Assets change colour the moment their state changes, so a fault is visible on the map before anyone reads the ticket.',
  },
  {
    icon: Wrench,
    title: 'Work orders and inspections',
    body: 'Faults become assigned work with SLA clocks, parts, costs and sign-off. Scheduled inspections run from the same asset register.',
  },
  {
    icon: PackageSearch,
    title: 'Lost & Found that matches itself',
    body: 'Lost and found reports are compared on image similarity, description, location, category and timing, so a match surfaces without anyone browsing a list.',
  },
  {
    icon: Boxes,
    title: 'Costs and prediction',
    body: 'Maintenance spend is tracked per asset and rolled up by month, quarter and year, alongside predicted failures from service history.',
  },
]

const FAQS = [
  {
    q: 'How do I report a problem?',
    a: 'Open “Report an Issue”, add a photo, choose the building and room, and describe what is wrong. Campus Netra classifies it and routes it automatically — you do not need to know which department handles it.',
  },
  {
    q: 'I reported something. What happens next?',
    a: 'It appears immediately under “Live Issues” with a status. When a technician is assigned, and again when the work is completed, you are notified. The asset also changes colour on the digital twin until it is fixed.',
  },
  {
    q: 'Someone already reported the same fault. Does mine get lost?',
    a: 'No. Duplicate reports are linked to the original rather than discarded, and the count of people affected is used to raise its priority.',
  },
  {
    q: 'I lost something on campus.',
    a: 'Report it under Lost & Found with a photo if you have one. Every found item is scored against your report; when something matches, you are notified and told where to collect it.',
  },
  {
    q: 'How do I claim a found item?',
    a: 'Open the item and submit a claim describing an identifying detail only the owner would know. Whoever is holding the item verifies that before handing it over.',
  },
  {
    q: 'I did not receive my verification code.',
    a: 'Check the spam folder first. Codes expire after a short window — request a new one from the verification screen. If nothing arrives, contact the support desk below.',
  },
  {
    q: 'Can I change my department or role?',
    a: 'Roles are set by your campus administrator. Ask them, or contact the support desk and we will put you in touch.',
  },
]

export default function Help() {
  const { user } = useAuth()

  return (
    <div className="space-y-4 max-w-5xl">
      <header>
        <h1 className="text-headline-lg text-ink">Help &amp; Support</h1>
        <p className="text-body-md text-ink-muted mt-1">
          What Campus Netra does, and how to reach a human when you need one.
        </p>
      </header>

      {/* --- Contact first: someone opening this page usually has a problem --- */}
      <div className="grid md:grid-cols-2 gap-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Campus Netra support request')}`}
          className="widget p-widget flex items-start gap-4 hover:border-secondary transition-colors group"
        >
          <span className="w-12 h-12 rounded-xl bg-info-bg text-info-text grid place-items-center shrink-0">
            <Mail size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-label-caps uppercase text-ink-muted">Support desk</span>
            <span className="block text-body-lg font-semibold text-ink mt-1 break-all group-hover:text-secondary transition-colors">
              {SUPPORT_EMAIL}
            </span>
            <span className="block text-body-sm text-ink-faint mt-1">
              Best for account problems, bugs and anything with a screenshot.
            </span>
          </span>
        </a>

        <a
          href={`tel:${SUPPORT_PHONE}`}
          className="widget p-widget flex items-start gap-4 hover:border-secondary transition-colors group"
        >
          <span className="w-12 h-12 rounded-xl bg-success-bg text-success-text grid place-items-center shrink-0">
            <Phone size={22} />
          </span>
          <span className="min-w-0">
            <span className="block text-label-caps uppercase text-ink-muted">Contact us</span>
            <span className="block text-body-lg font-semibold text-ink mt-1 tabular group-hover:text-secondary transition-colors">
              {SUPPORT_PHONE}
            </span>
            <span className="block text-body-sm text-ink-faint mt-1">
              Best for anything urgent — safety hazards, outages, blocked access.
            </span>
          </span>
        </a>
      </div>

      {/* --- What the product is --- */}
      <Widget
        title="What is Campus Netra?"
        subtitle="One live picture of every facility, fault and found item on campus"
      >
        <div className="space-y-4">
          <p className="text-body-lg text-ink-muted leading-relaxed">
            Campus Netra is an AI-powered facility management platform for
            educational campuses. It replaces the usual scatter of registers,
            group chats and complaint boxes with a single system that follows a
            problem from the moment someone notices it to the moment it is signed
            off — and keeps a live, to-scale model of the campus that shows the
            state of every asset as it changes.
          </p>
          <p className="text-body-lg text-ink-muted leading-relaxed">
            The intelligence is in the routing, not the reporting. Anyone can
            photograph a broken fan; the work is deciding which department owns
            it, how urgent it is, whether it has already been reported, and what
            it will cost to keep fixing. Campus Netra does that part.
          </p>

          <div className="grid sm:grid-cols-2 gap-3 pt-2">
            {CAPABILITIES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border-subtle p-4 bg-surface-sunken/50">
                <div className="flex items-center gap-2.5 mb-1.5">
                  <span className="w-8 h-8 rounded-lg bg-secondary/10 text-secondary grid place-items-center shrink-0">
                    <Icon size={16} />
                  </span>
                  <h3 className="text-body-lg font-semibold text-ink">{title}</h3>
                </div>
                <p className="text-body-md text-ink-muted leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </Widget>

      {/* --- Getting started, tailored to who is reading --- */}
      <Widget title="Getting started" subtitle="The three things worth doing first">
        <ol className="space-y-3">
          {[
            {
              to: '/issues/new',
              icon: Send,
              title: 'Report an issue',
              body: 'Add a photo and a location. Everything after that is automatic.',
            },
            {
              to: '/twin',
              icon: MapPin,
              title: 'Open the digital twin',
              body: 'See your campus drawn to scale, with every asset colour-coded by state.',
            },
            {
              to: '/lost-found',
              icon: PackageSearch,
              title: 'Check Lost & Found',
              body: 'Report something you lost, or hand in something you found.',
            },
          ].map(({ to, icon: Icon, title, body }, i) => (
            <li key={to}>
              <Link
                to={to}
                className="flex items-start gap-3.5 rounded-xl border border-border-subtle p-3.5 hover:border-secondary hover:bg-surface-sunken/60 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-brand-soft text-brand grid place-items-center text-body-sm font-semibold shrink-0">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-lg font-medium text-ink">{title}</span>
                  <span className="block text-body-md text-ink-muted mt-0.5">{body}</span>
                </span>
                <Icon size={16} className="text-ink-faint shrink-0 mt-1" />
              </Link>
            </li>
          ))}
        </ol>
      </Widget>

      <Widget title="Frequently asked">
        <div className="divide-y divide-border-subtle -my-1">
          {FAQS.map((f) => <Faq key={f.q} {...f} />)}
        </div>
      </Widget>

      {/* --- Privacy note: people ask, and the honest answer is short --- */}
      <Widget title="Your data">
        <div className="flex items-start gap-3.5">
          <span className="w-10 h-10 rounded-xl bg-surface-sunken text-ink-faint grid place-items-center shrink-0">
            <ShieldCheck size={20} />
          </span>
          <div className="text-body-md text-ink-muted leading-relaxed space-y-2">
            <p>
              Photos you attach are stripped of location and camera metadata before
              they are stored. Your reports are visible to you and to the staff
              handling them.
            </p>
            <p>
              Contact the support desk to request a copy of your data or to have
              your account removed.
            </p>
          </div>
        </div>
      </Widget>

      {user && (
        <p className="text-body-sm text-ink-faint text-center pb-2">
          Signed in as {user.full_name} · When contacting support, mentioning your
          email address helps us find your account faster.
        </p>
      )}
    </div>
  )
}

function Faq({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="py-1">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-left py-3 group"
      >
        <MessageSquare size={16} className="text-ink-faint shrink-0" />
        <span className="flex-1 text-body-lg font-medium text-ink group-hover:text-secondary transition-colors">
          {q}
        </span>
        <ChevronDown
          size={16}
          className={`text-ink-faint shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <p className="text-body-md text-ink-muted leading-relaxed pl-[28px] pb-3 pr-6 animate-fade-in">
          {a}
        </p>
      )}
    </div>
  )
}
