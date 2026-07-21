import React from 'react';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

interface Props {
  userProfile: any;
  onSelectSaved: () => void;
  onSelectDemoKanpur: () => void;
  onSelectDemoLucknow: () => void;
  onSelectNew: () => void;
  onClose: () => void;
  type: 'map' | 'live';
}

export default function LocationSelectModal({
  userProfile,
  onSelectSaved,
  onSelectDemoKanpur,
  onSelectDemoLucknow,
  onSelectNew,
  onClose,
  type
}: Props) {
  const hasSavedHlb = userProfile && userProfile.hlb_number;
  const savedName = hasSavedHlb 
    ? `HLB ${userProfile.hlb_number} - ${userProfile.hlb_address || 'Saved Area'}` 
    : '';

  const titleText = type === 'map' ? 'Where is this map?' : 'Where are you surveying?';

  return (
    <Sheet open={true} onClose={onClose} title={titleText} maxWidth="md">
      <div className="space-y-3">
        {hasSavedHlb && (
          <button 
            onClick={onSelectSaved}
            className="w-full text-left p-4 rounded-[var(--radius-lg)] border-2 border-[var(--color-accent)] bg-[var(--color-accent-tint)] hover:bg-indigo-100/80 transition-all flex items-center gap-3.5 group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-[var(--color-accent)] font-public-sans">Your Saved HLB</p>
              <p className="text-xs text-[var(--color-ink-secondary)] font-medium">{savedName}</p>
            </div>
          </button>
        )}

        <button 
          onClick={onSelectDemoKanpur}
          className="w-full text-left p-4 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-accent)]/40 transition-all flex items-center gap-3.5 group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] group-hover:bg-indigo-50 text-[var(--color-ink-secondary)] group-hover:text-[var(--color-accent)] flex items-center justify-center shrink-0 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5m0 0h4m-4 0V11m0 0h4m-4 0H9m4 0V5" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[var(--color-ink)] font-public-sans group-hover:text-[var(--color-accent)]">Kanpur City Center</p>
            <p className="text-xs text-[var(--color-ink-secondary)]">Demo Location</p>
          </div>
        </button>

        <button 
          onClick={onSelectDemoLucknow}
          className="w-full text-left p-4 rounded-[var(--radius-lg)] border border-[var(--color-hairline)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] hover:border-[var(--color-accent)]/40 transition-all flex items-center gap-3.5 group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-full bg-[var(--color-surface-2)] group-hover:bg-emerald-50 text-[var(--color-ink-secondary)] group-hover:text-[var(--color-success)] flex items-center justify-center shrink-0 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <div>
            <p className="font-bold text-[var(--color-ink)] font-public-sans group-hover:text-[var(--color-accent)]">Lucknow Rural</p>
            <p className="text-xs text-[var(--color-ink-secondary)]">Demo Location</p>
          </div>
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-[var(--color-hairline)]">
        <Button 
          onClick={onSelectNew}
          variant="filled"
          fullWidth
          size="lg"
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          }
        >
          Start a different location
        </Button>
      </div>
    </Sheet>
  );
}
