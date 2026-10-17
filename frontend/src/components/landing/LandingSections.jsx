import {
  Activity, BarChart3, BellRing, Bot, Camera, ClipboardCheck, ClipboardList, Copy,
  Cpu, FileSearch, Gauge, HardHat, KeyRound, Layers, LineChart, Lock, Search,
  ShieldCheck, Sparkles, Timer, UserCog, Users, Wrench,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { ArrowRight, audiences } from './landingIcons'

// Every claim on this page describes something the product actually does.

function SectionHead({ eyebrow, title, accent, sub }) {
  return (
    <header className="lp-sec__head lp-reveal">
      <p className="lp-eyebrow">{eyebrow}</p>
      <h2 className="lp-sec__title">
        {title} {accent && <em>{accent}</em>}
      </h2>
      {sub && <p className="lp-sec__sub">{sub}</p>}
    </header>
  )
}

/* ------------------------------------------------------------- features */

const features = [
  { icon: Camera, title: 'Issue reporting', body: 'A photo and a room is all it takes. AI suggests the category, department and priority, and spots duplicates by text, place and time.' },
  { icon: ClipboardList, title: 'Work orders', body: 'Assign by skill and workload, track parts and approvals, and follow every job on a live board.' },
  { icon: Timer, title: 'SLA tracking', body: 'Response and resolution clocks per category, with early warnings and escalation before a target slips.' },
  { icon: Layers, title: 'Digital twin', body: 'Live floor plans where asset markers change colour the moment an issue moves. Replay any past moment.' },
  { icon: Search, title: 'Lost & Found', body: 'Five-signal matching across image, description, place, category and time. Only strong matches notify both people.' },
  { icon: ClipboardCheck, title: 'Inspections', body: 'Scheduled checklist rounds. A critical failure raises an issue on its own, no follow-up needed.' },
  { icon: Gauge, title: 'Predictive maintenance', body: 'A risk score from fault history, age, overdue service, MTBF and warranty flags assets before they break.' },
  { icon: Cpu, title: 'IoT health', body: 'ESP32 sensors report over MQTT. A fan or light that stops working opens an inspection automatically.' },
  { icon: BarChart3, title: 'Analytics & simulation', body: 'Hotspots, repeat failures, team performance and cost, plus surge modelling before term starts.' },
]

export function FeaturesSection() {
  return (
    <section id="features" className="lp-sec">
      <SectionHead
        eyebrow="Platform"
        title="Everything a campus needs"
        accent="to keep running"
        sub="One place for every fault, job, inspection and lost item, from the first photo to the final sign-off."
      />
      <ul className="lp-grid lp-grid--3">
        {features.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="lp-card lp-reveal" style={{ '--d': `${(i % 3) * 70}ms` }}>
            <span className="lp-card__icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            <h3 className="lp-card__title">{title}</h3>
            <p className="lp-card__body">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* --------------------------------------------------------- how it works */

const steps = [
  { title: 'Report', body: 'Anyone on campus snaps a photo, picks the room and describes the problem, on the web or the Android app.' },
  { title: 'Classify', body: 'AI suggests category and priority, routes it to the right department and flags likely duplicates.' },
  { title: 'Assign', body: 'A work order goes to the right technician by skill, location and current workload.' },
  { title: 'Resolve', body: 'The technician works the job on-site, logs parts and notes, and closes it with photo evidence.' },
  { title: 'Analyse', body: 'Every closed issue feeds SLA compliance, repeat-failure and cost reports.' },
  { title: 'Predict', body: 'Patterns in the history surface the assets most likely to fail next.' },
]

export function HowItWorksSection() {
  return (
    <section id="how" className="lp-sec">
      <SectionHead
        eyebrow="How it works"
        title="From a photo to"
        accent="fixed"
        sub="Six steps, one record. Everyone involved sees the same live status."
      />
      <ol className="lp-steps">
        {steps.map((step, i) => (
          <li key={step.title} className="lp-step lp-reveal" style={{ '--d': `${i * 60}ms` }}>
            <span className="lp-step__num">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="lp-step__title">{step.title}</h3>
            <p className="lp-step__body">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* --------------------------------------------------------- digital twin */

const states = [
  { key: 'fault', label: 'Fault', note: 'Reported, triaged or assigned' },
  { key: 'work', label: 'Under maintenance', note: 'Work in progress' },
  { key: 'warn', label: 'Warning', note: 'On hold' },
  { key: 'ok', label: 'Healthy', note: 'Resolved and verified' },
  { key: 'insp', label: 'Inspection due', note: 'Scheduled round pending' },
]

// A small, stylised floor: rooms as outlined cells, assets as live markers.
const rooms = [
  { x: 20, y: 20, w: 150, h: 110, name: 'Lab 101' },
  { x: 180, y: 20, w: 120, h: 110, name: 'Lab 102' },
  { x: 310, y: 20, w: 170, h: 110, name: 'Seminar Hall' },
  { x: 20, y: 170, w: 110, h: 110, name: 'Store' },
  { x: 140, y: 170, w: 180, h: 110, name: 'Library' },
  { x: 330, y: 170, w: 150, h: 110, name: 'Server Room' },
]
const markers = [
  { x: 70, y: 70, s: 'fault' }, { x: 120, y: 95, s: 'ok' }, { x: 230, y: 60, s: 'work' },
  { x: 380, y: 75, s: 'ok' }, { x: 440, y: 55, s: 'insp' }, { x: 70, y: 225, s: 'warn' },
  { x: 200, y: 215, s: 'ok' }, { x: 270, y: 245, s: 'ok' }, { x: 390, y: 220, s: 'fault' },
  { x: 440, y: 250, s: 'ok' },
]

export function TwinSection() {
  return (
    <section id="twin" className="lp-sec">
      <div className="lp-split">
        <div className="lp-reveal">
          <p className="lp-eyebrow">Digital twin</p>
          <h2 className="lp-sec__title">See the whole campus <em>live</em></h2>
          <p className="lp-sec__sub">
            Every building, floor and room, with each asset as a marker that updates the
            moment its issue moves. An asset only turns green again once no other open
            issue still points at it, and any past moment can be replayed exactly.
          </p>
          <ul className="lp-legend">
            {states.map((s) => (
              <li key={s.key}>
                <span className={`lp-dot lp-dot--${s.key}`} aria-hidden="true" />
                <strong>{s.label}</strong>
                <span>{s.note}</span>
              </li>
            ))}
          </ul>
        </div>

        <figure className="lp-twin lp-reveal" style={{ '--d': '120ms' }}>
          <svg viewBox="0 0 500 300" role="img" aria-label="Example floor plan with live asset markers">
            <defs>
              <pattern id="lp-twin-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="500" height="300" fill="url(#lp-twin-grid)" />
            {rooms.map((r) => (
              <g key={r.name}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} rx="6" className="lp-twin__room" />
                <text x={r.x + 10} y={r.y + 20} className="lp-twin__label">{r.name}</text>
              </g>
            ))}
            <path d="M10 150H490" stroke="rgba(255,255,255,0.08)" strokeDasharray="4 6" />
            {markers.map((m, i) => (
              <g key={i} className={`lp-twin__marker lp-twin__marker--${m.s}`}>
                <circle cx={m.x} cy={m.y} r="7" />
                {m.s !== 'ok' && <circle cx={m.x} cy={m.y} r="7" className="lp-twin__ping" style={{ animationDelay: `${i * 0.3}s` }} />}
              </g>
            ))}
          </svg>
          <figcaption>Second floor · live</figcaption>
        </figure>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- AI */

const ai = [
  { icon: Bot, title: 'Classification', body: 'Free text and a photo become a category, a department and a priority, with the reasoning kept for review.' },
  { icon: Copy, title: 'Duplicate detection', body: 'Text similarity, distance and a time window together. The same fault on the same asset weeks later counts as recurring, not a duplicate.' },
  { icon: FileSearch, title: 'Lost & Found matching', body: 'Found-before-lost and category mismatches are ruled out outright, so a wrong match never sends property to the wrong person.' },
]

export function AISection() {
  return (
    <section id="ai" className="lp-sec">
      <SectionHead
        eyebrow="AI"
        title="Smart where it helps,"
        accent="careful where it counts"
        sub="AI does the sorting so people can do the fixing. Without an AI key, a rule-based fallback keeps every feature working."
      />
      <ul className="lp-grid lp-grid--3">
        {ai.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="lp-card lp-card--tall lp-reveal" style={{ '--d': `${i * 80}ms` }}>
            <span className="lp-card__icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            <h3 className="lp-card__title">{title}</h3>
            <p className="lp-card__body">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ----------------------------------------------------------------- roles */

const roles = [
  { icon: Users, title: 'Students & teachers', points: ['Report a fault in seconds', 'Follow its status live', 'Post and claim lost items'] },
  { icon: HardHat, title: 'Technicians', points: ['A clear queue of jobs', 'On-site checklists and evidence', 'Parts requests with approval'] },
  { icon: Wrench, title: 'Facility managers', points: ['Assign and rebalance work', 'SLA board and inspections', 'Analytics and surge planning'] },
  { icon: UserCog, title: 'Administrators', points: ['Users, roles and permissions', 'SLA policies and categories', 'Full audit log'] },
]

export function RolesSection() {
  return (
    <section id="roles" className="lp-sec">
      <SectionHead
        eyebrow="Roles"
        title="One platform,"
        accent="every role"
        sub="Each person sees exactly what their job needs, nothing more."
      />
      <ul className="lp-grid lp-grid--4">
        {roles.map(({ icon: Icon, title, points }, i) => (
          <li key={title} className="lp-card lp-reveal" style={{ '--d': `${i * 70}ms` }}>
            <span className="lp-card__icon"><Icon size={20} strokeWidth={1.6} aria-hidden="true" /></span>
            <h3 className="lp-card__title">{title}</h3>
            <ul className="lp-ticks">
              {points.map((p) => <li key={p}>{p}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* -------------------------------------------------------------- security */

const security = [
  { icon: ShieldCheck, title: 'Permission on every route', body: 'Each API call checks the caller’s role and organisation.' },
  { icon: KeyRound, title: 'Single-use sessions', body: 'Refresh tokens work once; a password change signs out every device.' },
  { icon: Lock, title: 'Lockout and in-house captcha', body: 'Repeated wrong passwords lock the account. No third-party tracking.' },
  { icon: Activity, title: 'Full audit log', body: 'Admin changes are recorded with who, what and when.' },
  { icon: BellRing, title: 'Private uploads', body: 'Photos are served only to signed-in users; ID documents only to admins.' },
  { icon: LineChart, title: 'Encrypted in transit', body: 'HTTPS everywhere, with security headers on every page.' },
]

export function SecuritySection() {
  return (
    <section id="security" className="lp-sec">
      <SectionHead
        eyebrow="Security"
        title="Built to keep campus data"
        accent="where it belongs"
      />
      <ul className="lp-grid lp-grid--3 lp-grid--tight">
        {security.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="lp-row lp-reveal" style={{ '--d': `${(i % 3) * 70}ms` }}>
            <Icon size={18} strokeWidth={1.6} aria-hidden="true" />
            <div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/* ------------------------------------------------------------------- FAQ */

const faqs = [
  { q: 'Does it work on phones?', a: 'Yes. The website works in any phone browser, and there is an Android app that opens instantly and updates itself without a reinstall.' },
  { q: 'Do we need an AI subscription?', a: 'No. With an AI key the classification and matching use a live model; without one, a rule-based fallback keeps every feature working.' },
  { q: 'How do our buildings get into the digital twin?', a: 'Admins add campuses, buildings, floors and rooms from the admin panel and place each asset on its floor plan. Positions are stored relative to the plan, so they line up at any screen size.' },
  { q: 'Can we set our own SLA targets?', a: 'Yes. Response and resolution targets are set per category and priority under SLA policies, and the clocks follow them from the moment an issue is reported.' },
  { q: 'Are IoT sensors required?', a: 'No. Sensors are optional. When connected, readings from ESP32 devices update asset health and can open inspections on their own.' },
]

export function FAQSection() {
  return (
    <section id="faq" className="lp-sec lp-sec--narrow">
      <SectionHead eyebrow="FAQ" title="Questions," accent="answered" />
      <div className="lp-faq">
        {faqs.map((f, i) => (
          <details key={f.q} className="lp-faq__item lp-reveal" style={{ '--d': `${i * 50}ms` }}>
            <summary>
              {f.q}
              <span className="lp-faq__plus" aria-hidden="true" />
            </summary>
            <p>{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------- CTA */

export function CTASection() {
  return (
    <section className="lp-sec">
      <div className="lp-cta lp-reveal">
        <Sparkles className="lp-cta__spark" size={22} strokeWidth={1.5} aria-hidden="true" />
        <h2 className="lp-sec__title">Bring your campus <em>online</em></h2>
        <p className="lp-sec__sub">Create an account in a minute and report your first issue today.</p>
        <div className="lp-cta__actions">
          <Link className="lp-btn lp-btn--flame lp-hero__go" to="/register">
            Get started
            <span className="lp-hero__go-dot" aria-hidden="true"><ArrowRight /></span>
          </Link>
          <Link className="lp-btn lp-btn--ghost" to="/login">Sign in</Link>
        </div>
      </div>
    </section>
  )
}

/* ---------------------------------------------------------------- footer */

const footerCols = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'How it works', href: '#how' },
      { label: 'Digital twin', href: '#twin' },
      { label: 'Pricing', to: '/pricing' },
    ],
  },
  { title: 'Solutions', links: audiences.map((a) => ({ label: a.name, to: a.to })) },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Security', to: '/security' },
      { label: 'Support', to: '/support' },
    ],
  },
  {
    title: 'Account',
    links: [
      { label: 'Sign in', to: '/login' },
      { label: 'Create account', to: '/register' },
      { label: 'Report a lost item', to: '/lost-found/report' },
    ],
  },
]

export function LandingFooter({ onAnchor }) {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__top">
        <div className="lp-footer__brand">
          <Link className="lp-nav__brand" to="/" aria-label="CampusNetra home">
            <img className="lp-nav__logo" src="/logo-dark.svg" alt="" width="36" height="36" loading="lazy" />
            <span>CampusNetra</span>
          </Link>
          <p>Facility care for universities, colleges and research campuses.</p>
        </div>
        {footerCols.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <h3>{col.title}</h3>
            <ul>
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.to
                    ? <Link to={l.to}>{l.label}</Link>
                    : <a href={l.href} onClick={(e) => onAnchor(e, l.href)}>{l.label}</a>}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="lp-footer__bottom">
        <span>© {new Date().getFullYear()} CampusNetra</span>
        <span className="lp-footer__legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </span>
      </div>
      <span className="lp-footer__mark" aria-hidden="true">NETRA</span>
    </footer>
  )
}
