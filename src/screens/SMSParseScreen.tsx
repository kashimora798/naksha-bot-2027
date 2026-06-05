import React, { useState, useCallback } from 'react';
import type { Coordinate } from '../types';
import { DEMO_CENTER, DEMO_HLB_NUMBER, DEMO_DISTRICT, DEMO_STATE } from '../data/demo';

interface Props {
  onComplete: (hlb: string, center: Coordinate, district: string, state: string) => void;
  onBack: () => void;
  isDemoMode?: boolean;
}

function parseCoordinatesFromURL(text: string): { lat: number; lng: number } | null {
  // Try ?q=LAT,LNG format
  const qMatch = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };

  // Try @LAT,LNG format
  const atMatch = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };

  // Try plain LAT,LNG anywhere
  const plainMatch = text.match(/(-?\d{2}\.\d{3,}),\s*(-?\d{2,3}\.\d{3,})/);
  if (plainMatch) return { lat: parseFloat(plainMatch[1]), lng: parseFloat(plainMatch[2]) };

  return null;
}

function parseHLBNumber(text: string): string | null {
  const match = text.match(/HLB\s*(\d{4})/i);
  return match ? match[1] : null;
}

// Known demo locations
const DEMO_LOCATIONS = [
  { hlb: '0455', lat: 26.4499, lng: 80.3319, district: 'Kanpur Nagar', state: 'Uttar Pradesh' },
  { hlb: '0231', lat: 28.6139, lng: 77.2090, district: 'New Delhi', state: 'Delhi' },
  { hlb: '0812', lat: 19.0760, lng: 72.8777, district: 'Mumbai', state: 'Maharashtra' },
];

