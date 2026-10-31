/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Legacy static tokens (keep for backward compat)
        ink: '#080d18',
        panel: '#111827',
        accent: '#fbbf24',
        accentSoft: '#fde68a',
        steel: '#334155',
        // Theme-aware semantic tokens (RGB format enables Tailwind opacity modifiers)
        'theme-base':         'rgb(var(--bg-base-rgb) / <alpha-value>)',
        'theme-panel':        'rgb(var(--bg-panel-rgb) / <alpha-value>)',
        'theme-surface':      'rgb(var(--bg-surface-rgb) / <alpha-value>)',
        'theme-raised':       'rgb(var(--bg-raised-rgb) / <alpha-value>)',
        'theme-text':         'var(--text-primary)',
        'theme-secondary':    'var(--text-secondary)',
        'theme-muted':        'var(--text-muted)',
        'theme-border':       'var(--border-default)',
        'theme-border-subtle':'var(--border-subtle)',
        // CTA button tokens
        'cta':       'var(--cta-bg)',
        'cta-hover': 'var(--cta-hover)',
        'cta-text':  'var(--cta-text)',
        // Functional colours — semantic signals, locked across themes
        'action':       'var(--color-action)',
        'caution':      'var(--color-caution)',
        'fn-success':   'var(--color-success)',
        'fn-critical':  'var(--color-critical)',
        'data-passive': 'var(--color-data-passive)'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Courier New"', 'monospace']
      },
      borderRadius: {
        theme: 'var(--card-radius)'
      },
      boxShadow: {
        theme: 'var(--card-shadow)'
      }
    }
  },
  plugins: []
};
