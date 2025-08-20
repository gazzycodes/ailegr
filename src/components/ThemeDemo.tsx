import { motion } from 'framer-motion';
import { DollarSign, TrendingUp, TrendingDown, PiggyBank, Palette } from 'lucide-react';
import { ThemedGlassSurface } from './themed/ThemedGlassSurface';
import { ThemedButton } from './themed/ThemedButton';
import { ThemeSwitcher } from './ThemeSwitcher';
import { useTheme, useThemeStyles } from '../theme/ThemeProvider';
import { formatCurrency } from '../lib/utils';

export const ThemeDemo = () => {
  const { currentTheme } = useTheme();
  useThemeStyles();

  // Sample financial data
  const metrics = {
    revenue: 125000,
    expenses: 85000,
    profit: 40000,
    assets: 250000
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 25 }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[rgb(var(--color-neutral-900))] via-[rgb(var(--color-neutral-800))] to-[rgb(var(--color-neutral-900))] p-6">
      <motion.div
        className="max-w-7xl mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {/* Header with Theme Switcher */}
        <motion.div 
          variants={itemVariants} 
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-4xl font-[var(--font-weight-bold)] text-[rgb(var(--color-neutral-100))] mb-2">
              Universal Theme System Demo
            </h1>
            <p className="text-[rgb(var(--color-neutral-400))]">
              Current theme: <span className="text-[rgb(var(--color-primary-400))] font-[var(--font-weight-medium)]">{currentTheme}</span>
            </p>
          </div>
          
          <ThemeSwitcher />
        </motion.div>

        {/* Theme Information Card */}
        <motion.div variants={itemVariants} className="mb-8">
          <ThemedGlassSurface className="p-6">
            <div className="flex items-center space-x-4 mb-4">
              <div className="p-3 rounded-[var(--radius-xl)] bg-[rgb(var(--color-primary-500))]/20">
                <Palette className="w-6 h-6 text-[rgb(var(--color-primary-400))]" />
              </div>
              <div>
                <h2 className="text-xl font-[var(--font-weight-semibold)] text-[rgb(var(--color-neutral-100))]">
                  Theme System Features
                </h2>
                <p className="text-[rgb(var(--color-neutral-400))]">
                  🔁 Reusable • 🌗 Dynamic • 🧩 Extendable • ⚡ Performant
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 rounded-[var(--radius-lg)] bg-[rgb(var(--color-success-500))]/10 border border-[rgb(var(--color-success-500))]/20">
                <h3 className="font-[var(--font-weight-medium)] text-financial-revenue mb-2">CSS Variables</h3>
                <p className="text-sm text-[rgb(var(--color-neutral-300))]">Zero React re-renders during theme switch</p>
              </div>
              <div className="p-4 rounded-[var(--radius-lg)] bg-[rgb(var(--color-primary-500))]/10 border border-[rgb(var(--color-primary-500))]/20">
                <h3 className="font-[var(--font-weight-medium)] text-[rgb(var(--color-primary-400))] mb-2">Runtime Switching</h3>
                <p className="text-sm text-[rgb(var(--color-neutral-300))]">Instant theme changes with smooth transitions</p>
              </div>
              <div className="p-4 rounded-[var(--radius-lg)] bg-[rgb(var(--color-warning-500))]/10 border border-[rgb(var(--color-warning-500))]/20">
                <h3 className="font-[var(--font-weight-medium)] text-financial-liability mb-2">Extensible</h3>
                <p className="text-sm text-[hsl(var(--color-neutral-300))]">Add new themes without touching existing code</p>
              </div>
              <div className="p-4 rounded-[var(--radius-lg)] bg-[rgb(var(--color-secondary-500))]/10 border border-[rgb(var(--color-secondary-500))]/20">
                <h3 className="font-[var(--font-weight-medium)] text-[rgb(var(--color-secondary-400))] mb-2">TypeScript</h3>
                <p className="text-sm text-[hsl(var(--color-neutral-300))]">Full type safety for theme tokens</p>
              </div>
            </div>
          </ThemedGlassSurface>
        </motion.div>

        {/* Sample Financial Cards */}
        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
          variants={containerVariants}
        >
          {/* Revenue Card */}
          <motion.div variants={itemVariants}>
            <ThemedGlassSurface className="p-6" glow>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-[var(--radius-lg)] bg-financial-revenue/20">
                    <DollarSign className="w-6 h-6 text-financial-revenue" />
                  </div>
                  <div>
                    <p className="text-sm text-[rgb(var(--color-neutral-400))]">Revenue</p>
                    <p className="text-2xl font-[var(--font-weight-bold)] text-[rgb(var(--color-neutral-100))]">
                      {formatCurrency(metrics.revenue)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-financial-revenue" />
                <span className="text-sm text-financial-revenue">+15% from last month</span>
              </div>
            </ThemedGlassSurface>
          </motion.div>

          {/* Expenses Card */}
          <motion.div variants={itemVariants}>
            <ThemedGlassSurface className="p-6" glow>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-[var(--radius-lg)] bg-financial-expense/20">
                    <TrendingDown className="w-6 h-6 text-financial-expense" />
                  </div>
                  <div>
                    <p className="text-sm text-[hsl(var(--color-neutral-400))]">Expenses</p>
                    <p className="text-2xl font-[var(--font-weight-bold)] text-[hsl(var(--color-neutral-100))]">
                      {formatCurrency(metrics.expenses)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingDown className="w-4 h-4 text-financial-expense" />
                <span className="text-sm text-financial-expense">+8% from last month</span>
              </div>
            </ThemedGlassSurface>
          </motion.div>

          {/* Profit Card */}
          <motion.div variants={itemVariants}>
            <ThemedGlassSurface className="p-6 bg-gradient-to-br from-[rgb(var(--color-success-500))]/10 to-[rgb(var(--color-primary-500))]/10" glow>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-[var(--radius-lg)] bg-financial-profit/20">
                    <TrendingUp className="w-6 h-6 text-financial-profit" />
                  </div>
                  <div>
                    <p className="text-sm text-[rgb(var(--color-neutral-400))]">Net Profit</p>
                    <p className="text-2xl font-[var(--font-weight-bold)] text-[rgb(var(--color-neutral-100))]">
                      {formatCurrency(metrics.profit)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-financial-profit" />
                <span className="text-sm text-financial-profit">+32% from last month</span>
              </div>
            </ThemedGlassSurface>
          </motion.div>

          {/* Assets Card */}
          <motion.div variants={itemVariants}>
            <ThemedGlassSurface className="p-6" glow>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-[var(--radius-lg)] bg-financial-asset/20">
                    <PiggyBank className="w-6 h-6 text-financial-asset" />
                  </div>
                  <div>
                    <p className="text-sm text-[rgb(var(--color-neutral-400))]">Total Assets</p>
                    <p className="text-2xl font-[var(--font-weight-bold)] text-[rgb(var(--color-neutral-100))]">
                      {formatCurrency(metrics.assets)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-financial-asset" />
                <span className="text-sm text-financial-asset">+12% from last month</span>
              </div>
            </ThemedGlassSurface>
          </motion.div>
        </motion.div>

        {/* Button Showcase */}
        <motion.div variants={itemVariants}>
          <ThemedGlassSurface className="p-6">
            <h2 className="text-xl font-[var(--font-weight-semibold)] text-[rgb(var(--color-neutral-100))] mb-4">
              Themed Components Showcase
            </h2>
            <div className="flex flex-wrap gap-4">
              <ThemedButton variant="primary">
                Primary Button
              </ThemedButton>
              <ThemedButton variant="secondary">
                Secondary Button
              </ThemedButton>
              <ThemedButton variant="success">
                Success Button
              </ThemedButton>
              <ThemedButton variant="error">
                Error Button
              </ThemedButton>
              <ThemedButton variant="warning">
                Warning Button
              </ThemedButton>
              <ThemedButton variant="ghost">
                Ghost Button
              </ThemedButton>
            </div>
            
            <div className="mt-4 flex flex-wrap gap-4">
              <ThemedButton variant="primary" size="sm">
                Small
              </ThemedButton>
              <ThemedButton variant="primary" size="md">
                Medium
              </ThemedButton>
              <ThemedButton variant="primary" size="lg">
                Large
              </ThemedButton>
              <ThemedButton variant="primary" loading>
                Loading...
              </ThemedButton>
              <ThemedButton variant="primary" disabled>
                Disabled
              </ThemedButton>
            </div>
          </ThemedGlassSurface>
        </motion.div>
      </motion.div>
    </div>
  );
};
