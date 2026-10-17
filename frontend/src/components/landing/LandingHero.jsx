import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { CampusScene } from './CampusScene'
import { ArrowRight, Building, audiences } from './landingIcons'

// What the platform does, stated plainly -- not invented customer numbers.
const stats = [
  { value: '24/7', label: 'Live digital twin & IoT sensors' },
  { value: 'AI', label: 'Triage, routing & lost-item matching' },
]

// The roles that share one live picture of the campus.
const roles = [
  { initial: 'S', a: '#ff7a3d', b: '#ffb27a' },
  { initial: 'T', a: '#6f4bd8', b: '#a98cff' },
  { initial: 'M', a: '#1f9ea8', b: '#63d6df' },
  { initial: 'A', a: '#d8434b', b: '#ff8a8f' },
]

const bars = [34, 52, 44, 70, 88]

export function LandingHero() {
  const [ready, setReady] = useState(false)

  // Fade the scene in once the page has painted, like a video arriving.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setReady(true))
    return () => window.cancelAnimationFrame(id)
  }, [])

  return (
    <section className="lp-hero">
      <div className="lp-hero__media">
        <CampusScene className={`lp-scene ${ready ? 'is-ready' : ''}`} />
        <div className="lp-hero__scrim" aria-hidden="true" />
        <div className="lp-hero__rules" aria-hidden="true">
          <span /><span /><span />
        </div>
      </div>

      <div className="lp-hero__inner">
        <div className="lp-hero__lead">
          <p className="lp-hero__note">
            <Building className="lp-hero__note-icon" />
            <span>Facility care for universities,<br />colleges and research campuses</span>
          </p>

          <h1 className="lp-hero__title">
            Campus Care<br />
            Seen by AI<br />
            Fixed by <em>People</em>
          </h1>

          <p className="lp-hero__sub">
            Snap a photo of a fault. CampusNetra routes it to the right team,
            shows it live on the campus digital twin, and keeps the SLA clock
            running until it is fixed.
          </p>

          <div className="lp-hero__cta">
            <Link className="lp-btn lp-btn--flame lp-hero__go" to="/register">
              Get started
              <span className="lp-hero__go-dot" aria-hidden="true"><ArrowRight /></span>
            </Link>

            <div className="lp-hero__proof">
              <div className="lp-hero__faces" aria-hidden="true">
                {roles.map((r) => (
                  <i key={r.initial} style={{ '--a': r.a, '--b': r.b }}>{r.initial}</i>
                ))}
              </div>
              <span className="lp-hero__proof-text">
                <strong>One live campus</strong>
                Students, teachers, technicians, admins
              </span>
            </div>
          </div>

          <ul className="lp-hero__stats">
            {stats.map((stat) => (
              <li key={stat.label} className="lp-stat">
                <span className="lp-stat__mark" aria-hidden="true">*</span>
                <span className="lp-stat__value">{stat.value}</span>
                <span className="lp-stat__label">{stat.label}</span>
                <span className="lp-stat__rule" aria-hidden="true" />
              </li>
            ))}
          </ul>
        </div>

        <aside className="lp-hero__ghost" aria-hidden="true">
          <div className="lp-ghost__row">
            <div className="lp-ghost__bars">
              {bars.map((h, i) => (
                <span key={i} style={{ height: `${h}%` }} />
              ))}
            </div>
            <p className="lp-ghost__kpi"><strong>Risk</strong>Predictive<br />Maintenance</p>
          </div>
          <h2 className="lp-ghost__title">Catch Failures Early</h2>
          <p className="lp-ghost__copy">
            Fault history, age, service and warranty roll into one risk
            score, so assets get attention before they break.
          </p>
        </aside>
      </div>

      <div className="lp-hero__foot">
        <span className="lp-hero__watermark" aria-hidden="true">NETRA</span>
        <div className="lp-hero__audiences">
          <span className="lp-hero__audiences-label">Built for</span>
          <ul>
            {audiences.map((item) => (
              <li key={item.to}>
                <Link to={item.to}>
                  {item.mark}
                  <span>{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="lp-hero__legal">
            <span>© {new Date().getFullYear()} CampusNetra</span>
            <Link to="/about">About</Link>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </p>
        </div>
      </div>
    </section>
  )
}
