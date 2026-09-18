import { StaticPage } from '@/pages/StaticPage'

export default function About() {
  return (
    <StaticPage
      eyebrow="About"
      title="Built for the people who actually keep a campus running"
      subtitle="CampusNetra started from a simple observation: most campuses run facilities on paper forms, WhatsApp groups, and spreadsheets — not because nobody cares, but because nothing built for this job ever fit it."
    >
      <p>
        A university, college, or research campus is its own small city — buildings, labs,
        dorms, dining halls, and the people who report when something breaks, the technicians
        who fix it, and the administrators who have to answer for how long it took. Most of the
        software built for "facility management" is built for corporate office parks, not for
        the specific mess of a campus: mixed-use buildings, shared equipment, students who
        aren't employees, and maintenance requests that come in every possible way except the
        one the old system expects.
      </p>
      <p>
        CampusNetra is one platform for all of it: issue reporting with the actual room and
        photo attached, work orders that route to the right technician, inspections that
        actually get scheduled instead of forgotten, a live map and 3D view of the campus
        itself, and predictive maintenance that flags a problem before it becomes an outage.
        Underneath, it's built the way any of this should be — verified accounts, audited
        changes, and access control that matches who someone actually is on campus.
      </p>
      <p>
        This is a young, actively developed product. If something here is rough, that's
        because it's being built in the open, not because it's finished and this is as good as
        it gets — <a href="/support" className="text-secondary hover:underline">tell us</a>{' '}
        where it falls short.
      </p>
    </StaticPage>
  )
}
