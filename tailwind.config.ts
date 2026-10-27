import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f1f5fb',
          100: '#dce7f5',
          200: '#b9cfea',
          300: '#89acd9',
          400: '#5482c2',
          500: '#3562a6',
          600: '#274b85',
          700: '#213d6b',
          800: '#1d3459',
          900: '#0b1f3a',
          950: '#071426',
        },
        gold: {
          50: '#fbf8eb',
          100: '#f4ecc9',
          200: '#ead891',
          300: '#dfbe55',
          400: '#d4a837',
          500: '#c3912a',
          600: '#a87422',
          700: '#86561f',
          800: '#70461f',
          900: '#603c1d',
        },
        moss: {
          50: '#f1f8f3',
          100: '#dceee1',
          500: '#3e8b5b',
          700: '#276b40',
          900: '#123923',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        panel: '0 18px 50px -28px rgba(11, 31, 58, 0.35)',
        soft: '0 10px 30px -18px rgba(11, 31, 58, 0.28)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .28s ease-out both',
      },
    },
  },
  plugins: [],
};

export default config;
