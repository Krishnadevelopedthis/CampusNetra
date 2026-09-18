/**
 * Campus Netra design system.
 * Values are a direct translation of the CampusCare AI Kinetic System spec:
 * Corporate/Modern, operational high-density, "Precision Intelligence".
 *
 * The Aceternity Proactiv palette is available as CSS custom properties
 * (--c-obsidian-*, --c-indigo-*, --c-violet-*, --c-cyan-*, --c-emerald-*)
 * defined in src/styles/theme.css for opt-in use. CampusNetra components use
 * the CampusNetra tokens by default.
 */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Every value below points at a CSS variable defined in
        // src/styles/theme.css. Swapping themes is therefore a value swap, and
        // no component ever needs to know which theme is active. The
        // <alpha-value> placeholder keeps modifiers like bg-surface/95 working.
        primary: {
          DEFAULT: 'rgb(var(--c-primary) / <alpha-value>)',
          50: 'rgb(var(--c-primary-50) / <alpha-value>)',
          100: 'rgb(var(--c-primary-100) / <alpha-value>)',
          200: 'rgb(var(--c-primary-200) / <alpha-value>)',
          300: 'rgb(var(--c-primary-300) / <alpha-value>)',
          400: 'rgb(var(--c-primary-400) / <alpha-value>)',
          500: 'rgb(var(--c-primary-500) / <alpha-value>)',
          600: 'rgb(var(--c-primary-600) / <alpha-value>)',
          700: 'rgb(var(--c-primary-700) / <alpha-value>)',
          800: 'rgb(var(--c-primary-800) / <alpha-value>)',
          900: 'rgb(var(--c-primary-900) / <alpha-value>)',
          950: 'rgb(var(--c-primary-950) / <alpha-value>)',
        },
        // Brand as a text/label colour, as opposed to `primary` as a fill.
        // Foregrounds for filled accent surfaces: text-on-primary, etc.
        on: {
          primary: 'rgb(var(--c-on-primary) / <alpha-value>)',
          secondary: 'rgb(var(--c-on-secondary) / <alpha-value>)',
          'secondary-600': 'rgb(var(--c-on-secondary-600) / <alpha-value>)',
          brand: 'rgb(var(--c-on-brand) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--c-brand) / <alpha-value>)',
          soft: 'rgb(var(--c-brand-soft) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--c-secondary) / <alpha-value>)',
          50: 'rgb(var(--c-secondary-50) / <alpha-value>)',
          100: 'rgb(var(--c-secondary-100) / <alpha-value>)',
          200: 'rgb(var(--c-secondary-200) / <alpha-value>)',
          300: 'rgb(var(--c-secondary-300) / <alpha-value>)',
          400: 'rgb(var(--c-secondary-400) / <alpha-value>)',
          500: 'rgb(var(--c-secondary-500) / <alpha-value>)',
          600: 'rgb(var(--c-secondary-600) / <alpha-value>)',
          700: 'rgb(var(--c-secondary-700) / <alpha-value>)',
          800: 'rgb(var(--c-secondary-800) / <alpha-value>)',
          900: 'rgb(var(--c-secondary-900) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--c-success) / <alpha-value>)',
          bg: 'rgb(var(--c-success-bg) / <alpha-value>)',
          border: 'rgb(var(--c-success-border) / <alpha-value>)',
          text: 'rgb(var(--c-success-text) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--c-warning) / <alpha-value>)',
          bg: 'rgb(var(--c-warning-bg) / <alpha-value>)',
          border: 'rgb(var(--c-warning-border) / <alpha-value>)',
          text: 'rgb(var(--c-warning-text) / <alpha-value>)',
        },
        danger: {
          DEFAULT: 'rgb(var(--c-danger) / <alpha-value>)',
          bg: 'rgb(var(--c-danger-bg) / <alpha-value>)',
          border: 'rgb(var(--c-danger-border) / <alpha-value>)',
          text: 'rgb(var(--c-danger-text) / <alpha-value>)',
          strong: 'rgb(var(--c-danger-strong) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--c-info) / <alpha-value>)',
          bg: 'rgb(var(--c-info-bg) / <alpha-value>)',
          border: 'rgb(var(--c-info-border) / <alpha-value>)',
          text: 'rgb(var(--c-info-text) / <alpha-value>)',
        },

        // --- Digital Twin asset states (must match backend STATE_COLOURS) ---
        twin: {
          healthy: 'rgb(var(--c-twin-healthy) / <alpha-value>)',
          warning: 'rgb(var(--c-twin-warning) / <alpha-value>)',
          fault: 'rgb(var(--c-twin-fault) / <alpha-value>)',
          maintenance: 'rgb(var(--c-twin-maintenance) / <alpha-value>)',
          inspection: 'rgb(var(--c-twin-inspection) / <alpha-value>)',
          decommissioned: 'rgb(var(--c-twin-decommissioned) / <alpha-value>)',
        },

        // --- Aceternity Proactiv Brand Palette ---
        // Available via CSS custom properties in theme.css for opt-in use.
        obsidian: {
          950: 'rgb(var(--c-obsidian-950) / <alpha-value>)',
          900: 'rgb(var(--c-obsidian-900) / <alpha-value>)',
          800: 'rgb(var(--c-obsidian-800) / <alpha-value>)',
          700: 'rgb(var(--c-obsidian-700) / <alpha-value>)',
        },
        indigo: {
          400: 'rgb(var(--c-indigo-400) / <alpha-value>)',
          500: 'rgb(var(--c-indigo-500) / <alpha-value>)',
          600: 'rgb(var(--c-indigo-600) / <alpha-value>)',
          700: 'rgb(var(--c-indigo-700) / <alpha-value>)',
        },
        violet: {
          400: 'rgb(var(--c-violet-400) / <alpha-value>)',
          500: 'rgb(var(--c-violet-500) / <alpha-value>)',
          600: 'rgb(var(--c-violet-600) / <alpha-value>)',
        },
        cyan: {
          400: 'rgb(var(--c-cyan-400) / <alpha-value>)',
          500: 'rgb(var(--c-cyan-500) / <alpha-value>)',
          600: 'rgb(var(--c-cyan-600) / <alpha-value>)',
        },
        emerald: {
          400: 'rgb(var(--c-emerald-400) / <alpha-value>)',
          500: 'rgb(var(--c-emerald-500) / <alpha-value>)',
          600: 'rgb(var(--c-emerald-600) / <alpha-value>)',
        },

        // --- Tiered neutral surfaces: "desk" vs "papers" ---
        surface: {
          base: 'rgb(var(--c-surface-base) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-surface) / <alpha-value>)',
          sunken: 'rgb(var(--c-surface-sunken) / <alpha-value>)',
          raised: 'rgb(var(--c-surface-raised) / <alpha-value>)',
          inverse: 'rgb(var(--c-surface-inverse) / <alpha-value>)',
        },
        border: {
          subtle: 'rgb(var(--c-border-subtle) / <alpha-value>)',
          DEFAULT: 'rgb(var(--c-border) / <alpha-value>)',
          strong: 'rgb(var(--c-border-strong) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--c-ink) / <alpha-value>)',
          muted: 'rgb(var(--c-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--c-ink-faint) / <alpha-value>)',
          inverse: 'rgb(var(--c-ink-inverse) / <alpha-value>)',
        },
        ai: {
          bg: 'rgb(var(--c-ai-bg) / <alpha-value>)',
          border: 'rgb(var(--c-ai-border) / <alpha-value>)',
        },
        neutral: {
          bg: 'rgb(var(--c-neutral-bg) / <alpha-value>)',
          text: 'rgb(var(--c-neutral-text) / <alpha-value>)',
        },
      },

      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },

      fontSize: {
        // Named roles from the spec, so components never hand-pick sizes.
        'display-metrics': ['clamp(26px, 7vw, 36px)', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg':     ['clamp(22px, 5vw, 28px)', { lineHeight: '1.28', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md':     ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg':         ['16px', { lineHeight: '24px' }],
        'body-md':         ['14px', { lineHeight: '20px' }],
        'body-sm':         ['12px', { lineHeight: '16px' }],
        'label-caps':      ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '700' }],
        // Form labels specifically. 11px is below the floor for text someone
        // has to read to know what to type; the caps role stays 11px for the
        // decorative metric captions it was designed for.
        'label-form':      ['12px', { lineHeight: '16px', letterSpacing: '0.04em', fontWeight: '600' }],
        'mono-data':       ['13px', { lineHeight: '18px', fontWeight: '500' }],
      },

      borderRadius: {
        // Sharp corners for all elements
        DEFAULT: '0',        // widgets, inputs, tables
        sm: '0',
        md: '0',
        lg: '0',             // buttons
        xl: '0',             // AI bubbles, status pills
        '2xl': '0',          // page-level panels and modals
      },

      spacing: {
        gutter: '24px',
        'gutter-sm': '16px',
        margin: '32px',
        widget: '16px',
        compact: '8px',
        sidebar: '280px',
        rail: '64px',
      },

      boxShadow: {
        // Level 2 — hover/active. Level 1 uses borders, never shadow.
        level2: 'var(--shadow-level2)',
        // Level 3 — overlays, drawers, AI panels.
        level3: 'var(--shadow-level3)',
        popover: 'var(--shadow-popover)',
        // Landing-page glow shadows — theme-aware (references the same
        // variables as everything else, so it's orange in light mode and
        // lime in dark mode automatically, same as every other accent use).
        'glow-secondary': '0 0 40px -5px rgb(var(--c-secondary-500) / 0.3), 0 0 80px -10px rgb(var(--c-secondary-500) / 0.15)',
        'glow-primary': '0 0 40px -5px rgb(var(--c-primary) / 0.3), 0 0 80px -10px rgb(var(--c-primary) / 0.15)',
        'glow-cyan': '0 0 40px -5px rgb(6 182 212 / 0.3), 0 0 80px -10px rgb(6 182 212 / 0.15)',
        'glow-emerald': '0 0 40px -5px rgb(16 185 129 / 0.3), 0 0 80px -10px rgb(16 185 129 / 0.15)',
        'glow-amber': '0 0 40px -5px rgb(245 158 11 / 0.3), 0 0 80px -10px rgb(245 158 11 / 0.15)',
      },

      backgroundImage: {
        // Aceternity spotlight gradients
        'spotlight-primary': 'var(--spotlight-primary)',
        'spotlight-secondary': 'var(--spotlight-secondary)',
        'spotlight-cyan': 'var(--spotlight-cyan)',
        'spotlight-emerald': 'var(--spotlight-emerald)',
        // Grid beam pattern
        'grid-beam': 'var(--grid-pattern)',
        // Shimmer gradients
        'shimmer-stops': 'var(--shimmer-stops)',
        'shimmer-conic': 'var(--shimmer-gradient)',
        // Gradient text
        'gradient-text-primary': 'var(--gradient-text-primary)',
        'gradient-text-electric': 'var(--gradient-text-electric)',
        'gradient-text-cyber': 'var(--gradient-text-cyber)',
        'gradient-text-emerald': 'var(--gradient-text-emerald)',
      },

      backgroundSize: {
        'grid-beam': '48px 48px',
        'shimmer': '200% 100%',
      },

      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        // Used on twin markers that just changed state.
        'pulse-ring': {
          '0%':   { transform: 'scale(0.9)', opacity: 0.7 },
          '70%':  { transform: 'scale(1.9)', opacity: 0 },
          '100%': { transform: 'scale(0.9)', opacity: 0 },
        },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-reverse': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'float-reverse': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(6px)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.9' },
          '50%': { opacity: '0.4' },
        },
        // Aceternity specific animations
        'rotate-conic': {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'pulse-ring-slow': {
          '0%': { transform: 'scale(0.95)', opacity: 0.6 },
          '50%': { transform: 'scale(1.1)', opacity: 0.2 },
          '100%': { transform: 'scale(0.95)', opacity: 0.6 },
        },
        'shimmer-move': {
          '0%': { backgroundPosition: '0% 50%' },
          '100%': { backgroundPosition: '200% 50%' },
        },
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.24,0,0.38,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
        marquee: 'marquee 30s linear infinite',
        'marquee-reverse': 'marquee-reverse 30s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'float-reverse': 'float-reverse 5s ease-in-out infinite',
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        // Aceternity animations
        'rotate-conic': 'rotate-conic 3s linear infinite',
        'pulse-ring-slow': 'pulse-ring-slow 3s ease-in-out infinite',
        'shimmer-move': 'shimmer-move 3s linear infinite',
      },
    },
  },
  plugins: [
    // Register custom utilities from theme.css
    function({ addUtilities, theme }) {
      const newUtilities = {
        // Spotlight backgrounds
        '.bg-spotlight-primary': { backgroundImage: 'var(--spotlight-primary)' },
        '.bg-spotlight-secondary': { backgroundImage: 'var(--spotlight-secondary)' },
        '.bg-spotlight-cyan': { backgroundImage: 'var(--spotlight-cyan)' },
        '.bg-spotlight-emerald': { backgroundImage: 'var(--spotlight-emerald)' },

        // Grid beam with mask
        '.bg-grid-beam': {
          backgroundImage: 'var(--grid-pattern)',
          backgroundSize: '48px 48px',
          WebkitMaskImage: 'var(--grid-beam-mask)',
          maskImage: 'var(--grid-beam-mask)',
        },

        // Moving border shimmer
        '.border-shimmer': {
          position: 'relative',
          isolation: 'isolate',
        },
        '.border-shimmer::before': {
          content: '""',
          position: 'absolute',
          inset: '-1px',
          borderRadius: 'inherit',
          background: 'var(--shimmer-stops)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 3s linear infinite',
          WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
          WebkitMaskComposite: 'xor',
          maskComposite: 'exclude',
          zIndex: '-1',
        },

        // Gradient text utilities
        '.text-gradient-primary': {
          background: 'var(--gradient-text-primary)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        },
        '.text-gradient-electric': {
          background: 'var(--gradient-text-electric)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        },
        '.text-gradient-cyber': {
          background: 'var(--gradient-text-cyber)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        },
        '.text-gradient-emerald': {
          background: 'var(--gradient-text-emerald)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
        },

        // Frosted glass panels
        '.glass-panel': {
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--glass-border)',
        },

        // Avatar stack social proof
        '.avatar-stack > *': {
          marginLeft: 'var(--avatar-overlap)',
          border: 'var(--avatar-ring)',
          borderRadius: '9999px',
        },
        '.avatar-stack > *:first-child': { marginLeft: '0' },

        // Status beacon pulse ring
        '.status-beacon': { position: 'relative' },
        '.status-beacon::after': {
          content: '""',
          position: 'absolute',
          inset: '-4px',
          borderRadius: 'inherit',
          border: '2px solid currentColor',
          animation: 'pulse-ring 2s cubic-bezier(0.24,0,0.38,1) infinite',
          opacity: '0',
        },
      }
      addUtilities(newUtilities)
    },
  ],
}