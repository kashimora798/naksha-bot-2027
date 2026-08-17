import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import type { Coordinate, Block } from '../types';
import { pointInPolygon, distanceBetween } from '../lib/geo';

interface Props {
  map: L.Map | null;
  center?: Coordinate;
  boundaryPins?: Coordinate[];
  blocks?: Block[];
  hlbCode?: string;
  theme?: 'light' | 'dark';
  className?: string;
  buttonClassName?: string;
  showStatusPill?: boolean;
  showFitBoundaryButton?: boolean;
  onLocationUpdate?: (coord: Coordinate, isInside: boolean) => void;
}

interface GPSPosition {
  lat: number;
  lng: number;
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  timestamp: number;
}

export default function LiveLocationControl({
  map,
  center,
  boundaryPins,
  blocks,
  hlbCode,
  theme = 'light',
  className = '',
  buttonClassName = '',
  showStatusPill = true,
  showFitBoundaryButton = true,
  onLocationUpdate
}: Props) {
  const [gpsActive, setGpsActive] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentPos, setCurrentPos] = useState<GPSPosition | null>(null);
  const [isInsideHLB, setIsInsideHLB] = useState<boolean | null>(null);
  const [distToBoundaryM, setDistToBoundaryM] = useState<number | null>(null);
  const [insideBlockLabel, setInsideBlockLabel] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize LayerGroup on map
  useEffect(() => {
    if (!map) return;
    const lg = L.layerGroup().addTo(map);
    layerGroupRef.current = lg;

    return () => {
      lg.clearLayers();
      lg.remove();
      layerGroupRef.current = null;
    };
  }, [map]);

  // Calculate distance to nearest point on boundary polygon
  const calculateDistanceToBoundary = useCallback((point: Coordinate, pins: Coordinate[]): number => {
    if (pins.length < 3) return 0;
    let minDist = Infinity;
    for (let i = 0; i < pins.length; i++) {
      const p1 = pins[i];
      const p2 = pins[(i + 1) % pins.length];
      
      // Calculate distance to vertex
      const d1 = distanceBetween(point, p1);
      if (d1 < minDist) minDist = d1;

      // Approximate distance along segment
      const midPoint = { lat: (p1.lat + p2.lat) / 2, lng: (p1.lng + p2.lng) / 2 };
      const dMid = distanceBetween(point, midPoint);
      if (dMid < minDist) minDist = dMid;
    }
    return Math.round(minDist);
  }, []);

  // Update map overlays when location changes
  const updateMapOverlays = useCallback((pos: GPSPosition) => {
    if (!map || !layerGroupRef.current) return;
    const lg = layerGroupRef.current;
    const latlng: [number, number] = [pos.lat, pos.lng];

    // 1. Create or update pulsing blue dot marker with smooth movement
    const hasHeading = typeof pos.heading === 'number' && !isNaN(pos.heading) && pos.heading !== null;
    const headingDeg = hasHeading ? pos.heading : 0;

    const markerHtml = `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; pointer-events: none;">
        ${hasHeading ? `
          <div style="position: absolute; width: 44px; height: 44px; transform: rotate(${headingDeg}deg); transform-origin: center center; display: flex; align-items: flex-start; justify-content: center;">
            <div style="width: 0; height: 0; border-left: 7px solid transparent; border-right: 7px solid transparent; border-bottom: 14px solid rgba(37, 99, 235, 0.7); margin-top: -6px;"></div>
          </div>
        ` : ''}
        <!-- Outer pulsing radar ripple 1 -->
        <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: radial-gradient(circle, rgba(59, 130, 246, 0.5) 0%, rgba(59, 130, 246, 0) 75%); animation: gpsRipple 2.2s cubic-bezier(0.25, 1, 0.5, 1) infinite;"></div>
        <!-- Outer pulsing radar ripple 2 -->
        <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: radial-gradient(circle, rgba(59, 130, 246, 0.35) 0%, rgba(59, 130, 246, 0) 75%); animation: gpsRipple 2.2s cubic-bezier(0.25, 1, 0.5, 1) infinite 0.75s;"></div>
        <!-- White Halo Glow Ring -->
        <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background: #ffffff; box-shadow: 0 0 10px rgba(37, 99, 235, 0.75), 0 2px 6px rgba(0, 0, 0, 0.35);"></div>
        <!-- Vibrant Google Blue Core Dot -->
        <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); display: flex; align-items: center; justify-content: center; box-shadow: inset 0 1px 2px rgba(255, 255, 255, 0.6);">
          <!-- Center Bright Light Pip -->
          <div style="width: 5px; height: 5px; border-radius: 50%; background: #ffffff; box-shadow: 0 0 3px #ffffff;"></div>
        </div>
      </div>
    `;

    const customIcon = L.divIcon({
      className: 'live-gps-custom-icon-clean',
      html: markerHtml,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    if (markerRef.current) {
      markerRef.current.setLatLng(latlng);
      markerRef.current.setIcon(customIcon);
    } else {
      const marker = L.marker(latlng, { icon: customIcon, zIndexOffset: 2000, interactive: false });
      marker.addTo(lg);
      markerRef.current = marker;
    }

    // 2. Accuracy circle
    if (circleRef.current) {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(Math.max(pos.accuracy, 3));
    } else {
      const circle = L.circle(latlng, {
        radius: Math.max(pos.accuracy, 3),
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: '4, 5',
        interactive: false
      }).addTo(lg);
      circleRef.current = circle;
    }
  }, [map]);

  // Handle GPS position updates (tracks moving user in real-time)
  const handlePositionSuccess = useCallback((position: GeolocationPosition) => {
    setLoading(false);
    setErrorMsg(null);

    const pos: GPSPosition = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: Math.round(position.coords.accuracy),
      heading: position.coords.heading,
      speed: position.coords.speed,
      timestamp: position.timestamp
    };

    setCurrentPos(pos);
    updateMapOverlays(pos);

    // HLB Boundary & Block check
    let inside = false;
    if (boundaryPins && boundaryPins.length >= 3) {
      inside = pointInPolygon({ lat: pos.lat, lng: pos.lng }, boundaryPins);
      setIsInsideHLB(inside);

      if (!inside) {
        const dist = calculateDistanceToBoundary({ lat: pos.lat, lng: pos.lng }, boundaryPins);
        setDistToBoundaryM(dist);
      } else {
        setDistToBoundaryM(0);
      }
    } else if (center) {
      const dist = Math.round(distanceBetween({ lat: pos.lat, lng: pos.lng }, center));
      inside = dist <= 40; // within 40m of center
      setIsInsideHLB(inside);
      setDistToBoundaryM(dist);
    } else {
      setIsInsideHLB(null);
      setDistToBoundaryM(null);
    }

    // Block check
    if (blocks && blocks.length > 0) {
      const foundBlock = blocks.find(b => {
        if (b.points && b.points.length >= 3) {
          return pointInPolygon({ lat: pos.lat, lng: pos.lng }, b.points);
        }
        return pos.lat >= b.south && pos.lat <= b.north && pos.lng >= b.west && pos.lng <= b.east;
      });
      setInsideBlockLabel(foundBlock ? (foundBlock.label || 'Block') : null);
    } else {
      setInsideBlockLabel(null);
    }

    if (onLocationUpdate) {
      onLocationUpdate({ lat: pos.lat, lng: pos.lng }, inside);
    }

    // Smoothly pan map to follow the user as they walk
    if (isFollowing && map) {
      map.panTo([pos.lat, pos.lng], { animate: true });
    }
  }, [center, boundaryPins, blocks, isFollowing, map, calculateDistanceToBoundary, updateMapOverlays, onLocationUpdate]);

  const handlePositionError = useCallback((err: GeolocationPositionError) => {
    setLoading(false);
    let msg = 'Unable to retrieve location';
    if (err.code === 1) msg = 'Location permission denied. Please allow location access in browser settings.';
    else if (err.code === 2) msg = 'Location unavailable. Please check device GPS.';
    else if (err.code === 3) msg = 'Location request timed out.';
    setErrorMsg(msg);
  }, []);

  // Start GPS watching
  const startWatchingGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setGpsActive(true);
    setIsFollowing(true);

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePositionSuccess,
      handlePositionError,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000
      }
    );
  }, [handlePositionSuccess, handlePositionError]);

  // Stop GPS watching
  const stopWatchingGPS = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (layerGroupRef.current) {
      layerGroupRef.current.clearLayers();
    }
    markerRef.current = null;
    circleRef.current = null;
    setGpsActive(false);
    setIsFollowing(false);
    setLoading(false);
    setCurrentPos(null);
  }, []);

  // Center/fly to user location
  const centerOnUser = useCallback(() => {
    if (!map) return;
    if (!gpsActive) {
      startWatchingGPS();
      return;
    }

    if (currentPos) {
      setIsFollowing(true);
      map.flyTo([currentPos.lat, currentPos.lng], Math.max(map.getZoom(), 17), {
        duration: 0.8,
        easeLinearity: 0.25
      });
    } else {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (p) => {
          handlePositionSuccess(p);
          setIsFollowing(true);
          map.flyTo([p.coords.latitude, p.coords.longitude], Math.max(map.getZoom(), 17), {
            duration: 0.8
          });
        },
        handlePositionError,
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
  }, [map, gpsActive, currentPos, startWatchingGPS, handlePositionSuccess, handlePositionError]);

  // Smoothly fit map view back to HLB boundary or center
  const fitHLBBoundary = useCallback(() => {
    if (!map) return;
    if (boundaryPins && boundaryPins.length >= 3) {
      const poly = L.polygon(boundaryPins.map(p => [p.lat, p.lng]));
      map.fitBounds(poly.getBounds(), { padding: [35, 35], maxZoom: 19, animate: true });
      setIsFollowing(false);
    } else if (center) {
      map.flyTo([center.lat, center.lng], 17, { animate: true });
      setIsFollowing(false);
    }
  }, [map, boundaryPins, center]);

  // If user drags/pans the map manually, exit follow-lock mode without turning GPS off
  useEffect(() => {
    if (!map) return;
    const onDragStart = () => {
      if (isFollowing) {
        setIsFollowing(false);
      }
    };
    map.on('dragstart', onDragStart);
    return () => {
      map.off('dragstart', onDragStart);
    };
  }, [map, isFollowing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const isDark = theme === 'dark';
  const hasBoundary = Boolean((boundaryPins && boundaryPins.length >= 3) || center);

  return (
    <>
      {/* ── Main Google Maps Style Locate Button & Back-To-HLB ── */}
      <div className={`relative flex flex-col items-center gap-1.5 ${className}`}>
        {/* Locate Me button */}
        <button
          type="button"
          onClick={() => {
            if (gpsActive && isFollowing) {
              // Clicking while locked & centered toggles GPS off
              stopWatchingGPS();
            } else {
              centerOnUser();
            }
          }}
          title={
            !gpsActive
              ? 'Turn on live GPS location'
              : isFollowing
              ? 'GPS active & centered (Click to turn off)'
              : 'Center on my location'
          }
          className={`relative w-10 h-10 rounded-xl shadow-md flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer ${buttonClassName} ${
            gpsActive
              ? isFollowing
                ? 'bg-blue-600 text-white shadow-blue-500/40 ring-2 ring-blue-400'
                : isDark
                ? 'bg-slate-800 text-blue-400 border border-blue-500/50 hover:bg-slate-700'
                : 'bg-white text-blue-600 border border-blue-400 hover:bg-blue-50'
              : isDark
              ? 'bg-slate-900/90 backdrop-blur text-slate-300 border border-slate-700 hover:bg-slate-800 hover:text-white'
              : 'bg-white/95 backdrop-blur text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          {loading ? (
            <svg className="animate-spin h-5 w-5 text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : gpsActive ? (
            <div className="relative flex items-center justify-center">
              {/* Google Maps style crosshairs */}
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
              </svg>
              {isFollowing && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 border-2 border-blue-600 rounded-full animate-pulse" />
              )}
            </div>
          ) : (
            <svg className="w-5 h-5 opacity-85" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
            </svg>
          )}
        </button>

        {/* Back to HLB Boundary Button */}
        {showFitBoundaryButton && hasBoundary && (
          <button
            type="button"
            onClick={fitHLBBoundary}
            title="Fit map back to HLB Boundary"
            className={`w-10 h-10 rounded-xl shadow-md flex flex-col items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer ${
              isDark
                ? 'bg-slate-900/90 backdrop-blur text-emerald-400 border border-slate-700 hover:bg-slate-800'
                : 'bg-white/95 backdrop-blur text-emerald-700 border border-gray-200 hover:bg-emerald-50'
            }`}
          >
            <span className="text-base leading-none">🗺️</span>
            <span className="text-[7.5px] font-black uppercase tracking-tighter mt-0.5 leading-none">HLB</span>
          </button>
        )}
      </div>

      {/* ── Active Live Location Info Pill (Portaled to root at top of App below navbar) ── */}
      {gpsActive && currentPos && showStatusPill && typeof document !== 'undefined' && createPortal(
        <div
          className={`fixed top-[64px] sm:top-[68px] left-1/2 -translate-x-1/2 z-[99999] transition-all duration-200 pointer-events-auto shadow-2xl rounded-full px-3 py-1.5 flex items-center gap-1.5 sm:gap-2 border text-xs font-medium backdrop-blur-md max-w-[94vw] ${
            isDark
              ? 'bg-slate-900/95 border-slate-700 text-slate-100 shadow-slate-950/80'
              : 'bg-white/95 border-gray-200 text-gray-800 shadow-gray-900/25'
          }`}
        >
          {/* Status Dot */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isInsideHLB === true
                  ? 'bg-emerald-500 shadow-xs shadow-emerald-500 animate-pulse'
                  : isInsideHLB === false
                  ? 'bg-amber-500 shadow-xs shadow-amber-500 animate-pulse'
                  : 'bg-blue-500 animate-pulse'
              }`}
            />
            <span className="font-bold text-[10.5px] sm:text-[11px] whitespace-nowrap">
              {isInsideHLB === true
                ? `Inside ${hlbCode ? `HLB ${hlbCode}` : 'HLB'}${insideBlockLabel ? ` · ${insideBlockLabel}` : ''}`
                : isInsideHLB === false
                ? `Outside HLB (${
                    distToBoundaryM !== null
                      ? distToBoundaryM >= 1000
                        ? `${(distToBoundaryM / 1000).toFixed(1)}km away`
                        : `${distToBoundaryM}m away`
                      : 'nearby'
                  })`
                : 'Live GPS Active'}
            </span>
          </div>

          <span className={`w-px h-3 shrink-0 ${isDark ? 'bg-slate-700' : 'bg-gray-200'}`} />

          {/* Accuracy info */}
          <span className={`text-[10px] shrink-0 whitespace-nowrap ${isDark ? 'text-slate-400' : 'text-gray-500'}`}>
            ±{currentPos.accuracy}m
          </span>

          {/* Center Me action */}
          <button
            type="button"
            onClick={centerOnUser}
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer shrink-0 whitespace-nowrap ${
              isFollowing
                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95'
            }`}
          >
            {isFollowing ? '✓ Centered' : '🎯 Center'}
          </button>

          {/* Fit HLB Boundary action */}
          {hasBoundary && (
            <button
              type="button"
              onClick={fitHLBBoundary}
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full transition-all cursor-pointer flex items-center gap-1 shrink-0 whitespace-nowrap ${
                isDark
                  ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-400 border border-emerald-500/30 active:scale-95'
                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 active:scale-95'
              }`}
              title="Fly map view back to HLB boundary"
            >
              <span>🗺️</span>
              <span>Fit HLB</span>
            </button>
          )}

          {/* Turn off button */}
          <button
            type="button"
            onClick={stopWatchingGPS}
            title="Turn off GPS"
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all cursor-pointer shrink-0 ${
              isDark ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-800' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
          >
            ✕
          </button>
        </div>,
        document.body
      )}

      {/* ── Error Toast ── */}
      {errorMsg && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[99999] bg-rose-600 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 max-w-sm text-center">
          <span>⚠️ {errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="ml-auto text-white/80 hover:text-white font-bold px-1.5 py-0.5 rounded text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>,
        document.body
      )}
      {/* ── Custom CSS for pristine un-distorted GPS Marker & Pulse Ripple ── */}
      <style>{`
        .live-gps-custom-icon-clean {
          background: transparent !important;
          border: none !important;
          outline: none !important;
          box-shadow: none !important;
          width: 44px !important;
          height: 44px !important;
        }
        @keyframes gpsRipple {
          0% {
            transform: scale(0.4);
            opacity: 0.95;
          }
          50% {
            opacity: 0.6;
          }
          100% {
            transform: scale(2.4);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}
