import type { Coordinate, SymbolType, Block, PlacedSymbol, FarmlandBlock, WaterBody, ForestArea, LanduseArea, Landmark, AreaStats } from '../types';
import { isHouseType } from '../types';
import * as turf from '@turf/turf';

export function getBbox(coords: Coordinate[]): { south: number; west: number; north: number; east: number } {
  let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
  for (const { lat, lng } of coords) { south = Math.min(south, lat); west = Math.min(west, lng); north = Math.max(north, lat); east = Math.max(east, lng); }
  return { south, west, north, east };
}

export function pointInPolygon(point: Coordinate, polygon: Coordinate[]): boolean {
  const px = point.lng, py = point.lat; let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat, xj = polygon[j].lng, yj = polygon[j].lat;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segIntersect(a: Coordinate, b: Coordinate, c: Coordinate, d: Coordinate): boolean {
  const det = (b.lng - a.lng) * (d.lat - c.lat) - (b.lat - a.lat) * (d.lng - c.lng);
  if (Math.abs(det) < 1e-12) return false;
  const t = ((c.lng - a.lng) * (d.lat - c.lat) - (c.lat - a.lat) * (d.lng - c.lng)) / det;
  const u = -((b.lng - a.lng) * (c.lat - a.lat) - (b.lat - a.lat) * (c.lng - a.lng)) / det;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function lineIntersectsPolygon(line: Coordinate[], polygon: Coordinate[]): boolean {
  for (const point of line) { if (pointInPolygon(point, polygon)) return true; }
  for (let i = 0; i < line.length - 1; i++) for (let j = 0; j < polygon.length - 1; j++) if (segIntersect(line[i], line[i + 1], polygon[j], polygon[j + 1])) return true;
  return false;
}

export function isPolygonSelfIntersecting(polygon: Coordinate[]): boolean {
  if (polygon.length < 4) return false;
  // Check each edge against all non-adjacent edges
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    // Check against all edges except adjacent ones
    for (let j = i + 2; j < polygon.length; j++) {
      // Skip the edge that shares a vertex with the current edge
      if (j === polygon.length - 1 && i === 0) continue;
      const c = polygon[j];
      const d = polygon[(j + 1) % polygon.length];
      if (segIntersect(a, b, c, d)) return true;
    }
  }
  return false;
}

export function polygonArea(coords: Coordinate[]): number {
  if (coords.length < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const mLat = 111320, mLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < coords.length; i++) { const j = (i + 1) % coords.length; area += coords[i].lng * mLng * coords[j].lat * mLat; area -= coords[j].lng * mLng * coords[i].lat * mLat; }
  return Math.abs(area) / 2;
}

export function bearingBetween(a: Coordinate, b: Coordinate): number {
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos(lat2); const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function distanceBetween(a: Coordinate, b: Coordinate): number {
  const R = 6371000; const dLat = ((b.lat - a.lat) * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function clipRoadsToPolygon(elements: any[], boundary: Coordinate[]): any[] {
  const results: any[] = [];
  for (const el of elements) {
    if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
    const coords: Coordinate[] = el.geometry.map((n: any) => ({ lat: n.lat, lng: n.lon }));
    const highway = el.tags?.highway || 'unclassified';
    const name = el.tags?.name;
    if (lineIntersectsPolygon(coords, boundary)) {
      results.push({ coords: coords, highway, name, osm_id: el.id });
    }
  }
  return results;
}

export function classifyBuilding(tags: Record<string, string>): SymbolType {
  if (tags.amenity === 'school' || tags.building === 'school') return 'school';
  if (tags.amenity === 'hospital' || tags.amenity === 'clinic' || tags.building === 'hospital') return 'hospital';
  if (tags.amenity === 'post_office') return 'post_office';
  if (tags.amenity === 'place_of_worship' || tags.building === 'religious') {
    const r = (tags.religion || '').toLowerCase();
    if (r === 'muslim' || r === 'islam') return 'mosque';
    if (r === 'hindu') return 'temple';
    if (r === 'christian') return 'church';
    return 'temple';
  }
  const b = (tags.building || '').toLowerCase();
  if (b === 'hut' || b === 'grass' || b === 'thatch' || b === 'bamboo' || b === 'wood') return 'kutcha_house';
  if (b === 'commercial' || b === 'industrial' || b === 'retail' || b === 'office' || b === 'warehouse' || b === 'shop') return 'non_residential';
  if (tags.shop || tags.office) return 'non_residential';
  return 'pucca_house';
}

export function classifyRoad(tags: any) {
  const hw = tags.highway || 'unknown';
  if (['motorway','trunk','primary'].includes(hw)) 
    return { width: 3, style: 'solid', color: '#000000', label: 'Main Road' };
  if (['secondary','tertiary','unclassified'].includes(hw))
    return { width: 2, style: 'solid', color: '#333333', label: 'Road' };
  if (['residential','service','road'].includes(hw))
    return { width: 1.5, style: 'solid', color: '#555555', label: 'Lane' };
  if (['footway','path','pedestrian'].includes(hw))
    return { width: 1, style: 'dashed', color: '#777777', label: 'Footpath' };
  if (['track'].includes(hw))
    return { width: 1, style: 'dotted', color: '#888888', label: 'Kachcha Raasta' };
  if (['steps'].includes(hw))
    return { width: 0.8, style: 'dotted', color: '#999999', label: 'Steps' };
  return { width: 1, style: 'dashed', color: '#aaaaaa', label: 'Path' };
}

export function getPolygonCentroid(geom: Array<{ lat: number; lon: number }>): Coordinate {
  return { lat: geom.reduce((s, n) => s + n.lat, 0) / geom.length, lng: geom.reduce((s, n) => s + n.lon, 0) / geom.length };
}

export function generateBlocks(pins: Coordinate[], count: number): Block[] {
  if (pins.length < 3) return [];
  const bb = getBbox(pins); 
  const latMid = (bb.north + bb.south) / 2;
  const lngMid = (bb.east + bb.west) / 2;
  
  return [
    { id: crypto.randomUUID(), label: 'NW', south: latMid, north: bb.north, west: bb.west, east: lngMid },
    { id: crypto.randomUUID(), label: 'NE', south: latMid, north: bb.north, west: lngMid, east: bb.east },
    { id: crypto.randomUUID(), label: 'SW', south: bb.south, north: latMid, west: bb.west, east: lngMid },
    { id: crypto.randomUUID(), label: 'SE', south: bb.south, north: latMid, west: lngMid, east: bb.east }
  ];
}

export function getBestOrientation(pins: Coordinate[]): 'landscape' | 'portrait' {
  if (pins.length < 2) return 'landscape';
  const bb = getBbox(pins); const avgLat = (bb.north + bb.south) / 2;
  const wM = (bb.east - bb.west) * 111320 * Math.cos((avgLat * Math.PI) / 180);
  const hM = (bb.north - bb.south) * 111320;
  return (wM / hM) >= 1.4 ? 'landscape' : 'portrait';
}

// ─── SERPENTINE ───────────────────────────────────────────
function serpentineRows(houses: PlacedSymbol[], blockIdx: number): Coordinate[] {
  if (!houses.length) return [];
  const sorted = [...houses].sort((a, b) => b.lat - a.lat);
  const numRows = Math.max(1, Math.ceil(Math.sqrt(houses.length / 2.5)));
  const maxLat = Math.max(...sorted.map(h => h.lat)), minLat = Math.min(...sorted.map(h => h.lat));
  const rowH = (maxLat - minLat) / numRows || 0.0001;
  const rows: PlacedSymbol[][] = Array.from({ length: numRows }, () => []);
  for (const h of sorted) { rows[Math.min(numRows - 1, Math.floor((maxLat - h.lat) / rowH))].push(h); }
  const path: Coordinate[] = [];
  for (let i = 0; i < numRows; i++) { 
    if (!rows[i].length) continue; 
    // Always sort West to East for strict NW to SE numbering
    rows[i].sort((a, b) => a.lng - b.lng); 
    for (const h of rows[i]) path.push({ lat: h.lat, lng: h.lng }); 
  }
  return path;
}

export function generateSerpentinePath(symbols: PlacedSymbol[], blocks?: Block[]): Coordinate[] {
  const houses = symbols.filter(s => isHouseType(s.symbol_type));
  if (!houses.length) return [];
  if (blocks && blocks.length > 0) {
    const sortedBlocks = [...blocks].sort((a, b) => { const aL = (a.north + a.south) / 2, bL = (b.north + b.south) / 2; if (Math.abs(aL - bL) > 0.00001) return bL - aL; return a.west - b.west; });
    const path: Coordinate[] = []; const usedIds = new Set<string>();
    for (let bi = 0; bi < sortedBlocks.length; bi++) {
      const blk = sortedBlocks[bi];
      const blkH = houses.filter(h => { if (blk.points) return pointInPolygon(h, blk.points); return h.lat >= blk.south && h.lat <= blk.north && h.lng >= blk.west && h.lng <= blk.east; });
      const seg = serpentineRows(blkH, bi);
      for (const c of seg) { path.push(c); usedIds.add(`${c.lat.toFixed(7)},${c.lng.toFixed(7)}`); }
    }
    const orphans = houses.filter(h => !usedIds.has(`${h.lat.toFixed(7)},${h.lng.toFixed(7)}`));
    if (orphans.length > 0) path.push(...serpentineRows(orphans, sortedBlocks.length));
    return path;
  }
  return serpentineRows(houses, 0);
}

export function getSerpentineOrder(symbols: PlacedSymbol[], blocks?: Block[]): string[] {
  const path = generateSerpentinePath(symbols, blocks);
  const houses = symbols.filter(s => isHouseType(s.symbol_type));
  return path.map(p => houses.find(h => Math.abs(h.lat - p.lat) < 1e-7 && Math.abs(h.lng - p.lng) < 1e-7)).filter(Boolean).map(h => h!.id);
}

// ═══════════════════════════════════════════════════════════
// COMPREHENSIVE OVERPASS QUERY — Fetch EVERYTHING
// ═══════════════════════════════════════════════════════════
export function buildComprehensiveQuery(bbox: { south: number; west: number; north: number; east: number }, pad: number = 0.002): string {
  const s = bbox.south - pad, w = bbox.west - pad, n = bbox.north + pad, e = bbox.east + pad;
  return `[out:json][timeout:30][bbox:${s},${w},${n},${e}];
(
  way["building"];way["highway"];
  way["landuse"~"farmland|agriculture|forest|meadow|orchard|vineyard|plant_nursery|greenhouse_horticulture"];
  way["natural"~"water|wood|wetland|scrub|heath|grassland|bay|beach|shingle"];
  way["waterway"~"river|stream|canal|drain|ditch"];
  way["leisure"~"park|garden|playground|pitch|swimming_pool"];
  way["amenity"~"school|hospital|clinic|place_of_worship|post_office|pharmacy|police|fire_station|community_centre|marketplace|bus_station|parking|fuel|bank"];
  node["amenity"~"school|hospital|clinic|place_of_worship|post_office|water_well|pharmacy|bank|police|atm|bus_station|fuel|parking|marketplace|community_centre"];
  node["place"];
  node["natural"~"spring|water|tree|cave_entrance|peak"];
  node["man_made"~"water_well|water_tower|tower|monitoring_station|pumping_station"];
  way["tourism"~"hotel|guest_house|hostel|museum|attraction|viewpoint|information"];
  node["tourism"~"hotel|guest_house|museum|attraction|viewpoint|information|guest_house"];
  node["shop"~"supermarket|convenience|general|bakery|butcher|clothes"];
  way["shop"~"supermarket|mall"];
  way["historic"];node["historic"];
  node["name"];
  way["name"]["building"];
  way["name"]["amenity"];
  way["name"]["leisure"];
  way["name"]["tourism"];
  way["name"]["shop"];
);
out geom;`;
}

// ─── PROCESS ALL DETECTED FEATURES ───────────────────────
export interface DetectedData {
  symbols: PlacedSymbol[];
  farmlands: FarmlandBlock[];
  waterBodies: WaterBody[];
  forests: ForestArea[];
  landuseAreas: LanduseArea[];
  landmarks: Landmark[];
  stats: AreaStats;
}

export function processOverpassData(
  elements: any[],
  boundary: Coordinate[],
  totalArea: number
): DetectedData {
  const symbols: PlacedSymbol[] = [];
  const farmlands: FarmlandBlock[] = [];
  const waterBodies: WaterBody[] = [];
  const forests: ForestArea[] = [];
  const landuseAreas: LanduseArea[] = [];
  const landmarks: Landmark[] = [];
  let houseCount = 0, aptCount = 0, nonRes = 0;
  let farmArea = 0;
  const farmLbl = 'A';
  let farmIdx = 0;

  for (const el of elements) {
    if (!el.geometry || el.geometry.length < 1) continue;

    const coords: Coordinate[] = el.geometry.map((n: any) => ({ lat: n.lat, lng: n.lon }));
    const tags = el.tags || {};
    const center = coords.length >= 3 ? getPolygonCentroid(el.geometry) : coords[0];

    // Skip if outside boundary (for nodes) or not intersecting (for ways)
    if (el.type === 'node') {
      if (boundary.length >= 3 && !pointInPolygon(center, boundary)) continue;
    } else if (boundary.length >= 3 && !lineIntersectsPolygon(coords, boundary)) continue;

    // ─── BUILDINGS ─────────────────────────────────
    if (tags.building) {
      let st = classifyBuilding(tags);
      const bld = tags.building.toLowerCase();
      const lvls = parseInt(tags['building:levels'] || '1');
      if ((bld === 'apartments' || bld === 'flats' || lvls >= 3) && st === 'pucca_house') st = 'apartment';
      if (st === 'pucca_house' || st === 'kutcha_house') houseCount++;
      else if (st === 'apartment') aptCount++;
      else nonRes++;
      symbols.push({
        id: crypto.randomUUID(), symbol_type: st, lat: center.lat, lng: center.lng,
        number: null, placed_at: new Date().toISOString(), auto_detected: true,
        unit_count: st === 'apartment' ? Math.max(2, Math.min(lvls, 20)) : undefined,
        label: tags.name,
      });
      if (tags.name) landmarks.push({ id: crypto.randomUUID(), name: tags.name, type: st, lat: center.lat, lng: center.lng });
      continue;
    }

    // ─── ANY OTHER NAMED PLACE / POI ──────────────────
    if (tags.name && !tags.building && !tags.waterway && !tags.highway && tags.natural !== 'water') {
      if (tags.amenity) {
        const st = classifyBuilding(tags);
        symbols.push({
          id: crypto.randomUUID(), symbol_type: st, lat: center.lat, lng: center.lng,
          number: null, placed_at: new Date().toISOString(), auto_detected: true, label: tags.name,
        });
      }
      landmarks.push({ 
        id: crypto.randomUUID(), 
        name: tags.name, 
        type: tags.amenity || tags.shop || tags.tourism || tags.office || tags.leisure || tags.place || tags.historic || 'point_of_interest', 
        lat: center.lat, 
        lng: center.lng 
      });
      continue;
    }

    // ─── FARMLAND ──────────────────────────────────
    if (['farmland', 'agriculture', 'orchard', 'vineyard', 'plant_nursery', 'greenhouse_horticulture', 'meadow'].includes(tags.landuse)) {
      if (coords.length >= 3) {
        const pts = coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 20)) === 0);
        farmlands.push({
          id: crypto.randomUUID(),
          label: String.fromCharCode(65 + (farmIdx++ % 26)),
          points: pts,
        });
        farmArea += polygonArea(pts);
      }
      continue;
    }

    // ─── FORESTS ───────────────────────────────────
    if (tags.landuse === 'forest' || tags.natural === 'wood') {
      if (coords.length >= 3) {
        const pts = coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 20)) === 0);
        forests.push({ id: crypto.randomUUID(), name: tags.name || 'Forest', points: pts });
      }
      continue;
    }

    // ─── WATER BODIES ──────────────────────────────
    if (tags.natural === 'water' || tags.natural === 'wetland' || tags.natural === 'bay') {
      if (coords.length >= 3) {
        const name = tags.name || 'Water Body';
        waterBodies.push({
          id: crypto.randomUUID(), name, type: 'pond', coords,
          center: getPolygonCentroid(el.geometry),
        });
        // Also place a pond symbol at center
        symbols.push({
          id: crypto.randomUUID(), symbol_type: 'pond', lat: center.lat, lng: center.lng,
          number: null, placed_at: new Date().toISOString(), auto_detected: true, label: name,
        });
      }
      continue;
    }

    // ─── WATERWAYS (rivers, streams) ───────────────
    if (tags.waterway) {
      const wType = ['river', 'canal'].includes(tags.waterway) ? 'river' : 'stream';
      waterBodies.push({
        id: crypto.randomUUID(), name: tags.name || wType, type: wType,
        coords, center: coords[Math.floor(coords.length / 2)],
      });
      continue;
    }

    // ─── WELLS / SPRINGS ──────────────────────────
    if (tags.amenity === 'water_well' || tags.man_made === 'water_well' || tags.natural === 'spring') {
      symbols.push({
        id: crypto.randomUUID(), symbol_type: 'well', lat: center.lat, lng: center.lng,
        number: null, placed_at: new Date().toISOString(), auto_detected: true, label: tags.name,
      });
      continue;
    }

    // ─── LANDUSE AREAS (for styling) ──────────────────────────
    let lType = '';
    if (['farmland', 'agricultural'].includes(tags.landuse)) lType = 'farmland';
    else if (tags.landuse === 'orchard') lType = 'orchard';
    else if (tags.landuse === 'forest' || tags.natural === 'wood') lType = 'forest';
    else if (tags.natural === 'scrub') lType = 'scrub';
    else if (['meadow', 'grass'].includes(tags.landuse) || tags.natural === 'grassland') lType = 'grass';
    else if (tags.natural === 'water') lType = 'water';
    else if (tags.natural === 'wetland') lType = 'wetland';
    else if (tags.landuse === 'cemetery') lType = 'cemetery';
    else if (['park', 'garden', 'recreation_ground'].includes(tags.leisure)) lType = 'park';

    if (lType && coords.length >= 3) {
      const pts = coords.filter((_, i) => i === 0 || i === coords.length - 1 || i % Math.max(1, Math.floor(coords.length / 20)) === 0);
      landuseAreas.push({
        id: crypto.randomUUID(),
        type: lType,
        points: pts,
      });
    }

    // ─── REMAINING LANDMARKS (if any without name) ──────────────────────────
    if (!tags.name && (tags.tourism || tags.historic || tags.shop === 'supermarket' || tags.office === 'government')) {
      landmarks.push({ id: crypto.randomUUID(), name: tags.tourism || tags.historic || 'Landmark', type: tags.tourism || tags.historic || tags.shop || tags.office, lat: center.lat, lng: center.lng });
    }
  }

  return {
    symbols, farmlands, waterBodies, forests, landuseAreas, landmarks,
    stats: {
      buildings: symbols.length, houses: houseCount, apartments: aptCount, nonResidential: nonRes,
      roads: 0, farmlandCount: farmlands.length, farmlandArea: Math.round(farmArea),
      waterBodies: waterBodies.filter(w => w.type === 'pond').length,
      forests: forests.length, landmarks: landmarks.length,
      totalArea: Math.round(totalArea),
      density: totalArea > 0 ? Math.round((houseCount + aptCount) / (totalArea / 10000)) : 0,
    },
  };
}

