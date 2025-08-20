import { motion } from 'framer-motion';
import { ReactNode, forwardRef } from 'react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';

interface ThemedGlassSurfaceProps {
  children: ReactNode;
  className?: string;
  variant?: 'light' | 'medium' | 'heavy';
  glow?: boolean;
  hover?: boolean;
  depth?: number;
  style?: React.CSSProperties;
}

export const ThemedGlassSurface = forwardRef<HTMLDivElement, ThemedGlassSurfaceProps>(({
  children,
  className,
  variant = 'medium',
  glow = false,  // Turn off glow by default!
  hover = true,
  depth = 3,
  style,
  ...props
}, ref) => {
  const { currentTheme } = useTheme();

  const getGlassClasses = (variant: 'light' | 'medium' | 'heavy') => {
    const variants = {
      // Consistent opacity across all screen sizes - no mobile/desktop differences
      light: 'backdrop-blur-xl bg-white/[0.08] dark:bg-white/[0.06] border-white/[0.08] dark:border-white/[0.08]',
      medium: 'backdrop-blur-2xl bg-white/[0.15] dark:bg-white/[0.12] border-white/[0.12] dark:border-white/[0.12]', 
      heavy: 'backdrop-blur-3xl bg-white/[0.25] dark:bg-white/[0.20] border-white/[0.16] dark:border-white/[0.16]'
    };
    return variants[variant];
  };

  const getGlowClasses = (variant: 'light' | 'medium' | 'heavy') => {
    if (!glow) return '';
    const glows = {
      light: 'shadow-[var(--shadow-glow-sm)]',
      medium: 'shadow-[var(--shadow-glow-md)]',
      heavy: 'shadow-[var(--shadow-glow-lg)]'
    };
    return glows[variant];
  };

  // Enhanced shadow system for better 3D depth, especially in light theme
  const getThemeAwareShadows = (variant: 'light' | 'medium' | 'heavy') => {
    if (currentTheme === 'light') {
      // Strong, visible shadows for light theme to create proper 3D depth
      const lightShadows = {
        light: 'shadow-md', // 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)
        medium: 'shadow-lg', // 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)
        heavy: 'shadow-xl'   // 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)
      };
      return lightShadows[variant];
    } else {
      // Subtle shadows for dark themes - glass effect provides depth
      const darkShadows = {
        light: 'shadow-sm',
        medium: 'shadow-md',
        heavy: 'shadow-lg'
      };
      return darkShadows[variant];
    }
  };

  // Enhanced border system for light theme
  const getThemeAwareBorders = (variant: 'light' | 'medium' | 'heavy') => {
    if (currentTheme === 'light') {
      // More visible borders for light theme
      const lightBorders = {
        light: 'border-gray-200/60',
        medium: 'border-gray-300/70',
        heavy: 'border-gray-400/80'
      };
      return lightBorders[variant];
    } else {
      // Keep existing glass borders for dark themes
      return '';
    }
  };

  return (
    <motion.div
      ref={ref}
      className={cn(
        // Base glass styling with consistent rounded corners
        'relative rounded-2xl border',

        // Glass effect based on variant
        getGlassClasses(variant),

        // Theme-aware shadows for proper 3D depth
        getThemeAwareShadows(variant),

        // Theme-aware borders (enhanced for light theme)
        getThemeAwareBorders(variant),

        // Enhanced glass reflections that work on all screen sizes
        'before:absolute before:inset-0 before:rounded-2xl',
        'before:bg-gradient-to-br before:from-white/25 before:via-white/8 before:to-transparent',
        'before:opacity-70 before:pointer-events-none',

        // Additional light reflection for premium glass effect
        'after:absolute after:inset-x-0 after:top-0 after:h-px after:rounded-t-2xl',
        'after:bg-gradient-to-r after:from-transparent after:via-white/40 after:to-transparent',
        'after:pointer-events-none',

        // Conditional glow
        getGlowClasses(variant),

        // Ensure proper stacking and transitions
        'transition-all duration-300 ease-out',

        className
      )}
      style={style}
      whileHover={hover ? {
        scale: 1.02,
        y: -4,
        boxShadow: currentTheme === 'light' 
          ? "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 10px 20px rgba(0, 0, 0, 0.1)"
          : undefined,
        transition: {
          type: "spring",
          stiffness: 400,
          damping: 25,
          duration: 0.2
        }
      } : undefined}
      whileTap={hover ? { scale: 0.99 } : undefined}
      {...props}
    >
      <div className="relative z-10 h-full min-h-0 flex flex-col">
        {children}
      </div>
    </motion.div>
  );
});

ThemedGlassSurface.displayName = 'ThemedGlassSurface';
