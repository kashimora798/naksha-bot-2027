import React, { useEffect, useRef, useState } from 'react';
import type { MapData, Block, Coordinate } from '../types';
import { supabase } from '../lib/supabase';
import DonationPopup from '../components/DonationPopup';
import { renderMapToCanvas, exportBlockPDF } from '../lib/pdf-export';
import { captureSatelliteForBoundary, captureFullSatellite, generateSurveyMapFromBoundary, fetchImageAsBase64, API_BASE, generateChunkedSurveyMaps } from '../lib/survey-api';
import { getBbox } from '../lib/geo';
import { DEMO_AI_IMAGE_URL } from '../data/demo';

interface Props { mapData: MapData; onBack: () => void; onExitToDashboard?: () => void; onUpdateMapData?: (data: Partial<MapData>) => void; isDemoMode?: boolean; }

type ViewTab = 'sketch' | 'satellite' | 'ai';

// Saved AI image from Supabase image_generations table
interface SavedAiImage {
  id: string;
  image_url: string;
  prompt: string;
  created_at: string;
  selected: boolean;
}

// Steps for the export progress modal
const EXPORT_STEPS = [
  { key: 'satellite', label: 'Capturing satellite view' },
  { key: 'overview', label: 'Drawing map overview' },
  { key: 'blocks', label: 'Rendering block sheets' },
  { key: 'ai', label: 'Adding AI map pages' },
  { key: 'register', label: 'Generating HLO register' },
  { key: 'compile', label: 'Compiling PDF' },
  { key: 'done', label: 'Download ready!' },
];

