// Theme Configuration Type
export interface ThemeConfig {
  name: string;
  displayName: string;
  type: 'light' | 'dark';
  cssVariables: Record<string, string>;
}

// Base CSS variables that are shared across themes
const baseCssVariables = {
  // Spacing (rem-based)
  '--spacing-0': '0rem',      // 0px
  '--spacing-1': '0.25rem',   // 4px
  '--spacing-2': '0.5rem',    // 8px
  '--spacing-3': '0.75rem',   // 12px
  '--spacing-4': '1rem',      // 16px
  '--spacing-5': '1.25rem',   // 20px
  '--spacing-6': '1.5rem',    // 24px
  '--spacing-8': '2rem',      // 32px
  '--spacing-10': '2.5rem',   // 40px
  '--spacing-12': '3rem',     // 48px
  '--spacing-16': '4rem',     // 64px
  '--spacing-20': '5rem',     // 80px
  '--spacing-24': '6rem',     // 96px
  '--spacing-32': '8rem',     // 128px
  '--spacing-40': '10rem',    // 160px
  '--spacing-48': '12rem',    // 192px
  '--spacing-56': '14rem',    // 224px
  '--spacing-64': '16rem',    // 256px

  // Border Radius
  '--radius-none': '0px',
  '--radius-sm': '0.125rem',  // 2px
  '--radius-md': '0.25rem',   // 4px
  '--radius-lg': '0.5rem',    // 8px
  '--radius-xl': '0.75rem',   // 12px
  '--radius-2xl': '1rem',     // 16px
  '--radius-3xl': '1.5rem',   // 24px
  '--radius-full': '9999px',

  // Typography
  '--font-family-sans': 'ui-sans-serif, system-ui, sans-serif',
  '--font-family-mono': 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, monospace',
  '--font-family-display': '"Inter Display", ui-sans-serif, system-ui, sans-serif',

  '--font-size-xs': '0.75rem',    // 12px
  '--font-size-sm': '0.875rem',   // 14px
  '--font-size-base': '1rem',     // 16px
  '--font-size-lg': '1.125rem',   // 18px
  '--font-size-xl': '1.25rem',    // 20px
  '--font-size-2xl': '1.5rem',    // 24px
  '--font-size-3xl': '1.875rem',  // 30px
  '--font-size-4xl': '2.25rem',   // 36px
  '--font-size-5xl': '3rem',      // 48px
  '--font-size-6xl': '3.75rem',   // 60px

  '--font-weight-light': '300',
  '--font-weight-normal': '400',
  '--font-weight-medium': '500',
  '--font-weight-semibold': '600',
  '--font-weight-bold': '700',
  '--font-weight-extrabold': '800',

  '--line-height-tight': '1.25',
  '--line-height-normal': '1.5',
  '--line-height-relaxed': '1.75',

  // Glass Effects - Enhanced for Premium Feel
  '--glass-blur-none': '0px',
  '--glass-blur-sm': '6px',      // Enhanced from 4px
  '--glass-blur-md': '12px',     // Enhanced from 8px
  '--glass-blur-lg': '20px',     // Enhanced from 16px
  '--glass-blur-xl': '32px',     // Enhanced from 24px
  '--glass-blur-2xl': '48px',    // Enhanced from 40px
  '--glass-blur-3xl': '80px',    // Enhanced from 64px

  '--glass-opacity-light': '0.08',   // Enhanced from 0.05
  '--glass-opacity-medium': '0.15',  // Enhanced from 0.1
  '--glass-opacity-heavy': '0.25',   // Enhanced from 0.2

  // Mobile-specific glass opacity for better visibility
  '--glass-opacity-light-mobile': '0.18',   // Stronger for mobile
  '--glass-opacity-medium-mobile': '0.28',  // Stronger for mobile
  '--glass-opacity-heavy-mobile': '0.38',   // Stronger for mobile

  // Animations
  '--animation-duration-instant': '0ms',
  '--animation-duration-fast': '150ms',
  '--animation-duration-normal': '300ms',
  '--animation-duration-slow': '500ms',
  '--animation-duration-slower': '750ms',

  '--animation-easing-linear': 'linear',
  '--animation-easing-ease-in': 'cubic-bezier(0.4, 0, 1, 1)',
  '--animation-easing-ease-out': 'cubic-bezier(0, 0, 0.2, 1)',
  '--animation-easing-ease-in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
  '--animation-easing-spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',

  // Shadows
  '--shadow-sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  '--shadow-md': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  '--shadow-lg': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  '--shadow-xl': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
  '--shadow-2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',

  // Breakpoints
  '--breakpoint-sm': '640px',
  '--breakpoint-md': '768px',
  '--breakpoint-lg': '1024px',
  '--breakpoint-xl': '1280px',
  '--breakpoint-2xl': '1536px'
};

