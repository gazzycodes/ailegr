// Base Design Tokens - The Foundation
export const designTokens = {
  // 🎨 Color System
  colors: {
    // Primary Brand Colors
    primary: {
      50: 'rgb(var(--color-primary-50))',
      100: 'rgb(var(--color-primary-100))',
      200: 'rgb(var(--color-primary-200))',
      300: 'rgb(var(--color-primary-300))',
      400: 'rgb(var(--color-primary-400))',
      500: 'rgb(var(--color-primary-500))', // Main brand color
      600: 'rgb(var(--color-primary-600))',
      700: 'rgb(var(--color-primary-700))',
      800: 'rgb(var(--color-primary-800))',
      900: 'rgb(var(--color-primary-900))',
      950: 'rgb(var(--color-primary-950))'
    },
    
    // Secondary Brand Colors
    secondary: {
      50: 'rgb(var(--color-secondary-50))',
      500: 'rgb(var(--color-secondary-500))',
      900: 'rgb(var(--color-secondary-900))'
    },
    
    // Semantic Colors
    success: {
      50: 'rgb(var(--color-success-50))',
      500: 'rgb(var(--color-success-500))',
      900: 'rgb(var(--color-success-900))'
    },
    error: {
      50: 'rgb(var(--color-error-50))',
      500: 'rgb(var(--color-error-500))',
      900: 'rgb(var(--color-error-900))'
    },
    warning: {
      50: 'rgb(var(--color-warning-50))',
      500: 'rgb(var(--color-warning-500))',
      900: 'rgb(var(--color-warning-900))'
    },
    
    // Neutral System
    neutral: {
      0: 'rgb(var(--color-neutral-0))',     // Pure white/black
      50: 'rgb(var(--color-neutral-50))',
      100: 'rgb(var(--color-neutral-100))',
      200: 'rgb(var(--color-neutral-200))',
      300: 'rgb(var(--color-neutral-300))',
      400: 'rgb(var(--color-neutral-400))',
      500: 'rgb(var(--color-neutral-500))',
      600: 'rgb(var(--color-neutral-600))',
      700: 'rgb(var(--color-neutral-700))',
      800: 'rgb(var(--color-neutral-800))',
      900: 'rgb(var(--color-neutral-900))',
      950: 'rgb(var(--color-neutral-950))',
      1000: 'rgb(var(--color-neutral-1000))' // Pure black/white
    },
    
    // Financial-Specific Colors
    financial: {
      revenue: 'rgb(var(--color-financial-revenue))',
      expense: 'rgb(var(--color-financial-expense))',
      asset: 'rgb(var(--color-financial-asset))',
      liability: 'rgb(var(--color-financial-liability))',
      equity: 'rgb(var(--color-financial-equity))',
      profit: 'rgb(var(--color-financial-profit))',
      loss: 'rgb(var(--color-financial-loss))'
    }
  },

  // 📐 Spacing System
  spacing: {
    0: 'var(--spacing-0)',
    1: 'var(--spacing-1)',      // 4px
    2: 'var(--spacing-2)',      // 8px
    3: 'var(--spacing-3)',      // 12px
    4: 'var(--spacing-4)',      // 16px
    5: 'var(--spacing-5)',      // 20px
    6: 'var(--spacing-6)',      // 24px
    8: 'var(--spacing-8)',      // 32px
    10: 'var(--spacing-10)',    // 40px
    12: 'var(--spacing-12)',    // 48px
    16: 'var(--spacing-16)',    // 64px
    20: 'var(--spacing-20)',    // 80px
    24: 'var(--spacing-24)',    // 96px
    32: 'var(--spacing-32)',    // 128px
    40: 'var(--spacing-40)',    // 160px
    48: 'var(--spacing-48)',    // 192px
    56: 'var(--spacing-56)',    // 224px
    64: 'var(--spacing-64)'     // 256px
  },

  // 📏 Border Radius
  radius: {
    none: 'var(--radius-none)',
    sm: 'var(--radius-sm)',     // 2px
    md: 'var(--radius-md)',     // 4px
    lg: 'var(--radius-lg)',     // 8px
    xl: 'var(--radius-xl)',     // 12px
    '2xl': 'var(--radius-2xl)', // 16px
    '3xl': 'var(--radius-3xl)', // 24px
    full: 'var(--radius-full)'  // 9999px
  },

  // 🔤 Typography
  typography: {
    fontFamily: {
      sans: 'var(--font-family-sans)',
      mono: 'var(--font-family-mono)',
      display: 'var(--font-family-display)'
    },
    fontSize: {
      xs: 'var(--font-size-xs)',     // 12px
      sm: 'var(--font-size-sm)',     // 14px
      base: 'var(--font-size-base)', // 16px
      lg: 'var(--font-size-lg)',     // 18px
      xl: 'var(--font-size-xl)',     // 20px
      '2xl': 'var(--font-size-2xl)', // 24px
      '3xl': 'var(--font-size-3xl)', // 30px
      '4xl': 'var(--font-size-4xl)', // 36px
      '5xl': 'var(--font-size-5xl)', // 48px
      '6xl': 'var(--font-size-6xl)'  // 60px
    },
    fontWeight: {
      light: 'var(--font-weight-light)',     // 300
      normal: 'var(--font-weight-normal)',   // 400
      medium: 'var(--font-weight-medium)',   // 500
      semibold: 'var(--font-weight-semibold)', // 600
      bold: 'var(--font-weight-bold)',       // 700
      extrabold: 'var(--font-weight-extrabold)' // 800
    },
    lineHeight: {
      tight: 'var(--line-height-tight)',   // 1.25
      normal: 'var(--line-height-normal)', // 1.5
      relaxed: 'var(--line-height-relaxed)' // 1.75
    }
  },

  // 🌊 Glass Effects
  glass: {
    blur: {
      none: 'var(--glass-blur-none)',
      sm: 'var(--glass-blur-sm)',     // 4px
      md: 'var(--glass-blur-md)',     // 8px
      lg: 'var(--glass-blur-lg)',     // 16px
      xl: 'var(--glass-blur-xl)',     // 24px
      '2xl': 'var(--glass-blur-2xl)', // 40px
      '3xl': 'var(--glass-blur-3xl)'  // 64px
    },
    opacity: {
      light: 'var(--glass-opacity-light)',   // 0.05
      medium: 'var(--glass-opacity-medium)', // 0.1
      heavy: 'var(--glass-opacity-heavy)'    // 0.2
    },
    border: {
      light: 'var(--glass-border-light)',   // rgba(255,255,255,0.1)
      medium: 'var(--glass-border-medium)', // rgba(255,255,255,0.2)
      heavy: 'var(--glass-border-heavy)'    // rgba(255,255,255,0.3)
    }
  },

  // ⚡ Animation System
  animation: {
    duration: {
      instant: 'var(--animation-duration-instant)', // 0ms
      fast: 'var(--animation-duration-fast)',       // 150ms
      normal: 'var(--animation-duration-normal)',   // 300ms
      slow: 'var(--animation-duration-slow)',       // 500ms
      slower: 'var(--animation-duration-slower)'    // 750ms
    },
    easing: {
      linear: 'var(--animation-easing-linear)',
      easeIn: 'var(--animation-easing-ease-in)',
      easeOut: 'var(--animation-easing-ease-out)',
      easeInOut: 'var(--animation-easing-ease-in-out)',
      spring: 'var(--animation-easing-spring)'
    }
  },

  // 🌟 Shadows & Effects
  shadow: {
    sm: 'var(--shadow-sm)',
    md: 'var(--shadow-md)',
    lg: 'var(--shadow-lg)',
    xl: 'var(--shadow-xl)',
    '2xl': 'var(--shadow-2xl)',
    glow: {
      sm: 'var(--shadow-glow-sm)',
      md: 'var(--shadow-glow-md)',
      lg: 'var(--shadow-glow-lg)'
    }
  },

  // 📱 Breakpoints
  breakpoints: {
    sm: 'var(--breakpoint-sm)',   // 640px
    md: 'var(--breakpoint-md)',   // 768px
    lg: 'var(--breakpoint-lg)',   // 1024px
    xl: 'var(--breakpoint-xl)',   // 1280px
    '2xl': 'var(--breakpoint-2xl)' // 1536px
  }
} as const;

// Theme Type Definitions
export type ColorScale = keyof typeof designTokens.colors.primary;
export type SpacingScale = keyof typeof designTokens.spacing;
export type RadiusScale = keyof typeof designTokens.radius;
export type FontSizeScale = keyof typeof designTokens.typography.fontSize;
