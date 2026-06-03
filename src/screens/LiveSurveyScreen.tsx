import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import * as turf from '@turf/turf';
import { LiveSurveyEngine, SurveyState } from '../lib/LiveSurveyEngine';
import { idbStore, SurveySymbol, RoadSegment, SurveyPoint } from '../lib/idb';
import { getSmallSymbolSVG } from '../lib/symbols';
import { supabase } from '../lib/supabase';
import { buildComprehensiveQuery, processOverpassData, getBbox } from '../lib/geo';
import { beautifyPath } from '../lib/PathBeautifier';
import { generateLiveExportPdf } from '../lib/pdf-export';
import { HouseDataSidebar } from '../components/forms/HouseDataSidebar';
import type { Coordinate, SymbolType } from '../types';

// ─── Extended state types ──────────────────────────────────────
type LivePhase =
  | 'LOCATION_ENTRY'  // Step 1: SMS / manual lat-lng input
  | 'BOUNDARY_DRAW'   // Step 2: tap-to-draw polygon on satellite map
  | 'DOWNLOADING'     // Step 3: fetching OSM + tiles
  | 'READY'           // Step 4: ready to start
  | 'RECORDING'       // Step 5: actively surveying
  | 'PAUSED'          // Step 6: paused
  | 'REVIEWING'       // Step 7: review before finish
  | 'COMPLETED';      // Done

interface Props {
  blockPolygon?: any; // Optional pre-loaded GeoJSON (when resuming a draft)
  resumeSessionId?: string;
  onExit: () => void;
  onSaveAsDraft?: (sessionId: string) => void;
}

// ─── Coord / SMS parse helpers ─────────────────────────────────
function parseCoords(text: string): { lat: number; lng: number } | null {
  const qm = text.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (qm) return { lat: parseFloat(qm[1]), lng: parseFloat(qm[2]) };
  const at = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
  const pl = text.match(/(-?\d{2}\.\d{3,}),\s*(-?\d{2,3}\.\d{3,})/);
  if (pl) return { lat: parseFloat(pl[1]), lng: parseFloat(pl[2]) };
  return null;
}

// ─── Direction arrow SVG for GPS marker ───────────────────────
function getArrowSVG(bearing: number, accuracy: number) {
  const color = accuracy < 5 ? '#22c55e' : accuracy < 15 ? '#f59e0b' : '#ef4444';
  return `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
    <circle cx="20" cy="20" r="18" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.5"/>
    <g transform="rotate(${bearing}, 20, 20)">
      <polygon points="20,4 27,28 20,23 13,28" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
    </g>
    <circle cx="20" cy="20" r="4" fill="${color}" stroke="white" stroke-width="2"/>
  </svg>`;
}

