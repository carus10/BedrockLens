/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/src/**/*.{ts,tsx}', './src/renderer/index.html'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Space Grotesk', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        bg: {
          primary: '#080c10',
          secondary: '#0d1117',
          tertiary: '#161b22',
          elevated: '#1c2128'
        },
        border: {
          subtle: '#21262d',
          default: '#30363d',
          muted: '#484f58'
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e',
          muted: '#6e7681',
          disabled: '#484f58'
        },
        accent: {
          blue: '#58a6ff',
          green: '#3fb950',
          orange: '#d29922',
          red: '#f85149',
          purple: '#bc8cff',
          cyan: '#39d353',
          yellow: '#e3b341'
        },
        chart: {
          1: '#58a6ff',
          2: '#3fb950',
          3: '#d29922',
          4: '#bc8cff',
          5: '#f85149',
          6: '#39d353'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 }
        },
        'pulse-glow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        shimmer: 'shimmer 2s linear infinite'
      }
    }
  },
  plugins: [require('tailwindcss-animate')]
}
