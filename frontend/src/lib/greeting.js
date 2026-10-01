// `{name}` is replaced with the viewer's first name. Late-night logins get a
// nickname-style greeting instead of "Good night", which reads as a sign-off
// rather than a hello. Pools are large on purpose: the pick rotates daily, so
// a bigger pool means weeks before any line repeats.
const TITLES = {
  morning: [
    'Good morning, {name}',
    'Rise and shine, {name}',
    'Morning, {name}! Fresh start today',
    'Top of the morning, {name}',
    'Hello, early bird {name}',
    'Good to see you, {name}',
    'Morning, {name} — coffee ready?',
    'A bright good morning, {name}',
    'Hey {name}, new day, new wins',
    'Welcome back, {name}',
    'Up and running, {name}?',
    'Sunny side up, {name}',
  ],
  afternoon: [
    'Good afternoon, {name}',
    'Hey {name}, hope the day’s going well',
    'Afternoon, {name}!',
    'Halfway there, {name}',
    'Welcome back, {name}',
    'Hello again, {name}',
    'Keeping it going, {name}?',
    'Hey {name}, post-lunch check-in',
    'Good to have you back, {name}',
    'Afternoon hustle, {name}',
    'Hi {name}, how’s the day treating you?',
    'Powering through, {name}?',
  ],
  evening: [
    'Good evening, {name}',
    'Evening, {name}!',
    'Hey {name}, winding down?',
    'Welcome back, {name}',
    'Golden hour check-in, {name}',
    'Hello, {name} — almost done for the day?',
    'Evening rounds, {name}?',
    'Hi {name}, sunset shift',
    'Good to see you this evening, {name}',
    'Hey {name}, one last look?',
    'Twilight hello, {name}',
    'Evening, {name} — nice work today',
  ],
  night: [
    'Hey Night Owl, {name}',
    'Still up, {name}?',
    'Hello, midnight hero {name}',
    'Burning the midnight oil, {name}?',
    'Hey {name}, the moon shift is on',
    'Welcome back, night watcher {name}',
    'Hi {name}, fellow insomniac',
    'Hello, starlight crew {name}',
    'Late-night legend, {name}',
    'Hey {name}, the stars are out',
    'Night shift hero, {name}',
    'Moonlight check-in, {name}?',
    'Hey {name}, the campus sleeps — you don’t',
    'Hello, nocturnal {name}',
    'After-hours ace, {name}',
    'Hey {name}, night mode activated',
    'Owl o’clock, {name}',
    'Quiet hours, {name} — good to see you',
    'Hi {name}, keeper of the night',
    'Hey {name}, still going strong?',
    'Midnight crew, {name}',
    'Hello, {name} — the night is young',
    'Night rider {name}, welcome back',
    'Hey {name}, dreams can wait',
    'Starry-night hello, {name}',
    'The night belongs to you, {name}',
    'Hey {name}, the 2 AM club says hi',
    'Hello, moonlit {name}',
    'Wide awake, {name}?',
    'Night guardian {name}, welcome',
  ],
}