export default function LiveSurveyScreen({ blockPolygon, resumeSessionId: propResumeSessionId, onExit: propOnExit, onSaveAsDraft: propOnSaveAsDraft }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  const resumeSessionId = propResumeSessionId || searchParams.get('session') || undefined;
  const onExit = propOnExit || (() => navigate('/live-dashboard'));
  const onSaveAsDraft = propOnSaveAsDraft || (() => navigate('/live-dashboard'));

  // ── Map refs ────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const setupContainerRef = useRef<HTMLDivElement>(null);
  const setupMapRef = useRef<L.Map | null>(null);
  const lastGpsPos = useRef<{ lat: number; lng: number } | null>(null);
  const satTileLayerRef = useRef<L.TileLayer | null>(null);

  // Layer groups for survey map
  const bndGrp = useRef(L.layerGroup());
  const gpsGrp = useRef(L.layerGroup());
  const pathGrp = useRef(L.layerGroup());
  const symGrp = useRef(L.layerGroup());
  const roadGrp = useRef(L.layerGroup());
  const osmRoadGrp = useRef(L.layerGroup());   // OSM road overlays
  const watGrp = useRef(L.layerGroup());       // water bodies / rivers
  const forGrp = useRef(L.layerGroup());       // forests
  const frmGrp = useRef(L.layerGroup());       // farmland / landuse
  const bldGrp = useRef(L.layerGroup());       // buildings / POIs
  const lmkGrp = useRef(L.layerGroup());       // landmark labels
  const drawnFeaturesGrp = useRef(L.layerGroup()); // custom drawn features

  // GPS marker refs (smooth updates — no clear/re-add flicker)
  const gpsMarkerRef = useRef<L.Marker | null>(null);
  const gpsCircleRef = useRef<L.Circle | null>(null);

  // Layer groups for setup map
  const setupPinsGrp = useRef(L.layerGroup());

  // ── Engine ──────────────────────────────────────────────────
  const engineRef = useRef<LiveSurveyEngine | null>(null);
  const [activePolygon, setActivePolygon] = useState<any>(blockPolygon || null);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);

  // ── Phase ───────────────────────────────────────────────────
  const [phase, setPhase] = useState<LivePhase>(blockPolygon ? 'READY' : (resumeSessionId ? 'DOWNLOADING' : 'LOCATION_ENTRY'));

  const engineInitialized = useRef(false);

  // ── Location entry ──────────────────────────────────────────
  const [smsText, setSmsText] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [enteredCenter, setEnteredCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [locationName, setLocationName] = useState('');

  // ── Boundary draw ───────────────────────────────────────────
  const [setupPins, setSetupPins] = useState<Coordinate[]>([]);
  const [currentLoc, setCurrentLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [distanceToSite, setDistanceToSite] = useState<number | null>(null);

  // ── Download / OSM data ──────────────────────────────────────
  const [dlProgress, setDlProgress] = useState({ tiles: 0, roads: 0, features: 0, gps: 0 });
  const [osmRoads, setOsmRoads] = useState<any[]>([]);
  const [osmBuildings, setOsmBuildings] = useState<any[]>([]);   // {lat,lng,type,name?}
  const [osmWater, setOsmWater] = useState<any[]>([]);            // {coords,name?,type}
  const [osmForests, setOsmForests] = useState<any[]>([]);        // {coords,name?}
  const [osmFarmland, setOsmFarmland] = useState<any[]>([]);      // {coords,type,label?}
  const [osmLandmarks, setOsmLandmarks] = useState<any[]>([]);    // {lat,lng,name}

  // ── Survey state ─────────────────────────────────────────────
  const [gpsAccuracy, setGpsAccuracy] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  const [speedWarning, setSpeedWarning] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [gpsBearing, setGpsBearing] = useState(0);
  const [stats, setStats] = useState({ distance: 0, duration: 0, houses: 0 });
  const [roadType, setRoadType] = useState('residential');
  const [symType, setSymType] = useState('pucca_house');
  const [vehicleWarning, setVehicleWarning] = useState(false);
  const [outOfBounds, setOutOfBounds] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [selectedReviewSym, setSelectedReviewSym] = useState<SurveySymbol | null>(null);
  const [symbols, setSymbols] = useState<SurveySymbol[]>([]);
  const [autoSaveLabel, setAutoSaveLabel] = useState<'saved' | 'saving'>('saved');
  const [bgFetching, setBgFetching] = useState(false);
  const [locating, setLocating] = useState(false);  // locate-me in progress
  const [pureCanvasMode, setPureCanvasMode] = useState(false);
  const [osmToast, setOsmToast] = useState<string | null>(null);
  const [returnDialog, setReturnDialog] = useState(false);
  const [returnModeState, setReturnModeState] = useState<'none' | 'two_lane' | 'follow_back'>('none');
  const [selectedPlacedSymbol, setSelectedPlacedSymbol] = useState<SurveySymbol | null>(null);
  const [houseFormStep, setHouseFormStep] = useState<1 | 2>(1);
  const [drawMode, setDrawMode] = useState<'none' | 'block' | 'farmland' | 'forest' | 'waterBody' | 'landmark'>('none');
  const [drawingPoints, setDrawingPoints] = useState<Coordinate[]>([]);
  const [snapToRoads, setSnapToRoads] = useState(true);
  const [showExtraDrawTools, setShowExtraDrawTools] = useState(false);
  const drawingPolylineRef = useRef<L.Polyline | null>(null);

  // ── Compass tracking ──────────────────────────────────────────
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [hasCompassPermission, setHasCompassPermission] = useState<boolean>(false);

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading = null;
      if ('webkitCompassHeading' in e) {
        heading = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null) {
        heading = 360 - e.alpha;
      }
      if (heading !== null) {
        setCompassHeading(heading);
      }
    };
    
    if (typeof DeviceOrientationEvent !== 'undefined') {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // iOS requires explicit interaction to grant permission
      } else {
        setHasCompassPermission(true);
        window.addEventListener('deviceorientationabsolute', handleOrientation);
        window.addEventListener('deviceorientation', handleOrientation);
      }
    }
    
    return () => {
      window.removeEventListener('deviceorientationabsolute', handleOrientation);
      window.removeEventListener('deviceorientation', handleOrientation);
    };
  }, []);

  const requestCompassPermission = async () => {
    if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
      try {
        const permissionState = await (DeviceOrientationEvent as any).requestPermission();
        if (permissionState === 'granted') {
          setHasCompassPermission(true);
          const handleOrientation = (e: DeviceOrientationEvent) => {
            let heading = null;
            if ('webkitCompassHeading' in e) {
              heading = (e as any).webkitCompassHeading;
            } else if (e.alpha !== null) {
              heading = 360 - e.alpha;
            }
            if (heading !== null) setCompassHeading(heading);
          };
          window.addEventListener('deviceorientation', handleOrientation);
        }
      } catch (err) {
        console.error('Compass permission error', err);
      }
    }
  };

  // ── Initialize engine when polygon is ready or resuming ──────────────────
  useEffect(() => {
    if (engineInitialized.current) return;
    if (!activePolygon && !resumeSessionId) return;
    engineInitialized.current = true;

    engineRef.current = new LiveSurveyEngine(activePolygon, supabase, idbStore, resumeSessionId);
    engineRef.current.setSnapToRoadsEnabled(snapToRoads);

    if (resumeSessionId) {
      engineRef.current.loadSessionData().then(async () => {
        if (engineRef.current) {
          setActivePolygon(engineRef.current.blockPolygon);
          setSymbols([...engineRef.current.symbols]);
          
          // Load cached footprints if available
          try {
            const cached = await idbStore.getCachedFootprints(resumeSessionId);
            if (cached) {
              setOsmRoads(cached.roads);
              setOsmBuildings(cached.buildings);
              setOsmWater(cached.water || []);
              setOsmForests(cached.forests || []);
              setOsmFarmland(cached.farmland || []);
              engineRef.current.setOsmRoads(cached.roads);
            }
          } catch (e) {
            console.error('Failed to load cached footprints:', e);
          }

          // Re-trigger draw if map exists
          setTimeout(() => drawLivePath(), 500);
          setPhase('PAUSED');
        }
      });
    }

    engineRef.current.on('stateChanged', () => {});
    engineRef.current.on('gpsError', (err: GeolocationPositionError) => {
      const msg = err?.code === 1 ? 'Location permission denied. Enable GPS access for this site in your browser settings.'
                : err?.code === 2 ? 'GPS signal unavailable. Move to an open area and try again.'
                : err?.code === 3 ? 'GPS is taking longer than usual to get a fix. Still trying…'
                : 'GPS error. Check that location is enabled.';
      setGpsError(msg);
    });
    engineRef.current.on('accuracyWarning', (data: { accuracy: number; message: string }) => {
      setGpsWarning(data.message);
    });
    engineRef.current.on('positionUpdate', (data: any) => {
      // A fresh fix arrived — clear any prior GPS error
      setGpsError(null);
      // Clear the degraded-accuracy warning once a good fix (<=10m) arrives
      if (data.accuracy <= 10) setGpsWarning(null);
      // Always update marker + basic info (fires on EVERY GPS fix)
      setGpsAccuracy(data.accuracy);
      setOutOfBounds(!data.insideBoundary);
      const b = (data.bearing === null || data.bearing === undefined || isNaN(data.bearing)) ? 0 : data.bearing;
      setGpsBearing(b);
      updateGPSMarker(data.position, data.accuracy, b);
      lastGpsPos.current = { lat: data.position.lat, lng: data.position.lng };

      if (activePolygon) {
        try {
          const center = turf.centerOfMass(activePolygon);
          const distKm = turf.distance(turf.point([data.position.lng, data.position.lat]), center);
          setDistanceToSite(distKm > 0.2 ? distKm : null);
        } catch (e) { /* ignore */ }
      }

      // Only redraw path and update stats when a real path point was recorded
      if (data.isPathPoint) {
        drawLivePath();
        setStats(prev => ({ ...prev, distance: engineRef.current!.calculateTotalDistance() }));
      }
    });
    engineRef.current.on('vehicleDetected', () => setVehicleWarning(true));
    engineRef.current.on('speedWarning', (data: { speed: number; message: string }) => {
      setSpeedWarning(data.message);
      setTimeout(() => setSpeedWarning(null), 5000);
    });
    engineRef.current.on('duplicateWarning', (data: { existing: any; message: string }) => {
      setDuplicateWarning(data.message);
      setTimeout(() => setDuplicateWarning(null), 5000);
    });
    engineRef.current.on('symbolsUpdated', (syms: SurveySymbol[]) => {
      setSymbols([...syms]);
      drawSymbols(syms);
      setStats(prev => ({
        ...prev,
        houses: syms.filter(s => ['pucca_house', 'kutcha_house'].includes(s.symbol_type)).length
      }));
    });
    // OSM road snap notifications
    engineRef.current.on('osmRoadEntered', (data: any) => {
      const name = data.road?.name || 'OSM Road';
      setOsmToast(`🛣️ Following ${name}`);
      setTimeout(() => setOsmToast(null), 3000);
    });
    engineRef.current.on('osmRoadLeft', () => {
      setOsmToast('↗️ Custom path');
      setTimeout(() => setOsmToast(null), 2000);
    });
    engineRef.current.on('returnDetected', () => {
      setReturnDialog(true);
    });
    return () => {
      // Clean up engine resources when component unmounts or activePolygon changes
      if (engineRef.current) {
        engineRef.current.destroy();
      }
    };
  }, [activePolygon]);

  // ── Auto-save every 30s during recording ────────────────────
  useEffect(() => {
    if (phase !== 'RECORDING') return;
    const iv = setInterval(async () => {
      if (!engineRef.current) return;
      setAutoSaveLabel('saving');
      const eng = engineRef.current;
      const sessionId = eng.sessionId;
      await idbStore.addSymbols(eng.symbols as any);
      await idbStore.addPoints(eng.smoothedPath.slice(-30));
      const hCount = eng.symbols.filter(s => ['pucca_house', 'kutcha_house'].includes(s.symbol_type as string)).length;
      await idbStore.updateSessionState(sessionId, 'paused', {
        houses_count: hCount,
        distance_m: Math.round(eng.calculateTotalDistance()),
        polygon_geojson: activePolygon ? JSON.stringify(activePolygon) : undefined,
        location_name: locationName,
      });
      setTimeout(() => setAutoSaveLabel('saved'), 1000);
    }, 30000);
    return () => clearInterval(iv);
  }, [phase, activePolygon, locationName]);

  // ── Setup map init (BOUNDARY_DRAW) ───────────────────────────
  useEffect(() => {
    if (phase !== 'BOUNDARY_DRAW' || !setupContainerRef.current) return;
    if (setupMapRef.current) {
      setupMapRef.current.invalidateSize();
      return;
    }
    const center = enteredCenter || { lat: 20, lng: 78 };
    const smap = L.map(setupContainerRef.current, { zoomControl: false, attributionControl: false })
      .setView([center.lat, center.lng], enteredCenter ? 17 : 5);
    // Google Satellite Hybrid with place names
    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 21 }).addTo(smap);
    setupPinsGrp.current.addTo(smap);
    setupMapRef.current = smap;

    smap.on('click', (e) => {
      setSetupPins(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
    });

    navigator.geolocation.getCurrentPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCurrentLoc(loc);
      L.circleMarker([loc.lat, loc.lng], { radius: 8, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.9, weight: 2 }).addTo(smap);
    }, undefined, { enableHighAccuracy: true });
  }, [phase, enteredCenter]);

  // ── Draw setup pins ──────────────────────────────────────────
  useEffect(() => {
    if (!setupMapRef.current || phase !== 'BOUNDARY_DRAW') return;
    setupPinsGrp.current.clearLayers();
    if (setupPins.length > 0) {
      setupPins.forEach((p, i) => {
        L.circleMarker([p.lat, p.lng], { radius: 6, color: '#CC2200', fillOpacity: 1, weight: 2 })
          .bindTooltip(`${i + 1}`, { permanent: true, direction: 'top', className: 'text-xs font-bold' })
          .addTo(setupPinsGrp.current);
      });
      const latlngs = setupPins.map(p => [p.lat, p.lng] as L.LatLngExpression);
      if (setupPins.length > 1) L.polyline(latlngs, { color: '#CC2200', weight: 2, dashArray: '5,5' }).addTo(setupPinsGrp.current);
      if (setupPins.length >= 3) {
        L.polygon(latlngs, { color: '#CC2200', weight: 2.5, fillOpacity: 0.15, fillColor: '#CC2200' }).addTo(setupPinsGrp.current);
      }
    }
  }, [setupPins, phase]);

  // ── Survey map init (RECORDING / PAUSED / REVIEWING) ─────────
  useEffect(() => {
    if (!containerRef.current) return;
    if (phase !== 'RECORDING' && phase !== 'PAUSED' && phase !== 'REVIEWING') return;
    if (mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false }).setView([20, 78], 18);
    const satLayer = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 21 });
    satLayer.addTo(map);
    satTileLayerRef.current = satLayer;
    
    // Add layers in z-order: bg features first, then paths, then GPS on top
    frmGrp.current.addTo(map);   // farmland / landuse (bottom)
    watGrp.current.addTo(map);   // water
    forGrp.current.addTo(map);   // forests
    bldGrp.current.addTo(map);   // buildings
    osmRoadGrp.current.addTo(map); // road overlays
    lmkGrp.current.addTo(map);   // landmark labels
    bndGrp.current.addTo(map);   // survey boundary
    roadGrp.current.addTo(map);  // user-drawn roads
    pathGrp.current.addTo(map);  // GPS path
    symGrp.current.addTo(map);   // placed symbols
    drawnFeaturesGrp.current.addTo(map); // custom drawn features
    gpsGrp.current.addTo(map);   // GPS marker (top)

    if (activePolygon?.geometry) {
      const blayer = L.geoJSON(activePolygon, { style: { color: '#FF6B00', weight: 2.5, dashArray: '6,4', fill: false } });
      blayer.addTo(bndGrp.current);
      map.fitBounds(blayer.getBounds());
    }

    if (currentLoc) {
      // Draw accuracy circle
      L.circle([currentLoc.lat, currentLoc.lng], { radius: 10, color: '#3b82f6', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(gpsGrp.current);
      // Draw direction arrow
      const icon = L.divIcon({ html: getArrowSVG(0, 10), className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
      L.marker([currentLoc.lat, currentLoc.lng], { icon }).addTo(gpsGrp.current);
      lastGpsPos.current = currentLoc;
    } else {
      navigator.geolocation.getCurrentPosition((pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Draw accuracy circle
        L.circle([loc.lat, loc.lng], { radius: Math.min(pos.coords.accuracy, 30), color: '#3b82f6', weight: 1.5, fillColor: '#3b82f6', fillOpacity: 0.15 }).addTo(gpsGrp.current);
        // Draw direction arrow
        const icon = L.divIcon({ html: getArrowSVG(pos.coords.heading ?? 0, pos.coords.accuracy), className: '', iconSize: [40, 40], iconAnchor: [20, 20] });
        L.marker([loc.lat, loc.lng], { icon }).addTo(gpsGrp.current);
        lastGpsPos.current = loc;
      }, undefined, { enableHighAccuracy: true });
    }

    mapRef.current = map;
    setMapInstance(map);
    
    // Listen to zoom changes to resize custom markers
    map.on('zoomend', () => {
      if (engineRef.current) {
        drawSymbols(engineRef.current.symbols);
      }
    });
    
  }, [phase, activePolygon]);  // Note: osmRoads/osmLandmarks handled in separate effect below

  // ── Reactive OSM overlay redraw when background data arrives ─
  useEffect(() => {
    if (!mapInstance) return;
    // Clear all OSM layers
    osmRoadGrp.current.clearLayers();
    watGrp.current.clearLayers();
    forGrp.current.clearLayers();
    frmGrp.current.clearLayers();
    bldGrp.current.clearLayers();
    lmkGrp.current.clearLayers();

    // 1. Draw water bodies / rivers (watGrp)
    osmWater.forEach(wb => {
      if (wb.type === 'pond' && wb.coords?.length >= 3) {
        L.polygon(wb.coords.map((c: any) => [c.lat, c.lng]), { color: '#1565C0', weight: 2, fillColor: '#42A5F5', fillOpacity: 0.25 }).addTo(watGrp.current);
      } else if (wb.coords?.length >= 2) {
        const w = wb.type === 'river' ? 4 : 2;
        L.polyline(wb.coords.map((c: any) => [c.lat, c.lng]), { color: '#1565C0', weight: w, opacity: 0.7 }).addTo(watGrp.current);
        if (wb.name) {
          const c = wb.center || wb.coords[0];
          L.marker([c.lat, c.lng], { icon: L.divIcon({ html: `<div style="background:rgba(21,101,192,0.8);color:white;font-size:8px;padding:1px 4px;border-radius:3px;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,0.5)">${wb.name}</div>`, className: '', iconAnchor: [20, 8] }), interactive: false }).addTo(watGrp.current);
        }
      }
    });

    // 2. Draw forests (forGrp)
    osmForests.forEach(fa => {
      if (fa.points?.length < 3) return;
      L.polygon(fa.points.map((p: any) => [p.lat, p.lng]), { color: '#2E7D32', weight: 2, dashArray: '6,3', fillColor: '#4CAF50', fillOpacity: 0.2 }).addTo(forGrp.current);
      const c = fa.points[0];
      L.marker([c.lat, c.lng], { icon: L.divIcon({ html: `<div style="color:#2E7D32;font-size:10px;font-weight:bold;text-shadow:0 0 3px white,-0 0 3px white,0 0 3px white;white-space:nowrap">🌳 ${fa.name || 'Forest'}</div>`, className: '', iconAnchor: [30, 8] }), interactive: false }).addTo(forGrp.current);
    });

    // 3. Draw farmland (frmGrp)
    osmFarmland.forEach(fb => {
      if (fb.points?.length < 3) return;
      L.polygon(fb.points.map((p: any) => [p.lat, p.lng]), { color: '#2E7D32', weight: 3, dashArray: '10,5', fillColor: '#66BB6A', fillOpacity: 0.15 }).addTo(frmGrp.current);
      const c = fb.points[0];
      L.marker([c.lat, c.lng], {
        icon: L.divIcon({ html: `<div style="font:bold 13px 'Baloo 2',sans-serif;color:#2E7D32;text-shadow:1px 1px 3px white,-1px -1px 3px white;text-align:center;pointer-events:none">🌾 Farm ${fb.label}</div>`, className: '', iconSize: [95, 22], iconAnchor: [47, 11] }), interactive: false,
      }).addTo(frmGrp.current);
    });

    // 4. Draw buildings (bldGrp)
    osmBuildings.forEach(s => {
      const st = s.symbol_type;
      const html = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(255,255,255,0.85);border:1.5px solid #6b7280;box-shadow:0 1px 4px rgba(0,0,0,0.2)">
        <div style="width:14px;height:14px">${getSmallSymbolSVG(st)}</div>
      </div>`;
      const icon = L.divIcon({ html, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([s.lat, s.lng], { icon }).addTo(bldGrp.current);
    });

    // 5. Draw roads (osmRoadGrp)
    osmRoads.forEach(rd => {
      if (rd.coords?.length < 2) return;
      const ll = rd.coords.map((c: any) => [c.lat, c.lng] as L.LatLngExpression);
      const hw = rd.highway || 'unclassified';
      
      const pk = ['motorway','trunk','primary','secondary'].includes(hw);
      const rs = ['residential','unclassified','tertiary','service','living_street'].includes(hw);
      const kt = ['footway','path','track','pedestrian','steps'].includes(hw);
      
      // Since these are pre-loaded OSM template roads (unconfirmed by the user yet), 
      // let's use the bright unconfirmed styling: orange/yellow casing + white/cream core!
      const lc = '#FFB830'; 
      const gc = '#FFF8E8';
      
      if (pk) {
        L.polyline(ll, { color: lc, weight: 8, opacity: 0.9 }).addTo(osmRoadGrp.current);
        L.polyline(ll, { color: gc, weight: 4, opacity: 0.95 }).addTo(osmRoadGrp.current);
      } else if (rs) {
        L.polyline(ll, { color: lc, weight: 6, opacity: 0.9 }).addTo(osmRoadGrp.current);
        L.polyline(ll, { color: gc, weight: 2.5, opacity: 0.95 }).addTo(osmRoadGrp.current);
      } else if (kt) {
        L.polyline(ll, { color: lc, weight: 5, dashArray: '10,6', opacity: 0.85 }).addTo(osmRoadGrp.current);
        L.polyline(ll, { color: gc, weight: 2, dashArray: '10,6', opacity: 0.9 }).addTo(osmRoadGrp.current);
      } else {
        L.polyline(ll, { color: lc, weight: 5, opacity: 0.85 }).addTo(osmRoadGrp.current);
        L.polyline(ll, { color: gc, weight: 2, opacity: 0.9 }).addTo(osmRoadGrp.current);
      }

      if (rd.name) {
        const mid = ll[Math.floor(ll.length / 2)];
        L.marker(mid, { icon: L.divIcon({ html: `<div style="background:rgba(0,0,0,0.65);color:white;font-size:9px;padding:1px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3)">${rd.name}</div>`, className: '', iconAnchor: [0, 0] }) }).addTo(osmRoadGrp.current);
      }
    });

    // 6. Draw landmarks (lmkGrp)
    osmLandmarks.forEach(lm => {
      const icon = L.divIcon({
        html: `<div style="background:rgba(255,255,255,0.85);color:#333;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;white-space:nowrap;border:1px solid #ccc">📌 ${lm.name}</div>`,
        className: '', iconAnchor: [0, 0]
      });
      L.marker([lm.lat, lm.lng], { icon }).addTo(lmkGrp.current);
    });
  }, [mapInstance, osmRoads, osmLandmarks, osmWater, osmForests, osmFarmland, osmBuildings]);

  // ── GPS Marker (direction arrow) ─────────────────────────────
  const updateGPSMarker = (pos: SurveyPoint | { lat: number; lng: number }, acc: number, bearing: number) => {
    if (!mapRef.current) return;
    const icon = L.divIcon({ html: getArrowSVG(bearing, acc), className: '', iconSize: [40, 40], iconAnchor: [20, 20] });

    if (gpsMarkerRef.current && gpsCircleRef.current) {
      // Smooth update — just move existing marker, no flicker
      gpsMarkerRef.current.setLatLng([pos.lat, pos.lng]);
      gpsMarkerRef.current.setIcon(icon);
      gpsCircleRef.current.setLatLng([pos.lat, pos.lng]);
      gpsCircleRef.current.setRadius(Math.min(acc, 30));
    } else {
      // First time — create elements
      gpsGrp.current.clearLayers();
      gpsCircleRef.current = L.circle([pos.lat, pos.lng], {
        radius: Math.min(acc, 30), color: '#3b82f6', weight: 1, fillColor: '#3b82f6', fillOpacity: 0.1
      }).addTo(gpsGrp.current);
      gpsMarkerRef.current = L.marker([pos.lat, pos.lng], { icon }).addTo(gpsGrp.current);
    }

    mapRef.current.setView([pos.lat, pos.lng]);
  };

  const drawLivePath = () => {
    if (!engineRef.current || !mapRef.current) return;
    pathGrp.current.clearLayers();
    
    // Draw committed road segments (beautified → straight straights, smooth curves)
    engineRef.current.roadSegments.forEach(seg => {
      if (seg.points.length < 2) return;
      const beautified = beautifyPath(seg.points);
      const ll = beautified.map(p => [p.lat, p.lng] as L.LatLngExpression);
      const isPk = seg.type === 'residential';
      const isRs = seg.type === 'tertiary';
      const isKt = ['track', 'footway'].includes(seg.type);
      
      const lc = '#000'; // Confirmed user road casing is black!
      const gc = isPk ? '#FFB020' : isRs ? '#FFF' : '#E0E0E0';
      
      if (isPk) {
        L.polyline(ll, { color: lc, weight: 8, opacity: 0.9 }).addTo(pathGrp.current);
        L.polyline(ll, { color: gc, weight: 4, opacity: 0.95 }).addTo(pathGrp.current);
      } else if (isRs) {
        L.polyline(ll, { color: lc, weight: 6, opacity: 0.9 }).addTo(pathGrp.current);
        L.polyline(ll, { color: gc, weight: 2.5, opacity: 0.95 }).addTo(pathGrp.current);
      } else if (isKt) {
        L.polyline(ll, { color: lc, weight: 5, dashArray: '10,6', opacity: 0.85 }).addTo(pathGrp.current);
        L.polyline(ll, { color: gc, weight: 2, dashArray: '10,6', opacity: 0.9 }).addTo(pathGrp.current);
      } else {
        L.polyline(ll, { color: lc, weight: 5, opacity: 0.85 }).addTo(pathGrp.current);
        L.polyline(ll, { color: gc, weight: 2, opacity: 0.9 }).addTo(pathGrp.current);
      }
    });

    // Draw active segment (beautified in real-time)
    const curSeg = engineRef.current.currentSegment;
    if (curSeg.points.length >= 2) {
      const beautified = beautifyPath(curSeg.points);
      const ll = beautified.map(p => [p.lat, p.lng] as L.LatLngExpression);
      const lc = '#CC2200';
      const gc = '#FF6B00';
      L.polyline(ll, { color: lc, weight: 7, opacity: 0.9 }).addTo(pathGrp.current);
      L.polyline(ll, { color: gc, weight: 3, opacity: 0.95 }).addTo(pathGrp.current);
    }
  };

  const drawSymbols = (syms: SurveySymbol[]) => {
    if (!mapRef.current) return;
    
    // Dynamic size based on zoom (Mapbox interpolation equivalent)
    const zoom = mapRef.current.getZoom();
    const size = Math.max(12, Math.min(36, (zoom - 15) * 6 + 18));
    const innerSize = size * 0.6;
    const textSize = Math.max(8, size * 0.35);
    
    symGrp.current.clearLayers();
    syms.forEach(sym => {
      const isConfirmed = phase === 'REVIEWING' || sym.number !== null;
      const html = `<div style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${isConfirmed ? 'white' : 'rgba(255,107,0,0.15)'};border:2px solid ${isConfirmed ? '#22c55e' : '#FF6B00'};box-shadow:0 2px 6px rgba(0,0,0,0.3); transition: all 0.2s ease;">
        <div style="width:${innerSize}px;height:${innerSize}px">${getSmallSymbolSVG(sym.symbol_type)}</div>
        ${sym.number ? `<div style="position:absolute;top:-${size*0.25}px;right:-${size*0.25}px;background:#2563eb;color:white;font-size:${textSize}px;font-weight:700;padding:1px 4px;border-radius:8px">${sym.number}</div>` : ''}
      </div>`;
      const icon = L.divIcon({ html, className: 'dynamic-house-icon', iconSize: [size, size], iconAnchor: [size/2, size/2] });
      const m = L.marker([sym.lat, sym.lng], { icon }).addTo(symGrp.current);
      if (phase === 'REVIEWING') {
        m.on('click', () => setSelectedReviewSym(sym));
      } else if (['pucca_house', 'kutcha_house', 'apartment', 'non_residential'].includes(sym.symbol_type)) {
        m.on('click', () => {
          setSelectedPlacedSymbol(sym);
          setHouseFormStep(1);
        });
      }
    });
  };

  const drawDrawnFeatures = useCallback(() => {
    if (!engineRef.current) return;
    drawnFeaturesGrp.current.clearLayers();
    const df = engineRef.current.drawnFeatures;
    
    df.blocks.forEach((p: any) => L.polygon(p.points.map((c: any) => [c.lat, c.lng]), { color: '#000', weight: 2, fillColor: '#fca5a5', fillOpacity: 0.4 }).addTo(drawnFeaturesGrp.current));
    df.farmlandBlocks.forEach((p: any) => L.polygon(p.points.map((c: any) => [c.lat, c.lng]), { color: '#16a34a', weight: 2, fillColor: '#bbf7d0', fillOpacity: 0.4 }).addTo(drawnFeaturesGrp.current));
    df.forests.forEach((p: any) => L.polygon(p.points.map((c: any) => [c.lat, c.lng]), { color: '#15803d', weight: 2, dashArray: '6,3', fillColor: '#86efac', fillOpacity: 0.4 }).addTo(drawnFeaturesGrp.current));
    df.waterBodies.forEach((p: any) => L.polygon(p.points.map((c: any) => [c.lat, c.lng]), { color: '#2563eb', weight: 2, fillColor: '#bfdbfe', fillOpacity: 0.5 }).addTo(drawnFeaturesGrp.current));
    df.landuseAreas.forEach((p: any) => L.polygon(p.points.map((c: any) => [c.lat, c.lng]), { color: '#a855f7', weight: 2, fillColor: '#e9d5ff', fillOpacity: 0.3 }).addTo(drawnFeaturesGrp.current));
    df.landmarks.forEach((l: any) => L.marker([l.lat, l.lng], { icon: L.divIcon({ html: `<div style="background:rgba(255,255,255,0.85);color:#333;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;white-space:nowrap;border:1px solid #ccc">📌 ${l.name}</div>`, className: '', iconAnchor: [0, 0] }) }).addTo(drawnFeaturesGrp.current));
  }, []);

  // ── Drawing Logic ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance || drawMode === 'none') return;
    
    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (drawMode === 'landmark') {
        const name = prompt("Landmark Name / पहचान चिह्न का नाम:", "New Landmark");
        if (name && engineRef.current) {
          engineRef.current.drawnFeatures.landmarks.push({ lat: e.latlng.lat, lng: e.latlng.lng, name: name });
          drawDrawnFeatures();
        }
        setDrawMode('none');
      } else {
        setDrawingPoints(prev => [...prev, { lat: e.latlng.lat, lng: e.latlng.lng }]);
      }
    };
    
    mapInstance.on('click', onMapClick);
    return () => { mapInstance.off('click', onMapClick); };
  }, [mapInstance, drawMode, drawDrawnFeatures]);

  useEffect(() => {
    if (!mapInstance) return;
    
    if (drawingPoints.length > 0) {
      if (!drawingPolylineRef.current) {
        drawingPolylineRef.current = L.polyline(drawingPoints.map(p => [p.lat, p.lng]), { color: '#FF6B00', weight: 3, dashArray: '5,5' }).addTo(mapInstance);
      } else {
        drawingPolylineRef.current.setLatLngs(drawingPoints.map(p => [p.lat, p.lng]));
      }
    } else {
      if (drawingPolylineRef.current) {
        drawingPolylineRef.current.remove();
        drawingPolylineRef.current = null;
      }
    }
  }, [drawingPoints, mapInstance]);


  useEffect(() => {
    if (phase === 'PAUSED' || phase === 'RECORDING') {
      drawDrawnFeatures();
    }
  }, [phase, drawDrawnFeatures]);

  const finishDrawing = () => {
    if (!engineRef.current || drawMode === 'none') return;
    
    if (drawMode === 'landmark') {
      if (drawingPoints.length > 0) {
        const name = prompt("Landmark Name / पहचान चिह्न का नाम:", "New Landmark");
        if (name) {
          engineRef.current.drawnFeatures.landmarks.push({ lat: drawingPoints[0].lat, lng: drawingPoints[0].lng, name: name });
        }
      }
    } else {
      if (drawingPoints.length >= 3) {
        if (drawMode === 'block') engineRef.current.drawnFeatures.blocks.push({ points: drawingPoints });
        else if (drawMode === 'farmland') engineRef.current.drawnFeatures.farmlandBlocks.push({ points: drawingPoints });
        else if (drawMode === 'forest') engineRef.current.drawnFeatures.forests.push({ points: drawingPoints });
        else if (drawMode === 'waterBody') engineRef.current.drawnFeatures.waterBodies.push({ points: drawingPoints });
        else if (drawMode === 'landuseArea') engineRef.current.drawnFeatures.landuseAreas.push({ points: drawingPoints });
      }
    }
    
    engineRef.current.saveToIDB();
    setDrawMode('none');
    setDrawingPoints([]);
    drawDrawnFeatures();
  };

  // ── Confirm location entry ───────────────────────────────────
  const handleLocationConfirm = (lat: number, lng: number, name: string) => {
    setEnteredCenter({ lat, lng });
    setLocationName(name);
    setPhase('BOUNDARY_DRAW');
  };

  // ── Cache OSM Footprints locally ──
  const cacheFootprints = (sessionId: string, roads: any[], detectedData: any) => {
    idbStore.saveCachedFootprints({
      session_id: sessionId,
      buildings: detectedData.symbols.filter((s: any) => ['pucca_house', 'kutcha_house', 'apartment', 'non_residential'].includes(s.symbol_type)),
      roads: roads,
      water: detectedData.waterBodies || [],
      forests: detectedData.forests || [],
      farmland: detectedData.farmlands || [],
    }).catch(e => console.error('Failed to cache footprints:', e));
  };

  // ── OSM background fetch ─────────────────────────────────────
  const fetchOsmData = useCallback(async (polygon: any) => {
    let cancelled = false;
    setBgFetching(true);
    try {
      const boundary: Coordinate[] = polygon.geometry.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
      const bbox = getBbox(boundary);
      // Fetch only within the exact boundary drawn (reduces load)
      const query = buildComprehensiveQuery(bbox, 0);

      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(20000),
      });
      if (cancelled) return;

      if (!resp.ok) {
        throw new Error(`Server returned status ${resp.status}`);
      }
      const contentType = resp.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Server did not return JSON data');
      }

      const json = await resp.json();
      const elements: any[] = json.elements || [];

      // All highway ways for the area
      const allRoads = elements
        .filter(el => el.type === 'way' && el.tags?.highway && el.geometry?.length >= 2)
        .map(el => ({
          coords: el.geometry.map((n: any) => ({ lat: n.lat, lng: n.lon })),
          highway: el.tags.highway,
          name: el.tags.name,
        }));
      // deduplicate
      const seen = new Set<number>();
      const roads = allRoads.filter(rd => {
        const key = rd.coords[0]?.lat;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const detectedData = processOverpassData(elements, boundary, 1);

      if (!cancelled) {
        setOsmRoads(roads);
        setOsmLandmarks(detectedData.landmarks);
        setOsmWater(detectedData.waterBodies || []);
        setOsmForests(detectedData.forests || []);
        setOsmFarmland(detectedData.farmlands || []);
        setOsmBuildings(detectedData.symbols.filter(s => s.symbol_type === 'pucca_house' || s.symbol_type === 'kutcha_house' || s.symbol_type === 'apartment' || s.symbol_type === 'non_residential'));
        // Feed OSM roads to engine for auto-snap and cache
        if (engineRef.current) {
          engineRef.current.setOsmRoads(roads);
          cacheFootprints(engineRef.current.sessionId, roads, detectedData);
        }
      }
    } catch (err) {
      console.warn('Background OSM fetch failed, continuing without overlay:', err);
    } finally {
      if (!cancelled) setBgFetching(false);
    }
    return () => { cancelled = true; };
  }, []);

  // ── Confirm boundary draw ────────────────────────────────────
  const confirmBoundary = () => {
    if (setupPins.length < 3) return;
    const coords = [...setupPins.map(p => [p.lng, p.lat] as [number, number]), [setupPins[0].lng, setupPins[0].lat] as [number, number]];
    const poly = turf.polygon([coords], { hlb_number: locationName || 'LIVE-SURVEY' });

    if (currentLoc) {
      const center = turf.centerOfMass(poly);
      const distKm = turf.distance(turf.point([currentLoc.lng, currentLoc.lat]), center);
      if (distKm > 0.2) { setDistanceToSite(distKm); return; }
    }

    setActivePolygon(poly);

    // If online, skip the blocking download screen — go straight to READY
    // and fetch OSM data silently in the background
    if (navigator.onLine) {
      setPhase('READY');
      fetchOsmData(poly);
    } else {
      // Offline: show the download screen so user knows they have cached data
      setPhase('DOWNLOADING');
    }
  };

  // ── Offline-only download phase ──────────────────────────────
  useEffect(() => {
    if (phase !== 'DOWNLOADING' || !activePolygon) return;
    let cancelled = false;

    const fetchData = async () => {
      setDlProgress({ tiles: 10, roads: 0, features: 0, gps: 0 });
      navigator.geolocation.getCurrentPosition(
        () => { if (!cancelled) setDlProgress(p => ({ ...p, gps: 100 })); },
        () => { if (!cancelled) setDlProgress(p => ({ ...p, gps: 70 })); },
        { enableHighAccuracy: true, timeout: 5000 }
      );
      const tileTimer = setInterval(() => {
        if (cancelled) { clearInterval(tileTimer); return; }
        setDlProgress(p => p.tiles < 100 ? { ...p, tiles: Math.min(100, p.tiles + 20) } : p);
      }, 300);

      try {
        const boundary: Coordinate[] = activePolygon.geometry.coordinates[0].map((c: number[]) => ({ lat: c[1], lng: c[0] }));
        const bbox = getBbox(boundary);
        // Fetch only within the exact boundary drawn (reduces load)
        const query = buildComprehensiveQuery(bbox, 0);
        setDlProgress(p => ({ ...p, roads: 20 }));
        const resp = await fetch('https://overpass-api.de/api/interpreter', {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(20000),
        });
        if (cancelled) return;

        if (!resp.ok) {
          throw new Error(`Server returned status ${resp.status}`);
        }
        const contentType = resp.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Server did not return JSON data');
        }

        if (!cancelled) setDlProgress(p => ({ ...p, roads: 80, features: 50 }));
        const json = await resp.json();
        const elements: any[] = json.elements || [];
        const seen = new Set<number>();
        const roads = elements
          .filter(el => el.type === 'way' && el.tags?.highway && el.geometry?.length >= 2)
          .map(el => ({ coords: el.geometry.map((n: any) => ({ lat: n.lat, lng: n.lon })), highway: el.tags.highway, name: el.tags.name }))
          .filter(rd => { const k = rd.coords[0]?.lat; if (seen.has(k)) return false; seen.add(k); return true; });
        const detectedData = processOverpassData(elements, boundary, 1);
        if (!cancelled) {
          setOsmRoads(roads);
          setOsmLandmarks(detectedData.landmarks);
          setOsmWater(detectedData.waterBodies || []);
          setOsmForests(detectedData.forests || []);
          setOsmFarmland(detectedData.farmlands || []);
          setOsmBuildings(detectedData.symbols.filter(s => s.symbol_type === 'pucca_house' || s.symbol_type === 'kutcha_house' || s.symbol_type === 'apartment' || s.symbol_type === 'non_residential'));
          // Feed OSM roads to engine for auto-snap and cache
          if (engineRef.current) {
            engineRef.current.setOsmRoads(roads);
            cacheFootprints(engineRef.current.sessionId, roads, detectedData);
          }
          clearInterval(tileTimer);
          setDlProgress({ tiles: 100, roads: 100, features: 100, gps: 100 });
          setTimeout(() => { if (!cancelled) setPhase('READY'); }, 500);
        }
      } catch (err) {
        console.warn('OSM fetch failed:', err);
        if (!cancelled) {
          clearInterval(tileTimer);
          setDlProgress({ tiles: 100, roads: 100, features: 100, gps: 100 });
          setTimeout(() => { if (!cancelled) setPhase('READY'); }, 500);
        }
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [phase, activePolygon]);

  // ── Locate Me ────────────────────────────────────────────────
  const handleLocateMe = () => {
    if (mapRef.current && lastGpsPos.current) {
      mapRef.current.setView([lastGpsPos.current.lat, lastGpsPos.current.lng], 19);
    } else {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          lastGpsPos.current = loc;
          if (mapRef.current) {
            mapRef.current.setView([loc.lat, loc.lng], 19);
          }
          setLocating(false);
        },
        () => {
          setLocating(false);
        },
        { enableHighAccuracy: true }
      );
    }
  };

  // ── Toggle satellite basemap vs pure drawing canvas ───────────
  useEffect(() => {
    if (!mapInstance || !satTileLayerRef.current) return;
    if (pureCanvasMode) {
      satTileLayerRef.current.remove();
    } else {
      satTileLayerRef.current.addTo(mapInstance);
    }
  }, [pureCanvasMode, mapInstance]);

  // ── Survey controls ──────────────────────────────────────────
  const handleStart = async () => {
    if (!engineRef.current) return;
    await engineRef.current.startSurvey();
    setPhase('RECORDING');
  };

  const handlePause = () => {
    engineRef.current?.pauseSurvey();
    setPhase('PAUSED');
  };

  const handleResume = () => {
    setVehicleWarning(false);
    engineRef.current?.resumeSurvey();
    setPhase('RECORDING');
  };

  const handleSaveAsDraft = async () => {
    if (!engineRef.current) return;
    const eng = engineRef.current;
    const sessionId = eng.sessionId;
    setAutoSaveLabel('saving');
    await idbStore.addSymbols(eng.symbols as any);
    await idbStore.addPoints(eng.smoothedPath);
    const hCount = eng.symbols.filter(s => ['pucca_house', 'kutcha_house'].includes(s.symbol_type as string)).length;
    await idbStore.updateSessionState(sessionId, 'paused', {
      houses_count: hCount,
      distance_m: Math.round(eng.calculateTotalDistance()),
      polygon_geojson: activePolygon ? JSON.stringify(activePolygon) : undefined,
      location_name: locationName,
    });
    setAutoSaveLabel('saved');
    if (onSaveAsDraft) onSaveAsDraft(sessionId);
    else onExit();
  };

  const finishSurvey = async () => {
    setShowEndConfirm(false);
    if (engineRef.current) {
      await engineRef.current.endSurvey();
      drawSymbols(engineRef.current.symbols as any);
      // Mark session as completed
      await idbStore.updateSessionState(engineRef.current.sessionId, 'completed', {
        houses_count: engineRef.current.symbols.filter(s => ['pucca_house', 'kutcha_house'].includes(s.symbol_type as string)).length,
        distance_m: Math.round(engineRef.current.calculateTotalDistance()),
      });
      setPhase('REVIEWING');
    }
  };

  const handlePlace = (dir: 'left' | 'center' | 'right' | 'compass') => {
    let fallback = lastGpsPos.current;
    if (!fallback && mapRef.current) {
      const center = mapRef.current.getCenter();
      fallback = { lat: center.lat, lng: center.lng };
    }
    
    engineRef.current?.placeSymbol(symType, dir, fallback || undefined, undefined, compassHeading !== null ? compassHeading : undefined);
  };
  const handleUndo = () => engineRef.current?.undoLastSymbol();
  const handleRoadTypeChange = (rt: string) => {
    setRoadType(rt);
    engineRef.current?.switchRoadType(rt);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const CompassWidget = () => (
    <div className="absolute top-[60px] right-3 z-[2000] w-10 h-10 flex items-center justify-center">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="19" fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
        <g transform={`rotate(${-gpsBearing}, 20, 20)`}>
          <polygon points="20,5 23,20 20,17 17,20" fill="#ef4444"/>
          <polygon points="20,35 23,20 20,23 17,20" fill="white"/>
        </g>
        {compassHeading !== null && (
          <g transform={`rotate(${compassHeading - gpsBearing}, 20, 20)`}>
            <polygon points="20,2 24,10 16,10" fill="#3b82f6"/>
          </g>
        )}
        <circle cx="20" cy="20" r="3" fill="white"/>
        <text x="20" y="3" textAnchor="middle" fill="white" fontSize="5" fontWeight="bold">N</text>
      </svg>
    </div>
  );

  const gpsColor = gpsAccuracy < 5 ? '#22c55e' : gpsAccuracy < 15 ? '#f59e0b' : '#ef4444';

  // ════════════════════════════════════════════════════════════
  // RENDER: LOCATION ENTRY
  // ════════════════════════════════════════════════════════════
  if (phase === 'LOCATION_ENTRY') {
    const parsed = smsText ? parseCoords(smsText) : null;
    return (
      <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] bg-[var(--color-warm-paper)] flex flex-col overflow-auto font-noto-sans">
        <div className="bg-[var(--color-saffron)] text-white px-4 pt-4 pb-3 shadow-md flex-shrink-0">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={onExit} className="text-white/80 hover:text-white min-w-[44px] min-h-[44px] flex items-center">← Back</button>
            <div>
              <h2 className="text-lg font-bold font-public-sans">चलते-चलते नक्शा</h2>
              <p className="text-xs opacity-80">Live Survey Mode — Step 1/3</p>
            </div>
          </div>
        </div>

        <div className="flex-1 px-4 py-4 space-y-4">
          {!manualMode ? (
            <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)]">
              <h3 className="font-bold text-[var(--color-warm-ink)] mb-2 text-sm">📱 Paste Location Message</h3>
              <p className="text-xs text-[var(--color-secondary-text)] mb-3">Paste the SMS or Google Maps link you received for your HLB area</p>
              <textarea
                className="w-full border border-gray-200 rounded-xl p-3 text-sm font-noto-sans focus:outline-none focus:ring-2 focus:ring-[var(--color-saffron)] min-h-[100px] resize-none"
                placeholder="Paste SMS text or Maps link here..."
                value={smsText}
                onChange={e => setSmsText(e.target.value)}
              />
              {parsed && (
                <div className="mt-2 bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <span className="text-green-600 font-bold">✓</span>
                  <div>
                    <p className="text-xs font-bold text-green-700">Coordinates detected!</p>
                    <p className="text-xs text-green-600">{parsed.lat.toFixed(5)}, {parsed.lng.toFixed(5)}</p>
                  </div>
                </div>
              )}
              {smsText && !parsed && (
                <p className="text-xs text-amber-600 mt-2">No coordinates found. Try manual entry below.</p>
              )}
              <button
                onClick={() => parsed && handleLocationConfirm(parsed.lat, parsed.lng, 'HLB Area')}
                disabled={!parsed}
                className={`mt-3 w-full py-3 rounded-xl font-bold text-white ${parsed ? 'bg-[var(--color-saffron)] active:scale-95 shadow' : 'bg-gray-200 text-gray-400'}`}
              >
                Continue with this location
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)]">
              <h3 className="font-bold text-[var(--color-warm-ink)] mb-3 text-sm">📍 Enter Coordinates Manually</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-500 mb-1 block">Area Name (optional)</label>
                  <input className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-saffron)]" placeholder="e.g. Ward 4, Kanpur" value={locationName} onChange={e => setLocationName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Latitude</label>
                    <input className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-saffron)]" placeholder="26.4499" type="number" step="any" value={manualLat} onChange={e => setManualLat(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 mb-1 block">Longitude</label>
                    <input className="w-full border border-gray-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-saffron)]" placeholder="80.3319" type="number" step="any" value={manualLng} onChange={e => setManualLng(e.target.value)} />
                  </div>
                </div>
                <button
                  onClick={() => { const la = parseFloat(manualLat); const lo = parseFloat(manualLng); if (!isNaN(la) && !isNaN(lo)) handleLocationConfirm(la, lo, locationName || 'Survey Area'); }}
                  disabled={!manualLat || !manualLng || isNaN(parseFloat(manualLat)) || isNaN(parseFloat(manualLng))}
                  className={`w-full py-3 rounded-xl font-bold text-white ${manualLat && manualLng ? 'bg-[var(--color-india-green)] active:scale-95 shadow' : 'bg-gray-200 text-gray-400'}`}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          <button onClick={() => setManualMode(!manualMode)} className="w-full py-3 text-[var(--color-saffron)] font-bold text-sm border border-[var(--color-saffron)] rounded-xl active:bg-orange-50">
            {manualMode ? '📱 Use SMS / Maps link instead' : '⌨️ Enter coordinates manually'}
          </button>

          {/* Use my current location */}
          <button
            onClick={() => {
              navigator.geolocation.getCurrentPosition(pos => {
                handleLocationConfirm(pos.coords.latitude, pos.coords.longitude, 'Current Location');
              }, undefined, { enableHighAccuracy: true });
            }}
            className="w-full py-3 bg-[var(--color-warm-ink)] text-white font-bold rounded-xl active:scale-95 shadow"
          >
            📍 Use My Current Location
          </button>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: BOUNDARY DRAW
  // ════════════════════════════════════════════════════════════
  if (phase === 'BOUNDARY_DRAW') {
    return (
      <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] flex flex-col bg-black">
        {/* Top instruction bar */}
        <div className="absolute top-0 left-0 right-0 z-[2000] bg-white shadow-lg px-4 py-3 rounded-b-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-baloo text-base font-bold text-[var(--color-charcoal)]">Draw Survey Boundary</h2>
              <p className="text-xs text-[var(--color-secondary-text)] font-noto-sans">Tap on the map to add boundary points ({setupPins.length} added, min 3)</p>
            </div>
            <button onClick={() => setPhase('LOCATION_ENTRY')} className="text-xs text-gray-400 font-semibold min-w-[44px] min-h-[44px] flex items-center justify-end">← Back</button>
          </div>
        </div>

        {/* Map */}
        <div ref={setupContainerRef} className="flex-1 w-full" style={{ paddingTop: '70px', paddingBottom: '130px' }} />

        {/* Bottom controls */}
        <div className="absolute bottom-0 left-0 right-0 z-[2000] bg-white rounded-t-2xl shadow-[0_-4px_20px_rgba(0,0,0,0.15)] px-4 pt-4" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          {distanceToSite !== null && distanceToSite > 0.2 && (
            <div className="bg-red-50 text-red-700 px-3 py-2 rounded-xl mb-3 border border-red-200 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              <div>
                <p className="font-bold text-xs">Too far from this location</p>
                <p className="text-xs">{(distanceToSite).toFixed(2)} km away — go to the field first</p>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => { setSetupPins(prev => prev.slice(0, -1)); setDistanceToSite(null); }}
              disabled={setupPins.length === 0}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl active:bg-gray-200 text-sm disabled:opacity-40"
            >
              ↩ Undo
            </button>
            <button
              onClick={() => { setSetupPins([]); setDistanceToSite(null); }}
              disabled={setupPins.length === 0}
              className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl active:bg-gray-200 text-sm disabled:opacity-40"
            >
              Clear All
            </button>
            <button
              onClick={confirmBoundary}
              disabled={setupPins.length < 3 || (distanceToSite !== null && distanceToSite > 0.2)}
              className={`flex-[2] py-3 text-white font-bold rounded-xl text-sm transition-all ${setupPins.length >= 3 && (distanceToSite === null || distanceToSite <= 0.2) ? 'bg-[var(--color-india-green)] active:scale-95 shadow-md' : 'bg-gray-300 text-gray-400'}`}
            >
              {distanceToSite !== null && distanceToSite > 0.2 ? '🚫 Cannot Start' : '✓ Confirm Boundary'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: DOWNLOADING
  // ════════════════════════════════════════════════════════════
  if (phase === 'DOWNLOADING') {
    const items = [
      { label: 'Satellite Tiles', icon: '🛰️', value: dlProgress.tiles },
      { label: 'Roads & Paths', icon: '🛣️', value: dlProgress.roads },
      { label: 'Buildings & Features', icon: '🏘️', value: dlProgress.features },
      { label: 'GPS Signal', icon: '📡', value: dlProgress.gps },
    ];
    const allDone = Object.values(dlProgress).every(v => v >= 100);
    return (
      <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] bg-[var(--color-warm-paper)] flex flex-col px-4 pt-10 overflow-hidden font-noto-sans">
        <div className="mb-6 text-center">
          <div className="text-5xl mb-3 animate-pulse">🗺️</div>
          <h1 className="font-baloo text-2xl font-bold text-[var(--color-charcoal)]">चलते-चलते नक्शा</h1>
          <p className="text-sm text-[var(--color-secondary-text)] mt-1">Preparing your offline map package</p>
          {locationName && <p className="text-xs font-bold text-[var(--color-saffron)] mt-1">{locationName}</p>}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] mb-6">
          <h2 className="font-bold text-[var(--color-warm-ink)] mb-4 text-sm">Downloading Area Data</h2>
          <div className="space-y-4">
            {items.map((itm, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-base ${itm.value >= 100 ? 'bg-green-100' : 'bg-gray-100'}`}>
                  {itm.value >= 100 ? '✓' : itm.icon}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <p className="text-sm font-semibold text-[var(--color-warm-ink)]">{itm.label}</p>
                    <p className="text-xs text-gray-400 font-jetbrains">{itm.value}%</p>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${itm.value >= 100 ? 'bg-[var(--color-india-green)]' : 'bg-[var(--color-saffron)]'}`} style={{ width: `${itm.value}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {allDone && (
          <div className="bg-green-50 rounded-2xl p-4 border border-green-200 text-center animate-fade-in">
            <p className="font-bold text-green-700">✓ All data downloaded!</p>
            <p className="text-xs text-green-600 mt-1">Launching survey screen...</p>
          </div>
        )}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: READY
  // ════════════════════════════════════════════════════════════
  if (phase === 'READY') {
    return (
      <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] bg-[var(--color-warm-paper)] flex flex-col px-4 pt-10 overflow-auto font-noto-sans">
        <div className="flex justify-between items-center mb-4 w-full">
          <button onClick={onExit} className="text-[var(--color-secondary-text)] text-sm min-h-[44px]">← Dashboard</button>
          <button onClick={handleSaveAsDraft} className="text-[var(--color-india-green)] font-bold text-sm min-h-[44px] bg-green-50 px-3 py-1 rounded-xl border border-green-200 shadow-sm active:scale-95">💾 Save & Exit</button>
        </div>
        <h1 className="font-baloo text-2xl font-bold text-[var(--color-charcoal)] mb-1">Ready to Survey</h1>
        <p className="text-sm text-[var(--color-secondary-text)] mb-6">
          {locationName || 'Survey Area'} — {osmRoads.length} roads loaded
        </p>

        {/* Background fetch indicator */}
        {bgFetching && (
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-4">
            <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <p className="text-xs text-blue-600 font-semibold">Fetching road & map data in background...</p>
          </div>
        )}
        {!bgFetching && osmRoads.length > 0 && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4">
            <span className="text-green-600 text-sm">✓</span>
            <p className="text-xs text-green-600 font-semibold">{osmRoads.length} roads + {osmLandmarks.length} landmarks loaded</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl p-3 text-center shadow-[var(--shadow-warm-1)]">
            <p className="text-2xl font-bold text-[var(--color-saffron)] font-jetbrains">{osmRoads.length}</p>
            <p className="text-xs text-gray-500">Roads mapped</p>
          </div>
          <div className="bg-white rounded-xl p-3 text-center shadow-[var(--shadow-warm-1)]">
            <p className="text-2xl font-bold text-[var(--color-saffron)] font-jetbrains">{osmLandmarks.length}</p>
            <p className="text-xs text-gray-500">Landmarks loaded</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] mb-6">
          <h3 className="font-bold text-sm text-[var(--color-warm-ink)] mb-3">Instructions</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <p>🗺️ A satellite map with pre-loaded roads will open</p>
            <p>🏠 Tap Left / Here / Right to place houses as you walk</p>
            <p>🛣️ Select road type from the top bar as you move</p>
            <p>💾 Survey auto-saves every 30 seconds</p>
            <p>⏸ Pause anytime to save and exit as a draft</p>
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full min-h-[56px] rounded-full font-bold text-white text-lg font-baloo bg-[var(--color-saffron)] shadow-[var(--shadow-warm-2)] active:scale-95 transition-all mb-4"
        >
          🚶‍♂️ Survey शुरू करें
        </button>
        <p className="text-center text-xs text-[var(--color-secondary-text)] mb-6">Map is cached offline for this area</p>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════
  // RENDER: RECORDING / PAUSED / REVIEWING
  // ════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 z-[9999] h-[100dvh] w-[100dvw] bg-black flex flex-col font-noto-sans">

      {/* STATUS BAR */}
      <div className="h-[48px] w-full bg-[var(--color-warm-ink)] text-white flex items-center justify-between px-3 z-[1001] shadow-md flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: gpsColor }} />
          <span className="text-xs font-jetbrains">±{Math.round(gpsAccuracy)}m</span>
          <span className="text-xs text-white/50 font-jetbrains">{Math.round(gpsBearing)}°</span>
          {!navigator.onLine && <span className="text-xs text-red-400 font-bold">📵 Offline</span>}
          {bgFetching && <div className="w-2.5 h-2.5 border border-blue-300 border-t-transparent rounded-full animate-spin" title="Fetching map data" />}
        </div>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span>{stats.houses} 🏠</span>
          <span>{(stats.distance / 1000).toFixed(2)}km</span>
          <span className="text-xs text-green-400">{autoSaveLabel === 'saving' ? '⟳' : '✓'}</span>
        </div>
        {phase === 'RECORDING' && (
          <button onClick={handlePause} className="w-9 h-9 bg-white/10 rounded-full flex items-center justify-center min-w-[44px] min-h-[44px] text-lg">⏸</button>
        )}
      </div>

      {/* ROAD TYPE BAR */}
      {phase === 'RECORDING' && (
        <div className="h-[48px] w-full bg-[rgba(26,18,8,0.9)] flex items-center px-2 gap-1 overflow-x-auto hide-scrollbar z-[1001] flex-shrink-0">
          {[{ id: 'residential', l: 'मुख्य सड़क' }, { id: 'tertiary', l: 'गली' }, { id: 'track', l: 'कच्चा रास्ता' }, { id: 'footway', l: 'पगडंडी' }].map(rt => (
            <button key={rt.id} onClick={() => handleRoadTypeChange(rt.id)}
              className={`h-[34px] min-w-[44px] px-3 rounded-full text-xs transition-all border whitespace-nowrap ${roadType === rt.id ? 'bg-[var(--color-saffron)] text-white border-[var(--color-saffron)] font-bold' : 'bg-transparent text-[#A89880] border-transparent'}`}>
              {rt.l}
            </button>
          ))}
        </div>
      )}

      {/* DISTANCE TO SITE WARNING BANNER */}
      {distanceToSite !== null && distanceToSite > 0.2 && (
        <div className="bg-amber-500/90 text-white text-xs font-bold py-2.5 px-3 z-[1001] shadow-md flex items-center justify-between gap-2 animate-fade-in flex-shrink-0">
          <div className="flex items-center gap-2">
            <span>📡</span>
            <span>You are {(distanceToSite).toFixed(2)} km away from the survey area</span>
          </div>
          <button 
            onClick={() => {
              if (mapRef.current && activePolygon) {
                const blayer = L.geoJSON(activePolygon);
                mapRef.current.fitBounds(blayer.getBounds());
              }
            }}
            className="bg-white text-amber-700 hover:bg-white/90 active:scale-95 px-3 py-1 rounded-lg text-[10px] font-extrabold uppercase transition-all shadow"
          >
            Show Area
          </button>
        </div>
      )}

      {/* NOTIFICATION RAIL — stacks banners vertically so they never overlap */}
      <div className="absolute top-[60px] left-4 right-4 z-[2100] flex flex-col gap-2 pointer-events-none">
        {gpsError && (
          <div className="pointer-events-auto bg-white rounded-xl border-l-4 border-red-500 p-3 shadow-xl flex items-start gap-3">
            <span className="text-xl">📡</span>
            <p className="flex-1 text-sm font-bold text-gray-800">{gpsError}</p>
            <button onClick={() => setGpsError(null)} className="text-gray-400 font-black text-lg leading-none px-1" aria-label="Dismiss">×</button>
          </div>
        )}
        {gpsWarning && !gpsError && (
          <div className="pointer-events-auto bg-white rounded-xl border-l-4 border-amber-500 p-3 shadow-xl flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <p className="flex-1 text-sm font-bold text-gray-800">{gpsWarning}</p>
            <button onClick={() => setGpsWarning(null)} className="text-gray-400 font-black text-lg leading-none px-1" aria-label="Dismiss">×</button>
          </div>
        )}
        {speedWarning && !gpsError && !gpsWarning && (
          <div className="pointer-events-auto bg-white rounded-xl border-l-4 border-blue-500 p-3 shadow-xl flex items-start gap-3">
            <span className="text-xl">🚗</span>
            <p className="flex-1 text-sm font-bold text-gray-800">{speedWarning}</p>
            <button onClick={() => setSpeedWarning(null)} className="text-gray-400 font-black text-lg leading-none px-1" aria-label="Dismiss">×</button>
          </div>
        )}
        {duplicateWarning && (
          <div className="pointer-events-auto bg-white rounded-xl border-l-4 border-red-500 p-3 shadow-xl flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <p className="flex-1 text-sm font-bold text-gray-800">{duplicateWarning}</p>
            <button onClick={() => setDuplicateWarning(null)} className="text-gray-400 font-black text-lg leading-none px-1" aria-label="Dismiss">×</button>
          </div>
        )}
        {outOfBounds && phase === 'RECORDING' && (
          <div className="pointer-events-auto bg-white rounded-xl border-l-4 border-red-500 p-3 shadow-xl flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <p className="text-sm font-bold text-gray-800">आप boundary के बाहर हैं<br /><span className="text-xs font-normal text-gray-500">You are outside your survey block</span></p>
          </div>
        )}
        {vehicleWarning && (
          <div className="pointer-events-auto bg-amber-400 text-amber-900 rounded-xl p-3 shadow-xl flex items-center justify-center gap-2 font-bold text-sm">
            🚗 Vehicle detected — survey paused
          </div>
        )}
        {osmToast && (
          <div className="pointer-events-auto self-center bg-[rgba(0,0,0,0.8)] text-white text-xs font-bold py-2 px-4 rounded-full shadow-lg whitespace-nowrap" style={{ animation: 'fadeIn 0.3s ease' }}>
            {osmToast}
          </div>
        )}
      </div>

      {/* MAP */}
      <div className="flex-1 relative">
        <div ref={containerRef} className="absolute inset-0" style={{ background: '#FAF6F0' }} />
        
        {drawMode !== 'none' && drawMode !== 'landmark' && (
          <div className="absolute top-[20px] left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-full shadow-lg border border-gray-200 py-1.5 px-3 z-[2000] flex items-center gap-4 w-max min-w-[200px]">
             <span className="font-bold text-xs text-[var(--color-saffron)] animate-pulse pl-1 flex-1 text-center">Drawing {drawMode}...</span>
             <div className="flex items-center gap-2">
               <button onClick={finishDrawing} className="w-8 h-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center shadow-sm text-lg font-bold border border-green-200">✓</button>
               <button onClick={() => { setDrawMode('none'); setDrawingPoints([]); }} className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-lg font-bold border border-red-100">✕</button>
             </div>
          </div>
        )}
        
        {drawMode === 'landmark' && (
          <div className="absolute top-[20px] left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur rounded-full shadow-lg border border-gray-200 py-1.5 px-4 z-[2000] flex items-center gap-4 w-max">
             <span className="font-bold text-xs text-[var(--color-saffron)] animate-pulse">Tap map to place landmark 📌</span>
             <button onClick={() => setDrawMode('none')} className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center text-lg font-bold border border-red-100">✕</button>
          </div>
        )}
        
        {phase === 'RECORDING' && (
          <div className="absolute left-4 z-[2000] flex flex-col gap-3" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
            <button
              onClick={() => engineRef.current?.undoLastSymbol()}
              className="w-11 h-11 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center active:scale-95"
              title="Undo Last Symbol"
            >
              <div className="relative flex items-center justify-center w-full h-full">
                <span className="text-lg">↩️</span>
                <span className="absolute -top-1 -right-2 bg-red-100 text-[8px] px-1 rounded border border-red-200 text-red-700 font-black">SYM</span>
              </div>
            </button>
            <button
              onClick={() => engineRef.current?.undoLastRoadSegment()}
              className="w-11 h-11 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center active:scale-95"
              title="Undo Last Track Segment"
            >
              <div className="relative flex items-center justify-center w-full h-full">
                <span className="text-lg">↩️</span>
                <span className="absolute -top-1 -right-2 bg-amber-100 text-[8px] px-1 rounded border border-amber-200 text-amber-700 font-black">TRK</span>
              </div>
            </button>
          </div>
        )}

        <CompassWidget />
        <button
          onClick={() => {
            const next = !snapToRoads;
            setSnapToRoads(next);
            engineRef.current?.setSnapToRoadsEnabled(next);
          }}
          className={`absolute right-4 z-[2000] w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 border border-gray-100 ${snapToRoads ? 'bg-green-600 text-white' : 'bg-white text-gray-400'}`}
          style={{ bottom: 'calc(144px + env(safe-area-inset-bottom))' }}
          title={snapToRoads ? "Road Snapping: ON" : "Road Snapping: OFF"}
        >
          <span className="text-xl">🧲</span>
        </button>
        <button
          onClick={() => setPureCanvasMode(!pureCanvasMode)}
          className={`absolute right-4 z-[2000] w-12 h-12 rounded-full flex items-center justify-center shadow-lg active:scale-95 border border-gray-100 ${pureCanvasMode ? 'bg-[var(--color-saffron)] text-white' : 'bg-white text-gray-700'}`}
          style={{ bottom: 'calc(80px + env(safe-area-inset-bottom))' }}
          title="Toggle Map Background"
        >
          <span className="text-xl">{pureCanvasMode ? '🛰️' : '🎨'}</span>
        </button>
        <button
          onClick={handleLocateMe}
          className="absolute right-4 z-[2000] w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-95 border border-gray-100"
          style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
          title="Locate Me"
        >
          <span className="text-xl">{locating ? '🌀' : '🎯'}</span>
        </button>
        {phase === 'PAUSED' && <div className="absolute inset-0 bg-[rgba(26,18,8,0.5)] z-[900] pointer-events-none" />}
      </div>

      {/* PLACEMENT BAR (recording only) */}
      {phase === 'RECORDING' && (
        <div className="bg-white flex flex-col shadow-[var(--shadow-warm-2)] z-[1001] flex-shrink-0">
          <div className="h-[76px] w-full flex items-stretch divide-x divide-gray-100">
            <button onClick={() => handlePlace('left')} className="flex-1 flex flex-col items-center justify-center bg-orange-50/50 active:bg-orange-100 transition-colors min-w-[44px]">
              <span className="text-[var(--color-saffron)] text-2xl font-bold mb-0.5">↰</span>
              <span className="text-[10px] font-bold text-[var(--color-saffron)]">बाईं ओर</span>
            </button>
            <button onClick={() => handlePlace('center')} className="w-[20%] flex flex-col items-center justify-center active:bg-gray-50 min-w-[44px]">
              <div className="w-7 h-7 mb-0.5" dangerouslySetInnerHTML={{ __html: getSmallSymbolSVG(symType as SymbolType) }} />
              <span className="text-[10px] font-bold text-gray-700">यहाँ</span>
            </button>
            <button onClick={() => handlePlace('right')} className="flex-1 flex flex-col items-center justify-center bg-orange-50/50 active:bg-orange-100 transition-colors min-w-[44px]">
              <span className="text-[var(--color-saffron)] text-2xl font-bold mb-0.5">↱</span>
              <span className="text-[10px] font-bold text-[var(--color-saffron)]">दाईं ओर</span>
            </button>
            {!hasCompassPermission ? (
              <button onClick={requestCompassPermission} className="flex-1 flex flex-col items-center justify-center bg-blue-50/50 active:bg-blue-100 transition-colors min-w-[44px]">
                <span className="text-blue-500 text-xl font-bold mb-0.5">🧭</span>
                <span className="text-[10px] font-bold text-blue-600">Enable Point</span>
              </button>
            ) : (
              <button onClick={() => handlePlace('compass')} className="flex-1 flex flex-col items-center justify-center bg-blue-50/80 active:bg-blue-200 transition-colors min-w-[44px]">
                <span className="text-blue-600 text-2xl font-bold mb-0.5 transform" style={compassHeading !== null ? { transform: `rotate(${compassHeading - gpsBearing}deg)` } : {}}>⬆️</span>
                <span className="text-[10px] font-bold text-blue-700 leading-tight text-center">Point & Map</span>
              </button>
            )}
          </div>
          <div className="h-[40px] border-t border-gray-100 flex items-center px-1 overflow-x-auto hide-scrollbar gap-1">
            {[{ id: 'pucca_house' }, { id: 'kutcha_house' }, { id: 'non_residential' }, { id: 'shop' }, { id: 'temple' }, { id: 'school' }].map(s => (
              <button key={s.id} onClick={() => setSymType(s.id)}
                className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 ${symType === s.id ? 'border-b-2 border-[var(--color-saffron)] bg-orange-50' : ''}`}>
                <div className="w-5 h-5" dangerouslySetInnerHTML={{ __html: getSmallSymbolSVG(s.id as SymbolType) }} />
              </button>
            ))}
            
            {/* Draw Tools */}
            <div className="w-px h-6 bg-gray-200 mx-1 flex-shrink-0" />
            <button onClick={() => setDrawMode(drawMode === 'block' ? 'none' : 'block')} className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg ${drawMode === 'block' ? 'border-b-2 border-red-500 bg-red-50' : ''}`} title="Draw Block">🟥</button>
            <button onClick={() => setDrawMode(drawMode === 'landmark' ? 'none' : 'landmark')} className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg ${drawMode === 'landmark' ? 'border-b-2 border-gray-500 bg-gray-50' : ''}`} title="Drop Landmark">📌</button>
            
            {showExtraDrawTools ? (
              <>
                <button onClick={() => setDrawMode(drawMode === 'farmland' ? 'none' : 'farmland')} className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg ${drawMode === 'farmland' ? 'border-b-2 border-green-500 bg-green-50' : ''}`} title="Draw Farmland">🌾</button>
                <button onClick={() => setDrawMode(drawMode === 'forest' ? 'none' : 'forest')} className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg ${drawMode === 'forest' ? 'border-b-2 border-green-500 bg-green-50' : ''}`} title="Draw Forest">🌳</button>
                <button onClick={() => setDrawMode(drawMode === 'waterBody' ? 'none' : 'waterBody')} className={`min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg ${drawMode === 'waterBody' ? 'border-b-2 border-blue-500 bg-blue-50' : ''}`} title="Draw Water">💧</button>
                <button onClick={() => setShowExtraDrawTools(false)} className="min-w-[34px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-xs text-gray-400 font-bold hover:bg-gray-100">«</button>
              </>
            ) : (
              <button onClick={() => setShowExtraDrawTools(true)} className="min-w-[44px] h-[34px] flex items-center justify-center rounded-lg flex-shrink-0 text-lg hover:bg-gray-100" title="More Tools">➕</button>
            )}
          </div>
        </div>
      )}

      {/* BOTTOM STRIP (recording) */}
      {phase === 'RECORDING' && (
        <div className="w-full bg-[var(--color-warm-ink)] z-[1001] flex-shrink-0" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="h-[52px] flex items-center justify-between px-3 w-full">
            <button onClick={handleUndo} className="text-gray-300 text-xs font-semibold min-w-[44px] min-h-[44px] flex items-center">↩ Undo</button>
            <button onClick={handleSaveAsDraft} className="text-green-400 text-xs font-bold min-w-[44px] min-h-[44px] flex items-center">💾 Save</button>
            <span className="text-[10px] font-jetbrains text-gray-500">ID: {engineRef.current?.sessionId?.substr(0, 8)}</span>
            <button onClick={() => setShowEndConfirm(true)} className="text-[var(--color-saffron)] text-xs font-bold min-w-[44px] min-h-[44px] flex items-center justify-end">End ↑</button>
          </div>
        </div>
      )}

      {/* PAUSED PANEL — fixed to viewport bottom for mobile visibility */}
      {phase === 'PAUSED' && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[2999]" onClick={handleResume} />
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-warm-paper)] p-5 rounded-t-[24px] flex flex-col gap-3 z-[3000] shadow-[0_-4px_20px_rgba(0,0,0,0.25)]" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div className="flex justify-center mb-1"><div className="w-12 h-1.5 bg-gray-300 rounded-full" /></div>
            <p className="text-center font-bold text-amber-600 text-sm">⏸ Survey रुकी हुई है</p>
            <button onClick={handleResume} className="w-full min-h-[52px] bg-[var(--color-saffron)] text-white rounded-full font-bold text-base font-baloo active:scale-95">▶ जारी रखें</button>
            <button onClick={handleSaveAsDraft} className="w-full min-h-[52px] bg-white text-[var(--color-india-green)] border border-[var(--color-india-green)] rounded-full font-bold text-sm active:bg-green-50">💾 Save as Draft & Exit</button>
            <button onClick={() => setShowEndConfirm(true)} className="w-full min-h-[44px] bg-white text-red-500 border border-red-200 rounded-full font-bold text-sm active:bg-red-50">End Survey</button>
          </div>
        </>
      )}

      {/* REVIEWING PANEL — fixed to viewport bottom for mobile visibility */}
      {phase === 'REVIEWING' && (
        <>
          <div className="fixed inset-0 bg-black/30 z-[2999]" />
          <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[24px] shadow-[0_-4px_20px_rgba(0,0,0,0.25)] p-5 flex flex-col gap-3 z-[3000] max-h-[55vh] overflow-y-auto" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div className="flex justify-center mb-1"><div className="w-12 h-1.5 bg-gray-200 rounded-full" /></div>
            <h2 className="font-baloo text-xl font-bold text-[var(--color-india-green)] text-center">✓ Survey Complete!</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-bold">{stats.houses}</p><p className="text-xs text-gray-500">Houses marked</p></div>
              <div className="bg-gray-50 rounded-xl p-3 text-center"><p className="text-xl font-bold">{(stats.distance / 1000).toFixed(2)}km</p><p className="text-xs text-gray-500">Distance walked</p></div>
            </div>
            <p className="text-xs text-gray-500 text-center">Tap any house on the map to edit its number</p>
            <button onClick={() => window.location.href = `/app?live_preview_id=${engineRef.current?.sessionId}`} className="w-full min-h-[52px] bg-[var(--color-india-green)] text-white rounded-full font-bold text-lg font-baloo active:scale-95">✓ Generate Map</button>
          </div>
        </>
      )}

      {/* END CONFIRM SHEET — fixed to viewport bottom */}
      {showEndConfirm && (
        <div className="fixed inset-0 bg-black/60 z-[4000] flex items-end">
          <div className="bg-white w-full rounded-t-[24px] p-5 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <h3 className="font-baloo text-xl font-bold text-[var(--color-charcoal)] mb-4">Survey समाप्त करें?</h3>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div className="bg-gray-50 p-2 rounded-lg text-center"><p className="font-bold text-lg">{stats.houses}</p><p className="text-xs text-gray-500">Houses</p></div>
              <div className="bg-gray-50 p-2 rounded-lg text-center"><p className="font-bold text-lg">{(stats.distance / 1000).toFixed(2)}km</p><p className="text-xs text-gray-500">Distance</p></div>
            </div>
            <div className="flex flex-col gap-3">
              <button onClick={finishSurvey} className="w-full min-h-[52px] bg-[var(--color-india-green)] text-white rounded-full font-bold">हाँ, Survey समाप्त करें</button>
              <button onClick={handleSaveAsDraft} className="w-full min-h-[44px] bg-white text-[var(--color-india-green)] border border-[var(--color-india-green)] rounded-full font-bold text-sm">💾 Save as Draft</button>
              <button onClick={() => setShowEndConfirm(false)} className="w-full min-h-[44px] bg-white border border-gray-200 rounded-full font-bold text-gray-600 text-sm">वापस जाएं</button>
            </div>
          </div>
        </div>
      )}

      {/* Selected House Details Sidebar */}
      {selectedPlacedSymbol && (
        <HouseDataSidebar
          house={selectedPlacedSymbol}
          onClose={() => setSelectedPlacedSymbol(null)}
          onSave={(details) => {
            if (engineRef.current) {
              engineRef.current.updateSymbolDetails(selectedPlacedSymbol.symbol_id, details);
            }
            setSelectedPlacedSymbol(null);
          }}
        />
      )}

      {/* RETURN PATH DETECTION DIALOG */}
      {returnDialog && (
        <div className="fixed inset-0 bg-black/60 z-[5000] flex items-end">
          <div className="bg-white w-full rounded-t-[24px] p-5 shadow-[0_-4px_20px_rgba(0,0,0,0.25)]" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <h3 className="font-baloo text-xl font-bold text-[var(--color-charcoal)] mb-2">↩ क्या आप वापस आ रहे हैं?</h3>
            <p className="text-sm text-gray-600 mb-4">It looks like you're walking back on a road you've already mapped</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setReturnDialog(false); setReturnModeState('two_lane'); engineRef.current?.setReturnMode('two_lane'); }}
                className="w-full min-h-[52px] bg-[var(--color-saffron)] text-white rounded-full font-bold active:scale-95"
              >
                🛣️ Two-Lane Road (mark other side)
              </button>
              <button
                onClick={() => { setReturnDialog(false); setReturnModeState('follow_back'); engineRef.current?.setReturnMode('follow_back'); }}
                className="w-full min-h-[52px] bg-white text-[var(--color-india-green)] border border-[var(--color-india-green)] rounded-full font-bold active:scale-95"
              >
                ↩ Same Road (only mark houses)
              </button>
              <button
                onClick={() => { setReturnDialog(false); if (engineRef.current) engineRef.current.returnDetectedFlag = false; }}
                className="w-full min-h-[44px] bg-white border border-gray-200 rounded-full font-bold text-gray-600 text-sm"
              >
                Continue mapping normally
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HOUSE EDIT SHEET */}
      {selectedReviewSym && (
        <div className="absolute inset-0 bg-black/60 z-[4000] flex items-end">
          <div className="bg-white w-full rounded-t-[24px] p-5 shadow-[var(--shadow-warm-2)]">
            <h3 className="font-baloo text-lg font-bold text-[var(--color-charcoal)] mb-2">House #{selectedReviewSym.number}</h3>
            <div className="flex justify-center mb-4">
              <span className="font-jetbrains text-5xl font-black text-[var(--color-saffron)]">{selectedReviewSym.number}</span>
            </div>
            <button onClick={() => setSelectedReviewSym(null)} className="w-full min-h-[52px] bg-[var(--color-warm-ink)] text-white rounded-full font-bold">OK</button>
          </div>
        </div>
      )}
    </div>
  );
}