// 🌅 Light Theme - Professional & Clean
export const lightTheme: ThemeConfig = {
  name: 'light',
  displayName: 'Light Mode',
  type: 'light',
  cssVariables: {
    ...baseCssVariables,

    // Primary Brand (Purple/Violet)
    '--color-primary-50': '250 245 255',   // #faf5ff
    '--color-primary-100': '243 232 255',  // #f3e8ff
    '--color-primary-200': '233 213 255',  // #e9d5ff
    '--color-primary-300': '216 180 254',  // #d8b4fe
    '--color-primary-400': '196 143 253',  // #c493fd
    '--color-primary-500': '168 85 247',   // #a855f7
    '--color-primary-600': '147 51 234',   // #9333ea
    '--color-primary-700': '126 34 206',   // #7e22ce
    '--color-primary-800': '107 33 168',   // #6b21a8
    '--color-primary-900': '88 28 135',    // #581c87
    '--color-primary-950': '59 7 100',     // #3b0764

    // Secondary (Cyan/Blue)
    '--color-secondary-50': '236 254 255',  // #ecfeff
    '--color-secondary-500': '6 182 212',   // #06b6d4
    '--color-secondary-900': '22 78 99',    // #164e63

    // Success (Emerald)
    '--color-success-50': '236 253 245',   // #ecfdf5
    '--color-success-500': '16 185 129',   // #10b981
    '--color-success-900': '6 78 59',      // #064e3b

    // Error (Red)
    '--color-error-50': '254 242 242',     // #fef2f2
    '--color-error-500': '239 68 68',      // #ef4444
    '--color-error-900': '127 29 29',      // #7f1d1d

    // Warning (Amber)
    '--color-warning-50': '255 251 235',   // #fffbeb
    '--color-warning-500': '245 158 11',   // #f59e0b
    '--color-warning-900': '146 64 14',    // #92400e

    // Neutrals (Cool Gray)
    '--color-neutral-0': '255 255 255',    // #ffffff
    '--color-neutral-50': '249 250 251',   // #f9fafb
    '--color-neutral-100': '243 244 246',  // #f3f4f6
    '--color-neutral-200': '229 231 235',  // #e5e7eb
    '--color-neutral-300': '209 213 219',  // #d1d5db
    '--color-neutral-400': '156 163 175',  // #9ca3af
    '--color-neutral-500': '107 114 128',  // #6b7280
    '--color-neutral-600': '75 85 99',     // #4b5563
    '--color-neutral-700': '55 65 81',     // #374151
    '--color-neutral-800': '31 41 55',     // #1f2937
    '--color-neutral-900': '17 24 39',     // #111827
    '--color-neutral-950': '3 7 18',       // #030712
    '--color-neutral-1000': '0 0 0',       // #000000

    // Text Colors - HIGH CONTRAST for Light Theme
    '--color-text-primary': '17 24 39',          // Very dark for main text
    '--color-text-secondary': '55 65 81',        // Dark gray for secondary text  
    '--color-text-muted': '107 114 128',         // Medium gray for muted text
    '--color-text-accent': '17 24 39',           // Dark for accents

    // Financial Colors - Enhanced for Emotional Impact
    '--color-financial-revenue': '5 150 105',    // emerald-600 - deeper, more professional
    '--color-financial-expense': '220 38 38',    // red-600 - more dramatic
    '--color-financial-asset': '37 99 235',      // blue-600 - stronger presence
    '--color-financial-liability': '217 119 6',  // amber-600 - more serious
    '--color-financial-equity': '147 51 234',    // purple-600 - richer
    '--color-financial-profit': '22 163 74',     // green-600 - more confident
    '--color-financial-loss': '185 28 28',       // red-700 - distinct from expense


    // Glass variables used by index.css and tailwind
    '--glass-background': 'rgba(255, 255, 255, var(--glass-opacity-medium))',
    '--glass-border': 'var(--glass-border-medium)',
    '--shadow-glass': '0 10px 30px rgba(0, 0, 0, 0.10)',
    '--glass-glow': 'var(--shadow-glow-md)',

    // Glass Effects (Light Mode)
    '--glass-border-light': 'rgba(0, 0, 0, 0.1)',
    '--glass-border-medium': 'rgba(0, 0, 0, 0.2)',
    '--glass-border-heavy': 'rgba(0, 0, 0, 0.3)',

    '--shadow-glow-sm': '0 0 10px rgba(168, 85, 247, 0.3)',
    '--shadow-glow-md': '0 0 20px rgba(168, 85, 247, 0.4)',
    '--shadow-glow-lg': '0 0 30px rgba(168, 85, 247, 0.5)',
  }
};

