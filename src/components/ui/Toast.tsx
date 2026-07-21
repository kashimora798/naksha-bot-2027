import React, { useEffect } from 'react';

export interface ToastProps {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error';
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  visible,
  onDismiss,
  duration = 3000
}) => {
  useEffect(() => {
    if (!visible) return;

    const timer = setTimeout(() => {
      onDismiss();
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;

  const typeStyles = {
    info: 'bg-[var(--color-ink)] text-white',
    success: 'bg-[var(--color-success)] text-white',
    warning: 'bg-[var(--color-warning)] text-white',
    error: 'bg-[var(--color-danger)] text-white'
  };

  return (
    <div className="fixed z-[9999] bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 pointer-events-none animate-fade-in px-4 py-2.5 rounded-[var(--radius-full)] shadow-[var(--shadow-lg)] flex items-center gap-2.5 max-w-[90vw]">
      <div className={`px-4 py-2 rounded-full text-xs font-medium tracking-wide ${typeStyles[type]} shadow-md`}>
        {message}
      </div>
    </div>
  );
};
