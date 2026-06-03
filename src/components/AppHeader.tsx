import React, { useState, useRef, useEffect } from 'react';

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
  // A step is reachable once the user has been there at least once. Use the
  // furthest step reached (falls back to currentStep) so going back doesn't
  // re-lock steps the user already completed.
  const reachable = Math.max(maxStep ?? 0, currentStep);

  return (
    <>
      <div className="bg-white border-b border-gray-200 px-4 py-2 z-[2001] relative flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(true)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors text-gray-700"
            title="Menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>
          <span className="font-semibold text-gray-800 text-sm">
            {STEP_NAMES[currentStep - 1]}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {inMap && (
            <span className={`text-[10px] sm:text-xs px-2 py-1 rounded-full border ${saveStatus === 'error' ? 'text-red-500 bg-red-50 border-red-100' : 'text-gray-500 bg-gray-50 border-gray-100'}`}>
              {saveStatus === 'saving' ? '⏳ Saving...' : saveStatus === 'saved' ? '✓ Saved' : '⚠️ Save Failed'}
            </span>
          )}
          <button 
            onClick={onSaveAndExit} 
            className="flex items-center gap-1.5 bg-gray-900 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs font-bold hover:bg-gray-800 transition-colors shadow-sm active:scale-95"
          >
            {inMap ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                  <polyline points="17 21 17 13 7 13 7 21"></polyline>
                  <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                <span className="hidden sm:inline">Save & Exit</span>
                <span className="sm:hidden">Exit</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
                <span>Exit</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sidebar Overlay */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/40 z-[3000] flex" onClick={() => setMenuOpen(false)}>
          <div 
            className="w-64 bg-white h-full shadow-2xl flex flex-col animate-slide-in-left"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <span className="font-bold text-gray-700">Menu</span>
              <button onClick={() => setMenuOpen(false)} className="p-1 hover:bg-gray-200 rounded-md text-gray-500">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto py-2">
              <div className="px-4 py-2 mb-1">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Steps</span>
              </div>
              {STEP_NAMES.map((name, i) => {
                const stepNum = i + 1;
                // Steps 2-7 are navigable once reached. Going back never re-locks
                // a step the user has already completed (uses furthest reached).
                const isClickable = stepNum >= 2 && stepNum <= reachable;
                
                return (
                  <button
                    key={name}
                    disabled={!isClickable}
                    onClick={() => {
                      setStep(stepNum);
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-3 text-sm transition-colors flex items-center justify-between ${
                      currentStep === stepNum
                        ? 'bg-orange-50 text-orange-700 font-semibold border-l-4 border-orange-500'
                        : isClickable
                          ? 'text-gray-700 hover:bg-gray-50 border-l-4 border-transparent'
                          : 'text-gray-300 cursor-not-allowed border-l-4 border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${currentStep === stepNum ? 'bg-orange-500 text-white' : isClickable ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                        {stepNum}
                      </div>
                      {name}
                    </div>
                    {isClickable && currentStep > stepNum && <span className="text-green-500 text-sm">✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
