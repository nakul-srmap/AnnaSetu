/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Accent colours are composed at runtime (`bg-brand-${accent}`), which the
  // content scanner cannot see. Safelist them so all three portals theme.
  safelist: [
    {
      pattern: /(bg|text|border)-brand-(green|navy|orange|stamp)/,
      variants: ['hover'],
    },
  ],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: '#EDE7D9', light: '#F7F3EA', screen: '#FCFAF5' },
        stock: '#E3D9C0',
        ink: { DEFAULT: '#16211C', soft: '#5D6560', rule: 'rgba(22,33,28,0.16)' },
        brand: { green: '#0F5132', navy: '#10306B', orange: '#B84D18', stamp: '#A5253A' },
      },
      fontFamily: {
        display: ['Bitter', 'Georgia', 'serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: { none: '0', DEFAULT: '2px' },
      keyframes: {
        stamp: {
          from: { transform: 'rotate(-11deg) scale(2.4)', opacity: '0' },
          to: { transform: 'rotate(-11deg) scale(1)', opacity: '1' },
        },
      },
      animation: { stamp: 'stamp .42s cubic-bezier(.2,1.5,.4,1) both' },
    },
  },
  plugins: [],
}
