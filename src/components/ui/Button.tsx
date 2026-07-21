import React, { ButtonHTMLAttributes, forwardRef } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tinted' | 'plain';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'filled',
  size = 'md',
  icon,
  iconPosition = 'left',
  fullWidth = false,
  children,
  className = '',
  disabled,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-[var(--duration-fast)] ease-[var(--ease-spring)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100 touch-target cursor-pointer select-none';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 rounded-[var(--radius-sm)] gap-1.5 min-h-[36px] sm:min-h-[36px]',
    md: 'text-sm px-4 py-2.5 rounded-[var(--radius-md)] gap-2 min-h-[44px]',
    lg: 'text-base px-6 py-3.5 rounded-[var(--radius-lg)] gap-2.5 min-h-[48px]'
  };

  const variantStyles = {
    filled: 'bg-[var(--color-accent)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-hover)] active:bg-[var(--color-accent-hover)]',
    tinted: 'bg-[var(--color-accent-tint)] text-[var(--color-accent)] hover:bg-indigo-100/80 active:bg-indigo-200/60',
    plain: 'bg-transparent text-[var(--color-accent)] hover:bg-[var(--color-surface-2)] active:bg-slate-200/60'
  };

  const widthStyle = fullWidth ? 'w-full' : '';

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${widthStyle} ${className}`.trim()}
      {...props}
    >
      {icon && iconPosition === 'left' && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
      {icon && iconPosition === 'right' && <span className="shrink-0">{icon}</span>}
    </button>
  );
});

Button.displayName = 'Button';