// 🌌 Pure Elegance - Clean White & Dark Beauty
export const darkTheme: ThemeConfig = {
  name: 'dark',
  displayName: 'Pure Elegance',
  type: 'dark',
  cssVariables: {
    ...baseCssVariables,

    // Pure White & Silver Primary - Clean & Elegant
    '--color-primary-50': '15 15 15',      // Deep charcoal
    '--color-primary-100': '30 30 30',     // Dark gray  
    '--color-primary-200': '60 60 60',     // Medium gray
    '--color-primary-300': '120 120 120',  // Light gray
    '--color-primary-400': '180 180 180',  // Very light gray
    '--color-primary-500': '255 255 255',  // PURE WHITE ⚡
    '--color-primary-600': '255 255 255',  // Pure white
    '--color-primary-700': '255 255 255',  // Pure white
    '--color-primary-800': '255 255 255',  // Pure white
    '--color-primary-900': '255 255 255',  // Pure white
    '--color-primary-950': '255 255 255',  // Pure white

    // Electric Cyan Secondary
    '--color-secondary-50': '6 78 59',      // Deep teal
    '--color-secondary-500': '6 255 255',   // ELECTRIC CYAN ⚡
    '--color-secondary-900': '165 255 255', // Light cyan

    // Neon Emerald Success
    '--color-success-50': '6 78 59',        // Deep emerald
    '--color-success-500': '16 255 136',    // NEON EMERALD ⚡
    '--color-success-900': '165 255 207',   // Light emerald

    // Crimson Fire Error
    '--color-error-50': '127 29 29',        // Deep crimson
    '--color-error-500': '255 51 85',       // CRIMSON FIRE ⚡
    '--color-error-900': '255 182 193',     // Light crimson

    // Golden Lightning Warning
    '--color-warning-50': '146 64 14',      // Deep gold
    '--color-warning-500': '255 215 0',     // GOLDEN LIGHTNING ⚡
    '--color-warning-900': '255 248 181',   // Light gold

    // Midnight Neutrals - ULTRA DARK for Maximum Text Visibility
    '--color-neutral-0': '0 0 0',           // Pure black void
    '--color-neutral-50': '4 4 4',          // Near black
    '--color-neutral-100': '8 8 8',         // Very dark gray
    '--color-neutral-200': '12 12 12',      // Dark charcoal
    '--color-neutral-300': '18 18 18',      // Medium dark gray
    '--color-neutral-400': '28 28 28',      // Medium gray
    '--color-neutral-500': '80 80 80',      // Neutral gray
    '--color-neutral-600': '140 140 140',   // Light gray
    '--color-neutral-700': '180 180 180',   // Very light gray
    '--color-neutral-800': '220 220 220',   // Near white
    '--color-neutral-900': '240 240 240',   // Ultra light
    '--color-neutral-950': '250 250 250',   // Almost white
    '--color-neutral-1000': '255 255 255',  // Pure white

    // Text Colors - ULTRA BRIGHT for Dark Theme
    '--color-text-primary': '255 255 255',       // Pure white for main text
    '--color-text-secondary': '230 230 230',     // Very bright gray for secondary text  
    '--color-text-muted': '200 200 200',         // Bright gray for muted text (much brighter!)
    '--color-text-accent': '255 255 255',        // White for accents

    // Financial Colors - ELECTRIC & VIBRANT (keeping these beautiful!)
    '--color-financial-revenue': '16 255 136',   // NEON EMERALD ⚡
    '--color-financial-expense': '255 51 85',    // CRIMSON FIRE ⚡  
    '--color-financial-asset': '51 153 255',     // ELECTRIC BLUE ⚡
    '--color-financial-liability': '255 178 51', // GOLDEN AMBER ⚡
    '--color-financial-equity': '192 38 211',    // ELECTRIC MAGENTA ⚡
    '--color-financial-profit': '57 255 112',    // LIME GLOW ⚡
    '--color-financial-loss': '255 34 68',       // NEON RED ⚡

    // Glass variables - NEUTRAL BORDERS, NO PURPLE!
    '--glass-background': 'rgba(25, 25, 35, var(--glass-opacity-medium))',
    '--glass-border': 'var(--glass-border-medium)',
    '--shadow-glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
    '--glass-glow': 'var(--shadow-glow-md)',

    // Glass Effects - SUBTLE NEUTRAL BORDERS
    '--glass-border-light': 'rgba(255, 255, 255, 0.08)',
    '--glass-border-medium': 'rgba(255, 255, 255, 0.12)',
    '--glass-border-heavy': 'rgba(255, 255, 255, 0.16)',

    // Subtle White Glow Effects (only for hover/special states)
    '--shadow-glow-sm': '0 0 8px rgba(255, 255, 255, 0.2)',
    '--shadow-glow-md': '0 0 12px rgba(255, 255, 255, 0.25)',
    '--shadow-glow-lg': '0 0 16px rgba(255, 255, 255, 0.3)'
  }
};

