import React, { useState } from 'react';

export default function AiComparison() {
  const [activeTab, setActiveTab] = useState<'ex1' | 'ex2'>('ex1');
  const [sliderValue, setSliderValue] = useState(50); // 0 to 100

  const examples = {
    ex1: {
      sat: '/assets/ai_examples/ex1_sat.png',
      map: '/assets/ai_examples/ex1_map.jpg',
      title: 'Rural Village & Fields',
    },
    ex2: {
      sat: '/assets/ai_examples/ex2_sat.jpg',
      map: '/assets/ai_examples/ex2_map.jpg',
      title: 'Dense Urban Block',
    }
  };

  const currentEx = examples[activeTab];

  return (
    <section className="py-20 bg-gray-50 border-b border-gray-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 font-public-sans mb-4">
            AI-Powered Map Generation
          </h2>
          <p className="text-lg text-gray-600 font-public-sans max-w-2xl mx-auto">
            Experience the magic of NakshaBot. Drag the slider to see how our AI instantly transforms complex satellite imagery into crisp, standard Census HLO Layout Maps.
          </p>
        </div>

        <div className="flex justify-center gap-4 mb-8">
          <button
            onClick={() => setActiveTab('ex1')}
            className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all ${
              activeTab === 'ex1'
                ? 'bg-[var(--color-saffron)] text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Example 1: {examples.ex1.title}
          </button>
          <button
            onClick={() => setActiveTab('ex2')}
            className={`px-6 py-2.5 rounded-full font-bold text-sm transition-all ${
              activeTab === 'ex2'
                ? 'bg-[var(--color-saffron)] text-white shadow-lg'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Example 2: {examples.ex2.title}
          </button>
        </div>

        <div className="relative max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl border-4 border-white bg-gray-200 aspect-[4/3] md:aspect-video group">
          {/* Base Layer: Satellite */}
          <img 
            src={currentEx.sat} 
            alt="Satellite View" 
            className="absolute inset-0 w-full h-full object-cover"
          />
          
          {/* Overlay Layer: AI Map (Opacity changes based on slider) */}
          <img 
            src={currentEx.map} 
            alt="AI Generated Map" 
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: sliderValue / 100 }}
          />

          {/* Slider Control */}
          <div className="absolute inset-0 flex items-end justify-center pb-8 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <div className="w-3/4 max-w-md bg-white/90 backdrop-blur px-6 py-4 rounded-2xl shadow-xl flex flex-col items-center gap-2">
              <div className="flex justify-between w-full text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                <span>Satellite</span>
                <span>AI Map</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={sliderValue} 
                onChange={(e) => setSliderValue(Number(e.target.value))}
                className="w-full accent-[var(--color-saffron)] h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
