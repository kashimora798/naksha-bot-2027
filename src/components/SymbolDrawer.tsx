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
  return (
    <div className="flex overflow-x-auto gap-2 pb-1 -mx-1 px-1 scrollbar-thin">
      {SYMBOL_DEFS.map(def => {
        const isSelected = selectedType === def.type;
        return (
          <button
            key={def.type}
            onClick={() => onSelect(def.type)}
            className={`flex-shrink-0 flex flex-col items-center justify-center p-2 rounded-[var(--radius-md)] border-2 transition-all duration-[var(--duration-fast)] min-w-[64px] active:scale-95 cursor-pointer ${
              isSelected
                ? 'border-[var(--color-accent)] bg-[var(--color-accent-tint)] shadow-sm'
                : 'border-[var(--color-hairline)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)]'
            }`}
          >
            <div
              className="w-6 h-6"
              dangerouslySetInnerHTML={{ __html: getSmallSymbolSVG(def.type, isSelected) }}
            />
            <span className={`text-[10px] mt-1 font-public-sans leading-tight text-center ${isSelected ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-ink-secondary)]'}`}>
              {def.labelHi}
            </span>
          </button>
        );
      })}
    </div>
  );
}
