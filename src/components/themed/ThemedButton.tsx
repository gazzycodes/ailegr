import { motion } from 'framer-motion';
import { ReactNode, forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { useTheme } from '../../theme/ThemeProvider';

interface ThemedButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  |
    'type'
  |
    'onAnimationStart'
  |
    'onAnimationEnd'
  |
    'onAnimationIteration'
  |
    'onDragStart'
  |
    'onDragEnd'
  |
    'onDrag'
> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success' | 'error' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const ThemedButton = forwardRef<HTMLButtonElement, ThemedButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  className,
  disabled = false,
  loading = false,
  leftIcon,
  rightIcon,
  onClick,
  ...props
}, ref) => {
  useTheme();

  const getSizeClasses = (size: 'sm' | 'md' | 'lg') => {
    const sizes = {
      sm: 'px-[var(--spacing-3)] py-[var(--spacing-2)] text-[var(--font-size-sm)] gap-[var(--spacing-2)]',
      md: 'px-[var(--spacing-4)] py-[var(--spacing-3)] text-[var(--font-size-base)] gap-[var(--spacing-2)]',
      lg: 'px-[var(--spacing-6)] py-[var(--spacing-4)] text-[var(--font-size-lg)] gap-[var(--spacing-3)]'
    };
    return sizes[size];
  };

  const getVariantClasses = (variant: string) => {
    const variants = {
      primary: cn(
        'bg-gradient-to-r from-[rgb(var(--color-primary-500))] to-[rgb(var(--color-primary-600))]',
        'text-white font-[var(--font-weight-medium)]',
        'shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
        'border-0',
        'hover:from-[rgb(var(--color-primary-600))] hover:to-[rgb(var(--color-primary-700))]'
      ),
      secondary: cn(
        'backdrop-blur-[var(--glass-blur-lg)] bg-white/[var(--glass-opacity-medium)]',
        'border border-[var(--glass-border-medium)]',
        'text-[rgb(var(--color-neutral-900))] dark:text-[rgb(var(--color-neutral-100))]',
        'hover:bg-white/[var(--glass-opacity-heavy)]',
        'font-[var(--font-weight-medium)]'
      ),
      ghost: cn(
        'bg-transparent',
        'text-[rgb(var(--color-neutral-700))] dark:text-[rgb(var(--color-neutral-300))]',
        'hover:bg-[rgb(var(--color-neutral-100))] dark:hover:bg-[rgb(var(--color-neutral-800))]',
        'border border-transparent hover:border-[var(--glass-border-light)]'
      ),
      success: cn(
        'bg-gradient-to-r from-[rgb(var(--color-success-500))] to-[rgb(var(--color-success-600))]',
        'text-white font-[var(--font-weight-medium)]',
        'shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
        'border border-[rgb(var(--color-success-400))]/20'
      ),
      error: cn(
        'bg-gradient-to-r from-[rgb(var(--color-error-500))] to-[rgb(var(--color-error-600))]',
        'text-white font-[var(--font-weight-medium)]',
        'shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
        'border border-[rgb(var(--color-error-400))]/20'
      ),
      warning: cn(
        'bg-gradient-to-r from-[rgb(var(--color-warning-500))] to-[rgb(var(--color-warning-600))]',
        'text-white font-[var(--font-weight-medium)]',
        'shadow-[var(--shadow-md)] hover:shadow-[var(--shadow-lg)]',
        'border border-[rgb(var(--color-warning-400))]/20'
      )
    };
    return variants[variant as keyof typeof variants] || variants.primary;
  };

  const isDisabled = disabled || loading;

  return (
    <motion.button
      ref={ref}
      className={cn(
        // Base styles using CSS custom properties
        'relative inline-flex items-center justify-center',
        'rounded-[var(--radius-lg)]',
        'font-[var(--font-weight-medium)]',
        'transition-all duration-[var(--animation-duration-normal)]',
        'focus:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        
        // Size classes
        getSizeClasses(size),
        
        // Variant classes
        getVariantClasses(variant),
        
        className
      )}
      disabled={isDisabled}
      onClick={onClick as any}
      whileHover={!isDisabled ? { 
        scale: 1.02,
        transition: { 
          duration: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--animation-duration-fast').replace('ms', '')) / 1000
        }
      } : undefined}
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      {...props}
    >
      {/* Loading Spinner */}
      {loading && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
        >
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        </motion.div>
      )}
      
      {/* Button Content */}
      <div className={cn('flex items-center justify-center', loading && 'opacity-0')}>
        {leftIcon && (
          <span className="flex-shrink-0">
            {leftIcon}
          </span>
        )}
        
        <span className="flex-1">
          {children}
        </span>
        
        {rightIcon && (
          <span className="flex-shrink-0">
            {rightIcon}
          </span>
        )}
      </div>
    </motion.button>
  );
});

ThemedButton.displayName = 'ThemedButton';
