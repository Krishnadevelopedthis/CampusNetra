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
        // --- Brand ---
        primary: {
          DEFAULT: '#1e1b4b',   // deep professional indigo — nav, headings, branding
          50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
          400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
          800: '#3730a3', 900: '#1e1b4b', 950: '#070235',
        },
        // --- Action / AI indicator ---
        secondary: {
          DEFAULT: '#3b82f6',
          50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
        // --- Semantic: status indicators only, never decoration ---
        success: { DEFAULT: '#10b981', bg: '#ecfdf5', border: '#a7f3d0', text: '#047857' },
        warning: { DEFAULT: '#f59e0b', bg: '#fffbeb', border: '#fde68a', text: '#b45309' },
        danger:  { DEFAULT: '#ef4444', bg: '#fef2f2', border: '#fecaca', text: '#b91c1c' },
        info:    { DEFAULT: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe', text: '#1d4ed8' },

        // --- Digital Twin asset states (must match backend STATE_COLOURS) ---
        twin: {
          healthy: '#10b981',
          warning: '#f59e0b',
          fault: '#ef4444',
          maintenance: '#3b82f6',
          inspection: '#8b5cf6',
          decommissioned: '#94a3b8',
        },

        // --- Tiered neutral surfaces: "desk" vs "papers" ---
        surface: {
          base: '#f8fafc',     // the desk (page background)
          DEFAULT: '#ffffff',  // the papers (widgets)
          sunken: '#f1f5f9',
          raised: '#ffffff',
          inverse: '#0b1c30',
        },
        border: {
          subtle: '#e2e8f0',   // the 1px that defines a Level-1 widget
          DEFAULT: '#cbd5e1',
          strong: '#94a3b8',
        },
        ink: {
          DEFAULT: '#0b1c30',  // on-surface
          muted: '#47464f',    // on-surface-variant
          faint: '#64748b',
          inverse: '#eaf1ff',
        },
        // AI responses sit on a faint indigo tint to read as non-human.
        ai: { bg: '#f0f7ff', border: '#dbeafe' },
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
        // Soft(1) profile: structural elements stay tight and grid-aligned.
        DEFAULT: '0.25rem',
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem',   // buttons
        xl: '0.75rem',  // AI bubbles, status pills
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
        level2: '0 1px 4px 0 rgb(15 23 42 / 0.05)',
        // Level 3 — overlays, drawers, AI panels.
        level3: '0 4px 12px -1px rgb(15 23 42 / 0.10), 0 2px 6px -2px rgb(15 23 42 / 0.06)',
        popover: '0 8px 24px -4px rgb(15 23 42 / 0.14)',
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
