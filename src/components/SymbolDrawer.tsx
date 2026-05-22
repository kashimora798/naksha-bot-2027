import React from 'react';
import { SYMBOL_DEFS, type SymbolType } from '../types';
import { getSmallSymbolSVG } from '../lib/symbols';

interface Props {
  selectedType: SymbolType | null;
  onSelect: (type: SymbolType) => void;
  placedCount: number;
}

export default function SymbolDrawer({ selectedType, onSelect, placedCount }: Props) {
  return (
    <div className="bg-white rounded-t-2xl shadow-[0_-2px_12px_rgba(0,0,0,0.12)]">
      <div className="flex items-center justify-center pt-2 pb-1">
        <div className="w-10 h-1 rounded-full bg-gray-300" />
      </div>
      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-semibold text-gray-700 font-[Noto_Sans]">
          {placedCount} symbols placed
        </span>
        <span className="text-xs text-gray-400">← Scroll for more →</span>
      </div>
      <div className="flex overflow-x-auto gap-2 px-3 pb-4 scrollbar-thin">
        {SYMBOL_DEFS.map(def => (
          <button
            key={def.type}
            onClick={() => onSelect(def.type)}
            className={`flex-shrink-0 flex flex-col items-center justify-center p-2 rounded-xl border-2 transition-all duration-150 min-w-[64px] active:scale-95 ${
              selectedType === def.type
                ? 'border-orange-500 bg-orange-50 shadow-md'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div
              className="w-6 h-6"
              dangerouslySetInnerHTML={{ __html: getSmallSymbolSVG(def.type, selectedType === def.type) }}
            />
            <span className="text-[10px] mt-1 text-gray-600 font-[Noto_Sans] leading-tight text-center">
              {def.labelHi}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
