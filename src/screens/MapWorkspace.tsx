import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import type { Coordinate, PlacedSymbol, RoadFeature, SymbolType, Block, FarmlandBlock, WaterBody, ForestArea, Landmark, AreaStats, MapData } from '../types';
import { SYMBOL_DEFS, isHouseType, isPakkaRoad, getUnitCount, polyCenter } from '../types';
import { getBbox, clipRoadsToPolygon, polygonArea, bearingBetween, pointInPolygon, classifyBuilding, getPolygonCentroid, generateBlocks, getBestOrientation, generateSerpentinePath, getSerpentineOrder, buildComprehensiveQuery, processOverpassData, isPolygonSelfIntersecting, fetchOverpass } from '../lib/geo';
import { getSmallSymbolSVG } from '../lib/symbols';
import { declutterSymbols, buildRotationMap } from '../lib/declutter';
import SymbolDrawer from '../components/SymbolDrawer';
import GuidedTour from '../components/GuidedTour';
import { DEMO_BOUNDARY, DEMO_CENTER } from '../data/demo';
import { supabase } from '../lib/supabase';
import { findNearestRoadBearing, getBlockOrientation } from '../lib/pdf-export';
import { useTranslation } from '../lib/i18n';

interface Props {
  step: number; center: Coordinate; boundaryPins: Coordinate[]; boundaryClosed: boolean;
  roads: RoadFeature[]; symbols: PlacedSymbol[]; hlbNumber: string; blocks: Block[]; farmlandBlocks: FarmlandBlock[];
  waterBodies: WaterBody[]; forests: ForestArea[]; landuseAreas?: any[]; landmarks: Landmark[]; areaStats: AreaStats | null;
  onUpdateBoundary: (p: Coordinate[], c: boolean) => void;
  onUpdateRoads: (r: RoadFeature[]) => void;
  onUpdateSymbols: (s: PlacedSymbol[]) => void;
  onUpdateBlocks: (b: Block[]) => void;
  onUpdateFarmland: (f: FarmlandBlock[]) => void;
  onUpdateMapData?: (updates: Partial<MapData>) => void; // New prop for updating the whole mapdata in App
  onUpdateWater: (w: WaterBody[]) => void;
  onUpdateForests: (f: ForestArea[]) => void;
  onUpdateLandmarks: (l: Landmark[]) => void;
  onUpdateStats: (s: AreaStats) => void;
  onUpdateOrientation: (o: 'landscape' | 'portrait') => void;
  onStepComplete: () => void; onJumpToPreview: () => void;
  isDemoMode?: boolean;
  onDemoComplete?: () => void;
  numberingSystem?: 'serpentine' | 'census_u_loop' | 'boundary_serpentine';
  isAutoFetched?: boolean;
}

const BC = ['#E74C3C','#3498DB','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#2980B9','#C0392B','#16A085','#D35400','#8E44AD'];

