/**
 * Campus Netra design system.
 * Values are a direct translation of the CampusCare AI Kinetic System spec:
 * Corporate/Modern, operational high-density, "Precision Intelligence".
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
        'display-metrics': ['36px', { lineHeight: '44px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg':     ['28px', { lineHeight: '36px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-md':     ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg':         ['16px', { lineHeight: '24px' }],
        'body-md':         ['14px', { lineHeight: '20px' }],
        'body-sm':         ['12px', { lineHeight: '16px' }],
        'label-caps':      ['11px', { lineHeight: '16px', letterSpacing: '0.06em', fontWeight: '700' }],
        'mono-data':       ['13px', { lineHeight: '18px', fontWeight: '500' }],
      },

      borderRadius: {
        // Soft(2) profile. Structural elements stay grid-aligned but carry a
        // visible radius, which reads as finished rather than wireframed.
        DEFAULT: '0.5rem',   // widgets, inputs, tables
        sm: '0.25rem',
        md: '0.5rem',
        lg: '0.625rem',      // buttons
        xl: '0.875rem',      // AI bubbles, status pills
        '2xl': '1rem',       // page-level panels and modals
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
      },
      animation: {
        'fade-in': 'fade-in 160ms ease-out',
        'slide-up': 'slide-up 200ms ease-out',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.24,0,0.38,1) infinite',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
}
