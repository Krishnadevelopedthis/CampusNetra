const PERIOD_LABEL = {
  morning: 'Good morning',
  afternoon: 'Good afternoon',
  evening: 'Good evening',
  night: 'Good night',
}

const QUOTES = {
  morning: [
    'A fresh campus day — small fixes reported early save bigger repairs later.',
    'Early reports get the fastest turnaround. Good time to look around.',
    'New day, clean slate — every issue logged today starts moving now.',
  ],
  afternoon: [
    'Midday check-in: a two-minute report now beats a bigger problem tonight.',
    'Keep the campus running smooth — flag it the moment you spot it.',
    'Halfway through the day. Anything still broken? Now is the time to say so.',
  ],
  evening: [
    'Wrapping up the day — a quick report tonight gets a head start tomorrow.',
    'Evening rounds: the small stuff is easiest to fix before it piles up.',
    'Day’s winding down. Log it now so it’s not forgotten by morning.',
  ],
  night: [
    'Working late? Anything urgent is still routed straight to the right team.',
    'Quiet hours on campus — a good time to catch up on what needs reporting.',
    'Burning the midnight oil. The campus team’s got your reports covered till morning.',
  ],
}

function periodFor(hour) {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

/**
 * Time-of-day greeting + weekday + a short rotating quote, all derived from
 * the viewer's own device clock (not the server's) — so it always matches
 * whatever's actually on their screen, regardless of where the backend runs.
 * The quote is picked deterministically from the day-of-year so it stays put
 * across re-renders/refreshes within the same day instead of reshuffling
 * every time the dashboard reloads.
 */
export function getGreeting(date = new Date()) {
  const period = periodFor(date.getHours())
  const dayName = date.toLocaleDateString(undefined, { weekday: 'long' })
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000,
  )
  const pool = QUOTES[period]
  return {
    label: PERIOD_LABEL[period],
    dayName,
    quote: pool[dayOfYear % pool.length],
  }
}