// ⚡ Cyber Blue - Futuristic Neon Revolution
export const blueTheme: ThemeConfig = {
  name: 'blue',
  displayName: 'Cyber Blue',
  type: 'dark',
  cssVariables: {
    ...baseCssVariables,

    // Neon Cyan & Electric Blue Primary Spectrum
    '--color-primary-50': '8 28 68',        // Deep cyber navy
    '--color-primary-100': '12 42 95',      // Dark cyber blue
    '--color-primary-200': '23 71 140',     // Rich cyber blue
    '--color-primary-300': '37 99 235',     // Bright blue
    '--color-primary-400': '59 130 246',    // Electric blue
    '--color-primary-500': '0 195 255',     // NEON CYAN ⚡
    '--color-primary-600': '56 217 255',    // Bright cyan
    '--color-primary-700': '102 238 255',   // Light cyan
    '--color-primary-800': '153 246 255',   // Soft cyan
    '--color-primary-900': '204 251 255',   // Very light cyan
    '--color-primary-950': '230 253 255',   // Subtle cyan

    // Electric Teal Secondary
    '--color-secondary-50': '4 47 46',       // Deep teal
    '--color-secondary-500': '20 255 240',   // ELECTRIC TEAL ⚡
    '--color-secondary-900': '153 255 251',  // Light teal

    // Cyber Green Success
    '--color-success-50': '5 46 22',         // Deep cyber green
    '--color-success-500': '57 255 20',      // CYBER GREEN ⚡
    '--color-success-900': '187 255 153',    // Light cyber green

    // Neon Red Error
    '--color-error-50': '75 5 24',           // Deep cyber red
    '--color-error-500': '255 20 57',        // NEON RED ⚡
    '--color-error-900': '255 153 187',      // Light cyber red

    // Electric Orange Warning
    '--color-warning-50': '67 20 7',         // Deep cyber orange
    '--color-warning-500': '255 140 0',      // ELECTRIC ORANGE ⚡
    '--color-warning-900': '255 204 153',    // Light cyber orange

    // Cyber Space Neutrals - ULTRA DARK with Subtle Blue Undertones
    '--color-neutral-0': '0 0 0',            // Void black
    '--color-neutral-50': '4 4 6',           // Very dark cyber gray
    '--color-neutral-100': '8 8 12',         // Dark cyber charcoal
    '--color-neutral-200': '12 12 16',       // Charcoal with subtle blue
    '--color-neutral-300': '18 18 24',       // Medium dark cyber
    '--color-neutral-400': '28 28 35',       // Medium cyber gray
    '--color-neutral-500': '80 80 90',       // Neutral cyber gray
    '--color-neutral-600': '140 140 150',    // Light cyber gray
    '--color-neutral-700': '180 180 190',    // Very light cyber
    '--color-neutral-800': '220 220 230',    // Near white
    '--color-neutral-900': '240 240 245',    // Ultra light
    '--color-neutral-950': '250 250 252',    // Almost white
    '--color-neutral-1000': '255 255 255',   // Pure white

    // Text Colors - ULTRA BRIGHT for Cyber Theme
    '--color-text-primary': '255 255 255',       // Pure white for main text
    '--color-text-secondary': '230 235 245',     // Very bright cyber gray for secondary text  
    '--color-text-muted': '200 210 220',         // Bright cyber gray for muted text (much brighter!)
    '--color-text-accent': '255 255 255',        // White for accents

    // Financial Colors - CYBER NEON PALETTE (keeping these amazing!)
    '--color-financial-revenue': '57 255 20',    // CYBER GREEN ⚡
    '--color-financial-expense': '255 20 57',    // NEON RED ⚡
    '--color-financial-asset': '0 195 255',      // NEON CYAN ⚡
    '--color-financial-liability': '255 140 0',  // ELECTRIC ORANGE ⚡
    '--color-financial-equity': '20 255 240',    // ELECTRIC TEAL ⚡
    '--color-financial-profit': '102 255 51',    // LIME CYBER ⚡
    '--color-financial-loss': '255 51 102',      // PINK NEON ⚡

    // Glass variables - NEUTRAL BORDERS
    '--glass-background': 'rgba(25, 28, 38, var(--glass-opacity-medium))',
    '--glass-border': 'var(--glass-border-medium)',
    '--shadow-glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
    '--glass-glow': 'var(--shadow-glow-md)',

    // Glass Effects - SUBTLE NEUTRAL BORDERS
    '--glass-border-light': 'rgba(255, 255, 255, 0.08)',
    '--glass-border-medium': 'rgba(255, 255, 255, 0.12)',
    '--glass-border-heavy': 'rgba(255, 255, 255, 0.16)',

    // Subtle Cyan Glow Effects (only for special states)
    '--shadow-glow-sm': '0 0 8px rgba(0, 195, 255, 0.25)',
    '--shadow-glow-md': '0 0 12px rgba(0, 195, 255, 0.3)',
    '--shadow-glow-lg': '0 0 16px rgba(0, 195, 255, 0.35)'
  }
};

