import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LiveSurveyPrep() {
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/live-dashboard')} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-95">
            ←
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight">Survey Prep</h1>
            <p className="text-xs text-gray-500 font-medium">Before entering the field</p>
          </div>
        </div>
      </header>

      <div className="p-4 flex-1 max-w-lg mx-auto w-full">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 mb-6">
          <h2 className="text-lg font-black text-gray-800 mb-4 flex items-center gap-2">
            <span>📋</span> Pre-Survey Checklist
          </h2>
          
          <ul className="space-y-4">
            <li className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-sm">✓</div>
              <div>
                <p className="font-bold text-sm text-gray-800">Ensure GPS is ON</p>
                <p className="text-xs text-gray-500">Enable High Accuracy location mode on your device.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-sm">✓</div>
              <div>
                <p className="font-bold text-sm text-gray-800">Clear View of Sky</p>
                <p className="text-xs text-gray-500">Start the survey outside for the best satellite lock.</p>
              </div>
            </li>
            <li className="flex gap-3">
              <div className="w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center flex-shrink-0 text-sm">✓</div>
              <div>
                <p className="font-bold text-sm text-gray-800">Battery Charged</p>
                <p className="text-xs text-gray-500">Live GPS tracking consumes more battery than usual.</p>
              </div>
            </li>
          </ul>
        </div>

        <div className="bg-amber-50 rounded-2xl p-4 border border-amber-200 mb-6 flex gap-3 items-start">
          <span className="text-xl mt-1">⚠️</span>
          <div>
            <h4 className="font-bold text-amber-900 text-sm mb-1">Important Rule</h4>
            <p className="text-xs text-amber-800">Always start numbering from the <strong>North-West</strong> corner of your block and move in a <strong>clockwise serpentine</strong> pattern.</p>
          </div>
        </div>

        <label className="flex items-start gap-3 p-4 bg-white rounded-xl border border-gray-200 shadow-sm mb-6 cursor-pointer active:bg-gray-50">
          <input 
            type="checkbox" 
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="w-5 h-5 mt-0.5 rounded border-gray-300 text-[var(--color-saffron)] focus:ring-[var(--color-saffron)]"
          />
          <span className="text-sm font-bold text-gray-700">I have read the instructions and am physically present at the starting point.</span>
        </label>
      </div>

      <div className="p-4 bg-white border-t border-gray-200 sticky bottom-0 z-10 pb-8">
        <button 
          onClick={() => navigate('/live-survey')}
          disabled={!agreed}
          className={`w-full py-4 rounded-xl font-black text-lg shadow-lg active:scale-95 transition-all ${agreed ? 'bg-[var(--color-saffron)] text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
        >
          Start Live Map
        </button>
      </div>
    </div>
  );
}
