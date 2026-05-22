import React from 'react';

const STEP_NAMES = [
  'Login',
  'SMS Parse',
  'Boundary',
  'Roads',
  'Symbols',
  'Numbering',
  'Preview',
  'Export',
];

interface Props {
  currentStep: number;
}

export default function ProgressBar({ currentStep }: Props) {
  const progress = ((currentStep - 1) / 7) * 100;

  return (
    <div className="bg-white border-b border-gray-200 px-4 pt-2 pb-1 z-50 relative">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-orange-600 font-[Baloo_2]">
          Step {currentStep} of 8
        </span>
        <span className="text-xs text-gray-500 font-[Noto_Sans]">
          {STEP_NAMES[currentStep - 1]}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-gradient-to-r from-orange-400 to-orange-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between mt-1">
        {STEP_NAMES.map((name, i) => (
          <div
            key={name}
            className={`w-2 h-2 rounded-full transition-colors ${
              i < currentStep ? 'bg-orange-500' : 'bg-gray-300'
            }`}
            title={name}
          />
        ))}
      </div>
    </div>
  );
}
