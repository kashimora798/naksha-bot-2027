import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'plain' | 'surface' | 'tinted';
  size?: 'sm' | 'md' | 'lg';
  'aria-label': string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  variant = 'plain',
  size = 'md',
  className = '',
  disabled,
  children,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-[var(--radius-md)] transition-all duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-[0.94] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-40 disabled:pointer-events-none cursor-pointer shrink-0';

  const sizeStyles = {
    sm: 'w-8 h-8 min-w-[44px] min-h-[44px] sm:min-w-[32px] sm:min-h-[32px] text-sm',
    md: 'w-10 h-10 min-w-[44px] min-h-[44px] text-base',
    lg: 'w-12 h-12 min-w-[48px] min-h-[48px] text-lg'
  };

  const variantStyles = {
    plain: 'bg-transparent text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] active:bg-slate-200/80',
    surface: 'bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-hairline)] shadow-[var(--shadow-sm)] hover:bg-[var(--color-surface-2)]',
    tinted: 'bg-[var(--color-accent-tint)] text-[var(--color-accent)] hover:bg-indigo-100'
  };

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
});

IconButton.displayName = 'IconButton';
