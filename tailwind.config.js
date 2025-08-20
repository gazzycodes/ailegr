/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        // CSS Custom Properties for dynamic theming
        primary: {
          50: 'rgb(var(--color-primary-50) / <alpha-value>)',
          100: 'rgb(var(--color-primary-100) / <alpha-value>)',
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900) / <alpha-value>)',
          DEFAULT: 'rgb(var(--color-primary-500))',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        background: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        foreground: 'rgb(var(--color-neutral-900) / <alpha-value>)',
        surface: 'rgb(var(--color-neutral-100) / <alpha-value>)',
        border: 'rgb(var(--color-neutral-300) / <alpha-value>)',
        input: 'rgb(var(--color-neutral-100) / <alpha-value>)',
        ring: 'rgb(var(--color-primary-500) / <alpha-value>)',
        muted: {
          DEFAULT: 'rgb(var(--color-neutral-100) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-500) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-secondary-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-error-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-900) / <alpha-value>)',
        },
        info: {
          DEFAULT: 'rgb(var(--color-secondary-500) / <alpha-value>)',
          foreground: 'rgb(var(--color-neutral-0) / <alpha-value>)',
        },
        // Financial Colors
        financial: {
          revenue: 'rgb(var(--color-financial-revenue) / <alpha-value>)',
          expense: 'rgb(var(--color-financial-expense) / <alpha-value>)',
          profit: 'rgb(var(--color-financial-profit) / <alpha-value>)',
          loss: 'rgb(var(--color-financial-loss) / <alpha-value>)',
          asset: 'rgb(var(--color-financial-asset) / <alpha-value>)',
          liability: 'rgb(var(--color-financial-liability) / <alpha-value>)',
          equity: 'rgb(var(--color-financial-equity) / <alpha-value>)',
        },
      },
      spacing: {
        'xs': 'var(--spacing-xs)',
        'sm': 'var(--spacing-sm)',
        'md': 'var(--spacing-md)',
        'lg': 'var(--spacing-lg)',
        'xl': 'var(--spacing-xl)',
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      fontFamily: {
        sans: ['var(--font-family)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'glass': 'var(--shadow-glass)',
        'glow': 'var(--glass-glow)',
      },
      backdropBlur: {
        'glass': 'var(--glass-blur)',
      },
      animation: {
        'breathe': 'breathe 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite alternate',
        'liquid-flow': 'liquid-flow 3s ease-in-out infinite',
      },
      keyframes: {
        breathe: {
          '0%, 100%': { 
            transform: 'scale(1)',
            opacity: '0.8'
          },
          '50%': { 
            transform: 'scale(1.02)',
            opacity: '1'
          },
        },
        float: {
          '0%, 100%': { 
            transform: 'translateY(0px)',
          },
          '50%': { 
            transform: 'translateY(-10px)',
          },
        },
        'glow-pulse': {
          '0%': {
            boxShadow: '0 0 20px rgb(var(--color-primary-500) / 0.3)',
          },
          '100%': {
            boxShadow: '0 0 40px rgb(var(--color-primary-500) / 0.6)',
          },
        },
        'liquid-flow': {
          '0%': { 
            transform: 'translateX(-100%) scaleX(0)',
          },
          '50%': { 
            transform: 'translateX(0%) scaleX(1)',
          },
          '100%': { 
            transform: 'translateX(100%) scaleX(0)',
          },
        },
      },
    },
  },
  plugins: [],
}
