import { useState, useEffect } from 'react';

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

// Coaching content for each map stage of the guided tour. Compact by design so
// it never covers the map on a phone — details collapse behind a tap.
const STAGE: Record<number, { n: number; tag: string; title: string; body: string }> = {
  3: { n: 2, tag: 'Boundary', title: 'Your block boundary', body: 'For this demo NakshaBot placed a sample block (the red outline). In the real app you tap each corner to draw your own.' },
  4: { n: 3, tag: 'Roads', title: 'Roads, fetched automatically', body: 'Every road inside your block is pulled from OpenStreetMap — no tracing. You can also tap “Draw Road” below to add or fix a lane by hand.' },
  5: { n: 4, tag: 'Buildings', title: 'Buildings, detected automatically', body: 'All houses are auto-detected. Tap any to edit or delete, and use “Show blocks” to group them into A, B, C…' },
  6: { n: 5, tag: 'Numbering', title: 'Auto-number in survey order', body: 'NakshaBot numbers houses along a serpentine path — the order an enumerator walks. Number them, then preview & print.' },
};

export default function GuidedTour({ step, onSkip, onNext, onAction, actionLabel, nextLabel, status, busy }: Props) {
  const stage = STAGE[step];
  // Start expanded on each new stage so first-timers read it, then they can collapse.
  const [expanded, setExpanded] = useState(true);
  useEffect(() => { setExpanded(true); }, [step]);

  if (!stage) return null;

  return (
    <div className="absolute top-12 left-2 right-14 z-[2000] pointer-events-none animate-in slide-in-from-top-2 fade-in duration-300">
      <div className="max-w-md mx-auto bg-white/97 backdrop-blur rounded-2xl shadow-xl border border-orange-100 pointer-events-auto overflow-hidden">
        {/* Always-visible compact header row */}
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="shrink-0 text-[10px] font-black text-white bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center">{stage.n}</span>
          <button onClick={() => setExpanded(e => !e)} className="flex-1 min-w-0 text-left">
            <span className="block text-sm font-bold text-slate-800 font-[Baloo_2] leading-tight truncate">{stage.title}</span>
          </button>
          <button
            onClick={() => setExpanded(e => !e)}
            className="shrink-0 text-slate-400 hover:text-slate-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <span className={`inline-block transition-transform ${expanded ? 'rotate-180' : ''}`}>⌄</span>
          </button>
          <button onClick={onSkip} className="shrink-0 text-[11px] font-bold text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full px-2 py-1">Skip</button>
        </div>

        {/* Collapsible details — capped height + scrollable so it never traps content */}
        {expanded && (
          <div className="px-3 pb-3 max-h-[34vh] overflow-y-auto">
            <p className="text-xs text-slate-600 leading-relaxed">{stage.body}</p>
            {status && (
              <div className="mt-2 flex items-center gap-2 bg-blue-50 rounded-lg px-2.5 py-1.5">
                {busy && (
                  <svg className="animate-spin h-3 w-3 text-blue-500 shrink-0" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="text-[11px] font-semibold text-blue-700">{status}</span>
              </div>
            )}
          </div>
        )}

        {/* Always-visible action row */}
        <div className="flex gap-2 px-3 pb-3">
          {onAction && actionLabel && (
            <button
              onClick={onAction}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
            >
              {actionLabel}
            </button>
          )}
          {onNext && (
            <button
              onClick={onNext}
              disabled={busy}
              className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white shadow active:scale-95 transition-all disabled:opacity-50"
            >
              {nextLabel || 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
