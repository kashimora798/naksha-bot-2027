import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { idbStore } from '../lib/idb';
import type { SurveySession, SurveySymbol, SurveyPoint, RoadSegment, CachedFootprints } from '../lib/idb';
import L from 'leaflet';
import { generateOfficialRegister, generateLiveExportPdf } from '../lib/pdf-export';
import { supabase } from '../lib/supabase';
import { load } from '@cashfreepayments/cashfree-js';
import ImageComparisonSlider from '../components/ImageComparisonSlider';
import { generateSurveyMapFromBoundary, captureFullSatellite, PREDEFINED_PROMPTS } from '../lib/survey-api';
import type { Coordinate } from '../types';

export default function SessionDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SurveySession | null>(null);
  const [symbols, setSymbols] = useState<SurveySymbol[]>([]);
  const [path, setPath] = useState<SurveyPoint[]>([]);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'MAP' | 'HOUSES' | 'AI_MAP' | 'EXPORT'>('MAP');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  // Toggle States for Map and Export
  const [includeOsmRoads, setIncludeOsmRoads] = useState(true);
  const [includeWalkedPath, setIncludeWalkedPath] = useState(true);
  const [includeMappedRoads, setIncludeMappedRoads] = useState(true);
  const [includeBuildings, setIncludeBuildings] = useState(true);

  // Offline Footprints (OSM Roads etc.)
  const [cachedFootprints, setCachedFootprints] = useState<CachedFootprints | null>(null);

  // Live exports payments and refills state
  const [isPaid, setIsPaid] = useState(false);
  const [regenAllowance, setRegenAllowance] = useState(1);
  const [regenUsed, setRegenUsed] = useState(0);

  // AI Map states
  const [aiImages, setAiImages] = useState<any[]>([]);
  const [selectedAiImages, setSelectedAiImages] = useState<Set<string>>(new Set());
  const [activeAiImg, setActiveAiImg] = useState<string | null>(null);
  const [satImg, setSatImg] = useState<string>('');
  const [satLoading, setSatLoading] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('soi_topo');
  const [customPrompt, setCustomPrompt] = useState('');

  // Payment UI states
  const [paying, setPaying] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationSuccess, setVerificationSuccess] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // AI Generator local UI states
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState('');
  const [aiError, setAiError] = useState('');

  // Leaflet Layer Groups to dynamically control toggles
  const boundaryLayer = useRef<L.LayerGroup>(L.layerGroup());
  const walkedPathLayer = useRef<L.LayerGroup>(L.layerGroup());
  const mappedRoadsLayer = useRef<L.LayerGroup>(L.layerGroup());
  const osmRoadsLayer = useRef<L.LayerGroup>(L.layerGroup());
  const buildingsLayer = useRef<L.LayerGroup>(L.layerGroup());
  
  const hasFitRef = useRef(false);

  // Load basic session info from IndexedDB on mount
  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const s = await idbStore.getSession(id);
        if (s) setSession(s as SurveySession);
        
        const sym = await idbStore.getSymbolsForSession(id);
        setSymbols(sym);
        
        const pts = await idbStore.getPointsForSession(id);
        setPath(pts);
        
        const rds = await idbStore.getSegmentsForSession(id);
        setRoads(rds);

        const footprints = await idbStore.getCachedFootprints(id);
        if (footprints) setCachedFootprints(footprints);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  // Fetch payment status and generated AI images on mount and payment redirects
  const refreshPaymentStatus = async () => {
    if (!id) return;
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (authSession?.user) {
        const { data, error } = await supabase
          .from('live_exports')
          .select('payment_status, regen_allowance, regen_used')
          .eq('session_id', id)
          .single();
        if (data && !error) {
          setIsPaid(data.payment_status === 'paid');
          setRegenAllowance(data.regen_allowance ?? 1);
          setRegenUsed(data.regen_used ?? 0);
        }
      }
    } catch (e) {
      console.error('Error refreshing payment status:', e);
    }
  };

  const fetchAiImages = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('live_image_generations')
        .select('*')
        .eq('session_id', id)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setAiImages(data);
      }
    } catch (e) {
      console.error('Error fetching live AI images:', e);
    }
  };

  useEffect(() => {
    if (id) {
      fetchAiImages();
    }
  }, [id]);

  // Handle URL redirect query parameters for payment success confirmation
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isPaymentSuccess = params.get('payment') === 'success';
    const paymentKind = params.get('kind');
    
    if (isPaymentSuccess && id) {
      // Clean query parameters from URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      
      const verifyPayment = async () => {
        setVerifying(true);
        setVerificationError(null);
        let success = false;
        try {
          // Verify payment server-side (with retries)
          for (let attempt = 0; attempt < 5; attempt++) {
            const { data, error } = await supabase.functions.invoke('verify-payment', {
              body: { projectId: id, kind: paymentKind === 'live_regen' ? 'live_regen' : 'live' },
            });
            if (!error && data?.paid) {
              success = true;
              break;
            }
            await new Promise(r => setTimeout(r, 2000));
          }
          if (success) {
            setVerificationSuccess(true);
            await refreshPaymentStatus();
            await fetchAiImages();
            setTimeout(() => setVerificationSuccess(false), 5000);
          } else {
            setVerificationError('Payment verification timed out. If you made a payment, please refresh this page.');
          }
        } catch (e: any) {
          console.error(e);
          setVerificationError(e.message || 'Payment verification failed.');
        } finally {
          setVerifying(false);
        }
      };
      verifyPayment();
    } else {
      refreshPaymentStatus();
    }
  }, [id]);

  // Pre-load satellite image for ImageComparisonSlider on mount
  useEffect(() => {
    if (session) {
      captureSatellite();
    }
  }, [session]);

  // Sync active AI Map image with generations list
  useEffect(() => {
    if (aiImages.length > 0 && !activeAiImg) {
      setActiveAiImg(aiImages[0].image_url);
    }
  }, [aiImages, activeAiImg]);

  async function captureSatellite() {
    if (!session?.polygon_geojson) return;
    setSatLoading(true);
    try {
      let boundary: Coordinate[] = [];
      try {
        const geo = JSON.parse(session.polygon_geojson);
        if (geo?.geometry?.coordinates) {
          boundary = geo.geometry.coordinates[0].map((coord: any) => ({ lng: coord[0], lat: coord[1] }));
        }
      } catch (e) {}
      if (boundary.length >= 3) {
        const { canvas } = await captureFullSatellite(boundary);
        setSatImg(canvas.toDataURL('image/jpeg', 0.9));
      }
    } catch (err) {
      console.error('Failed to capture satellite preview:', err);
    }
    setSatLoading(false);
  }

  // Generate AI Map for Live boundary
  async function handleGenerateAI() {
    if (!session?.polygon_geojson) return;
    
    if (regenUsed >= regenAllowance) {
      setShowPaywallModal(true);
      return;
    }

    setAiLoading(true);
    setAiError('');
    setAiProgress('Preparing satellite imagery...');

    let boundary: Coordinate[] = [];
    try {
      const geo = JSON.parse(session.polygon_geojson);
      if (geo?.geometry?.coordinates) {
        boundary = geo.geometry.coordinates[0].map((coord: any) => ({ lng: coord[0], lat: coord[1] }));
      }
    } catch (e) {}

    const mapDataForAi = {
      projectId: session.session_id,
      isLive: true,
      boundaryPins: boundary,
      orientation: 'landscape' as const
    };

    // Assemble SOI aligned prompts
    let finalPrompt = '';
    if (selectedPromptId === 'custom') {
      finalPrompt = customPrompt;
    } else {
      finalPrompt = PREDEFINED_PROMPTS.find(p => p.id === selectedPromptId)?.prompt || PREDEFINED_PROMPTS[0].prompt;
    }

    try {
      const result = await generateSurveyMapFromBoundary(
        mapDataForAi,
        'landscape',
        (msg) => setAiProgress(msg),
        undefined,
        finalPrompt
      );

      if (result.success && result.imageUrl) {
        setAiProgress('');
        setActiveAiImg(result.imageUrl);
        await refreshPaymentStatus();
        await fetchAiImages();
      } else {
        if (result.error === 'regen_limit') {
          setShowPaywallModal(true);
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

  // Payment triggers
  const handlePayUnlock = async () => {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { sessionId: id, kind: 'live' }
      });
      if (error) throw error;
      if (data?.paymentSessionId) {
        const cashfree = await load({
          mode: import.meta.env.VITE_CASHFREE_MODE === 'production' ? 'production' : 'sandbox'
        });
        if (cashfree) {
          cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_self' });
        }
      } else {
        throw new Error('No payment session returned');
      }
    } catch (e: any) {
      console.error(e);
      alert('Payment failed to initialize: ' + e.message);
    } finally {
      setPaying(false);
    }
  };

  const handlePayRefill = async () => {
    setPaying(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { sessionId: id, kind: 'live_regen' }
      });
      if (error) throw error;
      if (data?.paymentSessionId) {
        const cashfree = await load({
          mode: import.meta.env.VITE_CASHFREE_MODE === 'production' ? 'production' : 'sandbox'
        });
        if (cashfree) {
          cashfree.checkout({ paymentSessionId: data.paymentSessionId, redirectTarget: '_self' });
        }
      } else {
        throw new Error('No payment session returned');
      }
    } catch (e: any) {
      console.error(e);
      alert('Payment failed to initialize: ' + e.message);
    } finally {
      setPaying(false);
    }
  };

  // Initialize Map Container once
  useEffect(() => {
    if (activeTab === 'MAP' && !loading && session && mapContainerRef.current) {
      if (mapRef.current) return;
      
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([20, 78], 18);
      L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 21 }).addTo(map);
      
      mapRef.current = map;
      
      boundaryLayer.current.addTo(map);
      walkedPathLayer.current.addTo(map);
      mappedRoadsLayer.current.addTo(map);
      osmRoadsLayer.current.addTo(map);
      buildingsLayer.current.addTo(map);
    }
  }, [activeTab, loading, session]);

  // Update Map layers dynamically based on toggle states
  useEffect(() => {
    if (!mapRef.current || !session) return;
    
    boundaryLayer.current.clearLayers();
    walkedPathLayer.current.clearLayers();
    mappedRoadsLayer.current.clearLayers();
    osmRoadsLayer.current.clearLayers();
    buildingsLayer.current.clearLayers();
    
    const bounds = L.latLngBounds([]);
    
    // 1. Draw boundary
    if (session.polygon_geojson) {
      try {
        const geojson = JSON.parse(session.polygon_geojson);
        const layer = L.geoJSON(geojson, { style: { color: '#FF6B00', weight: 3, fill: false } }).addTo(boundaryLayer.current);
        bounds.extend(layer.getBounds());
      } catch(e) {}
    }
    
    // 2. Draw Walked Path
    if (includeWalkedPath && path.length > 1) {
      const latlngs = path.map(p => [p.lat, p.lng] as L.LatLngExpression);
      const polyline = L.polyline(latlngs, { color: '#000', weight: 4 }).addTo(walkedPathLayer.current);
      L.polyline(latlngs, { color: '#fff', weight: 2, dashArray: '5,5' }).addTo(walkedPathLayer.current);
      bounds.extend(polyline.getBounds());
    }
    
    // 3. Draw Mapped Roads
    if (includeMappedRoads) {
      roads.forEach(rd => {
        if (rd.points.length < 2) return;
        const latlngs = rd.points.map(p => [p.lat, p.lng] as L.LatLngExpression);
        L.polyline(latlngs, { color: '#000', weight: 8 }).addTo(mappedRoadsLayer.current);
        L.polyline(latlngs, { color: '#fff', weight: 4 }).addTo(mappedRoadsLayer.current);
        latlngs.forEach((p: L.LatLngExpression) => bounds.extend(p));
      });
    }
    
    // 4. Draw OSM Roads
    if (includeOsmRoads && cachedFootprints?.roads) {
      cachedFootprints.roads.forEach(rd => {
        if (rd.coords?.length < 2) return;
        const latlngs = rd.coords.map((c: any) => [c.lat, c.lng] as L.LatLngExpression);
        L.polyline(latlngs, { color: '#94a3b8', weight: 3.5 }).addTo(osmRoadsLayer.current);
        latlngs.forEach((p: L.LatLngExpression) => bounds.extend(p));
      });
    }
    
    // 5. Draw Buildings
    if (includeBuildings) {
      symbols.forEach(sym => {
        const isHouse = ['pucca_house', 'kutcha_house', 'apartment'].includes(sym.symbol_type as string);
        const html = `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:white;border-radius:50%;border:2px solid ${isHouse ? '#22c55e' : '#6b7280'};font-size:10px;font-weight:bold;color:#374151">${sym.number || ''}</div>`;
        L.marker([sym.lat, sym.lng], { icon: L.divIcon({ html, className: '', iconSize: [24,24] }) }).addTo(buildingsLayer.current);
        bounds.extend([[sym.lat, sym.lng]]);
      });
    }
    
    // Fit bounds once on first load
    if (bounds.isValid() && !hasFitRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [20, 20] });
      hasFitRef.current = true;
    }
  }, [
    activeTab,
    loading,
    session,
    path,
    symbols,
    roads,
    cachedFootprints,
    includeWalkedPath,
    includeMappedRoads,
    includeOsmRoads,
    includeBuildings
  ]);

  const toggleSelectAiImage = (url: string) => {
    setSelectedAiImages(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  if (loading) return <div className="p-8 text-center text-slate-600 font-bold">Loading...</div>;
  if (!session) return <div className="p-8 text-center text-red-500 font-bold">Session not found</div>;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white shadow-sm px-4 py-4 flex flex-col gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/live-dashboard')} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-95 text-gray-700 font-bold">
            ←
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-gray-800">HLB {session.hlb_number}</h1>
              {isPaid ? (
                <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">✓ Paid</span>
              ) : (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">Draft</span>
              )}
            </div>
            <p className="text-xs text-gray-500 font-medium">{session.location_name}</p>
          </div>
        </div>

        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('MAP')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'MAP' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Map View
          </button>
          <button onClick={() => setActiveTab('HOUSES')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'HOUSES' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Houses ({symbols.filter(s => s.number).length})
          </button>
          <button onClick={() => setActiveTab('AI_MAP')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'AI_MAP' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            AI Map
          </button>
          <button onClick={() => setActiveTab('EXPORT')} className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all ${activeTab === 'EXPORT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Export
          </button>
        </div>
      </header>

      <div className="flex-1 relative flex flex-col">
        {activeTab === 'MAP' && (
          <div className="flex-1 relative min-h-[400px]">
            <div ref={mapContainerRef} className="absolute inset-0 bg-gray-200" />
            
            {/* Toggle controls floating panel */}
            <div className="absolute top-4 right-4 z-[1000] bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-gray-100 flex flex-col gap-2.5 max-w-xs">
              <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                <span>🛠️</span> Layer Controls
              </h4>
              <label className="flex items-center gap-2.5 text-xs text-gray-700 font-bold cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg">
                <input type="checkbox" checked={includeWalkedPath} onChange={(e) => setIncludeWalkedPath(e.target.checked)} className="rounded text-orange-500 focus:ring-orange-400 w-4 h-4 cursor-pointer" />
                <span>🚶‍♂️ Walked Path</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-gray-700 font-bold cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg">
                <input type="checkbox" checked={includeMappedRoads} onChange={(e) => setIncludeMappedRoads(e.target.checked)} className="rounded text-orange-500 focus:ring-orange-400 w-4 h-4 cursor-pointer" />
                <span>🗺️ Mapped Roads</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-gray-700 font-bold cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg">
                <input type="checkbox" checked={includeOsmRoads} onChange={(e) => setIncludeOsmRoads(e.target.checked)} className="rounded text-orange-500 focus:ring-orange-400 w-4 h-4 cursor-pointer" />
                <span>🛣️ OSM Roads</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-gray-700 font-bold cursor-pointer hover:bg-gray-50 p-1.5 rounded-lg">
                <input type="checkbox" checked={includeBuildings} onChange={(e) => setIncludeBuildings(e.target.checked)} className="rounded text-orange-500 focus:ring-orange-400 w-4 h-4 cursor-pointer" />
                <span>🏠 Buildings/Symbols</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'HOUSES' && (
          <div className="p-4 flex flex-col gap-3 max-w-md mx-auto w-full">
            {symbols.filter(s => s.number).sort((a,b) => (a.number ?? 0) - (b.number ?? 0)).map(sym => (
              <div key={sym.symbol_id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-black text-xl flex-shrink-0">
                  {sym.number}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 text-sm">
                    {sym.col_10_head_name || sym.head_of_household || <span className="italic text-gray-400">नाम नहीं भरा</span>}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold uppercase">
                      {sym.symbol_type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium tracking-wide">
                      {sym.col_9_family_count ? `${sym.col_9_family_count} Families` : ''} 
                      {sym.col_11_total_rooms ? ` • ${sym.col_11_total_rooms} Rooms` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-xs font-bold ${sym.form_fill_percentage === 100 ? 'text-green-600' : 'text-orange-500'}`}>
                    {sym.form_fill_percentage || 0}%
                  </span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full ${sym.form_fill_percentage === 100 ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${sym.form_fill_percentage || 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'AI_MAP' && (
          <div className="p-4 max-w-4xl mx-auto w-full flex flex-col lg:flex-row gap-6">
            {/* Left side: AI controls */}
            <div className="flex-1 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between gap-5">
              <div>
                <h3 className="font-black text-gray-800 text-base mb-1">✨ AI Topographic Survey Map</h3>
                <p className="text-xs text-gray-500 mb-4 font-medium">Generate high-contrast Survey layout sheets using AI.</p>
                
                {/* Style Selector */}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Map Style Preset</label>
                  <select
                    value={selectedPromptId}
                    onChange={(e) => setSelectedPromptId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-xs text-gray-800 focus:outline-none focus:border-orange-500 font-semibold"
                  >
                    {PREDEFINED_PROMPTS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    <option value="custom">Custom Styling Prompt</option>
                  </select>
                </div>

                {/* Prompt Preview */}
                {selectedPromptId !== 'custom' ? (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 max-h-36 overflow-y-auto text-[10px] text-gray-500 leading-relaxed font-mono">
                    {PREDEFINED_PROMPTS.find((p) => p.id === selectedPromptId)?.prompt}
                  </div>
                ) : (
                  <div>
                    <textarea
                      value={customPrompt}
                      onChange={(e) => setCustomPrompt(e.target.value)}
                      placeholder="Enter custom instructions for AI..."
                      maxLength={1000}
                      className="w-full h-32 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-800 placeholder-gray-400 focus:outline-none focus:border-orange-500 resize-none font-sans"
                    />
                    <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                      <span>Tip: Keep rules simple and descriptive</span>
                      <span>{customPrompt.length}/1000</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Generator Actions */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 px-3.5 py-2.5 rounded-xl border border-gray-100">
                  <span className="font-semibold text-gray-500">Generations Limit:</span>
                  <span className="font-bold text-orange-600 font-mono">
                    {regenUsed} / {regenAllowance} used ({Math.max(0, regenAllowance - regenUsed)} left)
                  </span>
                </div>

                {aiLoading ? (
                  <div className="w-full bg-orange-50 text-orange-600 py-3 rounded-xl border border-orange-200 flex items-center justify-center gap-2 font-bold text-xs">
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span>{aiProgress || 'Generating topographic map...'}</span>
                  </div>
                ) : regenUsed >= regenAllowance ? (
                  <button
                    onClick={() => setShowPaywallModal(true)}
                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    ✨ Limit Reached! Buy Refill (₹5)
                  </button>
                ) : (
                  <button
                    onClick={handleGenerateAI}
                    className="w-full py-3.5 bg-[var(--color-saffron)] text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all"
                  >
                    ✨ Generate AI Survey Map
                  </button>
                )}

                {aiError && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-red-500 font-semibold">{aiError}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right side: Swipe and Gallery */}
            <div className="flex-1 bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                  {activeAiImg ? '🔍 Swipe to Compare' : '🛰️ Satellite Reference'}
                </h4>
                <button
                  onClick={captureSatellite}
                  disabled={satLoading}
                  className="text-[10px] font-bold text-orange-500 hover:text-orange-600"
                >
                  {satLoading ? 'Capturing...' : '🔄 Recapture Sat'}
                </button>
              </div>

              <div className="aspect-[4/3] bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center relative">
                {satLoading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-400 font-medium">Capturing satellite...</span>
                  </div>
                ) : activeAiImg && satImg ? (
                  <ImageComparisonSlider
                    leftImage={satImg}
                    rightImage={activeAiImg}
                    leftLabel="Satellite"
                    rightLabel="AI Map"
                    aspectRatio={4/3}
                  />
                ) : satImg ? (
                  <img src={satImg} alt="Satellite Source" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-400 font-medium">No satellite captured</span>
                )}
              </div>

              {/* Gallery of all generations */}
              {aiImages.length > 0 && (
                <div>
                  <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">History of generations ({aiImages.length})</h5>
                  <div className="flex gap-2.5 overflow-x-auto py-1">
                    {aiImages.map((img) => (
                      <button
                        key={img.id}
                        onClick={() => setActiveAiImg(img.image_url)}
                        className={`relative w-20 h-16 rounded-lg overflow-hidden border-2 shrink-0 transition-all ${
                          activeAiImg === img.image_url ? 'border-orange-500 scale-95 shadow-md' : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <img src={img.image_url} alt="AI Map generation" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'EXPORT' && (
          <div className="flex-1 w-full">
            {!isPaid ? (
              <div className="max-w-md mx-auto bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden text-gray-800 mt-4 mx-4">
                <div className="bg-gradient-to-br from-orange-500 to-rose-500 px-6 py-8 text-white text-center">
                  <div className="text-4xl mb-2">✨</div>
                  <h3 className="text-2xl font-black font-[Baloo_2] tracking-tight">Unlock Official PDF Exports</h3>
                  <p className="text-xs text-white/80 mt-1">Get high-fidelity downloads and full AI mapping access</p>
                  <div className="mt-5 flex items-end justify-center gap-2">
                    <span className="text-white/60 line-through text-lg">₹10</span>
                    <span className="text-5xl font-black leading-none">₹5</span>
                    <span className="text-white/90 text-sm mb-1 font-medium">one-time</span>
                  </div>
                </div>
                <div className="p-6 space-y-4 text-xs text-gray-600 leading-relaxed">
                  <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-2">What's included:</h4>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <span className="text-green-500 text-sm font-black">✓</span>
                      <span><strong>High-Resolution Nazari Naksha PDF:</strong> Printable A4/A3 map sheets with official margins, compass, and locator.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-500 text-sm font-black">✓</span>
                      <span><strong>Official Census HLO Register:</strong> Clean grid output matching standard 34-column formats.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-500 text-sm font-black">✓</span>
                      <span><strong>6 AI Map Generations:</strong> Refine block cartography to absolute Survey of India standards.</span>
                    </div>
                    <div className="flex items-start gap-3">
                      <span className="text-green-500 text-sm font-black">✓</span>
                      <span><strong>Flexible Map Layers:</strong> Toggle OSM roads, walked paths, and buildings in exports.</span>
                    </div>
                  </div>
                </div>
                <div className="px-6 pb-8 pt-2">
                  <button
                    onClick={handlePayUnlock}
                    disabled={paying}
                    className="w-full py-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {paying ? 'Loading...' : 'Pay ₹5 to Unlock'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 max-w-md mx-auto w-full flex flex-col gap-4">
                {/* Checklist for AI maps */}
                {aiImages.length > 0 && (
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-850 text-xs uppercase tracking-wider mb-1">Select AI Maps to include in print:</h3>
                    <p className="text-[10px] text-gray-500 mb-3">Selected AI maps will be appended as satellite comparison overlays in your PDF.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {aiImages.map((img, i) => {
                        const isSelected = selectedAiImages.has(img.image_url);
                        return (
                          <button
                            key={img.id}
                            onClick={() => toggleSelectAiImage(img.image_url)}
                            className={`relative rounded-xl overflow-hidden border-2 transition-all p-1.5 text-left flex flex-col gap-1.5 ${
                              isSelected ? 'border-orange-500 bg-orange-50/10' : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <img src={img.image_url} alt="AI generated preview" className="w-full h-16 object-cover rounded-lg" />
                            <div className="flex items-center gap-1.5 px-1 py-0.5">
                              <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[8px] font-black ${
                                isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'
                              }`}>
                                {isSelected ? '✓' : ''}
                              </div>
                              <span className="text-[9px] font-bold text-gray-600">Map {i + 1}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-black text-gray-800 mb-2">Nazari Naksha PDF</h3>
                  <p className="text-xs text-gray-500 mb-4">Official A4 format map with legend and boundary markings.</p>
                  
                  {/* Current Toggle Summary in Export */}
                  <div className="mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-1.5 text-[10px] text-gray-600">
                    <div className="font-bold text-gray-700 uppercase tracking-wider text-[9px] mb-1">Export Settings:</div>
                    <div className="flex justify-between">
                      <span>🚶‍♂️ Walked Path:</span>
                      <span className="font-bold text-gray-800">{includeWalkedPath ? 'ENABLED' : 'DISABLED'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🗺️ Mapped Roads:</span>
                      <span className="font-bold text-gray-800">{includeMappedRoads ? 'ENABLED' : 'DISABLED'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🛣️ OSM Roads:</span>
                      <span className="font-bold text-gray-800">{includeOsmRoads ? 'ENABLED' : 'DISABLED'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>🏠 Buildings:</span>
                      <span className="font-bold text-gray-800">{includeBuildings ? 'ENABLED' : 'DISABLED'}</span>
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      const btn = document.activeElement as HTMLButtonElement;
                      const origText = btn.innerText;
                      if (btn) btn.innerText = 'Generating...';
                      try {
                        await generateLiveExportPdf(
                          session,
                          symbols,
                          path,
                          roads,
                          (msg) => {
                            if (btn) btn.innerText = msg;
                          },
                          {
                            includeOsmRoads,
                            osmRoads: cachedFootprints?.roads?.map((r: any) => r.coords || []) || [],
                            includeWalkedPath,
                            includeMappedRoads,
                            selectedAiImages: Array.from(selectedAiImages)
                          }
                        );
                      } finally {
                        if (btn) btn.innerText = origText;
                      }
                    }}
                    className="w-full bg-[var(--color-saffron)] text-white font-bold py-3.5 rounded-xl shadow active:scale-95 transition-all text-xs"
                  >
                    Download Sketch Map PDF
                  </button>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                  <h3 className="font-black text-gray-800 mb-2">Official HLO Register</h3>
                  <p className="text-xs text-gray-500 mb-4">PDF export of all marked houses and detailed schedule data.</p>
                  <button 
                    onClick={async () => {
                      await generateOfficialRegister(session, symbols);
                    }}
                    className="w-full bg-gray-800 text-white font-bold py-3.5 rounded-xl shadow active:scale-95 transition-all text-xs"
                  >
                    Download Register PDF
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paywall Refills Modal */}
      {showPaywallModal && (
        <div className="fixed inset-0 z-[6500] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden text-slate-800">
            <div className="bg-gradient-to-br from-orange-500 to-rose-500 px-6 py-6 text-white text-center">
              <div className="text-4xl mb-1">✨</div>
              <h3 className="text-xl font-black font-[Baloo_2]">Need More AI Generations?</h3>
              {isPaid ? (
                <p className="text-xs text-white/80 mt-1">Get 6 extra generations for this session</p>
              ) : (
                <p className="text-xs text-white/80 mt-1">Unlock exports and get 6 AI generations</p>
              )}
              <div className="mt-4 flex items-end justify-center gap-2">
                <span className="text-white/70 line-through text-base">₹10</span>
                <span className="text-4xl font-black leading-none font-sans">₹5</span>
                <span className="text-white/90 text-xs mb-1">pack of 6</span>
              </div>
            </div>
            <div className="p-6 space-y-4 text-xs text-gray-600">
              <p className="leading-relaxed">
                {isPaid ? (
                  <>
                    You've reached your AI map generation limit. Purchasing a refill grants you <strong>6 additional attempts</strong> instantly.
                  </>
                ) : (
                  <>
                    Unlock official PDF downloads (sketch map + HLO register) and get <strong>6 AI map generations</strong> instantly.
                  </>
                )}
              </p>
              <div className="bg-orange-50 rounded-xl p-3 border border-orange-100 flex items-center gap-3">
                <span className="text-base">🚀</span>
                <span className="text-orange-950 font-medium">Valid for this session. Keep generating until it meets your requirements.</span>
              </div>
            </div>
            <div className="px-6 pb-6 pt-1 flex gap-2">
              <button
                onClick={() => setShowPaywallModal(false)}
                disabled={paying}
                className="flex-1 py-3 border border-gray-200 text-gray-500 rounded-xl font-bold text-xs hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setShowPaywallModal(false);
                  if (isPaid) {
                    await handlePayRefill();
                  } else {
                    await handlePayUnlock();
                  }
                }}
                disabled={paying}
                className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold text-xs rounded-xl shadow hover:opacity-90 active:scale-95 transition-all"
              >
                {paying ? 'Loading...' : 'Pay ₹5'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Spinner Overlay */}
      {verifying && (
        <div className="fixed inset-0 z-[7000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl border border-gray-150">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="font-bold text-gray-800 text-lg mb-1">Confirming Payment...</h3>
            <p className="text-xs text-gray-500 leading-normal">We are verifying your transaction with the bank. Please do not close or refresh this page.</p>
          </div>
        </div>
      )}

      {/* Verification Success Toast */}
      {verificationSuccess && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[7000] bg-green-600 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 animate-bounce">
          <span>✓</span> Payment verified successfully! Downloads unlocked.
        </div>
      )}

      {/* Verification Error Modal */}
      {verificationError && (
        <div className="fixed inset-0 z-[7000] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 text-center max-w-sm w-full shadow-2xl border border-gray-150">
            <div className="text-4xl mb-2">⚠️</div>
            <h3 className="font-bold text-red-600 text-lg mb-1">Verification Failed</h3>
            <p className="text-xs text-gray-500 mb-4">{verificationError}</p>
            <button
              onClick={() => setVerificationError(null)}
              className="px-5 py-2 bg-gray-800 hover:bg-gray-700 text-white font-bold text-xs rounded-xl"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
