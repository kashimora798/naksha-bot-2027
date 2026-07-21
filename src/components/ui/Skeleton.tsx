import React, { HTMLAttributes } from 'react';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'card';
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'text',
  width,
  height,
  className = '',
  style,
  ...props
}) => {
  const baseStyles = 'animate-pulse bg-[var(--color-surface-2)] rounded-[var(--radius-sm)] shrink-0';

  const variantStyles = {
    text: 'h-4 w-full rounded-[var(--radius-sm)]',
    circular: 'rounded-full',
    rectangular: 'rounded-[var(--radius-md)]',
    card: 'rounded-[var(--radius-lg)] p-5 border border-[var(--color-hairline)]'
  };

  const inlineStyles: React.CSSProperties = {
    width: width,
    height: height,
    ...style
  };

  if (variant === 'card') {
    return (
      <div className={`${variantStyles.card} ${baseStyles} ${className}`.trim()} style={inlineStyles} {...props}>
        <div className="flex items-center justify-between mb-4">
          <div className="h-4 w-1/3 bg-slate-200/80 rounded" />
          <div className="h-6 w-16 bg-slate-200/80 rounded-full" />
        </div>
        <div className="h-6 w-2/3 bg-slate-200/80 rounded mb-2" />
        <div className="h-3 w-1/2 bg-slate-200/80 rounded" />
      </div>
    );
  }

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${className}`.trim()}
      style={inlineStyles}
      {...props}
    />
  );
};
