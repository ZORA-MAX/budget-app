/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#534ab7', light: '#7f77dd', faint: '#eeedfe' },
        surface: { DEFAULT: '#f5f5f7', card: '#ffffff', dark: '#1c1c1e', 'card-dark': '#2c2c2e' },
        ink: { DEFAULT: '#1d1d1f', secondary: '#6e6e73', tertiary: '#8e8e93' },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Helvetica Neue', 'sans-serif'],
        mono: ['SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: { xl: '16px', '2xl': '20px' },
    },
  },
  darkMode: 'media',
  plugins: [],
}
