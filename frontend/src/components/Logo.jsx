import clsx from 'clsx'
import { useEffect, useState } from 'react'

/**
 * Campus Netra mark with theme-aware dynamic logo support.
 * Switches between dark and light theme logos based on system preference or user theme setting.
 * Logo container background adapts to the current theme for seamless integration.
 */
export function LogoMark({ size = 40, className, isDynamic = true }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    if (!isDynamic) return

    // Get initial theme
    const initialTheme = document.documentElement.dataset.theme || 'light'
    setTheme(initialTheme)

    // Watch for theme changes
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.dataset.theme || 'light'
      setTheme(currentTheme)
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })

    return () => observer.disconnect()
  }, [isDynamic])

  if (isDynamic) {
    const logoSrc = theme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'

    // Theme-aware background: light theme gets white bg, dark theme gets dark bg
    const bgClass = theme === 'dark' ? 'bg-surface-base' : 'bg-white'

    return (
      <div
        className={clsx('shrink-0 rounded-lg overflow-hidden', bgClass, className)}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <img
          src={logoSrc}
          alt="Campus Netra"
          className="w-full h-full object-contain"
          loading="lazy"
        />
      </div>
    )
  }

  // Fallback to inline SVG if dynamic is disabled
  return (
    <div
      className={clsx(
        'shrink-0 rounded-lg bg-primary grid place-items-center overflow-hidden',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 40 40" width={size * 0.6} height={size * 0.6} fill="none">
        {/* Stylised eye — "netra" — over a building silhouette. */}
        <path d="M4 22c5-7 11-10 16-10s11 3 16 10c-5 7-11 10-16 10S9 29 4 22Z"
              stroke="white" strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="20" cy="22" r="4.5" fill="white" />
        <path d="M12 12V6h16v6" stroke="white" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function Logo({ subtitle = 'Campus Facilities', size = 40, className, isDynamic = true }) {
  return (
    <div className={clsx('flex items-center gap-3 min-w-0', className)}>
      <LogoMark size={size} isDynamic={isDynamic} />
      <div className="min-w-0">
        <p className="text-headline-md text-brand leading-tight truncate">Campus Netra</p>
        {subtitle && <p className="text-body-sm text-ink-faint truncate">{subtitle}</p>}
      </div>
    </div>
  )
}
