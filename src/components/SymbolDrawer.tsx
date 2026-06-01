import React from 'react';
import { SYMBOL_DEFS, type SymbolType } from '../types';
import { getSmallSymbolSVG } from '../lib/symbols';

interface Props {
  selectedType: SymbolType | null;
  onSelect: (type: SymbolType) => void;
  placedCount: number;
  onToggle?: () => void;
}

export default function SymbolDrawer({ selectedType, onSelect }: Props) {
  // Just the horizontal symbol scroller — the parent BottomSheet now owns the
  // grabber, title, and "N placed" count.
  return (
    <div className="flex overflow-x-auto gap-2 pb-1 -mx-1 px-1 scrollbar-thin">
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
  );
}