const REPORTER_QUOTES = {
  morning: [
    'A fresh campus day — small fixes reported early save bigger repairs later.',
    'Early reports get the fastest turnaround. Good time to look around.',
    'New day, clean slate — every issue logged today starts moving now.',
    'Spotted something on the way in? Report it before class starts.',
    'Mornings are when technicians plan their day — get yours on the list.',
    'A working campus starts with someone noticing. Today, that could be you.',
    'Fresh eyes catch the most — flickering lights, leaky taps, broken chairs.',
    'The best time to report a fault is right after you see it.',
  ],
  afternoon: [
    'Midday check-in: a two-minute report now beats a bigger problem tonight.',
    'Keep the campus running smooth — flag it the moment you spot it.',
    'Halfway through the day. Anything still broken? Now is the time to say so.',
    'Projector acting up after lunch? One photo and it’s on its way to a fix.',
    'Your reports help everyone in the room, not just you.',
    'Small issues grow quietly — catch them while they’re small.',
    'Track your complaints anytime — every status change shows up live.',
    'Afternoon slump? The campus team isn’t — report it and watch it move.',
  ],
  evening: [
    'Wrapping up the day — a quick report tonight gets a head start tomorrow.',
    'Evening rounds: the small stuff is easiest to fix before it piles up.',
    'Day’s winding down. Log it now so it’s not forgotten by morning.',
    'Anything you noticed today but didn’t report? There’s still time.',
    'A report filed tonight is first in line tomorrow morning.',
    'Check how your earlier reports are doing before you head out.',
    'Good evening to close the loop — verify anything marked resolved.',
    'Leaving campus? Lost something? Lost & Found is one tap away.',
  ],
  night: [
    'Working late? Anything urgent is still routed straight to the right team.',
    'Quiet hours on campus — a good time to catch up on what needs reporting.',
    'The campus is asleep, but your reports aren’t — they’re covered till morning.',
    'Critical issues never wait for sunrise — they’re flagged instantly.',
    'Night reports land at the top of tomorrow’s queue.',
    'Can’t sleep? Neither can the sensors — they’re watching the campus too.',
    'Anything sparking, leaking or smoking? Report it now — it escalates right away.',
    'Late thoughts count too — log it before you forget.',
  ],
}

const STAFF_QUOTES = {
  morning: [
    'Here’s where the campus stands as the day starts.',
    'Fresh queue, fresh coffee — let’s see what needs attention first.',
    'Overnight reports and sensor alerts are waiting below.',
    'Plan the day: open issues, active work orders, and anything breaching SLA.',
    'Start strong — clear the critical ones first.',
    'Morning briefing: everything that changed while you were away.',
  ],
  afternoon: [
    'Midday snapshot of every open issue, work order and asset.',
    'Halfway there — here’s what’s moving and what’s stuck.',
    'Check the SLA clock — afternoons are where deadlines sneak up.',
    'Progress check: what’s resolved, what’s still in the queue.',
    'Live picture of the campus, right now.',
    'Keep the momentum — a few closures before the day ends.',
  ],
  evening: [
    'End-of-day view: what got closed, and what carries into tomorrow.',
    'Evening wrap-up — a quick look before signing off.',
    'Anything critical still open? Hand it off before you leave.',
    'Today’s scorecard is below — nice work getting here.',
    'Last sweep of the day: alerts, sensors and queues.',
    'Wind-down check — make sure nothing urgent slips overnight.',
  ],
  night: [
    'Night shift view — anything critical is surfaced right here.',
    'The campus is quiet; the sensors aren’t. Here’s the live picture.',
    'Late-night check-in — alerts, sensors and queues, all in one place.',
    'After-hours mode: only the urgent stuff needs you now.',
    'IoT devices are still reporting — watch for overnight faults.',
    'Quiet campus, live dashboard. Everything that matters is below.',
  ],
}

function periodFor(hour) {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 21) return 'evening'
  return 'night'
}

// Small stable hash so two people on the same day don't always see the
// exact same line.
function hash(text = '') {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/**
 * Time-of-day greeting + weekday + a short rotating quote, all derived from
 * the viewer's own device clock (not the server's). Picks change every day
 * but stay put across refreshes within the same day.
 */
export function getGreeting({ name, staff = false, date = new Date() } = {}) {
  const period = periodFor(date.getHours())
  const dayName = date.toLocaleDateString(undefined, { weekday: 'long' })
  // Local calendar day number, so the line flips at the viewer's midnight.
  const dayNumber = Math.floor(date.getTime() / 86400000 - date.getTimezoneOffset() / 1440)
  const seed = dayNumber + hash(name)
  const titles = TITLES[period]
  const quotes = (staff ? STAFF_QUOTES : REPORTER_QUOTES)[period]
  return {
    period,
    title: titles[seed % titles.length].replace('{name}', name || 'there'),
    dayName,
    // A different stride than the title so the title/quote pairing also changes day to day.
    quote: quotes[(seed * 7 + 3) % quotes.length],
  }
}
