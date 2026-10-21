/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables (see src/index.css) so light and
        // dark themes share one set of utility classes.
        app: 'rgb(var(--c-app) / <alpha-value>)',
        panel: 'rgb(var(--c-panel) / <alpha-value>)',
        'panel-2': 'rgb(var(--c-panel-2) / <alpha-value>)',
        hover: 'rgb(var(--c-hover) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        brand: 'rgb(var(--c-brand) / <alpha-value>)',
        'brand-strong': 'rgb(var(--c-brand-strong) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'on-accent': 'rgb(var(--c-on-accent) / <alpha-value>)',
        'bubble-in': 'rgb(var(--c-bubble-in) / <alpha-value>)',
        'bubble-out': 'rgb(var(--c-bubble-out) / <alpha-value>)',
        'bubble-meta': 'rgb(var(--c-bubble-meta) / <alpha-value>)',
        chip: 'rgb(var(--c-chip) / <alpha-value>)',
        'chip-ink': 'rgb(var(--c-chip-ink) / <alpha-value>)',
        notice: 'rgb(var(--c-notice) / <alpha-value>)',
        'notice-ink': 'rgb(var(--c-notice-ink) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        mark: 'rgb(var(--c-mark) / <alpha-value>)',
      },
      fontFamily: {
        sans: [
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Noto Sans',
          'Arial',
          'Apple Color Emoji',
          'Segoe UI Emoji',
          'Noto Color Emoji',
          'sans-serif',
        ],
      },
      boxShadow: {
        bubble: '0 1px 0.5px rgba(11, 20, 26, 0.13)',
        pop: '0 2px 5px 0 rgba(11,20,26,.26), 0 2px 10px 0 rgba(11,20,26,.16)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { transform: 'translateY(12px)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        'pop-in': { from: { transform: 'scale(.96)', opacity: '0' }, to: { transform: 'none', opacity: '1' } },
        flash: { '0%,100%': { backgroundColor: 'transparent' }, '30%': { backgroundColor: 'rgb(var(--c-flash) / .45)' } },
      },
      animation: {
        'fade-in': 'fade-in .15s ease-out',
        'slide-up': 'slide-up .2s ease-out',
        'pop-in': 'pop-in .14s ease-out',
        flash: 'flash 1.6s ease-in-out',
      },
    },
  },
  plugins: [],
};
