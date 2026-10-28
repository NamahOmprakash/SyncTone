/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter Variable"', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
        display: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        serif: ['"Newsreader Variable"', 'Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', '"JetBrains Mono"', 'Menlo', 'monospace'],
      },
      spacing: {
        '88': '22rem',
      },
      colors: {
        page: 'var(--bg-page)',
        surface: 'var(--bg-surface)',
        card: 'var(--bg-card)',
        hover: 'var(--bg-hover)',
        elevated: 'var(--bg-elevated)',
        'text-main': 'var(--text-main)',
        'text-sub': 'var(--text-sub)',
        'text-muted': 'var(--text-muted)',
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          hover: 'var(--border-hover)',
          focus: 'var(--border-focus)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          surface: 'var(--accent-surface)',
        },
        'on-accent': 'var(--on-accent)',
        status: {
          success: 'var(--success)',
          warning: 'var(--warning)',
          danger: 'var(--danger)',
        },
        speaker: {
          narrator: 'var(--speaker-narrator)',
          a: 'var(--speaker-a)',
          b: 'var(--speaker-b)',
          c: 'var(--speaker-c)',
          d: 'var(--speaker-d)',
        },
        brand: {
          gold: '#E5A93C',
          crimson: '#E50914',
          cyan: '#06B6D4',
          indigo: '#6366F1',
          violet: '#8B5CF6',
        },
        // Speaker color palette backward compatibility
        narrator: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
        speaker1: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
        speaker2: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
        speaker3: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
        speaker4: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
        speaker5: { light: 'var(--accent-surface)', border: 'var(--border-subtle)' },
      },
      transitionTimingFunction: {
        'ease-out-custom': 'cubic-bezier(0.16, 1, 0.3, 1)',
        'spring-custom': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      transitionDuration: {
        instant: '120ms',
        fast: '200ms',
        normal: '320ms',
        slow: '500ms',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        scaleUp: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%, 60%': { transform: 'translateX(-4px)' },
          '40%, 80%': { transform: 'translateX(4px)' },
        },
        slideLeft: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        fadeIn: 'fadeIn 0.2s ease-out forwards',
        scaleUp: 'scaleUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        shake: 'shake 0.35s ease-in-out',
        slideLeft: 'slideLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
    },
  },
  plugins: [],
};

