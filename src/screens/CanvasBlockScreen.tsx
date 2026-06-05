import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import type { Coordinate, RoadFeature, PlacedSymbol, Block, MapData, SymbolType } from '../types';
import { isHouseType, SYMBOL_DEFS, getUnitCount } from '../types';
import { getBbox, clipRoadsToPolygon, isPolygonSelfIntersecting, polygonArea, pointInPolygon, getSerpentineOrder, distanceBetween } from '../lib/geo';
import { getSmallSymbolSVG } from '../lib/symbols';
import { detectBlocks, mergeBlocks, splitBlock, relabelBlocks, blockPoints } from '../lib/blocks';
import { placeGroupsInBlock, blockGrid, minEdgeDistM, type LayoutMode, type SymGroup } from '../lib/placement-blocks';
import { renderMapToCanvas, findNearestRoadBearing, getBlockOrientation } from '../lib/pdf-export';
import { supabase } from '../lib/supabase';

interface Props {
  mapData: MapData;
  onUpdateMapData: (updates: Partial<MapData>) => void;
  onExitToDashboard: () => void;
  onJumpToPreview: () => void;
  isDemoMode?: boolean;
}

type Phase = 'location' | 'boundary' | 'roads' | 'canvas';

const SCHEMATIC_BG = '#f4f3ee';
const LOCATIONIQ_KEY = 'pk.290d134df72e83f426ca4223f524c664';

// Landmark-type symbol keys (non-house, non-residential building symbols)
const LANDMARK_TYPES_SET = new Set<SymbolType>(['mosque', 'temple', 'church', 'school', 'hospital', 'well', 'post_office', 'police_station', 'pond', 'farmland', 'non_residential']);
// Default display labels for landmark-type symbols placed on the canvas
const LANDMARK_TYPE_LABELS: Partial<Record<SymbolType, string>> = {
  temple: 'Temple', mosque: 'Mosque', church: 'Church',
  school: 'School', hospital: 'Hospital', well: 'Well',
  post_office: 'Post Office', police_station: 'Police Station', pond: 'Pond', farmland: 'Farmland',
  non_residential: 'Non-Res',
};


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