// ─── SATELLITE TILE CAPTURE ───────────────────────────────
function lng2tile(lng: number, z: number): number { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
function lat2tile(lat: number, z: number): number { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }

export async function captureSatelliteView(south: number, west: number, north: number, east: number): Promise<string> {
  const latDiff = north - south, lngDiff = east - west;
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 16 : latDiff > 0.003 || lngDiff > 0.005 ? 17 : 18;
  const TILE = 256;
  const tx1 = lng2tile(west, zoom), tx2 = lng2tile(east, zoom), ty1 = lat2tile(north, zoom), ty2 = lat2tile(south, zoom);
  const canvas = document.createElement('canvas');
  canvas.width = (tx2 - tx1 + 1) * TILE; canvas.height = (ty2 - ty1 + 1) * TILE;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#e0e0e0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const total = (tx2 - tx1 + 1) * (ty2 - ty1 + 1);
  if (total > 36) return canvas.toDataURL('image/jpeg', 0.8);
  for (let x = tx1; x <= tx2; x++) for (let y = ty1; y <= ty2; y++) {
    try { const img = new Image(); img.crossOrigin = 'anonymous'; img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`; await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); }); ctx.drawImage(img, (x - tx1) * TILE, (y - ty1) * TILE, TILE, TILE); } catch {}
  }
  return canvas.toDataURL('image/jpeg', 0.88);
}

export function getSatelliteBounds(south: number, west: number, north: number, east: number) {
  const latDiff = north - south, lngDiff = east - west;
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 16 : latDiff > 0.003 || lngDiff > 0.005 ? 17 : 18;
  const tx1 = lng2tile(west, zoom), tx2 = lng2tile(east, zoom), ty1 = lat2tile(north, zoom), ty2 = lat2tile(south, zoom);
  function lngF(x: number) { return x / Math.pow(2, zoom) * 360 - 180; }
  function latF(y: number) { const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); }
  return { zoom, canvasW: (tx2-tx1+1)*256, canvasH: (ty2-ty1+1)*256, tileWest: tx1, tileNorth: ty1, satWest: lngF(tx1), satEast: lngF(tx2+1), satNorth: latF(ty1), satSouth: latF(ty2+1) };
}

export function generateGridChunks(boundary: Coordinate[], sizeMeters: number): { label: string; bbox: Coordinate[] }[] {
  const bbox = getBbox(boundary);
  const centerLat = (bbox.south + bbox.north) / 2;
  const latStep = sizeMeters / 111111;
  const lngStep = sizeMeters / (111111 * Math.cos(centerLat * Math.PI / 180));

  const chunks: { label: string; bbox: Coordinate[] }[] = [];
  let row = 0;
  for (let lat = bbox.south; lat < bbox.north; lat += latStep) {
    let col = 0;
    for (let lng = bbox.west; lng < bbox.east; lng += lngStep) {
      const chunkBbox = [
        { lat, lng },
        { lat: lat + latStep, lng },
        { lat: lat + latStep, lng: lng + lngStep },
        { lat, lng: lng + lngStep }
      ];

      const letter = String.fromCharCode(65 + (row % 26));
      chunks.push({ label: `${letter}${col + 1}`, bbox: chunkBbox });
      col++;
    }
    row++;
  }
  return chunks;
}

export function serpentineNumbering(symbols: any[]) {
  const houses = symbols.filter(s =>
    ['pucca_house', 'kutcha_house', 'non_residential', 'apartment'].includes(s.symbol_type)
  );

  if (houses.length === 0) return symbols;

  const lats = houses.map(h => h.lat);
  const northLat = Math.max(...lats);
  
  // Row height — 10 meters in degrees latitude
  const ROW_HEIGHT_DEG = 0.00009;
  
  // Assign row number to each house based on latitude
  houses.forEach(house => {
    house._row = Math.floor((northLat - house.lat) / ROW_HEIGHT_DEG);
  });

  // Group by row
  const rows: Record<number, any[]> = {};
  houses.forEach(h => {
    if (!rows[h._row]) rows[h._row] = [];
    rows[h._row].push(h);
  });

  // Sort row keys north to south
  const sortedRows = Object.keys(rows)
    .map(Number)
    .sort((a, b) => a - b);

  let number = 1;
  const numberMap: Record<string, number> = {};

  sortedRows.forEach((rowKey, rowIndex) => {
    const rowHouses = [...rows[rowKey]];
    
    // Always sort west-to-east to achieve strict NW to SE numbering
    rowHouses.sort((a, b) => a.lng - b.lng);
    
    rowHouses.forEach(house => {
      // Respect manual overrides
      if (!house.number_locked) {
        numberMap[house.id] = number;
      }
      number++;
    });
  });

  // Apply numbers back to original symbols array
  return symbols.map(s => {
    const sCopy = { ...s };
    if (!s.number_locked && numberMap[s.id] !== undefined) {
      sCopy.number = numberMap[s.id];
    }
    delete sCopy._row;
    return sCopy;
  });
}

export async function snapRoadsToOSM(surveySegments: any[], boundaryPolygon: any) {
  if (!boundaryPolygon) return surveySegments;
  
  const bbox = turf.bbox(boundaryPolygon);
  const [west, south, east, north] = bbox;

  // Fetch existing OSM roads
  const query = `[out:json][bbox:${south},${west},${north},${east}];
    way["highway"]; out geom;`;
    
  try {
    const response = await fetch(
      'https://overpass-api.de/api/interpreter',
      { method: 'POST', body: query }
    );
    if (!response.ok) return surveySegments;
    const data = await response.json();
    
    const osmRoads = data.elements
      .filter((e: any) => e.type === 'way' && e.geometry)
      .map((e: any) => turf.lineString(
        e.geometry.map((n: any) => [n.lon, n.lat]),
        { highway: e.tags.highway, osm_id: e.id }
      ));

    if (osmRoads.length === 0) {
      return surveySegments.map(s => ({...s, is_new_road: true}));
    }

    const snapped = surveySegments.map(segment => {
      if (segment.points.length < 2) return segment;
      
      const segLine = turf.lineString(
        segment.points.map((p: any) => [p.lng, p.lat])
      );
      
      // Find nearest OSM road
      let nearestRoad: any = null;
      let minDistance = Infinity;
      
      osmRoads.forEach((osmRoad: any) => {
        const dist = turf.pointToLineDistance(
          turf.center(segLine),
          osmRoad,
          { units: 'meters' }
        );
        if (dist < minDistance) {
          minDistance = dist;
          nearestRoad = osmRoad;
        }
      });
      
      // Snap if within 8 meters of an OSM road
      if (nearestRoad && minDistance < 8) {
        return {
          ...segment,
          snapped_to_osm: nearestRoad.properties.osm_id,
          points: segment.points // keep original GPS points
        };
      }
      
      // New road not in OSM — mark as newly discovered
      return {
        ...segment,
        is_new_road: true
      };
    });
    
    return snapped;
  } catch (err) {
    console.error("OSM Snapping error:", err);
    return surveySegments;
  }
}
