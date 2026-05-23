import React, { useEffect, useRef, useState } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import type { MapData, Block } from '../types';
import { supabase } from '../lib/supabase';
import { renderMapToCanvas, exportBlockPDF } from '../lib/pdf-export';
import { captureSatelliteForBoundary, captureFullSatellite, generateSurveyMapFromBoundary, fetchImageAsBase64, API_BASE, generateChunkedSurveyMaps } from '../lib/survey-api';

interface Props { mapData: MapData; onBack: () => void; onExitToDashboard?: () => void; onUpdateMapData?: (data: Partial<MapData>) => void; }

type ViewTab = 'sketch' | 'satellite' | 'ai';

export default function PreviewScreen({ mapData, onBack, onExitToDashboard, onUpdateMapData }: Props) {
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [mapImg, setMapImg] = useState('');
  const [orient, setOrient] = useState<'landscape' | 'portrait'>(mapData.orientation || 'portrait');
  const [showControls, setShowControls] = useState(true);

  // Tab system
  const [activeTab, setActiveTab] = useState<ViewTab>('sketch');

  // Satellite + overlay
  const [satImg, setSatImg] = useState('');
  const [satOverlayImg, setSatOverlayImg] = useState('');
  const [satLoading, setSatLoading] = useState(false);

  // AI survey map
  const [aiImg, setAiImg] = useState<string | null>(mapData.surveyMapBase64 || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [aiChunks, setAiChunks] = useState<{ label: string; bbox: Coordinate[]; imageBase64: string }[]>(mapData.aiMapChunks || []);

  const isDrag = useRef(false);
  const lastP = useRef({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);

  // Render sketch map
  useEffect(() => {
    const c = document.createElement('canvas');
    const isL = orient === 'landscape';
    renderMapToCanvas(c, { ...mapData, orientation: orient }, isL ? 2000 : 1400, isL ? 1400 : 2000, { watermark: true });
    setMapImg(c.toDataURL('image/jpeg', 0.9));
  }, [mapData, orient]);

  useEffect(() => { if (mapImg) { setZoom(1); setRotate(0); setPanX(0); setPanY(0); } }, [mapImg]);

  // Auto-capture satellite when switching to satellite tab
  useEffect(() => {
    if (activeTab === 'satellite' && !satImg && !satLoading && mapData.boundaryPins.length >= 3) {
      captureSatelliteOverlay();
    }
  }, [activeTab]);

  async function captureSatelliteOverlay() {
    setSatLoading(true);
    try {
      const satCanvas = await captureFullSatellite(mapData.boundaryPins, (msg) => setExportProgress(msg));
      setSatImg(satCanvas.toDataURL('image/jpeg', 0.9));

      const isL = orient === 'landscape';
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = satCanvas.width;
      overlayCanvas.height = satCanvas.height;
      const ctx = overlayCanvas.getContext('2d')!;

      // Draw satellite as base
      ctx.drawImage(satCanvas, 0, 0);

      // Draw the sketch map on top with transparent background
      const sketchCanvas = document.createElement('canvas');
      renderMapToCanvas(sketchCanvas, { ...mapData, orientation: orient }, satCanvas.width, satCanvas.height, { transparentBg: true, hideSymbols: true });

      // Draw transparent sketch directly over satellite
      ctx.drawImage(sketchCanvas, 0, 0);

      setSatOverlayImg(overlayCanvas.toDataURL('image/jpeg', 0.9));
      setExportProgress('');
    } catch (err) {
      console.error('Satellite capture failed:', err);
    }
    setSatLoading(false);
  }

  async function generateAI() {
    if (mapData.boundaryPins.length < 3) return;
    setAiLoading(true);
    setAiError('');
    setAiProgress('Preparing satellite imagery...');

    try {
      // Chunk the area into 250m x 250m pieces
      const result = await generateChunkedSurveyMaps(
        mapData.boundaryPins,
        250,
        (msg) => setAiProgress(msg)
      );

      if (result.success && result.chunks) {
        setAiChunks(result.chunks);
        if (onUpdateMapData) {
          onUpdateMapData({ aiMapChunks: result.chunks });
        }
        setAiProgress('');
      } else {
        setAiError(result.error || 'Failed to generate AI survey maps');
      }
    } catch (err: any) {
      setAiError(err.message || 'Network error');
    } finally {
      setAiLoading(false);
    }
  } 

  function handleDown(e: React.PointerEvent) { isDrag.current = true; lastP.current = { x: e.clientX, y: e.clientY }; (e.target as HTMLElement).setPointerCapture(e.pointerId); }
  function handleMove(e: React.PointerEvent) { if (!isDrag.current) return; setPanX(p => p + e.clientX - lastP.current.x); setPanY(p => p + e.clientY - lastP.current.y); lastP.current = { x: e.clientX, y: e.clientY }; }
  function handleUp() { isDrag.current = false; }
  function handleWheel(e: React.WheelEvent) { e.preventDefault(); setZoom(z => Math.max(0.3, Math.min(5, z + (e.deltaY > 0 ? -0.1 : 0.1)))); }
  function resetView() { setZoom(1); setRotate(0); setPanX(0); setPanY(0); }

  function getDisplayImage(): string {
    switch (activeTab) {
      case 'satellite': return satOverlayImg || satImg || mapImg;
      case 'ai': return aiImg || mapImg;
      default: return mapImg;
    }
  }

  useEffect(() => {
    if (mapData.autoExport && mapData.paymentStatus === 'paid' && !exported && !exporting) {
      mapData.autoExport = false; // Prevent infinite loops on failure
      // Small timeout to allow UI to render first
      const timer = setTimeout(() => {
        handleExport();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [mapData.autoExport, mapData.paymentStatus, exported, exporting]);

  async function handleExport() {
    if (mapData.paymentStatus !== 'paid') {
      alert('Please complete the payment to export.');
      return;
    }
    if ((mapData.exportCount || 0) >= 3) {
      alert('Export limit reached for this payment. Please purchase another export pack.');
      return;
    }

    setExporting(true);
    setExportProgress('Rendering map...');
    try {
      await new Promise(r => setTimeout(r, 100)); // yield for UI update
      const exportData = { ...mapData };
      if (aiImg) {
        exportData.surveyMapBase64 = aiImg;
      }
      await exportBlockPDF(exportData, orient, (msg: string) => setExportProgress(msg));
      
      // Increment export count
      if (mapData.projectId) {
        await supabase.rpc('increment_export_count', { proj_id: mapData.projectId });
        // Update local state optimisticly
        mapData.exportCount = (mapData.exportCount || 0) + 1;
      }

      setExported(true);
    } catch (err) {
      console.error(err);
      alert('Export failed — please try again.');
    }
    setExporting(false);
    setExportProgress('');
  }

  async function handlePayment() {
    setPaying(true);
    try {
      if (!mapData.projectId) {
        throw new Error('Project is still saving, please wait a moment and try again.');
      }
      const { data, error } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { projectId: mapData.projectId }
      });
      if (error) throw error;
      if (data && data.paymentSessionId) {
        const cashfree = await load({
          mode: "sandbox" // change to production when live
        });
        if (cashfree) {
            cashfree.checkout({
                paymentSessionId: data.paymentSessionId,
                redirectTarget: "_self"
            });
        }
      } else {
        throw new Error('No payment session ID returned');
      }
    } catch (err) {
      console.error(err);
      alert('Payment initiation failed.');
    }
    setPaying(false);
  }

  const blocks = mapData.blocks || [];
  const hasBlocks = blocks.length > 1;
  const aspect = orient === 'landscape' ? 297 / 210 : 210 / 297;
  const totalPages = hasBlocks ? blocks.length * 2 + 1 : 2;
  const displayImg = getDisplayImage();
  const isPaid = mapData.paymentStatus === 'paid';
  const isLimitReached = isPaid && (mapData.exportCount || 0) >= 3;

  // ─── SUCCESS ─────────────────────────────────────────────
  if (exported) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex flex-col items-center justify-start px-4 py-8 overflow-auto">
        <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mb-4 shadow-lg"><span className="text-white text-3xl">✓</span></div>
        <h2 className="text-xl font-bold text-gray-800 font-[Baloo_2] mb-1">नक्शा तैयार है!</h2>
        <p className="text-sm text-gray-500 mb-4">PDF downloaded — {totalPages + (aiImg ? 1 : 0)} pages</p>
        <div className="w-full max-w-xs bg-white rounded-2xl shadow-lg p-5 text-center space-y-3">
          <p className="text-sm text-gray-600">HLB_{mapData.hlbNumber}_Naksha_2027.pdf</p>
          {hasBlocks && <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">{blocks.length} blocks × 2 pages + overview = {totalPages} pages</p>}
          {aiImg && <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2">✨ AI Survey Map included</p>}
          <div className="bg-amber-50 rounded-lg p-2"><p className="text-xs text-amber-700">💡 Print at cyber café — A4 {orient}</p></div>
          <button onClick={() => onExitToDashboard ? onExitToDashboard() : window.location.reload()} className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold font-[Baloo_2] shadow" style={{ height: 52 }}>Return to Dashboard</button>
          <button onClick={handleExport} className="w-full py-2 border-2 border-orange-300 text-orange-600 rounded-xl text-sm font-semibold">📥 Download Again</button>
        </div>
      </div>
    );
  }

  // ─── EDITOR ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#111] flex flex-col">
      <div className="bg-white px-3 py-2 flex items-center justify-between z-30 flex-shrink-0 shadow">
        <button onClick={onBack} className="text-sm text-gray-600 font-semibold">← Back</button>
        <span className="text-sm font-bold font-[Baloo_2]">Preview</span>
        <button onClick={() => setShowControls(c => !c)} className="text-sm text-orange-600 font-semibold">{showControls ? 'Hide ▼' : 'Show ▲'}</button>
      </div>

      <div className="bg-white border-b border-gray-200 flex flex-shrink-0">
        <button onClick={() => setActiveTab('sketch')} className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === 'sketch' ? 'text-orange-600 border-b-2 border-orange-500 bg-orange-50/50' : 'text-gray-500'}`}>✏️ Sketch</button>
        <button onClick={() => setActiveTab('satellite')} className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === 'satellite' ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50' : 'text-gray-500'}`}>🛰️ Satellite{satLoading ? '...' : ''}</button>
        <button onClick={() => setActiveTab('ai')} className={`flex-1 py-2.5 text-xs font-bold transition-colors ${activeTab === 'ai' ? 'text-purple-600 border-b-2 border-purple-500 bg-purple-50/50' : 'text-gray-500'}`}>🗺️ AI Map{aiLoading ? '...' : ''}</button>
      </div>

      <div className="flex-1 overflow-auto pb-8">
        {/* Controls panel now ABOVE the map so it never gets lost off-screen */}
        {showControls && (
          <div className="bg-white px-4 py-4 space-y-4 shadow-sm border-b border-gray-200 mb-4 rounded-b-2xl">
            <div className="flex gap-2">
              <button onClick={() => { setOrient('landscape'); resetView(); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${orient === 'landscape' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>📄 Landscape</button>
              <button onClick={() => { setOrient('portrait'); resetView(); }} className={`flex-1 py-2.5 rounded-xl text-sm font-bold ${orient === 'portrait' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>📄 Portrait</button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-9 h-9 bg-gray-100 rounded-lg text-lg font-bold flex-shrink-0">−</button>
              <input type="range" min="0.3" max="5" step="0.05" value={zoom} onChange={e => setZoom(Number(e.target.value))} className="flex-1 h-1.5 accent-orange-500" />
              <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="w-9 h-9 bg-gray-100 rounded-lg text-lg font-bold flex-shrink-0">+</button>
              <span className="text-xs text-gray-500 w-10 text-right">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="flex gap-1 justify-between">
              {[0, 90, 180, 270].map(d => (
                <button key={d} onClick={() => setRotate(d)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${rotate === d ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600'}`}>{d}°</button>
              ))}
              <button onClick={resetView} className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 font-semibold">Reset</button>
            </div>

            {isPaid ? (
              isLimitReached ? (
                <button disabled className="w-full py-4 rounded-xl font-bold text-lg font-[Baloo_2] shadow-sm bg-red-50 text-red-500 border border-red-200">
                   Export Limit Reached (3/3)
                </button>
              ) : (
                <button onClick={handleExport} disabled={exporting}
                  className={`w-full py-4 rounded-xl font-bold text-lg font-[Baloo_2] shadow-lg transition-all ${exporting ? 'bg-gray-400 text-white' : 'bg-orange-500 text-white active:scale-[0.97]'}`}
                  style={{ height: 56 }}>
                  {exporting ? exportProgress || '⏳ Exporting...' : `Export PDF (${totalPages + (aiImg ? 1 : 0)}p) 📥`}
                </button>
              )
            ) : (
              <button onClick={handlePayment} disabled={paying}
                className="w-full py-4 rounded-xl font-bold text-lg font-[Baloo_2] shadow-lg transition-all bg-green-500 hover:bg-green-600 text-white active:scale-[0.97]"
                style={{ height: 56 }}>
                {paying ? '⏳ Processing...' : 'Pay ₹20 to Export PDF 🔒'}
              </button>
            )}
          </div>
        )}

        {/* Loading and empty states */}
        {activeTab === 'satellite' && satLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-sm text-gray-400">{exportProgress || 'Loading satellite view...'}</p>
          </div>
        )}

        {activeTab === 'ai' && aiChunks.length === 0 && !aiLoading && (
          <div className="flex flex-col items-center justify-center py-8 gap-4 px-6 bg-white/5 mx-4 rounded-2xl border border-white/10">
            <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center text-3xl">🗺️</div>
            <h3 className="text-sm font-bold text-white text-center">Generate AI Survey Map</h3>
            <p className="text-xs text-gray-400 text-center max-w-xs">Converts satellite imagery into a clean official survey map in the style of Survey of India topographic sheets.</p>
            <p className="text-[10px] text-gray-500 text-center">API: {API_BASE}/api/pti</p>
            <button onClick={generateAI} className="px-6 py-3 bg-purple-500 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-purple-600 active:scale-95 transition-all">✨ Generate AI Survey Map</button>
            {aiError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 max-w-xs w-full mt-2">
                <p className="text-xs text-red-400 text-center mb-2">{aiError}</p>
                <button onClick={generateAI} className="w-full py-2 bg-red-500/20 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/30">Retry Connection</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && aiLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg className="animate-spin h-8 w-8 text-purple-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-sm text-purple-400">{aiProgress || 'Generating AI survey map...'}</p>
            <p className="text-xs text-gray-500">This may take a few minutes for large areas</p>
          </div>
        )}

        {activeTab === 'ai' && aiChunks.length > 0 && (
          <div className="px-4 mb-3 flex justify-end">
            <button onClick={() => { setAiChunks([]); setTimeout(generateAI, 100); }} className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              🔄 Regenerate AI Map
            </button>
          </div>
        )}

        {/* AI Chunks Rendering */}
        {activeTab === 'ai' && aiChunks.length > 0 && (
          <div className="px-4 flex flex-col gap-6 items-center pb-10">
            {aiChunks.map((chunk, i) => (
              <div key={i} className="bg-white shadow-2xl relative overflow-hidden ring-1 ring-white/20" style={{ width: '100%', maxWidth: 500, aspectRatio: '1' }}>
                <img src={chunk.imageBase64} alt={chunk.label} className="absolute inset-0 w-full h-full object-cover select-none" draggable={false} />
                <div className="absolute top-0 inset-x-0 bg-white/85 text-center py-1 z-10 pointer-events-none">
                  <span className="text-xs font-bold font-[Baloo_2]">Chunk {chunk.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* A4 Frame (for Sketch and Satellite) */}
        {activeTab !== 'ai' && displayImg && !(activeTab === 'satellite' && satLoading) && (
          <div className="px-4 flex justify-center pb-10">
            <div
              ref={frameRef}
              className="bg-white shadow-2xl relative overflow-hidden ring-1 ring-white/20"
              style={{ width: '100%', maxWidth: 500, aspectRatio: String(aspect) }}
              onPointerDown={handleDown}
              onPointerMove={handleMove}
              onPointerUp={handleUp}
              onPointerLeave={handleUp}
              onWheel={handleWheel}
            >
              <img src={displayImg} alt="Preview" className="absolute inset-0 w-full h-full object-cover select-none" draggable={false}
                style={{ transform: `translate(${panX}px,${panY}px) rotate(${rotate}deg) scale(${zoom})`, transformOrigin: 'center center', transition: isDrag.current ? 'none' : 'transform 0.1s', cursor: isDrag.current ? 'grabbing' : 'grab' }} />
              <div className="absolute top-0 inset-x-0 bg-white/85 text-center py-1 z-10 pointer-events-none">
                <span className="text-xs font-bold font-[Baloo_2]">HLB {mapData.hlbNumber}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/85 text-center py-0.5 z-10 pointer-events-none">
                <span className="text-[9px] text-gray-500">{mapData.enumeratorName} | {mapData.district}, {mapData.state}</span>
              </div>
              <div className="absolute top-1 left-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded z-10 pointer-events-none">{orient}</div>
              {activeTab === 'ai' && <div className="absolute top-1 right-1 bg-purple-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded z-10 pointer-events-none">AI</div>}
              {activeTab === 'satellite' && <div className="absolute top-1 right-1 bg-blue-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded z-10 pointer-events-none">SAT</div>}
              
              {/* UNPAID WATERMARK */}
              {!isPaid && (
                <div className="absolute inset-0 pointer-events-none flex flex-wrap content-center justify-center opacity-20 select-none z-20 overflow-hidden mix-blend-multiply">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div key={i} className="text-2xl font-black text-slate-900 rotate-[-30deg] m-6 whitespace-nowrap">
                      UNPAID PREVIEW
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