export default function PreviewScreen({ mapData, onBack, onExitToDashboard, onUpdateMapData, isDemoMode }: Props) {
  const [exported, setExported] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDonation, setShowDonation] = useState(false);
  const [donationStage, setDonationStage] = useState<'ask' | 'appreciate' | 'share'>('ask');
  const [donationHindi, setDonationHindi] = useState(true);
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const [copiedText, setCopiedText] = useState<'upi' | 'phone' | null>(null);

  const handleCopy = (text: string, type: 'upi' | 'phone') => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedText(type);
      setTimeout(() => setCopiedText(null), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };
  const [exportProgress, setExportProgress] = useState('');
  const [exportStep, setExportStep] = useState(''); // current step key for modal
  const [aiOpacity, setAiOpacity] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotate, setRotate] = useState(0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [mapImg, setMapImg] = useState('');
  const [orient, setOrient] = useState<'landscape' | 'portrait'>(mapData.orientation || 'portrait');
  const [sheetSize, setSheetSize] = useState<'a4' | 'a3'>(mapData.sheetSize || 'a4');
  const [showSidebar, setShowSidebar] = useState(false);
  const [tourOpen, setTourOpen] = useState(true);
  const [includeBlocks, setIncludeBlocks] = useState(false);
  const [inkMode, setInkMode] = useState<'color' | 'black' | 'blue'>('color');
  const [hideSerpentineArrows, setHideSerpentineArrows] = useState(false);
  const [hideHouseNumbers, setHideHouseNumbers] = useState(false);

  // Tab system
  const [activeTab, setActiveTab] = useState<ViewTab>('sketch');

  // Satellite + overlay
  const [satImg, setSatImg] = useState('');
  const [satOverlayImg, setSatOverlayImg] = useState('');
  const [satLoading, setSatLoading] = useState(false);

  // AI survey map - current session image
  const [aiImg, setAiImg] = useState<string | null>(mapData.surveyMapBase64 || null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiProgress, setAiProgress] = useState('');
  const [aiChunks, setAiChunks] = useState<{ label: string; bbox: Coordinate[]; imageBase64: string }[]>(mapData.aiMapChunks || []);
  const [aiPreviewImg, setAiPreviewImg] = useState<string | null>(null);
  const [aiPreviewResolve, setAiPreviewResolve] = useState<((approved: boolean) => void) | null>(null);

  // Saved AI images from Supabase (persisted across sessions)
  const [savedAiImages, setSavedAiImages] = useState<SavedAiImage[]>([]);
  const [savedImagesLoading, setSavedImagesLoading] = useState(false);
  // Images selected by user for inclusion in the PDF
  const [pdfSelectedImageIds, setPdfSelectedImageIds] = useState<Set<string>>(new Set());

  // Regen allowance tracking
  const [regenAllowance, setRegenAllowance] = useState<number>(1);
  const [regenUsed, setRegenUsed] = useState<number>(0);
  const [regenLoading, setRegenLoading] = useState(false);

  // Feedback
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackUseful, setFeedbackUseful] = useState<string | null>(null);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);



  // ─── LOAD SAVED AI IMAGES FROM SUPABASE ────────────────
  useEffect(() => {
    if (!mapData.projectId || isDemoMode) return;
    setSavedImagesLoading(true);
    supabase
      .from('image_generations')
      .select('id, image_url, prompt, created_at, selected')
      .eq('project_id', mapData.projectId)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('Failed to load saved AI images:', error); }
        if (data && data.length > 0) {
          setSavedAiImages(data as SavedAiImage[]);
          // Pre-select images that were previously marked selected
          const preSelected = new Set(data.filter(img => img.selected).map(img => img.id));
          setPdfSelectedImageIds(preSelected);
          // Restore latest image into view if we don't already have one
          if (!aiImg) {
            setAiImg(data[0].image_url);
          }
        }
        setSavedImagesLoading(false);
      });
  }, [mapData.projectId]);

  // ─── LOAD REGEN ALLOWANCE ───────────────────────────────
  useEffect(() => {
    if (!mapData.projectId || isDemoMode) return;
    setRegenLoading(true);
    supabase
      .from('projects')
      .select('regen_allowance, regen_used')
      .eq('id', mapData.projectId)
      .single()
      .then(({ data, error }) => {
        if (data) {
          setRegenAllowance(data.regen_allowance ?? 1);
          setRegenUsed(data.regen_used ?? 0);
        }
        setRegenLoading(false);
      });
  }, [mapData.projectId]);

  // Toggle whether a saved image is selected for PDF
  async function toggleImageForPdf(imageId: string) {
    const newSet = new Set(pdfSelectedImageIds);
    const nowSelected = !newSet.has(imageId);
    if (nowSelected) newSet.add(imageId);
    else newSet.delete(imageId);
    setPdfSelectedImageIds(newSet);
    // Persist to DB
    await supabase
      .from('image_generations')
      .update({ selected: nowSelected })
      .eq('id', imageId);
  }

  const isDrag = useRef(false);
  const lastP = useRef({ x: 0, y: 0 });
  const frameRef = useRef<HTMLDivElement>(null);

  // INTENTIONAL: Payment gate disabled for hackathon demo — all features unlocked.
  // To re-enable, query project.is_paid from Supabase instead of hardcoding.
  const isPaid = true;
  const regenLimitReached = !isDemoMode && regenUsed >= regenAllowance;

  useEffect(() => {
    const c = document.createElement('canvas');
    const isL = orient === 'landscape';
    const long = 2000;
    const short = 1400;
    renderMapToCanvas(c, { ...mapData, orientation: orient }, isL ? long : short, isL ? short : long, {
      watermark: false,
      inkMode,
      hideSerpentineArrows,
      hideHouseNumbers
    });
    setMapImg(c.toDataURL('image/jpeg', 0.9));
  }, [mapData, orient, inkMode, hideSerpentineArrows, hideHouseNumbers]);

  useEffect(() => { if (mapImg) { setZoom(1); setRotate(0); setPanX(0); setPanY(0); } }, [mapImg]);

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
      const overlayCanvas = document.createElement('canvas');
      overlayCanvas.width = satCanvas.width;
      overlayCanvas.height = satCanvas.height;
      const ctx = overlayCanvas.getContext('2d')!;
      ctx.drawImage(satCanvas, 0, 0);
      const sketchCanvas = document.createElement('canvas');
      renderMapToCanvas(sketchCanvas, { ...mapData, orientation: orient }, satCanvas.width, satCanvas.height, { transparentBg: true, hideSymbols: true, focusBounds: tileBounds });
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
    if (isDemoMode) {
      setAiError('');
      setAiLoading(true);
      setAiProgress('Generating AI survey map…');
      await new Promise(r => setTimeout(r, 900));
      setAiImg(DEMO_AI_IMAGE_URL);
      setAiChunks([]);
      setAiProgress('');
      setAiLoading(false);
      return;
    }
    if (regenLimitReached) {
      setAiError('Daily AI generation limit reached. Your quota resets at midnight UTC.');
      return;
    }
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
        setAiChunks([]);
        if (onUpdateMapData) {
          onUpdateMapData({ surveyMapBase64: result.imageUrl, aiMapChunks: [] });
        }
        setAiProgress('');
        // Refresh saved images and regen count from DB
        refreshSavedImages();
        setRegenUsed(u => u + 1);
      } else {
        setAiError(result.error || 'Failed to generate AI survey maps');
      }
    } catch (err: any) {
      setAiError(err.message || 'Network error');
    } finally {
      setAiLoading(false);
    }
  }

  async function refreshSavedImages() {
    if (!mapData.projectId) return;
    const { data } = await supabase
      .from('image_generations')
      .select('id, image_url, prompt, created_at, selected')
      .eq('project_id', mapData.projectId)
      .order('created_at', { ascending: false });
    if (data) {
      setSavedAiImages(data as SavedAiImage[]);
      const { data: proj } = await supabase
        .from('projects')
        .select('regen_allowance, regen_used')
        .eq('id', mapData.projectId)
        .single();
      if (proj) {
        setRegenAllowance(proj.regen_allowance ?? 1);
        setRegenUsed(proj.regen_used ?? 0);
      }
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
    if (mapData.autoExport && !exported && !exporting) {
      mapData.autoExport = false;
      const timer = setTimeout(() => { handleExport(); }, 500);
      return () => clearTimeout(timer);
    }
  }, [mapData.autoExport, exported, exporting]);

  function buildExportData() {
    const exportData = { ...mapData, sheetSize, orientation: orient };
    (exportData as any).includeBlockSheets = includeBlocks;
    (exportData as any).renderOptions = {
      ...((mapData as any).renderOptions || {}),
      inkMode,
      hideSerpentineArrows,
      hideHouseNumbers,
      rotation: rotate
    };
    if (aiChunks && aiChunks.length > 0) {
      exportData.aiMapChunks = aiChunks;
    } else if (aiImg) {
      exportData.surveyMapBase64 = aiImg;
    }
    // Attach selected AI images from saved gallery for multi-image PDF
    const selectedUrls = savedAiImages
      .filter(img => pdfSelectedImageIds.has(img.id))
      .map(img => img.image_url);
    (exportData as any).selectedAiImages = selectedUrls;
    return exportData;
  }

  // Map progress message to a step key for the modal
  function progressToStep(msg: string): string {
    const m = msg.toLowerCase();
    if (m.includes('satellite') || m.includes('tile') || m.includes('capturing')) return 'satellite';
    if (m.includes('overview') || m.includes('overview') || m.includes('render')) return 'overview';
    if (m.includes('block') || m.includes('page')) return 'blocks';
    if (m.includes('ai') || m.includes('survey map')) return 'ai';
    if (m.includes('register') || m.includes('hlo')) return 'register';
    if (m.includes('compil') || m.includes('pdf')) return 'compile';
    if (m.includes('done') || m.includes('ready') || m.includes('download')) return 'done';
    return exportStep;
  }

  function progressFn(msg: string) {
    setExportProgress(msg);
    setExportStep(progressToStep(msg));
  }

  async function handleExport(exportType: 'map' | 'register_pdf' | 'register_xlsx' = 'map') {
    if (isDemoMode) {
      if (exportType !== 'map') { alert('Register export is not available in demo mode.'); return; }
      setExporting(true);
      setExportStep('overview');
      setExportProgress('Rendering map...');
      try {
        await new Promise(r => setTimeout(r, 100));
        await exportBlockPDF(buildExportData(), orient, progressFn);
        setExported(true);
        setFeedbackSubmitted(false);
        setShowFeedback(true);
      } catch (err) {
        console.error(err);
        alert('Export failed — please try again.');
      }
      setExporting(false);
      setExportProgress('');
      setExportStep('');
      return;
    }

    if (!mapData.projectId) { alert('Project/Session is still saving — please wait a moment and try again.'); return; }

    setExporting(true);
    setExportStep('satellite');
    setExportProgress('Rendering print-ready PDF…');
    try {
      if (!mapData.isLive) {
        await supabase.from('projects').update({ data: buildExportData() }).eq('id', mapData.projectId);
      }

      if (exportType === 'map') {
        await new Promise(r => setTimeout(r, 100));
        await exportBlockPDF(buildExportData(), orient, progressFn);
        setExportStep('done');
        if (!mapData.isLive) {
          await supabase.rpc('increment_export_count', { proj_id: mapData.projectId });
          mapData.exportCount = (mapData.exportCount || 0) + 1;
        }
      } else if (exportType === 'register_pdf') {
        setExportStep('register');
        setExportProgress('Generating HLO Register PDF…');
        await new Promise(r => setTimeout(r, 100));
        const { exportRegisterPDF } = await import('../lib/register-export');
        exportRegisterPDF(mapData.locationName || 'Live Survey', mapData.hlbNumber || 'LIVE', mapData.symbols, mapData.numberingSystem);
        setExportStep('done');
      } else if (exportType === 'register_xlsx') {
        setExportStep('register');
        setExportProgress('Generating HLO Register XLSX…');
        await new Promise(r => setTimeout(r, 100));
        const { exportRegisterXLSX } = await import('../lib/register-export');
        exportRegisterXLSX(mapData.locationName || 'Live Survey', mapData.hlbNumber || 'LIVE', mapData.symbols, mapData.numberingSystem);
        setExportStep('done');
      }
      setExported(true);
      setFeedbackSubmitted(false);
      setShowFeedback(true);
    } catch (err) {
      console.error(err);
      alert('Export failed — please try again.');
    }
    setExporting(false);
    setExportProgress('');
    setExportStep('');
  }

  async function submitFeedback() {
    if (!feedbackUseful) return alert('Please select how useful the app was!');
    setFeedbackLoading(true);
    try {
      await supabase.from('feedbacks').insert({ useful: feedbackUseful, suggestions: feedbackText, project_id: mapData.projectId || null, created_at: new Date().toISOString() });
    } catch (err) { console.error(err); }
    setFeedbackSubmitted(true);
    setFeedbackLoading(false);
  }

  const blocks = mapData.blocks || [];
  const hasBlocks = blocks.length > 1;
  const aspect = orient === 'landscape' ? 297 / 210 : 210 / 297;
  const selectedAiCount = pdfSelectedImageIds.size;
  const totalPages = (hasBlocks ? 2 : 1) + (includeBlocks && hasBlocks ? blocks.length * 2 : 0) + (selectedAiCount > 0 ? selectedAiCount * 2 : (aiImg ? 2 : 0));
  const displayImg = getDisplayImage();
  const regenRemaining = Math.max(0, regenAllowance - regenUsed);

  // ─── EXPORT PROGRESS MODAL ───────────────────────────────
  function ExportProgressModal() {
    if (!exporting) return null;
    const currentIdx = EXPORT_STEPS.findIndex(s => s.key === exportStep);
    const hasAiImages = selectedAiCount > 0 || !!aiImg;
    const stepsToShow = EXPORT_STEPS.filter(s => s.key !== 'ai' || hasAiImages).filter(s => s.key !== 'register' || exportStep === 'register' || (mapData.isLive));

    return (
      <div className="fixed inset-0 z-[6000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-5 text-white">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
              <div>
                <p className="font-black text-base font-public-sans">Preparing your PDF…</p>
                <p className="text-white/80 text-xs">Please don't close this tab</p>
              </div>
            </div>
          </div>

          {/* Step list */}
          <div className="px-6 py-5 space-y-3">
            {stepsToShow.map((step, idx) => {
              const stepIdx = EXPORT_STEPS.findIndex(s => s.key === step.key);
              const isDone = currentIdx > stepIdx;
              const isCurrent = exportStep === step.key;
              const isPending = currentIdx < stepIdx;
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                    isDone ? 'bg-green-500' : isCurrent ? 'bg-orange-500' : 'bg-gray-100'
                  }`}>
                    {isDone ? (
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : isCurrent ? (
                      <svg className="w-3.5 h-3.5 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <span className={`text-sm font-semibold transition-colors ${
                    isDone ? 'text-green-700 line-through decoration-green-300' :
                    isCurrent ? 'text-orange-700' : 'text-gray-400'
                  }`}>{step.label}</span>
                  {isCurrent && exportProgress && (
                    <span className="ml-auto text-[10px] text-gray-400 truncate max-w-[100px]">{exportProgress}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="px-6 pb-5">
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-amber-400 rounded-full transition-all duration-700"
                style={{ width: `${Math.max(5, currentIdx >= 0 ? ((currentIdx + 1) / stepsToShow.length) * 100 : 5)}%` }}
              />
            </div>
            <p className="text-[11px] text-center text-gray-400 mt-2">This may take 20–60 seconds for large maps</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── SUCCESS ─────────────────────────────────────────────
  if (exported) {
    const waShareMsg = `मैंने एक साथी छात्र की मदद की 🙏\n\nNakshaBot से HLB-${mapData.hlbNumber || '?'} का नक्शा मिनटों में तैयार हो गया — बिल्कुल मुफ्त और Census 2027 के लिए ready!\n\nआप भी try करें 👉 https://examsetu.dev\n\n(Kratagya SINGH के अकेले बनाए इस tool ने घंटों का काम बचाया)`;

    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 via-white to-amber-50 flex flex-col items-center justify-start px-4 py-8 overflow-auto">
        {/* Animated Check */}
        <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center mb-4 shadow-xl" style={{ animation: 'bounceIn 0.5s ease-out' }}>
          <span className="text-white text-4xl">✓</span>
        </div>
        <h2 className="text-2xl font-black text-gray-800 font-public-sans mb-1">
          वाह! नक्शा तैयार है! 🎉
        </h2>
        <p className="text-sm text-gray-500 mb-1 font-medium">HLB-{mapData.hlbNumber || 'Draft'} — {totalPages} pages downloaded</p>
        {mapData.enumeratorName && (
          <p className="text-xs text-indigo-600 font-semibold mb-4 bg-indigo-50 px-3 py-1 rounded-full">
            🙋 बनाया: {mapData.enumeratorName}
          </p>
        )}

        <div className="w-full max-w-sm space-y-3">
          {/* File card */}
          <div className="bg-white rounded-2xl shadow-md p-4 text-center space-y-2 border border-green-100">
            <p className="text-sm font-bold text-gray-700 font-jetbrains-mono">HLB_{mapData.hlbNumber}_Naksha_2027.pdf</p>
            {hasBlocks && (
              includeBlocks ? (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">{blocks.length} blocks × 2 pages + overview = {totalPages} pages</p>
              ) : (
                <p className="text-xs text-blue-600 bg-blue-50 rounded-lg p-2">Overview only = {totalPages} pages</p>
              )
            )}
            {selectedAiCount > 0 && <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2">✨ {selectedAiCount} AI Survey Map{selectedAiCount > 1 ? 's' : ''} included</p>}
            {aiImg && selectedAiCount === 0 && <p className="text-xs text-purple-600 bg-purple-50 rounded-lg p-2">✨ AI Survey Map included</p>}
            <div className="bg-amber-50 rounded-lg p-2"><p className="text-xs text-amber-700">💡 Print at cyber café — A4 {orient}</p></div>
          </div>

          {/* WhatsApp Share Card */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-4 space-y-2.5 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">📲</span>
              <p className="text-sm font-black text-green-800">साथियों को बताएं — Share करें!</p>
            </div>
            <div className="bg-white border border-green-100 rounded-xl p-3 text-xs text-slate-600 leading-relaxed italic shadow-inner">
              "मैंने एक साथी छात्र की मदद की 🙏 — NakshaBot से HLB नक्शा मिनटों में!<br/>
              Try it free: <span className="text-green-600 font-bold not-italic">examsetu.dev</span>"
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(waShareMsg)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 bg-[#25D366] hover:bg-[#1EBE5E] text-white text-center font-black text-sm rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.117.551 4.102 1.514 5.831L.054 23.617a.75.75 0 00.917.921l5.91-1.476A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.75a9.693 9.693 0 01-4.932-1.35l-.353-.21-3.658.915.961-3.55-.229-.364A9.694 9.694 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/></svg>
              WhatsApp पर Share करें
            </a>
            <p className="text-center text-[10px] text-green-600 font-medium">🔄 WhatsApp forwarding = free acquisition for NakshaBot</p>
          </div>

          {/* Impact line */}
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 text-center space-y-1">
            <p className="text-xs font-black text-orange-900">💡 आपका ₹100 = Kratagya की एक हफ्ते की स्टेशनरी ✏️📒</p>
            <p className="text-[11px] text-orange-700">₹50 = एक दिन का लंच | ₹500 = एक महीने का इंटरनेट | ₹1000 = परीक्षा फॉर्म की फीस</p>
          </div>

          {/* CTAs */}
          <button onClick={() => { setDonationStage('ask'); setShowDonation(true); }} className="w-full py-3.5 bg-orange-500 text-white rounded-xl font-black font-public-sans shadow-lg hover:bg-orange-600 active:scale-[0.98] transition-all" style={{ height: 52 }}>
            🙏 Support Kratagya (Donate)
          </button>
          <button onClick={() => handleExport()} className="w-full py-2 border-2 border-orange-300 text-orange-600 rounded-xl text-sm font-semibold hover:bg-orange-50 transition-colors">📥 Download Again</button>
        </div>
        <style>{`@keyframes bounceIn { 0% { transform: scale(0.3); opacity: 0; } 60% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }`}</style>

        {/* Unified Donation Popup */}
        <DonationPopup
          isOpen={showDonation}
          onClose={() => setShowDonation(false)}
          onMute24h={() => setShowDonation(false)}
        />

        {showFeedback && (
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            {!feedbackSubmitted ? (
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
                <h3 className="font-bold text-slate-800 mb-2 font-public-sans text-xl">नक्शा कैसा लगा? / How is the Map? 🚀</h3>
                <div className="text-xs text-slate-500 mb-4 leading-relaxed space-y-2">
                  <p>
                    मैं एक छात्र हूँ जिसने अकेले यह ऐप बनाया है। आपका फीडबैक मेरे लिए सबसे बड़ी मदद है — <strong>कृपया 1 मिनट निकालकर जरूर बताएं कि ऐप कैसा लगा!</strong>
                  </p>
                  <p className="border-t border-slate-100 pt-1">
                    I am a student who built this app solo. Your feedback is my biggest help — <strong>please take 1 minute to let me know how it was!</strong>
                  </p>
                </div>

                {/* Donate Appeal Box */}
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-center">
                  <p className="text-xs text-orange-950 font-bold leading-snug">
                    {donationHindi ? '💖 ऐप उपयोगी लगा? आप छात्र की मदद कर सकते हैं' : '💖 Found it useful? You can help a student'}
                  </p>
                  <button
                    onClick={() => {
                      setShowFeedback(false);
                      setShowDonation(true);
                      setDonationStage('ask');
                    }}
                    className="mt-2 w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-lg shadow active:scale-95 transition-all"
                  >
                    🤝 {donationHindi ? 'मदद करें (Donate / Help Student)' : 'Help a Student (Donate)'}
                  </button>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      1. ऐप कितना उपयोगी रहा? / How useful was the app?
                    </label>
                    <div className="flex gap-2">
                      {[
                        { label: 'बहुत बढ़िया', eng: 'Very Useful' },
                        { label: 'ठीक-ठाक', eng: 'Okay' },
                        { label: 'काम का नहीं', eng: 'Not Useful' }
                      ].map(opt => (
                        <button 
                          key={opt.eng} 
                          onClick={() => setFeedbackUseful(opt.eng)} 
                          className={`flex-grow flex flex-col items-center justify-center py-2 px-1 text-[10px] font-semibold rounded-xl border transition-all ${feedbackUseful === opt.eng ? 'bg-orange-500 text-white border-orange-500 shadow-md scale-105' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}`}
                          style={{ minHeight: '44px' }}
                        >
                          <span>{opt.label}</span>
                          <span className="opacity-75 text-[9px] font-normal">({opt.eng})</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      2. कोई समस्या आई या कोई सुझाव है? / Any issues or suggestions?
                    </label>
                    <textarea 
                      value={feedbackText} 
                      onChange={e => setFeedbackText(e.target.value)} 
                      placeholder="यहाँ लिखें... / Write here..." 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs h-24 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none" 
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => setShowFeedback(false)} 
                      className="flex-1 py-2 text-xs bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                      style={{ minHeight: '40px' }}
                    >
                      छोड़ें / Skip
                    </button>
                    <button 
                      onClick={submitFeedback} 
                      disabled={feedbackLoading} 
                      className="flex-1 py-2 text-xs bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 disabled:opacity-70 transition-all"
                      style={{ minHeight: '40px' }}
                    >
                      {feedbackLoading ? 'Submitting...' : 'जमा करें / Submit'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center relative animate-in fade-in zoom-in duration-300">
                <div className="text-6xl mb-4">🙏</div>
                <h3 className="font-bold text-green-800 text-2xl mb-2 font-public-sans">धन्यवाद! / Thank You!</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  आपका फीडबैक मिल गया है। इससे ऐप को बेहतर बनाने में बहुत मदद मिलेगी।
                  <br />
                  <span className="text-xs text-slate-500">Your feedback has been received. This will help make the app much better.</span>
                </p>

                {/* Donate Appeal Box */}
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-5 text-center">
                  <p className="text-xs text-orange-950 font-bold leading-snug">
                    Class 12 के छात्र की पढ़ाई में सहायता करें / Support Class 12 student's studies
                  </p>
                  <button
                    onClick={() => {
                      setShowFeedback(false);
                      setShowDonation(true);
                      setDonationStage('ask');
                    }}
                    className="mt-2 w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-lg shadow active:scale-95 transition-all"
                  >
                    🤝 {donationHindi ? 'मदद करें (Donate / Help Student)' : 'Help a Student (Donate)'}
                  </button>
                </div>

                <button 
                  onClick={() => setShowFeedback(false)} 
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold font-public-sans shadow hover:bg-orange-600"
                  style={{ minHeight: '48px' }}
                >
                  बंद करें / Close
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

      {/* Export Progress Modal */}
      <ExportProgressModal />

      {/* Floating Header UI */}
      <div className="absolute top-4 left-4 right-4 z-[45] flex flex-wrap gap-2 justify-between items-center pointer-events-none">
        <button onClick={onBack} className="pointer-events-auto bg-white/90 backdrop-blur px-4 py-2 rounded-xl shadow-sm border border-slate-200/50 text-sm text-gray-600 font-bold hover:text-gray-900 transition-colors">← Back</button>

        {/* Inline Tabs */}
        <div className="pointer-events-auto flex bg-white/90 backdrop-blur p-1.5 rounded-xl shadow-sm border border-slate-200/50">
          <button onClick={() => setActiveTab('sketch')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'sketch' ? 'bg-orange-50 text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>✏️ Sketch</button>
          <button onClick={() => setActiveTab('satellite')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'satellite' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>🛰️ Sat{satLoading ? '...' : ''}</button>
          <button onClick={() => setActiveTab('ai')} className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === 'ai' ? 'bg-purple-50 text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>
            🗺️ AI Map{aiLoading ? '...' : ''}
            {savedAiImages.length > 0 && <span className="ml-1 bg-purple-500 text-white text-[9px] px-1.5 py-0.5 rounded-full">{savedAiImages.length}</span>}
          </button>
        </div>

        <button onClick={() => setShowSidebar(true)} className="pointer-events-auto bg-white/90 backdrop-blur px-3 py-2 rounded-xl shadow-sm border border-slate-200/50 text-gray-600 hover:text-gray-900 transition-colors flex items-center gap-1.5 text-xs font-bold">
          <span>⚙️ Settings & Options</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto relative bg-[#111] pt-24 pb-24">
        {/* AI PREVIEW DIALOG */}
        {aiPreviewImg && (
          <div className="absolute inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-2xl w-full flex flex-col max-h-full">
              <h3 className="text-xl font-bold mb-4 font-public-sans">AI Image Preview (Debug)</h3>
              <p className="text-slate-500 text-sm mb-4">This is the exact image about to be sent to the AI engine. Approve it to continue.</p>
              <div className="flex-1 min-h-0 bg-slate-100 rounded-xl overflow-auto border border-slate-200 mb-6 flex justify-center">
                <img src={aiPreviewImg} alt="AI Input Preview" className="max-w-full object-contain" />
              </div>
              <div className="flex justify-end gap-4 shrink-0">
                <button onClick={() => { aiPreviewResolve?.(false); setAiPreviewImg(null); setAiPreviewResolve(null); }} className="px-6 py-3 rounded-xl font-bold bg-slate-100 text-slate-700 hover:bg-slate-200">Cancel</button>
                <button onClick={() => { aiPreviewResolve?.(true); setAiPreviewImg(null); setAiPreviewResolve(null); }} className="px-6 py-3 rounded-xl font-bold bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-lg hover:-translate-y-0.5 transition-transform">Approve & Generate</button>
              </div>
            </div>
          </div>
        )}

        {/* Floating Icons for Zoom and Print */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-[40]">
          <button onClick={() => setZoom(z => Math.min(5, z + 0.2))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors">+</button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.2))} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors">−</button>
          <button onClick={resetView} className="w-10 h-10 bg-white/90 backdrop-blur rounded-full shadow-lg font-bold flex items-center justify-center text-gray-700 hover:text-orange-600 transition-colors mt-1 text-xs">Reset</button>
          <button
            onClick={() => handleExport()}
            disabled={exporting}
            title="Download print-ready PDF"
            className={`w-10 h-10 rounded-full shadow-lg font-bold flex items-center justify-center mt-3 transition-colors ${exporting ? 'bg-gray-400 text-white' : 'bg-orange-500 text-white'}`}>
            {exporting ? '⏳' : '🖨️'}
          </button>
        </div>

        {/* Prominent bottom CTA */}
        {!isDemoMode && !exporting && (
          <div className="absolute left-0 right-0 bottom-[calc(1.2rem+env(safe-area-inset-bottom,0px))] z-[55] flex justify-center px-4 pointer-events-none">
            {mapData.isLive ? (
              <div className="pointer-events-auto w-full max-w-md flex flex-col gap-2">
                <button onClick={() => handleExport('map')} className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2">🖨️ Download Map PDF</button>
                <div className="flex gap-2">
                  <button onClick={() => handleExport('register_pdf')} className="flex-1 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-xs shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">📄 Register PDF (A3)</button>
                  <button onClick={() => handleExport('register_xlsx')} className="flex-1 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-1.5">📊 Register Excel (XLSX)</button>
                </div>
              </div>
            ) : (
              <button onClick={() => handleExport('map')} className="pointer-events-auto w-full max-w-md py-4 rounded-2xl font-black text-base shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 bg-orange-500 text-white">
                🖨️ Print / Download PDF{selectedAiCount > 0 ? ` (+${selectedAiCount} AI maps)` : ''}
              </button>
            )}
          </div>
        )}

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
              <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-2" style={{ textTransform: 'uppercase' }}>Print Options</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-xl px-4 py-3 border border-slate-200/50 hover:bg-gray-100 transition-colors">
                  <input type="checkbox" checked={includeBlocks} onChange={e => setIncludeBlocks(e.target.checked)} className="rounded text-orange-500 w-4 h-4" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">Print Block Sheets</p>
                    <p className="text-[10px] text-slate-500">Include separate pages for each block</p>
                  </div>
                </label>

                <div>
                  <p className="text-xs font-bold text-slate-500 mb-1.5">Ink Color Mode</p>
                  <div className="flex gap-2">
                    {(['color', 'black', 'blue'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setInkMode(mode)}
                        className={`flex-1 py-2 rounded-xl text-[10px] font-bold capitalize transition-all ${
                          inkMode === mode
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        style={{ minHeight: '32px' }}
                      >
                        {mode === 'color' ? '🎨 Color' : mode === 'black' ? '⬛ Black' : '🟦 Blue'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <p className="text-xs font-bold text-slate-500 mb-2">नक्शा अनुकूलन / Map Toggles</p>
                  <div className="space-y-2 bg-gray-50 border border-slate-200/50 rounded-xl p-3">
                    <label className="flex items-center justify-between cursor-pointer select-none">
                      <div className="flex flex-col pr-2">
                        <span className="text-xs font-bold text-slate-700">🔄 ऑटो सर्पीला मार्ग (Route Arrows)</span>
                        <span className="text-[9px] text-slate-400 font-normal">Show serpentine arrows & START/END badges</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={!hideSerpentineArrows}
                        onChange={(e) => setHideSerpentineArrows(!e.target.checked)}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400 cursor-pointer"
                      />
                    </label>
                    <label className="flex items-center justify-between border-t border-slate-200/40 pt-2 cursor-pointer select-none">
                      <div className="flex flex-col pr-2">
                        <span className="text-xs font-bold text-slate-700">🔢 मकान नंबर (House Numbers)</span>
                        <span className="text-[9px] text-slate-400 font-normal">Show house numbers inside shapes</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={!hideHouseNumbers}
                        onChange={(e) => setHideHouseNumbers(!e.target.checked)}
                        className="w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-400 cursor-pointer"
                      />
                    </label>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rotation (रोटेशन)</h3>
                <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">{rotate}°</span>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={rotate}
                  onChange={(e) => setRotate(parseInt(e.target.value))}
                  className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
                />
                <button
                  onClick={() => setRotate(0)}
                  className="px-2.5 py-1 text-[10px] font-bold bg-gray-150 hover:bg-gray-200 text-gray-700 rounded border border-gray-300 transition-colors"
                >Reset</button>
              </div>
            </div>

            {/* AI Map PDF inclusion (inside sidebar too) */}
            {savedAiImages.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">AI Maps in PDF ({selectedAiCount} selected)</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {savedAiImages.map(img => (
                    <label key={img.id} className="flex items-center gap-3 cursor-pointer bg-gray-50 rounded-lg px-3 py-2">
                      <input type="checkbox" checked={pdfSelectedImageIds.has(img.id)} onChange={() => toggleImageForPdf(img.id)} className="rounded text-purple-500 w-4 h-4" />
                      <img src={img.image_url} alt="AI map" className="w-10 h-8 object-cover rounded" />
                      <span className="text-[10px] text-gray-500 truncate">{new Date(img.created_at).toLocaleDateString()}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading and empty states */}
        {activeTab === 'satellite' && satLoading && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <svg className="animate-spin h-8 w-8 text-blue-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
            <p className="text-sm text-gray-400">{exportProgress || 'Loading satellite view...'}</p>
          </div>
        )}

        {/* ── AI TAB CONTENT ── */}
        {activeTab === 'ai' && (
          <div className="px-4 pb-28 space-y-4">

            {/* Regen usage counter */}
            {!isDemoMode && (
              <div className="bg-white/8 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  <div>
                    <p className="text-white text-xs font-bold">AI Generations (today)</p>
                    <p className="text-gray-400 text-[10px]">{regenUsed} used of {regenAllowance} — resets midnight UTC</p>
                  </div>
                </div>
                <span className={`text-xs font-black ${regenLimitReached ? 'text-red-400' : 'text-purple-300'}`}>{regenRemaining} left</span>
              </div>
            )}

            {/* Generate / limit reached state */}
            {!aiImg && !aiLoading && (
              <div className="flex flex-col items-center justify-center py-8 gap-4 bg-white/5 rounded-2xl border border-white/10">
                <div className="w-16 h-16 bg-purple-500/20 rounded-2xl flex items-center justify-center text-3xl">🗺️</div>
                <h3 className="text-sm font-bold text-white text-center">Generate AI Survey Map</h3>
                <p className="text-xs text-gray-400 text-center max-w-xs">Converts satellite imagery into a clean official survey map in the style of Survey of India topographic sheets.</p>
                {regenLimitReached ? (
                  <div className="text-center space-y-2">
                    <p className="text-xs text-amber-400">Daily limit reached — 6 free AI generations per day.</p>
                    <p className="text-xs text-gray-500">Your quota resets at midnight UTC.</p>
                  </div>
                ) : (
                  <button onClick={generateAI} className="px-6 py-3 bg-purple-500 text-white rounded-xl font-bold text-sm shadow-lg hover:bg-purple-600 active:scale-95 transition-all">✨ Generate AI Survey Map</button>
                )}
                {aiError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 max-w-xs w-full">
                    <p className="text-xs text-red-400 text-center mb-2">{aiError}</p>
                    <button onClick={generateAI} className="w-full py-2 bg-red-500/20 text-red-300 rounded-lg text-xs font-semibold hover:bg-red-500/30">Retry Connection</button>
                  </div>
                )}
              </div>
            )}

            {aiLoading && (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <svg className="animate-spin h-8 w-8 text-purple-500" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <p className="text-sm text-purple-400">{aiProgress || 'Generating AI survey map...'}</p>
                <p className="text-xs text-gray-500">This may take a few minutes for large areas</p>
              </div>
            )}

            {/* Current AI image + comparison slider */}
            {aiImg && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold text-sm font-public-sans">AI Map Preview</h3>
                  <div className="flex gap-2">
                    {!regenLimitReached && (
                      <button onClick={() => { setAiImg(null); setTimeout(generateAI, 100); }} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">🔄 Regenerate</button>
                    )}
                  </div>
                </div>

                {/* Overlay comparison */}
                {satImg && (
                  <div className="bg-gray-800 p-3 rounded-xl border border-gray-700">
                    <div className="flex justify-between text-xs text-gray-400 mb-1 font-semibold">
                      <span>Satellite</span>
                      <span>AI Map</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={aiOpacity} onChange={e => setAiOpacity(Number(e.target.value))} className="w-full accent-purple-500" />
                  </div>
                )}

                <div className="flex justify-center">
                  <div className="bg-white shadow-2xl relative overflow-hidden ring-1 ring-white/20" style={{ width: '100%', maxWidth: 500, aspectRatio: String(aspect) }}>
                    <img src={satImg || mapImg} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0" style={{ opacity: aiOpacity }}>
                      <img src={aiImg.startsWith('data:') || aiImg.startsWith('http') ? aiImg : `data:image/jpeg;base64,${aiImg}`} className="w-full h-full object-fill pointer-events-none" />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── SAVED AI IMAGES GALLERY ── */}
            {savedAiImages.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-white font-bold text-sm">All Generated Maps</h3>
                  <p className="text-gray-400 text-[10px]">Tap to select for PDF</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {savedAiImages.map((img) => {
                    const isSelected = pdfSelectedImageIds.has(img.id);
                    return (
                      <button
                        key={img.id}
                        onClick={() => toggleImageForPdf(img.id)}
                        className={`relative rounded-2xl overflow-hidden border-2 transition-all active:scale-95 ${isSelected ? 'border-purple-400 shadow-lg shadow-purple-500/20' : 'border-white/10 hover:border-white/30'}`}
                        style={{ aspectRatio: String(aspect) }}
                      >
                        <img src={img.image_url} alt="AI survey map" className="w-full h-full object-cover" />
                        {/* Selection overlay */}
                        <div className={`absolute inset-0 transition-all ${isSelected ? 'bg-purple-500/20' : 'bg-black/10'}`} />
                        {/* Checkmark */}
                        <div className={`absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-purple-500 shadow-lg' : 'bg-black/40 border border-white/30'}`}>
                          {isSelected && (
                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        {/* Date label */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                          <p className="text-white text-[9px] font-semibold">{new Date(img.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                        </div>
                        {/* "In PDF" badge */}
                        {isSelected && (
                          <div className="absolute top-2 left-2 bg-purple-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">In PDF</div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedAiCount > 0 && (
                  <p className="text-center text-xs text-purple-300 font-semibold py-1">
                    {selectedAiCount} AI map{selectedAiCount > 1 ? 's' : ''} will be added to your PDF ✓
                  </p>
                )}
                {savedImagesLoading && <p className="text-center text-xs text-gray-500">Loading saved maps…</p>}
              </div>
            )}
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
                <span className="text-xs font-bold font-public-sans">HLB {mapData.hlbNumber}</span>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-white/85 text-center py-0.5 z-10 pointer-events-none">
                <span className="text-[9px] text-gray-500">{mapData.enumeratorName} | {mapData.district}, {mapData.state}</span>
              </div>
              <div className="absolute top-1 left-1 bg-orange-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded z-10 pointer-events-none">{orient}</div>
            </div>
          </div>
        )}
      </div>

      {/* Guided tour */}
      {isDemoMode && (
        <div className="absolute left-2 right-2 bottom-3 z-[60] pointer-events-none">
          <div className="max-w-md mx-auto bg-white/97 backdrop-blur rounded-2xl shadow-2xl border border-orange-100 overflow-hidden pointer-events-auto">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="shrink-0 text-[10px] font-black text-white bg-orange-500 rounded-full w-5 h-5 flex items-center justify-center">6</span>
              <button onClick={() => setTourOpen(o => !o)} className="flex-1 min-w-0 text-left">
                <span className="block text-sm font-bold text-slate-800 font-public-sans leading-tight truncate">Print & export your map</span>
              </button>
              <button onClick={() => setTourOpen(o => !o)} className="shrink-0 text-slate-400 hover:text-slate-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100" aria-label={tourOpen ? 'Collapse' : 'Expand'}>
                <span className={`inline-block transition-transform ${tourOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
            </div>
            {tourOpen && (
              <div className="px-3 pb-2 max-h-[30vh] overflow-y-auto">
                <p className="text-xs text-slate-600 leading-relaxed">Switch between <strong>✏️ Sketch</strong>, <strong>🛰️ Satellite</strong> and <strong>🗺️ AI Map</strong> tabs (top). Open <strong>☰ settings</strong> for <strong>A4/A3</strong> + orientation. Tap <strong>🖨️</strong> (right) to download the PDF to your phone.</p>
                <p className="text-[11px] text-purple-600 bg-purple-50 rounded-lg px-2.5 py-1.5 mt-2">✨ Try the AI Map tab → "Generate AI Survey Map" for a clean, print-ready sheet.</p>
              </div>
            )}
            <div className="flex gap-2 px-3 pb-3 pt-1">
              <button onClick={() => handleExport()} disabled={exporting} className="flex-1 py-2 rounded-xl text-xs font-bold bg-orange-500 text-white shadow active:scale-95 transition-all disabled:opacity-60">{exporting ? 'Preparing…' : '🖨️ Download PDF'}</button>
              <button onClick={() => onExitToDashboard?.()} className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-900 text-white shadow active:scale-95 transition-all">Finish tour →</button>
            </div>
          </div>
        </div>
      )}

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
