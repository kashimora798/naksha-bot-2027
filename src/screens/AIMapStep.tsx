import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { generateSurveyMapFromBoundary, captureFullSatellite, PREDEFINED_PROMPTS } from '../lib/survey-api';
import type { MapData, Coordinate } from '../types';
import { load } from '@cashfreepayments/cashfree-js';
import ImageComparisonSlider from '../components/ImageComparisonSlider';

interface Props {
  mapData: MapData;
  onStepComplete: () => void;
  onBack: () => void;
  onUpdateMapData: (data: Partial<MapData>) => void;
  isDemoMode?: boolean;
}

// Predefined reference gallery maps
const REFERENCE_MAPS = [
  { url: '/images/hlb-map-census-2027-example.jpg', title: 'Official 2027 Format' },
  { url: '/images/hlo-map-pdf-sample.jpg', title: 'Completed AI Survey Map' },
  { url: '/images/nazri-naksha-rural-up.jpg', title: 'Rural Topo Sheet Style' },
  { url: '/images/nazri-naksha-sample-urban-kanpur.jpg', title: 'Urban Settlement Style' }
];

export default function AIMapStep({ mapData, onStepComplete, onBack, onUpdateMapData, isDemoMode }: Props) {
  // Satellite image
  const [satImg, setSatImg] = useState<string>('');
  const [satLoading, setSatLoading] = useState(false);

  // AI image generation state
  const [aiImg, setAiImg] = useState<string | null>(mapData.surveyMapBase64 || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiProgress, setAiProgress] = useState('');

  // Prompts and options
  const [selectedPromptId, setSelectedPromptId] = useState<string>('soi_topo');
  const [customPrompt, setCustomPrompt] = useState('');

  // Rate limit / regen tracking
  const [regenAllowance, setRegenAllowance] = useState<number>(1);
  const [regenUsed, setRegenUsed] = useState<number>(0);
  const [regenLoading, setRegenLoading] = useState(false);

  // Payment popup
  const [paying, setPaying] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);

  // Load satellite image on mount
  useEffect(() => {
    captureSatellite();
  }, [mapData.boundaryPins]);

  // Load regen counters
  useEffect(() => {
    if (!mapData.projectId || isDemoMode) return;
    refreshRegenCount();
  }, [mapData.projectId, isDemoMode]);

  async function refreshRegenCount() {
    if (!mapData.projectId) return;
    setRegenLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('regen_allowance, regen_used')
      .eq('id', mapData.projectId)
      .single();
    if (data) {
      setRegenAllowance(data.regen_allowance ?? 1);
      setRegenUsed(data.regen_used ?? 0);
    }
    setRegenLoading(false);
  }

  async function captureSatellite() {
    if (mapData.boundaryPins.length < 3) return;
    setSatLoading(true);
    try {
      const { canvas } = await captureFullSatellite(mapData.boundaryPins, (msg) => setAiProgress(msg));
      setSatImg(canvas.toDataURL('image/jpeg', 0.9));
      setAiProgress('');
    } catch (err) {
      console.error('Failed to capture satellite preview:', err);
    }
    setSatLoading(false);
  }

  // Generate AI Map
  async function handleGenerateAI() {
    if (mapData.boundaryPins.length < 3) return;
    
    if (isDemoMode) {
      setAiError('');
      setAiLoading(true);
      setAiProgress('Generating AI survey map (Demo mode)…');
      await new Promise(r => setTimeout(r, 1200));
      // Re-use demo image
      const demoUrl = 'https://access.vheer.com/results/NHkzh0xq_1780294046688.jpg';
      setAiImg(demoUrl);
      onUpdateMapData({ surveyMapBase64: demoUrl, aiMapChunks: [] });
      setAiProgress('');
      setAiLoading(false);
      return;
    }

    if (regenUsed >= regenAllowance) {
      setShowPaywall(true);
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiProgress('Preparing satellite imagery...');

    // Assemble final prompt
    let finalPrompt = '';
    if (selectedPromptId === 'custom') {
      finalPrompt = customPrompt;
    } else {
      finalPrompt = PREDEFINED_PROMPTS.find(p => p.id === selectedPromptId)?.prompt || PREDEFINED_PROMPTS[0].prompt;
    }

    try {
      const result = await generateSurveyMapFromBoundary(
        mapData,
        mapData.orientation || 'portrait',
        (msg) => setAiProgress(msg),
        undefined, // Skip preview popup since we are already on the step page!
        finalPrompt
      );

      if (result.success && result.imageUrl) {
        setAiImg(result.imageUrl);
        onUpdateMapData({ surveyMapBase64: result.imageUrl, aiMapChunks: [] });
        setAiProgress('');
        await refreshRegenCount();
      } else {
        if (result.error === 'regen_limit') {
          setShowPaywall(true);
        } else {
          setAiError(result.error || 'Failed to generate AI survey map');
        }
      }
    } catch (err: any) {
      setAiError(err.message || 'Connection failed');
    } finally {
      setAiLoading(false);
    }
  }

  // Payment for more regens
  async function handlePayment() {
    setPaying(true);
    try {
      if (!mapData.projectId) throw new Error('Project ID is missing.');
      const { data, error } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { projectId: mapData.projectId, kind: 'regen' }
      });
      if (error) throw error;
      if (data && data.paymentSessionId) {
        const cashfree = await load({ mode: (import.meta.env.VITE_CASHFREE_MODE === 'production' ? 'production' : 'sandbox') });
        if (cashfree) {
          cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_self' });
        }
      } else {
        throw new Error('No payment session returned');
      }
    } catch (err) {
      console.error(err);
      alert('Payment failed to initialize.');
    }
    setPaying(false);
  }

  const aspect = mapData.orientation === 'landscape' ? 297 / 210 : 210 / 297;

  return (
    <div className="h-full bg-slate-950 text-slate-100 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="bg-slate-800 hover:bg-slate-700 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors">
            ← Back to Numbering
          </button>
          <div>
            <h1 className="text-base font-black font-[Baloo_2] text-white">✨ Step 7: AI Topographic Survey Map</h1>
            <p className="text-[10px] text-slate-400">Generate high-contrast Census layout sheets using Generative AI</p>
          </div>
        </div>
        <button
          onClick={onStepComplete}
          disabled={aiLoading}
          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all"
        >
          Continue to Print Preview →
        </button>
      </div>

      {/* Main Grid */}
      <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        
        {/* Column 1: Satellite Source & Comparison Slider */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col min-h-[400px] lg:col-span-1">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              {aiImg ? '🔍 Swipe to Compare' : '🛰️ Source Satellite Image'}
            </h2>
            <button
              onClick={captureSatellite}
              disabled={satLoading}
              className="text-[10px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
            >
              {satLoading ? 'Loading...' : '🔄 Recapture'}
            </button>
          </div>
          
          <div className="flex-1 min-h-[220px] bg-slate-950 rounded-xl overflow-hidden border border-slate-850 flex items-center justify-center relative">
            {satLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-400 font-medium">Capturing tiles...</span>
              </div>
            ) : aiImg && satImg ? (
              <ImageComparisonSlider
                leftImage={satImg}
                rightImage={aiImg}
                leftLabel="Satellite"
                rightLabel="AI Map"
                aspectRatio={aspect}
              />
            ) : satImg ? (
              <img src={satImg} alt="Satellite Source" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-slate-500">No satellite image captured</span>
            )}
            {!aiImg && (
              <div className="absolute bottom-2 left-2 bg-slate-900/80 backdrop-blur text-[9px] font-bold px-2 py-0.5 rounded text-slate-300">
                Source boundary view
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
            {aiImg
              ? 'Drag the circular handle left and right to visually check how buildings and roads on the satellite image align with the generated AI map.'
              : 'The satellite image is fetched automatically using the GPS coordinates of your block boundary pins.'}
          </p>
        </div>

        {/* Column 2: Prompt Editor & Generate */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-4">✨ AI Prompt Settings</h2>
            
            {/* Prompt Selector Dropdown */}
            <div className="space-y-1 mb-4">
              <label className="text-[11px] font-bold text-slate-400 uppercase">Map Style Preset</label>
              <select
                value={selectedPromptId}
                onChange={(e) => setSelectedPromptId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-850 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 font-sans"
              >
                {PREDEFINED_PROMPTS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">Custom Styling Prompt</option>
              </select>
            </div>

            {/* Prompt Display/Textarea */}
            {selectedPromptId !== 'custom' ? (
              <div className="bg-slate-950 rounded-xl p-3 border border-slate-850 max-h-48 overflow-y-auto text-[10px] text-slate-400 leading-relaxed font-mono">
                {PREDEFINED_PROMPTS.find((p) => p.id === selectedPromptId)?.prompt}
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Enter custom instructions for AI (e.g. Draw roads clearly, outline housing blocks in yellow, ignore shadows...)"
                  maxLength={1000}
                  className="w-full h-40 bg-slate-950 border border-slate-850 rounded-xl p-3 text-xs text-white placeholder-slate-650 focus:outline-none focus:border-purple-500 resize-none font-sans"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>Tip: Keep rules simple and descriptive</span>
                  <span>{customPrompt.length}/1000</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 space-y-3 shrink-0">
            {/* Usage Counter */}
            {!isDemoMode && (
              <div className="flex items-center justify-between text-xs text-slate-400 bg-slate-950/80 px-3.5 py-2.5 rounded-xl border border-slate-900">
                <span className="font-semibold text-slate-300">Generations Limit:</span>
                <span className="font-bold text-purple-400">
                  {regenUsed} / {regenAllowance} used ({Math.max(0, regenAllowance - regenUsed)} left)
                </span>
              </div>
            )}

            {/* Generate Action Button */}
            {aiLoading ? (
              <div className="w-full bg-purple-600/30 text-purple-300 py-3.5 rounded-xl border border-purple-500/20 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-bold font-mono">{aiProgress || 'Generating topographic map...'}</span>
              </div>
            ) : regenUsed >= regenAllowance && !isDemoMode ? (
              <button
                onClick={() => setShowPaywall(true)}
                className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-black text-xs rounded-xl shadow-lg hover:-translate-y-0.5 transition-transform"
              >
                ✨ Limit Reached! Buy 5 Generations (₹25)
              </button>
            ) : (
              <button
                onClick={handleGenerateAI}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs rounded-xl shadow-lg hover:-translate-y-0.5 transition-all"
              >
                ✨ Generate AI Survey Map
              </button>
            )}

            {aiError && (
              <div className="bg-red-500/10 border border-red-500/35 rounded-xl p-3 text-center">
                <p className="text-[10px] text-red-400 font-semibold">{aiError}</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: Reference Gallery */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-5 flex flex-col">
          <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">🎨 Topo Sheet Gallery</h2>
          <p className="text-[10px] text-slate-400 mb-4 leading-relaxed">
            See actual completed outputs in various Census regional styles. Drag/click to review what the AI tries to reproduce.
          </p>
          
          <div className="flex-1 grid grid-cols-2 gap-3 overflow-y-auto max-h-[450px] pr-1">
            {REFERENCE_MAPS.map((map, i) => (
              <div key={i} className="group relative bg-slate-950 rounded-xl overflow-hidden border border-slate-850 hover:border-slate-700 transition-all">
                <img src={map.url} alt={map.title} className="w-full h-24 object-cover opacity-70 group-hover:opacity-100 transition-opacity" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent p-2 flex items-end">
                  <span className="text-[8px] font-bold text-slate-300 truncate w-full">{map.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom Panel: Generated Preview (when available) */}
      {aiImg && (
        <div className="bg-slate-900 border-t border-slate-800 px-6 py-5 flex flex-col md:flex-row gap-5 items-center justify-between shrink-0">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider block">✓ Generation Succeeded</span>
            <span className="text-xs text-white font-bold block">Preview map loaded in comparison slider above</span>
          </div>

          <div className="flex gap-3 w-full md:w-auto">
            <button
              onClick={() => { setAiImg(null); handleGenerateAI(); }}
              disabled={aiLoading}
              className="flex-1 md:flex-none px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-colors border border-slate-750"
            >
              🔄 Regenerate Map
            </button>
            <button
              onClick={onStepComplete}
              className="flex-1 md:flex-none px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all"
            >
              Looks Good → Print Preview
            </button>
          </div>
        </div>
      )}

      {/* Paywall Overlay */}
      {showPaywall && (
        <div className="fixed inset-0 z-[6500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-800">
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 px-6 py-6 text-white text-center">
              <div className="text-4xl mb-1">✨</div>
              <h3 className="text-xl font-black font-[Baloo_2]">Need More AI Generations?</h3>
              <p className="text-xs text-white/80 mt-1">Get 5 extra generations for this project</p>
              <div className="mt-4 flex items-end justify-center gap-2">
                <span className="text-white/70 line-through text-base">₹50</span>
                <span className="text-4xl font-black leading-none">₹25</span>
                <span className="text-white/90 text-xs mb-1">pack of 5</span>
              </div>
            </div>
            <div className="p-6 space-y-4 text-xs">
              <p className="text-slate-650 leading-relaxed">
                Paid maps already include 5 generations. If you want to refine your topo sheet design further, buying a refill pack grants you <strong>5 more attempts</strong> instantly.
              </p>
              <div className="bg-purple-50 rounded-xl p-3 border border-purple-100 flex items-center gap-3">
                <span className="text-base">🚀</span>
                <span className="text-purple-950 font-medium">Valid for this project. Keep generating until it matches your standard.</span>
              </div>
            </div>
            <div className="px-6 pb-6 pt-1 flex gap-2">
              <button
                onClick={() => setShowPaywall(false)}
                disabled={paying}
                className="flex-1 py-3 border border-slate-200 text-slate-500 rounded-xl font-bold text-xs hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={paying}
                className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-bold text-xs rounded-xl shadow hover:opacity-90 active:scale-95 transition-all"
              >
                {paying ? 'Loading...' : 'Pay ₹25'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