// ── Bata sub-number panel ────────────────────────────────────────────────────
function BataPanel({ symbols, onUpdateSymbols }: { symbols: PlacedSymbol[]; onUpdateSymbols: (s: PlacedSymbol[]) => void }) {
  const [buildingNo, setBuildingNo] = useState('');
  const [subNo, setSubNo] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const apply = () => {
    const num = parseInt(buildingNo);
    const sub = subNo.trim();
    if (isNaN(num) || !sub) return;
    const target = symbols.find(s => s.number === num);
    if (!target) { setMsg({ text: `No building with number ${num} found.`, ok: false }); return; }
    onUpdateSymbols(symbols.map(s => s.id === target.id ? { ...s, subNumber: sub } : s));
    setMsg({ text: `Building ${num} now shows as ${num}/${sub}.`, ok: true });
    setBuildingNo(''); setSubNo('');
    setTimeout(() => setMsg(null), 3000);
  };

  const clear = (num: number) => {
    onUpdateSymbols(symbols.map(s => s.number === num ? { ...s, subNumber: null } : s));
    setMsg({ text: `Sub-number cleared for building ${num}.`, ok: true });
    setTimeout(() => setMsg(null), 2000);
  };

  const bataSubs = symbols.filter(s => (s as any).subNumber && s.number !== null);

  return (
    <div className="border border-amber-200 rounded-xl bg-amber-50 p-3 space-y-2">
      <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wide">Bata Sub-Numbers (4/1 system)</p>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Building #</label>
          <input type="number" min="1" value={buildingNo} onChange={e => setBuildingNo(e.target.value)} placeholder="e.g. 4" className="w-full border border-gray-200 rounded-lg p-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <div className="flex-1">
          <label className="text-[10px] text-gray-500 font-semibold block mb-0.5">Sub-No (1 or A)</label>
          <input type="text" value={subNo} onChange={e => setSubNo(e.target.value.slice(0, 4))} placeholder="e.g. 1" className="w-full border border-gray-200 rounded-lg p-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-amber-400" />
        </div>
        <button onClick={apply} disabled={!buildingNo || !subNo.trim()} className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex-shrink-0">Apply</button>
      </div>
      {msg && <p className={`text-[10px] font-semibold ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
      {bataSubs.length > 0 && (
        <div className="space-y-1">
          {bataSubs.map(s => (
            <div key={s.id} className="flex items-center justify-between bg-white rounded-lg px-2 py-1 border border-amber-100">
              <span className="text-xs font-mono text-amber-800">{s.number}/{(s as any).subNumber}</span>
              <button onClick={() => clear(s.number!)} className="text-[10px] text-red-400 hover:text-red-600">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MapWorkspace(props: Props) {
  const {
    step, center, boundaryClosed, hlbNumber, areaStats,
    onUpdateBoundary, onUpdateRoads, onUpdateSymbols, onUpdateBlocks, onUpdateFarmland,
    onUpdateWater, onUpdateForests, onUpdateLandmarks, onUpdateStats, onUpdateOrientation,
    onStepComplete, onJumpToPreview, onUpdateMapData, isDemoMode, onDemoComplete,
    numberingSystem, isAutoFetched
  } = props;

  const { t } = useTranslation();

  const boundaryPins = props.boundaryPins || [];
  const roads = props.roads || [];
  const symbols = props.symbols || [];
  const blocks = props.blocks || [];
  const farmlandBlocks = props.farmlandBlocks || [];
  const waterBodies = props.waterBodies || [];
  const forests = props.forests || [];
  const landuseAreas = props.landuseAreas || [];
  const landmarks = props.landmarks || [];

  const existingMax = symbols.reduce((m, s) => Math.max(m, s.number ?? 0), 0);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const bndGrp = useRef(L.layerGroup()); const rdGrp = useRef(L.layerGroup());
  const drwGrp = useRef(L.layerGroup()); const blkGrp = useRef(L.layerGroup());
  const srpGrp = useRef(L.layerGroup()); const frmGrp = useRef(L.layerGroup());
  const watGrp = useRef(L.layerGroup()); const forGrp = useRef(L.layerGroup());
  const lmkGrp = useRef(L.layerGroup()); const hlGrp = useRef(L.layerGroup());
  const luGrp = useRef(L.layerGroup());
  const mks = useRef<Map<string, L.Marker>>(new Map());
  const tileRef = useRef<L.TileLayer | null>(null);
  const tileLabelsRef = useRef<L.TileLayer | null>(null);
  const tileTransRef = useRef<L.TileLayer | null>(null);
  const rotMap = useRef<Map<string, number>>(new Map());
  const numHist = useRef<string[]>([]);

  const [cross, setCross] = useState<Coordinate>(center);
  const [ready, setReady] = useState(false);
  const [rdLoad, setRdLoad] = useState(false); const [rdErr, setRdErr] = useState('');
  const [bldgMsg, setBldgMsg] = useState('');
  const [revMode, setRevMode] = useState(false); const [revIdx, setRevIdx] = useState(0);
  const [selSym, setSelSym] = useState<SymbolType | null>(null);
  const [placing, setPlacing] = useState(false);
  const [nextNum, setNextNum] = useState(existingMax + 1);
  const [sugId, setSugId] = useState<string | null>(null);
  const [drwRd, setDrwRd] = useState(false); const [drwPts, setDrwPts] = useState<Coordinate[]>([]); const [drwType, setDrwType] = useState('residential');
  const [showHelp, setShowHelp] = useState(true); const [showSat, setShowSat] = useState(true);
  const [autoBanner, setAutoBanner] = useState(false); const [hasAuto, setHasAuto] = useState(false);


  const [autoData, setAutoData] = useState<{ buildings: number; farmlands: number; water: number; forests: number; landmarks: number; total: number; isVision?: boolean } | null>(null);
  const [showBlk, setShowBlk] = useState(true);
  const [showGuide, setShowGuide] = useState(true);
  const [showSnakeView, setShowSnakeView] = useState(false);
  const [serpPath, setSerpPath] = useState<Coordinate[]>([]); const [serpOrd, setSerpOrd] = useState<string[]>([]);
  const [aptUnits, setAptUnits] = useState(2);
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [drawMode, setDrawMode] = useState<'none' | 'farmland' | 'block' | 'label'>('none');
  const [selectDeleteMode, setSelectDeleteMode] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [polyPts, setPolyPts] = useState<Coordinate[]>([]);
  const [farmLbl, setFarmLbl] = useState('A'); const [blkLbl, setBlkLbl] = useState('A');
  const [customLabel, setCustomLabel] = useState('');
  const [showStats, setShowStats] = useState(false);
  const [isCropped, setIsCropped] = useState(false);
  const [cropZoom, setCropZoom] = useState<number | null>(null);

  const houses = symbols.filter(s => isHouseType(s.symbol_type));
  const numDone = houses.filter(s => s.number !== null).length;
  const totH = houses.length;
  const totU = houses.reduce((s, h) => s + getUnitCount(h), 0);
  const area = boundaryPins.length >= 3 ? polygonArea(boundaryPins) : 0;
  const areaT = area > 10000 ? `${(area/10000).toFixed(2)} ha` : `${Math.round(area)} sq m`;

  // ─── STALE CLOSURE FIXES ────────────────────────────────
  const mkClickRef = useRef<(id: string, evType: 'click'|'dblclick') => void>(() => {});
  mkClickRef.current = (id: string, evType: 'click'|'dblclick') => {
    // Select-to-delete mode: single click toggles selection
    if (step === 5 && selectDeleteMode) {
      setSelectedForDelete(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      return;
    }
    if (step === 5 && evType === 'dblclick') { const s = symbols.find(x => x.id === id); if (s && confirm(`Delete ${s.symbol_type.replace(/_/g,' ')}?`)) { const m = mks.current.get(id); if (m) { m.remove(); mks.current.delete(id); } onUpdateSymbols(symbols.filter(x => x.id !== id)); } return; }
    if (step !== 6 || evType !== 'click') return;
    const sym = symbols.find(x => x.id === id); if (!sym || !isHouseType(sym.symbol_type)) return;
    if (editMode && sym.number !== null) { const u = symbols.map(s => s.id===id?{...s,number:null}:s); refreshMk(u.find(s=>s.id===id)!); onUpdateSymbols(u); setSugId(null); setTimeout(()=>u.forEach(s=>refreshMk(s)),10); return; }
    if (sym.number !== null) return;
    const units = getUnitCount(sym), num = nextNum;
    const upd = symbols.map(s => s.id===id?{...s,number:num}:s);
    refreshMk(upd.find(x=>x.id===id)!); numHist.current.push(id);
    const ns = serpOrd.find(o=>{const s=upd.find(x=>x.id===o);return s&&isHouseType(s.symbol_type)&&s.number===null;});
    const ps=sugId; setSugId(ns||null);
    if(ps&&ps!==ns){const p=upd.find(s=>s.id===ps);if(p)refreshMk(p);}
    if(ns){const n=upd.find(s=>s.id===ns);if(n)refreshMk(n);}
    let nextVal = num + (numberingSystem === 'census_u_loop' ? 1 : units);
    const assigned = new Set(upd.map(s => s.number).filter(n => n !== null));
    while (assigned.has(nextVal)) {
      nextVal += 1;
    }
    setNextNum(nextVal);
    onUpdateSymbols(upd);
  };

  const mapClickRef = useRef<(c: Coordinate) => void>(() => {});
  const zoomEndRef = useRef<() => void>(() => {});
  zoomEndRef.current = () => {
    if (!mapRef.current) return;
    symbols.forEach(sym => {
      refreshMk(sym);
    });
  };
  mapClickRef.current = (coord: Coordinate) => {
    // Boundary drawing by clicking on map
    if (step === 3 && !boundaryClosed) {
      onUpdateBoundary([...boundaryPins, { ...coord }], false);
      try { navigator.vibrate?.(50); } catch {}
      setShowHelp(false);
      return;
    }
    // Road drawing by clicking on map
    if (step === 4 && drwRd) {
      addRoadPoint(coord); try { navigator.vibrate?.(40); } catch {}
      return;
    }
    if (step === 5 && placing && selSym) {
      // Validate coordinates before creating symbol
      if (typeof coord.lat !== 'number' || typeof coord.lng !== 'number' || isNaN(coord.lat) || isNaN(coord.lng)) {
        console.error('Invalid coordinates for symbol placement:', coord);
        return;
      }
      const sym: PlacedSymbol = { id: crypto.randomUUID(), symbol_type: selSym, lat: coord.lat, lng: coord.lng, number: null, placed_at: new Date().toISOString(), unit_count: selSym==='apartment'?aptUnits:undefined };
      addMk(sym); onUpdateSymbols([...symbols, sym]); try { navigator.vibrate?.(40); } catch {}
    } else if (step === 5 && drawMode !== 'none') {
      if (drawMode === 'label') {
        if (!customLabel) { alert('Enter a place name first!'); return; }
        onUpdateLandmarks([...landmarks, { id: crypto.randomUUID(), name: customLabel, type: 'place', lat: coord.lat, lng: coord.lng }]);
        try { navigator.vibrate?.(40); } catch {}
        setCustomLabel('');
        setDrawMode('none');
        setPanelOpen(true);
      } else {
        const pts = [...polyPts, coord]; setPolyPts(pts); renderDrawPoly(pts); try { navigator.vibrate?.(40); } catch {}
      }
    }
  };

  // ─── MAP INIT ───────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    
    // Fix Leaflet "Map container is already initialized" error in React StrictMode
    const container = containerRef.current as HTMLDivElement & { _leaflet_id?: any };
    if (container._leaflet_id) {
      container._leaflet_id = null;
    }

    const map = L.map(containerRef.current, { center: [center.lat, center.lng], zoom: 17, zoomControl: false, attributionControl: false });
    tileRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    // Add Hybrid labels overlay for Places and Roads
    tileLabelsRef.current = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    tileTransRef.current = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    [bndGrp, blkGrp, rdGrp, drwGrp, srpGrp, watGrp, forGrp, lmkGrp, frmGrp, hlGrp, luGrp].forEach(g => {
      if (!map.hasLayer(g.current)) {
        g.current.addTo(map);
      }
    });
    map.on('move', () => { const c = map.getCenter(); setCross(c); });
    map.on('click', (e: L.LeafletMouseEvent) => { mapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    map.on('zoomend', () => { zoomEndRef.current(); });
    mapRef.current = map; setReady(true);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ─── RENDERERS ──────────────────────────────────────────
  const renderBnd = useCallback(() => {
    const g = bndGrp.current; g.clearLayers();
    if (showSnakeView) return;
    if (!boundaryPins.length) return;
    const ll = boundaryPins.map(p => L.latLng(p.lat, p.lng));
    if (boundaryClosed && ll.length >= 3) g.addLayer(L.polygon(ll, { color:'#CC0000', weight:2.5, fillColor:'#CC0000', fillOpacity:0.1 }));
    else if (ll.length >= 2) g.addLayer(L.polyline(ll, { color:'#CC0000', weight:2, dashArray:'8,5' }));
    boundaryPins.forEach((p,i) => { g.addLayer(L.circleMarker([p.lat,p.lng], { radius:10, color:'#FFF', fillColor:'#CC0000', fillOpacity:1, weight:2.5 })); g.addLayer(L.marker([p.lat,p.lng], { icon: L.divIcon({ html:`<div style="color:#fff;font:bold 11px sans-serif;text-align:center;line-height:20px;width:20px;height:20px">${i+1}</div>`, className:'', iconSize:[20,20], iconAnchor:[10,10] }), interactive:false })); });
  }, [boundaryPins, boundaryClosed, showSnakeView]);

  const renderRds = useCallback(() => {
    const g = rdGrp.current; g.clearLayers();
    if (showSnakeView) return;
    roads.forEach((r,i) => { if (r.coords.length < 2) return; const ll = r.coords.map(c => L.latLng(c.lat, c.lng)); const cf=r.confirmed, pk=isPakkaRoad(r.highway), rs=['residential','unclassified','tertiary','service','living_street'].includes(r.highway), kt=['footway','path','track','pedestrian','steps'].includes(r.highway); const lc=cf?'#000':'#FFB830', gc=cf?'#FFF':'#FFF8E8';
      if (revMode&&i===revIdx) { g.addLayer(L.polyline(ll,{color:'#0066FF',weight:7,opacity:0.9})); g.addLayer(L.polyline(ll,{color:'#FFF',weight:3})); return; }
      let poly;
      if (pk) { poly = L.polyline(ll,{color:lc,weight:8}); g.addLayer(poly); g.addLayer(L.polyline(ll,{color:gc,weight:4})); }
      else if (rs) { poly = L.polyline(ll,{color:lc,weight:6}); g.addLayer(poly); g.addLayer(L.polyline(ll,{color:gc,weight:2.5})); }
      else if (kt) { poly = L.polyline(ll,{color:lc,weight:5,dashArray:'10,6'}); g.addLayer(poly); g.addLayer(L.polyline(ll,{color:gc,weight:2,dashArray:'10,6'})); }
      else { poly = L.polyline(ll,{color:lc,weight:5}); g.addLayer(poly); g.addLayer(L.polyline(ll,{color:gc,weight:2})); }
      if (r.name && poly) {
        poly.bindTooltip(r.name, { sticky: true, className: 'bg-white text-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded shadow border border-slate-200' });
      }
    });
  }, [roads, revMode, revIdx, showSnakeView]);

  const renderWat = useCallback(() => {
    const g = watGrp.current; g.clearLayers();
    if (showSnakeView) return;
    for (const wb of waterBodies) {
      if (wb.type === 'pond' && wb.coords.length >= 3) {
        g.addLayer(L.polygon(wb.coords.map(c=>[c.lat,c.lng]), { color:'#1565C0', weight:2, fillColor:'#42A5F5', fillOpacity:0.25 }));
      } else if (wb.coords.length >= 2) {
        const w = wb.type === 'river' ? 4 : 2;
        g.addLayer(L.polyline(wb.coords.map(c=>[c.lat,c.lng]), { color:'#1565C0', weight:w, opacity:0.7 }));
        if (wb.name) { const c = wb.center; g.addLayer(L.marker([c.lat,c.lng], { icon: L.divIcon({ html:`<div style="background:rgba(21,101,192,0.8);color:white;font-size:8px;padding:1px 4px;border-radius:3px;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,0.5)">${wb.name}</div>`, className:'', iconAnchor:[20,8] }), interactive:false })); }
      }
    }
  }, [waterBodies, showSnakeView]);

  const renderFor = useCallback(() => {
    const g = forGrp.current; g.clearLayers();
    if (showSnakeView) return;
    for (const fa of forests) {
      if (fa.points.length < 3) continue;
      g.addLayer(L.polygon(fa.points.map(p=>[p.lat,p.lng]), { color:'#2E7D32', weight:2, dashArray:'6,3', fillColor:'#4CAF50', fillOpacity:0.2 }));
      const c = polyCenter(fa.points);
      g.addLayer(L.marker([c.lat,c.lng], { icon: L.divIcon({ html:`<div style="color:#2E7D32;font-size:10px;font-weight:bold;text-shadow:0 0 3px white,-0 0 3px white,0 0 3px white;white-space:nowrap">🌳 ${fa.name}</div>`, className:'', iconAnchor:[30,8] }), interactive:false }));
    }
  }, [forests, showSnakeView]);

  const renderLmk = useCallback(() => {
    const g = lmkGrp.current; g.clearLayers();
    if (showSnakeView) return;
    for (const lm of landmarks) {
      const m = L.marker([lm.lat,lm.lng], { icon: L.divIcon({ html:`<div style="background:rgba(255,255,255,0.92);color:#333;font-size:9px;font-weight:600;padding:2px 5px;border-radius:4px;border:1px solid #ccc;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.2);max-width:120px;overflow:hidden;text-overflow:ellipsis">📌 ${lm.name}</div>`, className:'', iconAnchor:[30,20] }), interactive:true });
      m.on('click', () => {
        if (editMode) {
          onUpdateLandmarks(landmarks.filter(x => x.id !== lm.id));
          try { navigator.vibrate?.(20); } catch {}
        }
      });
      g.addLayer(m);
    }
  }, [landmarks, editMode, showSnakeView]);

  const renderBlks = useCallback(() => {
    const g = blkGrp.current; g.clearLayers();
    if (!showBlk && !showSnakeView) return;
    blocks.forEach((b, i) => {
      const c = b.points ? polyCenter(b.points) : { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
      const pts: Coordinate[] = b.points || [
        { lat: b.south, lng: b.west }, { lat: b.north, lng: b.west },
        { lat: b.north, lng: b.east }, { lat: b.south, lng: b.east },
      ];
      const col = BC[i % 12];
      g.addLayer(L.polygon(pts.map(p => [p.lat, p.lng]), { color: col, weight: 2.5, dashArray: '8,4', fillColor: col, fillOpacity: 0.12 }));
      if (b.label) {
        g.addLayer(L.marker([c.lat, c.lng], {
          icon: L.divIcon({ html: `<div style="font:bold 14px 'Baloo 2',sans-serif;color:${col};text-shadow:1px 1px 3px white,-1px -1px 3px white;text-align:center;pointer-events:none">Block ${b.label}</div>`, className: '', iconSize: [80, 22], iconAnchor: [40, 11] }), interactive: false,
        }));
      }
    });
  }, [blocks, showBlk, showSnakeView]);

  const renderFrms = useCallback(() => {
    const g = frmGrp.current; g.clearLayers();
    if (showSnakeView) return;
    farmlandBlocks.forEach(fb => {
      if (fb.points.length < 3) return;
      g.addLayer(L.polygon(fb.points.map(p => [p.lat, p.lng]), { color: '#2E7D32', weight: 3, dashArray: '10,5', fillColor: '#66BB6A', fillOpacity: 0.15 }));
      const c = polyCenter(fb.points);
      g.addLayer(L.marker([c.lat, c.lng], {
        icon: L.divIcon({ html: `<div style="font:bold 13px 'Baloo 2',sans-serif;color:#2E7D32;text-shadow:1px 1px 3px white,-1px -1px 3px white;text-align:center;pointer-events:none">🌾 Farm ${fb.label}</div>`, className: '', iconSize: [90, 22], iconAnchor: [45, 11] }), interactive: false,
      }));
    });
  }, [farmlandBlocks, showSnakeView]);

  const renderSrp = useCallback(() => {
    const g = srpGrp.current; g.clearLayers();
    if ((!showGuide && !showSnakeView) || serpPath.length < 2) return;
    
    if (showSnakeView) {
      g.addLayer(L.polyline(serpPath.map(c=>[c.lat,c.lng]), {color: '#E67E22', weight: 5.5, opacity: 0.95}));
      
      for (let i = 0; i < serpPath.length - 1; i++) {
        const p1 = serpPath[i], p2 = serpPath[i+1];
        const midLat = (p1.lat + p2.lat) / 2;
        const midLng = (p1.lng + p2.lng) / 2;
        const brg = bearingBetween(p1, p2);
        
        const arrowIcon = L.divIcon({
          html: `<div style="transform:rotate(${brg}deg); display:flex; align-items:center; justify-content:center; width:16px; height:16px;">` +
                `<svg width="12" height="12" viewBox="0 0 24 24" fill="none">` +
                `<path d="M4 22L20 12L4 2 Z" fill="#E67E22"/>` +
                `</svg></div>`,
          className: '',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });
        g.addLayer(L.marker([midLat, midLng], { icon: arrowIcon, interactive: false }));
      }
    } else {
      g.addLayer(L.polyline(serpPath.map(c=>[c.lat,c.lng]),{color:'#FF4444',weight:3,opacity:0.45,dashArray:'12,8'}));
      const st=Math.max(1,Math.floor(serpPath.length/12));
      for(let i=0;i<serpPath.length-1;i+=st){
        const brg=bearingBetween(serpPath[i],serpPath[Math.min(i+1,serpPath.length-1)]);
        g.addLayer(L.marker([serpPath[i].lat,serpPath[i].lng],{icon:L.divIcon({html:`<div style="transform:rotate(${brg}deg);color:#FF4444;font-size:14px;opacity:0.5;filter:drop-shadow(0 0 2px white)">➤</div>`,className:'',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}));
      }
    }
    
    g.addLayer(L.marker([serpPath[0].lat,serpPath[0].lng],{icon:L.divIcon({html:`<div style="background:#27AE60;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:bold 7px sans-serif;border:2px solid white">START</div>`,className:'',iconSize:[24,24],iconAnchor:[12,12]}),interactive:false}));
    const last=serpPath[serpPath.length-1];
    g.addLayer(L.marker([last.lat,last.lng],{icon:L.divIcon({html:`<div style="background:#E74C3C;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font:bold 7px sans-serif;border:2px solid white">END</div>`,className:'',iconSize:[20,20],iconAnchor:[10,10]}),interactive:false}));
  }, [serpPath, showGuide, showSnakeView]);

  const renderDrawPoly = (pts: Coordinate[]) => { const g = drwGrp.current; g.clearLayers(); if(!pts.length)return; pts.forEach((p,i)=>{const col=drawMode==='farmland'?'#2E7D32':BC[blocks.length%12];g.addLayer(L.circleMarker([p.lat,p.lng],{radius:7,color:col,fillColor:col,fillOpacity:1,weight:2}));g.addLayer(L.marker([p.lat,p.lng],{icon:L.divIcon({html:`<div style="color:white;font:bold 9px sans-serif;text-align:center;line-height:14px;width:14px;height:14px">${i+1}</div>`,className:'',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}));}); if(pts.length>=2){const col=drawMode==='farmland'?'#2E7D32':BC[blocks.length%12];g.addLayer(L.polyline(pts.map(p=>[p.lat,p.lng]),{color:col,weight:2.5,dashArray:'8,5',opacity:0.8}));} };

  const renderLanduse = useCallback(() => {
    const g = luGrp.current; g.clearLayers();
    if (showSnakeView) return;
    if (!landuseAreas) return;
    const landusStyles: Record<string, { fill: string; stroke: string; width: number; dash: string; label: string }> = {
      farmland:     { fill: '#FFF8DC', stroke: '#8B7355', width: 1, dash: '4,2', label: '🌾' },
      agricultural: { fill: '#FFF8DC', stroke: '#8B7355', width: 1, dash: '4,2', label: '🌾' },
      orchard:      { fill: '#90EE90', stroke: '#228B22', width: 1, dash: '3,3', label: '🌳' },
      forest:       { fill: '#228B22', stroke: '#006400', width: 1, dash: '',    label: '🌲' },
      wood:         { fill: '#228B22', stroke: '#006400', width: 1, dash: '',    label: '🌲' },
      scrub:        { fill: '#9ACD32', stroke: '#6B8E23', width: 0.5, dash: '2,4', label: '' },
      grass:        { fill: '#90EE90', stroke: '#90EE90', width: 0.5, dash: '',    label: '' },
      water:        { fill: '#87CEEB', stroke: '#4169E1', width: 1.5, dash: '',    label: '💧' },
      wetland:      { fill: '#87CEEB', stroke: '#4169E1', width: 1, dash: '2,3', label: '' },
      cemetery:     { fill: '#C8C8C8', stroke: '#808080', width: 1, dash: '',    label: '🪦' },
      park:         { fill: '#90EE90', stroke: '#228B22', width: 1, dash: '',    label: '⛲' }
    };
    landuseAreas.forEach(la => {
      if (la.points.length < 3) return;
      const st = landusStyles[la.type] || landusStyles.grass;
      g.addLayer(L.polygon(la.points.map((p: Coordinate) => [p.lat, p.lng]), { 
        color: st.stroke, weight: st.width, dashArray: st.dash, 
        fillColor: st.fill, fillOpacity: 0.3 
      }));
      if (st.label) {
        const c = polyCenter(la.points);
        g.addLayer(L.marker([c.lat, c.lng], {
          icon: L.divIcon({ html: `<div style="font-size:12px;text-align:center;pointer-events:none;text-shadow:1px 1px 2px white,-1px -1px 2px white">${st.label}</div>`, className: '', iconSize: [24, 24], iconAnchor: [12, 12] }), interactive: false,
        }));
      }
    });
  }, [landuseAreas, showSnakeView]);

  useEffect(() => { if(ready)renderBnd(); }, [ready,renderBnd]);
  useEffect(() => { if(ready)renderRds(); }, [ready,renderRds]);
  useEffect(() => { if(ready)renderWat(); }, [ready,renderWat]);
  useEffect(() => { if(ready)renderFor(); }, [ready,renderFor]);
  useEffect(() => { if(ready)renderLmk(); }, [ready,renderLmk]);
  useEffect(() => { if(ready)renderBlks(); }, [ready,renderBlks]);
  useEffect(() => { if(ready)renderLanduse(); }, [ready, renderLanduse]);
  useEffect(() => { if(ready)renderFrms(); }, [ready, renderFrms]);
  useEffect(() => { if(ready)renderSrp(); }, [ready,renderSrp]);
  useEffect(() => {
    if(!ready) return;
    // Sync markers: add new ones, remove deleted ones
    const currentIds = new Set(symbols.map(s => s.id));
    // Remove markers for deleted symbols
    for (const [id, marker] of mks.current.entries()) {
      if (!currentIds.has(id)) {
        marker.remove();
        mks.current.delete(id);
      }
    }
    // Add markers for new symbols
    symbols.forEach(s => addMk(s));
  }, [ready, symbols]);
  useEffect(() => {
    if (!ready) return;
    if (showSnakeView) {
      if (tileRef.current) tileRef.current.setOpacity(0);
      if (tileLabelsRef.current) tileLabelsRef.current.setOpacity(0);
      if (tileTransRef.current) tileTransRef.current.setOpacity(0);
      if (containerRef.current) {
        containerRef.current.style.backgroundColor = '#FFFFFF';
      }
    } else {
      if (tileRef.current) tileRef.current.setOpacity(showSat ? 1 : 0);
      if (tileLabelsRef.current) tileLabelsRef.current.setOpacity(1);
      if (tileTransRef.current) tileTransRef.current.setOpacity(1);
      if (containerRef.current) {
        containerRef.current.style.backgroundColor = '#E8E6E0';
      }
    }
  }, [ready, showSat, showSnakeView]);
  // Guided tour: auto-place the curated demo block when entering the boundary
  // step, so the user doesn't have to draw and the next steps (roads/buildings)
  // are guaranteed to find data. Real (non-demo) users still draw their own.
  const demoBndPlaced = useRef(false);
  useEffect(() => {
    if (isDemoMode && step === 3 && !boundaryClosed && !demoBndPlaced.current) {
      demoBndPlaced.current = true;
      onUpdateBoundary(DEMO_BOUNDARY.map(p => ({ ...p })), true);
      mapRef.current?.setView([DEMO_CENTER.lat, DEMO_CENTER.lng], 16);
    }
  }, [isDemoMode, step, boundaryClosed]);
  useEffect(() => {
    if(step===4&&boundaryClosed&&roads.length===0) {
      loadRd();
    }
  }, [step]);
  // Auto-detect buildings once when entering the symbols step, if none placed yet.
  const bldgTried = useRef(false);
  useEffect(() => {
    if (step === 5 && boundaryClosed && symbols.length === 0 && !bldgTried.current) {
      bldgTried.current = true;
      fetchBuildingsForBlock();
    }
  }, [step]);
  useEffect(() => { if(boundaryClosed&&boundaryPins.length>=4) onUpdateOrientation(getBestOrientation(boundaryPins)); }, [boundaryClosed]);
  useEffect(() => { if(step===6&&symbols.length>0){const bp=boundaryPins.length>=3?boundaryPins:undefined;const blksArg=numberingSystem==='boundary_serpentine'?undefined:(blocks.length>0?blocks:undefined);const p=generateSerpentinePath(symbols,blksArg,numberingSystem,bp);const o=getSerpentineOrder(symbols,blksArg,numberingSystem,bp);setSerpPath(p);setSerpOrd(o);if(step===6)setShowGuide(true);const f=o.find(id=>{const s=symbols.find(x=>x.id===id);return s&&isHouseType(s.symbol_type)&&s.number===null;});if(f)setSugId(f);}else if(step===6&&symbols.length===0){setSerpPath([]);} }, [step, numberingSystem, blocks, boundaryPins, symbols]);

  const autoFetchTriggered = useRef(false);
  useEffect(() => {
    if (boundaryClosed && boundaryPins.length >= 3 && isAutoFetched && !autoFetchTriggered.current) {
      autoFetchTriggered.current = true;
      if (onUpdateMapData) {
        onUpdateMapData({ isAutoFetched: false });
      }
      runAutoEnrichment();
    }
  }, [boundaryClosed, boundaryPins, isAutoFetched]);

  async function runAutoEnrichment() {
    if (boundaryPins.length < 3) return;
    setRdLoad(true);
    setBldgMsg('⏳ Satellite & OpenStreetMap data fetching...');
    try {
      const bb = getBbox(boundaryPins);
      const area = polygonArea(boundaryPins);
      const pad = 0.003;

      // Promise 1: Fetch Roads
      const roadsPromise = (async () => {
        try {
          const q = `[out:json][timeout:30][bbox:${bb.south - pad},${bb.west - pad},${bb.north + pad},${bb.east + pad}];
            (
              way["highway"];
              way["highway"~"footway|path|track|steps|cycleway|pedestrian|living_street"];
              way["footway"="crossing"];
              way["path"];
              way["track"];
            );
            out geom;`;
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const r = await fetchOverpass(q, controller.signal);
          clearTimeout(timeoutId);
          if (!r.ok) return [];
          const d = await r.json();
          const cl = clipRoadsToPolygon(d.elements || [], boundaryPins);
          return cl.map(c => ({
            id: crypto.randomUUID(),
            coords: c.coords,
            highway: c.highway,
            name: c.name,
            confirmed: false,
            source: 'osm' as const,
            osm_id: c.osm_id
          }));
        } catch (e) {
          console.warn("Auto roads fetch failed:", e);
          return [];
        }
      })();

      // Promise 2: Fetch Buildings
      const buildingsPromise = (async () => {
        try {
          const res = await supabase.functions.invoke('fetch-open-buildings', {
            body: {
              north: bb.north,
              south: bb.south,
              east: bb.east,
              west: bb.west,
              boundary: boundaryPins.map(p => ({ lat: p.lat, lng: p.lng })),
              useGoogle: true,
            }
          });
          if (res.error) return [];
          const all = res.data?.buildings || [];
          const valid = all.filter((b: any) => b.area_sqm == null || b.area_sqm > 5);
          return valid.map((b: any) => ({
            id: `building-${crypto.randomUUID()}`,
            symbol_type: (b.buildingType || 'pucca_house') as SymbolType,
            lat: b.lat, lng: b.lng,
            number: null,
            placed_at: new Date().toISOString(),
            auto_detected: true,
          }));
        } catch (e) {
          console.warn("Auto buildings fetch failed:", e);
          return [];
        }
      })();

      // Promise 3: Fetch Landcover & POIs
      const landcoverPromise = (async () => {
        const q = buildComprehensiveQuery(bb, 0.002);
        let res = { symbols: [] as any[], farmlands: [] as any[], waterBodies: [] as any[], forests: [] as any[], landmarks: [] as any[], landuseAreas: [] as any[], stats: { farmlandArea: 0 } };
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const r = await fetchOverpass(q, controller.signal);
          clearTimeout(timeoutId);
          if (r.ok) {
            const d = await r.json();
            res = processOverpassData(d.elements || [], boundaryPins, area);
          }
        } catch (e) {
          console.warn("Auto landcover OSM fetch failed:", e);
        }

        let finalLanduseAreas = res.landuseAreas;
        if (res.stats.farmlandArea < area * 0.4) {
          try {
            const resLandcover = await supabase.functions.invoke('fetch-landcover', {
              body: { north: bb.north, south: bb.south, east: bb.east, west: bb.west }
            });
            const lc = resLandcover.data;
            const rawAreas: any[] = lc?.landuseAreas
              ? lc.landuseAreas.map((l: any) => ({ type: l.type, points: l.points }))
              : (lc?.features || []).map((f: any) => ({
                  type: f.properties?.label || f.properties?.type || 'farmland',
                  points: (f.geometry?.coordinates?.[0] || []),
                }));
            const newAreas = rawAreas.filter((l) =>
              Array.isArray(l.points) && l.points.length >= 3 &&
              pointInPolygon({ lat: l.points[0][1], lng: l.points[0][0] }, boundaryPins)
            );
            if (newAreas.length) {
              finalLanduseAreas = [...finalLanduseAreas, ...newAreas.map((l) => ({
                type: l.type,
                points: l.points.map((p: any) => ({ lat: p[1], lng: p[0] }))
              }))];
            }
          } catch (e) {
            console.warn("Auto landcover Dynamic World fetch failed:", e);
          }
        }
        return { ...res, landuseAreas: finalLanduseAreas };
      })();

      const [fetchedRoads, fetchedBuildings, lcResult] = await Promise.all([
        roadsPromise,
        buildingsPromise,
        landcoverPromise
      ]);

      const combinedSymbols = [...fetchedBuildings, ...lcResult.symbols];

      if (onUpdateMapData) {
        onUpdateMapData({
          roads: fetchedRoads,
          symbols: combinedSymbols,
          farmlandBlocks: lcResult.farmlands,
          waterBodies: lcResult.waterBodies,
          forests: lcResult.forests,
          landuseAreas: lcResult.landuseAreas,
          landmarks: lcResult.landmarks
        });
      }

      setRdLoad(false);
      setBldgMsg(`✅ Auto-populated: ${fetchedRoads.length} roads, ${fetchedBuildings.length} buildings, ${lcResult.waterBodies.length} water bodies, ${lcResult.forests.length} forests, and ${lcResult.landmarks.length} landmarks.`);
    } catch (err) {
      setRdLoad(false);
      setBldgMsg('⚠️ Automatic population encountered some issues.');
      console.error("Auto enrichment pipeline error:", err);
    }
  }



  // ═══════════ FUNCTIONS ══════════════════════════════════
  async function loadRd() {
    if (boundaryPins.length < 3) return;
    setRdLoad(true);
    setRdErr('');
    try {
      const bb = getBbox(boundaryPins);
      const pad = 0.003;
      const q = `[out:json][timeout:30][bbox:${bb.south - pad},${bb.west - pad},${bb.north + pad},${bb.east + pad}];
        (
          way["highway"];
          way["highway"~"footway|path|track|steps|cycleway|pedestrian|living_street"];
          way["footway"="crossing"];
          way["path"];
          way["track"];
        );
        out geom;`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const r = await fetchOverpass(q, controller.signal);
      clearTimeout(timeoutId);
      if (!r.ok) throw new Error('Failed to fetch roads');
      const d = await r.json();
      const cl = clipRoadsToPolygon(d.elements || [], boundaryPins);
      console.log(`🗺️ [OSM] Loaded ${cl.length} roads for bounding box.`);
      if (cl.length === 0) {
        setRdErr('No roads found in this area. You can draw roads manually in the next step.');
      }
      onUpdateRoads(cl.map(c => ({
        id: crypto.randomUUID(),
        coords: c.coords,
        highway: c.highway,
        name: c.name,
        confirmed: false,
        source: 'osm' as const,
        osm_id: c.osm_id
      })));
    } catch (e) {
      console.warn("Road fetch failed (likely timeout). Returning empty roads.");
      setRdErr('Could not load roads from OSM. Please draw manually.');
    } finally {
      setRdLoad(false);
    }
  }

  async function fetchBuildingsForBlock(useGoogle = false) {
    if (boundaryPins.length < 3) return;
    setBldgMsg(useGoogle ? '🏠 Detecting buildings (incl. Google)…' : '🏠 Detecting buildings…');
    try {
      const bb = getBbox(boundaryPins);
      const res = await supabase.functions.invoke('fetch-open-buildings', {
        body: {
          north: bb.north,
          south: bb.south,
          east: bb.east,
          west: bb.west,
          boundary: boundaryPins.map(p => ({ lat: p.lat, lng: p.lng })),
          useGoogle,
        }
      });

      if (res.error) {
        setBldgMsg('⚠️ Building detection failed (network). Place houses manually.');
        console.error('fetch-open-buildings error:', res.error);
        return;
      }

      const all = res.data?.buildings || [];
      const src = res.data?.sources;
      // Edge function now filters to the boundary polygon, so we only drop sub-5 m² noise
      const valid = all.filter((b: any) => b.area_sqm == null || b.area_sqm > 5);

      const newSymbols: PlacedSymbol[] = valid.map((b: any) => ({
        id: `building-${crypto.randomUUID()}`,
        symbol_type: (b.buildingType || 'pucca_house') as SymbolType,  // Use OSM type if available
        lat: b.lat, lng: b.lng,
        number: null,
        placed_at: new Date().toISOString(),
        auto_detected: true,
      }));

      const srcTxt = src
        ? ` (MS ${src.microsoft?.count ?? 0} · OSM ${src.osm?.count ?? 0} · Google ${src.google?.count ?? 0})`
        : '';
      console.log(`🏢 [Open Buildings] ${all.length} fetched${srcTxt}, ${newSymbols.length} valid after noise filter.`, src);

      if (newSymbols.length > 0) {
        onUpdateSymbols([...symbols, ...newSymbols]);
        setBldgMsg(`✅ Detected ${newSymbols.length} buildings${srcTxt}. Tap any to edit; numbering happens in the next step.`);
      } else {
        setBldgMsg(`No buildings found here${srcTxt}. Try "Try Google too" for more coverage, or place houses manually.`);
      }
    } catch (err) {
      setBldgMsg('⚠️ Building detection failed. Place houses manually.');
      console.error('Failed to fetch open buildings:', err);
    }
  }

  async function autoDetectArea() {
    if (boundaryPins.length < 3) return;
    try {
      const bb = getBbox(boundaryPins);
      const q = buildComprehensiveQuery(bb, 0.002);
      const area = polygonArea(boundaryPins);
      let res = { symbols: [] as any[], farmlands: [] as any[], waterBodies: [] as any[], forests: [] as any[], landmarks: [] as any[], landuseAreas: [] as any[], stats: { farmlandArea: 0 } };
      
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const r = await fetchOverpass(q, controller.signal);
        clearTimeout(timeoutId);
        if (r.ok) {
          const d = await r.json();
          res = processOverpassData(d.elements || [], boundaryPins, area);
          console.log(`🗺️ [OSM] Auto-Detect found: ${res.symbols.length} POIs/buildings, ${res.farmlands.length} farms, ${res.waterBodies.length} water bodies, ${res.forests.length} forests, ${res.landmarks.length} landmarks. Total landuse coverage: ${(res.stats.farmlandArea / area * 100).toFixed(1)}%`);
        } else {
          console.warn("Overpass API returned non-OK status.");
        }
      } catch (err) {
        console.warn("Overpass API failed or timed out. Continuing with empty OSM data.", err);
      }
      
      setAutoData({
        buildings: res.symbols.length,
        farmlands: res.farmlands.length,
        water: res.waterBodies.length,
        forests: res.forests.length,
        landmarks: res.landmarks.length,
        total: res.symbols.length + res.farmlands.length + res.waterBodies.length + res.forests.length + res.landmarks.length,
        isVision: false
      });
      
      let finalLanduseAreas = [...(landuseAreas || []), ...res.landuseAreas];
      
      // Phase 4: Fallback to Google Dynamic World via Supabase Edge Function if OSM landuse coverage is low (< 40%)
      if (res.stats.farmlandArea < area * 0.4) {
        try {
          const resLandcover = await supabase.functions.invoke('fetch-landcover', {
            body: { north: bb.north, south: bb.south, east: bb.east, west: bb.west }
          });
          // The edge function returns GeoJSON { features: [...] }; older code expected
          // `landuseAreas`. Accept either shape so the fallback actually works.
          const lc = resLandcover.data;
          const rawAreas: any[] = lc?.landuseAreas
            ? lc.landuseAreas.map((l: any) => ({ type: l.type, points: l.points }))
            : (lc?.features || []).map((f: any) => ({
                type: f.properties?.label || f.properties?.type || 'farmland',
                // GeoJSON Polygon: coordinates[0] is the outer ring of [lng,lat] pairs.
                points: (f.geometry?.coordinates?.[0] || []),
              }));
          const newAreas = rawAreas.filter((l) =>
            Array.isArray(l.points) && l.points.length >= 3 &&
            pointInPolygon({ lat: l.points[0][1], lng: l.points[0][0] }, boundaryPins)
          );
          if (newAreas.length) {
            console.log(`🌍 [Dynamic World] ${newAreas.length} landuse polygons inside boundary.`);
            finalLanduseAreas = [...finalLanduseAreas, ...newAreas.map((l) => ({
              type: l.type,
              points: l.points.map((p: any) => ({ lat: p[1], lng: p[0] }))
            }))];
          }
        } catch (err) {
          console.error("Failed to fetch Google Dynamic World landcover:", err);
        }
      }

      if (onUpdateMapData) {
        onUpdateMapData({
          symbols: [...symbols, ...res.symbols],
          farmlandBlocks: [...farmlandBlocks, ...res.farmlands],
          waterBodies: [...waterBodies, ...res.waterBodies],
          forests: [...forests, ...res.forests],
          landuseAreas: finalLanduseAreas,
          landmarks: [...landmarks, ...res.landmarks]
        });
      } else {
        onUpdateSymbols([...symbols, ...res.symbols]);
        onUpdateFarmland([...farmlandBlocks, ...res.farmlands]);
        onUpdateLandmarks([...landmarks, ...res.landmarks]);
      }
      setAutoBanner(true);
      setHasAuto(true);
    } catch (e) {
      console.error(e);
      alert("An unexpected error occurred during auto-detect.");
    }
  }

  function acceptAuto() { setAutoBanner(false); setShowStats(true); }
  function rejectAuto() { setAutoBanner(false); }

  function addMk(sym:PlacedSymbol){
    const map=mapRef.current;
    if(!map||mks.current.has(sym.id))return;
    const lat = sym.lat ?? (sym as any).position?.lat;
    const lng = sym.lng ?? (sym as any).position?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) return;
    const m=L.marker([lat,lng],{icon:mkIcon(sym),interactive:true}).addTo(map);
    m.on('dblclick',()=>mkClickRef.current(sym.id, 'dblclick'));
    m.on('click',()=>mkClickRef.current(sym.id, 'click'));
    if (sym.label) {
      m.bindTooltip(sym.label, { direction: 'top', className: 'bg-white text-slate-800 text-[9px] font-semibold px-1 py-0.5 rounded shadow border border-slate-200' });
    }
    mks.current.set(sym.id,m);
  }
  function getAdaptiveSymbolSize(sym: PlacedSymbol, map: L.Map, allSymbols: PlacedSymbol[]): number {
    const lat = sym.lat ?? (sym as any).position?.lat;
    const lng = sym.lng ?? (sym as any).position?.lng;
    if (typeof lat !== 'number' || typeof lng !== 'number') return 24;
    
    const p = map.latLngToLayerPoint([lat, lng]);
    let minDist = Infinity;
    for (const other of allSymbols) {
      if (other.id === sym.id) continue;
      const olat = other.lat ?? (other as any).position?.lat;
      const olng = other.lng ?? (other as any).position?.lng;
      if (typeof olat !== 'number' || typeof olng !== 'number') continue;
      
      const op = map.latLngToLayerPoint([olat, olng]);
      const d = Math.hypot(p.x - op.x, p.y - op.y);
      if (d < minDist) minDist = d;
    }
    
    // Size is 50% of local spacing in pixels, clamped to [10px, 20px]
    // 50% (not 75%) guarantees visible white space between every neighbour pair
    return minDist < Infinity ? Math.max(10, Math.min(20, minDist * 0.50)) : 20;
  }

  function mkIcon(sym:PlacedSymbol):L.DivIcon{
    const isS=sym.id===sugId;const u=getUnitCount(sym);
    const nl=sym.number!==null?(numberingSystem === 'census_u_loop'?(u>1?`${sym.number}(${u})`:String(sym.number)):(u>1?`${sym.number}-${sym.number+u-1}`:String(sym.number))):'';
    const rh=isS?`<div style="position:absolute;top:-10px;left:-10px;width:44px;height:44px;border:3px solid #0066FF;border-radius:50%;pointer-events:none;animation:guidePulse 1.5s infinite"></div>`:'';
    
    // Road/Block-aligned rotation for house types
    let angle = getBlockOrientation(sym, blocks || []);
    if (angle === null) {
      angle = findNearestRoadBearing(sym, roads || []);
    }
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    const rot = (angle * 180) / Math.PI;
    const rotStyle = rot !== 0 ? `transform:rotate(${rot}deg);` : '';

    const map = mapRef.current;
    const isLandmark = !isHouseType(sym.symbol_type);
    const size = map && !isLandmark ? getAdaptiveSymbolSize(sym, map, symbols) : 24;
    const sizeI = Math.round(size);
    const svg = getSmallSymbolSVG(sym.symbol_type, false, nl);

    let iconHtml = '';
    if (isLandmark) {
      iconHtml = `<div style="position:relative;cursor:pointer;${rotStyle}">${svg}${rh}</div>`;
    } else {
      iconHtml = `<div style="position:relative;cursor:pointer;${rotStyle} width:${sizeI}px; height:${sizeI}px; display:flex; align-items:center; justify-content:center;">` +
        `<svg width="${sizeI}" height="${sizeI}" viewBox="0 0 24 24" style="display:block;overflow:visible">${svg.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</svg>` +
        `${rh}</div>`;
    }

    const iconH = isLandmark ? (sym.number !== null ? 34 : 24) : sizeI;

    return L.divIcon({
      html: iconHtml,
      className: '',
      iconSize: [isLandmark ? 24 : sizeI, iconH],
      iconAnchor: [isLandmark ? 12 : sizeI / 2, iconH / 2]
    });
  }
  function refreshMk(sym:PlacedSymbol){const m=mks.current.get(sym.id);if(m)m.setIcon(mkIcon(sym));}

  function dropPin(){onUpdateBoundary([...boundaryPins,{...cross}],false);try{navigator.vibrate?.(50);}catch{}setShowHelp(false);}
  function undoPin(){if(boundaryPins.length)onUpdateBoundary(boundaryPins.slice(0,-1),false);}
  function closePoly(){
    if(boundaryPins.length<4)return;
    if(isPolygonSelfIntersecting(boundaryPins)){
      alert('⚠️ Boundary cannot cross itself (self-intersecting polygon). Please redraw without overlapping lines.');
      return;
    }
    onUpdateBoundary([...boundaryPins],true);
    mapRef.current?.fitBounds(L.latLngBounds(boundaryPins.map(p=>L.latLng(p.lat,p.lng))),{padding:[40,40]});
  }
  function confirmAll(){onUpdateRoads(roads.map(r=>({...r,confirmed:true})));}
  function confirmOne(){if(revIdx>=roads.length)return;const u=[...roads];u[revIdx]={...u[revIdx],confirmed:true};onUpdateRoads(u);setRevIdx(revIdx<roads.length-1?revIdx+1:revIdx);if(revIdx>=roads.length-1)setRevMode(false);}
  function deleteOne(){const u=roads.filter((_,i)=>i!==revIdx);onUpdateRoads(u);if(revIdx>=u.length)setRevMode(false);else setRevIdx(Math.min(revIdx,u.length-1));}
  function addRoadPoint(coord:Coordinate){const pts=[...drwPts,coord];setDrwPts(pts);drwGrp.current.clearLayers();pts.forEach((c,i)=>{drwGrp.current.addLayer(L.circleMarker([c.lat,c.lng],{radius:6,color:'#0066FF',fillColor:'#0066FF',fillOpacity:1}));drwGrp.current.addLayer(L.marker([c.lat,c.lng],{icon:L.divIcon({html:`<div style="color:white;font:bold 9px sans-serif;text-align:center;line-height:12px;width:12px;height:12px">${i+1}</div>`,className:'',iconSize:[12,12],iconAnchor:[6,6]}),interactive:false}));});if(pts.length>=2)drwGrp.current.addLayer(L.polyline(pts.map(c=>[c.lat,c.lng]),{color:'#0066FF',weight:3}));}
  function addDPt(){addRoadPoint({...cross});}
  function undoDrwPt(){if(!drwPts.length)return;const pts=drwPts.slice(0,-1);setDrwPts(pts);drwGrp.current.clearLayers();pts.forEach((c,i)=>{drwGrp.current.addLayer(L.circleMarker([c.lat,c.lng],{radius:6,color:'#0066FF',fillColor:'#0066FF',fillOpacity:1}));});if(pts.length>=2)drwGrp.current.addLayer(L.polyline(pts.map(c=>[c.lat,c.lng]),{color:'#0066FF',weight:3}));}
  function finDrwRd(){if(drwPts.length<2)return;onUpdateRoads([...roads,{id:crypto.randomUUID(),coords:drwPts,highway:drwType,confirmed:true,source:'user'}]);setDrwRd(false);setDrwPts([]);drwGrp.current.clearLayers();}
  function selSymbol(t:SymbolType){if(selSym===t){setSelSym(null);setPlacing(false);setPanelOpen(true);return;}setSelSym(t);setPlacing(true);setPanelOpen(false);setDrawMode('none');}
  function cancelPlacing(){setSelSym(null);setPlacing(false);setPanelOpen(true);}
  function startFarmDraw(){setDrawMode('farmland');setPolyPts([]);setPanelOpen(false);setPlacing(false);setSelSym(null);drwGrp.current.clearLayers();}
  function startBlkDraw(){setDrawMode('block');setPolyPts([]);setPanelOpen(false);setPlacing(false);setSelSym(null);drwGrp.current.clearLayers();}
  function undoPolyPt(){const pts=polyPts.slice(0,-1);setPolyPts(pts);renderDrawPoly(pts);}
  function closePolyDraw(){if(polyPts.length<3)return;if(drawMode==='farmland'){onUpdateFarmland([...farmlandBlocks,{id:crypto.randomUUID(),label:farmLbl,points:[...polyPts]}]);setFarmLbl(String.fromCharCode(farmLbl.charCodeAt(0)+1));}else{const bb=getBbox(polyPts);onUpdateBlocks([...blocks,{id:crypto.randomUUID(),label:blkLbl,south:bb.south,north:bb.north,west:bb.west,east:bb.east,points:[...polyPts]}]);setBlkLbl(String.fromCharCode(blkLbl.charCodeAt(0)+1));setShowBlk(true);}setDrawMode('none');setPolyPts([]);setPanelOpen(true);drwGrp.current.clearLayers();}
  function cancelDraw(){setDrawMode('none');setPolyPts([]);setPanelOpen(true);drwGrp.current.clearLayers();}
  function autoNum(){
    const bp=boundaryPins.length>=3?boundaryPins:undefined;
    const blksArg=numberingSystem==='boundary_serpentine'?undefined:(blocks.length>0?blocks:undefined);
    const o=getSerpentineOrder(symbols,blksArg,numberingSystem,bp);
    // Always sync serpPath with the exact same computation so START/END badges stay correct.
    const freshPath=generateSerpentinePath(symbols,blksArg,numberingSystem,bp);
    setSerpPath(freshPath);
    const u=symbols.map(s=>({...s}));
    let n=1;
    for(const id of o){
      const s=u.find(x=>x.id===id);
      if(!s)continue;
      s.number=n;
      n+=(numberingSystem === 'census_u_loop' ? 1 : getUnitCount(s));
    }
    onUpdateSymbols(u);
    setNextNum(n);
    numHist.current=o;
    setTimeout(()=>u.forEach(s=>refreshMk(s)),10);
  }
  function clearNum(){const u=symbols.map(s=>({...s,number:null}));onUpdateSymbols(u);setNextNum(1);numHist.current=[];setSugId(null);setSerpPath([]);setTimeout(()=>u.forEach(s=>refreshMk(s)),10);}
  function undoNum(){
    if(!numHist.current.length)return;
    const id=numHist.current.pop()!;
    const sym = symbols.find(s=>s.id===id);
    if(!sym)return; // Symbol was deleted, skip undo
    const u=symbols.map(s=>s.id===id?{...s,number:null}:s);
    refreshMk(u.find(s=>s.id===id)!);
    setNextNum(n=>n-(numberingSystem === 'census_u_loop' ? 1 : getUnitCount(sym)));
    onUpdateSymbols(u);
    setTimeout(()=>u.forEach(s=>refreshMk(s)),10);
  }

  // ═══════════ PANELS ═════════════════════════════════════
  // ─── UNIFIED BOTTOM SHEET ───────────────────────────────
  // One consistent shell for every step. Three fixed zones:
  //  1) grabber + title + status — ALWAYS visible, tap to expand/collapse
  //     (so the sheet can never become an unreachable dead handle),
  //  2) scrollable body — secondary controls only (capped height),
  //  3) pinned footer — the primary CTA, always visible regardless of scroll.
  function Sheet({ icon, title, status, statusTone = 'default', children, footer }:{
    icon: string; title: string; status?: string;
    statusTone?: 'default' | 'green' | 'blue' | 'red';
    children?: React.ReactNode; footer?: React.ReactNode;
  }){
    const tone = statusTone === 'green' ? 'bg-green-100 text-green-700'
      : statusTone === 'blue' ? 'bg-blue-100 text-blue-700'
      : statusTone === 'red' ? 'bg-red-100 text-red-700'
      : 'bg-[var(--color-saffron)]/12 text-[var(--color-saffron)]';
    return (
      <div className="absolute bottom-0 left-0 right-0 z-[1002] pointer-events-auto font-noto-sans" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="bg-[var(--color-warm-paper)] rounded-t-[24px] shadow-[var(--shadow-warm-2)] border-t border-[var(--color-saffron)]/15 flex flex-col">
          <button onClick={() => setPanelOpen(o => !o)} className="w-full pt-2 pb-2 px-4 active:bg-black/[0.02] transition-colors">
            <div className="w-10 h-1.5 rounded-full bg-gray-300 mx-auto mb-2" />
            <div className="flex items-center gap-2">
              <span className="text-base leading-none">{icon}</span>
              <span className="font-bold text-[var(--color-charcoal)] font-public-sans text-sm">{title}</span>
              {status && <span className={`ml-auto text-[11px] font-bold px-2 py-0.5 rounded-full ${tone}`}>{status}</span>}
              <span className={`${status ? 'ml-1.5' : 'ml-auto'} text-gray-400 text-sm transition-transform ${panelOpen ? 'rotate-180' : ''}`}>⌄</span>
            </div>
          </button>
          {panelOpen && children && <div className="px-4 pb-1 overflow-y-auto max-h-[42vh]">{children}</div>}
          {footer && <div className="px-4 pt-2.5 pb-3">{footer}</div>}
        </div>
      </div>
    );
  }
  function Btn({children,onClick,disabled,green}:{children:React.ReactNode;onClick:()=>void;disabled?:boolean;green?:boolean}){return <button onClick={onClick} disabled={disabled} className={`w-full font-public-sans font-bold text-white rounded-full transition-all active:scale-[0.97] min-h-[52px] ${disabled?'bg-gray-300 cursor-not-allowed':green?'bg-[var(--color-india-green)] shadow-[var(--shadow-warm-1)]':'bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] shadow-[var(--shadow-warm-1)]'}`}>{children}</button>;}

  // ─── DETECTION RESULTS BANNER ───────────────────────────
  function detectionBanner(){
    if(!autoBanner||!autoData)return null;
    return <div className="absolute bottom-0 left-0 right-0 z-[1003]">
      <div className="bg-white rounded-t-[20px] shadow-[0_-4px_20px_rgba(0,0,0,0.2)] px-4 py-4 max-h-[60vh] overflow-auto">
        <div className="flex justify-center mb-2"><div className="w-10 h-1 rounded-full bg-gray-300"/></div>
        <div className="bg-green-50 rounded-xl p-3 mb-3">
          <p className="text-sm font-bold text-green-800 mb-1">{autoData.isVision ? '✨ AI Vision Analysis Complete!' : '🗺️ Area Analysis Complete!'}</p>
          <p className="text-xs text-green-600">क्षेत्र का पूरा डेटा मिल गया</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-blue-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-blue-700">{autoData.buildings}</p><p className="text-[10px] text-blue-600">Buildings</p></div>
          <div className="bg-green-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-green-700">{autoData.farmlands}</p><p className="text-[10px] text-green-600">Farms</p></div>
          <div className="bg-cyan-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-cyan-700">{autoData.water}</p><p className="text-[10px] text-cyan-600">Water</p></div>
          <div className="bg-emerald-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-emerald-700">{autoData.forests}</p><p className="text-[10px] text-emerald-600">Forests</p></div>
          <div className="bg-amber-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-amber-700">{autoData.landmarks}</p><p className="text-[10px] text-amber-600">Landmarks</p></div>
          <div className="bg-purple-50 rounded-lg p-2 text-center"><p className="text-lg font-bold text-purple-700">{autoData.total}</p><p className="text-[10px] text-purple-600">Total Features</p></div>
        </div>
        {areaStats && <div className="bg-gray-50 rounded-lg p-2 mb-3 text-xs text-gray-600">
          <p>Area: ~{areaT} • Density: {areaStats.density} houses/ha • Roads: {areaStats.roads}</p>
        </div>}
        <div className="flex gap-2">
          <button onClick={acceptAuto} className="flex-1 py-3 bg-green-500 text-white rounded-xl font-bold text-sm">✓ Looks Good — Accept All</button>
          <button onClick={rejectAuto} className="px-4 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm">✕</button>
        </div>
      </div>
    </div>;
  }

  // ─── SMART CROP ─────────────────────────────────────────
  function handleSmartCrop() {
    const map = mapRef.current;
    if (!map) return;
    const pts = symbols.filter(s => s.lat && s.lng);
    if (pts.length < 2) { alert('Place at least 2 symbols first to use Smart Crop.'); return; }

    // Compute tight bounds around all symbols
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const s of pts) {
      if (s.lat < minLat) minLat = s.lat; if (s.lat > maxLat) maxLat = s.lat;
      if (s.lng < minLng) minLng = s.lng; if (s.lng > maxLng) maxLng = s.lng;
    }

    // Pad by 30% of the symbol spread in each axis
    const latPad = Math.max((maxLat - minLat) * 0.3, 0.0005);
    const lngPad = Math.max((maxLng - minLng) * 0.3, 0.0005);
    const cropBounds = L.latLngBounds(
      [minLat - latPad, minLng - lngPad],
      [maxLat + latPad, maxLng + lngPad]
    );

    // Check if symbols already fill most of the boundary (>75% of its bbox)
    if (boundaryClosed && boundaryPins.length >= 3) {
      let bMinLat = Infinity, bMaxLat = -Infinity, bMinLng = Infinity, bMaxLng = -Infinity;
      for (const p of boundaryPins) {
        if (p.lat < bMinLat) bMinLat = p.lat; if (p.lat > bMaxLat) bMaxLat = p.lat;
        if (p.lng < bMinLng) bMinLng = p.lng; if (p.lng > bMaxLng) bMaxLng = p.lng;
      }
      const bndArea = (bMaxLat - bMinLat) * (bMaxLng - bMinLng);
      const symArea = (maxLat - minLat + latPad * 2) * (maxLng - minLng + lngPad * 2);
      if (bndArea > 0 && symArea / bndArea > 0.75) {
        alert('Map is already well-populated — no large empty areas detected.'); return;
      }
    }

    map.fitBounds(cropBounds, { animate: true, padding: [16, 16] });
    map.once('moveend', () => { setCropZoom(map.getZoom()); });
    setIsCropped(true);
  }

  function handleCropReset() {
    const map = mapRef.current;
    if (!map) return;
    if (boundaryClosed && boundaryPins.length >= 3) {
      const ll = boundaryPins.map(p => L.latLng(p.lat, p.lng));
      map.fitBounds(L.latLngBounds(ll), { animate: true, padding: [24, 24] });
    } else {
      map.setView([center.lat, center.lng], 17, { animate: true });
    }
    setIsCropped(false);
    setCropZoom(null);
  }

  // ─── STATS TOGGLE ───────────────────────────────────────
  function statsPanel(){
    if(!showStats||!areaStats)return null;
    return <div className="absolute top-14 left-2 right-2 z-[1001] pointer-events-auto">
      <div className="bg-white/95 backdrop-blur rounded-xl shadow-lg p-3 text-xs">
        <div className="flex items-center justify-between mb-2"><span className="font-bold text-gray-800">📊 Area Stats</span><button onClick={()=>setShowStats(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
        <div className="grid grid-cols-4 gap-1">
          <div className="text-center"><p className="font-bold text-blue-700">{areaStats.houses+areaStats.apartments}</p><p className="text-[9px] text-gray-500">Houses</p></div>
          <div className="text-center"><p className="font-bold text-green-700">{areaStats.farmlandCount}</p><p className="text-[9px] text-gray-500">Farms</p></div>
          <div className="text-center"><p className="font-bold text-cyan-700">{areaStats.waterBodies}</p><p className="text-[9px] text-gray-500">Water</p></div>
          <div className="text-center"><p className="font-bold text-purple-700">{areaStats.density}</p><p className="text-[9px] text-gray-500">/ha</p></div>
        </div>
      </div>
    </div>;
  }

  function pBnd(){
    if(boundaryClosed) return (
      <Sheet icon="📐" title="Boundary" status={`Set · ~${areaT}`} statusTone="green"
        footer={<Btn green onClick={onStepComplete}>Continue to Roads →</Btn>}>
        <div className="text-center py-3">
          <div className="text-green-600 text-3xl mb-1">✓</div>
          <p className="text-sm font-semibold text-[var(--color-charcoal)]">Boundary set · ~{areaT}</p>
          <p className="text-xs text-gray-500 mt-1">Tap Continue, or reopen to adjust corners.</p>
        </div>
      </Sheet>
    );
    const ready = boundaryPins.length >= 4;
    return (
      <Sheet icon="📍" title="Draw Boundary" status={`${boundaryPins.length}/4 pins`}
        footer={
            <div className="flex gap-2">
              <button onClick={dropPin} className="flex-1 min-h-[52px] rounded-full font-bold text-white bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] shadow-[var(--shadow-warm-1)] active:scale-[0.97] transition-all">📍 Drop Pin</button>
              <button onClick={closePoly} disabled={!ready} className={`flex-1 min-h-[52px] rounded-full font-bold text-white active:scale-[0.97] transition-all ${ready ? 'bg-[var(--color-india-green)] shadow-[var(--shadow-warm-1)]' : 'bg-gray-300 cursor-not-allowed'}`}>Close →</button>
            </div>
          }>
        <p className="text-xs text-gray-500 font-mono text-center mb-2">{cross.lat.toFixed(5)}°N {cross.lng.toFixed(5)}°E</p>
        <p className="text-xs text-gray-600 text-center mb-3">Pan the map so the crosshair sits on a corner, then tap <strong>Drop Pin</strong>. Add at least 4 corners, then <strong>Close</strong>.</p>
        {boundaryPins.length>0 && <button onClick={undoPin} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-600 active:scale-[0.98]">↩ Undo last pin</button>}
      </Sheet>
    );
  }

  function pRd(){
    const status = rdLoad ? 'Loading…' : rdErr ? 'Error' : drwRd ? `Drawing · ${drwPts.length} pts` : `${roads.length} found`;
    // Footer adapts: while drawing a road the key actions are Cancel/Finish;
    // otherwise the advancing CTA is "Roads Done".
    const footer = drwRd ? (
      <div className="flex gap-2">
        <button onClick={()=>{setDrwRd(false);setDrwPts([]);drwGrp.current.clearLayers();}} className="px-4 min-h-[52px] rounded-full font-semibold bg-white border border-gray-200 text-gray-600">Cancel</button>
        <button onClick={finDrwRd} disabled={drwPts.length<2} className={`flex-1 min-h-[52px] rounded-full font-bold text-white active:scale-[0.97] ${drwPts.length>=2 ? 'bg-[var(--color-india-green)] shadow-[var(--shadow-warm-1)]' : 'bg-gray-300'}`}>✓ Finish Road</button>
      </div>
    ) : <Btn green onClick={onStepComplete}>Roads Done →</Btn>;

    let body: React.ReactNode;
    if(rdLoad){
      body = <div className="flex flex-col items-center py-5 gap-3"><svg className="animate-spin h-8 w-8 text-[var(--color-saffron)]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><p className="text-sm text-gray-600">Fetching roads from OpenStreetMap…</p></div>;
    } else if(rdErr){
      body = <div><p className="text-sm text-red-600 text-center mb-2">{rdErr}</p><div className="flex gap-2"><button onClick={loadRd} className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold text-sm min-h-[52px]">Retry</button></div></div>;
    } else if(revMode && roads.length>0){
      const r = roads[revIdx];
      body = <div><p className="text-sm font-semibold mb-2 text-center">Road {revIdx+1}/{roads.length}: <span className="text-[var(--color-saffron)]">{r.highway}</span></p><div className="flex gap-2"><button onClick={confirmOne} className="flex-1 py-3 bg-[var(--color-india-green)] text-white rounded-full font-bold text-sm min-h-[52px]">✓ Keep</button><button onClick={deleteOne} className="flex-1 py-3 bg-red-500 text-white rounded-full font-bold text-sm min-h-[52px]">✗ Delete</button></div><button onClick={()=>setRevMode(false)} className="w-full text-center text-sm text-gray-400 mt-2 py-2">Done reviewing</button></div>;
    } else if(drwRd){
      body = <div><p className="text-xs text-gray-600 text-center mb-2">Tap along the road on the map to place points.</p><label className="block text-xs font-semibold text-gray-700 mb-1">Road type</label><select value={drwType} onChange={e=>setDrwType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-2 bg-white">{['residential','primary','secondary','tertiary','footway','track'].map(t=><option key={t} value={t}>{t}</option>)}</select>{drwPts.length>0&&<button onClick={undoDrwPt} className="w-full py-2.5 rounded-xl text-sm font-semibold bg-white border border-gray-200 text-gray-600">↩ Undo last point</button>}</div>;
    } else {
      body = <div className="space-y-2">
        <p className="text-xs text-gray-600 text-center">{roads.length} road{roads.length===1?'':'s'} fetched. Confirm them all, review one by one, or draw a missing lane.</p>
        {roads.length>0 && <div className="flex gap-2"><button onClick={confirmAll} className="flex-1 py-3 bg-[var(--color-india-green)] text-white rounded-full font-bold text-sm min-h-[52px]">✓ Confirm All</button><button onClick={()=>{setRevMode(true);setRevIdx(0);}} className="flex-1 py-3 bg-blue-500 text-white rounded-full font-bold text-sm min-h-[52px]">Review</button></div>}
        <button onClick={()=>{setDrwRd(true);setDrwPts([]);drwGrp.current.clearLayers();}} className="w-full py-3 rounded-full text-sm font-semibold text-gray-600 bg-white border-2 border-[var(--color-saffron)]/20 hover:bg-[var(--color-saffron)]/5 min-h-[52px]">✏️ Draw Road Manually</button>
      </div>;
    }
    return <Sheet icon="🛣️" title="Roads" status={status} footer={footer}>{body}</Sheet>;
  }

  function pSymFull(){
    return (
      <Sheet icon="🏠" title="Buildings & Symbols" status={`${totH} house${totH===1?'':'s'}`}
        footer={
          <div className="space-y-1.5">
            {/* Apartment units stay reachable even while placing (sheet collapsed) */}
            {selSym === 'apartment' && (
              <div className="flex items-center justify-center gap-2 bg-orange-50 rounded-xl px-3 py-2 border border-orange-200">
                <span className="text-xs font-bold text-gray-700">Units / apartment:</span>
                <button onClick={()=>setAptUnits(u=>Math.max(1,u-1))} className="text-lg font-bold w-8 h-8 bg-white rounded shadow-sm text-gray-700">−</button>
                <span className="text-lg font-bold text-orange-600 w-8 text-center">{aptUnits}</span>
                <button onClick={()=>setAptUnits(u=>Math.min(30,u+1))} className="text-lg font-bold w-8 h-8 bg-white rounded shadow-sm text-gray-700">+</button>
              </div>
            )}
            {placing && selSym && <button onClick={cancelPlacing} className="w-full py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-600">✕ Stop placing {SYMBOL_DEFS.find(d=>d.type===selSym)?.labelHi}</button>}
            <Btn green disabled={totH===0} onClick={onStepComplete}>{totH>0 ? `नंबरिंग करें →` : 'मकान डालें, फिर नंबर दें'}</Btn>
            <button onClick={onJumpToPreview} className="w-full py-1.5 text-xs text-gray-500 font-bold">Preview छोड़ें →</button>
          </div>
        }>
        {bldgMsg && (
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-3">
            <p className="flex-1 text-xs font-semibold text-blue-800">{bldgMsg}</p>
            <button onClick={() => setBldgMsg('')} className="text-blue-400 font-black text-sm leading-none" aria-label="Dismiss">×</button>
          </div>
        )}

        {/* Symbol picker */}
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">मकान / घर का प्रकार चुनें</p>
        <SymbolDrawer selectedType={selSym} onSelect={selSymbol} placedCount={symbols.length} />

        {/* Auto + draw tools */}
        <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mt-3 mb-1.5">मकान डालें / Add Buildings</p>
        <button
          onClick={() => fetchBuildingsForBlock(false)}
          className="w-full py-3 rounded-xl text-sm font-bold bg-[var(--color-saffron-container)] text-white shadow mb-2"
        >🏠 मकान खोजें / Auto-detect buildings</button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => fetchBuildingsForBlock(true)}
            className="py-2.5 rounded-xl text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200"
            title="Google has more buildings but may over-detect in dense areas"
          >📡 Google से भी</button>
          {!hasAuto
            ? <button onClick={autoDetectArea} className="py-2.5 rounded-xl text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">🗺️ Area detect</button>
            : <button onClick={() => { setDrawMode('label'); setPanelOpen(false); setPlacing(false); setSelSym(null); }} className="py-2.5 rounded-xl text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">🏷️ Place Name</button>}
          <button onClick={startFarmDraw} className="py-2.5 rounded-xl text-xs font-semibold bg-green-50 text-green-700 border border-green-200">🌾 खेत</button>
          <button onClick={startBlkDraw} className="py-2.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">🔲 Block</button>
        </div>

        {/* Delete tools */}
        {symbols.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">Remove symbols</p>
            {!selectDeleteMode ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setSelectDeleteMode(true); setSelectedForDelete(new Set()); setPlacing(false); setSelSym(null); }}
                  className="py-2.5 rounded-xl text-xs font-bold bg-red-50 text-red-600 border border-red-200"
                >☑ Select &amp; Delete</button>
                <button
                  onClick={() => { if (window.confirm(`Remove all ${symbols.length} symbols from the map?`)) { onUpdateSymbols([]); } }}
                  className="py-2.5 rounded-xl text-xs font-bold bg-red-50 text-red-600 border border-red-200"
                >🗑 Clear All</button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[10px] text-gray-500 text-center">Tap symbols on the map to select them</p>
                <div className="flex gap-2">
                  <button
                    disabled={selectedForDelete.size === 0}
                    onClick={() => {
                      const ids = selectedForDelete;
                      ids.forEach(id => { const m = mks.current.get(id); if (m) { m.remove(); mks.current.delete(id); } });
                      onUpdateSymbols(symbols.filter(s => !ids.has(s.id)));
                      setSelectedForDelete(new Set());
                      setSelectDeleteMode(false);
                    }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-red-500 text-white disabled:opacity-40"
                  >Delete {selectedForDelete.size > 0 ? `(${selectedForDelete.size})` : ''}</button>
                  <button
                    onClick={() => { setSelectDeleteMode(false); setSelectedForDelete(new Set()); }}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200"
                  >Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}
      </Sheet>
    );
  }

  function rightSidebar() {
    return (
      <>
        {/* Sidebar Overlay */}
        {showSidebar && <div className="fixed inset-0 bg-black/50 z-[1100] transition-opacity" onClick={() => setShowSidebar(false)} />}
        
        {/* Sliding Sidebar */}
        <div className={`fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-[1101] transform transition-transform duration-300 ease-out flex flex-col ${showSidebar ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="p-4 border-b flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-gray-800">Map Data & Zones</h2>
            <button onClick={() => setShowSidebar(false)} className="text-gray-500 hover:bg-gray-200 w-8 h-8 flex items-center justify-center rounded-full">✕</button>
          </div>
          <div className="p-4 overflow-auto flex-1 space-y-5">

            {/* View controls */}
            <div>
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">View</h4>
              <div className="flex gap-2">
                {areaStats&&<button onClick={()=>setShowStats(s=>!s)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--color-warm-paper)] text-gray-700 border border-[var(--color-saffron)]/20 min-h-[48px]">📊 Stats</button>}
                {symbols.length>15&&<button onClick={()=>{if(!showBlk&&!blocks.length)onUpdateBlocks(generateBlocks(boundaryPins,symbols.length));setShowBlk(!showBlk);}} className={`flex-1 py-3 rounded-xl text-sm font-semibold min-h-[48px] ${showBlk?'bg-blue-100 text-blue-700 border border-blue-300':'bg-gray-100 text-gray-600 border border-gray-200'}`}>{showBlk?'Hide Blocks':'Show Blocks'}</button>}
              </div>
              {!areaStats && symbols.length<=15 && <p className="text-xs text-gray-400">Stats and block grouping appear once you have area data and enough houses.</p>}
            </div>

            {/* Drawn Zones Management */}
            {(blocks.length > 0 || farmlandBlocks.length > 0) && (
              <div>
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Drawn zones</h4>
                <div className="space-y-1.5">
                  {blocks.map(b => (
                    <div key={b.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-sm">
                      <span className="text-xs font-bold text-blue-700 truncate font-noto-sans">🔲 Block {b.label}</span>
                      <button onClick={() => onUpdateBlocks(blocks.filter(x => x.id !== b.id))} className="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-[10px] font-bold">Delete</button>
                    </div>
                  ))}
                  {farmlandBlocks.map(f => (
                    <div key={f.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-gray-100 shadow-sm">
                      <span className="text-xs font-bold text-green-700 truncate font-noto-sans">🌾 Farm {f.label}</span>
                      <button onClick={() => onUpdateFarmland(farmlandBlocks.filter(x => x.id !== f.id))} className="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-[10px] font-bold">Delete</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Landmarks Checklist */}
            {landmarks.length > 0 && (
              <div>
                <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">Places for PDF</h4>
                <div className="bg-[var(--color-warm-paper)] rounded-[16px] p-3 border border-[var(--color-saffron)]/20">
                  {landmarks.map(lm => (
                    <label key={lm.id} className="flex items-center gap-2 mb-1">
                      <input type="checkbox" checked={lm.selectedForPdf !== false} onChange={(e) => { const u = landmarks.map(l => l.id === lm.id ? { ...l, selectedForPdf: e.target.checked } : l); onUpdateLandmarks(u); }} className="rounded text-[var(--color-saffron)] w-4 h-4" />
                      <span className="text-xs text-[var(--color-charcoal)] truncate font-noto-sans">{lm.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </>
    );
  }

  function pNumFull(){
    const done = numDone===totH && totH>0;
    const hintText = numDone === 0
      ? 'नीचे Auto-Number दबाएं → सब मकानों को क्रम से नंबर मिलेंगे'
      : done
        ? `सभी ${totH} मकान नंबर हो गए ✓`
        : `${totH - numDone} मकान बाकी हैं`;
    return (
      <Sheet icon="🔢" title="नंबरिंग / Numbering" status={`${numDone}/${totH}`} statusTone={done ? 'green' : 'default'}
        footer={
          <div className="space-y-1.5">
            {done
              ? <Btn green onClick={onStepComplete}>नक्शा देखें →</Btn>
              : <Btn onClick={autoNum}>⚡ सब नंबर करें</Btn>}
            {!done && <button onClick={onJumpToPreview} className="w-full py-1.5 text-xs text-gray-500 font-bold">Preview छोड़ें →</button>}
          </div>
        }>
        {done
          ? <div className="text-center py-2"><div className="text-green-500 text-2xl">✓</div><p className="text-sm font-semibold text-green-700">{totH} मकान नंबर हो गए ({totU} units)</p></div>
          : <p className="text-xs text-gray-600 text-center mb-3"><span className="font-bold text-blue-600">{numDone}</span> / {totH} नंबर हुए। {editMode ? 'नक्शे पर मकान tap करें → नंबर हटाएं।' : 'मकान tap करें नंबर दें, या नीचे Auto-Number दबाएं।'}</p>}

        <div className="space-y-2">
          <div className="bg-white rounded-xl p-3 border border-gray-100 space-y-3">
            <p className="text-[11px] text-blue-600 font-semibold bg-blue-50 rounded-lg px-2 py-1.5">{hintText}</p>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">नंबरिंग का तरीका / Numbering System</label>
              <select
                value={numberingSystem || 'serpentine'}
                onChange={(e) => {
                  const val = e.target.value as 'serpentine' | 'census_u_loop' | 'boundary_serpentine';
                  if (onUpdateMapData) {
                    onUpdateMapData({ numberingSystem: val });
                  }
                }}
                className="w-full border border-gray-200 rounded-lg p-2 text-xs bg-gray-50 text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-saffron)]"
              >
                <option value="serpentine">🏘️ गली दर गली / Street by street (block-wise)</option>
                <option value="census_u_loop">🏛️ जनगणना क्रम / Census houselisting (U-loop)</option>
                <option value="boundary_serpentine">🗺️ पूरे क्षेत्र में / Whole area NW→SE</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Next Number to Assign</label>
              <input
                type="number"
                min="1"
                value={nextNum}
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  if (!isNaN(val) && val > 0) {
                    setNextNum(val);
                  }
                }}
                className="w-full border border-gray-200 rounded-lg p-2 text-xs bg-gray-50 text-gray-700 font-semibold focus:outline-none focus:ring-1 focus:ring-[var(--color-saffron)]"
              />
              {symbols.some(s => s.number === nextNum) && (
                <p className="text-[10px] text-red-500 font-medium">⚠️ Number {nextNum} is already assigned to a house.</p>
              )}
            </div>
          </div>
          {serpPath.length>1 && (
            <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-gray-100">
              <span className="text-xs font-bold text-red-700">🐍 नंबरिंग रास्ता दिखाएं</span>
              <button onClick={()=>setShowGuide(g=>!g)} className={`px-3 py-1 rounded-full text-xs font-bold ${showGuide?'bg-red-500 text-white':'bg-gray-200 text-gray-600'}`}>{showGuide?'ON':'OFF'}</button>
            </div>
          )}
          <div className="flex items-center justify-between bg-white rounded-xl px-3 py-2 border border-gray-100">
            <span className="text-xs font-bold text-yellow-700">✏️ नंबर हटाएं {editMode && <span className="text-gray-400 font-normal">· tap to clear</span>}</span>
            <button onClick={()=>setEditMode(e=>!e)} className={`px-3 py-1 rounded-full text-xs font-bold ${editMode?'bg-yellow-500 text-white':'bg-gray-200 text-gray-600'}`}>{editMode?'ON':'OFF'}</button>
          </div>
          <div className="flex gap-2">
            <button onClick={autoNum} className="flex-1 py-2.5 bg-purple-500 text-white rounded-xl text-xs font-bold">⚡ Auto</button>
            <button onClick={clearNum} className="flex-1 py-2.5 bg-gray-200 text-gray-700 rounded-xl text-xs font-bold">🗑 Clear</button>
            {numHist.current.length>0 && <button onClick={undoNum} className="px-4 py-2.5 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-bold">↩ {numHist.current.length}</button>}
          </div>
          {/* ── Bata sub-number assignment ── */}
          <BataPanel symbols={symbols} onUpdateSymbols={s => { onUpdateSymbols(s); setTimeout(() => s.forEach(sym => refreshMk(sym)), 10); }} />
        </div>
      </Sheet>
    );
  }

  // ─── COLLAPSED BAR ──────────────────────────────────────
  function collapsedBar(){
    if(drawMode!=='none'){
      if (drawMode === 'label') {
        return <div className="absolute left-3 right-3 z-[1002] pointer-events-auto" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}><div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg px-4 py-3"><div className="flex items-center justify-between mb-2"><span className="text-sm font-bold text-orange-700">🏷️ Drop Place Name</span></div><input type="text" value={customLabel} onChange={e=>setCustomLabel(e.target.value)} placeholder="e.g. Main Market" className="w-full border rounded p-2 mb-2 text-sm"/><div className="flex gap-2"><button onClick={cancelDraw} className="flex-1 py-2 bg-red-100 text-red-600 rounded-lg text-xs font-semibold">Cancel</button></div></div></div>;
      }
      const isF=drawMode==='farmland';const lbl=isF?farmLbl:blkLbl;const col=isF?'green':'blue';return <div className="absolute left-3 right-3 z-[1002] pointer-events-auto" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}><div className="bg-white/95 backdrop-blur rounded-2xl shadow-lg px-4 py-3"><div className="flex items-center justify-between mb-2"><span className={`text-sm font-bold text-${col}-700`}>{isF?'🌾':'🔲'} {isF?'Farm':'Block'} {lbl}</span><span className="text-xs text-gray-500">{polyPts.length} pts</span></div><div className="flex gap-2">{polyPts.length>0&&<button onClick={undoPolyPt} className="px-3 py-2 bg-gray-200 rounded-lg text-xs font-semibold">↩</button>}{polyPts.length>=3&&<button onClick={closePolyDraw} className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-bold">✓ Close</button>}<button onClick={cancelDraw} className="px-3 py-2 bg-red-100 text-red-600 rounded-lg text-xs font-semibold">✕</button></div></div></div>;
    }
    return null;
  }

  // ═══════════ LIFECYCLE ══════════════════════════════════════
  const [showDemoCompleteModal, setShowDemoCompleteModal] = useState(false);
  return (
    <div className="relative w-full h-full bg-gray-900">
      {isDemoMode && (
        <GuidedTour
          step={step}
          onSkip={() => {
            localStorage.setItem('naksha_demo_done', 'true');
            if (onDemoComplete) onDemoComplete();
          }}
          busy={(step === 4 && rdLoad) || (step === 5 && /detecting/i.test(bldgMsg))}
          status={
            step === 4
              ? (rdLoad ? 'Fetching roads from OpenStreetMap…' : `${roads.length} road${roads.length === 1 ? '' : 's'} added automatically.`)
              : step === 5
                ? (bldgMsg || (totH > 0 ? `${totH} buildings detected.` : 'Detecting buildings…'))
                : step === 6
                  ? (numDone >= totH && totH > 0 ? `All ${totH} buildings numbered.` : `${numDone}/${totH} numbered`)
                  : undefined
          }
          onAction={
            step === 5
              ? () => { if (!showBlk && !blocks.length) onUpdateBlocks(generateBlocks(boundaryPins, symbols.length)); setShowBlk(b => !b); }
              : step === 6
                ? autoNum
                : undefined
          }
          actionLabel={step === 5 ? (showBlk ? '👁️ Hide blocks' : '🔲 Show blocks') : step === 6 ? '⚡ Auto-number all' : undefined}
          onNext={
            step === 6
              ? () => { if (numDone < totH) autoNum(); onJumpToPreview(); }
              : onStepComplete
          }
          nextLabel={
            step === 3 ? 'Continue to roads →'
              : step === 4 ? 'Continue to buildings →'
              : step === 5 ? 'Continue to numbering →'
              : 'Preview & print →'
          }
        />
      )}
      <div ref={containerRef} className="absolute inset-0" />
      {!showSnakeView && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1000]">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <line x1="32" y1="4" x2="32" y2="56" stroke="white" strokeWidth="5" opacity="0.9"/><line x1="4" y1="32" x2="56" y2="32" stroke="white" strokeWidth="5" opacity="0.9"/><circle cx="32" cy="32" r="7" stroke="white" strokeWidth="3.5" opacity="0.9" fill="none"/>
            <line x1="32" y1="4" x2="32" y2="56" stroke="#CC0000" strokeWidth="2.5"/><line x1="4" y1="32" x2="56" y2="32" stroke="#CC0000" strokeWidth="2.5"/><circle cx="32" cy="32" r="5.5" stroke="#CC0000" strokeWidth="2.5" fill="none"/><circle cx="32" cy="32" r="2" fill="#CC0000"/>
          </svg>
        </div>
      )}
      {/* Top-right control column — uniform sizing, single Layers/Data entry */}
      <div className="absolute top-2 right-2 flex flex-col gap-1.5 z-[1001]">
        <button onClick={()=>mapRef.current?.zoomIn()} className="bg-white/95 backdrop-blur w-10 h-10 rounded-xl shadow flex items-center justify-center text-lg font-bold text-gray-700 active:scale-95">+</button>
        <button onClick={()=>mapRef.current?.zoomOut()} className="bg-white/95 backdrop-blur w-10 h-10 rounded-xl shadow flex items-center justify-center text-lg font-bold text-gray-700 active:scale-95">−</button>
        <button onClick={()=>setShowSat(s=>!s)} className={`w-10 h-10 rounded-xl shadow flex items-center justify-center text-base active:scale-95 ${showSat?'bg-white/95 text-gray-700':'bg-blue-500 text-white'}`}>{showSat?'🗺️':'🛰️'}</button>
        {step>=3&&<button onClick={()=>setShowSidebar(true)} className="w-10 h-10 rounded-xl shadow flex items-center justify-center text-lg bg-white/95 font-bold text-gray-700 active:scale-95" title="Layers & data">☰</button>}
        {step>=5&&!isCropped&&(
          <button onClick={handleSmartCrop} className="w-10 h-10 rounded-xl shadow flex items-center justify-center text-base bg-white/95 text-gray-700 active:scale-95" title="Smart Crop — zoom to populated area">🔍</button>
        )}
        {step>=5&&isCropped&&(
          <div className="flex flex-col gap-1 items-center">
            <button onClick={handleCropReset} className="w-10 h-10 rounded-xl shadow flex items-center justify-center text-sm bg-orange-500 text-white active:scale-95" title="Reset crop — zoom out to full boundary">↩</button>
            {cropZoom!==null&&<span className="bg-black/70 text-white text-[9px] font-bold rounded px-1 py-0.5 leading-none">z{cropZoom}</span>}
          </div>
        )}
        {step>=3&&(
          <button
            onClick={() => setShowSnakeView(s => !s)}
            className={`w-10 h-10 rounded-xl shadow flex items-center justify-center text-lg active:scale-95 transition-all ${
              showSnakeView ? 'bg-orange-500 text-white' : 'bg-white/95 text-gray-700 hover:bg-orange-50'
            }`}
            title={showSnakeView ? "Exit Snake View" : "Snake View — Preview flow path"}
          >
            🐍
          </button>
        )}
      </div>
      <div className="absolute top-2 left-2 bg-[var(--color-saffron-container)] text-white px-3.5 py-1.5 rounded-full text-xs font-bold z-[1001] pointer-events-none shadow-[var(--shadow-warm-1)] font-public-sans tracking-wide">HLB {hlbNumber}</div>

      {statsPanel()}

      {/* Active-interaction hints only (kept small; static guidance lives in the sheet) */}
      {step===4&&drwRd&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">✏️ Tap on map to trace road • {drwPts.length} points</div>}
      {step===5&&drawMode!=='none'&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-green-600/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">Tap map to drop corners • {polyPts.length} placed</div>}
      {step===5&&placing&&selSym&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-orange-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">Tap map to place {SYMBOL_DEFS.find(d=>d.type===selSym)?.labelHi}</div>}
      {step===6&&showGuide&&serpPath.length>1&&!showSnakeView&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">🐍 Follow red path</div>}
      {step===6&&editMode&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg">✏️ EDIT</div>}
      {showSnakeView && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-orange-600/95 text-white text-xs px-4 py-2 rounded-xl z-[1001] pointer-events-none shadow-lg text-center flex items-center gap-2">
          <span>🐍</span>
          <strong>Snake View Active</strong> • Previewing flow path through blocks & houses
        </div>
      )}

      {/* Bottom Sheet (each panel is self-positioned at the bottom) */}
      {step===3&&pBnd()}
      {step===4&&pRd()}
      {step===5&&drawMode==='none'&&!autoBanner&&pSymFull()}
      {step===6&&pNumFull()}

      {step===5&&drawMode!=='none'&&!autoBanner&&collapsedBar()}

      {detectionBanner()}
      {rightSidebar()}

      {showDemoCompleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-300 text-center">
            <div className="text-5xl mb-4">🎉</div>
            <h2 className="text-2xl font-black text-gray-800 mb-2">Demo Completed!</h2>
            <p className="text-sm text-gray-600 mb-6">
              You've successfully built your first NakshaBot map! The demo map cannot be exported to PDF. To build and download a real map for your census area, please exit and click <strong>+ Create New Map</strong>.
            </p>
            <button 
              onClick={() => {
                setShowDemoCompleteModal(false);
                if (onDemoComplete) onDemoComplete();
                // Since MapWorkspace doesn't have an explicit exit function passed, 
                // we can just force the step to 0 via App by triggering onJumpToPreview and then letting them exit,
                // OR we can just let them click 'Exit & Save' in App.tsx.
                // Wait, App.tsx handles the top bar "Exit & Save".
                // Let's just alert them to click Exit.
              }}
              className="w-full bg-[var(--color-saffron)] text-white font-bold py-3 rounded-xl shadow active:scale-95 transition-all"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
