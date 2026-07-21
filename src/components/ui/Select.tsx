import React, { SelectHTMLAttributes, forwardRef } from 'react';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  helperText,
  children,
  className = '',
  id,
  ...props
}, ref) => {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-xs font-semibold text-[var(--color-ink-secondary)]">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={selectId}
        className={`w-full min-h-[44px] h-11 px-3.5 bg-[var(--color-surface)] border ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-hairline)]'} rounded-[var(--radius-md)] text-sm text-[var(--color-ink)] shadow-[var(--shadow-sm)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent cursor-pointer disabled:bg-[var(--color-surface-2)] disabled:opacity-60 ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      {!error && helperText && <span className="text-xs text-[var(--color-ink-secondary)]">{helperText}</span>}
    </div>
  );
});

Select.displayName = 'Select';
