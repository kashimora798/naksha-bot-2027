import React from 'react';

interface Props {
  userProfile: any;
  onSelectSaved: () => void;
  onSelectDemoKanpur: () => void;
  onSelectDemoLucknow: () => void;
  onSelectNew: () => void;
  onClose: () => void;
  type: 'map' | 'live';
}

export default function LocationSelectModal({ userProfile, onSelectSaved, onSelectDemoKanpur, onSelectDemoLucknow, onSelectNew, onClose, type }: Props) {
  const hasSavedHlb = userProfile && userProfile.hlb_number;
  const savedName = hasSavedHlb 
    ? `HLB ${userProfile.hlb_number} - ${userProfile.hlb_address || 'Saved Area'}` 
    : '';

  return (
    <div className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-[24px] shadow-2xl p-6 w-full max-w-md animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold font-[Baloo_2] text-slate-800">
            {type === 'map' ? 'Where is this map?' : 'Where are you surveying?'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors">
            ✕
          </button>
        </div>

        <div className="space-y-3">
          {hasSavedHlb && (
            <button 
              onClick={onSelectSaved}
              className="w-full text-left p-4 rounded-xl border-2 border-orange-500 bg-orange-50 hover:bg-orange-100 transition-colors flex items-center gap-3 group"
            >
              <div className="w-10 h-10 rounded-full bg-orange-200 flex items-center justify-center text-xl">📍</div>
              <div>
                <p className="font-bold text-orange-900 group-hover:text-orange-700">Your Saved HLB</p>
                <p className="text-xs text-orange-700 font-semibold">{savedName}</p>
              </div>
            </button>
          )}

          <button 
            onClick={onSelectDemoKanpur}
            className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center text-xl">🏢</div>
            <div>
              <p className="font-bold text-slate-700 group-hover:text-blue-800">Kanpur City Center</p>
              <p className="text-xs text-slate-500 group-hover:text-blue-600">Demo Location</p>
            </div>
          </button>

          <button 
            onClick={onSelectDemoLucknow}
            className="w-full text-left p-4 rounded-xl border border-slate-200 hover:border-green-400 hover:bg-green-50 transition-colors flex items-center gap-3 group"
          >
            <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-green-100 flex items-center justify-center text-xl">🌳</div>
            <div>
              <p className="font-bold text-slate-700 group-hover:text-green-800">Lucknow Rural</p>
              <p className="text-xs text-slate-500 group-hover:text-green-600">Demo Location</p>
            </div>
          </button>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100">
          <button 
            onClick={onSelectNew}
            className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
          >
            <span>➕</span> Start a different location
          </button>
        </div>
      </div>
    </div>
  );
}
