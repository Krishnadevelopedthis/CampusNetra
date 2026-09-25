import clsx from 'clsx'

/**
 * Three-ring loading animation (Uiverse.io "Colorful Radar" by Nawsome,
 * unmodified colours/motion) — see styles/index.css for the .ringspin*
 * rules and keyframes this markup drives. The app's full-page loading
 * animation, replacing the earlier eye-themed BrandLoader everywhere it
 * was used (App.jsx's RequireAuth/PublicOnly guards).
 *
 * Sized with clamp() rather than a fixed em value, so it scales down on a
 * small screen instead of staying one physical size regardless of viewport
 * — pass `size` only to override that responsive default with a fixed one.
 */
export function RingLoader({ label, size, className }) {
  return (
    <div
      className={clsx('flex flex-col items-center justify-center gap-3', className)}
      role="status" aria-live="polite"
    >
      <svg
        className="ringspin" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg"
        style={{ ...(size ? { width: size, height: size } : null), outline: '3px solid red', background: 'lime' }}
        aria-hidden="true"
      >
        <circle
          className="ringspin__ring2" cx="64" cy="64" r="52.5" fill="none"
          stroke="black" strokeWidth="12" transform="rotate(-90,64,64)"
          strokeLinecap="round" strokeDasharray="329.9 329.9" strokeDashoffset="-329.3"
        />
        <circle
          className="ringspin__ring2" cx="64" cy="64" r="52.5" fill="none"
          stroke="hsl(13,90%,55%)" strokeWidth="12" transform="rotate(-90,64,64)"
          strokeLinecap="round" strokeDasharray="329.9 329.9" strokeDashoffset="-329.3"
        />
        <circle
          className="ringspin__ring4" cx="64" cy="64" r="37.5" fill="none"
          stroke="hsl(33,90%,55%)" strokeWidth="9" transform="rotate(-90,64,64)"
          strokeLinecap="round" strokeDasharray="254.5 254.5" strokeDashoffset="-254"
        />
        <circle
          className="ringspin__ring6" cx="64" cy="64" r="22.5" fill="none"
          stroke="hsl(53,90%,55%)" strokeWidth="9" transform="rotate(-90,64,64)"
          strokeLinecap="round" strokeDasharray="204.2 204.2" strokeDashoffset="-203.9"
        />
      </svg>

      {label && <span className="text-body-md text-ink-faint">{label}</span>}
    </div>
  )
}
