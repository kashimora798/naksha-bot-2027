import React, { useEffect, useRef, useState } from 'react';
import { load } from '@cashfreepayments/cashfree-js';
import type { MapData, Block, Coordinate } from '../types';
import { supabase } from '../lib/supabase';
import { renderMapToCanvas, exportBlockPDF } from '../lib/pdf-export';
import { captureSatelliteForBoundary, captureFullSatellite, generateSurveyMapFromBoundary, fetchImageAsBase64, API_BASE, generateChunkedSurveyMaps } from '../lib/survey-api';
import { getBbox } from '../lib/geo';

interface Props { mapData: MapData; onBack: () => void; onExitToDashboard?: () => void; onUpdateMapData?: (data: Partial<MapData>) => void; }

type ViewTab = 'sketch' | 'satellite' | 'ai';

export default function PreviewScreen({ mapData, onBack, onExitToDashboard, onUpdateMapData }: Props) {
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [exportProgress, setExportProgress] = useState('');
  const [aiOpacity, setAiOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [mapImg, setMapImg] = useState('');
  const [orient, setOrient] = useState<'landscape' | 'portrait'>(mapData.orientation || 'portrait');
  const [sheetSize, setSheetSize] = useState<'a4' | 'a3'>(mapData.sheetSize || 'a4');
  const [showSidebar, setShowSidebar] = useState(false);

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
  const [aiPreviewImg, setAiPreviewImg] = useState<string | null>(null);
  const [aiPreviewResolve, setAiPreviewResolve] = useState<((approved: boolean) => void) | null>(null);
  
  // Feedback
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackUseful, setFeedbackUseful] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('naksha_preview_feedback')) {
      setShowFeedback(true);
      localStorage.setItem('naksha_preview_feedback', 'true');
    }
  }, []);

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
    if ((activeTab === 'satellite' || activeTab === 'ai') && !satImg && !satLoading && mapData.boundaryPins.length >= 3) {
      captureSatelliteOverlay();
    }
  }, [activeTab]);

  async function captureSatelliteOverlay() {
    setSatLoading(true);
    try {
      const { canvas: satCanvas, tileBounds } = await captureFullSatellite(mapData.boundaryPins, (msg) => setExportProgress(msg));
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
      renderMapToCanvas(sketchCanvas, { ...mapData, orientation: orient }, satCanvas.width, satCanvas.height, { transparentBg: true, hideSymbols: true, focusBounds: tileBounds });

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
      const result = await generateSurveyMapFromBoundary(
        mapData,
        orient,
        (msg) => setAiProgress(msg),
        (base64DataUrl) => {
          return new Promise<boolean>((resolve) => {
            setAiPreviewImg(base64DataUrl);
            setAiPreviewResolve(() => resolve);
          });
        }
      );

      if (result.success && result.imageUrl) {
        setAiImg(result.imageUrl);
        setAiChunks([]); // Clear old chunks if any
        if (onUpdateMapData) {
          onUpdateMapData({ surveyMapBase64: result.imageUrl, aiMapChunks: [] });
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

    setExporting(true);
    setExportProgress('Rendering map...');
    try {
      await new Promise(r => setTimeout(r, 100)); // yield for UI update
      const exportData = { ...mapData, sheetSize };
      if (aiChunks && aiChunks.length > 0) {
        exportData.aiMapChunks = aiChunks;
      } else if (aiImg) {
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

  async function submitFeedback() {
    if (!feedbackUseful) return alert('Please select how useful the app was!');
    setFeedbackLoading(true);
    try {
      const { error } = await supabase.from('feedbacks').insert({
        useful: feedbackUseful,
        suggestions: feedbackText,
        project_id: mapData.projectId || null,
        created_at: new Date().toISOString()
      });
      // Ignore errors if table doesn't exist
    } catch (err) {
      console.error(err);
    }
    setFeedbackSubmitted(true);
    setFeedbackLoading(false);
  }

  const blocks = mapData.blocks || [];
  const hasBlocks = blocks.length > 1;
  const aspect = orient === 'landscape' ? 297 / 210 : 210 / 297;
  const totalPages = hasBlocks ? blocks.length * 2 + 1 : 2;
  const displayImg = getDisplayImage();
  const isPaid = true;
  const isLimitReached = false;

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

        {/* FEEDBACK POPUP */}
        {showFeedback && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            {!feedbackSubmitted ? (
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-slate-800 mb-2 font-[Baloo_2] text-xl">Help us improve! 🚀</h3>
                <p className="text-sm text-slate-500 mb-6">We are currently in the active development phase. Your feedback is extremely valuable to us.</p>
                
                <div className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">1. How was it? Was it useful?</label>
                    <div className="flex gap-2">
                      {['Very Useful', 'Okay', 'Not Useful'].map(opt => (
                        <button key={opt} onClick={() => setFeedbackUseful(opt)} className={`flex-1 py-3 text-xs font-semibold rounded-xl border transition-colors ${feedbackUseful === opt ? 'bg-orange-500 text-white border-orange-500 shadow-md' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-3">2. What features or improvements would you suggest?</label>
                    <textarea 
                      value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                      placeholder="Tell us what's missing..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm h-32 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setShowFeedback(false)} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                      Skip
                    </button>
                    <button onClick={submitFeedback} disabled={feedbackLoading} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 disabled:opacity-70 transition-all">
                      {feedbackLoading ? 'Submitting...' : 'Submit'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center relative">
                <div className="text-6xl mb-4">🙏</div>
                <h3 className="font-bold text-green-800 text-2xl mb-2 font-[Baloo_2]">Thank You!</h3>
                <p className="text-sm text-slate-600 mb-6">Your feedback has been recorded. It helps us shape the future of NakshaBot.</p>
                <button onClick={() => setShowFeedback(false)} className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold font-[Baloo_2] shadow hover:bg-orange-600">
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─── EDITOR ─────────────────────────────────────────────
  return (
    <div className="h-full bg-[#111] flex flex-col relative overflow-hidden">
      
      {/* Floating Header UI */}
      <div className="absolute top-4 left-4 right-4 z-[45] flex flex-wrap gap-2 justify-between items-center pointer-events-none">
        <button onClick={onBack} className="pointer-events-auto bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-slate-200/50 text-sm text-gray-600 font-bold hover:text-gray-900 transition-colors">← Back</button>
        
        {/* Inline Tabs */}
        <div className="pointer-events-auto flex bg-white/90 backdrop-blur p-1.5 rounded-xl shadow-sm border border-slate-200/50">
          <button onClick={() => setActiveTab('sketch')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'sketch' ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>✏️ Sketch</button>
          <button onClick={() => setActiveTab('satellite')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'satellite' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>🛰️ Sat{satLoading ? '...' : ''}</button>
          <button onClick={() => setActiveTab('ai')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'ai' ? 'bg-purple-50 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>🗺️ AI Map{aiLoading ? '...' : ''}</button>
        </div>

        <button onClick={() => setShowSidebar(true)} className="pointer-events-auto bg-white/90 backdrop-blur p-2 rounded-xl shadow-sm border border-slate-200/50 text-gray-600 hover:text-gray-900 transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-auto relative bg-[#111] pt-24 pb-24">
        {/* AI PREVIEW DIALOG */}
        {aiPreviewImg && (
          <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-2xl w-full flex flex-col max-h-full">
              <h3 className="text-xl font-bold mb-4 font-[Baloo_2]">AI Image Preview (Debug)</h3>
              <p className="text-slate-500 text-sm mb-4">This is the exact image about to be sent to the AI engine. Approve it to continue.</p>
              
              <div className="flex-1 min-h-0 bg-slate-100 rounded-xl overflow-auto border border-slate-200 mb-6 flex justify-center">
                <img src={aiPreviewImg} alt="AI Input Preview" className="max-w-full object-contain" />
              </div>
              
              <div className="flex justify-end gap-4 shrink-0">
                <button
                  onClick={() => {
                    aiPreviewResolve?.(false);
                    setAiPreviewImg(null);
                    setAiPreviewResolve(null);
                  }}
                  className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    aiPreviewResolve?.(true);
                    setAiPreviewImg(null);
                    setAiPreviewResolve(null);
                  }}
                  className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg hover:-translate-y-0.5 transition-transform"
                >
                  Approve & Generate
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Icons for Zoom and Print */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[40]">
           <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors">+</button>
           <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors">−</button>
           <button onClick={resetView} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors mt-1 text-xs">Reset</button>
           <button onClick={handleExport} disabled={exporting || isLimitReached} className={`w-10 h-10 rounded-full shadow-lg font-bold flex items-center justify-center mt-3 transition-colors ${exporting ? 'bg-gray-400 text-white' : isLimitReached ? 'bg-red-400 text-white' : 'bg-orange-500 text-white'}`}>
              {exporting ? '⏳' : '🖨️'}
           </button>
        </div>

        {/* Sidebar Overlay */}
        {showSidebar && <div className="fixed inset-0 bg-black/50 z-[100] transition-opacity" onClick={() => setShowSidebar(false)} />}
        
        {/* Sliding Sidebar Settings */}
        <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-[101] transform transition-transform duration-300 ease-out flex flex-col ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}>
            <div className="p-4 border-b flex justify-between items-center bg-gray-50">
              <h2 className="font-bold text-gray-800">Settings</h2>
              <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:bg-gray-200 p-2 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="p-5 overflow-auto flex-1 space-y-6">
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Orientation</h3>
                <div className="flex gap-2">
                  <button onClick={() => { setOrient('landscape'); resetView(); }} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${orient === 'landscape' ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📄 Landscape</button>
                  <button onClick={() => { setOrient('portrait'); resetView(); }} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${orient === 'portrait' ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>📄 Portrait</button>
                </div>
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Sheet Size</h3>
                <div className="flex gap-2">
                  <button onClick={() => setSheetSize('a4')} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${sheetSize === 'a4' ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>A4</button>
                  <button onClick={() => setSheetSize('a3')} className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${sheetSize === 'a3' ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>A3</button>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">A3 is the official preference for layout maps; A4 prints on common printers.</p>
              </div>

              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Rotation</h3>
                <div className="grid grid-cols-4 gap-2">
                  {[0, 90, 180, 270].map(d => (
                    <button key={d} onClick={() => setRotate(d)} className={`py-2 rounded-lg text-xs font-semibold transition-all ${rotate === d ? 'bg-orange-500 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{d}°</button>
                  ))}
                </div>
              </div>
            </div>
        </div>

        {/* Loading and empty states */}
        {activeTab === 'satellite' && satLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-sm text-gray-400">{exportProgress || 'Loading satellite view...'}</p>
          </div>
        )}

        {activeTab === 'ai' && !aiImg && !aiLoading && (
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

        {activeTab === 'ai' && aiImg && (
          <div className="px-4 mb-3 flex justify-end">
            <button onClick={() => { setAiImg(''); setTimeout(generateAI, 100); }} className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              🔄 Regenerate AI Map
            </button>
          </div>
        )}

        {/* AI Rendering - Stitched over Satellite */}
        {activeTab === 'ai' && aiImg && (
          <div className="px-4 pb-10">
            <h3 className="text-white text-center font-bold mb-2 font-[Baloo_2]">Vision AI Detection Overlay</h3>
            <p className="text-gray-400 text-xs text-center mb-4">Compare the AI generated map directly with the satellite image.</p>
            
            <div className="mb-4 bg-gray-800 p-3 rounded-xl border border-gray-700">
              <div className="flex justify-between text-xs text-gray-400 mb-1 font-semibold">
                <span>Satellite</span>
                <span>AI Map</span>
              </div>
              <input 
                type="range" min="0" max="1" step="0.05" 
                value={aiOpacity} onChange={e => setAiOpacity(Number(e.target.value))}
                className="w-full accent-purple-500"
              />
            </div>

            <div className="flex justify-center">
              <div 
                className="bg-white shadow-2xl relative overflow-hidden ring-1 ring-white/20"
                style={{ width: '100%', maxWidth: 500, aspectRatio: String(aspect) }}
              >
                {/* Background Base: Full Satellite Map */}
                <img src={satImg || mapImg} className="absolute inset-0 w-full h-full object-cover" />
                
                {/* Foreground Overlay: Single AI Map */}
                <div className="absolute inset-0" style={{ opacity: aiOpacity }}>
                  <img src={aiImg.startsWith('data:') || aiImg.startsWith('http') ? aiImg : `data:image/jpeg;base64,${aiImg}`} className="w-full h-full object-fill pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab !== 'ai' && displayImg && !(activeTab === 'satellite' && satLoading) && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10">
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

      {/* AI Preview Modal */}
      {aiPreviewImg && (
        <div className="fixed inset-0 bg-black/80 z-[3000] flex flex-col items-center justify-center p-4">
          <h2 className="text-white font-bold text-lg mb-2">Review Image For AI</h2>
          <p className="text-gray-300 text-xs mb-4">This exact image will be sent to the AI for generation.</p>
          <img src={aiPreviewImg} className="max-w-full max-h-[60vh] object-contain rounded-lg border-2 border-purple-500 shadow-2xl mb-6" />
          <div className="flex gap-4">
            <button onClick={() => { aiPreviewResolve?.(false); setAiPreviewImg(null); setAiPreviewResolve(null); setAiLoading(false); setAiProgress(''); setAiError('Generation cancelled by user.'); }} className="px-6 py-3 rounded-full bg-gray-600 text-white font-bold hover:bg-gray-700">Cancel</button>
            <button onClick={() => { aiPreviewResolve?.(true); setAiPreviewImg(null); setAiPreviewResolve(null); }} className="px-6 py-3 rounded-full bg-purple-500 text-white font-bold hover:bg-purple-600 shadow-lg">Confirm & Send to AI ✨</button>
          </div>
        </div>
      )}
    </div>
  );
}
