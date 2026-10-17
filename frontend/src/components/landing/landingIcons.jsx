// Inline icons for the landing page, drawn to sit on one baseline.

export const Building = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-5h6v5M9 11h.01M15 11h.01" />
  </svg>
)

export const Chevron = (props) => (
  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true" {...props}>
    <path d="m3 4.5 3 3 3-3" />
  </svg>
)

export const ArrowRight = (props) => (
  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M4 10h12M11 5l5 5-5 5" />
  </svg>
)

export const Menu = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" {...props}>
    <path d="M4 8h16M4 16h16" />
  </svg>
)

export const Close = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" {...props}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

/* Who CampusNetra is built for -- each links to its solutions page. */
export const audiences = [
  {
    name: 'Universities',
    to: '/solutions/universities',
    mark: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 7.5 10 3l8 4.5-8 4.5-8-4.5ZM5 9.2v4.3c1.4 1.3 3 2 5 2s3.6-.7 5-2V9.2M18 7.5v5" />
      </svg>
    ),
  },
  {
    name: 'Colleges',
    to: '/solutions/colleges',
    mark: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M2.5 17h15M4 17V8M8 17V8M12 17V8M16 17V8M2 8l8-5 8 5H2Z" />
      </svg>
    ),
  },
  {
    name: 'Research labs',
    to: '/solutions/research',
    mark: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true">
        <path d="M7.5 2.5h5M8.5 2.5v5L3.8 15.3A1.5 1.5 0 0 0 5.1 17.5h9.8a1.5 1.5 0 0 0 1.3-2.2L11.5 7.5v-5M6 12h8" />
      </svg>
    ),
  },
  {
    name: 'Facility teams',
    to: '/solutions/managers',
    mark: (
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12.2 3.3a4 4 0 0 0-4.9 5.1L3 12.7a1.6 1.6 0 0 0 2.3 2.3l4.3-4.3a4 4 0 0 0 5.1-4.9l-2.4 2.4-2-.5-.5-2 2.4-2.4Z" />
      </svg>
    ),
  },
]
