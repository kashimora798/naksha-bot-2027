import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import type { Coordinate, PlacedSymbol, RoadFeature, SymbolType, Block, FarmlandBlock, WaterBody, ForestArea, Landmark, AreaStats, MapData } from '../types';
import { SYMBOL_DEFS, isHouseType, isPakkaRoad, getUnitCount, polyCenter } from '../types';
import { getBbox, clipRoadsToPolygon, polygonArea, bearingBetween, pointInPolygon, classifyBuilding, getPolygonCentroid, generateBlocks, getBestOrientation, generateSerpentinePath, getSerpentineOrder, buildComprehensiveQuery, processOverpassData, isPolygonSelfIntersecting } from '../lib/geo';
import { getSmallSymbolSVG } from '../lib/symbols';
import { declutterSymbols, buildRotationMap } from '../lib/declutter';
import SymbolDrawer from '../components/SymbolDrawer';
import GuidedTour from '../components/GuidedTour';
import { supabase } from '../lib/supabase';

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
}

const BC = ['#E74C3C','#3498DB','#27AE60','#F39C12','#9B59B6','#1ABC9C','#E67E22','#2980B9','#C0392B','#16A085','#D35400','#8E44AD'];

export default function MapWorkspace({
  step, center, boundaryPins, boundaryClosed, roads, symbols, hlbNumber, blocks, farmlandBlocks,
  waterBodies, forests, landuseAreas, landmarks, areaStats,
  onUpdateBoundary, onUpdateRoads, onUpdateSymbols, onUpdateBlocks, onUpdateFarmland,
  onUpdateWater, onUpdateForests, onUpdateLandmarks, onUpdateStats, onUpdateOrientation,
  onStepComplete, onJumpToPreview, onUpdateMapData, isDemoMode, onDemoComplete
}: Props) {
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
  const rotMap = useRef<Map<string, number>>(new Map());
  const numHist = useRef<string[]>([]);

  const [cross, setCross] = useState<Coordinate>(center);
  const [ready, setReady] = useState(false);
  const [rdLoad, setRdLoad] = useState(false); const [rdErr, setRdErr] = useState('');
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
  const [serpPath, setSerpPath] = useState<Coordinate[]>([]); const [serpOrd, setSerpOrd] = useState<string[]>([]);
  const [aptUnits, setAptUnits] = useState(2);
  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [drawMode, setDrawMode] = useState<'none' | 'farmland' | 'block' | 'label'>('none');
  const [polyPts, setPolyPts] = useState<Coordinate[]>([]);
  const [farmLbl, setFarmLbl] = useState('A'); const [blkLbl, setBlkLbl] = useState('A');
  const [customLabel, setCustomLabel] = useState('');
  const [showStats, setShowStats] = useState(false);

  const houses = symbols.filter(s => isHouseType(s.symbol_type));
  const numDone = houses.filter(s => s.number !== null).length;
  const totH = houses.length;
  const totU = houses.reduce((s, h) => s + getUnitCount(h), 0);
  const area = boundaryPins.length >= 3 ? polygonArea(boundaryPins) : 0;
  const areaT = area > 10000 ? `${(area/10000).toFixed(2)} ha` : `${Math.round(area)} sq m`;

  // ─── STALE CLOSURE FIXES ────────────────────────────────
  const mkClickRef = useRef<(id: string, evType: 'click'|'dblclick') => void>(() => {});
  mkClickRef.current = (id: string, evType: 'click'|'dblclick') => {
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
    setNextNum(n=>n+units); onUpdateSymbols(upd);
  };

  const mapClickRef = useRef<(c: Coordinate) => void>(() => {});
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
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    [bndGrp, blkGrp, rdGrp, drwGrp, srpGrp, watGrp, forGrp, lmkGrp, frmGrp, hlGrp, luGrp].forEach(g => {
      if (!map.hasLayer(g.current)) {
        g.current.addTo(map);
      }
    });
    map.on('move', () => { const c = map.getCenter(); setCross(c); });
    map.on('click', (e: L.LeafletMouseEvent) => { mapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }); });
    mapRef.current = map; setReady(true);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ─── RENDERERS ──────────────────────────────────────────
  const renderBnd = useCallback(() => {
    const g = bndGrp.current; g.clearLayers(); if (!boundaryPins.length) return;
    const ll = boundaryPins.map(p => L.latLng(p.lat, p.lng));
    if (boundaryClosed && ll.length >= 3) g.addLayer(L.polygon(ll, { color:'#CC0000', weight:2.5, fillColor:'#CC0000', fillOpacity:0.1 }));
    else if (ll.length >= 2) g.addLayer(L.polyline(ll, { color:'#CC0000', weight:2, dashArray:'8,5' }));
    boundaryPins.forEach((p,i) => { g.addLayer(L.circleMarker([p.lat,p.lng], { radius:10, color:'#FFF', fillColor:'#CC0000', fillOpacity:1, weight:2.5 })); g.addLayer(L.marker([p.lat,p.lng], { icon: L.divIcon({ html:`<div style="color:#fff;font:bold 11px sans-serif;text-align:center;line-height:20px;width:20px;height:20px">${i+1}</div>`, className:'', iconSize:[20,20], iconAnchor:[10,10] }), interactive:false })); });
  }, [boundaryPins, boundaryClosed]);

  const renderRds = useCallback(() => {
    const g = rdGrp.current; g.clearLayers();
    roads.forEach((r,i) => { if (r.coords.length < 2) return; const ll = r.coords.map(c => L.latLng(c.lat, c.lng)); const cf=r.confirmed, pk=isPakkaRoad(r.highway), rs=['residential','unclassified','tertiary','service','living_street'].includes(r.highway), kt=['footway','path','track','pedestrian','steps'].includes(r.highway); const lc=cf?'#000':'#FFB830', gc=cf?'#FFF':'#FFF8E8';
      if (revMode&&i===revIdx) { g.addLayer(L.polyline(ll,{color:'#0066FF',weight:7,opacity:0.9})); g.addLayer(L.polyline(ll,{color:'#FFF',weight:3})); return; }
      if (pk) { g.addLayer(L.polyline(ll,{color:lc,weight:8})); g.addLayer(L.polyline(ll,{color:gc,weight:4})); }
      else if (rs) { g.addLayer(L.polyline(ll,{color:lc,weight:6})); g.addLayer(L.polyline(ll,{color:gc,weight:2.5})); }
      else if (kt) { g.addLayer(L.polyline(ll,{color:lc,weight:5,dashArray:'10,6'})); g.addLayer(L.polyline(ll,{color:gc,weight:2,dashArray:'10,6'})); }
      else { g.addLayer(L.polyline(ll,{color:lc,weight:5})); g.addLayer(L.polyline(ll,{color:gc,weight:2})); }
    });
  }, [roads, revMode, revIdx]);

  const renderWat = useCallback(() => {
    const g = watGrp.current; g.clearLayers();
    for (const wb of waterBodies) {
      if (wb.type === 'pond' && wb.coords.length >= 3) {
        g.addLayer(L.polygon(wb.coords.map(c=>[c.lat,c.lng]), { color:'#1565C0', weight:2, fillColor:'#42A5F5', fillOpacity:0.25 }));
      } else if (wb.coords.length >= 2) {
        const w = wb.type === 'river' ? 4 : 2;
        g.addLayer(L.polyline(wb.coords.map(c=>[c.lat,c.lng]), { color:'#1565C0', weight:w, opacity:0.7 }));
        if (wb.name) { const c = wb.center; g.addLayer(L.marker([c.lat,c.lng], { icon: L.divIcon({ html:`<div style="background:rgba(21,101,192,0.8);color:white;font-size:8px;padding:1px 4px;border-radius:3px;white-space:nowrap;text-shadow:0 0 2px rgba(0,0,0,0.5)">${wb.name}</div>`, className:'', iconAnchor:[20,8] }), interactive:false })); }
      }
    }
  }, [waterBodies]);

  const renderFor = useCallback(() => {
    const g = forGrp.current; g.clearLayers();
    for (const fa of forests) {
      if (fa.points.length < 3) continue;
      g.addLayer(L.polygon(fa.points.map(p=>[p.lat,p.lng]), { color:'#2E7D32', weight:2, dashArray:'6,3', fillColor:'#4CAF50', fillOpacity:0.2 }));
      const c = polyCenter(fa.points);
      g.addLayer(L.marker([c.lat,c.lng], { icon: L.divIcon({ html:`<div style="color:#2E7D32;font-size:10px;font-weight:bold;text-shadow:0 0 3px white,-0 0 3px white,0 0 3px white;white-space:nowrap">🌳 ${fa.name}</div>`, className:'', iconAnchor:[30,8] }), interactive:false }));
    }
  }, [forests]);

  const renderLmk = useCallback(() => {
    const g = lmkGrp.current; g.clearLayers();
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
  }, [landmarks, editMode]);

  const renderBlks = useCallback(() => {
    const g = blkGrp.current; g.clearLayers();
    if (!showBlk) return;
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
  }, [blocks, showBlk]);

  const renderFrms = useCallback(() => {
    const g = frmGrp.current; g.clearLayers();
    farmlandBlocks.forEach(fb => {
      if (fb.points.length < 3) return;
      g.addLayer(L.polygon(fb.points.map(p => [p.lat, p.lng]), { color: '#2E7D32', weight: 3, dashArray: '10,5', fillColor: '#66BB6A', fillOpacity: 0.15 }));
      const c = polyCenter(fb.points);
      g.addLayer(L.marker([c.lat, c.lng], {
        icon: L.divIcon({ html: `<div style="font:bold 13px 'Baloo 2',sans-serif;color:#2E7D32;text-shadow:1px 1px 3px white,-1px -1px 3px white;text-align:center;pointer-events:none">🌾 Farm ${fb.label}</div>`, className: '', iconSize: [90, 22], iconAnchor: [45, 11] }), interactive: false,
      }));
    });
  }, [farmlandBlocks]);
  const renderSrp = useCallback(() => { const g = srpGrp.current; g.clearLayers(); if(!showGuide||serpPath.length<2)return; g.addLayer(L.polyline(serpPath.map(c=>[c.lat,c.lng]),{color:'#FF4444',weight:3,opacity:0.45,dashArray:'12,8'})); const st=Math.max(1,Math.floor(serpPath.length/12)); for(let i=0;i<serpPath.length-1;i+=st){const brg=bearingBetween(serpPath[i],serpPath[Math.min(i+1,serpPath.length-1)]);g.addLayer(L.marker([serpPath[i].lat,serpPath[i].lng],{icon:L.divIcon({html:`<div style="transform:rotate(${brg}deg);color:#FF4444;font-size:14px;opacity:0.5;filter:drop-shadow(0 0 2px white)">➤</div>`,className:'',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}));} g.addLayer(L.marker([serpPath[0].lat,serpPath[0].lng],{icon:L.divIcon({html:`<div style="background:#27AE60;color:white;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font:bold 7px sans-serif;border:2px solid white">START</div>`,className:'',iconSize:[24,24],iconAnchor:[12,12]}),interactive:false})); const last=serpPath[serpPath.length-1]; g.addLayer(L.marker([last.lat,last.lng],{icon:L.divIcon({html:`<div style="background:#E74C3C;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font:bold 7px sans-serif;border:2px solid white">END</div>`,className:'',iconSize:[20,20],iconAnchor:[10,10]}),interactive:false})); }, [serpPath, showGuide]);

  const renderDrawPoly = (pts: Coordinate[]) => { const g = drwGrp.current; g.clearLayers(); if(!pts.length)return; pts.forEach((p,i)=>{const col=drawMode==='farmland'?'#2E7D32':BC[blocks.length%12];g.addLayer(L.circleMarker([p.lat,p.lng],{radius:7,color:col,fillColor:col,fillOpacity:1,weight:2}));g.addLayer(L.marker([p.lat,p.lng],{icon:L.divIcon({html:`<div style="color:white;font:bold 9px sans-serif;text-align:center;line-height:14px;width:14px;height:14px">${i+1}</div>`,className:'',iconSize:[14,14],iconAnchor:[7,7]}),interactive:false}));}); if(pts.length>=2){const col=drawMode==='farmland'?'#2E7D32':BC[blocks.length%12];g.addLayer(L.polyline(pts.map(p=>[p.lat,p.lng]),{color:col,weight:2.5,dashArray:'8,5',opacity:0.8}));} };

  const renderLanduse = useCallback(() => {
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

    const g = luGrp.current; 
    g.clearLayers();
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
  }, [landuseAreas]);

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
  useEffect(() => { if(tileRef.current) tileRef.current.setOpacity(showSat?1:0); }, [showSat]);
  useEffect(() => { 
    if(step===4&&boundaryClosed&&roads.length===0) {
      loadRd(); 
      fetchBuildingsForBlock();
    }
  }, [step]);
  useEffect(() => { if(boundaryClosed&&boundaryPins.length>=4) onUpdateOrientation(getBestOrientation(boundaryPins)); }, [boundaryClosed]);
  useEffect(() => { if(step===6&&symbols.length>0){const p=generateSerpentinePath(symbols,blocks.length>0?blocks:undefined);const o=getSerpentineOrder(symbols,blocks.length>0?blocks:undefined);setSerpPath(p);setSerpOrd(o);setShowGuide(true);const f=o.find(id=>{const s=symbols.find(x=>x.id===id);return s&&isHouseType(s.symbol_type)&&s.number===null;});if(f)setSugId(f);} }, [step]);



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
      const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { signal: controller.signal });
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

  async function fetchBuildingsForBlock() {
    if (boundaryPins.length < 3) return;
    try {
      const bb = getBbox(boundaryPins);
      const res = await supabase.functions.invoke('fetch-buildings', {
        body: { north: bb.north, south: bb.south, east: bb.east, west: bb.west }
      });
      
      if (res.data?.buildings) {
        // Filter out non-residential buildings
        const residential = res.data.buildings.filter((b: any) => 
          b.area_sqm > 15 &&    // too small = shed or outbuilding
          b.area_sqm < 800 &&   // too large = factory or institution
          pointInPolygon({ lat: b.lat, lng: b.lng }, boundaryPins)
        );
        
        const newSymbols = residential.map((b: any) => ({
          id: `building-${crypto.randomUUID()}`,
          symbol_type: 'pucca_house' as SymbolType,
          lat: b.lat,
          lng: b.lng,
          number: null,
          auto_detected: true,
          confidence: 'ai_detected'
        }));
        
        console.log(`🏢 [Microsoft Buildings] Fetched ${res.data.buildings.length} total, filtered down to ${newSymbols.length} residential/valid buildings within boundary.`);
        
        if (newSymbols.length > 0) {
           onUpdateSymbols([...symbols, ...newSymbols]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch Microsoft buildings:', err);
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
        const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { signal: controller.signal });
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
          if (resLandcover.data?.landuseAreas) {
             const newAreas = resLandcover.data.landuseAreas.filter((l: any) => pointInPolygon({ lat: l.points[0][1], lng: l.points[0][0] }, boundaryPins));
             console.log(`🌍 [Google Dynamic World] Fetched landcover data. Extracted ${newAreas.length} valid landuse polygons inside boundary.`);
             finalLanduseAreas = [...finalLanduseAreas, ...newAreas.map((l: any) => ({
               ...l,
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
    mks.current.set(sym.id,m);
  }
  function mkIcon(sym:PlacedSymbol):L.DivIcon{
    const isS=sym.id===sugId;const u=getUnitCount(sym);const nl=sym.number!==null?(u>1?`${sym.number}-${sym.number+u-1}`:String(sym.number)):'';
    const rh=isS?`<div style="position:absolute;top:-8px;left:-8px;width:44px;height:44px;border:3px solid #0066FF;border-radius:50%;pointer-events:none;animation:guidePulse 1.5s infinite"></div>`:'';
    // Road-aligned rotation for house types
    const rot = rotMap.current.get(sym.id) || 0;
    const rotStyle = rot !== 0 ? `transform:rotate(${rot}deg);` : '';
    return L.divIcon({html:`<div style="position:relative;cursor:pointer;${rotStyle}">${getSmallSymbolSVG(sym.symbol_type, false, nl)}${rh}</div>`,className:'',iconSize:[20,20],iconAnchor:[10,10]});
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
  function autoNum(){const o=getSerpentineOrder(symbols,blocks.length>0?blocks:undefined);const u=symbols.map(s=>({...s}));let n=1;for(const id of o){const s=u.find(x=>x.id===id);if(!s)continue;s.number=n;n+=getUnitCount(s);}onUpdateSymbols(u);setNextNum(n);numHist.current=o;setTimeout(()=>u.forEach(s=>refreshMk(s)),10);}
  function clearNum(){const u=symbols.map(s=>({...s,number:null}));onUpdateSymbols(u);setNextNum(1);numHist.current=[];setSugId(null);setTimeout(()=>u.forEach(s=>refreshMk(s)),10);}
  function undoNum(){
    if(!numHist.current.length)return;
    const id=numHist.current.pop()!;
    const sym = symbols.find(s=>s.id===id);
    if(!sym)return; // Symbol was deleted, skip undo
    const u=symbols.map(s=>s.id===id?{...s,number:null}:s);
    refreshMk(u.find(s=>s.id===id)!);
    setNextNum(n=>n-getUnitCount(sym));
    onUpdateSymbols(u);
    setTimeout(()=>u.forEach(s=>refreshMk(s)),10);
  }

  // ═══════════ PANELS ═════════════════════════════════════
  function P({children}:{children:React.ReactNode}){return <div className="bg-[var(--color-warm-paper)] rounded-t-[24px] shadow-[var(--shadow-warm-2)] max-h-[50vh] overflow-auto font-noto-sans z-[1002] pointer-events-auto"><div onClick={() => setPanelOpen(!panelOpen)} className="flex justify-center pt-3 pb-2 cursor-pointer"><div className="w-12 h-1.5 rounded-full bg-gray-300"/></div>{panelOpen && <div className="px-4 pb-4">{children}</div>}</div>;}
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

  function pBnd(){if(boundaryClosed)return <P><div className="text-center py-2"><div className="text-green-600 text-2xl mb-1">✓</div><p className="text-sm font-semibold">Boundary set! ~{areaT}</p></div><Btn green onClick={onStepComplete}>Continue →</Btn></P>;return <P><p className="text-xs text-gray-500 font-mono text-center mb-2">{cross.lat.toFixed(4)}°N {cross.lng.toFixed(4)}°E</p><Btn onClick={dropPin}>📍 Drop Corner Pin</Btn><p className="text-center text-xs text-gray-500 mt-2">Pins: <strong>{boundaryPins.length}</strong>/4</p>{boundaryPins.length>0&&<button onClick={undoPin} className="w-full text-center text-sm text-gray-400 mt-1">↩</button>}{boundaryPins.length>=4&&<div className="mt-3"><Btn green onClick={closePoly}>Close →</Btn></div>}</P>;}

  function pRd(){if(rdLoad)return <P><div className="flex flex-col items-center py-4 gap-3"><svg className="animate-spin h-8 w-8 text-[var(--color-saffron)]" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg><p className="text-sm text-gray-600">Loading roads...</p></div></P>;if(rdErr)return <P><p className="text-sm text-red-600 text-center">{rdErr}</p><div className="flex gap-2 mt-2"><button onClick={loadRd} className="flex-1 py-3 bg-blue-500 text-white rounded-xl font-semibold text-sm min-h-[52px]">Retry</button><button onClick={onStepComplete} className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold text-sm min-h-[52px]">Skip</button></div></P>;if(revMode&&roads.length>0){const r=roads[revIdx];return <P><p className="text-sm font-semibold mb-2">Road {revIdx+1}/{roads.length}: <span className="text-[var(--color-saffron)]">{r.highway}</span></p><div className="flex gap-2"><button onClick={confirmOne} className="flex-1 py-3 bg-[var(--color-india-green)] text-white rounded-full font-semibold text-sm min-h-[52px]">✓</button><button onClick={deleteOne} className="flex-1 py-3 bg-red-500 text-white rounded-full font-semibold text-sm min-h-[52px]">✗</button></div><button onClick={()=>setRevMode(false)} className="w-full text-center text-sm text-gray-400 mt-2 min-h-[52px]">Cancel</button></P>;}if(drwRd)return <P><p className="text-sm font-semibold mb-1">📍 Tap map to draw road ({drwPts.length} pts)</p><select value={drwType} onChange={e=>setDrwType(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2">{['residential','primary','secondary','tertiary','footway','track'].map(t=><option key={t} value={t}>{t}</option>)}</select><p className="text-xs text-gray-400 mb-2 text-center">Tap on the map to place points along the road</p><div className="flex gap-2">{drwPts.length>0&&<button onClick={undoDrwPt} className="px-3 py-2 bg-gray-200 rounded-lg text-xs font-semibold min-h-[52px]">↩ Undo</button>}{drwPts.length>=2&&<button onClick={finDrwRd} className="flex-1 py-2 bg-[var(--color-india-green)] text-white rounded-full text-sm font-bold min-h-[52px]">✓ Finish Road</button>}</div><button onClick={()=>{setDrwRd(false);setDrwPts([]);drwGrp.current.clearLayers();}} className="w-full text-center text-sm text-gray-400 mt-2 min-h-[52px]">Cancel</button></P>;return <P><p className="text-sm font-semibold mb-3">{roads.length} roads found</p><div className="flex gap-2">{roads.length>0&&<><button onClick={confirmAll} className="flex-1 py-3 bg-[var(--color-india-green)] text-white rounded-full font-semibold text-sm min-h-[52px]">✓ All</button><button onClick={()=>{setRevMode(true);setRevIdx(0);}} className="flex-1 py-3 bg-blue-500 text-white rounded-full font-semibold text-sm min-h-[52px]">Review</button></>}</div><div className="mt-3"><button onClick={()=>{setDrwRd(true);setDrwPts([]);drwGrp.current.clearLayers();}} className="w-full py-3 border-2 border-[var(--color-saffron)]/20 rounded-full text-sm text-gray-600 hover:bg-[var(--color-saffron)]/5 min-h-[52px]">✏️ Draw Road</button></div><div className="mt-3"><Btn green onClick={onStepComplete}>Roads Done →</Btn></div></P>;}

  function pSymFull(){
    return <div className="z-[1002] pointer-events-auto bg-white rounded-t-2xl shadow-[0_-2px_12px_rgba(0,0,0,0.12)]">
      <SymbolDrawer selectedType={selSym} onSelect={selSymbol} placedCount={symbols.length} onToggle={() => setPanelOpen(!panelOpen)} />
      
      {!panelOpen && selSym === 'apartment' && (
        <div className="px-4 pb-3 flex justify-center">
          <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-3 py-1.5 border border-orange-200">
            <span className="text-xs font-bold text-gray-700">Units:</span>
            <button onClick={()=>setAptUnits(u=>Math.max(1,u-1))} className="text-lg font-bold w-8 h-8 bg-white rounded shadow-sm text-gray-700">−</button>
            <span className="text-lg font-bold text-orange-600 w-8 text-center">{aptUnits}</span>
            <button onClick={()=>setAptUnits(u=>Math.min(30,u+1))} className="text-lg font-bold w-8 h-8 bg-white rounded shadow-sm text-gray-700">+</button>
          </div>
        </div>
      )}

      {panelOpen && (
      <div className="px-4 pb-4 bg-white">
        <div className="flex gap-2 mb-3">
          <button onClick={startFarmDraw} className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-green-50 text-green-700 border border-green-200">🌾 Farm</button>
          <button onClick={startBlkDraw} className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">🔲 Block</button>
          <button onClick={() => { setDrawMode('label'); setPanelOpen(false); setPlacing(false); setSelSym(null); }} className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-orange-50 text-orange-700 border border-orange-200">🏷️ Place</button>
        </div>
        
        <div className="flex gap-2 items-center">
          {!hasAuto && <button onClick={autoDetectArea} className="flex-1 py-3 rounded-full text-sm font-bold bg-purple-500 text-white shadow-sm hover:bg-purple-600">✨ Auto-Detect</button>}
          {totH>0&&<button onClick={onStepComplete} className="flex-1 py-3 bg-blue-500 text-white rounded-full font-bold text-sm shadow-sm">Number ({totH}) →</button>}
        </div>
        <button onClick={() => {
          if (isDemoMode) {
            setShowDemoCompleteModal(true);
            localStorage.setItem('naksha_demo_done', 'true');
          } else {
            onJumpToPreview();
          }
        }} className="w-full py-2 mt-2 text-xs text-gray-500 font-bold">Preview →</button>
      </div>
      )}
    </div>;
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
          <div className="p-4 overflow-auto flex-1 space-y-4">
            
            {/* Landmarks Checklist */}
            {landmarks.length > 0 && (
              <div className="bg-[var(--color-warm-paper)] rounded-[16px] p-3 border border-[var(--color-saffron)]/20 shadow-sm">
                <h4 className="text-xs font-bold text-[var(--color-charcoal)] mb-2 font-public-sans">📍 Selected Places for PDF:</h4>
                {landmarks.map(lm => (
                  <label key={lm.id} className="flex items-center gap-2 mb-1">
                    <input type="checkbox" checked={lm.selectedForPdf !== false} onChange={(e) => { const u = landmarks.map(l => l.id === lm.id ? { ...l, selectedForPdf: e.target.checked } : l); onUpdateLandmarks(u); }} className="rounded text-[var(--color-saffron)] w-4 h-4" />
                    <span className="text-xs text-[var(--color-charcoal)] truncate font-noto-sans">{lm.name}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Drawn Zones Management */}
            {(blocks.length > 0 || farmlandBlocks.length > 0) && (
              <div className="bg-[var(--color-warm-paper)] rounded-[16px] p-3 border border-[var(--color-saffron)]/20 shadow-sm">
                <h4 className="text-xs font-bold text-[var(--color-charcoal)] mb-2 font-public-sans">🗺️ Drawn Zones:</h4>
                {blocks.map(b => (
                  <div key={b.id} className="flex items-center justify-between mb-1.5 bg-white px-2 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                    <span className="text-xs font-bold text-blue-700 truncate font-noto-sans">🔲 Block {b.label}</span>
                    <button onClick={() => onUpdateBlocks(blocks.filter(x => x.id !== b.id))} className="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-[10px] font-bold">Delete</button>
                  </div>
                ))}
                {farmlandBlocks.map(f => (
                  <div key={f.id} className="flex items-center justify-between mb-1.5 bg-white px-2 py-1.5 rounded-lg border border-gray-100 shadow-sm">
                    <span className="text-xs font-bold text-green-700 truncate font-noto-sans">🌾 Farm {f.label}</span>
                    <button onClick={() => onUpdateFarmland(farmlandBlocks.filter(x => x.id !== f.id))} className="text-red-500 hover:text-red-700 bg-red-50 px-2 py-1 rounded text-[10px] font-bold">Delete</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 mb-2">
              {areaStats&&<button onClick={()=>setShowStats(s=>!s)} className="flex-1 py-3 rounded-xl text-sm font-semibold bg-[var(--color-warm-paper)] text-gray-700 border border-[var(--color-saffron)]/20 min-h-[52px]">📊 Stats</button>}
              {symbols.length>15&&<button onClick={()=>{if(!showBlk&&!blocks.length)onUpdateBlocks(generateBlocks(boundaryPins,symbols.length));setShowBlk(!showBlk);}} className={`flex-1 py-3 rounded-xl text-sm font-semibold min-h-[52px] ${showBlk?'bg-blue-100 text-blue-700 border border-blue-300':'bg-gray-100 text-gray-600 border border-gray-200'}`}>{showBlk?'Hide Blk':'Show Blk'}</button>}
            </div>

          </div>
        </div>
      </>
    );
  }

  function pNumFull(){const done=numDone===totH&&totH>0;return <P>
    {serpPath.length>1&&<div className="flex items-center justify-between mb-2 bg-red-50 rounded-lg px-3 py-2"><span className="text-xs font-bold text-red-700">🐍</span><button onClick={()=>setShowGuide(g=>!g)} className={`px-3 py-1 rounded-full text-xs font-semibold ${showGuide?'bg-red-500 text-white':'bg-gray-200 text-gray-600'}`}>{showGuide?'ON':'OFF'}</button></div>}
    <div className="flex items-center justify-between mb-2 bg-yellow-50 rounded-lg px-3 py-2"><span className="text-xs font-bold text-yellow-800">✏️ Edit</span><button onClick={()=>setEditMode(e=>!e)} className={`px-3 py-1 rounded-full text-xs font-semibold ${editMode?'bg-yellow-500 text-white':'bg-gray-200 text-gray-600'}`}>{editMode?'ON':'OFF'}</button></div>
    {done?<div className="text-center py-1"><div className="text-green-500 text-xl">✓</div><p className="text-sm font-semibold text-green-700">{totH} houses ({totU})!</p></div>:<><p className="text-sm font-semibold"><span className="text-blue-600">{numDone}</span>/{totH}</p><p className="text-xs text-gray-400">{editMode?'Tap to clear':'Tap to number'}</p></>}
    <div className="flex gap-2 mt-2 mb-2">{!done&&<button onClick={autoNum} className="flex-1 py-2 bg-purple-500 text-white rounded-lg text-xs font-bold">⚡ Auto</button>}<button onClick={clearNum} className="flex-1 py-2 bg-gray-200 text-gray-700 rounded-lg text-xs font-bold">🗑</button></div>
    {numHist.current.length>0&&<button onClick={undoNum} className="w-full text-sm text-gray-500 py-1">↩ {numHist.current.length}</button>}
    {done?<div className="mt-2"><Btn green onClick={() => {
      if (isDemoMode) {
        setShowDemoCompleteModal(true);
        localStorage.setItem('naksha_demo_done', 'true');
      } else {
        onStepComplete();
      }
    }}>Preview →</Btn></div>:totH>0?<button onClick={() => {
      if (isDemoMode) {
        setShowDemoCompleteModal(true);
        localStorage.setItem('naksha_demo_done', 'true');
      } else {
        onJumpToPreview();
      }
    }} className="w-full text-sm text-gray-400 mt-2">Skip →</button>:null}
  </P>;}

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
        />
      )}
      <div ref={containerRef} className="absolute inset-0" />
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-[1000]">
        <svg width="64" height="64" viewBox="0 0 64 64">
          <line x1="32" y1="4" x2="32" y2="56" stroke="white" strokeWidth="5" opacity="0.9"/><line x1="4" y1="32" x2="56" y2="32" stroke="white" strokeWidth="5" opacity="0.9"/><circle cx="32" cy="32" r="7" stroke="white" strokeWidth="3.5" opacity="0.9" fill="none"/>
          <line x1="32" y1="4" x2="32" y2="56" stroke="#CC0000" strokeWidth="2.5"/><line x1="4" y1="32" x2="56" y2="32" stroke="#CC0000" strokeWidth="2.5"/><circle cx="32" cy="32" r="5.5" stroke="#CC0000" strokeWidth="2.5" fill="none"/><circle cx="32" cy="32" r="2" fill="#CC0000"/>
        </svg>
      </div>
      <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded-lg text-xs font-mono z-[1001] pointer-events-none">{cross.lat.toFixed(4)}°N {cross.lng.toFixed(4)}°E</div>
      <div className="absolute top-2 right-2 flex flex-col gap-1 z-[1001]">
        <button onClick={()=>mapRef.current?.zoomIn()} className="bg-white/90 backdrop-blur w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold">+</button>
        <button onClick={()=>mapRef.current?.zoomOut()} className="bg-white/90 backdrop-blur w-9 h-9 rounded-lg flex items-center justify-center text-lg font-bold">−</button>
        <button onClick={()=>setShowSat(s=>!s)} className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs shadow ${showSat?'bg-white/90':'bg-blue-500 text-white'}`}>{showSat?'🗺️':'🛰️'}</button>
        {step>=5&&<button onClick={()=>setShowSidebar(true)} className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shadow bg-white/90 font-bold text-gray-700">☰</button>}
      </div>
      <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-[var(--color-saffron-container)] text-white px-4 py-2 rounded-full text-xs font-bold z-[1001] pointer-events-none shadow-[var(--shadow-warm-1)] font-public-sans tracking-wide">HLB {hlbNumber}</div>

      {statsPanel()}

      {showHelp&&step===3&&!boundaryClosed&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none max-w-[280px] text-center">Pan map, tap "Drop Pin" at each corner</div>}
      {step===4&&drwRd&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">✏️ Tap on map to trace road • {drwPts.length} points</div>}
      {step===5&&drawMode!=='none'&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-green-600/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">Tap map to drop corners • {polyPts.length} placed</div>}
      {step===5&&placing&&selSym&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-orange-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">Tap map to place {SYMBOL_DEFS.find(d=>d.type===selSym)?.labelHi}</div>}
      {step===6&&showGuide&&serpPath.length>1&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-red-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg text-center">🐍 Follow red path</div>}
      {step===6&&editMode&&<div className="absolute top-14 left-1/2 -translate-x-1/2 bg-yellow-500/90 text-white text-xs px-3 py-2 rounded-lg z-[1001] pointer-events-none shadow-lg">✏️ EDIT</div>}
      


      {/* Bottom Panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[1002] pointer-events-none" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {step===3&&pBnd()}{step===4&&pRd()}{step===5&&drawMode==='none'&&!autoBanner&&pSymFull()}{step===6&&pNumFull()}
      </div>

      {step===5&&drawMode!=='none'&&!autoBanner&&collapsedBar()}
      {step===6&&!panelOpen&&<div className="absolute left-1/2 -translate-x-1/2 z-[1002] pointer-events-auto" style={{ bottom: 'calc(12px + env(safe-area-inset-bottom))' }}><button onClick={()=>setPanelOpen(true)} className="bg-white/95 backdrop-blur rounded-full shadow-lg px-5 py-3 flex items-center gap-3 text-sm font-semibold text-gray-700"><span>{numDone}/{totH}</span><span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full" onClick={e=>{e.stopPropagation();autoNum();}}>⚡</span><span className="text-xs bg-gray-200 px-2 py-1 rounded-full">📂</span></button></div>}

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
