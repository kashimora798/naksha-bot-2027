import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { Coordinate } from '../types';
import { DEMO_CENTER, DEMO_HLB_NUMBER, DEMO_DISTRICT, DEMO_STATE } from '../data/demo';

interface Props {
  onComplete: (hlb: string, center: Coordinate, district: string, state: string, boundaryPins?: Coordinate[]) => void;
  onBack: () => void;
  isDemoMode?: boolean;
}

function parseCoordinatesFromURL(text: string): { lat: number; lng: number } | null {
  const qMatch = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  const atMatch = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  const plainMatch = text.match(/(-?\d{2}\.\d{3,}),\s*(-?\d{2,3}\.\d{3,})/);
  if (plainMatch) return { lat: parseFloat(plainMatch[1]), lng: parseFloat(plainMatch[2]) };
  return null;
}

function parseHLBNumber(text: string): string | null {
  const match = text.match(/HLB\s*(\d{4})/i);
  return match ? match[1] : null;
}

interface NominatimResult {
  place_id: string;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
  address?: {
    state?: string;
    county?: string;
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    district?: string;
  };
}

function extractDistrictState(result: NominatimResult): { district: string; state: string } {
  const a = result.address || {};
  const district = a.county || a.city || a.district || a.town || a.suburb || a.village || '';
  const state = a.state || '';
  return { district, state };
}

