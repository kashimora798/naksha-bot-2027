import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { saveBoundaryToDb, fetchSavedBoundariesFromDb } from '../lib/survey-api';
import type { Coordinate } from '../types';
import { getBbox, getOSMName } from '../lib/geo';

interface Props {
  user: any;
  onBack: () => void;
}

// Calculate bearing between two points to align text labels
function calculateBearing(p1: Coordinate, p2: Coordinate): number {
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const lon1 = p1.lng * Math.PI / 180;
  const lon2 = p2.lng * Math.PI / 180;
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  // Normalize to 0-180 to avoid upside-down text
  if (brng < 0) brng += 360;
  if (brng > 90 && brng <= 270) {
    brng = (brng + 180) % 360;
  }
  return brng;
}

export default function SatExtractorWorkspace({ user, onBack }: Props) {
  const [hlbCode, setHlbCode] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Extraction states
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);
  
  // Boundary & geometry states
  const [boundaryPins, setBoundaryPins] = useState<Coordinate[]>([]);
  const [center, setCenter] = useState<Coordinate | null>(null);
  const [boundaryGeojson, setBoundaryGeojson] = useState<any>(null);
  
  // Feature states
  const [roads, setRoads] = useState<any[]>([]);
  const [waterBodies, setWaterBodies] = useState<any[]>([]);
  const [pois, setPois] = useState<any[]>([]);
  const [buildings, setBuildings] = useState<any[]>([]);
  
  // Settings & Toggles
  const [accuracy, setAccuracy] = useState(0.70);
  const [fetchingBuildings, setFetchingBuildings] = useState(false);
  const [savedBoundaries, setSavedBoundaries] = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  
  // Layer visibility toggles
  const [showSatellite, setShowSatellite] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoadNames, setShowRoadNames] = useState(true);

  // Print layout settings
  const [printTitle, setPrintTitle] = useState('');
  const [showPrintLegend, setShowPrintLegend] = useState(true);
  
  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<{
    satellite?: L.TileLayer;
    boundary?: L.Polygon;
    roadsGroup?: L.FeatureGroup;
    roadLabelsGroup?: L.FeatureGroup;
    waterGroup?: L.FeatureGroup;
    poiGroup?: L.FeatureGroup;
    buildingsGroup?: L.FeatureGroup;
  }>({});

  // 1. Fetch saved boundaries from Supabase
  const loadSavedBoundaries = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSaved(true);
    try {
      const list = await fetchSavedBoundariesFromDb(user.id);
      setSavedBoundaries(list);
    } catch (e) {
      console.warn("Failed to load saved boundaries:", e);
    } finally {
      setLoadingSaved(false);
    }
  }, [user?.id]);

  useEffect(() => {
    loadSavedBoundaries();
  }, [loadSavedBoundaries]);

  // 2. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Default center Kanpur
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([26.4499, 80.3319], 13);
    mapRef.current = map;

    // Custom attribution & controls
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Google Satellite Hybrid layer
    const sat = L.tileLayer('https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      attribution: 'Google Satellite'
    });
    
    if (showSatellite) {
      sat.addTo(map);
    }
    layersRef.current.satellite = sat;

    // Feature Groups
    layersRef.current.roadsGroup = L.featureGroup().addTo(map);
    layersRef.current.roadLabelsGroup = L.featureGroup().addTo(map);
    layersRef.current.waterGroup = L.featureGroup().addTo(map);
    layersRef.current.poiGroup = L.featureGroup().addTo(map);
    layersRef.current.buildingsGroup = L.featureGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update satellite layer visibility
  useEffect(() => {
    const map = mapRef.current;
    const sat = layersRef.current.satellite;
    if (!map || !sat) return;
    if (showSatellite) {
      sat.addTo(map);
    } else {
      sat.remove();
    }
  }, [showSatellite]);

  // 3. Clear Map layers
  const clearMap = () => {
    const lg = layersRef.current;
    if (lg.boundary) { lg.boundary.remove(); lg.boundary = undefined; }
    lg.roadsGroup?.clearLayers();
    lg.roadLabelsGroup?.clearLayers();
    lg.waterGroup?.clearLayers();
    lg.poiGroup?.clearLayers();
    lg.buildingsGroup?.clearLayers();
    setRoads([]);
    setWaterBodies([]);
    setPois([]);
    setBuildings([]);
  };

  // 4. Draw boundary on map
  const drawBoundary = (pins: Coordinate[], centerPt: Coordinate) => {
    const map = mapRef.current;
    if (!map) return;

    clearMap();
    setBoundaryPins(pins);
    setCenter(centerPt);

    const latLngs = pins.map(p => [p.lat, p.lng] as [number, number]);
    const poly = L.polygon(latLngs, {
      color: '#ef4444',
      fillColor: 'transparent',
      weight: 3,
      dashArray: '8, 5'
    });

    if (showBoundary) {
      poly.addTo(map);
    }
    layersRef.current.boundary = poly;

    map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  };

  // Toggle boundary layer
  useEffect(() => {
    const map = mapRef.current;
    const poly = layersRef.current.boundary;
    if (!map || !poly) return;
    if (showBoundary) {
      poly.addTo(map);
    } else {
      poly.remove();
    }
  }, [showBoundary]);

  // 5. Select a saved boundary
  const handleSelectSaved = (item: any) => {
    const geo = item.boundary_geojson;
    const coords = geo?.geometry?.coordinates?.[0] || geo?.coordinates?.[0];
    if (!coords || coords.length < 3) return;

    const pins = coords.map(([lng, lat]: any) => ({ lat, lng }));
    setPrintTitle(`Nazari Naksha - HLB ${item.hlb_number}`);
    setBoundaryGeojson(geo);
    drawBoundary(pins, item.center);
    
    // Auto trigger OSM fetch
    triggerOSMFetch(pins);
  };

  // 6. Handle GeoPDF Boundary Extraction
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hlbCode.trim()) { setExtractError('Please enter a 4-digit HLB code.'); return; }
    if (!pdfFile) { setExtractError('Please select a Census GeoPDF file.'); return; }

    setExtractStatus('Uploading GeoPDF layout map...');
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('hlb', hlbCode.trim());

      const url = import.meta.env.VITE_EXTRACTOR_API_URL || 'https://naksha-bot-backend.render.com/api/extract';
      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error ${res.status}`);
      }

      const geojson = await res.json();
      const coords = geojson.geometry?.coordinates?.[0];
      if (!coords || coords.length < 3) {
        throw new Error('Server returned an invalid boundary polygon structure.');
      }
      
      const pins = coords.map(([lng, lat]: any) => ({ lat, lng }));
      
      // Calculate centroid
      const sumLat = pins.reduce((acc: number, curr: any) => acc + curr.lat, 0);
      const sumLng = pins.reduce((acc: number, curr: any) => acc + curr.lng, 0);
      const centerPt = { lat: sumLat / pins.length, lng: sumLng / pins.length };

      setPrintTitle(`Nazari Naksha - HLB ${hlbCode.trim()}`);
      setBoundaryGeojson(geojson);
      drawBoundary(pins, centerPt);

      // Save boundary to Database
      if (user?.id) {
        setExtractStatus('Saving extracted boundary to Supabase database...');
        await saveBoundaryToDb(user.id, hlbCode.trim(), geojson, centerPt);
        loadSavedBoundaries();
      }

      setExtractStatus('');
      triggerOSMFetch(pins);

    } catch (err: any) {
      setExtractError(err.message || 'GeoPDF boundary extraction failed.');
      setExtractStatus('');
    }
  };

  // 7. Auto Fetch OSM roads, water, and POIs
  const triggerOSMFetch = async (pins: Coordinate[]) => {
    const map = mapRef.current;
    if (!map) return;

    setExtractStatus('Fetching roads, water bodies, and local POIs...');
    const bb = getBbox(pins);
    
    // Construct Overpass query
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["highway"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["natural"="water"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["landuse"="forest"](${bb.south},${bb.west},${bb.north},${bb.east});
        node["amenity"](${bb.south},${bb.west},${bb.north},${bb.east});
        node["shop"](${bb.south},${bb.west},${bb.north},${bb.east});
        node["tourism"](${bb.south},${bb.west},${bb.north},${bb.east});
      );
      out body geom;
    `;

    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: overpassQuery
      });

      if (!r.ok) throw new Error(`Overpass returned status ${r.status}`);
      const data = await r.json();
      const elements = data.elements || [];

      // Process elements
      const parsedRoads: any[] = [];
      const parsedWater: any[] = [];
      const parsedPOIs: any[] = [];

      // Helper to check if point is inside boundary
      const pointInPolygon = (pt: Coordinate, vs: Coordinate[]) => {
        let x = pt.lng, y = pt.lat;
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
          let xi = vs[i].lng, yi = vs[i].lat;
          let xj = vs[j].lng, yj = vs[j].lat;
          let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      };

      for (const el of elements) {
        const tags = el.tags || {};
        const elName = getOSMName(tags);

        if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
          const coords = el.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon }));
          
          if (tags.highway) {
            parsedRoads.push({ coords, name: elName, highway: tags.highway });
          } else if (tags.natural === 'water' || tags.landuse === 'forest') {
            parsedWater.push({ coords, name: elName || (tags.natural ? 'Water Body' : 'Forest'), type: tags.natural || 'forest' });
          }
        } else if (el.type === 'node') {
          const pt = { lat: el.lat, lng: el.lon };
          if (pointInPolygon(pt, pins)) {
            const type = tags.amenity || tags.shop || tags.tourism || 'POI';
            parsedPOIs.push({ lat: el.lat, lng: el.lon, name: elName || type, type });
          }
        }
      }

      setRoads(parsedRoads);
      setWaterBodies(parsedWater);
      setPois(parsedPOIs);

      // Render features on map
      renderRoadsLayer(parsedRoads);
      renderWaterLayer(parsedWater);
      renderPOIsLayer(parsedPOIs);

    } catch (e: any) {
      console.warn("Failed to fetch features from OSM:", e);
      setExtractError("Fetched boundary, but failed to fetch detailed roads/landmarks from OSM.");
    } finally {
      setExtractStatus('');
    }
  };

  // Render roads to Map
  const renderRoadsLayer = (rdsList: any[]) => {
    const rg = layersRef.current.roadsGroup;
    const lg = layersRef.current.roadLabelsGroup;
    if (!rg || !lg) return;

    rg.clearLayers();
    lg.clearLayers();

    rdsList.forEach(r => {
      const latlngs = r.coords.map((c: any) => [c.lat, c.lng]);
      
      // Styling roads
      const isMajor = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].includes(r.highway);
      const poly = L.polyline(latlngs, {
        color: isMajor ? '#1e293b' : '#64748b',
        weight: isMajor ? 5 : 3,
        opacity: 0.95
      }).addTo(rg);

      // Aligned Road Name Labels
      if (r.name && r.coords.length >= 2) {
        const midIdx = Math.floor(r.coords.length / 2);
        const p1 = r.coords[midIdx - 1];
        const p2 = r.coords[midIdx];
        const bearing = calculateBearing(p1, p2);

        // DivIcon for rotating text along the segment
        const customIcon = L.divIcon({
          className: 'custom-road-label-container',
          html: `<div style="transform: rotate(${bearing}deg); font-family: 'Public Sans', sans-serif; font-size: 8px; font-weight: 800; color: #1e293b; background: rgba(255,255,255,0.85); padding: 1px 4.5px; border-radius: 4px; border: 1px solid #94a3b8; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05); pointer-events: none;">${r.name}</div>`,
          iconSize: [0, 0]
        });

        L.marker([p2.lat, p2.lng], { icon: customIcon, interactive: false }).addTo(lg);
      }
    });

    if (!showRoads) rg.remove();
    if (!showRoadNames) lg.remove();
  };

  // Toggle roads visibility
  useEffect(() => {
    const map = mapRef.current;
    const rg = layersRef.current.roadsGroup;
    if (!map || !rg) return;
    if (showRoads) rg.addTo(map);
    else rg.remove();
  }, [showRoads]);

  // Toggle road names visibility
  useEffect(() => {
    const map = mapRef.current;
    const lg = layersRef.current.roadLabelsGroup;
    if (!map || !lg) return;
    if (showRoadNames) lg.addTo(map);
    else lg.remove();
  }, [showRoadNames]);

  // Render water/landcover to Map
  const renderWaterLayer = (watList: any[]) => {
    const wg = layersRef.current.waterGroup;
    if (!wg) return;
    wg.clearLayers();

    watList.forEach(w => {
      const latlngs = w.coords.map((c: any) => [c.lat, c.lng]);
      L.polygon(latlngs, {
        color: w.type === 'forest' ? '#166534' : '#0369a1',
        fillColor: w.type === 'forest' ? '#22c55e' : '#38bdf8',
        fillOpacity: 0.35,
        weight: 1.5
      }).bindTooltip(w.name, { sticky: true }).addTo(wg);
    });

    if (!showWater) wg.remove();
  };

  // Toggle water bodies visibility
  useEffect(() => {
    const map = mapRef.current;
    const wg = layersRef.current.waterGroup;
    if (!map || !wg) return;
    if (showWater) wg.addTo(map);
    else wg.remove();
  }, [showWater]);

  // Render POIs to Map
  const renderPOIsLayer = (poisList: any[]) => {
    const pg = layersRef.current.poiGroup;
    if (!pg) return;
    pg.clearLayers();

    poisList.forEach(p => {
      const customIcon = L.divIcon({
        className: 'custom-poi-marker',
        html: `<div style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #6366f1; border: 1.5px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.15); font-size: 9px; color: white;">📍</div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9]
      });

      L.marker([p.lat, p.lng], { icon: customIcon })
        .bindTooltip(p.name, { direction: 'top', className: 'bg-slate-800 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow' })
        .addTo(pg);
    });

    if (!showPOIs) pg.remove();
  };

  // Toggle POIs visibility
  useEffect(() => {
    const map = mapRef.current;
    const pg = layersRef.current.poiGroup;
    if (!map || !pg) return;
    if (showPOIs) pg.addTo(map);
    else pg.remove();
  }, [showPOIs]);

  // 8. Fetch Google Open Buildings Footprints with Accuracy Filter
  const fetchGoogleBuildings = async () => {
    if (boundaryPins.length === 0) return;
    setFetchingBuildings(true);
    setExtractStatus('Fetching Google Open Buildings footprints...');

    const bb = getBbox(boundaryPins);
    try {
      const res = await supabase.functions.invoke('fetch-open-buildings', {
        body: {
          north: bb.north,
          south: bb.south,
          east: bb.east,
          west: bb.west,
          boundary: boundaryPins.map(p => ({ lat: p.lat, lng: p.lng })),
          useGoogle: true,
          minConfidence: accuracy
        }
      });

      if (res.error) throw res.error;

      const list = res.data?.buildings || [];
      // Google polygon objects have coordinates structure
      const valid = list.filter((b: any) => b.polygon && Array.isArray(b.polygon.coordinates));

      setBuildings(valid);
      renderBuildingsLayer(valid);

    } catch (e: any) {
      console.warn("Failed to fetch Google footprints:", e);
      alert("Failed to retrieve Google Open Buildings. Verify your Supabase Edge Function is deployed.");
    } finally {
      setFetchingBuildings(false);
      setExtractStatus('');
    }
  };

  // Render Google Open Buildings footprints on Map
  const renderBuildingsLayer = (bldList: any[]) => {
    const bg = layersRef.current.buildingsGroup;
    if (!bg) return;
    bg.clearLayers();

    bldList.forEach(b => {
      // coordinates format is [[[lng, lat], [lng, lat], ...]]
      const latlngs = b.polygon.coordinates[0].map(([lng, lat]: any) => [lat, lng]);
      
      L.polygon(latlngs, {
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.5,
        weight: 1.5
      }).addTo(bg);
    });

    if (!showBuildings) bg.remove();
  };

  // Toggle buildings footprint layer
  useEffect(() => {
    const map = mapRef.current;
    const bg = layersRef.current.buildingsGroup;
    if (!map || !bg) return;
    if (showBuildings) bg.addTo(map);
    else bg.remove();
  }, [showBuildings]);

  return (
    <div className="flex h-screen w-screen bg-slate-900 overflow-hidden font-public-sans text-slate-100 print:bg-white print:text-black">
      
      {/* Printable Title Overlays (rendered only in Print View) */}
      <div className="hidden print:block absolute top-6 left-6 z-[9999] bg-white/95 border-2 border-slate-800 p-4 rounded-xl shadow-lg w-72">
        <h2 className="text-xl font-black text-slate-900 font-public-sans uppercase tracking-tight">{printTitle || 'Nazari Naksha'}</h2>
        <div className="text-[10px] text-slate-500 font-semibold space-y-1 mt-2">
          <p>🏢 Block Number: {hlbCode || '—'}</p>
          <p>🧑‍💼 Inspector Signature: __________________</p>
          <p>📅 Generated Date: {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {showPrintLegend && (
        <div className="hidden print:block absolute bottom-6 right-6 z-[9999] bg-white/95 border border-slate-200 p-3 rounded-lg shadow-md w-44">
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1.5">Legend</h4>
          <div className="space-y-1 text-[9px] font-semibold text-slate-600">
            <div className="flex items-center gap-1.5"><div className="w-3 h-1 border-t-2 border-dashed border-red-500"></div> Boundary Line</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 bg-indigo-600/50 border border-indigo-600"></div> Google Building</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1 bg-slate-800"></div> Roads/Highways</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-sky-400/35 border border-sky-400"></div> Water Body</div>
          </div>
        </div>
      )}

      {/* Left Settings & Controls Sidebar (Hidden during browser printing) */}
      <div className="w-[380px] bg-slate-800 border-r border-slate-700/60 flex flex-col print:hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛰️</span>
            <div>
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-slate-200 leading-none">Sat-Extractor</h2>
              <span className="text-[10px] text-violet-400 font-bold tracking-widest uppercase mt-1 block">Satellite Mode</span>
            </div>
          </div>
          <button
            onClick={onBack}
            className="py-1 px-2.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-300 transition-colors"
          >
            ← Back
          </button>
        </div>

        {/* Scrollable Setup & Control Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Form 1: Setup & Extract */}
          <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📐 Extract Boundary Polygon</h3>
            <form onSubmit={handleExtract} className="space-y-3.5">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">HLB Code (4 digits)</label>
                <input
                  type="text"
                  maxLength={4}
                  value={hlbCode}
                  onChange={e => setHlbCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 0455"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Census GeoPDF File</label>
                <input
                  type="file"
                  accept=".pdf"
                  onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer"
                />
              </div>

              <button
                type="submit"
                disabled={!!extractStatus}
                className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {extractStatus ? 'Processing Extraction...' : 'Extract & Sync Boundary ⚡'}
              </button>
            </form>

            {extractError && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-2.5 rounded-lg font-medium leading-relaxed">{extractError}</p>
            )}
          </div>

          {/* Form 2: Load Saved Boundaries */}
          {savedBoundaries.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📂 Saved DB Boundaries ({savedBoundaries.length})</h3>
              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {savedBoundaries.map((item, idx) => (
                  <div key={item.id || idx} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-slate-700/40 hover:bg-slate-900/80 transition-colors">
                    <div>
                      <p className="text-xs font-bold text-slate-200 font-mono">HLB {item.hlb_number}</p>
                      <p className="text-[9px] text-slate-400">{new Date(item.created_at || item.timestamp).toLocaleDateString()}</p>
                    </div>
                    <button
                      onClick={() => handleSelectSaved(item)}
                      className="py-1 px-2.5 bg-violet-650/40 hover:bg-violet-650/80 text-violet-400 font-bold text-[10px] rounded border border-violet-500/25 transition-all"
                    >
                      Load
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Google Open Buildings Action */}
          {boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🏠 Google Open Buildings</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>CONFIDENCE THRESHOLD</span>
                  <span className="text-violet-400 font-mono">{(accuracy * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={accuracy}
                  onChange={e => setAccuracy(parseFloat(e.target.value))}
                  className="w-full accent-violet-500 bg-slate-900 cursor-pointer h-1.5 rounded-lg"
                />
                <p className="text-[9px] text-slate-400 leading-snug">Higher value filters out low-confidence structures to match sat view.</p>
              </div>

              <button
                onClick={fetchGoogleBuildings}
                disabled={fetchingBuildings || !!extractStatus}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {fetchingBuildings ? 'Downloading Footprints...' : 'Fetch Building Footprints 🛰️'}
              </button>
            </div>
          )}

          {/* Layer Visibility Toggles */}
          <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">👁️ Toggle Map Layers</h3>
            <div className="space-y-2.5 text-xs text-slate-300">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showSatellite} onChange={e => setShowSatellite(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Google Satellite Hybrid</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showBoundary} onChange={e => setShowBoundary(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span className="flex items-center gap-2"><span className="w-3.5 h-0.5 border-t border-dashed border-red-500"></span> Red Boundary Line</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showRoads} onChange={e => setShowRoads(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Roads & Highways (OSM)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showRoadNames} onChange={e => setShowRoadNames(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Road Name Labels (Aligned)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showWater} onChange={e => setShowWater(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Water Bodies & Forests</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showPOIs} onChange={e => setShowPOIs(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Points of Interest (POIs)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showBuildings} onChange={e => setShowBuildings(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Building Footprints ({buildings.length})</span>
              </label>
            </div>
          </div>

          {/* Print Layout Section */}
          {boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🖨️ Layout Customization</h3>
              
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Map Title (Print header)</label>
                  <input
                    type="text"
                    value={printTitle}
                    onChange={e => setPrintTitle(e.target.value)}
                    placeholder="Nazari Naksha - HLB 0455"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                  />
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-slate-300">
                  <input type="checkbox" checked={showPrintLegend} onChange={e => setShowPrintLegend(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                  <span>Show Map Legend Box</span>
                </label>

                <button
                  onClick={() => window.print()}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all"
                >
                  Print Layout Map 🖨️
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-900/40 border-t border-slate-700/60 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Powered by DuckDB & Google Earth Engine</p>
        </div>

      </div>

      {/* Main Map Workspace Canvas */}
      <div className="flex-1 relative bg-slate-950 flex flex-col">
        {/* Loading Overlay */}
        {extractStatus && (
          <div className="absolute inset-0 bg-slate-900/80 z-[1000] flex flex-col items-center justify-center space-y-4 print:hidden">
            <svg className="animate-spin h-10 w-10 text-violet-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-semibold text-slate-200 tracking-wide">{extractStatus}</p>
          </div>
        )}

        {/* Leaflet container */}
        <div ref={mapContainerRef} className="flex-1 w-full h-full z-10 print:h-screen print:w-screen" />

        {/* Map Workspace Instructions Overlay */}
        {boundaryPins.length === 0 && !extractStatus && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 border border-slate-800 p-8 rounded-2xl max-w-sm text-center shadow-2xl z-20 print:hidden">
            <span className="text-5xl block mb-4">🗺️</span>
            <h3 className="font-extrabold text-lg text-slate-200 mb-2">Sat-Extractor Workspace</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Upload a Census layout PDF and enter the target 4-digit HLB code to load the georeferenced satellite editor mode.
            </p>
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Zero drawing required</p>
          </div>
        )}
      </div>

      {/* Print Styles Sheet injected to customize layout during browser print */}
      <style>{`
        @media print {
          body, html, #root {
            height: 100% !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          /* Hide sidebar and any controls */
          .print\\:hidden, 
          header, 
          nav, 
          button, 
          input, 
          .leaflet-control-zoom, 
          .leaflet-control-attribution {
            display: none !important;
          }
          /* Expand Leaflet map to absolute full viewport page */
          .print\\:h-screen {
            position: absolute !important;
            inset: 0 !important;
            height: 100vh !important;
            width: 100vw !important;
            z-index: 1 !important;
          }
          /* Style Leaflet controls to keep them white and high-contrast */
          .leaflet-container {
            background: white !important;
          }
        }
      `}</style>

    </div>
  );
}
