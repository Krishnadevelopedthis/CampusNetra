/**
 * Background for the landing hero, drawn in code instead of a video: a campus
 * at dusk (clock tower, pitched-roof halls, colonnade) in front of a glowing
 * "netra" sun, standing on a digital-twin grid, with live sensor pins and a
 * slow scan beam. Only transform/opacity animate, and all of it stops under
 * prefers-reduced-motion (see styles/landing.css).
 *
 * The campus sits right of centre and the SVG is anchored to the bottom-right
 * when it crops, so on a narrow screen the buildings stay in view.
 */
const W = 1600
const H = 900
const HORIZON = 640
const CX = 1130 // centre line of the campus and the sun

// Mirror an x position (and optional width) across the campus centre line.
const mx = (x, w = 0) => 2 * CX - x - w

// Window grid with a fixed lit pattern, so the server and browser render
// the same markup.
function windowGrid(x, y, cols, rows, { w = 9, h = 13, gx = 22, gy = 30, seed = 1 } = {}) {
  const out = []
  let s = seed
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      s = (s * 9301 + 49297) % 233280
      const lit = s / 233280 < 0.42
      out.push({ x: x + c * gx, y: y + r * gy, w, h, lit, key: `${x}-${y}-${r}-${c}` })
    }
  }
  return out
}

const halls = [
  // [x, top, width] on the left; mirrored to the right
  { x: 880, top: 470, w: 132, roof: 54 },
  { x: 1012, top: 400, w: 72, roof: 0 },
]

const windows = [
  ...windowGrid(CX - 22, 432, 3, 4, { seed: 3 }),
  ...halls.flatMap((h, i) => [
    ...windowGrid(h.x + 14, h.top + 22, Math.floor((h.w - 18) / 22), Math.floor((HORIZON - h.top - 100) / 30), { seed: 11 + i }),
    ...windowGrid(mx(h.x, h.w) + 14, h.top + 22, Math.floor((h.w - 18) / 22), Math.floor((HORIZON - h.top - 100) / 30), { seed: 21 + i }),
  ]),
  ...windowGrid(1452, 392, 4, 7, { seed: 31, gx: 24 }),
  ...windowGrid(626, 520, 4, 3, { seed: 41 }),
]

const pins = [
  { x: CX, y: 300 },
  { x: 946, y: 452 },
  { x: 1314, y: 452 },
  { x: 1500, y: 374 },
]

const dust = [
  [420, 140], [610, 90], [780, 210], [980, 120], [1210, 70], [1390, 160], [1540, 110], [1290, 250], [860, 300],
]