export default function CanvasBlockScreen({ mapData, onUpdateMapData, onExitToDashboard, onJumpToPreview }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);
  const overlayTiles = useRef<L.TileLayer[]>([]);

  // Layer groups (one per toggleable layer)
  const bndGrp = useRef(L.layerGroup());
  const rdGrp = useRef(L.layerGroup());
  const blkGrp = useRef(L.layerGroup());
  const houseGrp = useRef(L.layerGroup());
  const lmkGrp = useRef(L.layerGroup());
  const fieldGrp = useRef(L.layerGroup());
  const gridGrp = useRef(L.layerGroup());
  const drwGrp = useRef(L.layerGroup());

  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>('location');
  const [layers, setLayers] = useState({ satellite: true, roads: true, blocks: true, fields: true, houses: true, landmarks: true });

  // location inputs
  const [latIn, setLatIn] = useState(String(mapData.center.lat));
  const [lngIn, setLngIn] = useState(String(mapData.center.lng));
  const [smsText, setSmsText] = useState('');

  const handleSMSChange = (text: string) => {
    setSmsText(text);
    if (!text.trim()) return;
    const coords = parseCoordinatesFromURL(text);
    const hlb = parseHLBNumber(text);
    if (coords) {
      setLatIn(String(coords.lat));
      setLngIn(String(coords.lng));
      if (mapRef.current) {
        mapRef.current.setView([coords.lat, coords.lng], 16);
      }
      onUpdateMapData({ center: coords });
    }
    if (hlb) {
      onUpdateMapData({ hlbNumber: hlb });
    }
  };

  // road drawing
  const [drawingRoad, setDrawingRoad] = useState(false);
  const [drwPts, setDrwPts] = useState<Coordinate[]>([]);
  const [rdLoading, setRdLoading] = useState(false);
  const [rdMsg, setRdMsg] = useState('');

  // canvas: block selection + edits + placement
  const [selIds, setSelIds] = useState<string[]>([]);
  const [cutting, setCutting] = useState(false);
  const [cutPts, setCutPts] = useState<Coordinate[]>([]);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirst, setSwapFirst] = useState<string | null>(null);
  const [manualNumMode, setManualNumMode] = useState(false);
  const [nextManualNum, setNextManualNum] = useState(1);
  const [manualNumClearMode, setManualNumClearMode] = useState(false);
  const [fieldDrawing, setFieldDrawing] = useState(false);
  const [fieldPts, setFieldPts] = useState<Coordinate[]>([]);
  const [popCount, setPopCount] = useState(10);
  const [popType, setPopType] = useState<SymbolType>('pucca_house');
  const [popLayout, setPopLayout] = useState<LayoutMode>('grid');
  const [popIsNonRes, setPopIsNonRes] = useState(false);
  const [popUnitCount, setPopUnitCount] = useState(2);
  const [groups, setGroups] = useState<SymGroup[]>([]);
  const [roadWidth, setRoadWidth] = useState(7);
  const [blkMsg, setBlkMsg] = useState('');
  const [savingDraft, setSavingDraft] = useState(false);

  function clearAllNumbers() {
    if (!confirm('Are you sure you want to erase all house numbers on the map?')) return;
    const updated = symbols.map(s => isHouseType(s.symbol_type) ? { ...s, number: null } : s);
    onUpdateMapData({ symbols: updated });
    setNextManualNum(1);
    setBlkMsg('Erase completed. All house numbers have been cleared.');
  }

  function clearSelectedBlockNumbers() {
    if (selIds.length !== 1) return;
    const blockId = selIds[0];
    const blk = blocks.find(b => b.id === blockId);
    if (!blk) return;
    if (!confirm(`Are you sure you want to erase all house numbers inside Block ${blk.label}?`)) return;
    const ring = blockPoints(blk);
    const updated = symbols.map(s => {
      if (isHouseType(s.symbol_type) && pointInPolygon({ lat: s.lat, lng: s.lng }, ring)) {
        return { ...s, number: null };
      }
      return s;
    });
    onUpdateMapData({ symbols: updated });
    setBlkMsg(`Cleared all house numbers inside Block ${blk.label}.`);
  }

  async function saveDraftAction() {
    if (!mapData.projectId) {
      alert('No active project found to save. Please make sure you started from an SMS or manual location.');
      return;
    }
    setSavingDraft(true);
    setBlkMsg('Saving draft...');
    try {
      const name = `HLB ${mapData.hlbNumber || 'Draft'}`;
      const getCleanData = (d: MapData) => {
        const { projectId, paymentStatus, exportCount, ...rest } = d as any;
        return rest;
      };
      const dataToSave = getCleanData(mapData);
      const { error } = await supabase
        .from('projects')
        .update({ name, data: dataToSave, updated_at: new Date().toISOString() })
        .eq('id', mapData.projectId);
      if (error) throw error;
      setBlkMsg('Draft saved successfully to dashboard! ✓');
    } catch (err: any) {
      console.error(err);
      setBlkMsg('Failed to save draft. Please check your network connection.');
    } finally {
      setSavingDraft(false);
    }
  }
  // Selected road ID
  const [selRoadId, setSelRoadId] = useState<string | null>(null);
  // LocationIQ route-drawing mode
  const [drawingRouteRoad, setDrawingRouteRoad] = useState(false);
  const [routePts, setRoutePts] = useState<Coordinate[]>([]);
  const [routePreviewCoords, setRoutePreviewCoords] = useState<Coordinate[]>([]);
  const [routeRoadName, setRouteRoadName] = useState<string>('');
  // Print preview
  const [showPreview, setShowPreview] = useState(false);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mobile UX helper states
  const [showHelp, setShowHelp] = useState(false);
  const [helpStep, setHelpStep] = useState(0);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [showLayers, setShowLayers] = useState(false);


  // Convenience accessors into mapData
  const boundaryPins = mapData.boundaryPins;
  const boundaryClosed = mapData.boundaryClosed;
  const roads = mapData.roads;
  const blocks = mapData.blocks;
  const symbols = mapData.symbols;
  const landmarks = mapData.landmarks;
  const fields = mapData.farmlandBlocks; // fields = no-house exclusion zones

  // Polygons houses must avoid: drawn fields + forests + ponds.
  const exclusionPolys = useCallback((): Coordinate[][] => {
    const ex: Coordinate[][] = [];
    for (const f of mapData.farmlandBlocks) if (f.points && f.points.length >= 3) ex.push(f.points);
    for (const f of mapData.forests) if (f.points && f.points.length >= 3) ex.push(f.points);
    for (const w of mapData.waterBodies) if (w.type === 'pond' && w.coords && w.coords.length >= 3) ex.push(w.coords);
    return ex;
  }, [mapData.farmlandBlocks, mapData.forests, mapData.waterBodies]);

  // ─── Stale-closure-safe map click handler ───────────────────
  const mapClickRef = useRef<(c: Coordinate) => void>(() => {});
  mapClickRef.current = (coord: Coordinate) => {
    if (phase === 'boundary' && !boundaryClosed) {
      if (mapData.paymentStatus === 'paid') return;
      onUpdateMapData({ boundaryPins: [...boundaryPins, { ...coord }] });
      try { navigator.vibrate?.(40); } catch {}
      return;
    }
    if (phase === 'roads' && drawingRoad) {
      setDrwPts(p => [...p, coord]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'roads' && drawingRouteRoad) {
      handleRouteRoadClick(coord);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'canvas' && cutting) {
      setCutPts(p => [...p, coord]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'canvas' && fieldDrawing) {
      setFieldPts(p => [...p, coord]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    // Deselect selected road on empty map tap
    if (selRoadId) {
      setSelRoadId(null);
    }
  };

  // Clicking a block polygon. While drawing a field or a split line, a tap that
  // lands ON a block must still add the point (the polygon would otherwise eat
  // the click), so we route it to the active drawing buffer instead of selecting.
  const blockClickRef = useRef<(id: string, c: Coordinate) => void>(() => {});
  blockClickRef.current = (id: string, c: Coordinate) => {
    if (cutting) { setCutPts(p => [...p, c]); return; }
    if (fieldDrawing) { setFieldPts(p => [...p, c]); return; }
    if (drawingRoad) { setDrwPts(p => [...p, c]); return; }
    if (drawingRouteRoad) { handleRouteRoadClick(c); return; }
    // Clear road selection if selecting a block
    setSelRoadId(null);
    setSelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Clicking a road in drawing/cutting/boundary modes routes coordinates to drawing buffer.
  const roadClickRef = useRef<(id: string, c: Coordinate) => void>(() => {});
  roadClickRef.current = (id: string, c: Coordinate) => {
    if (phase === 'boundary' && !boundaryClosed) {
      onUpdateMapData({ boundaryPins: [...boundaryPins, { ...c }] });
      try { navigator.vibrate?.(40); } catch {}
      return;
    }
    if (phase === 'roads' && drawingRoad) {
      setDrwPts(p => [...p, c]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'roads' && drawingRouteRoad) {
      handleRouteRoadClick(c);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'canvas' && cutting) {
      setCutPts(p => [...p, c]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    if (phase === 'canvas' && fieldDrawing) {
      setFieldPts(p => [...p, c]);
      try { navigator.vibrate?.(30); } catch {}
      return;
    }
    
    // Normal selection behavior
    if (selRoadId === id) {
      setSelRoadId(null);
    } else {
      setSelRoadId(id);
      setSelIds([]); // clear block selection
    }
  };

  // Clicking a house in swap mode or manual numbering mode
  const houseClickRef = useRef<(id: string) => void>(() => {});
  houseClickRef.current = (id: string) => {
    if (manualNumMode) {
      const sym = symbols.find(s => s.id === id);
      if (!sym || !isHouseType(sym.symbol_type)) return;
      if (manualNumClearMode) {
        const updated = symbols.map(s => s.id === id ? { ...s, number: null } : s);
        onUpdateMapData({ symbols: updated });
        setBlkMsg('Cleared number for house.');
      } else {
        const u = getUnitCount(sym);
        const updated = symbols.map(s => s.id === id ? { ...s, number: nextManualNum } : s);
        let nextVal = nextManualNum + (mapData.numberingSystem === 'census_u_loop' ? 1 : u);
        const assigned = new Set(updated.map(s => s.number).filter(n => n !== null));
        while (assigned.has(nextVal)) {
          nextVal += 1;
        }
        setNextManualNum(nextVal);
        onUpdateMapData({ symbols: updated });
        setBlkMsg(`Assigned number ${nextManualNum} to house.`);
      }
      return;
    }
    if (!swapMode) return;
    if (!swapFirst) { setSwapFirst(id); setBlkMsg('Now tap the house to swap with.'); return; }
    if (swapFirst === id) { setSwapFirst(null); setBlkMsg(''); return; }
    const a = symbols.find(s => s.id === swapFirst), b = symbols.find(s => s.id === id);
    if (a && b) {
      const swapped = symbols.map(s => s.id === a.id ? { ...s, lat: b.lat, lng: b.lng } : s.id === b.id ? { ...s, lat: a.lat, lng: a.lng } : s);
      onUpdateMapData({ symbols: renumber(swapped) });
      setBlkMsg('Swapped.');
    }
    setSwapFirst(null);
  };

  const validateSymbolPosition = (id: string | null, c: Coordinate, type: SymbolType, isDropPlacement = false): { valid: boolean; reason?: string } => {
    // 1. Check exclusions (fields, etc.)
    if (isHouseType(type) && exclusionPolys().some(ex => pointInPolygon(c, ex))) {
      return { valid: false, reason: "Houses can't go inside a field." };
    }

    // 2. Check overlap with other symbols
    for (const s of symbols) {
      if (s.id === id) continue;
      const d = distanceBetween(c, s);
      if (d < 4.5) {
        return { valid: false, reason: 'Too close to another house/symbol.' };
      }
    }

    // 3. Check inside boundary
    if (!pointInPolygon(c, boundaryPins)) {
      return { valid: false, reason: 'Must stay inside the boundary.' };
    }

    // 4. Check inside blocks
    if (blocks && blocks.length > 0) {
      const parentBlock = blocks.find(b => pointInPolygon(c, blockPoints(b)));
      if (!parentBlock) {
        return { valid: false, reason: 'Must be placed inside a block.' };
      }
      // For drag-and-drop placement, only require being inside the polygon (not strict road clearance).
      // For arrange-mode dragging, keep a small clearance rule.
      if (!isDropPlacement) {
        const dist = minEdgeDistM(c, blockPoints(parentBlock));
        if (dist < 0.5) {
          return { valid: false, reason: 'Too close to the road or block boundary.' };
        }
      }
    } else {
      // Check edge distance to boundary
      const dist = minEdgeDistM(c, boundaryPins);
      if (dist < 2.0) {
        return { valid: false, reason: 'Too close to the boundary.' };
      }
    }

    return { valid: true };
  };

  // Dragging a house marker to a new position (arrange mode).
  const houseDragRef = useRef<(id: string, c: Coordinate) => void>(() => {});
  houseDragRef.current = (id: string, c: Coordinate) => {
    const sym = symbols.find(s => s.id === id);
    if (!sym) return;
    const res = validateSymbolPosition(id, c, sym.symbol_type);
    if (!res.valid) {
      onUpdateMapData({ symbols: [...symbols] }); // re-render → marker snaps back
      setBlkMsg(res.reason || 'Invalid position.');
      return;
    }
    onUpdateMapData({ symbols: renumber(symbols.map(s => s.id === id ? { ...s, lat: c.lat, lng: c.lng, is_manual: true } : s)) });
  };

  // Dropping a palette symbol onto the map (HTML5 DnD → geo coordinate).
  const dropRef = useRef<(type: SymbolType, clientX: number, clientY: number) => void>(() => {});
  dropRef.current = (type: SymbolType, clientX: number, clientY: number) => {
    const map = mapRef.current, cont = containerRef.current;
    if (!map || !cont) return;
    const rect = cont.getBoundingClientRect();
    // If the drop lands below the map container (e.g. on the panel), reject gracefully
    if (clientY > rect.bottom || clientY < rect.top || clientX < rect.left || clientX > rect.right) {
      setBlkMsg('Drop the symbol onto the map (not the panel).');
      return;
    }
    const ll = map.containerPointToLatLng(L.point(clientX - rect.left, clientY - rect.top));
    const c = { lat: ll.lat, lng: ll.lng };
    
    // isDropPlacement=true: relax edge clearance so symbols can be placed near block boundaries
    const res = validateSymbolPosition(null, c, type, true);
    if (!res.valid) {
      setBlkMsg(res.reason || 'Invalid position.');
      return;
    }

    // For landmark types, ask for an optional custom name
    let customLabel: string | undefined;
    if (LANDMARK_TYPES_SET.has(type)) {
      const defaultName = SYMBOL_DEFS.find(d => d.type === type)?.label || '';
      const entered = prompt(`Name for this ${defaultName} (leave blank to use default):`, '');
      if (entered === null) return; // user cancelled
      customLabel = entered.trim() || undefined;
    }
    const sym: PlacedSymbol = {
      id: crypto.randomUUID(),
      symbol_type: type,
      lat: c.lat, lng: c.lng,
      number: null,
      placed_at: new Date().toISOString(),
      is_residential: isHouseType(type) ? true : undefined,
      label: customLabel,
      is_manual: true,
    };
    onUpdateMapData({ symbols: renumber([...symbols, sym]) });
    setBlkMsg(`${SYMBOL_DEFS.find(d => d.type === type)?.label ?? type} placed on map.`);
  };

  // ─── MAP INIT ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const container = containerRef.current as HTMLDivElement & { _leaflet_id?: any };
    if (container._leaflet_id) container._leaflet_id = null;

    const map = L.map(containerRef.current, { center: [mapData.center.lat, mapData.center.lng], zoom: 17, zoomControl: false, attributionControl: false });
    
    // Create a high-z-index pane for drawing markers/lines so they sit on top of all block/field polygons.
    map.createPane('drawingPane');
    map.getPane('drawingPane')!.style.zIndex = '620';

    tileRef.current = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map);
    overlayTiles.current = [
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map),
      L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(map),
    ];
    [bndGrp, blkGrp, fieldGrp, gridGrp, rdGrp, houseGrp, lmkGrp, drwGrp].forEach(g => { if (!map.hasLayer(g.current)) g.current.addTo(map); });
    map.on('click', (e: L.LeafletMouseEvent) => mapClickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    mapRef.current = map;
    setReady(true);
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── LAYER VISIBILITY ───────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    const op = layers.satellite ? 1 : 0;
    tileRef.current?.setOpacity(op);
    overlayTiles.current.forEach(t => t.setOpacity(op));
    if (containerRef.current) containerRef.current.style.background = layers.satellite ? '#000' : SCHEMATIC_BG;
    const toggle = (g: L.LayerGroup, on: boolean) => { if (on) { if (!map.hasLayer(g)) g.addTo(map); } else if (map.hasLayer(g)) map.removeLayer(g); };
    toggle(rdGrp.current, layers.roads);
    toggle(blkGrp.current, layers.blocks);
    toggle(fieldGrp.current, layers.fields);
    toggle(houseGrp.current, layers.houses);
    toggle(lmkGrp.current, layers.landmarks);
  }, [layers]);

  // ─── RENDERERS ──────────────────────────────────────────────
  const renderBnd = useCallback(() => {
    const g = bndGrp.current; g.clearLayers(); if (!boundaryPins.length) return;
    const ll = boundaryPins.map(p => L.latLng(p.lat, p.lng));
    if (boundaryClosed && ll.length >= 3) g.addLayer(L.polygon(ll, { color: '#CC0000', weight: 2.5, fillColor: '#CC0000', fillOpacity: 0.06, interactive: false }));
    else if (ll.length >= 2) g.addLayer(L.polyline(ll, { color: '#CC0000', weight: 2, dashArray: '8,5', interactive: false }));
    boundaryPins.forEach((p, i) => {
      g.addLayer(L.circleMarker([p.lat, p.lng], { radius: 9, color: '#FFF', fillColor: '#CC0000', fillOpacity: 1, weight: 2.5 }));
      g.addLayer(L.marker([p.lat, p.lng], { icon: L.divIcon({ html: `<div style="color:#fff;font:bold 11px sans-serif;text-align:center;line-height:18px;width:18px;height:18px">${i + 1}</div>`, className: '', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }));
    });
  }, [boundaryPins, boundaryClosed]);

  const renderRoads = useCallback(() => {
    const g = rdGrp.current; g.clearLayers();
    roads.forEach(r => {
      if (r.coords.length < 2) return;
      const isSel = selRoadId === r.id;
      const ll = r.coords.map(c => L.latLng(c.lat, c.lng));
      const outerColor = isSel ? '#E91E63' : '#222';
      const outerWeight = isSel ? 9 : 6;
      const innerColor = isSel ? '#FFD54F' : '#fff';
      const innerWeight = isSel ? 4 : 2.5;

      const outer = L.polyline(ll, { color: outerColor, weight: outerWeight, interactive: true });
      const inner = L.polyline(ll, { color: innerColor, weight: innerWeight, interactive: true });

      outer.on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stop(e); roadClickRef.current(r.id, { lat: e.latlng.lat, lng: e.latlng.lng }); });
      inner.on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stop(e); roadClickRef.current(r.id, { lat: e.latlng.lat, lng: e.latlng.lng }); });
      g.addLayer(outer);
      g.addLayer(inner);

      // Road name label — shown in gap between the two lines
      if (r.name) {
        // Find the longest segment to place the label
        let maxLen = 0, bestIdx = 0;
        for (let i = 0; i < r.coords.length - 1; i++) {
          const a = r.coords[i], b = r.coords[i + 1];
          const d = Math.hypot((b.lat - a.lat) * 111320, (b.lng - a.lng) * 111320 * Math.cos(a.lat * Math.PI / 180));
          if (d > maxLen) { maxLen = d; bestIdx = i; }
        }
        const mid = {
          lat: (r.coords[bestIdx].lat + r.coords[bestIdx + 1].lat) / 2,
          lng: (r.coords[bestIdx].lng + r.coords[bestIdx + 1].lng) / 2,
        };
        const a = r.coords[bestIdx], b = r.coords[bestIdx + 1];
        const angleDeg = Math.atan2(b.lat - a.lat, b.lng - a.lng) * 180 / Math.PI;
        const labelHtml = `<div style="transform:rotate(${-angleDeg}deg);white-space:nowrap;font:bold 11px sans-serif;color:#111;background:rgba(255,255,255,0.85);padding:0 4px;border-radius:3px;pointer-events:none">${r.name}</div>`;
        g.addLayer(L.marker([mid.lat, mid.lng], {
          icon: L.divIcon({ html: labelHtml, className: '', iconAnchor: [0, 6] }),
          interactive: false,
        }));
      }
    });
  }, [roads, selRoadId]);

  const renderBlocks = useCallback(() => {
    const g = blkGrp.current; g.clearLayers();
    blocks.forEach((b, i) => {
      const pts = blockPoints(b);
      const sel = selIds.includes(b.id);
      const hue = (i * 47) % 360;
      const poly = L.polygon(pts.map(p => [p.lat, p.lng]) as any, {
        color: sel ? '#0066FF' : `hsl(${hue},70%,40%)`,
        weight: sel ? 3.5 : 2,
        fillColor: `hsl(${hue},70%,55%)`,
        fillOpacity: sel ? 0.28 : 0.12,
      });
      poly.on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stop(e); blockClickRef.current(b.id, { lat: e.latlng.lat, lng: e.latlng.lng }); });
      g.addLayer(poly);
      const c = pts.reduce((a, p) => ({ lat: a.lat + p.lat / pts.length, lng: a.lng + p.lng / pts.length }), { lat: 0, lng: 0 });
      g.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ html: `<div style="background:hsl(${hue},70%,40%);color:#fff;font:bold 12px sans-serif;padding:2px 7px;border-radius:10px;white-space:nowrap">${b.label}</div>`, className: '', iconAnchor: [12, 10] }), interactive: false }));
    });
  }, [blocks, selIds]);



  const renderHouses = useCallback(() => {
    const g = houseGrp.current; g.clearLayers();
    const interactive = arrangeMode || swapMode || manualNumMode;

    // Pre-compute a per-block cell size so symbols scale to fill the block.
    // For each block, get the cellMeters from the placement grid and convert to px at current zoom.
    const blockCellMap = new Map<string, number>();
    if (mapRef.current) {
      const map = mapRef.current;
      for (const blk of blocks) {
        const housesSym = symbols.filter(s => isHouseType(s.symbol_type));
        const inBlk = housesSym.filter(s => {
          try { return pointInPolygon({ lat: s.lat, lng: s.lng }, blockPoints(blk)); } catch { return false; }
        }).length;
        if (inBlk === 0) continue;
        const { cellMeters } = blockGrid(blk, inBlk, blk.layoutMode ?? 'grid', []);
        if (cellMeters > 0) {
          // Convert cellMeters to pixel size at current zoom
          const lat = blk.south + (blk.north - blk.south) / 2;
          const mPerDeg = 111320 * Math.cos(lat * Math.PI / 180);
          const degPerCell = cellMeters / mPerDeg;
          const p1 = map.latLngToContainerPoint([lat, 0]);
          const p2 = map.latLngToContainerPoint([lat, degPerCell]);
          const cellPx = Math.abs(p2.x - p1.x);
          // Clamp: min 14px (readable), max 40px (not overwhelming)
          blockCellMap.set(blk.id, Math.max(14, Math.min(40, cellPx * 0.88)));
        }
      }
    }

    symbols.forEach(s => {
      const hl = swapMode && swapFirst === s.id;
      let lbl = '';
      if (s.number != null) {
        const u = getUnitCount(s);
        lbl = mapData.numberingSystem === 'census_u_loop'
          ? (u > 1 ? `${s.number}(${u})` : String(s.number))
          : (u > 1 ? `${s.number}-${s.number + u - 1}` : String(s.number));
      }
      const isLandmark = !isHouseType(s.symbol_type);
      const displayLabel = s.label || (isLandmark ? LANDMARK_TYPE_LABELS[s.symbol_type] : undefined);
      let angle = getBlockOrientation(s, blocks);
      if (angle === null) angle = findNearestRoadBearing(s, roads);
      // Normalize angle to [-PI/2, PI/2]
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      const angleDeg = (angle * 180) / Math.PI;

      // Compute adaptive icon size for house symbols based on block density
      let iconPx = 24;
      if (!isLandmark) {
        for (const [bid, cellPx] of blockCellMap) {
          const blk = blocks.find(b => b.id === bid);
          if (blk && pointInPolygon({ lat: s.lat, lng: s.lng }, blockPoints(blk))) {
            iconPx = cellPx;
            break;
          }
        }
      }
      const iconPxI = Math.round(iconPx);

      const svg = getSmallSymbolSVG(s.symbol_type, hl, lbl || undefined);
      const labelHtml = displayLabel
          ? `<div style="white-space:nowrap;font:bold 9px sans-serif;color:#111;background:rgba(255,255,255,0.9);padding:0 3px;border-radius:2px;text-align:center;margin-top:1px;pointer-events:none">${displayLabel}</div>`
          : '';
      const iconHtml = isLandmark
        ? `<div style="display:flex;flex-direction:column;align-items:center">${svg}${labelHtml}</div>`
        : `<div style="transform: rotate(${angleDeg}deg); transform-origin: center center; width: ${iconPxI}px; height: ${iconPxI}px; display:flex;align-items:center;justify-content:center;"><svg width="${iconPxI}" height="${iconPxI}" viewBox="0 0 24 24" style="display:block;overflow:visible">${svg.replace(/^<svg[^>]*>/, '').replace('</svg>', '')}</svg></div>`;
      const iconH = isLandmark && displayLabel ? 30 : (isLandmark ? 18 : iconPxI);
      const m = L.marker([s.lat, s.lng], {
        icon: L.divIcon({ html: iconHtml, className: '', iconSize: [isLandmark ? 60 : iconPxI, iconH], iconAnchor: [isLandmark ? 30 : iconPxI / 2, isLandmark && displayLabel ? 15 : iconPxI / 2] }),
        interactive,
        draggable: arrangeMode,
      });
      if (arrangeMode) m.on('dragend', () => { const ll = m.getLatLng(); houseDragRef.current(s.id, { lat: ll.lat, lng: ll.lng }); });
      if (swapMode || manualNumMode) m.on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stop(e); houseClickRef.current(s.id); });
      g.addLayer(m);
    });
  }, [symbols, arrangeMode, swapMode, manualNumMode, swapFirst, roads, blocks]);

  const renderLandmarks = useCallback(() => {
    const g = lmkGrp.current; g.clearLayers();
    landmarks.forEach(lm => {
      g.addLayer(L.marker([lm.lat, lm.lng], { icon: L.divIcon({ html: `<div style="background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;white-space:nowrap">📍 ${lm.name}</div>`, className: '', iconAnchor: [10, 8] }), interactive: false }));
    });
  }, [landmarks]);

  const renderFields = useCallback(() => {
    const g = fieldGrp.current; g.clearLayers();
    fields.forEach(f => {
      if (!f.points || f.points.length < 3) return;
      g.addLayer(L.polygon(f.points.map(p => [p.lat, p.lng]) as any, { color: '#16A34A', weight: 2.5, fillColor: '#22C55E', fillOpacity: 0.3, interactive: false }));
    });
  }, [fields]);

  const renderDrawRoad = useCallback(() => {
    const g = drwGrp.current; g.clearLayers();
    const draw = (pts: Coordinate[], color: string, closed = false) => {
      const ll = pts.map(p => [p.lat, p.lng]) as any;
      if (closed && pts.length >= 3) g.addLayer(L.polygon(ll, { color, weight: 4, dashArray: '6,4', fill: false, pane: 'drawingPane' }));
      else if (pts.length >= 2) g.addLayer(L.polyline(ll, { color, weight: 4, dashArray: '6,4', pane: 'drawingPane' }));
      pts.forEach(p => g.addLayer(L.circleMarker([p.lat, p.lng], { radius: 5, color: '#fff', fillColor: color, fillOpacity: 1, weight: 2, pane: 'drawingPane' })));
    };
    draw(drwPts, '#0066FF');
    draw(cutPts, '#E91E63');
    draw(fieldPts, '#16A34A', true);

    // Draw LocationIQ route drawing preview
    if (routePreviewCoords.length > 0) {
      const color = '#9C27B0'; // purple for route road
      const ll = routePreviewCoords.map(p => [p.lat, p.lng]) as any;
      if (routePreviewCoords.length >= 2) {
        g.addLayer(L.polyline(ll, { color, weight: 5, dashArray: '8,4', pane: 'drawingPane' }));
      }
      routePts.forEach(p => g.addLayer(L.circleMarker([p.lat, p.lng], { radius: 6, color: '#fff', fillColor: color, fillOpacity: 1, weight: 2, pane: 'drawingPane' })));
    }
  }, [drwPts, cutPts, fieldPts, routePreviewCoords, routePts]);

  useEffect(() => { if (ready) renderBnd(); }, [ready, renderBnd]);
  useEffect(() => { if (ready) renderRoads(); }, [ready, renderRoads]);
  useEffect(() => { if (ready) renderBlocks(); }, [ready, renderBlocks]);
  useEffect(() => { if (ready) renderHouses(); }, [ready, renderHouses]);
  useEffect(() => { if (ready) renderLandmarks(); }, [ready, renderLandmarks]);
  useEffect(() => { if (ready) renderFields(); }, [ready, renderFields]);
  useEffect(() => { if (ready) renderDrawRoad(); }, [ready, renderDrawRoad]);

  // Show the placement grid inside the single selected block.
  useEffect(() => {
    if (!ready) return;
    const g = gridGrp.current; g.clearLayers();
    if (selIds.length !== 1) return;
    const blk = blocks.find(b => b.id === selIds[0]); if (!blk) return;
    const ring = blockPoints(blk);
    const inBlk = symbols.filter(s => pointInPolygon({ lat: s.lat, lng: s.lng }, ring)).length;
    const groupTotal = groups.reduce((s, gr) => s + Math.max(0, gr.count), 0);
    const count = inBlk || groupTotal || popCount;
    const { centers, cellMeters } = blockGrid(blk, count, blk.layoutMode ?? popLayout, exclusionPolys());
    const half = cellMeters / 2;
    for (const c of centers) {
      const dLat = half / 111320, dLng = half / (111320 * Math.cos((c.lat * Math.PI) / 180));
      g.addLayer(L.rectangle([[c.lat - dLat, c.lng - dLng], [c.lat + dLat, c.lng + dLng]], { color: '#0066FF', weight: 1, fill: false, opacity: 0.5, dashArray: '2,3' }));
    }
  }, [ready, selIds, blocks, symbols, groups, popCount, popLayout, exclusionPolys]);

  // HTML5 drag-and-drop: palette symbol → map drop.
  useEffect(() => {
    const cont = containerRef.current; if (!cont || !ready) return;
    const over = (e: DragEvent) => { e.preventDefault(); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const t = e.dataTransfer?.getData('symtype');
      if (t) dropRef.current(t as SymbolType, e.clientX, e.clientY);
    };
    cont.addEventListener('dragover', over);
    cont.addEventListener('drop', drop);
    return () => { cont.removeEventListener('dragover', over); cont.removeEventListener('drop', drop); };
  }, [ready]);

  // ─── ACTIONS ────────────────────────────────────────────────
  function recenter() {
    const lat = parseFloat(latIn), lng = parseFloat(lngIn);
    if (isNaN(lat) || isNaN(lng)) { alert('Enter valid coordinates'); return; }
    mapRef.current?.setView([lat, lng], 17);
    onUpdateMapData({ center: { lat, lng } });
  }

  function closeBoundary() {
    if (boundaryPins.length < 3) { alert('Drop at least 3 pins'); return; }
    if (isPolygonSelfIntersecting(boundaryPins)) { alert('Boundary lines cross each other — adjust the pins.'); return; }
    const sumLat = boundaryPins.reduce((acc, curr) => acc + curr.lat, 0);
    const sumLng = boundaryPins.reduce((acc, curr) => acc + curr.lng, 0);
    const center = { lat: sumLat / boundaryPins.length, lng: sumLng / boundaryPins.length };
    onUpdateMapData({ boundaryClosed: true, center });
  }

  async function fetchRoads() {
    if (boundaryPins.length < 3) return;
    setRdLoading(true); setRdMsg('');
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
      if (!r.ok) throw new Error('fetch failed');
      const d = await r.json();
      const cl = clipRoadsToPolygon(d.elements || [], boundaryPins);
      const fetched: RoadFeature[] = cl.map((c: any) => ({ id: crypto.randomUUID(), coords: c.coords, highway: c.highway, name: c.name, confirmed: true, source: 'osm' as const, osm_id: c.osm_id }));
      const userRoads = roads.filter(r => r.source === 'user');
      onUpdateMapData({ roads: [...userRoads, ...fetched] });
      setRdMsg(fetched.length ? `Loaded ${fetched.length} roads` : 'No roads found — draw them manually.');
    } catch {
      setRdMsg('Could not load roads from OSM. Draw them manually.');
    } finally {
      setRdLoading(false);
    }
  }

  // Auto-fetch OSM roads when entering the roads phase
  useEffect(() => {
    if (phase === 'roads' && roads.length === 0 && boundaryPins.length >= 3 && boundaryClosed) {
      fetchRoads();
    }
  }, [phase, roads.length, boundaryPins.length, boundaryClosed]);

  function finishDrawnRoad() {
    if (drwPts.length >= 2) {
      onUpdateMapData({ roads: [...roads, { id: crypto.randomUUID(), coords: drwPts, highway: 'residential', confirmed: true, source: 'user' }] });
    }
    setDrwPts([]); setDrawingRoad(false);
  }

  // ─── LocationIQ Road Snapping and Routing Features ───────────
  async function handleRouteRoadClick(coord: Coordinate) {
    if (routePts.length === 0) {
      setRoutePts([coord]);
      setRoutePreviewCoords([coord]);
      return;
    }

    const last = routePts[routePts.length - 1];
    setRdLoading(true);
    setRdMsg('Snapping road to route via LocationIQ...');
    try {
      const url = `https://us1.locationiq.com/v1/directions/driving/${last.lng},${last.lat};${coord.lng},${coord.lat}?key=${LOCATIONIQ_KEY}&geometries=geojson&overview=full`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`LocationIQ directions HTTP ${response.status}`);
      const data = await response.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const newCoords = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
        
        setRoutePreviewCoords(prev => {
          if (prev.length === 0) return newCoords;
          return [...prev, ...newCoords.slice(1)];
        });
        setRoutePts(prev => [...prev, coord]);

        if (route.name && route.name !== 'Route' && route.name.trim() !== '') {
          setRouteRoadName(route.name);
        }
        setRdMsg('Point added. Tap another point, or click "Finish route road"');
      } else {
        throw new Error('No routes returned');
      }
    } catch (err: any) {
      console.error(err);
      setRdMsg(`Route lookup failed. Adding straight segment instead.`);
      setRoutePreviewCoords(prev => [...prev, coord]);
      setRoutePts(prev => [...prev, coord]);
    } finally {
      setRdLoading(false);
    }
  }

  function finishRouteRoad() {
    if (routePreviewCoords.length >= 2) {
      const newRoad: RoadFeature = {
        id: crypto.randomUUID(),
        coords: routePreviewCoords,
        highway: 'residential',
        name: routeRoadName.trim() || undefined,
        confirmed: true,
        source: 'user'
      };
      onUpdateMapData({ roads: [...roads, newRoad] });
      setRdMsg(`Added road: ${routeRoadName || 'Unnamed'}`);
    }
    setRoutePts([]);
    setRoutePreviewCoords([]);
    setRouteRoadName('');
    setDrawingRouteRoad(false);
  }

  function undoRouteRoadPoint() {
    if (routePts.length <= 1) {
      setRoutePts([]);
      setRoutePreviewCoords([]);
      setRouteRoadName('');
      return;
    }
    
    const newPts = routePts.slice(0, -1);
    setRoutePts(newPts);
    if (newPts.length === 0) {
      setRoutePreviewCoords([]);
      setRouteRoadName('');
      return;
    }
    if (newPts.length === 1) {
      setRoutePreviewCoords([newPts[0]]);
      setRouteRoadName('');
      return;
    }
    
    rebuildRoutePreview(newPts);
  }

  async function rebuildRoutePreview(pts: Coordinate[]) {
    setRdLoading(true);
    setRdMsg('Recalculating route...');
    try {
      let merged: Coordinate[] = [pts[0]];
      let name = '';
      for (let i = 0; i < pts.length - 1; i++) {
        const p1 = pts[i], p2 = pts[i + 1];
        const url = `https://us1.locationiq.com/v1/directions/driving/${p1.lng},${p1.lat};${p2.lng},${p2.lat}?key=${LOCATIONIQ_KEY}&geometries=geojson&overview=full`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            const segment = route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
            merged = [...merged, ...segment.slice(1)];
            if (route.name && route.name !== 'Route' && route.name.trim() !== '') {
              name = route.name;
            }
          }
        }
      }
      setRoutePreviewCoords(merged);
      setRouteRoadName(name);
      setRdMsg('Undo successful.');
    } catch {
      setRdMsg('Failed to recalculate preview.');
    } finally {
      setRdLoading(false);
    }
  }

  async function autoNameSelectedRoad() {
    if (!selRoadId) return;
    const road = roads.find(r => r.id === selRoadId);
    if (!road || road.coords.length < 1) return;

    setRdLoading(true);
    setRdMsg('Querying LocationIQ for road name...');
    try {
      const midIdx = Math.floor(road.coords.length / 2);
      const pt = road.coords[midIdx];
      const url = `https://us1.locationiq.com/v1/reverse?key=${LOCATIONIQ_KEY}&lat=${pt.lat}&lon=${pt.lng}&format=json&addressdetails=1`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`LocationIQ HTTP ${response.status}`);
      const data = await response.json();
      
      const name = data.address?.road || data.address?.street || data.address?.pedestrian || data.address?.footway || data.address?.path;
      if (name && name.trim() !== '') {
        const updatedRoads = roads.map(r => r.id === selRoadId ? { ...r, name: name.trim() } : r);
        onUpdateRoadsLocally(updatedRoads);
        setRdMsg(`Auto-named road to: "${name}"`);
      } else {
        setRdMsg('LocationIQ did not return a road name for this location.');
      }
    } catch (err: any) {
      console.error(err);
      setRdMsg('Failed to query road name. Please type it manually.');
    } finally {
      setRdLoading(false);
    }
  }

  // Wrapper helper to keep update state stable
  function onUpdateRoadsLocally(updatedRoads: RoadFeature[]) {
    onUpdateMapData({ roads: updatedRoads });
  }

  async function snapSelectedRoad() {
    if (!selRoadId) return;
    const road = roads.find(r => r.id === selRoadId);
    if (!road || road.coords.length < 2) return;

    setRdLoading(true);
    setRdMsg('Snapping road geometry via LocationIQ Map Matching...');
    try {
      let pts = road.coords;
      if (pts.length > 60) {
        const step = Math.ceil(pts.length / 60);
        pts = pts.filter((_, idx) => idx % step === 0);
        if (pts[pts.length - 1] !== road.coords[road.coords.length - 1]) {
          pts.push(road.coords[road.coords.length - 1]);
        }
      }

      const coordsStr = pts.map(p => `${p.lng},${p.lat}`).join(';');
      const url = `https://us1.locationiq.com/v1/matching/driving/${coordsStr}?key=${LOCATIONIQ_KEY}&geometries=geojson&overview=full`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`LocationIQ map matching HTTP ${response.status}`);
      const data = await response.json();
      
      if (data.code === 'Ok' && data.matchings && data.matchings.length > 0) {
        const match = data.matchings[0];
        const newCoords = match.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
        
        let roadName = road.name;
        if (data.tracepoints) {
          const names = data.tracepoints
            .map((tp: any) => tp?.name)
            .filter((n: string | undefined) => n && n !== 'Route' && n.trim() !== '');
          if (names.length > 0) {
            const counts: Record<string, number> = {};
            names.forEach((n: string) => { counts[n] = (counts[n] || 0) + 1; });
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            roadName = sorted[0][0];
          }
        }

        const updatedRoads = roads.map(r => r.id === selRoadId ? { ...r, coords: newCoords, name: roadName } : r);
        onUpdateRoadsLocally(updatedRoads);
        setRdMsg(roadName ? `Snapped geometry and named: "${roadName}"` : 'Snapped road geometry.');
      } else {
        throw new Error('Matching unsuccessful');
      }
    } catch (err: any) {
      console.error(err);
      setRdMsg('Snapping failed. Road may be far from OSM grid or request failed.');
    } finally {
      setRdLoading(false);
    }
  }

  function deleteSelectedRoad() {
    if (!selRoadId) return;
    const updatedRoads = roads.filter(r => r.id !== selRoadId);
    onUpdateRoadsLocally(updatedRoads);
    setSelRoadId(null);
    setRdMsg('Road deleted. Click "Detect blocks" to update block divisions.');
  }

  function renameSelectedRoad() {
    if (!selRoadId) return;
    const road = roads.find(r => r.id === selRoadId);
    if (!road) return;
    const current = road.name || '';
    const n = prompt('Enter road name:', current);
    if (n === null) return;
    const updatedRoads = roads.map(r => r.id === selRoadId ? { ...r, name: n.trim() || undefined } : r);
    onUpdateRoadsLocally(updatedRoads);
    setRdMsg(n.trim() ? `Road renamed to "${n.trim()}"` : 'Road name cleared.');
  }

  // Assign serpentine house numbers across all blocks (reuses census ordering).
  function renumber(syms: PlacedSymbol[]): PlacedSymbol[] {
    const order = getSerpentineOrder(syms, blocks.length ? blocks : undefined, mapData.numberingSystem);
    const num = new Map<string, number>();
    let currentNum = 1;
    order.forEach((id) => {
      const s = syms.find(x => x.id === id);
      if (!s) return;
      num.set(id, currentNum);
      currentNum += (mapData.numberingSystem === 'census_u_loop' ? 1 : getUnitCount(s));
    });
    return syms.map(s => isHouseType(s.symbol_type) ? { ...s, number: num.get(s.id) ?? null } : s);
  }

  function detectBlocksAction() {
    if (!boundaryClosed || boundaryPins.length < 3) { setBlkMsg('Close the boundary first.'); return; }
    const manual = blocks.filter(b => b.autoDetected !== true);
    const detected = detectBlocks(roads, boundaryPins, { roadWidthMeters: roadWidth });
    onUpdateMapData({ blocks: relabelBlocks([...manual, ...detected]) });
    setSelIds([]);
    setBlkMsg(detected.length
      ? `Detected ${detected.length} blocks.`
      : roads.length ? 'No blocks — try a smaller road width, or add roads.' : 'Fetch or draw roads first.');
  }

  function populateBlock() {
    if (selIds.length !== 1) return;
    const blk = blocks.find(b => b.id === selIds[0]); if (!blk) return;
    // Use the built group list, or fall back to the single type+count inputs.
    const singleGroup: SymGroup = { type: popType, count: popCount, unitCount: popUnitCount > 1 ? popUnitCount : undefined };
    if (popIsNonRes && isHouseType(popType)) (singleGroup as any).isNonResidential = true;
    const recipe: SymGroup[] = groups.length ? groups : [singleGroup];
    const requested = recipe.reduce((s, g) => s + Math.max(0, g.count), 0);
    if (requested <= 0) return;
    const ring = blockPoints(blk);

    const symbolsInBlock = symbols.filter(s => {
      try { return pointInPolygon({ lat: s.lat, lng: s.lng }, ring); } catch { return false; }
    });
    
    // Preserve landmarks, labeled symbols, and manual symbols
    const preservedInBlock = symbolsInBlock.filter(s => {
      const isLandmark = !isHouseType(s.symbol_type);
      const isManual = s.is_manual || s.label !== undefined;
      return isLandmark || isManual;
    });

    const others = [
      ...symbols.filter(s => {
        try { return !pointInPolygon({ lat: s.lat, lng: s.lng }, ring); } catch { return true; }
      }),
      ...preservedInBlock
    ];

    // Create 5m exclusion zones around preserved symbols to prevent overlapping with auto-placed symbols
    const preservedExclusions: Coordinate[][] = preservedInBlock.map(s => {
      const latDelta = 2.5 / 111320;
      const lngDelta = 2.5 / (111320 * Math.cos((s.lat * Math.PI) / 180));
      return [
        { lat: s.lat - latDelta, lng: s.lng - lngDelta },
        { lat: s.lat + latDelta, lng: s.lng - lngDelta },
        { lat: s.lat + latDelta, lng: s.lng + lngDelta },
        { lat: s.lat - latDelta, lng: s.lng + lngDelta },
      ];
    });

    const activeExclusions = [...exclusionPolys(), ...preservedExclusions];

    let placed = placeGroupsInBlock(blk, recipe, { layout: popLayout, roads, exclusions: activeExclusions });
    // Apply non-residential flag per group slice
    let offset = 0;
    for (const g of recipe) {
      if ((g as any).isNonResidential) {
        for (let k = offset; k < offset + g.count && k < placed.length; k++) {
          placed[k] = { ...placed[k], is_residential: false };
        }
      }
      offset += g.count;
    }
    
    const preservedHousesCount = preservedInBlock.filter(s => isHouseType(s.symbol_type)).length;

    onUpdateMapData({
      blocks: blocks.map(b => b.id === blk.id ? { ...b, layoutMode: popLayout, houseCount: placed.length + preservedHousesCount } : b),
      symbols: renumber([...others, ...placed]),
    });
    setBlkMsg(placed.length < requested
      ? `Placed ${placed.length} of ${requested} — block is full (exclusions/landmarks preserved).`
      : `Placed ${placed.length} in block ${blk.label}.`);
  }

  function finishField() {
    if (fieldPts.length >= 3) {
      onUpdateMapData({ farmlandBlocks: [...fields, { id: crypto.randomUUID(), label: 'Field', points: fieldPts }] });
      setBlkMsg('Field added — houses will avoid it.');
    }
    setFieldDrawing(false); setFieldPts([]);
  }

  function doMerge() {
    if (selIds.length < 2) return;
    const a = blocks.find(b => b.id === selIds[0]); const b2 = blocks.find(b => b.id === selIds[1]);
    if (!a || !b2) return;
    const merged = mergeBlocks(a, b2);
    if (!merged) { setBlkMsg('Those blocks are not adjacent — cannot merge.'); return; }
    const rest = blocks.filter(b => b.id !== a.id && b.id !== b2.id);
    onUpdateMapData({ blocks: relabelBlocks([...rest, merged]) });
    setSelIds([]); setBlkMsg('Merged.');
  }

  function deleteSelected() {
    if (!selIds.length) return;
    onUpdateMapData({ blocks: relabelBlocks(blocks.filter(b => !selIds.includes(b.id))) });
    setSelIds([]);
  }

  function renameBlock() {
    if (selIds.length !== 1) return;
    const blk = blocks.find(b => b.id === selIds[0]); if (!blk) return;
    const name = prompt('Block label', blk.label);
    if (name == null) return;
    onUpdateMapData({ blocks: blocks.map(b => b.id === blk.id ? { ...b, label: name } : b) });
  }

  function applySplit() {
    const blk = blocks.find(b => b.id === selIds[0]);
    if (!blk || cutPts.length < 2) { setCutting(false); setCutPts([]); return; }
    const parts = splitBlock(blk, cutPts);
    const rest = blocks.filter(b => b.id !== blk.id);
    if (parts.length > 1) onUpdateMapData({ blocks: relabelBlocks([...rest, ...parts]) });
    setCutting(false); setCutPts([]); setSelIds([]);
    setBlkMsg(parts.length > 1 ? `Split into ${parts.length} blocks.` : 'Cut did not divide the block.');
  }

  // ─── UI ─────────────────────────────────────────────────────
  const area = boundaryPins.length >= 3 ? polygonArea(boundaryPins) : 0;
  const areaT = area > 10000 ? `${(area / 10000).toFixed(2)} ha` : `${Math.round(area)} m²`;
  const houseCount = symbols.filter(s => isHouseType(s.symbol_type)).length;

  return (
    <div className="h-full w-full relative" style={{ background: SCHEMATIC_BG }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-[1001] flex items-center gap-2 px-3 py-2 bg-white/90 backdrop-blur border-b border-black/5">
        <button 
          onClick={onExitToDashboard} 
          className="text-xs font-semibold text-gray-600 px-3 py-1 hover:bg-black/5 rounded-lg border border-gray-200 transition-colors flex items-center gap-1"
          style={{ minHeight: '36px' }}
        >
          ← Exit
        </button>
        <span className="font-bold text-sm text-[var(--color-charcoal)] hidden xs:inline flex items-center gap-1">
          🧩 Canvas Blocks
        </span>
        <button 
          onClick={() => { setShowHelp(true); setHelpStep(0); }} 
          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold flex items-center gap-1 border border-amber-200 transition-all max-sm:ml-1"
          style={{ minHeight: '36px' }}
          title="Open guided editor help"
        >
          ❓ Help Guide
        </button>
        <div className="ml-auto flex items-center gap-1 text-[11px]">
          {/* Desktop phase indicator */}
          <div className="hidden sm:flex items-center gap-1">
            {(['location', 'boundary', 'roads', 'canvas'] as Phase[]).map((p, i) => (
              <span 
                key={p} 
                className={`px-2 py-0.5 rounded-full font-semibold capitalize transition-all ${
                  phase === p ? 'bg-emerald-600 text-white shadow-xs' : 'bg-gray-100 text-gray-400'
                }`}
              >
                {i + 1}. {p}
              </span>
            ))}
          </div>
          {/* Mobile phase indicator */}
          <div className="sm:hidden">
            <span className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-full font-bold text-[10px] uppercase tracking-wide shadow-xs">
              Step {(['location', 'boundary', 'roads', 'canvas'] as Phase[]).indexOf(phase) + 1}/4: {phase}
            </span>
          </div>
        </div>
      </div>

      {/* Layer toggles (canvas phase) */}
      {phase === 'canvas' && (
        <div className="absolute top-14 left-3 z-[1002] bg-white/95 rounded-xl shadow-md border border-black/5 p-1 flex flex-col gap-1 text-xs transition-all">
          <button 
            onClick={() => setShowLayers(!showLayers)} 
            className="flex items-center gap-1.5 font-bold px-2.5 py-1.5 hover:bg-gray-100 rounded-lg text-gray-700 transition-colors"
            style={{ minHeight: '36px' }}
          >
            🥞 Layers {showLayers ? '▼' : '▲'}
          </button>
          {showLayers && (
            <div className="flex flex-col gap-1.5 px-2 pb-1.5 border-t pt-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
              {(Object.keys(layers) as (keyof typeof layers)[]).map(k => (
                <label key={k} className="flex items-center gap-2 cursor-pointer capitalize py-1 text-gray-700 font-medium">
                  <input 
                    type="checkbox" 
                    checked={layers[k]} 
                    onChange={e => setLayers(l => ({ ...l, [k]: e.target.checked }))} 
                    className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                  />
                  {k}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom panel */}
      <div 
        className={`absolute bottom-0 left-0 right-0 z-[1001] bg-white/95 backdrop-blur border-t border-black/5 flex flex-col transition-all duration-300 shadow-lg ${
          panelExpanded ? 'max-h-[52%] overflow-y-auto p-3.5' : 'overflow-hidden'
        }`}
        style={panelExpanded
          ? { paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))' }
          : { height: 'calc(52px + env(safe-area-inset-bottom, 0px))', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }
        }
      >
        {/* Panel Header bar with minimize/expand controls */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[var(--color-saffron)] capitalize">
              {phase === 'location' && '📍 1. Region Location'}
              {phase === 'boundary' && '🔴 2. Outer Boundary'}
              {phase === 'roads' && '🛣️ 3. Road Networks'}
              {phase === 'canvas' && '🧩 4. Canvas Editor'}
            </span>
            {phase === 'canvas' && (
              <span className="text-xs bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full font-bold border border-emerald-100">
                {blocks.length} blocks · {houseCount} houses
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button 
              onClick={() => setPanelExpanded(!panelExpanded)} 
              className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-bold transition-all border border-gray-200"
              style={{ minHeight: '32px' }}
            >
              {panelExpanded ? 'Collapse ▽' : 'Expand △'}
            </button>
          </div>
        </div>

        {/* Panel Content (Visible only when expanded, or scrollable) */}
        {panelExpanded && (
          <div className="flex flex-col gap-3 flex-grow">
            {/* Selected Road Actions (LocationIQ features & Delete) */}
            {selRoadId && (
              <div className="flex gap-2 flex-wrap items-center bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs">
                <span className="font-bold text-amber-950 flex items-center gap-1 mr-1">
                  🛣️ Road: "{roads.find(r => r.id === selRoadId)?.name || 'Unnamed'}"
                </span>
                <button onClick={renameSelectedRoad} className="px-3 py-1 bg-white border border-amber-300 rounded-lg hover:bg-gray-50 font-bold text-gray-700 shadow-xs" style={{ minHeight: '36px' }}>✏️ Rename</button>
                <button onClick={autoNameSelectedRoad} disabled={rdLoading} className="px-3 py-1 bg-amber-100 border border-amber-300 text-amber-900 rounded-lg hover:bg-amber-200 font-bold shadow-xs disabled:opacity-50" style={{ minHeight: '36px' }} title="Query LocationIQ Reverse Geocoding for street name">🏷️ Auto-name</button>
                <button onClick={snapSelectedRoad} disabled={rdLoading} className="px-3 py-1 bg-purple-100 border border-purple-300 text-purple-900 rounded-lg hover:bg-purple-200 font-bold shadow-xs disabled:opacity-50" style={{ minHeight: '36px' }} title="Snap drawn geometry using LocationIQ Map Matching">✨ Snap geometry</button>
                <button onClick={deleteSelectedRoad} className="px-3 py-1 bg-red-50 border border-red-200 text-red-700 rounded-lg hover:bg-red-100 font-bold ml-auto shadow-xs" style={{ minHeight: '36px' }}>🗑️ Delete Road</button>
              </div>
            )}

            {phase === 'location' && (
              <div className="flex flex-col gap-3">
                {mapData.paymentStatus === 'paid' && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 flex gap-2 text-xs font-semibold">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <span>Latitude, longitude, and boundary cannot be changed after payment.</span>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">Paste Census SMS (Auto-detects HLB & location)</label>
                  <textarea
                    value={smsText}
                    onChange={e => handleSMSChange(e.target.value)}
                    placeholder="Example: HLB 0455 assigned to you. Location: https://maps.google.com/?q=26.4499,80.3319"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500 focus:border-transparent min-h-[50px] resize-none font-medium text-gray-700 shadow-xs disabled:opacity-60"
                    disabled={mapData.paymentStatus === 'paid'}
                  />
                </div>
                <p className="text-xs text-gray-600 font-medium">Or enter base coordinates manually:</p>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="flex gap-1.5 items-center">
                    <span className="text-xs font-semibold text-gray-400">Lat</span>
                    <input value={latIn} onChange={e => setLatIn(e.target.value)} placeholder="lat" className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-28 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium disabled:opacity-60" disabled={mapData.paymentStatus === 'paid'} />
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <span className="text-xs font-semibold text-gray-400">Lng</span>
                    <input value={lngIn} onChange={e => setLngIn(e.target.value)} placeholder="lng" className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm w-28 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-medium disabled:opacity-60" disabled={mapData.paymentStatus === 'paid'} />
                  </div>
                  <button onClick={recenter} disabled={mapData.paymentStatus === 'paid'} className="px-4 py-1.5 bg-gray-100 border border-gray-200 text-gray-700 rounded-lg text-sm font-bold hover:bg-gray-200 transition-colors shadow-xs disabled:opacity-50" style={{ minHeight: '38px' }}>Go</button>
                </div>
                <button onClick={() => setPhase('boundary')} className="px-5 py-2.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl font-bold text-sm self-start transition-all shadow-md active:scale-98 flex items-center gap-1" style={{ minHeight: '44px' }}>
                  {mapData.paymentStatus === 'paid' ? 'View Boundary →' : 'Start Boundary Draft →'}
                </button>
              </div>
            )}

            {phase === 'boundary' && (
              <div className="flex flex-col gap-2.5">
                {mapData.paymentStatus === 'paid' && (
                  <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3 flex gap-2 text-xs font-semibold">
                    <span className="shrink-0 text-sm">⚠️</span>
                    <span>Latitude, longitude, and boundary cannot be changed after payment.</span>
                  </div>
                )}
                <p className="text-xs text-gray-600 font-medium flex items-center gap-1">
                  📌 Tap map to drop boundary pins. <strong>{boundaryPins.length} pins placed</strong> {area > 0 && `· Area: ${areaT}`}
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  {mapData.paymentStatus !== 'paid' && (
                    <button onClick={() => onUpdateMapData({ boundaryPins: boundaryPins.slice(0, -1), boundaryClosed: false })} disabled={!boundaryPins.length} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-bold disabled:opacity-40 transition-colors" style={{ minHeight: '40px' }}>Undo last pin</button>
                  )}
                  {(!boundaryClosed && mapData.paymentStatus !== 'paid') ? (
                    <button onClick={closeBoundary} disabled={boundaryPins.length < 3} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-bold disabled:opacity-40 transition-colors shadow-sm" style={{ minHeight: '40px' }}>Close boundary</button>
                  ) : (
                    (boundaryClosed || mapData.paymentStatus === 'paid') && (
                      <button onClick={() => setPhase('roads')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-md active:scale-98" style={{ minHeight: '44px' }}>Continue to Roads →</button>
                    )
                  )}
                  <button onClick={() => setPhase('location')} className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-bold" style={{ minHeight: '40px' }}>← back</button>
                </div>
              </div>
            )}

            {phase === 'roads' && (
              <div className="flex flex-col gap-2.5">
                <p className="text-xs text-gray-600 font-medium">
                  Fetch existing roads, or manually draw and snap yours. <strong>{roads.length} roads</strong>. {rdMsg && <span className="text-emerald-700 font-bold ml-1">{rdMsg}</span>}
                </p>
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={fetchRoads} disabled={rdLoading} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold disabled:opacity-50 transition-colors shadow-sm" style={{ minHeight: '40px' }}>{rdLoading ? 'Fetching OSM…' : 'Fetch OSM roads'}</button>
                  
                  {!drawingRoad && !drawingRouteRoad && (
                    <>
                      <button onClick={() => { setDrawingRoad(true); setSelRoadId(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg text-sm font-bold transition-colors" style={{ minHeight: '40px' }}>✏️ Draw road</button>
                      <button onClick={() => { setDrawingRouteRoad(true); setRoutePts([]); setRoutePreviewCoords([]); setRouteRoadName(''); setSelRoadId(null); }} className="px-4 py-2 bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-sm font-bold transition-colors" style={{ minHeight: '40px' }} title="Create road snapped to network using LocationIQ Directions">🛣️ Route-draw</button>
                    </>
                  )}

                  {drawingRoad && (
                    <>
                      <button onClick={finishDrawnRoad} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-sm" style={{ minHeight: '40px' }}>Finish road ({drwPts.length})</button>
                      <button onClick={() => { setDrwPts([]); setDrawingRoad(false); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold" style={{ minHeight: '40px' }}>Cancel</button>
                    </>
                  )}

                  {drawingRouteRoad && (
                    <>
                      <button onClick={finishRouteRoad} disabled={routePreviewCoords.length < 2} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-bold shadow-sm disabled:opacity-40" style={{ minHeight: '40px' }}>Finish route ({routePts.length} clicks)</button>
                      <button onClick={undoRouteRoadPoint} disabled={routePts.length === 0} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-semibold disabled:opacity-40" style={{ minHeight: '40px' }}>Undo pt</button>
                      <button onClick={() => { setRoutePts([]); setRoutePreviewCoords([]); setRouteRoadName(''); setDrawingRouteRoad(false); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-semibold" style={{ minHeight: '40px' }}>Cancel</button>
                    </>
                  )}

                  <button onClick={() => setPhase('canvas')} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-all shadow-md ml-auto max-sm:w-full max-sm:text-center" style={{ minHeight: '44px' }}>Continue to Editor →</button>
                  <button onClick={() => setPhase('boundary')} className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-bold" style={{ minHeight: '40px' }}>← back</button>
                </div>
              </div>
            )}

            {phase === 'canvas' && (
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={detectBlocksAction} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors" style={{ minHeight: '40px' }}>🔍 Detect blocks</button>
                  <label className="flex items-center gap-1.5 text-xs text-gray-600 font-semibold bg-gray-50 px-2.5 py-1 rounded-lg border" title="Assumed road width carved between blocks">
                    Road buffer
                    <input type="range" min={3} max={20} step={1} value={roadWidth} onChange={e => setRoadWidth(parseInt(e.target.value))} className="w-16 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer" />
                    <span className="tabular-nums font-bold text-gray-800">{roadWidth}m</span>
                  </label>
                  <button onClick={() => onUpdateMapData({ symbols: renumber(symbols) })} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 border rounded-lg text-xs font-bold transition-colors" style={{ minHeight: '38px' }}>↻ Renumber</button>
                  <select
                    value={mapData.numberingSystem || 'serpentine'}
                    onChange={(e) => {
                      const val = e.target.value as 'serpentine' | 'census_u_loop';
                      const order = getSerpentineOrder(symbols, blocks.length ? blocks : undefined, val);
                      const num = new Map<string, number>();
                      let currentNum = 1;
                      order.forEach((id) => {
                        const s = symbols.find(x => x.id === id);
                        if (!s) return;
                        num.set(id, currentNum);
                        currentNum += (val === 'census_u_loop' ? 1 : getUnitCount(s));
                      });
                      const renumbered = symbols.map(s => isHouseType(s.symbol_type) ? { ...s, number: num.get(s.id) ?? null } : s);
                      onUpdateMapData({ numberingSystem: val, symbols: renumbered });
                    }}
                    className="border border-gray-200 rounded-lg p-2 text-xs bg-gray-50 text-gray-700 font-semibold focus:outline-none"
                    style={{ minHeight: '38px' }}
                  >
                    <option value="serpentine">🐍 Serpentine</option>
                    <option value="census_u_loop">🏛️ U-Loop</option>
                  </select>
                  <label className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${arrangeMode ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`} style={{ minHeight: '38px', display: 'inline-flex', alignItems: 'center' }}>
                    <input type="checkbox" className="hidden" checked={arrangeMode} onChange={e => { setArrangeMode(e.target.checked); if (e.target.checked) { setSwapMode(false); setSwapFirst(null); setManualNumMode(false); } }} />
                    ✋ Arrange {arrangeMode ? 'ON' : 'OFF'}
                  </label>
                  <label className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${swapMode ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`} style={{ minHeight: '38px', display: 'inline-flex', alignItems: 'center' }}>
                    <input type="checkbox" className="hidden" checked={swapMode} onChange={e => { setSwapMode(e.target.checked); setSwapFirst(null); if (e.target.checked) { setArrangeMode(false); setManualNumMode(false); } }} />
                    ⇄ Swap {swapMode ? 'ON' : 'OFF'}
                  </label>
                  <label className={`px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-all ${manualNumMode ? 'bg-yellow-600 text-white border-yellow-600 shadow-sm' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200'}`} style={{ minHeight: '38px', display: 'inline-flex', alignItems: 'center' }}>
                    <input type="checkbox" className="hidden" checked={manualNumMode} onChange={e => { setManualNumMode(e.target.checked); if (e.target.checked) { setArrangeMode(false); setSwapMode(false); setSwapFirst(null); } }} />
                    ✏️ Manual Numbering {manualNumMode ? 'ON' : 'OFF'}
                  </label>
                  {!fieldDrawing && !cutting && <button onClick={() => { setFieldDrawing(true); setFieldPts([]); setSelIds([]); }} className="px-3.5 py-2 bg-green-100 hover:bg-green-200 text-green-800 rounded-lg text-xs font-bold border border-green-200 transition-colors" style={{ minHeight: '38px' }}>🟩 Draw Field</button>}
                  {fields.length > 0 && <button onClick={() => onUpdateMapData({ farmlandBlocks: [] })} className="px-3 py-2 bg-gray-100 hover:bg-gray-200 border rounded-lg text-xs font-semibold transition-colors" style={{ minHeight: '38px' }}>Clear fields ({fields.length})</button>}
                  <button onClick={() => setPhase('roads')} className="px-3 py-2 text-gray-500 hover:text-gray-700 text-xs font-bold" style={{ minHeight: '38px' }}>← roads</button>
                  <button onClick={onJumpToPreview} className="px-5 py-2.5 bg-[var(--color-saffron-container)] hover:bg-[var(--color-saffron)] text-white rounded-xl font-bold text-sm ml-auto shadow-md transition-all active:scale-98 max-sm:w-full max-sm:text-center max-sm:mt-1" style={{ minHeight: '44px' }}>Preview &amp; Export →</button>
                </div>

                {blkMsg && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg font-medium">{blkMsg}</p>}

                {/* Manual Numbering Panel */}
                {manualNumMode && (
                  <div className="flex gap-3 flex-wrap items-center bg-yellow-50 border border-yellow-250 rounded-xl p-3 animate-in zoom-in-98 duration-150">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-yellow-900">Next Number to Assign:</span>
                      <input
                        type="number"
                        min="1"
                        value={nextManualNum}
                        onChange={e => setNextManualNum(Math.max(1, parseInt(e.target.value) || 1))}
                        className="border border-yellow-300 rounded-lg px-2.5 py-1 w-20 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-yellow-500"
                        style={{ minHeight: '36px' }}
                      />
                      {symbols.some(s => s.number === nextManualNum) && (
                        <span className="text-[10px] text-red-500 font-bold">⚠️ Already assigned</span>
                      )}
                    </div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-yellow-900 cursor-pointer py-1 px-2.5 bg-white border border-yellow-200 rounded-lg" style={{ minHeight: '36px' }}>
                      <input
                        type="checkbox"
                        checked={manualNumClearMode}
                        onChange={e => setManualNumClearMode(e.target.checked)}
                        className="rounded border-yellow-300 text-yellow-600 focus:ring-yellow-500 w-4 h-4"
                      />
                      🧹 Eraser Mode (click to clear)
                    </label>
                    <button
                      onClick={() => {
                        const maxAssigned = symbols.reduce((m, s) => Math.max(m, s.number ?? 0), 0);
                        setNextManualNum(maxAssigned + 1);
                      }}
                      className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg text-xs font-bold hover:bg-yellow-700 transition-colors shadow-xs cursor-pointer"
                      style={{ minHeight: '36px' }}
                    >
                      Reset to Max+1
                    </button>
                    
                    <button
                      onClick={clearAllNumbers}
                      className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors shadow-xs cursor-pointer"
                      style={{ minHeight: '36px' }}
                    >
                      🗑️ Erase All Numbers
                    </button>

                    <button
                      onClick={clearSelectedBlockNumbers}
                      className={`px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer ${
                        selIds.length === 1
                          ? 'bg-orange-600 hover:bg-orange-700 border-orange-600 text-white'
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                      }`}
                      style={{ minHeight: '36px' }}
                      title={selIds.length === 1 ? undefined : 'Select a block on the map first'}
                    >
                      🧹 Erase Block Numbers {selIds.length === 1 ? `(Block ${blocks.find(b => b.id === selIds[0])?.label ?? ''})` : ''}
                    </button>

                    <button
                      onClick={saveDraftAction}
                      disabled={savingDraft}
                      className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 disabled:bg-emerald-400 disabled:cursor-not-allowed transition-colors shadow-xs cursor-pointer"
                      style={{ minHeight: '36px' }}
                    >
                      {savingDraft ? '⏳ Saving...' : '💾 Save as Draft'}
                    </button>

                    <span className="text-[10px] text-yellow-800 font-semibold w-full">💡 Tap a house on the map to number or clear it. Select a block to enable "Erase Block Numbers".</span>
                  </div>
                )}

                {/* Field drawing */}
                {fieldDrawing && (
                  <div className="flex gap-2 items-center bg-green-50 border border-green-200 rounded-xl p-2.5 animate-in slide-in-from-bottom-2 duration-150">
                    <span className="text-xs font-semibold text-green-900 flex-grow">Outline a field — houses will skip it ({fieldPts.length} points).</span>
                    <button onClick={() => setFieldPts(p => p.slice(0, -1))} disabled={!fieldPts.length} className="px-3 py-1.5 bg-white border border-green-300 rounded-lg text-xs font-bold disabled:opacity-40" style={{ minHeight: '36px' }}>Undo</button>
                    <button onClick={finishField} disabled={fieldPts.length < 3} className="px-3.5 py-1.5 bg-green-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 shadow-sm" style={{ minHeight: '36px' }}>Finish field</button>
                    <button onClick={() => { setFieldDrawing(false); setFieldPts([]); }} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-semibold" style={{ minHeight: '36px' }}>Cancel</button>
                  </div>
                )}

                {/* Cut mode */}
                {cutting && (
                  <div className="flex gap-2 items-center bg-pink-50 border border-pink-200 rounded-xl p-2.5 animate-in slide-in-from-bottom-2 duration-150">
                    <span className="text-xs font-semibold text-pink-900 flex-grow">Tap map to draw a cutting line ({cutPts.length} points), then Apply.</span>
                    <button onClick={applySplit} disabled={cutPts.length < 2} className="px-3.5 py-1.5 bg-pink-600 text-white rounded-lg text-xs font-bold disabled:opacity-40 shadow-sm" style={{ minHeight: '36px' }}>Apply split</button>
                    <button onClick={() => { setCutting(false); setCutPts([]); }} className="px-3 py-1.5 bg-gray-100 rounded-lg text-xs font-semibold" style={{ minHeight: '36px' }}>Cancel</button>
                  </div>
                )}

                {/* Selection-aware block actions */}
                {!cutting && selIds.length > 0 && (
                  <div className="flex gap-2 flex-wrap items-center bg-blue-50 border border-blue-200 rounded-xl p-2.5 animate-in zoom-in-95 duration-150">
                    <span className="text-xs font-bold text-blue-900 mr-1">📂 Block {selIds.map(id => id.replace('blk_', '')).join(', ')} Selected:</span>
                    {selIds.length === 1 && (
                      <>
                        <button onClick={renameBlock} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-900 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors shadow-xs" style={{ minHeight: '36px' }}>✏️ Rename</button>
                        <button onClick={() => { setCutting(true); setCutPts([]); }} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-900 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors shadow-xs" style={{ minHeight: '36px' }}>✂️ Split Block</button>
                      </>
                    )}
                    {selIds.length >= 2 && <button onClick={doMerge} className="px-3 py-1.5 bg-white border border-blue-300 text-blue-900 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors shadow-xs" style={{ minHeight: '36px' }}>🔗 Merge Blocks</button>}
                    <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors shadow-xs ml-auto" style={{ minHeight: '36px' }}>🗑️ Delete items</button>
                    <button onClick={() => setSelIds([])} className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-xs font-bold" style={{ minHeight: '36px' }}>Clear Selection</button>
                  </div>
                )}

                {/* Populate a single selected block — build a mix of symbol groups */}
                {!cutting && !fieldDrawing && selIds.length === 1 && (
                  <div className="flex flex-col gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl p-3 animate-in zoom-in-98 duration-150">
                    <div className="flex gap-2 flex-wrap items-center">
                      <span className="text-xs font-bold text-emerald-950">Add Houses/Landmarks:</span>
                      <input 
                        type="number" 
                        min={1} 
                        value={popCount} 
                        onChange={e => setPopCount(Math.max(1, parseInt(e.target.value) || 1))} 
                        className="border border-emerald-300 rounded-lg px-2.5 py-1 w-16 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        style={{ minHeight: '36px' }}
                        title="Number of buildings"
                      />
                      <select 
                        value={popType} 
                        onChange={e => setPopType(e.target.value as SymbolType)} 
                        className="border border-emerald-300 rounded-lg px-2 py-1 text-xs bg-white font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        style={{ minHeight: '36px' }}
                      >
                        <optgroup label="Houses">
                          {SYMBOL_DEFS.filter(d => d.isHouse).map(d => <option key={d.type} value={d.type}>{d.label}</option>)}
                        </optgroup>
                        <optgroup label="Non-Residential Kutcha">
                          <option value="kutcha_house" data-nonres="true">Kutcha House (Non-Res)</option>
                        </optgroup>
                        <optgroup label="Landmarks &amp; Facilities">
                          {SYMBOL_DEFS.filter(d => !d.isHouse).map(d => <option key={`lmk-${d.type}`} value={d.type}>{d.label}</option>)}
                        </optgroup>
                      </select>
                      {/* Flats / census-houses per building — apartments only */}
                      {popType === 'apartment' && (
                        <div className="flex items-center gap-1.5 bg-white border border-emerald-200 rounded-lg px-2 py-1" style={{ minHeight: '36px' }}>
                          <span className="text-[11px] font-bold text-emerald-900 whitespace-nowrap">🏢 Flats:</span>
                          <input
                            type="number"
                            min={2}
                            max={99}
                            value={popUnitCount}
                            onChange={e => setPopUnitCount(Math.max(2, Math.min(99, parseInt(e.target.value) || 2)))}
                            className="border border-emerald-200 rounded px-1.5 py-0.5 w-12 text-xs bg-white font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                            title="Number of flats/units within each apartment building"
                          />
                          <span className="text-[10px] text-emerald-600 font-bold">flats/bldg</span>
                        </div>
                      )}
                      {/* Non-residential toggle — only for house types */}
                      {isHouseType(popType) && (
                        <label className="flex items-center gap-1 text-xs font-bold text-emerald-900 cursor-pointer py-1 px-1.5 bg-white border border-emerald-200 rounded-lg" style={{ minHeight: '36px' }}>
                          <input 
                            type="checkbox" 
                            checked={popIsNonRes} 
                            onChange={e => setPopIsNonRes(e.target.checked)}
                            className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 w-4.5 h-4.5"
                          />
                          Non-res
                        </label>
                      )}
                      <button
                        onClick={() => {
                          const grp: SymGroup = { type: popType, count: popCount, unitCount: popUnitCount > 1 ? popUnitCount : undefined };
                          if (popIsNonRes) (grp as any).isNonResidential = true;
                          setGroups(g => [...g, grp]);
                        }}
                        className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors shadow-xs flex items-center gap-0.5"
                        style={{ minHeight: '36px' }}
                      >
                        ➕ Add Group
                      </button>
                      <span className="ml-auto text-xs font-bold text-gray-500">Layout style</span>
                      <select 
                        value={popLayout} 
                        onChange={e => setPopLayout(e.target.value as LayoutMode)} 
                        className="border border-emerald-300 rounded-lg px-2 py-1 text-xs bg-white font-medium focus:outline-none"
                        style={{ minHeight: '36px' }}
                      >
                        <option value="grid">Grid (Fill Block)</option>
                        <option value="rows">Rows (Along Roads)</option>
                        <option value="serpentine">Serpentine (Boustrophedon)</option>
                      </select>
                    </div>
                    {groups.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap items-center bg-white/70 border border-emerald-100 p-2 rounded-lg">
                        {groups.map((g, i) => (
                          <span key={i} className="inline-flex items-center gap-1.5 bg-white border border-emerald-200 rounded-full px-3 py-1 text-xs font-semibold text-emerald-800 shadow-2xs">
                            {SYMBOL_DEFS.find(d => d.type === g.type)?.label}{(g as any).isNonResidential ? ' (Non-Res)' : ''} ×{g.count}{g.unitCount && g.unitCount > 1 ? ` [${g.unitCount} flats]` : ''}
                            <button onClick={() => setGroups(gs => gs.filter((_, j) => j !== i))} className="text-red-500 font-bold hover:text-red-700 px-1 text-sm">×</button>
                          </span>
                        ))}
                        <button onClick={() => setGroups([])} className="text-gray-500 text-xs font-bold ml-1 hover:text-gray-700 px-2">Clear all</button>
                      </div>
                    )}
                    <div className="flex gap-3 items-center flex-wrap">
                      <button onClick={populateBlock} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md" style={{ minHeight: '40px' }}>
                        🚀 Populate Block {groups.length ? `(${groups.reduce((s, g) => s + g.count, 0)} mixed)` : `with ${popCount} symbols`}
                      </button>
                      <span className="text-[11px] text-gray-500 font-medium">💡 Tapping houses when <strong>Swap ON</strong> swaps their survey sequence numbers.</span>
                    </div>
                  </div>
                )}

                {/* ── Print Preview ── */}
                <div className="border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setShowPreview(p => !p)}
                    className="text-xs font-bold text-gray-600 flex items-center gap-1 hover:text-gray-900 py-1"
                    style={{ minHeight: '32px' }}
                  >
                    🖨️ {showPreview ? 'Hide' : 'Show'} print preview sheet
                  </button>
                  {showPreview && (
                    <div className="mt-2 rounded-xl overflow-hidden border border-gray-200 shadow-sm bg-white p-2.5 self-start max-w-sm">
                      <canvas
                        ref={el => {
                          previewCanvasRef.current = el;
                          if (el) {
                            try {
                              renderMapToCanvas(el as any, mapData, 380, 240);
                            } catch (e) {
                              console.error('preview render error', e);
                            }
                          }
                        }}
                        style={{ display: 'block', width: '100%', maxWidth: 380, height: 'auto', borderRadius: '8px' }}
                      />
                      <p className="text-[10px] text-gray-400 text-center pt-1.5 font-semibold">Live Preview Sheet — click "Preview &amp; Export" above for HD PDF</p>
                    </div>
                  )}
                </div>

                {/* Drag-and-drop palette */}
                <div className="flex gap-2 flex-wrap items-center border-t border-gray-100 pt-3">
                  <span className="text-[11px] font-bold text-gray-500 mr-1 uppercase tracking-wide">Drag onto a block:</span>
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
                    {SYMBOL_DEFS.map(d => (
                      <div key={d.type} draggable
                        onDragStart={e => e.dataTransfer.setData('symtype', d.type)}
                        title={d.label}
                        className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 hover:border-emerald-500 rounded-xl cursor-grab active:cursor-grabbing transition-all hover:scale-105 active:scale-95 shadow-3xs"
                        dangerouslySetInnerHTML={{ __html: getSmallSymbolSVG(d.type) }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Help Tour Dialog Overlay */}
      {showHelp && (
        <div className="absolute inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            {/* Modal Header */}
            <div className="px-4 py-3 bg-[var(--color-saffron)] text-white flex items-center justify-between">
              <span className="font-bold flex items-center gap-2">
                📖 NakshaBot Editor Guide
              </span>
              <button 
                onClick={() => setShowHelp(false)} 
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20 hover:bg-white/30 text-white text-lg font-bold transition-colors"
              >
                ✕
              </button>
            </div>
            {/* Modal Body */}
            <div className="flex-grow p-5 overflow-y-auto text-sm text-[var(--color-charcoal)]">
              {helpStep === 0 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-[var(--color-saffron)]">Welcome to Census Map Maker!</h3>
                  <p>This editor helps you prepare official maps for the 2027 Census. The editing process is split into 4 simple steps shown at the top of your screen.</p>
                  <p className="bg-amber-50 border border-amber-200 text-amber-800 p-2.5 rounded-lg text-xs leading-relaxed font-semibold">
                    💡 Pro Tip: On mobile devices, you can collapse the bottom controls panel anytime using the "Collapse ▽" button to get a full view of your map canvas.
                  </p>
                </div>
              )}
              {helpStep === 1 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-[var(--color-saffron)]">📍 Step 1: Set Location</h3>
                  <p>In this phase, you set the geographic center of your census block.</p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-xs text-gray-600 font-semibold">
                    <li>Input the GPS coordinates (Latitude & Longitude) of your region.</li>
                    <li>Click "Go" to pan the map automatically to the target center.</li>
                    <li>Once positioned, click "Start Boundary Draft →" to lock in the center.</li>
                  </ul>
                </div>
              )}
              {helpStep === 2 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-[var(--color-saffron)]">🔴 Step 2: Trace Boundary</h3>
                  <p>Define the outer boundaries of your census block unit.</p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-xs text-gray-600 font-semibold">
                    <li><strong>Drop Pins:</strong> Tap on the map to place pins outlining the border. You need at least 3 pins.</li>
                    <li><strong>Adjustments:</strong> Use "Undo last pin" to correct the last point.</li>
                    <li><strong>Finish:</strong> Click "Close boundary" to secure the polygon boundaries.</li>
                  </ul>
                </div>
              )}
              {helpStep === 3 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-[var(--color-saffron)]">🛣️ Step 3: Draw Roads</h3>
                  <p>Trace the road network to define individual census blocks.</p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-xs text-gray-600 font-semibold">
                    <li><strong>OSM Sync:</strong> Click "Fetch OSM roads" to instantly load public roads.</li>
                    <li><strong>Draw Manually:</strong> Tap "Draw road", then click points along the street. Click "Finish road" when done.</li>
                    <li><strong>Route Snapping:</strong> Tap "Route-draw", click start/endpoints, and LocationIQ will match the coordinates to real roads.</li>
                    <li><strong>Modify/Delete:</strong> Tap any road line on the map to rename, snap, or delete it.</li>
                  </ul>
                </div>
              )}
              {helpStep === 4 && (
                <div className="flex flex-col gap-3">
                  <h3 className="font-bold text-lg text-[var(--color-saffron)]">🧩 Step 4: Populate &amp; Edit Canvas</h3>
                  <p>Split the boundary into census blocks and place symbols.</p>
                  <ul className="list-disc pl-5 flex flex-col gap-1.5 text-xs text-gray-600 font-semibold">
                    <li><strong>Block Detection:</strong> Tap "Detect blocks". Roads will partition the boundary into blocks.</li>
                    <li><strong>Populate Houses:</strong> Tap a block to select it. Configure number of houses, symbol type, layout mode (Grid, along Roads, Serpentine) and click "Place".</li>
                    <li><strong>Arrange/Swap:</strong> Toggle "Arrange" to drag-and-drop symbols, or "Swap" to exchange positions of two houses.</li>
                    <li><strong>Split/Merge:</strong> Select blocks to merge them or split a block by drawing a cutting line.</li>
                    <li><strong>Exclusions:</strong> Click "Draw Field" to trace exclusion zones (e.g. forests, ponds) where houses shouldn't be placed.</li>
                  </ul>
                </div>
              )}
            </div>
            {/* Modal Footer */}
            <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between">
              <button 
                onClick={() => setHelpStep(s => Math.max(0, s - 1))}
                disabled={helpStep === 0}
                className="px-3 py-1.5 bg-white border rounded text-xs font-semibold text-gray-600 disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-xs font-bold text-gray-400">
                {helpStep + 1} / 5
              </span>
              {helpStep < 4 ? (
                <button 
                  onClick={() => setHelpStep(s => s + 1)}
                  className="px-3 py-1.5 bg-[var(--color-saffron)] hover:bg-[var(--color-saffron-container)] text-white rounded text-xs font-semibold transition-colors"
                >
                  Next →
                </button>
              ) : (
                <button 
                  onClick={() => { setShowHelp(false); setHelpStep(0); }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-semibold transition-colors"
                >
                  Get Started!
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

