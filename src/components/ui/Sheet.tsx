import React, { useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '../../lib/useMediaQuery';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';
  sideOnDesktop?: 'center' | 'left' | 'right';
  showCloseButton?: boolean;
}

export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'md',
  sideOnDesktop = 'center',
  showCloseButton = true
}) => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [dragY, setDragY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const startYRef = useRef<number>(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on ESC key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // Prevent background scrolling when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // Touch / Pointer drag handling for mobile sheet
  const handleTouchStart = (e: React.TouchEvent | React.PointerEvent) => {
    if (isDesktop) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startYRef.current = clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent | React.PointerEvent) => {
    if (!isDragging || isDesktop) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startYRef.current;
    if (deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || isDesktop) return;
    setIsDragging(false);
    const sheetHeight = sheetRef.current?.offsetHeight || 300;
    if (dragY > sheetHeight * 0.3) {
      onClose();
    }
    setDragY(0);
  };

  const maxWidthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl'
  };

  return (
    <div
      className="fixed inset-0 z-[5000] flex items-end justify-center sm:items-center p-0 sm:p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Content Panel */}
      {isDesktop ? (
        /* Desktop Modal or Side Drawer */
        <div
          ref={sheetRef}
          className={`relative z-10 w-full ${maxWidthClasses[maxWidth]} bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] border border-[var(--color-hairline)] overflow-hidden animate-modal-in flex flex-col max-h-[90vh] ${
            sideOnDesktop === 'left' ? 'sm:mr-auto sm:ml-0' : sideOnDesktop === 'right' ? 'sm:ml-auto sm:mr-0' : ''
          }`}
        >
          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--color-hairline)] shrink-0">
              {title && typeof title === 'string' ? (
                <h2 className="text-lg font-bold text-[var(--color-ink)] font-public-sans tracking-tight">
                  {title}
                </h2>
              ) : (
                title
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer ml-auto"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="p-6 overflow-y-auto scrollbar-thin">
            {children}
          </div>
        </div>
      ) : (
        /* Mobile Bottom Sheet */
        <div
          ref={sheetRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onPointerDown={handleTouchStart}
          onPointerMove={handleTouchMove}
          onPointerUp={handleTouchEnd}
          style={{
            transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
            transition: isDragging ? 'none' : undefined
          }}
          className="relative z-10 w-full bg-[var(--color-surface)] rounded-t-[var(--radius-xl)] shadow-[var(--shadow-lg)] border-t border-[var(--color-hairline)] overflow-hidden animate-sheet-up flex flex-col max-h-[85vh]"
        >
          {/* Grabber Bar */}
          <div className="w-full pt-3 pb-2 flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0">
            <div className="w-9 h-1.5 rounded-full bg-[var(--color-ink-tertiary)] opacity-30" />
          </div>

          {/* Header */}
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-hairline)] shrink-0">
              {title && typeof title === 'string' ? (
                <h2 className="text-base font-bold text-[var(--color-ink)] font-public-sans tracking-tight">
                  {title}
                </h2>
              ) : (
                title
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer ml-auto"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {/* Body */}
          <div className="p-5 overflow-y-auto scrollbar-thin max-h-[75vh]">
            {children}
          </div>
        </div>
      )}
    </div>
  );
};
