import React, { InputHTMLAttributes, forwardRef } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  icon,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-[var(--color-ink-secondary)]">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {icon && (
          <div className="absolute left-3.5 text-[var(--color-ink-tertiary)] pointer-events-none shrink-0">
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={`w-full min-h-[44px] h-11 ${icon ? 'pl-10' : 'px-3.5'} pr-3.5 bg-[var(--color-surface)] border ${error ? 'border-[var(--color-danger)]' : 'border-[var(--color-hairline)]'} rounded-[var(--radius-md)] text-sm text-[var(--color-ink)] placeholder:[var(--color-ink-tertiary)] shadow-[var(--shadow-sm)] transition-all focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent disabled:bg-[var(--color-surface-2)] disabled:opacity-60 ${className}`.trim()}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-[var(--color-danger)]">{error}</span>}
      {!error && helperText && <span className="text-xs text-[var(--color-ink-secondary)]">{helperText}</span>}
    </div>
  );
});

Input.displayName = 'Input';