export default function SMSParseScreen({ onComplete, onBack, isDemoMode }: Props) {
  const [smsText, setSmsText] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualHLB, setManualHLB] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [detected, setDetected] = useState<{ hlb: string; coords: Coordinate } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSMSTextChange = useCallback((text: string) => {
    setSmsText(text);
    if (!text.trim()) {
      setDetected(null);
      return;
    }
    const coords = parseCoordinatesFromURL(text);
    const hlb = parseHLBNumber(text);
    if (coords && hlb) {
      setDetected({ hlb, coords });
    } else if (coords) {
      setDetected({ hlb: hlb || '0000', coords });
    } else if (hlb) {
      setDetected({ hlb, coords: { lat: 0, lng: 0 } });
    } else {
      setDetected(null);
    }
  }, []);

  const handleProceed = () => {
    if (detected && detected.coords.lat !== 0) {
      setLoading(true);
      setTimeout(() => {
        onComplete(detected.hlb, detected.coords, 'Kanpur Nagar', 'Uttar Pradesh');
      }, 500);
    }
  };

  const handleManualProceed = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng) && manualHLB.trim().length >= 3) {
      setLoading(true);
      setTimeout(() => {
        onComplete(manualHLB.trim(), { lat, lng }, 'Kanpur Nagar', 'Uttar Pradesh');
      }, 500);
    }
  };

  const handleDemoLocation = (loc: typeof DEMO_LOCATIONS[0]) => {
    setLoading(true);
    setTimeout(() => {
      onComplete(loc.hlb, { lat: loc.lat, lng: loc.lng }, loc.district, loc.state);
    }, 500);
  };

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
            {/* Modes intro — the two ways to map. Shown only during the guided tour. */}
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
                💡 In the real app you can also type the HLB number and coordinates by hand. Picking other locations is disabled during the tour.
              </p>
            </div>
          </>
        )}

        {!isDemoMode && (
        <>
        {/* SMS Paste Area */}
        <div>
          <label className="block text-sm font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">
            Census SMS यहाँ paste करें
          </label>
          <textarea
            value={smsText}
            onChange={e => handleSMSTextChange(e.target.value)}
            placeholder="Paste your Census 2027 assignment message here...&#10;&#10;Example: HLB 0455 assigned to you. Location: https://maps.google.com/?q=26.4499,80.3319"
            className="w-full border border-gray-300 rounded-[12px] px-4 py-3 text-lg focus:border-[var(--color-saffron-container)] focus:outline-none transition-colors font-noto-sans min-h-[120px] bg-white shadow-[var(--shadow-warm-inner)]"
          />
          <p className="text-xs text-gray-500 mt-1 font-noto-sans">
            Paste your Census 2027 assignment message here
          </p>
        </div>

        {/* Detection Result */}
        {detected && (
          <div className="bg-[var(--color-india-green)]/10 border border-[var(--color-india-green)]/30 rounded-[12px] px-4 py-3 flex items-center gap-3">
            <span className="text-[var(--color-india-green)] text-xl font-bold">✓</span>
            <div>
              <p className="text-sm font-semibold text-[var(--color-india-green)] font-noto-sans">
                HLB {detected.hlb} detected
              </p>
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
              Could not auto-detect HLB number and coordinates. Try entering manually below.
            </p>
          </div>
        )}

        {/* Proceed Button from SMS */}
        {detected && detected.coords.lat !== 0 && (
          <button
            onClick={handleProceed}
            disabled={loading}
            className="w-full py-4 rounded-full text-white font-bold text-lg font-public-sans bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] active:scale-[0.98] shadow-[var(--shadow-warm-2)] transition-all disabled:opacity-50 min-h-[52px]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Finding your area...
              </span>
            ) : (
              'Open My Area Map →'
            )}
          </button>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-noto-sans font-bold">OR</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Manual Entry */}
        <div>
          <button
            onClick={() => setManualMode(!manualMode)}
            className="w-full py-3 border-2 border-[var(--color-saffron)]/20 rounded-full text-[var(--color-charcoal)] font-semibold text-sm font-noto-sans hover:bg-[var(--color-saffron)]/5 transition-colors min-h-[52px]"
          >
            {manualMode ? '▲ Hide Manual Entry' : '✏️ Enter HLB Number Manually'}
          </button>

          {manualMode && (
            <div className="mt-4 space-y-4 bg-white rounded-[24px] p-5 border border-gray-100 shadow-[var(--shadow-warm-1)]">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">HLB Number</label>
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
                  <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">Latitude</label>
                  <input
                    type="text"
                    value={manualLat}
                    onChange={e => setManualLat(e.target.value)}
                    placeholder="26.4499"
                    className="w-full border border-gray-300 rounded-lg px-3 py-3 text-sm focus:border-[var(--color-saffron-container)] focus:outline-none font-jetbrains-mono bg-white"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-[var(--color-charcoal)] mb-1 font-noto-sans">Longitude</label>
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
                disabled={!manualHLB.trim() || isNaN(parseFloat(manualLat)) || isNaN(parseFloat(manualLng))}
                className="w-full py-4 mt-2 rounded-full bg-[var(--color-saffron-container)] text-white font-bold text-lg font-public-sans hover:bg-[var(--color-saffron)] shadow-[var(--shadow-warm-1)] transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed min-h-[52px]"
              >
                Open Map →
              </button>
            </div>
          )}
        </div>

        {/* Demo Locations */}
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-500 mb-3 font-noto-sans uppercase tracking-wider">Quick Demo Locations:</p>
          <div className="space-y-3">
            {DEMO_LOCATIONS.map(loc => (
              <button
                key={loc.hlb}
                onClick={() => handleDemoLocation(loc)}
                disabled={false}
                className="w-full flex items-center justify-between bg-white border border-gray-100 shadow-[var(--shadow-warm-1)] rounded-[16px] px-5 py-4 hover:border-[var(--color-saffron-container)] hover:bg-[var(--color-warm-paper)] transition-all min-h-[52px] disabled:opacity-65"
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
        </>
        )}
      </div>
    </div>
  );
}
