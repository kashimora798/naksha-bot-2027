import { useState, useEffect } from 'react';
import { Button } from './ui/Button';

interface Props {
  step: number; // 3 to 6 (boundary, roads, buildings, numbering)
  onSkip: () => void;
  onNext?: () => void;        // advance to the next tour stage (real step change)
  onAction?: () => void;      // optional in-step action (toggle blocks, auto-number…)
  actionLabel?: string;       // label for onAction button
  nextLabel?: string;         // label for the primary "next" button
  status?: string;            // live status line (e.g. "Fetching roads…")
  busy?: boolean;             // disables the next button while a real fetch runs
}

const STAGE: Record<number, { n: number; tag: string; title: string; body: string }> = {
  3: { n: 2, tag: 'Boundary', title: 'Your block boundary', body: 'For this demo NakshaBot placed a sample block (the red outline). In the real app you tap each corner to draw your own.' },
  4: { n: 3, tag: 'Roads', title: 'Roads, fetched automatically', body: 'Every road inside your block is pulled from OpenStreetMap — no tracing. You can also tap “Draw Road” below to add or fix a lane by hand.' },
  5: { n: 4, tag: 'Buildings', title: 'Buildings, detected automatically', body: 'All houses are auto-detected. Tap any to edit or delete, and use “Show blocks” to group them into A, B, C…' },
  6: { n: 5, tag: 'Numbering', title: 'Auto-number in survey order', body: 'NakshaBot numbers houses along a serpentine path — the order an enumerator walks. Number them, then preview & print.' },
};

export default function GuidedTour({ step, onSkip, onNext, onAction, actionLabel, nextLabel, status, busy }: Props) {
  const stage = STAGE[step];
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(true); }, [step]);

  if (!stage) return null;

  return (
    <div className="absolute top-12 left-2 right-14 z-[2000] pointer-events-none animate-fade-in">
      <div className="max-w-md mx-auto bg-[var(--color-surface)]/95 backdrop-blur-md rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] border border-[var(--color-hairline)] pointer-events-auto overflow-hidden">
        {/* Always-visible compact header row */}
        <div className="flex items-center gap-2 px-3.5 py-2.5">
          <span className="shrink-0 text-xs font-bold text-white bg-[var(--color-accent)] rounded-full w-5 h-5 flex items-center justify-center font-jetbrains-mono">
            {stage.n}
          </span>
          <button onClick={() => setExpanded(e => !e)} className="flex-1 min-w-0 text-left cursor-pointer">
            <span className="block text-sm font-bold text-[var(--color-ink)] font-public-sans leading-tight truncate">
              {stage.title}
            </span>
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 text-[var(--color-ink-tertiary)] hover:text-[var(--color-ink)] w-7 h-7 flex items-center justify-center rounded-[var(--radius-sm)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <span className={`inline-block transition-transform duration-[var(--duration-fast)] ${expanded ? 'rotate-180' : ''}`}>
              ⌄
            </span>
          </button>
          <button 
            onClick={onSkip} 
            className="shrink-0 text-[11px] font-bold text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] bg-[var(--color-surface-2)] hover:bg-slate-200 rounded-full px-2.5 py-1 cursor-pointer transition-colors"
          >
            Skip
          </button>
        </div>

        {/* Collapsible details */}
        {expanded && (
          <div className="px-3.5 pb-3 max-h-[34vh] overflow-y-auto scrollbar-thin">
            <p className="text-xs text-[var(--color-ink-secondary)] leading-relaxed">{stage.body}</p>
            {status && (
              <div className="mt-2 flex items-center gap-2 bg-[var(--color-accent-tint)] rounded-[var(--radius-sm)] px-2.5 py-1.5">
                {busy && (
                  <svg className="animate-spin h-3 w-3 text-[var(--color-accent)] shrink-0" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="text-[11px] font-semibold text-[var(--color-accent)]">{status}</span>
              </div>
            )}
          </div>
        )}

        {/* Always-visible action row */}
        <div className="flex gap-2 px-3.5 pb-3">
          {onAction && actionLabel && (
            <Button
              onClick={onAction}
              variant="tinted"
              size="sm"
              className="flex-1 text-xs font-bold"
            >
              {actionLabel}
            </Button>
          )}
          {onNext && (
            <Button
              onClick={onNext}
              disabled={busy}
              variant="filled"
              size="sm"
              className="flex-1 text-xs font-bold"
            >
              {nextLabel || 'Next →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
