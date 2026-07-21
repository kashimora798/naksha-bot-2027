import React, { HTMLAttributes } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'neutral' | 'accent';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  dot?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'md',
  icon,
  dot = false,
  children,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center rounded-[var(--radius-full)] font-medium select-none shrink-0';

  const sizeStyles = {
    sm: 'text-[11px] leading-none px-2 py-1 gap-1',
    md: 'text-xs leading-none px-2.5 py-1.5 gap-1.5'
  };

  const variantStyles = {
    success: 'bg-emerald-50 text-[var(--color-success)] border border-emerald-200/60',
    warning: 'bg-amber-50 text-[var(--color-warning)] border border-amber-200/60',
    danger: 'bg-rose-50 text-[var(--color-danger)] border border-rose-200/60',
    neutral: 'bg-[var(--color-surface-2)] text-[var(--color-ink-secondary)] border border-[var(--color-hairline)]',
    accent: 'bg-[var(--color-accent-tint)] text-[var(--color-accent)] border border-indigo-200/60'
  };

  const dotColorMap = {
    success: 'bg-[var(--color-success)]',
    warning: 'bg-[var(--color-warning)]',
    danger: 'bg-[var(--color-danger)]',
    neutral: 'bg-[var(--color-ink-tertiary)]',
    accent: 'bg-[var(--color-accent)]'
  };

  return (
    <span
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`.trim()}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotColorMap[variant]} shrink-0`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      {children && <span>{children}</span>}
    </span>
  );
};
