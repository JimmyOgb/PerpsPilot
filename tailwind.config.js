/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0b0e14',
        surface: {
          DEFAULT: '#121824',
          subtle: '#161f30',
          border: '#1e293b',
          hover: '#24324a',
        },
        trade: {
          long: '#00e599',
          'long-hover': '#00c784',
          'long-bg': 'rgba(0, 229, 153, 0.08)',
          short: '#ff4d6a',
          'short-hover': '#e63956',
          'short-bg': 'rgba(255, 77, 106, 0.08)',
        },
        brand: {
          cyan: '#00c2ff',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
