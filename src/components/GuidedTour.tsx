import React, { useState, useEffect } from 'react';

interface Props {
  step: number; // 3 to 6
  onSkip: () => void;
}

export default function GuidedTour({ step, onSkip }: Props) {
  const [minimized, setMinimized] = useState(false);

  // Auto-show on step change
  useEffect(() => {
    setMinimized(false);
  }, [step]);

  let title = '';
  let description = '';

  switch (step) {
    case 3:
      title = 'Step 1: Set the Boundary';
      description = 'Tap 4 times on the map to place pins at the corners of your block. Then click the green "Close" button below.';
      break;
    case 4:
      title = 'Step 2: Add Roads';
      description = 'NakshaBot fetched roads automatically! Review them or just click "Roads Done →" at the bottom.';
      break;
    case 5:
      title = 'Step 3: Plot Houses';
      description = 'Use the Magic Wand button above the map to auto-detect houses, or manually select a house type below and tap the map to place it. Click "Done" when finished.';
      break;
    case 6:
      title = 'Step 4: Numbering & PDF';
      description = 'Click "Auto Number" at the bottom to sequence your houses in a serpentine path. Then click "Preview & Generate PDF" to download your map!';
      break;
    default:
      return null;
  }

  if (minimized) {
    return (
      <div className="absolute top-16 right-4 z-[2000] pointer-events-auto">
        <button 
          onClick={() => setMinimized(false)}
          className="bg-blue-600 text-white shadow-xl px-4 py-2 rounded-full font-bold border border-blue-500 animate-in fade-in zoom-in duration-300"
        >
          💬 Show Guide
        </button>
      </div>
    );
  }

  return (
    <div className="absolute top-16 left-4 right-4 z-[2000] pointer-events-none animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="bg-blue-600 rounded-2xl shadow-2xl p-4 border border-blue-500 relative pointer-events-auto">
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-blue-600 rotate-45 border-r border-b border-blue-500" />
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-black text-white text-lg">{title}</h3>
          <div className="flex gap-2">
            <button 
              onClick={() => setMinimized(true)}
              className="text-blue-100 hover:text-white text-sm bg-blue-700/50 hover:bg-blue-700 rounded-lg px-2 py-1 transition-colors"
            >
              Hide
            </button>
            <button 
              onClick={onSkip}
              className="text-blue-100 hover:text-white text-sm bg-blue-700/50 hover:bg-blue-700 rounded-lg px-2 py-1 transition-colors"
            >
              Skip Demo
            </button>
          </div>
        </div>
        <p className="text-sm text-blue-50 font-medium leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}
