import React, { useState, useRef, MouseEvent, TouchEvent } from 'react';

interface Props {
  leftImage: string;
  rightImage: string;
  leftLabel?: string;
  rightLabel?: string;
  aspectRatio?: number;
}

export default function ImageComparisonSlider({
  leftImage,
  rightImage,
  leftLabel = 'Satellite',
  rightLabel = 'AI Map',
  aspectRatio = 1,
}: Props) {
  const [sliderPosition, setSliderPosition] = useState(50); // percentage (0-100)
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const position = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setSliderPosition(position);
  };

  const handleStart = () => {
    isDragging.current = true;
  };

  const handleEnd = () => {
    isDragging.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleMove(e.clientX);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    handleMove(e.clientX);
  };

  return (
    <div
      ref={containerRef}
      onPointerDown={handleStart}
      onPointerMove={handlePointerMove}
      onPointerUp={handleEnd}
      onPointerLeave={handleEnd}
      onClick={handleClick}
      className="relative select-none overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 w-full cursor-ew-resize touch-none"
      style={{ aspectRatio: String(aspectRatio) }}
    >
      {/* Left image (Satellite) */}
      <img
        src={leftImage}
        alt={leftLabel}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      <div className="absolute top-3 left-3 bg-black/75 backdrop-blur text-[10px] font-bold px-2.5 py-1 rounded text-white uppercase tracking-wider z-10 pointer-events-none">
        {leftLabel}
      </div>

      {/* Right image (AI Map) with clip path */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ clipPath: `inset(0 0 0 ${sliderPosition}%)` }}
      >
        <img
          src={rightImage}
          alt={rightLabel}
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>
      <div className="absolute top-3 right-3 bg-purple-600/95 backdrop-blur text-[10px] font-bold px-2.5 py-1 rounded text-white uppercase tracking-wider z-10 pointer-events-none">
        {rightLabel}
      </div>

      {/* Slider handle bar */}
      <div
        className="absolute top-0 bottom-0 w-[3px] bg-white cursor-ew-resize flex items-center justify-center pointer-events-none z-20 shadow-[0_0_10px_rgba(0,0,0,0.5)]"
        style={{ left: `${sliderPosition}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle circle */}
        <div className="w-8 h-8 rounded-full bg-white shadow-2xl flex items-center justify-center text-slate-800 font-bold border border-slate-200 pointer-events-none scale-100 group-hover:scale-105 active:scale-95 transition-transform">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={3}
            stroke="currentColor"
            className="w-4 h-4 text-slate-650"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 15L12 18.75 15.75 15m-7.5-6L12 5.25 15.75 9" />
          </svg>
        </div>
      </div>
    </div>
  );
}
