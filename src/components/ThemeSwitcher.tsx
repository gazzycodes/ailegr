import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon, Palette, Check, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTheme } from '../theme/ThemeProvider';
//
import { ThemedGlassSurface } from './themed/ThemedGlassSurface';
import { cn } from '../lib/utils';

export const ThemeSwitcher = () => {
  const { currentTheme, setTheme, toggleTheme, isDark, availableThemes } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

  const getThemeIcon = (themeName: string) => {
    switch (themeName) {
      case 'light': return Sun;
      case 'dark': return Moon;
      default: return Palette;
    }
  };

  const getThemeLabel = (themeName: string) => {
    const labels = {
      light: 'Light Mode',
      dark: 'Dark Mode', 
      blue: 'Corporate Blue',
      green: 'Finance Green'
    };
    return labels[themeName as keyof typeof labels] || themeName;
  };

  const getThemeColor = (themeName: string) => {
    const colors = {
      light: 'text-blue-500',
      dark: 'text-blue-400',
      blue: 'text-blue-500',
      green: 'text-emerald-500'
    };
    return colors[themeName as keyof typeof colors] || 'text-purple-500';
  };

  const quickToggle = () => {
    if (isExpanded) {
      setIsExpanded(false);
    } else {
      toggleTheme();
    }
  };

  const handleThemeSelect = (themeName: string) => {
    setTheme(themeName as any);
    setIsExpanded(false);
  };

  const CurrentIcon = getThemeIcon(currentTheme);

  return (
    <div className="relative">
      {/* Main Theme Button */}
      <motion.div
        className="flex items-center"
        layout
      >
        {/* Quick Toggle Button */}
        <motion.button
          className={cn(
            'relative flex items-center gap-2 p-3 rounded-xl',
            'bg-surface/80 backdrop-blur-md border border-border/50',
            'text-foreground hover:text-primary',
            'hover:bg-surface/90 hover:border-border/70',
            'transition-all duration-200',
            // Enhanced shadows for light theme
            currentTheme === 'light' && 'shadow-lg hover:shadow-xl border-gray-300/60',
            currentTheme !== 'light' && 'shadow-md hover:shadow-lg'
          )}
          onClick={quickToggle}
          whileHover={{
            scale: 1.02,
            y: -1,
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)"
          }}
          whileTap={{ scale: 0.98 }}
          layout
        >
          <motion.div
            animate={{ rotate: isDark ? 180 : 0 }}
            transition={{ 
              duration: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--animation-duration-slow').replace('ms', '')) / 1000,
              ease: [0.4, 0, 0.2, 1]
            }}
          >
            <CurrentIcon className={cn('w-5 h-5', getThemeColor(currentTheme))} />
          </motion.div>
          
          {/* Theme Name (shown when expanded) */}
          <AnimatePresence>
            {isExpanded && (
              <motion.span
                className="text-sm font-medium whitespace-nowrap"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
              >
                {getThemeLabel(currentTheme)}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* Expand Button */}
        <motion.button
          className={cn(
            'p-2 rounded-lg ml-1',
            'text-slate-600 dark:text-slate-400',
            'hover:text-slate-800 dark:hover:text-slate-200',
            'hover:bg-white/[var(--glass-opacity-light)]',
            'transition-all duration-[var(--animation-duration-normal)]'
          )}
          onClick={() => setIsExpanded(!isExpanded)}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-4 h-4" />
          </motion.div>
        </motion.button>
      </motion.div>

      {/* Expanded Theme Selector */}
      <AnimatePresence>
        {isExpanded && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsExpanded(false)}
            />
            
            {/* Theme Options */}
            <motion.div
              className="absolute top-full right-0 mt-2 z-50"
              initial={{ opacity: 0, scale: 0.9, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -10 }}
              transition={{ 
                duration: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--animation-duration-normal').replace('ms', '')) / 1000,
                ease: [0.4, 0, 0.2, 1]
              }}
            >
              <ThemedGlassSurface 
                className="p-2 min-w-[200px] backdrop-blur-3xl shadow-2xl" 
                variant="heavy"
                glow={true}
              >
                <div className="space-y-1">
                  <div className="px-3 py-2 text-sm font-medium text-muted-contrast">
                    Choose Theme
                  </div>

                  {availableThemes.map((themeName) => {
                    const Icon = getThemeIcon(themeName);
                    const isSelected = currentTheme === themeName;
                    const colorClass = getThemeColor(themeName);

                    return (
                      <motion.button
                        key={themeName}
                        className={cn(
                          'w-full flex items-center space-x-3 px-3 py-2 rounded-lg',
                          'text-left transition-all duration-200',
                          isSelected
                            ? 'bg-primary/20 text-primary border border-primary/30'
                            : 'hover:bg-surface/50 text-foreground hover:text-primary'
                        )}
                        onClick={() => handleThemeSelect(themeName)}
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                        layout
                      >
                        <Icon className={cn('w-4 h-4 flex-shrink-0', isSelected ? 'text-primary' : colorClass)} />
                        <span className="flex-1 text-sm font-medium">
                          {getThemeLabel(themeName)}
                        </span>
                        
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Check className="w-4 h-4 text-emerald-500" />
                          </motion.div>
                        )}
                      </motion.button>
                    );
                  })}
                </div>
                
                {/* Quick Actions */}
                <div className="mt-2 pt-2 border-t border-white/10 dark:border-white/10">
                  <button
                    className={cn(
                      'w-full px-3 py-2 text-sm',
                      'text-neutral-400 dark:text-neutral-300',
                      'hover:text-neutral-600 dark:hover:text-white',
                      'transition-all duration-200',
                      'rounded-md hover:bg-white/5 dark:hover:bg-white/10'
                    )}
                    onClick={() => setIsExpanded(false)}
                  >
                    Close
                  </button>
                </div>
              </ThemedGlassSurface>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
