import React, { HTMLAttributes, forwardRef } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'flat' | 'secondary' | 'interactive';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({
  variant = 'flat',
  padding = 'md',
  className = '',
  children,
  ...props
}, ref) => {
  const baseStyles = 'rounded-[var(--radius-lg)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-spring)]';

  const variantStyles = {
    flat: 'bg-[var(--color-surface)] border border-[var(--color-hairline)] shadow-[var(--shadow-sm)]',
    secondary: 'bg-[var(--color-surface-2)] border border-transparent',
    interactive: 'bg-[var(--color-surface)] border border-[var(--color-hairline)] shadow-[var(--shadow-sm)] hover:shadow-[var(--shadow-md)] hover:border-[var(--color-accent)]/30 active:scale-[0.99] cursor-pointer'
  };

  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3 sm:p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-6 sm:p-8'
  };

  return (
    <div
      ref={ref}
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