const DEMO_LOCATIONS = [
  { hlb: '0455', lat: 26.4499, lng: 80.3319, district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
  { hlb: '0231', lat: 28.6139, lng: 77.2090, district: 'New Delhi', state: 'Delhi' },
  { hlb: '0812', lat: 19.0760, lng: 72.8777, district: 'Mumbai', state: 'Maharashtra' },
];

type LocationMode = 'sms' | 'search' | 'manual';

export default function SMSParseScreen({ onComplete, onBack, isDemoMode }: Props) {
  const [locationMode, setLocationMode] = useState<LocationMode>('sms');
  const [recentList, setRecentList] = useState<any[]>([]);

  useEffect(() => {
    try {
      const list = JSON.parse(localStorage.getItem('recent_boundaries') || '[]');
      if (Array.isArray(list)) setRecentList(list);
    } catch (e) {
      console.error("Failed to load recent boundaries:", e);
    }
  }, []);

  // SMS tab state
  const [smsText, setSmsText] = useState('');
  const [detected, setDetected] = useState<{ hlb: string; coords: Coordinate } | null>(null);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedResult, setSelectedResult] = useState<NominatimResult | null>(null);
  const [searchHlb, setSearchHlb] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual tab state
  const [manualHLB, setManualHLB] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');

  const [loading, setLoading] = useState(false);

  // ── SMS parsing ───────────────────────────────────────────────────────────────

  const handleSMSTextChange = useCallback((text: string) => {
    setSmsText(text);
    if (!text.trim()) { setDetected(null); return; }
    const coords = parseCoordinatesFromURL(text);
    const hlb = parseHLBNumber(text);
    if (coords && hlb) setDetected({ hlb, coords });
    else if (coords) setDetected({ hlb: hlb || '0000', coords });
    else if (hlb) setDetected({ hlb, coords: { lat: 0, lng: 0 } });
    else setDetected(null);
  }, []);

  const handleProceed = () => {
    if (detected && detected.coords.lat !== 0) {
      setLoading(true);
      setTimeout(() => onComplete(detected.hlb, detected.coords, 'Kanpur Nagar', 'Uttar Pradesh'), 500);
    }
  };

  // ── Location search ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (!q || selectedResult) return;
    setSearchError(null);

    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&countrycodes=in&addressdetails=1`;
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
        if (!res.ok) throw new Error('Search failed');
        const data: NominatimResult[] = await res.json();
        setSearchResults(data);
        if (!data.length) setSearchError('No locations found. Try a different name.');
      } catch {
        setSearchError('Search unavailable. Check your internet connection.');
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 500);
  }, [searchQuery, selectedResult]);

  const handleSelectResult = (r: NominatimResult) => {
    setSelectedResult(r);
    setSearchResults([]);
  };

  const handleSearchProceed = () => {
    if (!selectedResult) return;
    const { district, state } = extractDistrictState(selectedResult);
    const hlb = searchHlb.trim() || '0000';
    setLoading(true);
    setTimeout(() => onComplete(hlb, { lat: parseFloat(selectedResult.lat), lng: parseFloat(selectedResult.lon) }, district, state), 500);
  };

  const clearSelectedResult = () => {
    setSelectedResult(null);
    setSearchQuery('');
    setSearchResults([]);
    setSearchHlb('');
  };

  // ── Manual entry ──────────────────────────────────────────────────────────────

  const handleManualProceed = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng) && manualHLB.trim().length >= 3) {
      setLoading(true);
      setTimeout(() => onComplete(manualHLB.trim(), { lat, lng }, 'Kanpur Nagar', 'Uttar Pradesh'), 500);
    }
  };

  const handleDemoLocation = (loc: typeof DEMO_LOCATIONS[0]) => {
    setLoading(true);
    setTimeout(() => onComplete(loc.hlb, { lat: loc.lat, lng: loc.lng }, loc.district, loc.state), 500);
  };

  // ─────────────────────────────────────────────────────────────────────────────

  const tabClass = (mode: LocationMode) =>
    `flex-1 py-2.5 text-sm font-semibold transition-colors rounded-xl ${
      locationMode === mode
        ? 'bg-[var(--color-saffron)] text-white shadow'
        : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-noto-sans">
      {/* Header */}
      <div className="bg-[var(--color-saffron)] text-white px-4 pt-4 pb-3 shadow-md">
        <h2 className="text-lg font-bold font-public-sans">Step 2: Find Your HLB Area</h2>
        <p className="text-sm opacity-90 font-noto-sans">HLB क्षेत्र का SMS यहाँ paste करें</p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {isDemoMode && (
          <>
            <div className="space-y-3">
              <h3 className="text-lg font-black text-slate-800 font-[Baloo_2]">Two ways to map</h3>
              <div className="bg-white border-2 border-orange-200 rounded-2xl p-4 flex gap-3">
                <span className="text-2xl">🖥️</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Offline / Desk Mode</h4>
                  <p className="text-xs text-slate-500">Build the map at your desk from satellite imagery — boundary, roads, buildings, numbering, print. <strong>We'll walk through this now.</strong></p>
                </div>
              </div>
              <div className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-3">
                <span className="text-2xl">🚶</span>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">Live Survey Mode</h4>
                  <p className="text-xs text-slate-500">Walk the area with GPS on — NakshaBot records houses and your path as you go. Great for fieldwork.</p>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-[12px] p-4">
              <h3 className="font-bold text-blue-800 mb-2">Step 1 · Find your HLB area</h3>
              <p className="text-sm text-blue-700 mb-3">
                In Offline mode you start from the official Census SMS — paste it and NakshaBot reads the HLB number and location automatically. For this demo, tap below to auto-fill a sample area.
              </p>
              <button
                onClick={() => { setLoading(true); setTimeout(() => onComplete(DEMO_HLB_NUMBER, DEMO_CENTER, DEMO_DISTRICT, DEMO_STATE), 500); }}
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow active:scale-95 transition-all disabled:opacity-60"
              >
                {loading ? 'Loading demo area…' : '📩 Auto-fill demo SMS (New Delhi)'}
              </button>
              <p className="text-[11px] text-blue-600/80 mt-2">
                💡 In the real app you can also search by location name or type coordinates by hand. Picking other locations is disabled during the tour.
              </p>
            </div>
          </>
        )}

        {!isDemoMode && (
          <>
            {/* ── Tab bar ── */}
            <div className="flex gap-1 bg-gray-100 rounded-2xl p-1">
              <button onClick={() => setLocationMode('sms')} className={tabClass('sms')}>📩 SMS संदेश</button>
              <button onClick={() => setLocationMode('search')} className={tabClass('search')}>🔍 जगह खोजें</button>
              <button onClick={() => setLocationMode('manual')} className={tabClass('manual')}>✏️ खुद डालें</button>
            </div>

            {/* ── SMS Tab ── */}
            {locationMode === 'sms' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">
                    Census SMS यहाँ paste करें
                  </label>
                  <textarea
                    value={smsText}
                    onChange={e => handleSMSTextChange(e.target.value)}
                    placeholder={`जनगणना 2027 का SMS यहाँ paste करें\n\nउदाहरण: HLB 0455 आपको सौंपा गया। Location: https://maps.google.com/?q=26.4499,80.3319`}
                    className="w-full border border-gray-300 rounded-[12px] px-4 py-3 text-lg focus:border-[var(--color-saffron-container)] focus:outline-none transition-colors font-noto-sans min-h-[120px] bg-white shadow-[var(--shadow-warm-inner)]"
                  />
                  <p className="text-xs text-gray-500 mt-1 font-noto-sans">Census 2027 का assignment SMS यहाँ paste करें</p>
                </div>

                {recentList.length > 0 && !smsText.trim() && (
                  <div className="pt-1.5 space-y-2.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider font-public-sans">
                      ⚡ Recently Extracted PDF Boundaries / निकाले गए सीमाएं
                    </label>
                    <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                      {recentList.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200/70 hover:bg-slate-100/50 transition-colors">
                          <div>
                            <p className="text-sm font-extrabold text-slate-800 font-mono">HLB {item.hlbNumber}</p>
                            <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                              {item.boundaryPins?.length || 0} vertices • {new Date(item.timestamp).toLocaleDateString()}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setLoading(true);
                              setTimeout(() => {
                                onComplete(item.hlbNumber, item.center, 'Kanpur Nagar', 'Uttar Pradesh', item.boundaryPins);
                              }, 400);
                            }}
                            className="py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-black text-[10px] rounded-lg transition-all cursor-pointer shadow-sm tracking-wider uppercase"
                          >
                            Use directly ⚡
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {detected && (
                  <div className="bg-[var(--color-india-green)]/10 border border-[var(--color-india-green)]/30 rounded-[12px] px-4 py-3 flex items-center gap-3">
                    <span className="text-[var(--color-india-green)] text-xl font-bold">✓</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-india-green)] font-noto-sans">HLB {detected.hlb} मिला ✓</p>
                      {detected.coords.lat !== 0 && (
                        <p className="text-xs text-[var(--color-india-green)]/80 font-jetbrains-mono">
                          {detected.coords.lat.toFixed(4)}°N, {detected.coords.lng.toFixed(4)}°E
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {smsText.trim() && !detected && (
                  <div className="bg-[var(--color-saffron)]/10 border border-[var(--color-saffron)]/30 rounded-[12px] px-4 py-3">
                    <p className="text-sm text-[var(--color-saffron)] font-noto-sans">
                      Could not auto-detect. Try the Search or Manual tab.
                    </p>
                  </div>
                )}

                {detected && detected.coords.lat !== 0 && (
                  <button
                    onClick={handleProceed}
                    disabled={loading}
                    className="w-full py-4 rounded-full text-white font-bold text-lg font-public-sans bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] active:scale-[0.98] shadow-[var(--shadow-warm-2)] transition-all disabled:opacity-50 min-h-[52px]"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Finding your area...
                      </span>
                    ) : 'Open My Area Map →'}
                  </button>
                )}

                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 mb-3 font-noto-sans uppercase tracking-wider">Quick Demo Locations:</p>
                  <div className="space-y-3">
                    {DEMO_LOCATIONS.map(loc => (
                      <button
                        key={loc.hlb}
                        onClick={() => handleDemoLocation(loc)}
                        className="w-full flex items-center justify-between bg-white border border-gray-100 shadow-[var(--shadow-warm-1)] rounded-[16px] px-5 py-4 hover:border-[var(--color-saffron-container)] hover:bg-[var(--color-warm-paper)] transition-all min-h-[52px]"
                      >
                        <div className="text-left">
                          <span className="text-sm font-bold text-[var(--color-charcoal)] font-public-sans">HLB {loc.hlb}</span>
                          <span className="text-xs text-gray-500 ml-2 font-noto-sans">{loc.district}, {loc.state}</span>
                        </div>
                        <span className="text-[var(--color-saffron)] text-lg font-bold">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ── Search Tab ── */}
            {locationMode === 'search' && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
                  <p className="text-xs text-blue-700 font-semibold">Search for your HLB area by name — village, mohalla, ward, or locality.</p>
                </div>

                {!selectedResult ? (
                  <>
                    <div className="relative">
                      <input
                        type="text"
                        autoFocus
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Type locality, village or ward name…"
                        className="w-full border border-gray-300 rounded-[12px] px-4 py-3 pr-10 text-base focus:border-[var(--color-saffron-container)] focus:outline-none bg-white shadow-[var(--shadow-warm-inner)] font-noto-sans"
                      />
                      {searchLoading && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <svg className="animate-spin h-5 w-5 text-[var(--color-saffron)]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        </div>
                      )}
                    </div>

                    {searchError && (
                      <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">{searchError}</p>
                    )}

                    {searchResults.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Select your area:</p>
                        {searchResults.map(r => {
                          const { district, state } = extractDistrictState(r);
                          const short = r.display_name.split(',').slice(0, 3).join(', ');
                          return (
                            <button
                              key={r.place_id}
                              onClick={() => handleSelectResult(r)}
                              className="w-full text-left bg-white border border-gray-100 shadow-[var(--shadow-warm-1)] rounded-[16px] px-5 py-3 hover:border-[var(--color-saffron-container)] hover:bg-[var(--color-warm-paper)] transition-all"
                            >
                              <p className="text-sm font-bold text-[var(--color-charcoal)] font-public-sans truncate">{short}</p>
                              <p className="text-xs text-gray-500 font-noto-sans mt-0.5">
                                {[district, state].filter(Boolean).join(', ')} · {parseFloat(r.lat).toFixed(4)}°N {parseFloat(r.lon).toFixed(4)}°E
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {!searchLoading && !searchError && !searchResults.length && searchQuery.trim().length >= 3 && (
                      <p className="text-sm text-gray-400 text-center py-4">Type to search…</p>
                    )}
                  </>
                ) : (
                  /* Selected result — show confirmation + HLB input */
                  <div className="space-y-4">
                    <div className="bg-[var(--color-india-green)]/10 border border-[var(--color-india-green)]/30 rounded-[12px] px-4 py-3 flex items-start gap-3">
                      <span className="text-[var(--color-india-green)] text-xl font-bold mt-0.5">✓</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--color-india-green)] font-noto-sans truncate">
                          {selectedResult.display_name.split(',').slice(0, 3).join(', ')}
                        </p>
                        <p className="text-xs text-[var(--color-india-green)]/80 font-jetbrains-mono mt-0.5">
                          {parseFloat(selectedResult.lat).toFixed(5)}°N, {parseFloat(selectedResult.lon).toFixed(5)}°E
                        </p>
                      </div>
                      <button onClick={clearSelectedResult} className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 flex-shrink-0">×</button>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">HLB Number <span className="text-gray-400 font-normal">(optional)</span></label>
                      <input
                        type="text"
                        value={searchHlb}
                        onChange={e => setSearchHlb(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="e.g. 0455"
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-lg focus:border-[var(--color-saffron-container)] focus:outline-none font-jetbrains-mono bg-white"
                      />
                    </div>

                    <button
                      onClick={handleSearchProceed}
                      disabled={loading}
                      className="w-full py-4 rounded-full text-white font-bold text-lg font-public-sans bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] active:scale-[0.98] shadow-[var(--shadow-warm-2)] transition-all disabled:opacity-50 min-h-[52px]"
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          Opening map...
                        </span>
                      ) : 'Open Map at This Location →'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Manual Tab ── */}
            {locationMode === 'manual' && (
              <div className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs text-amber-800 font-semibold">💡 Google Maps खोलें → लाल pin पर tap करें → नीचे वाले दो नंबर यहाँ copy करें</p>
                </div>
                <div className="bg-white rounded-[24px] p-5 border border-gray-100 shadow-[var(--shadow-warm-1)] space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">HLB नंबर / HLB Number</label>
                    <input
                      type="text"
                      value={manualHLB}
                      onChange={e => setManualHLB(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder="e.g. 0455"
                      className="w-full border border-gray-300 rounded-lg px-3 py-3 text-lg focus:border-[var(--color-saffron-container)] focus:outline-none font-jetbrains-mono bg-white"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">उत्तर-दक्षिण <span className="text-gray-400 font-normal">(Latitude)</span></label>
                      <input
                        type="text"
                        value={manualLat}
                        onChange={e => setManualLat(e.target.value)}
                        placeholder="26.4499"
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:border-[var(--color-saffron-container)] focus:outline-none font-jetbrains-mono bg-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">पूर्व-पश्चिम <span className="text-gray-400 font-normal">(Longitude)</span></label>
                      <input
                        type="text"
                        value={manualLng}
                        onChange={e => setManualLng(e.target.value)}
                        placeholder="80.3319"
                        className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:border-[var(--color-saffron-container)] focus:outline-none font-jetbrains-mono bg-white"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleManualProceed}
                    disabled={!manualHLB.trim() || isNaN(parseFloat(manualLat)) || isNaN(parseFloat(manualLng)) || loading}
                    className="w-full py-4 mt-2 rounded-full bg-[var(--color-saffron-container)] text-white font-bold text-lg font-public-sans hover:bg-[var(--color-saffron)] shadow-[var(--shadow-warm-1)] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed min-h-[52px]"
                  >
                    नक्शा खोलें →
                  </button>
                </div>

                <div className="mt-2">
                  <p className="text-xs font-semibold text-gray-500 mb-3 font-noto-sans uppercase tracking-wider">Quick Demo Locations:</p>
                  <div className="space-y-3">
                    {DEMO_LOCATIONS.map(loc => (
                      <button
                        key={loc.hlb}
                        onClick={() => handleDemoLocation(loc)}
                        className="w-full flex items-center justify-between bg-white border border-gray-100 shadow-[var(--shadow-warm-1)] rounded-[16px] px-5 py-4 hover:border-[var(--color-saffron-container)] hover:bg-[var(--color-warm-paper)] transition-all min-h-[52px]"
                      >
                        <div className="text-left">
                          <span className="text-sm font-bold text-[var(--color-charcoal)] font-public-sans">HLB {loc.hlb}</span>
                          <span className="text-xs text-gray-500 ml-2 font-noto-sans">{loc.district}, {loc.state}</span>
                        </div>
                        <span className="text-[var(--color-saffron)] text-lg font-bold">→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
