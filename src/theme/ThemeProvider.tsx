import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { themes, type ThemeName, type ThemeConfig } from './themes';

// Theme Context Type
interface ThemeContextType {
  currentTheme: ThemeName;
  themeConfig: ThemeConfig;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  isDark: boolean;
  availableThemes: ThemeName[];
}

// Create Context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Theme Provider Props
interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: ThemeName;
  enableTransitions?: boolean;
  storageKey?: string;
}

// High-Performance Theme Provider
export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultTheme = 'light',
  enableTransitions = true,
  storageKey = 'eze-ledger-theme'
}) => {
  // State for current theme
  const [currentTheme, setCurrentTheme] = useState<ThemeName>(() => {
    const stored = typeof window !== 'undefined' ? (localStorage.getItem(storageKey) as ThemeName | null) : null;
    return stored && themes[stored] ? stored : defaultTheme;
  });

  // Memoized theme config to prevent unnecessary rerenders
  const themeConfig = useMemo(() => themes[currentTheme], [currentTheme]);
  
  // Memoized dark mode check
  const isDark = useMemo(() => themeConfig.type === 'dark', [themeConfig.type]);
  
  // Memoized available themes list
  const availableThemes = useMemo(() => Object.keys(themes) as ThemeName[], []);

  // Apply CSS custom properties to document root
  const firstApplyDoneRef = useRef(false);

  const applyTheme = useCallback((theme: ThemeConfig) => {
    const root = document.documentElement;
    
    // Add transition class for smooth theme switching (skip on first mount to avoid flicker)
    if (enableTransitions && firstApplyDoneRef.current) {
      root.classList.add('theme-transitioning');
    }

    // Apply all CSS custom properties
    Object.entries(theme.cssVariables).forEach(([property, value]) => {
      root.style.setProperty(property, value);
    });

    // Mark that initial apply happened and remove transition class after animation completes
    if (!firstApplyDoneRef.current) {
      firstApplyDoneRef.current = true;
    }
    if (enableTransitions && root.classList.contains('theme-transitioning')) {
      setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 300);
    }
  }, [enableTransitions]);

  // Theme setter with persistence
  const setTheme = useCallback((theme: ThemeName) => {
    setCurrentTheme(theme);
    localStorage.setItem(storageKey, theme);
  }, [storageKey]);

  // Toggle between light and dark (smart toggle)
  const toggleTheme = useCallback(() => {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  }, [currentTheme, setTheme]);

  // Apply theme on mount and when theme changes
  useEffect(() => {
    applyTheme(themeConfig);
    // Remove preload class once theme variables applied to avoid initial flash
    const html = document.documentElement;
    html.classList.remove('preload');
    // Mark that theme is ready so background can fade in without flashing over content
    document.documentElement.classList.add('theme-ready');
  }, [themeConfig, applyTheme]);

  // Keep html classes and color-scheme in sync with theme
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', currentTheme);
    if (themeConfig.type === 'dark') {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [currentTheme, themeConfig.type]);

  // Memoized context value to prevent unnecessary rerenders
  const contextValue = useMemo<ThemeContextType>(() => ({
    currentTheme,
    themeConfig,
    setTheme,
    toggleTheme,
    isDark,
    availableThemes
  }), [currentTheme, themeConfig, setTheme, toggleTheme, isDark, availableThemes]);

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
};

// Custom hook for using theme context
export const useTheme = (): ThemeContextType => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

// Hook for getting specific theme values
export const useThemeValue = <T extends string>(cssVariable: string): T => {
  const value = useMemo(() => {
    if (typeof window !== 'undefined') {
      return getComputedStyle(document.documentElement)
        .getPropertyValue(cssVariable)
        .trim() as T;
    }
    return '' as T;
  }, [cssVariable]);

  return value;
};

// Hook for theme-aware styles
export const useThemeStyles = () => {
  const { isDark } = useTheme();
  
  return useMemo(() => ({
    // Convenient style utilities
    glass: {
      light: 'backdrop-blur-lg bg-white/5 border border-white/10',
      medium: 'backdrop-blur-xl bg-white/10 border border-white/20',
      heavy: 'backdrop-blur-2xl bg-white/20 border border-white/30'
    },
    text: {
      primary: isDark ? 'text-neutral-100' : 'text-neutral-900',
      secondary: isDark ? 'text-neutral-300' : 'text-neutral-700',
      muted: isDark ? 'text-neutral-500' : 'text-neutral-500'
    },
    bg: {
      primary: isDark ? 'bg-neutral-900' : 'bg-neutral-50',
      secondary: isDark ? 'bg-neutral-800' : 'bg-neutral-100',
      card: isDark ? 'bg-neutral-800/50' : 'bg-white/50'
    }
  }), [isDark]);
};
