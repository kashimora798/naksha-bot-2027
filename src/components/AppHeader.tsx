import React, { useState, useEffect } from 'react';
import { useTranslation } from '../lib/i18n';
import { Sheet } from './ui/Sheet';
import { IconButton } from './ui/IconButton';
import { Button } from './ui/Button';
import { Toast } from './ui/Toast';

const STEP_NAMES = [
  'Login',
  'SMS Parse',
  'Boundary',
  'Roads',
  'Symbols',
  'Numbering',
  'AI Map',
  'Preview',
  'Export',
];

interface Props {
  currentStep: number;
  maxStep?: number;
  setStep: (step: number) => void;
  saveStatus: 'saved' | 'saving' | 'error';
  onSaveAndExit: () => void;
  inMap: boolean;
}

export default function AppHeader({ currentStep, maxStep, setStep, saveStatus, onSaveAndExit, inMap }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();

  // Toast state to replace persistent badge
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [toastVisible, setToastVisible] = useState<boolean>(false);

  useEffect(() => {
    if (!inMap) return;
    if (saveStatus === 'saving') {
      setToastMessage('Saving progress...');
      setToastType('info');
      setToastVisible(true);
    } else if (saveStatus === 'saved') {
      setToastMessage('Changes saved');
      setToastType('success');
      setToastVisible(true);
    } else if (saveStatus === 'error') {
      setToastMessage('Failed to save changes');
      setToastType('error');
      setToastVisible(true);
    }
  }, [saveStatus, inMap]);
  
  // Reachable steps logic
  const reachable = Math.max(maxStep ?? 0, currentStep);

  const getStepName = (index: number) => {
    const name = STEP_NAMES[index];
    if (name === 'Boundary') return t('step1Title');
    if (name === 'Roads') return t('step2Title');
    if (name === 'Symbols') return t('step3Title');
    if (name === 'Numbering') return t('step5Title');
    if (name === 'Preview') return t('previewTitle');
    return name;
  };

  return (
    <>
      <header className="bg-[var(--color-surface)] border-b border-[var(--color-hairline)] px-4 py-2.5 z-[2001] relative flex items-center justify-between shadow-[var(--shadow-sm)]">
        <div className="flex items-center gap-3">
          <IconButton
            onClick={() => setMenuOpen(true)}
            aria-label="Menu"
            title="Menu"
            size="sm"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </IconButton>
          <span className="font-bold text-[var(--color-ink)] text-sm font-public-sans tracking-tight">
            {getStepName(currentStep - 1)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={onSaveAndExit} 
            variant="filled"
            size="sm"
            icon={
              inMap ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              )
            }
          >
            {inMap ? (
              <>
                <span className="hidden sm:inline">{t('saveExit')}</span>
                <span className="sm:hidden">Exit</span>
              </>
            ) : (
              <span>Exit</span>
            )}
          </Button>
        </div>
      </header>

      {/* Toast Notification replacing inline badge */}
      <Toast
        message={toastMessage}
        type={toastType}
        visible={toastVisible}
        onDismiss={() => setToastVisible(false)}
      />

      {/* Responsive Step Navigation Sheet */}
      <Sheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Map Navigation Steps"
        sideOnDesktop="left"
        maxWidth="sm"
      >
        <div className="space-y-1 py-1">
          <div className="px-2 pb-2">
            <span className="text-xs font-bold text-[var(--color-ink-tertiary)] uppercase tracking-wider">Step Machine</span>
          </div>
          {STEP_NAMES.map((name, i) => {
            const stepNum = i + 1;
            const isClickable = stepNum >= 2 && stepNum <= reachable;
            const isCurrent = currentStep === stepNum;
            
            return (
              <button
                key={name}
                disabled={!isClickable}
                onClick={() => {
                  setStep(stepNum);
                  setMenuOpen(false);
                }}
                className={`w-full text-left px-3.5 py-3 rounded-[var(--radius-md)] text-sm transition-all flex items-center justify-between cursor-pointer ${
                  isCurrent
                    ? 'bg-[var(--color-accent-tint)] text-[var(--color-accent)] font-bold'
                    : isClickable
                      ? 'text-[var(--color-ink)] hover:bg-[var(--color-surface-2)] font-medium'
                      : 'text-[var(--color-ink-tertiary)] opacity-50 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isCurrent 
                      ? 'bg-[var(--color-accent)] text-white' 
                      : isClickable 
                        ? 'bg-[var(--color-surface-2)] text-[var(--color-ink)]' 
                        : 'bg-slate-100 text-slate-400'
                  }`}>
                    {stepNum}
                  </div>
                  <span className="font-public-sans">{getStepName(i)}</span>
                </div>
                {isClickable && currentStep > stepNum && (
                  <span className="text-[var(--color-success)] text-sm font-bold">✓</span>
                )}
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
