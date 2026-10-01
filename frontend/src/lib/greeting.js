// `{name}` is replaced with the viewer's first name. Late-night logins get a
// rotating nickname-style greeting instead of "Good night", which reads as a
// sign-off rather than a hello.
const TITLES = {
  morning: ['Good morning, {name}'],
  afternoon: ['Good afternoon, {name}'],
  evening: ['Good evening, {name}'],
  night: [
    'Hey Night Owl, {name}',
    'Still up, {name}?',
    'Hello, midnight hero {name}',
    'Burning the midnight oil, {name}?',
    'Hey {name}, the moon shift is on',
    'Welcome back, night watcher {name}',
    'Hi {name}, fellow insomniac',
  ],
}

const REPORTER_QUOTES = {
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
    'The campus is asleep, but your reports aren’t — they’re covered till morning.',
  ],
}

const STAFF_QUOTES = {
  morning: [
    'Here’s where the campus stands as the day starts.',
    'Fresh queue, fresh coffee — let’s see what needs attention first.',
  ],
  afternoon: [
    'Midday snapshot of every open issue, work order and asset.',
    'Halfway there — here’s what’s moving and what’s stuck.',
  ],
  evening: [
    'End-of-day view: what got closed, and what carries into tomorrow.',
    'Evening wrap-up — a quick look before signing off.',
  ],
  night: [
    'Night shift view — anything critical is surfaced right here.',
    'The campus is quiet; the sensors aren’t. Here’s the live picture.',
    'Late-night check-in — alerts, sensors and queues, all in one place.',
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
 * the viewer's own device clock (not the server's). Picks are deterministic
 * per day-of-year so they stay put across refreshes within the same day.
 */
export function getGreeting({ name, staff = false, date = new Date() } = {}) {
  const period = periodFor(date.getHours())
  const dayName = date.toLocaleDateString(undefined, { weekday: 'long' })
  const dayOfYear = Math.floor(
    (date - new Date(date.getFullYear(), 0, 0)) / 86400000,
  )
  const titles = TITLES[period]
  const quotes = (staff ? STAFF_QUOTES : REPORTER_QUOTES)[period]
  const title = titles[dayOfYear % titles.length]
  return {
    period,
    title: title.replace('{name}', name || 'there'),
    dayName,
    quote: quotes[dayOfYear % quotes.length],
  }
}
