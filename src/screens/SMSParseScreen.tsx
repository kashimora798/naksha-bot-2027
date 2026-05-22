import React, { useState, useCallback } from 'react';
import type { Coordinate } from '../types';

interface Props {
  onComplete: (hlb: string, center: Coordinate, district: string, state: string) => void;
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

export default function SMSParseScreen({ onComplete }: Props) {
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-orange-500 text-white px-4 pt-4 pb-3">
        <h2 className="text-lg font-bold font-[Baloo_2]">Step 2: Find Your HLB Area</h2>
        <p className="text-sm opacity-90 font-[Noto_Sans]">HLB क्षेत्र का SMS यहाँ paste करें</p>
      </div>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        {/* SMS Paste Area */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1 font-[Noto_Sans]">
            Census SMS यहाँ paste करें
          </label>
          <textarea
            value={smsText}
            onChange={e => handleSMSTextChange(e.target.value)}
            placeholder="Paste your Census 2027 assignment message here...&#10;&#10;Example: HLB 0455 assigned to you. Location: https://maps.google.com/?q=26.4499,80.3319"
            className="w-full border-2 border-dashed border-orange-400 rounded-xl px-4 py-3 text-sm focus:border-orange-500 focus:outline-none transition-colors font-[Noto_Sans] min-h-[120px] bg-orange-50/30"
            rows={5}
          />
          <p className="text-xs text-gray-400 mt-1 font-[Noto_Sans]">
            Paste your Census 2027 assignment message here
          </p>
        </div>

        {/* Detection Result */}
        {detected && (
          <div className="bg-green-50 border border-green-300 rounded-xl px-4 py-3 flex items-center gap-3">
            <span className="text-green-600 text-xl">✓</span>
            <div>
              <p className="text-sm font-semibold text-green-800 font-[Noto_Sans]">
                HLB {detected.hlb} detected
              </p>
              {detected.coords.lat !== 0 && (
                <p className="text-xs text-green-600 font-mono">
                  {detected.coords.lat.toFixed(4)}°N, {detected.coords.lng.toFixed(4)}°E
                </p>
              )}
            </div>
          </div>
        )}

        {smsText.trim() && !detected && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-xl px-4 py-3">
            <p className="text-sm text-yellow-800 font-[Noto_Sans]">
              Could not auto-detect HLB number and coordinates. Try entering manually below.
            </p>
          </div>
        )}

        {/* Proceed Button from SMS */}
        {detected && detected.coords.lat !== 0 && (
          <button
            onClick={handleProceed}
            disabled={loading}
            className="w-full py-4 rounded-xl text-white font-bold text-lg font-[Baloo_2] bg-orange-500 hover:bg-orange-600 active:scale-[0.98] shadow-lg transition-all disabled:opacity-50"
            style={{ height: 56 }}
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
          <div className="flex-1 h-px bg-gray-300" />
          <span className="text-xs text-gray-400 font-[Noto_Sans]">OR</span>
          <div className="flex-1 h-px bg-gray-300" />
        </div>

        {/* Manual Entry */}
        <div>
          <button
            onClick={() => setManualMode(!manualMode)}
            className="w-full py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold text-sm font-[Noto_Sans] hover:bg-gray-50 transition-colors"
          >
            {manualMode ? '▲ Hide Manual Entry' : '✏️ Enter HLB Number Manually'}
          </button>

          {manualMode && (
            <div className="mt-3 space-y-3 bg-white rounded-xl p-4 border border-gray-200">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">HLB Number</label>
                <input
                  type="text"
                  value={manualHLB}
                  onChange={e => setManualHLB(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="e.g. 0455"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Latitude</label>
                  <input
                    type="text"
                    value={manualLat}
                    onChange={e => setManualLat(e.target.value)}
                    placeholder="26.4499"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:outline-none font-mono"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Longitude</label>
                  <input
                    type="text"
                    value={manualLng}
                    onChange={e => setManualLng(e.target.value)}
                    placeholder="80.3319"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:outline-none font-mono"
                  />
                </div>
              </div>
              <button
                onClick={handleManualProceed}
                disabled={!manualHLB.trim() || isNaN(parseFloat(manualLat)) || isNaN(parseFloat(manualLng))}
                className="w-full py-3 rounded-lg bg-blue-500 text-white font-semibold text-sm hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                Open Map →
              </button>
            </div>
          )}
        </div>

        {/* Demo Locations */}
        <div>
          <p className="text-xs font-semibold text-gray-500 mb-2 font-[Noto_Sans]">Quick Demo Locations:</p>
          <div className="space-y-2">
            {DEMO_LOCATIONS.map(loc => (
              <button
                key={loc.hlb}
                onClick={() => handleDemoLocation(loc)}
                className="w-full flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3 hover:border-orange-300 hover:bg-orange-50/30 transition-colors"
              >
                <div className="text-left">
                  <span className="text-sm font-semibold text-gray-800">HLB {loc.hlb}</span>
                  <span className="text-xs text-gray-500 ml-2">{loc.district}, {loc.state}</span>
                </div>
                <span className="text-orange-500 text-sm">→</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