export function CampusScene({ className }) {
  // Floor grid: rays from the vanishing point, rungs closer together near it.
  const rays = Array.from({ length: 25 }, (_, i) => -2400 + i * 200)
  const rungs = Array.from({ length: 9 }, (_, i) => HORIZON + 4 + 260 * ((i + 1) / 9) ** 2)

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMaxYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id="lp-sky" cx={CX} cy={HORIZON} r="900" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ff7a1f" stopOpacity="0.85" />
          <stop offset="0.28" stopColor="#ff3d00" stopOpacity="0.42" />
          <stop offset="0.62" stopColor="#5a1503" stopOpacity="0.25" />
          <stop offset="1" stopColor="#120400" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="lp-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff1d6" />
          <stop offset="0.35" stopColor="#ffb257" />
          <stop offset="0.75" stopColor="#ff5a0f" />
          <stop offset="1" stopColor="#ff3d00" stopOpacity="0.9" />
        </radialGradient>
        <linearGradient id="lp-building" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a0c03" />
          <stop offset="1" stopColor="#120400" />
        </linearGradient>
        <linearGradient id="lp-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff6a1a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ff6a1a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lp-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffb257" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ffb257" stopOpacity="0.16" />
          <stop offset="1" stopColor="#ffb257" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="lp-haze" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff5a0f" stopOpacity="0" />
          <stop offset="0.5" stopColor="#ff5a0f" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff5a0f" stopOpacity="0" />
        </linearGradient>
        <clipPath id="lp-above">
          <rect x="0" y="0" width={W} height={HORIZON} />
        </clipPath>
        <clipPath id="lp-below">
          <rect x="0" y={HORIZON} width={W} height={H - HORIZON} />
        </clipPath>
      </defs>

      {/* Sky glow and drifting dust */}
      <rect width={W} height={H} fill="url(#lp-sky)" />
      {dust.map(([x, y]) => <circle key={`${x}-${y}`} className="lp-scene__dust" cx={x} cy={y} r="1.6" fill="#ffd9a8" />)}

      {/* The netra: a rising sun drawn as an iris, with slow-turning rings */}
      <g clipPath="url(#lp-above)">
        <g className="lp-scene__ring">
          <circle cx={CX} cy={HORIZON} r="430" fill="none" stroke="#ff8a1f" strokeOpacity="0.22" strokeWidth="1.5" strokeDasharray="2 14" />
        </g>
        <g className="lp-scene__ring lp-scene__ring--rev">
          <circle cx={CX} cy={HORIZON} r="362" fill="none" stroke="#ffb257" strokeOpacity="0.28" strokeWidth="1" strokeDasharray="40 10 4 10" />
        </g>
        <circle className="lp-scene__sun" cx={CX} cy={HORIZON} r="300" fill="url(#lp-sun)" />
        <circle cx={CX} cy={HORIZON} r="300" fill="none" stroke="#fff1d6" strokeOpacity="0.5" strokeWidth="2" />
        <circle cx={CX} cy={HORIZON} r="190" fill="none" stroke="#7a1d02" strokeOpacity="0.3" strokeWidth="24" />
      </g>

      {/* Distant blocks */}
      <g fill="#1d0702" opacity="0.9">
        <rect x="560" y="560" width="70" height={HORIZON - 560} />
        <rect x="610" y="506" width="110" height={HORIZON - 506} />
        <rect x="740" y="548" width="90" height={HORIZON - 548} />
        <rect x="1390" y="520" width="60" height={HORIZON - 520} />
        <rect x="1560" y="540" width="60" height={HORIZON - 540} />
      </g>

      {/* Campus: halls mirrored about the clock tower */}
      <g fill="url(#lp-building)">
        {halls.flatMap((h) => {
          const parts = []
          for (const x of [h.x, mx(h.x, h.w)]) {
            parts.push(<rect key={`b-${x}`} x={x} y={h.top} width={h.w} height={HORIZON - h.top} />)
            if (h.roof) {
              parts.push(<path key={`r-${x}`} d={`M${x - 6} ${h.top} L${x + h.w / 2} ${h.top - h.roof} L${x + h.w + 6} ${h.top} Z`} />)
            }
          }
          return parts
        })}
        {/* Clock tower */}
        <rect x={CX - 40} y="318" width="80" height={HORIZON - 318} />
        <path d={`M${CX - 46} 320 L${CX} 248 L${CX + 46} 320 Z`} />
        <rect x={CX - 2.5} y="212" width="5" height="40" />
        {/* Modern block on the right */}
        <rect x="1436" y="372" width="112" height={HORIZON - 372} />
        <rect x="1430" y="364" width="124" height="10" />
        {/* Colonnade in front */}
        <path d={`M${CX - 168} 580 L${CX} 548 L${CX + 168} 580 Z`} />
        <rect x={CX - 160} y="580" width="320" height="10" />
        <rect x={CX - 176} y={HORIZON - 8} width="352" height="8" />
      </g>

      {/* Rim light on roof edges, facing the sun */}
      <g fill="none" stroke="#ff8a1f" strokeOpacity="0.75" strokeWidth="2" strokeLinejoin="round">
        {halls.filter((h) => h.roof).flatMap((h) => [h.x, mx(h.x, h.w)].map((x) => (
          <path key={`rim-${x}`} d={`M${x - 6} ${h.top} L${x + h.w / 2} ${h.top - h.roof} L${x + h.w + 6} ${h.top}`} />
        )))}
        <path d={`M${CX - 46} 320 L${CX} 248 L${CX + 46} 320`} />
        <path d={`M${CX - 168} 580 L${CX} 548 L${CX + 168} 580`} />
        <path d="M1430 364 H1554" />
        <path d={`M1012 400 H1084 M${mx(1012, 72)} 400 H${mx(1012, 72) + 72}`} />
      </g>

      {/* Clock */}
      <circle cx={CX} cy="356" r="22" fill="#ffe2b8" />
      <circle cx={CX} cy="356" r="22" fill="none" stroke="#ff8a1f" strokeWidth="3" />
      <path d={`M${CX} 356 V342 M${CX} 356 L${CX + 9} 361`} stroke="#3a1004" strokeWidth="3" strokeLinecap="round" />

      {/* Colonnade columns */}
      <g fill="#ff8a1f" opacity="0.32">
        {Array.from({ length: 9 }, (_, i) => (
          <rect key={i} x={CX - 148 + i * 37 - 4} y="594" width="8" height={HORIZON - 8 - 594} />
        ))}
      </g>

      {/* Windows: warm, some flickering */}
      <g>
        {windows.map((w) => (
          <rect
            key={w.key}
            className={w.lit ? 'lp-scene__win' : undefined}
            x={w.x}
            y={w.y}
            width={w.w}
            height={w.h}
            rx="1.5"
            fill={w.lit ? '#ffc078' : '#3a1206'}
          />
        ))}
      </g>

      {/* Digital-twin floor */}
      <g clipPath="url(#lp-below)" stroke="url(#lp-floor)" strokeWidth="1">
        {rays.map((dx) => <line key={dx} x1={CX} y1={HORIZON} x2={CX + dx} y2={H} />)}
        {rungs.map((y) => <line key={y} x1="0" y1={y} x2={W} y2={y} />)}
      </g>
      <g clipPath="url(#lp-below)" fill="none" stroke="#ffb257" strokeWidth="2">
        <ellipse className="lp-scene__pulse" cx={CX} cy={HORIZON + 6} rx="760" ry="150" />
        <ellipse className="lp-scene__pulse" cx={CX} cy={HORIZON + 6} rx="760" ry="150" />
      </g>
      <rect x="0" y={HORIZON - 30} width={W} height="60" fill="url(#lp-haze)" />
      <rect x="380" y={HORIZON - 1} width={W - 380} height="2" fill="#ffb257" opacity="0.55" />

      {/* Live sensor pins */}
      {pins.map((p) => (
        <g key={`${p.x}-${p.y}`} className="lp-scene__pin">
          <circle cx={p.x} cy={p.y} r="4" fill="#fff1d6" />
          <circle cx={p.x} cy={p.y} r="4" fill="none" stroke="#ffd08a" strokeWidth="1.5" />
        </g>
      ))}

      {/* Scan beam sweeping the campus */}
      <rect className="lp-scene__beam" x="380" y="160" width="220" height={HORIZON - 160} fill="url(#lp-beam)" />
    </svg>
  )
}