// 💎 Emerald Luxury - Royal Finance Elegance
export const greenTheme: ThemeConfig = {
  name: 'green',
  displayName: 'Emerald Luxury',
  type: 'dark',
  cssVariables: {
    ...baseCssVariables,

    // Royal Emerald & Gold Primary Spectrum
    '--color-primary-50': '6 78 54',        // Deep forest emerald
    '--color-primary-100': '10 120 80',     // Rich emerald
    '--color-primary-200': '16 150 100',    // Deep emerald
    '--color-primary-300': '22 180 120',    // Bright emerald
    '--color-primary-400': '34 197 94',     // Vivid emerald
    '--color-primary-500': '0 255 127',     // NEON EMERALD ⚡
    '--color-primary-600': '64 255 153',    // Bright emerald glow
    '--color-primary-700': '127 255 191',   // Light emerald
    '--color-primary-800': '178 255 217',   // Soft emerald
    '--color-primary-900': '217 255 238',   // Very light emerald
    '--color-primary-950': '239 255 247',   // Subtle emerald

    // Royal Gold Secondary
    '--color-secondary-50': '92 64 14',      // Deep royal gold
    '--color-secondary-500': '255 215 0',    // ROYAL GOLD ⚡
    '--color-secondary-900': '255 243 179',  // Light gold

    // Jade Success
    '--color-success-50': '6 78 59',         // Deep jade
    '--color-success-500': '20 255 147',     // JADE GLOW ⚡
    '--color-success-900': '153 255 204',    // Light jade

    // Ruby Error
    '--color-error-50': '87 13 13',          // Deep ruby
    '--color-error-500': '255 51 51',        // RUBY FIRE ⚡
    '--color-error-900': '255 153 153',      // Light ruby

    // Amber Warning
    '--color-warning-50': '92 64 14',        // Deep amber
    '--color-warning-500': '255 191 0',      // LIQUID AMBER ⚡
    '--color-warning-900': '255 235 153',    // Light amber

    // Luxury Dark Neutrals - ULTRA DARK with Subtle Emerald Undertones
    '--color-neutral-0': '0 0 0',            // Luxury black
    '--color-neutral-50': '4 5 4',           // Very dark emerald gray
    '--color-neutral-100': '8 10 8',         // Dark emerald charcoal
    '--color-neutral-200': '12 14 12',       // Charcoal with emerald hint
    '--color-neutral-300': '18 22 18',       // Medium dark emerald
    '--color-neutral-400': '28 32 28',       // Medium emerald gray
    '--color-neutral-500': '80 85 80',       // Neutral emerald gray
    '--color-neutral-600': '140 145 140',    // Light emerald gray
    '--color-neutral-700': '180 185 180',    // Very light emerald
    '--color-neutral-800': '220 225 220',    // Near white
    '--color-neutral-900': '240 242 240',    // Ultra light
    '--color-neutral-950': '250 252 250',    // Almost white
    '--color-neutral-1000': '255 255 255',   // Pure white

    // Text Colors - ULTRA BRIGHT for Emerald Theme
    '--color-text-primary': '255 255 255',       // Pure white for main text
    '--color-text-secondary': '230 235 230',     // Very bright emerald gray for secondary text  
    '--color-text-muted': '200 210 200',         // Bright emerald gray for muted text (much brighter!)
    '--color-text-accent': '255 255 255',        // White for accents

    // Financial Colors - LUXURY EMERALD & GOLD PALETTE (keeping these!)
    '--color-financial-revenue': '0 255 127',    // NEON EMERALD ⚡
    '--color-financial-expense': '255 51 51',    // RUBY FIRE ⚡
    '--color-financial-asset': '64 224 208',     // TURQUOISE LUXURY ⚡
    '--color-financial-liability': '255 191 0',  // LIQUID AMBER ⚡
    '--color-financial-equity': '255 215 0',     // ROYAL GOLD ⚡
    '--color-financial-profit': '50 255 126',    // EMERALD SHINE ⚡
    '--color-financial-loss': '255 69 58',       // CORAL RED ⚡

    // Glass variables - NEUTRAL BORDERS
    '--glass-background': 'rgba(28, 38, 32, var(--glass-opacity-medium))',
    '--glass-border': 'var(--glass-border-medium)',
    '--shadow-glass': '0 8px 32px rgba(0, 0, 0, 0.4)',
    '--glass-glow': 'var(--shadow-glow-md)',

    // Glass Effects - SUBTLE NEUTRAL BORDERS
    '--glass-border-light': 'rgba(255, 255, 255, 0.08)',
    '--glass-border-medium': 'rgba(255, 255, 255, 0.12)',
    '--glass-border-heavy': 'rgba(255, 255, 255, 0.16)',

    // Subtle Emerald Glow Effects (only for special states)
    '--shadow-glow-sm': '0 0 8px rgba(0, 255, 127, 0.25)',
    '--shadow-glow-md': '0 0 12px rgba(0, 255, 127, 0.3)',
    '--shadow-glow-lg': '0 0 16px rgba(0, 255, 127, 0.35)'
  }
};

// Export all available themes
export const themes = {
  light: lightTheme,
  dark: darkTheme,
  blue: blueTheme,
  green: greenTheme
} as const;

export type ThemeName = keyof typeof themes;
export const themeNames = Object.keys(themes) as ThemeName[];
