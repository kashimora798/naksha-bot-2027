import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MapData, Coordinate, SymbolType, PlacedSymbol, RoadFeature, Block } from '../types';
import type { SurveySession, SurveySymbol, SurveyPoint, RoadSegment } from './idb';
import { SYMBOL_DEFS, isPakkaRoad, getUnitCount, polyCenter, isHouseType, isNumberableSymbol, isNonResidential } from '../types';
import { getBbox, polygonArea, generateSerpentinePath, distanceBetween, pointInPolygon, clusterByProximity, gridBlockOffsets, centroidXY, getSerpentineOrder } from './geo';
import { drawSymbolOnCanvas } from './symbols';
import { declutterSymbols } from './declutter';
import type { RenderEnv, CanvasLike, ImageLike } from './render-env';
import { browserEnv } from './render-env.browser';

// Strip emoji + variation selectors from map labels. The official census sheet
// shouldn't carry emoji anyway, and the server canvas (@napi-rs/canvas) has no
// working emoji fallback (renders tofu boxes). Applied to every label we draw so
// the browser preview and the server PDF look identical.
function cleanLabel(s: string): string {
  return s
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function drawStartEndBadge(ctx: CanvasRenderingContext2D, label: 'START' | 'END', x: number, y: number, size: number) {
  ctx.save();
  ctx.font = 'bold 7px sans-serif';
  const textW = ctx.measureText(label).width;
  const padX = 2.5, padY = 1.5;
  const w = textW + padX * 2;
  const h = 9;
  const bx = x - w / 2;
  const by = y - size / 2 - h - 1.5;

  // Background color: Green for START, Red for END
  ctx.fillStyle = label === 'START' ? '#2E7D32' : '#C62828';
  
  // Rounded rect
  ctx.beginPath();
  if ((ctx as any).roundRect) {
    (ctx as any).roundRect(bx, by, w, h, 1.5);
  } else {
    ctx.rect(bx, by, w, h);
  }
  ctx.fill();

  // White text
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, by + h / 2 + 0.3);
  ctx.restore();
}

export function lngFromTile(x: number, z: number): number {
  return (x / Math.pow(2, z)) * 360 - 180;
}

export function latFromTile(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

export function getProjection(
  w: number,
  h: number,
  pW: number,
  pE: number,
  pS: number,
  pN: number
) {
  const rLng = pE - pW || 0.001, rLat = pN - pS || 0.001;
  const midLat = (pS + pN) / 2;
  const cosLat = Math.cos(midLat * Math.PI / 180);
  const w_proj = rLng * cosLat;
  const h_proj = rLat;
  const sc = Math.min(w / w_proj, h / h_proj);
  const offsetX = (w - w_proj * sc) / 2;
  const offsetY = (h - h_proj * sc) / 2;
  const proj = (c: Coordinate): [number, number] => [
    offsetX + (c.lng - pW) * cosLat * sc,
    offsetY + (pN - c.lat) * sc
  ];
  return { proj, sc, offsetX, offsetY, w_proj, h_proj };
}

// ═══════════════════════════════════════════════════════════
// RENDER MAP TO CANVAS
// Key: ASPECT-FILL projection — X and Y scale INDEPENDENTLY
// This stretches the map to fill the ENTIRE canvas with zero padding.
// No white gaps. No uniform scaling that leaves 50% blank.
// ═══════════════════════════════════════════════════════════
export function renderMapToCanvas(
  canvas: CanvasLike, data: MapData, maxW: number, maxH: number,
  options?: {
    watermark?: boolean;
    transparentBg?: boolean;
    hideSymbols?: boolean;
    hideBlocks?: boolean;
    focusBounds?: { south: number; west: number; north: number; east: number };
    includeOsmRoads?: boolean;
    osmRoads?: Coordinate[][];
    includeWalkedPath?: boolean;
    walkedPath?: Coordinate[];
    includeMappedRoads?: boolean;
    satCanvas?: any;
    inkMode?: 'color' | 'black' | 'blue';
  }
): void {
  const orient = data.orientation || 'portrait';
  const aspect = orient === 'landscape' ? 297 / 210 : 210 / 297;
  let w: number, h: number;
  if (aspect >= 1) { w = maxW; h = Math.round(maxW / aspect); }
  else { h = maxH; w = Math.round(maxH * aspect); }

  canvas.width = w; canvas.height = h;
  const inkMode = options?.inkMode || (data as any).renderOptions?.inkMode || 'color';
  const colorMap = (col: string | CanvasGradient | CanvasPattern): string | CanvasGradient | CanvasPattern => {
    if (typeof col !== 'string') return col;
    if (inkMode === 'color') return col;
    if (inkMode === 'black') {
      if (col === '#FFF' || col === '#FFFFFF' || col === '#ffffff' || col === 'rgba(255,255,255,0.85)' || col === 'rgba(255,255,255,0.9)') return '#FFFFFF';
      if (col.startsWith('rgba(')) {
        return col.replace(/rgba\(\d+\s*,\s*\d+\s*,\s*\d+/, 'rgba(0,0,0');
      }
      if (col === 'transparent') return 'transparent';
      return '#000000';
    }
    if (inkMode === 'blue') {
      if (col === '#FFF' || col === '#FFFFFF' || col === '#ffffff' || col === 'rgba(255,255,255,0.85)' || col === 'rgba(255,255,255,0.9)') return '#FFFFFF';
      if (col.startsWith('rgba(')) {
        return col.replace(/rgba\(\d+\s*,\s*\d+\s*,\s*\d+/, 'rgba(0,47,190');
      }
      if (col === 'transparent') return 'transparent';
      return '#002fbe';
    }
    return col;
  };

  const rawCtx = canvas.getContext('2d')!;
  const ctx = new Proxy(rawCtx, {
    get(target, prop) {
      const val = target[prop as keyof typeof target];
      if (typeof val === 'function') {
        return val.bind(target);
      }
      return val;
    },
    set(target, prop, value) {
      if (prop === 'fillStyle' || prop === 'strokeStyle') {
        value = colorMap(value);
      }
      (target as any)[prop] = value;
      return true;
    }
  });

  if (!options?.transparentBg) {
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  if (data.boundaryPins.length < 3) return;

  let pW: number, pE: number, pS: number, pN: number;
  if (options?.focusBounds) {
    const b = options.focusBounds;
    const pLng = (b.east - b.west) * 0.15;
    const pLat = (b.north - b.south) * 0.15;
    pW = b.west - pLng; pE = b.east + pLng;
    pS = b.south - pLat; pN = b.north + pLat;
  } else {
    const bb = getBbox(data.boundaryPins);
    const pLng = (bb.east - bb.west) * 0.05 || 0.0005;
    const pLat = (bb.north - bb.south) * 0.05 || 0.0005;
    pW = bb.west - pLng; pE = bb.east + pLng;
    pS = bb.south - pLat; pN = bb.north + pLat;
  }
  const rLng = pE - pW || 0.001, rLat = pN - pS || 0.001;

  const { proj, sc, offsetX, offsetY, w_proj, h_proj } = getProjection(w, h, pW, pE, pS, pN);

  // If a satellite background canvas is supplied, draw it aligned precisely
  if (options?.satCanvas) {
    ctx.save();
    if (inkMode === 'black' || inkMode === 'blue') {
      (ctx as any).filter = 'grayscale(100%)';
    }
    ctx.drawImage(options.satCanvas, offsetX, offsetY, w_proj * sc, h_proj * sc);
    ctx.restore();
    if (inkMode === 'blue') {
      ctx.save();
      (ctx as any).globalCompositeOperation = 'multiply';
      ctx.fillStyle = '#002fbe';
      ctx.fillRect(offsetX, offsetY, w_proj * sc, h_proj * sc);
      ctx.restore();
    }
  }

  const symbolSizes = new Map<string, number>();
  const symSz = Math.max(20, Math.min(32, sc * 0.00032));
  {
    const pts = (data.symbols || []).map(s => ({ id: s.id, pt: proj(s), sym: s }));
    for (let i = 0; i < pts.length; i++) {
      let minDist = Infinity;
      for (let j = 0; j < pts.length; j++) {
        if (i === j) continue;
        const d = Math.hypot(pts[i].pt[0] - pts[j].pt[0], pts[i].pt[1] - pts[j].pt[1]);
        if (d < minDist) minDist = d;
      }
      
      let multiplier = 1.0;
      if (data.blocks && data.blocks.length > 0) {
        const blk = data.blocks.find(b => {
          if (b.points && b.points.length >= 3) {
            return pointInPolygon(pts[i].sym, b.points);
          }
          return pts[i].sym.lat >= b.south && pts[i].sym.lat <= b.north && pts[i].sym.lng >= b.west && pts[i].sym.lng <= b.east;
        });
        if (blk) {
          multiplier = (blk as any).symbolSizeMultiplier ?? 1.0;
        }
      }
      
      // Box ~85% of nearest-neighbor local spacing, clamped to [10, symSz]
      const localSz = minDist < Infinity ? Math.max(10, Math.min(symSz, minDist * 0.85)) : symSz;
      symbolSizes.set(pts[i].id, localSz * multiplier);
    }
  }

  const getSymbolSize = (id: string): number => {
    return symbolSizes.get(id) ?? symSz;
  };

  // ─── LANDUSE AREAS ────────────────────────────────────────────
  const landusStyles: Record<string, { fill: string; stroke: string; width: number; dash: number[]; label: string }> = {
    farmland:     { fill: 'rgba(255, 248, 220, 0.4)', stroke: '#8B7355', width: 0.8, dash: [4,2], label: '🌾 खेत' },
    agricultural: { fill: 'rgba(255, 248, 220, 0.4)', stroke: '#8B7355', width: 0.8, dash: [4,2], label: '🌾 कृषि भूमि' },
    orchard:      { fill: 'rgba(144, 238, 144, 0.3)', stroke: '#228B22', width: 0.8, dash: [3,3], label: '🌳 बाग' },
    forest:       { fill: 'rgba(34, 139, 34, 0.25)',  stroke: '#006400', width: 1,   dash: [],    label: '🌲 जंगल' },
    wood:         { fill: 'rgba(34, 139, 34, 0.25)',  stroke: '#006400', width: 1,   dash: [],    label: '🌲 वन' },
    scrub:        { fill: 'rgba(154, 205, 50, 0.2)',  stroke: '#6B8E23', width: 0.5, dash: [2,4], label: '' },
    grass:        { fill: 'rgba(144, 238, 144, 0.2)', stroke: '#90EE90', width: 0.5, dash: [],    label: '' },
    water:        { fill: 'rgba(135, 206, 235, 0.5)', stroke: '#4169E1', width: 1,   dash: [],    label: '💧 तालाब' },
    wetland:      { fill: 'rgba(135, 206, 235, 0.3)', stroke: '#4169E1', width: 0.8, dash: [2,3], label: '' },
    cemetery:     { fill: 'rgba(200, 200, 200, 0.3)', stroke: '#808080', width: 0.8, dash: [],    label: '🪦 कब्रिस्तान' },
    park:         { fill: 'rgba(144, 238, 144, 0.25)',stroke: '#228B22', width: 0.8, dash: [],    label: '⛲ पार्क' }
  };

  for (const la of (data.landuseAreas || [])) {
    if (la.points.length < 3) continue;
    const pts = la.points.map(p => proj(p));
    const style = landusStyles[la.type] || landusStyles.grass;
    
    ctx.fillStyle = style.fill;
    ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = style.stroke; ctx.lineWidth = style.width; ctx.setLineDash(style.dash);
    ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
    
    if (style.label) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      ctx.fillStyle = style.stroke; ctx.font = `bold ${Math.max(8, symSz * 0.4)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cleanLabel(style.label), cx, cy);
    }
  }

  // ─── LEGACY FARMLAND (for backward compatibility if missing in landuseAreas) ───
  if (!data.landuseAreas || data.landuseAreas.length === 0) {
    for (const fb of (data.farmlandBlocks || [])) {
      if (fb.points.length < 3) continue;
      const pts = fb.points.map(p => proj(p));
      ctx.fillStyle = 'rgba(102,187,106,0.18)';
      ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 2; ctx.setLineDash([8, 4]);
      ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      ctx.fillStyle = '#2E7D32'; ctx.font = `bold ${Math.max(10, symSz * 0.5)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(cleanLabel(`🌾 ${fb.label}`), cx, cy);
    }
  }

  // ─── WATER BODIES ───────────────────────────────────────
  for (const wb of (data.waterBodies || [])) {
    if (wb.type === 'pond' && wb.coords.length >= 3) {
      const pts = wb.coords.map(c => proj(c));
      ctx.fillStyle = 'rgba(66,165,245,0.25)';
      ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke();
    } else if (wb.coords.length >= 2) {
      ctx.strokeStyle = '#1565C0'; ctx.lineWidth = wb.type === 'river' ? 3 : 1.5;
      ctx.beginPath(); wb.coords.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    }
  }

  // ─── FORESTS ────────────────────────────────────────────
  for (const fa of (data.forests || [])) {
    if (fa.points.length < 3) continue;
    const pts = fa.points.map(c => proj(c));
    ctx.fillStyle = 'rgba(76,175,80,0.18)';
    ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#2E7D32'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
    ctx.beginPath(); pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── BLOCKS ─────────────────────────────────────────────
  const BF = ['rgba(231,76,60,0.08)', 'rgba(52,152,219,0.08)', 'rgba(39,174,96,0.08)', 'rgba(243,156,18,0.08)', 'rgba(155,89,182,0.08)', 'rgba(26,188,156,0.08)'];
  const BB = ['#E74C3C', '#3498DB', '#27AE60', '#F39C12', '#9B59B6', '#1ABC9C'];
  // ─── BLOCKS ─────────────────────────────────────────────
  if (!options?.hideBlocks) {
    const BF = ['rgba(231,76,60,0.08)', 'rgba(52,152,219,0.08)', 'rgba(39,174,96,0.08)', 'rgba(243,156,18,0.08)', 'rgba(155,89,182,0.08)', 'rgba(26,188,156,0.08)'];
    const BB = ['#E74C3C', '#3498DB', '#27AE60', '#F39C12', '#9B59B6', '#1ABC9C'];
    (data.blocks || []).forEach((b, i) => {
      const pts: Coordinate[] = b.points || [
        { lat: b.south, lng: b.west }, { lat: b.north, lng: b.west },
        { lat: b.north, lng: b.east }, { lat: b.south, lng: b.east },
      ];
      const pp = pts.map(p => proj(p));
      ctx.fillStyle = BF[i % 6];
      ctx.beginPath(); pp.forEach(([x, y], j) => j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = BB[i % 6]; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]);
      ctx.beginPath(); pp.forEach(([x, y], j) => j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.stroke();
      ctx.setLineDash([]);
      const c = b.points ? polyCenter(b.points) : { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
      const [cx, cy] = proj(c);
      ctx.fillStyle = BB[i % 6]; ctx.font = `bold ${Math.max(10, symSz * 0.6)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const labelText = /block|sector/i.test(b.label) ? b.label : `Block ${b.label}`;
      ctx.fillText(labelText, cx, cy);
    });
  }

  // ─── BOUNDARY ───────────────────────────────────────────
  // Spec (ORGI §xiv): HLB boundary drawn as a dashed line; neighbouring HLB/
  // village names written OUTSIDE the boundary on each side.
  ctx.strokeStyle = '#B00000'; ctx.lineWidth = 2.5; ctx.setLineDash([12, 6]);
  ctx.beginPath();
  data.boundaryPins.forEach((p, i) => { const [x, y] = proj(p); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.closePath();
  ctx.fillStyle = 'rgba(176,0,0,0.04)'; ctx.fill(); ctx.stroke();
  ctx.setLineDash([]);
  data.boundaryPins.forEach((p, i) => {
    const [x, y] = proj(p);
    ctx.fillStyle = '#B00000'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
  });

  // Neighbour names just outside each edge of the boundary bbox.
  if (data.neighbours) {
    const xs = data.boundaryPins.map(p => proj(p)[0]);
    const ys = data.boundaryPins.map(p => proj(p)[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx2 = (minX + maxX) / 2, cy2 = (minY + maxY) / 2;
    ctx.fillStyle = '#7a0000'; ctx.font = `italic bold ${Math.max(9, symSz * 0.45)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lbl = (t: string | undefined, x: number, y: number) => {
      if (!t) return;
      ctx.save(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 3;
      ctx.strokeText(`◄ ${t} ►`, x, y); ctx.fillText(`◄ ${t} ►`, x, y); ctx.restore();
    };
    lbl(data.neighbours.north, cx2, Math.max(20, minY - 10));
    lbl(data.neighbours.south, cx2, Math.min(h - 14, maxY + 12));
    lbl(data.neighbours.west, Math.max(30, minX - 8), cy2);
    lbl(data.neighbours.east, Math.min(w - 30, maxX + 8), cy2);
  }

  // ─── OSM ROADS ──────────────────────────────────────────
  if (options?.includeOsmRoads && options.osmRoads) {
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    for (const osmRoad of options.osmRoads) {
      if (osmRoad.length < 2) continue;
      ctx.beginPath();
      osmRoad.forEach((c, i) => {
        const [x, y] = proj(c);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  // ─── ROADS — double-line style, ALL shown ──────────────
  if (options?.includeMappedRoads !== false) {
    for (const road of data.roads) {
      if (road.coords.length < 2) continue;
      const pk = isPakkaRoad(road.highway);
      const rs = ['residential', 'unclassified', 'tertiary', 'service', 'living_street'].includes(road.highway);
      const kt = ['footway', 'path', 'track', 'pedestrian', 'steps'].includes(road.highway);
      let oW: number, iW: number;
      if (pk) { oW = 22; iW = 12; } else if (rs) { oW = 17; iW = 9; } else if (kt) { oW = 14; iW = 7; } else { oW = 15; iW = 8; }
      const dash = kt ? [8, 5] : [];
      const col = road.confirmed ? '#000' : '#555';
      
      // Draw outer road border
      ctx.strokeStyle = col; ctx.lineWidth = oW; ctx.setLineDash(dash);
      ctx.beginPath(); road.coords.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
      // Draw inner road fill
      ctx.strokeStyle = '#FFF'; ctx.lineWidth = iW; ctx.setLineDash(dash);
      ctx.beginPath(); road.coords.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();

      // ─── DRAW ROAD NAME ───
      if ((road as any).name) {
        // Find the longest segment to place the name
        let maxLen = 0, bA = road.coords[0], bB = road.coords[1];
        for (let i = 0; i < road.coords.length - 1; i++) {
          const [x1, y1] = proj(road.coords[i]), [x2, y2] = proj(road.coords[i+1]);
          const len = Math.hypot(x2 - x1, y2 - y1);
          if (len > maxLen) { maxLen = len; bA = road.coords[i]; bB = road.coords[i+1]; }
        }
        if (maxLen > 30) { // Only draw if segment is long enough
          const [x1, y1] = proj(bA), [x2, y2] = proj(bB);
          let cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
          let angle = Math.atan2(y2 - y1, x2 - x1);
          if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI; // Keep text upright
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(angle);
          // Add a slight white outline and larger, bolder font
          ctx.font = 'bold 18px sans-serif'; 
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4;
          ctx.strokeText((road as any).name, 0, 0);
          ctx.fillStyle = '#111';
          ctx.fillText((road as any).name, 0, 0);
          ctx.restore();
        }
      }
    }
  }
  ctx.setLineDash([]);

  // ─── WALKED PATH ────────────────────────────────────────
  if (options?.includeWalkedPath && options.walkedPath && options.walkedPath.length >= 2) {
    // Solid white line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    options.walkedPath.forEach((c, i) => {
      const [x, y] = proj(c);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dashed black line on top
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    options.walkedPath.forEach((c, i) => {
      const [x, y] = proj(c);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  }

  // ─── INTELLIGENT FLOATING MID-GAP ARROWS (ORGI Annexure-4 §xii) ─────────
  // Design principle: arrows NEVER cut through house symbols.
  // Each arrow is a short chevron floating in the GAP between consecutive houses:
  //   • Centered at midpoint of gap, length = 38% of gap
  //   • Starts at symbol-A edge, ends at symbol-B edge (offset by symSz/2)
  //   • Intra-block: solid dark-red arrow (bold, clear)
  //   • Inter-block jump: single bezier curve arc (thin grey, distinct)
  //   • Row-turn: slightly enlarged arrowhead marks serpentine reversal
  //   • Skipped when houses are too close (gap < 1.2 × symSz) to avoid clutter
  if (!options?.hideSymbols) {
    const serp = generateSerpentinePath(data.symbols, data.blocks?.length > 0 ? data.blocks : undefined);
    if (serp.length >= 2) {
      const blocks2 = data.blocks && data.blocks.length > 0 ? data.blocks : [];
      const blockOf = (c: Coordinate): string | null => {
        for (const b of blocks2) {
          const pts = b.points && b.points.length >= 3 ? b.points : null;
          if (pts ? pointInPolygon(c, pts) : (c.lat >= b.south && c.lat <= b.north && c.lng >= b.west && c.lng <= b.east)) return b.id;
        }
        return null;
      };
      const membership = serp.map(c => blockOf(c));
      const projPts = serp.map(c => proj(c));

      // ── HELPER: draw a clean filled arrowhead at (tx, ty) pointing in direction `ang` ──
      const arrowHead = (tx: number, ty: number, ang: number, size: number) => {
        const hw = size * 0.42; // half-width of arrowhead
        ctx.save();
        ctx.translate(tx, ty);
        ctx.rotate(ang);
        ctx.fillStyle = 'rgba(176,34,24,0.88)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-size, -hw);
        ctx.lineTo(-size * 0.6, 0);
        ctx.lineTo(-size, hw);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };

      // ── HELPER: draw a short floating mid-gap arrow from A→B ──
      // Returns the angle of the arrow (for turn detection)
      const drawMidArrow = (
        x1: number, y1: number, x2: number, y2: number,
        isBlockJump: boolean, isTurn: boolean
      ): number => {
        const dx = x2 - x1, dy = y2 - y1;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.001) return 0;
        const ang = Math.atan2(dy, dx);
        const ux = dx / dist, uy = dy / dist; // unit vector

        // Skip if houses are too close (arrow would overlap symbols)
        const minGap = symSz * 1.1;
        if (dist < minGap && !isBlockJump) return ang;

        if (isBlockJump) {
          // ── INTER-BLOCK: single thin bezier arc, no floating stub ──
          // Arc gently curves ~20% of distance perpendicularly for visual elegance
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const perp = dist * 0.18; // perpendicular offset for arc
          const cpx = mx - uy * perp, cpy = my + ux * perp;
          // Offset start/end from symbol edges
          const r = symSz * 0.52;
          const sx = x1 + ux * r, sy = y1 + uy * r;
          const ex = x2 - ux * r, ey = y2 - uy * r;
          ctx.strokeStyle = 'rgba(140,130,120,0.38)';
          ctx.lineWidth = 1.1;
          ctx.setLineDash([4, 5]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.quadraticCurveTo(cpx, cpy, ex, ey);
          ctx.stroke();
          ctx.setLineDash([]);
          // Small arrowhead at destination edge
          arrowHead(ex, ey, ang, Math.max(5, symSz * 0.32));
        } else {
          // ── INTRA-BLOCK: short floating chevron centered in gap ──
          const r = symSz * 0.55; // offset from symbol edge
          const arrowLen = Math.min(dist * 0.38, symSz * 1.8); // 38% of gap, capped
          const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2; // midpoint
          const hLen = arrowLen / 2;

          // Arrow shaft: from (mid - hLen) to (mid + hLen), clipped to not enter symbols
          const shaftStart = Math.max(r, dist / 2 - hLen);
          const shaftEnd   = Math.min(dist - r, dist / 2 + hLen);
          if (shaftEnd <= shaftStart) return ang;

          const sx = x1 + ux * shaftStart, sy = y1 + uy * shaftStart;
          const ex = x1 + ux * shaftEnd,   ey = y1 + uy * shaftEnd;

          const headSize = isTurn
            ? Math.max(8, symSz * 0.52)   // larger arrowhead at row turns
            : Math.max(6, symSz * 0.40);

          // Thin shaft line
          ctx.strokeStyle = 'rgba(160,30,20,0.62)';
          ctx.lineWidth = isTurn ? 2.0 : 1.5;
          ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();

          // Filled arrowhead at the tip
          arrowHead(ex, ey, ang, headSize);

          // ── TURN INDICATOR: small arc at the turning point ──
          if (isTurn) {
            ctx.strokeStyle = 'rgba(176,34,24,0.5)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(cx, cy, symSz * 0.28, ang - 0.7, ang + 0.7);
            ctx.stroke();
          }
        }
        return ang;
      };

      // ── PROCESS each consecutive pair in the path ──
      let prevAng: number | null = null;

      for (let i = 0; i < projPts.length - 1; i++) {
        const [x1, y1] = projPts[i];
        const [x2, y2] = projPts[i + 1];
        const thisBlock = membership[i + 1];
        const isJump = membership[i] !== thisBlock;

        // Detect turn: heading change > ~38° within the same block
        const ang = Math.atan2(y2 - y1, x2 - x1);
        let isTurn = false;
        if (!isJump && prevAng !== null) {
          let d = Math.abs(ang - prevAng);
          if (d > Math.PI) d = 2 * Math.PI - d;
          isTurn = d > 0.66;
        }

        drawMidArrow(x1, y1, x2, y2, isJump, isTurn);
        prevAng = isJump ? null : ang;
      }

      ctx.setLineDash([]);
    }
  }



  // ─── SYMBOLS — Upright viewport aligned ───────

  // snappedSymbols is hoisted so landmark labels can reference it below.
  let snappedSymbols: { x: number, y: number, sym: PlacedSymbol, idealX: number, idealY: number }[] = [];
  if (!options?.hideSymbols) {
    // Render symbols exactly at their placed coordinates as in the editing window
    for (const sym of data.symbols) {
      const [idealX, idealY] = proj(sym);
      snappedSymbols.push({ x: idealX, y: idealY, sym, idealX, idealY });
    }

    // Compute one bearing per block so all symbols share the same systematic orientation
    const blockBearings = new Map<string, number>();
    for (const block of (data.blocks || [])) {
      const pts = block.points && block.points.length >= 3 ? block.points : [
        { lat: block.south, lng: block.west },
        { lat: block.north, lng: block.west },
        { lat: block.north, lng: block.east },
        { lat: block.south, lng: block.east },
      ];
      let bestLenSq = -1, bestAngle = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dy = b.lat - a.lat, dx = b.lng - a.lng;
        const lenSq = dy * dy + dx * dx;
        if (lenSq > bestLenSq) { bestLenSq = lenSq; bestAngle = Math.atan2(dy, dx); }
      }
      blockBearings.set(block.id, bestAngle);
    }

    for (const { x, y, sym } of snappedSymbols) {
      let angle = 0;
      // Find which block this symbol belongs to, use that block's bearing
      const containingBlock = (data.blocks || []).find(b => {
        const pts = b.points && b.points.length >= 3 ? b.points : [
          { lat: b.south, lng: b.west },
          { lat: b.north, lng: b.west },
          { lat: b.north, lng: b.east },
          { lat: b.south, lng: b.east },
        ];
        return pointInPolygon(sym, pts);
      });
      if (containingBlock && blockBearings.has(containingBlock.id)) {
        angle = blockBearings.get(containingBlock.id)!;
      } else {
        angle = findNearestRoadBearing(sym, data.roads || []);
      }
      // Limit angle to [-PI/2, PI/2] to ensure the building number is always upright and readable
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      drawSymbolOnCanvas(ctx as any, sym, x, y, getSymbolSize(sym.id), angle, inkMode, data.numberingSystem);
    }

    const housesOrder = getSerpentineOrder(data.symbols, data.blocks, data.numberingSystem);
    if (housesOrder.length > 0) {
      const firstId = housesOrder[0];
      const lastId = housesOrder[housesOrder.length - 1];
      for (const { x, y, sym } of snappedSymbols) {
        const size = getSymbolSize(sym.id);
        if (sym.id === firstId) {
          drawStartEndBadge(ctx, 'START', x, y, size);
        } else if (sym.id === lastId && housesOrder.length >= 2) {
          drawStartEndBadge(ctx, 'END', x, y, size);
        }
      }
    }
  }


  // ─── LANDMARK LABELS ────────────────────────────────────
  if (!options?.hideSymbols) {
    // Labels from explicit landmark layer
    for (const lm of (data.landmarks || [])) {
      if (lm.selectedForPdf === false) continue;
      const [x, y] = proj({ lat: lm.lat, lng: lm.lng });
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`• ${lm.name}`, x, y - 5);
    }
    // Labels for landmark-type placed symbols (temple/school/mosque/hospital etc.)
    const LANDMARK_SYMBOL_LABELS: Partial<Record<SymbolType, string>> = {
      temple: 'Temple', mosque: 'Mosque', church: 'Church',
      school: 'School', hospital: 'Hospital', well: 'Well',
      post_office: 'Post Office', police_station: 'Police Station', pond: 'Pond',
    };

    for (const { x, y, sym } of (snappedSymbols || [])) {
      const defaultLbl = LANDMARK_SYMBOL_LABELS[sym.symbol_type];
      const name = sym.label || defaultLbl;
      if (!name) continue;
      const size = getSymbolSize(sym.id);
      ctx.save();
      ctx.font = `bold ${Math.max(9, size * 0.5)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.strokeText(name, x, y - size / 2 - 2);
      ctx.fillStyle = '#000000';
      ctx.fillText(name, x, y - size / 2 - 2);
      ctx.restore();
    }
  }


  // ─── NORTH ARROW ────────────────────────────────────────
  const aX = w - 20, aY = 24;
  ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(aX, aY + 16); ctx.lineTo(aX, aY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(aX, aY); ctx.lineTo(aX - 4, aY + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(aX, aY); ctx.lineTo(aX + 4, aY + 6); ctx.stroke();
  ctx.fillStyle = '#000'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('N', aX, aY - 5);

  // ─── LEGEND ─────────────────────────────────────────────
  if (!options?.hideSymbols) {
    const usedTypes = new Set<SymbolType>(data.symbols.map(s => s.symbol_type));
    if (usedTypes.size > 0) {
      const itemH = 18, lX = 8;
      const lH = usedTypes.size * itemH + 10;
      const lY = h - lH - 2;
      const lW = 145;
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(lX - 4, lY - 4, lW, lH + 4);
      ctx.strokeStyle = '#888'; ctx.lineWidth = 0.8; ctx.strokeRect(lX - 4, lY - 4, lW, lH + 4);
      // Header
      ctx.fillStyle = '#000'; ctx.font = `bold ${Math.max(9, symSz * 0.35)}px sans-serif`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText('LEGEND / किंवदंती', lX + 2, lY + itemH * 0.35);
      let ly = lY + itemH;
      usedTypes.forEach(t => {
        const d = SYMBOL_DEFS.find(dd => dd.type === t);
        drawSymbolOnCanvas(ctx as any, { symbol_type: t }, lX + 9, ly, 12, 0, inkMode, data.numberingSystem);
        ctx.fillStyle = '#000';
        ctx.font = `${Math.max(8, symSz * 0.32)}px sans-serif`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        const label = d?.labelHi ? `${d.labelHi} (${d.label})` : (d?.label || t);
        ctx.fillText(label, lX + 22, ly);
        ly += itemH;
      });
    }
  }


  // ─── WATERMARK ──────────────────────────────────────────
  if (options?.watermark) {
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(-35 * Math.PI / 180);
    ctx.fillStyle = 'rgba(255,122,26,0.18)'; ctx.font = 'bold 50px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SAMPLE', 0, 0); ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.setLineDash([]);
}

// ═══════════════════════════════════════════════════════════
// EXPORT — synchronous, reliable, zero-failure
// ═══════════════════════════════════════════════════════════
export function exportPDF(data: MapData, canvas?: CanvasLike, env: RenderEnv = browserEnv): void {
  const orient = data.orientation || 'portrait';
  const isL = orient === 'landscape';
  const a4W = isL ? 297 : 210;
  const a4H = isL ? 210 : 297;
  const cW = Math.round((a4W * 150) / 25.4);
  const cH = Math.round((a4H * 150) / 25.4);

  let imgData: string;
  if (canvas) {
    imgData = canvas.toDataURL('image/jpeg', 0.92);
  } else {
    const c = env.createCanvas(cW, cH);
    renderMapToCanvas(c, data, cW, cH);
    imgData = c.toDataURL('image/jpeg', 0.92);
  }

  const doc = new jsPDF({ orientation: orient as 'landscape' | 'portrait', unit: 'mm', format: 'a4' });

  // MAP FILLS ENTIRE PAGE — zero margins
  doc.addImage(imgData, 'JPEG', 0, 0, a4W, a4H);

  // Header band OVERLAID on top of map (not separate area)
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, a4W, 10, 'F');
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`HLB No: ${data.hlbNumber}`, a4W / 2, 7, { align: 'center' });

  // Footer band OVERLAID on bottom of map
  doc.setFillColor(255, 255, 255);
  doc.rect(0, a4H - 8, a4W, 8, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${data.enumeratorName || ''}  |  ${data.district}, ${data.state}  |  ${new Date().toLocaleDateString('en-IN')}`,
    a4W / 2, a4H - 2.5, { align: 'center' }
  );

  doc.save(`HLB_${data.hlbNumber || '0000'}_Naksha_2027.pdf`);
}

// ═══════════════════════════════════════════════════════════
// HELPER: Find bearing of nearest road to align symbols
// ═══════════════════════════════════════════════════════════
export function findNearestRoadBearing(sym: PlacedSymbol, roads: RoadFeature[]): number {
  let bestDist = Infinity;
  let bestAngle = 0;
  for (const road of roads) {
    for (let i = 0; i < road.coords.length - 1; i++) {
      const a = road.coords[i], b = road.coords[i + 1];
      const mx = (a.lat + b.lat) / 2, my = (a.lng + b.lng) / 2;
      const d = Math.sqrt((sym.lat - mx) ** 2 + (sym.lng - my) ** 2);
      if (d < bestDist) {
        bestDist = d;
        const dx = b.lng - a.lng, dy = b.lat - a.lat;
        bestAngle = Math.atan2(dy, dx);
      }
    }
  }
  return bestAngle;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Find bearing of longest edge of the block containing the symbol
// ═══════════════════════════════════════════════════════════
export function getBlockOrientation(sym: Coordinate, blocks: Block[]): number | null {
  for (const block of blocks) {
    const pts = block.points && block.points.length >= 3 ? block.points : [
      { lat: block.south, lng: block.west },
      { lat: block.north, lng: block.west },
      { lat: block.north, lng: block.east },
      { lat: block.south, lng: block.east },
    ];
    if (pointInPolygon(sym, pts)) {
      let bestLenSq = -1;
      let bestAngle = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const dy = b.lat - a.lat;
        const dx = b.lng - a.lng;
        const lenSq = dy * dy + dx * dx;
        if (lenSq > bestLenSq) {
          bestLenSq = lenSq;
          bestAngle = Math.atan2(dy, dx);
        }
      }
      return bestAngle;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// HELPER: Capture satellite tiles from ArcGIS
// ═══════════════════════════════════════════════════════════
function lng2t(lng: number, z: number): number { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
function lat2t(lat: number, z: number): number { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }

async function captureSat(s: number, w: number, n: number, e: number, env: RenderEnv = browserEnv): Promise<CanvasLike> {
  const dlat = n - s, dlng = e - w;
  const z = dlat > 0.006 ? 16 : dlat > 0.002 ? 17 : 18;
  const T = 256;
  const x1 = lng2t(w, z), x2 = lng2t(e, z), y1 = lat2t(n, z), y2 = lat2t(s, z);
  let cw = (x2 - x1 + 1) * T;
  let ch = (y2 - y1 + 1) * T;
  
  // Safeguard against invalid bounding boxes that would crash napi-rs/canvas natively
  if (isNaN(cw) || isNaN(ch) || cw <= 0 || ch <= 0) {
    cw = 256; ch = 256;
  }
  if (cw > 8000) cw = 8000;
  if (ch > 8000) ch = 8000;

  const c = env.createCanvas(cw, ch);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, c.width, c.height);
  if ((x2 - x1 + 1) * (y2 - y1 + 1) <= 36) {
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) {
        try {
          const img = await env.loadImage(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`);
          ctx.drawImage(img, (x - x1) * T, (y - y1) * T, T, T);
        } catch {}
      }
    }
  }

  // Crop to exact bounds (s, w, n, e)
  const tileW = lngFromTile(x1, z);
  const tileE = lngFromTile(x2 + 1, z);
  const tileN = latFromTile(y1, z);
  const tileS = latFromTile(y2 + 1, z);

  const pxLeft = ((w - tileW) / (tileE - tileW)) * cw;
  const pxRight = ((e - tileW) / (tileE - tileW)) * cw;
  const pxTop = ((tileN - n) / (tileN - tileS)) * ch;
  const pxBottom = ((tileN - s) / (tileN - tileS)) * ch;

  const cropW = Math.max(1, Math.round(pxRight - pxLeft));
  const cropH = Math.max(1, Math.round(pxBottom - pxTop));

  const cropped = env.createCanvas(cropW, cropH);
  const cropCtx = cropped.getContext('2d')!;
  cropCtx.drawImage(
    c as any,
    pxLeft, pxTop, pxRight - pxLeft, pxBottom - pxTop,
    0, 0, cropW, cropH
  );

  return cropped;
}

function wrapDocColors(doc: jsPDF, inkMode: string) {
  if (inkMode === 'color') return doc;
  
  const setTextColor = doc.setTextColor;
  const setDrawColor = doc.setDrawColor;
  const setFillColor = doc.setFillColor;

  const isWhite = (args: any[]): boolean => {
    if (args.length === 1 && typeof args[0] === 'string') {
      const s = args[0].toLowerCase();
      return s === '#fff' || s === '#ffffff' || s === 'white';
    }
    if (args.length === 3) {
      return args[0] === 255 && args[1] === 255 && args[2] === 255;
    }
    if (args.length === 1 && typeof args[0] === 'number') {
      return args[0] === 255;
    }
    return false;
  };
  
  doc.setTextColor = function(this: jsPDF, ...args: any[]) {
    if (isWhite(args)) return (setTextColor as any).apply(this, args as any);
    if (inkMode === 'black') return (setTextColor as any).call(this, 0, 0, 0);
    if (inkMode === 'blue') return (setTextColor as any).call(this, 0, 47, 190);
    return (setTextColor as any).apply(this, args as any);
  };

  doc.setDrawColor = function(this: jsPDF, ...args: any[]) {
    if (isWhite(args)) return (setDrawColor as any).apply(this, args as any);
    if (inkMode === 'black') return (setDrawColor as any).call(this, 0, 0, 0);
    if (inkMode === 'blue') return (setDrawColor as any).call(this, 0, 47, 190);
    return (setDrawColor as any).apply(this, args as any);
  };

  doc.setFillColor = function(this: jsPDF, ...args: any[]) {
    if (isWhite(args)) return (setFillColor as any).apply(this, args as any);
    if (args.length === 3 && args[0] === 192 && args[1] === 57 && args[2] === 43) {
      if (inkMode === 'black') return (setFillColor as any).call(this, 120, 120, 120);
      if (inkMode === 'blue') return (setFillColor as any).call(this, 0, 47, 190);
    }
    if (inkMode === 'black') return (setFillColor as any).call(this, 0, 0, 0);
    if (inkMode === 'blue') return (setFillColor as any).call(this, 0, 47, 190);
    return (setFillColor as any).apply(this, args as any);
  };
  
  return doc;
}

export async function exportBlockPDF(
  data: MapData,
  orient: 'landscape' | 'portrait',
  onProgress: (msg: string) => void,
  env: RenderEnv = browserEnv,
  deliver: 'download' | 'buffer' = 'download',
): Promise<ArrayBuffer> {
  const isL = orient === 'landscape';
  const sheet = data.sheetSize === 'a3' ? 'a3' : 'a4';
  // A4: 210×297, A3: 297×420 (mm)
  const shortSide = sheet === 'a3' ? 297 : 210;
  const longSide = sheet === 'a3' ? 420 : 297;
  const a4W = isL ? longSide : shortSide;
  const a4H = isL ? shortSide : longSide;
  // 120 DPI prints crisply on A4/A3 and ~halves the pixel count vs 150 → much
  // smaller pages. Line-art pages go in as PNG (lossless + crisp text); photo
  // pages (satellite, AI) as JPEG at SAT_Q. compress:true deflates PDF streams.
  const dpi = 120;
  const SAT_Q = 0.78;
  const pw = Math.round((a4W * dpi) / 25.4);
  const ph = Math.round((a4H * dpi) / 25.4);
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: sheet, compress: true });
  const inkMode = (data as any).renderOptions?.inkMode || 'color';
  wrapDocColors(doc, inkMode);

  const blocks = data.blocks && data.blocks.length > 0 ? data.blocks : [];
  const includeBlockSheets = (data as any).includeBlockSheets !== false;
  const selectedAiImages: string[] = (data as any).selectedAiImages || [];
  const aiImagesToPrint = selectedAiImages.length > 0 
    ? selectedAiImages 
    : (data.surveyMapBase64 ? [data.surveyMapBase64] : []);

  // Overview has 1 layout page, plus 1 block index page if blocks exist
  const overviewPages = blocks.length > 0 ? 2 : 1;
  const blockDetailPages = (includeBlockSheets && blocks.length > 0) ? blocks.length * 2 : 0;
  const satellitePage = (!includeBlockSheets || blocks.length <= 0) ? 1 : 0;
  const aiPages = aiImagesToPrint.length * 2;
  let totalPages = overviewPages + blockDetailPages + satellitePage + aiPages;
  let page = 0;

  const bb = getBbox(data.boundaryPins);
  const pLng = (bb.east - bb.west) * 0.05 || 0.0005;
  const pLat = (bb.north - bb.south) * 0.05 || 0.0005;
  const pW = bb.west - pLng; const pE = bb.east + pLng;
  const pS = bb.south - pLat; const pN = bb.north + pLat;

  const satCanvas = await captureSat(pS, pW, pN, pE, env);

  // ─── PAGE 1: OVERVIEW — LAYOUT MAP (clean, without blocks) ──────
  onProgress(`Page ${++page}/${totalPages} — Layout Map`);
  await new Promise(r => setTimeout(r, 50));
  {
    const c = env.createCanvas(pw, ph);
    renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { ...((data as any).renderOptions || {}), hideBlocks: true });
    // Line-art sketch → PNG: lossless, crisp text, and smaller than JPEG for line work.
    doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'LAYOUT MAP', { south: pS, west: pW, north: pN, east: pE });
  }

  // ─── PAGE 2: OVERVIEW — BLOCK INDEX MAP (with blocks) — only if blocks exist ───
  if (blocks.length > 0) {
    onProgress(`Page ${++page}/${totalPages} — Block Index Map`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    const c = env.createCanvas(pw, ph);
    renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { ...((data as any).renderOptions || {}), hideBlocks: false });
    doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'BLOCK INDEX MAP', { south: pS, west: pW, north: pN, east: pE });
  }

  // ─── AI COMPARISON & CLEAN MAP PAGES ────────────────────────
  for (let idx = 0; idx < aiImagesToPrint.length; idx++) {
    const imgData = aiImagesToPrint[idx];
    const labelSuffix = aiImagesToPrint.length > 1 ? ` (Map ${idx + 1})` : '';

    onProgress(`Page ${++page}/${totalPages} — AI Comparison Overlay${labelSuffix}`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();

    const c2 = env.createCanvas(pw, ph);
    const ctx2 = c2.getContext('2d')!;
    ctx2.drawImage(satCanvas as any, 0, 0, pw, ph);

    ctx2.globalAlpha = 0.5;

    const src = imgData.startsWith('http') || imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
    let aiImg: ImageLike | null = null;
    try { aiImg = await env.loadImage(src); } catch { aiImg = null; }
    if (aiImg) ctx2.drawImage(aiImg as any, 0, 0, pw, ph);

    ctx2.globalAlpha = 1.0;
    doc.addImage(c2.toDataURL('image/jpeg', SAT_Q), 'JPEG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, `AI COMPARISON OVERLAY${labelSuffix}`, { south: pS, west: pW, north: pN, east: pE });

    // ─── CLEAN AI MAP PAGE ──────────────────────────
    onProgress(`Page ${++page}/${totalPages} — Full AI Survey Map${labelSuffix}`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    if (aiImg) {
      try {
        const cAi = env.createCanvas(pw, ph);
        cAi.getContext('2d')!.drawImage(aiImg as any, 0, 0, pw, ph);
        doc.addImage(cAi.toDataURL('image/jpeg', 0.82), 'JPEG', 0, 0, a4W, a4H);
        addOverlays(doc, data, a4W, a4H, `AI SURVEY MAP${labelSuffix}`, { south: pS, west: pW, north: pN, east: pE });
      } catch (e) {
        console.error('Failed to add AI image to PDF', e);
      }
    }
  }

  // ─── BLOCK PAGES ───────────────────────────────────────
  if (includeBlockSheets && blocks.length > 0) {
    for (let bi = 0; bi < blocks.length; bi++) {
      const blk = blocks[bi];

      // Clean map for this block
      const blockTitle = /block|sector/i.test(blk.label) ? blk.label : `Block ${blk.label}`;
      onProgress(`Page ${++page}/${totalPages} — ${blockTitle}`);
      await new Promise(r => setTimeout(r, 50));
      const blkPts = blk.points || [
        { lat: blk.south, lng: blk.west }, { lat: blk.north, lng: blk.west },
        { lat: blk.north, lng: blk.east }, { lat: blk.south, lng: blk.east },
      ];
      const blkBB = getBbox(blkPts);

      {
        const c = env.createCanvas(pw, ph);
        const blkSym = data.symbols.filter(s => {
          return pointInPolygon({ lat: s.lat, lng: s.lng }, blkPts);
        });
        const fakeData: MapData = {
          ...data, orientation: orient,
          symbols: blkSym,
          blocks: blocks.map((b, i) => i === bi ? { ...b } : { ...b }),
        };
        renderMapToCanvas(c, fakeData, pw, ph, { focusBounds: blkBB, ...(data as any).renderOptions });
        // Highlight current block, dim others
        const ctx = c.getContext('2d')!;
        const [w, h] = [c.width, c.height];
        
        // Calculate the specific projection used for this block map
        const pLng = (blkBB.east - blkBB.west) * 0.15;
        const pLat = (blkBB.north - blkBB.south) * 0.15;
        const pW = blkBB.west - pLng;
        const pE = blkBB.east + pLng;
        const pS = blkBB.south - pLat;
        const pN = blkBB.north + pLat;
        
        const { proj: blockProj } = getProjection(w, h, pW, pE, pS, pN);

        blocks.forEach((b, i) => {
          if (i === bi) return;
          const pts = b.points || [
            { lat: b.south, lng: b.west }, { lat: b.north, lng: b.west },
            { lat: b.north, lng: b.east }, { lat: b.south, lng: b.east },
          ];
          const pp: [number, number][] = pts.map((p: Coordinate) => blockProj(p));
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); pp.forEach(([x, y]: [number, number], j: number) => j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
        });

        doc.addPage();
        doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
        const labelTextUpper = /block|sector/i.test(blk.label) ? blk.label.toUpperCase() : `BLOCK ${blk.label.toUpperCase()}`;
        addOverlays(doc, data, a4W, a4H, labelTextUpper, blkBB);
        // Locator inset (bottom-right): whole HLB with this block highlighted.
        drawLocatorInset(doc, data, blkPts, a4W, a4H);
      }

      // Satellite reference for this block
      onProgress(`Page ${++page}/${totalPages} — Satellite ${blk.label}`);
      await new Promise(r => setTimeout(r, 50));
      {
        // Capture satellite dynamically for this block
        const padLng = (blkBB.east - blkBB.west) * 0.15;
        const padLat = (blkBB.north - blkBB.south) * 0.15;
        const blockSatCanvas = await captureSat(blkBB.south - padLat, blkBB.west - padLng, blkBB.north + padLat, blkBB.east + padLng, env);

        doc.addPage();
        const c = env.createCanvas(pw, ph);
        renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { satCanvas: blockSatCanvas, hideSymbols: true, focusBounds: blkBB, ...(data as any).renderOptions });
        doc.addImage(c.toDataURL('image/jpeg', SAT_Q), 'JPEG', 0, 0, a4W, a4H);
        const satLabelText = /block|sector/i.test(blk.label) ? `SATELLITE — ${blk.label.toUpperCase()}` : `SATELLITE — BLOCK ${blk.label.toUpperCase()}`;
        addOverlays(doc, data, a4W, a4H, satLabelText, blkBB);
      }
    }
  } else {
    // No blocks OR block sheets disabled — just add satellite page
    onProgress(`Page ${++page}/${totalPages} — Satellite`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    const c = env.createCanvas(pw, ph);
    renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { satCanvas, hideSymbols: true, ...(data as any).renderOptions });
    doc.addImage(c.toDataURL('image/jpeg', SAT_Q), 'JPEG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'SATELLITE REFERENCE', { south: pS, west: pW, north: pN, east: pE });
  }

  // ─── ENLARGED-INSET PAGES for extremely congested clusters (ORGI §16) ───
  // Each very dense cluster gets its own full-page enlarged, schematic blow-up so
  // every house number is legible. A marker on the main map references "Inset N".
  await addClusterInsetPages(doc, data, orient, a4W, a4H, pw, ph, onProgress, () => ++page, totalPages);

  // Server wants raw bytes to stream; the browser triggers a download.
  if (deliver === 'download') {
    doc.save(`HLB_${data.hlbNumber || '0000'}_Naksha_2027.pdf`);
  }
  return doc.output('arraybuffer');
}

// Detect extremely dense clusters (in lat/lng space) and render one enlarged page each.
async function addClusterInsetPages(
  doc: jsPDF, data: MapData, _orient: 'landscape' | 'portrait',
  a4W: number, a4H: number, _pw: number, _ph: number,
  onProgress: (m: string) => void, nextPage: () => number, _total: number
) {
  const houses = (data.symbols || []).filter(s => isNumberableSymbol(s.symbol_type));
  if (houses.length < 12) return;
  const bb = getBbox(data.boundaryPins.length >= 3 ? data.boundaryPins : houses);
  const span = Math.max(bb.north - bb.south, bb.east - bb.west) || 0.01;
  // Cluster radius ~3% of the block span; only blow up groups of >= 12.
  const radius = span * 0.03;
  const ptsLL = houses.map(h => ({ x: h.lng, y: h.lat }));
  const clusters = clusterByProximity(ptsLL, radius, 12);
  const dense = clusters.filter(c => c.length >= 12);
  if (!dense.length) return;

  dense.forEach((cl, idx) => {
    onProgress(`Page ${nextPage()} — Inset ${idx + 1} (dense cluster)`);
    const members = cl.map(ci => houses[ci]).sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
    const cbb = getBbox(members.map(m => ({ lat: m.lat, lng: m.lng })));
    doc.addPage();
    const cols = Math.ceil(Math.sqrt(members.length));
    const margin = 24, top = 22;
    const usableW = a4W - margin * 2, usableH = a4H - top - 20;
    const cell = Math.min(usableW / cols, usableH / Math.ceil(members.length / cols));
    const box = Math.min(cell * 0.6, 16);
    members.forEach((m, k) => {
      const r = Math.floor(k / cols), c = k % cols;
      const cx = margin + c * cell + cell / 2;
      const cy = top + r * cell + cell / 2;
      const isKutcha = m.symbol_type === 'kutcha_house';
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.4);
      if (isKutcha) {
        doc.triangle(cx, cy - box / 2, cx - box / 2, cy + box / 2, cx + box / 2, cy + box / 2, 'S');
      } else {
        doc.rect(cx - box / 2, cy - box / 2, box, box, 'S');
      }
      if (m.number != null) {
        doc.setFontSize(7); doc.setTextColor(0, 0, 0);
        const u = getUnitCount(m);
        const lbl = data.numberingSystem === 'census_u_loop'
          ? (u > 1 ? `${m.number}(${u})` : String(m.number))
          : (u > 1 ? `${m.number}-${m.number + u - 1}` : String(m.number));
        doc.text(lbl, cx, cy + (isKutcha ? box * 0.18 : 0) + 1, { align: 'center' });
      }
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
    doc.text(`ENLARGED INSET ${idx + 1} — Congested Cluster`, a4W / 2, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(`${members.length} houses • not to scale • around ${cbb.south.toFixed(5)}, ${cbb.west.toFixed(5)}`, a4W / 2, 17, { align: 'center' });
    drawSignatureFooter(doc, data, a4W, a4H);
  });
}

function addOverlays(
  doc: jsPDF, data: MapData, w: number, h: number, subtitle: string,
  bbox?: { south: number; west: number; north: number; east: number }
) {
  drawNorthArrow(doc, w - 12, 16);
  drawTitleBlock(doc, data, w, subtitle);
  if (bbox) drawScaleBar(doc, bbox, 8, h - 11, w, h);
  drawSignatureFooter(doc, data, w, h);
}

// ─── SHEET FURNITURE (Census 2027 layout-map compliance, Phase 2) ────────────

function drawTitleBlock(doc: jsPDF, data: MapData, w: number, subtitle: string) {
  // Top white band with HLB + page subtitle (centered) and full location particulars (left).
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, 13, 'F');
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.line(0, 13, w, 13);

  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
  doc.text(`CENSUS 2027 — LAYOUT MAP (NAZARI NAKSHA)`, w / 2, 5, { align: 'center' });
  doc.setFontSize(8.5);
  doc.text(`HLB No: ${data.hlbNumber || '—'}  •  ${subtitle}`, w / 2, 10, { align: 'center' });

  // Location particulars, top-left, small.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  const loc1 = [
    data.state && `State: ${data.state}`,
    data.district && `Dist: ${data.district}`,
    data.tehsil && `Tehsil: ${data.tehsil}`,
  ].filter(Boolean).join('   ');
  const loc2 = [
    data.townVillage && `Town/Village: ${data.townVillage}`,
    data.wardNo && `Ward: ${data.wardNo}`,
    data.ebNo && `EB(2011): ${data.ebNo}`,
  ].filter(Boolean).join('   ');
  if (loc1) doc.text(loc1, 3, 4);
  if (loc2) doc.text(loc2, 3, 7.5);
}

function drawNorthArrow(doc: jsPDF, cx: number, cy: number) {
  // Simple filled north arrow with an "N".
  doc.setDrawColor(0, 0, 0); doc.setFillColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.triangle(cx, cy - 5, cx - 2.4, cy + 3, cx + 2.4, cy + 3, 'F');
  doc.setFillColor(255, 255, 255);
  doc.triangle(cx, cy - 1.5, cx - 1.4, cy + 3, cx + 1.4, cy + 3, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6); doc.setTextColor(0, 0, 0);
  doc.text('N', cx, cy - 6, { align: 'center' });
}

function drawScaleBar(
  doc: jsPDF,
  bbox: { south: number; west: number; north: number; east: number },
  x: number, y: number, pageW: number, pageH: number
) {
  // Meters across the page width → choose a "nice" round bar length.
  const midLat = (bbox.south + bbox.north) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);
  const rLng = bbox.east - bbox.west || 0.001;
  const rLat = bbox.north - bbox.south || 0.001;
  const w_proj = rLng * cosLat;
  const h_proj = rLat;
  const sc_mm = Math.min(pageW / w_proj, pageH / h_proj);
  const mmPerMeter = sc_mm / 111320;
  const nice = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000];
  let barM = nice[0];
  for (const n of nice) { if (n * mmPerMeter <= pageW * 0.25) barM = n; }
  const barMM = barM * mmPerMeter;

  doc.setFillColor(255, 255, 255); doc.rect(x - 1, y - 1, barMM + 12, 7, 'F');
  doc.setDrawColor(0, 0, 0); doc.setFillColor(0, 0, 0); doc.setLineWidth(0.3);
  // Alternating black/white halves
  doc.rect(x, y + 1.5, barMM / 2, 1.6, 'F');
  doc.rect(x + barMM / 2, y + 1.5, barMM / 2, 1.6, 'S');
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(0, 0, 0);
  doc.text('0', x, y + 1); doc.text(`${barM} m`, x + barMM, y + 1, { align: 'center' });
  doc.text('(approx — map not to scale)', x, y + 6);
}

// Locator inset (bottom-right): the whole HLB boundary as a thumbnail with the
// current block outlined, so each block page shows where it sits in the HLB.
function drawLocatorInset(doc: jsPDF, data: MapData, blockPts: Coordinate[], w: number, _h: number) {
  if (!data.boundaryPins || data.boundaryPins.length < 3) return;
  const bb = getBbox(data.boundaryPins);
  const sw = 34, sh = 26; // inset size mm
  const ox = w - sw - 4, oy = 16; // top-right under the north arrow
  const pad = 2;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.3);
  doc.rect(ox, oy, sw, sh, 'FD');
  doc.setFontSize(5); doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'bold');
  doc.text('LOCATION', ox + sw / 2, oy + 3, { align: 'center' });

  const rLng = (bb.east - bb.west) || 1e-6, rLat = (bb.north - bb.south) || 1e-6;
  const iw = sw - pad * 2, ih = sh - pad * 2 - 3;
  const px = (lng: number) => ox + pad + ((lng - bb.west) / rLng) * iw;
  const py = (lat: number) => oy + 3 + pad + ((bb.north - lat) / rLat) * ih;

  // HLB outline
  doc.setDrawColor(120, 120, 120); doc.setLineWidth(0.3);
  doc.lines(
    data.boundaryPins.slice(1).map((p, i) => [px(p.lng) - px(data.boundaryPins[i].lng), py(p.lat) - py(data.boundaryPins[i].lat)]),
    px(data.boundaryPins[0].lng), py(data.boundaryPins[0].lat), [1, 1], 'S', true
  );
  // Current block fill
  if (blockPts.length >= 3) {
    doc.setFillColor(192, 57, 43); doc.setDrawColor(192, 57, 43); doc.setLineWidth(0.2);
    doc.lines(
      blockPts.slice(1).map((p, i) => [px(p.lng) - px(blockPts[i].lng), py(p.lat) - py(blockPts[i].lat)]),
      px(blockPts[0].lng), py(blockPts[0].lat), [1, 1], 'F', true
    );
  }
}

function drawSignatureFooter(doc: jsPDF, data: MapData, w: number, h: number) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, h - 9, w, 9, 'F');
  doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2); doc.line(0, h - 9, w, h - 9);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5);

  const dateStr = new Date().toLocaleDateString('en-IN');
  // Enumerator (left), Supervisor (center), date + official mark (right).
  doc.text(`Enumerator: ${data.enumeratorName || '________________'}   Sign: ____________`, 3, h - 3.5);
  doc.text(`Supervisor: ${data.supervisorName || '________________'}   Sign: ____________`, w / 2, h - 3.5, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.text(`FOR OFFICIAL USE — ${dateStr}`, w - 3, h - 3.5, { align: 'right' });
}

// ═══════════════════════════════════════════════════════════
// LIVE SURVEY OFFICIAL EXPORTS
// ═══════════════════════════════════════════════════════════

export async function generateOfficialRegister(session: SurveySession, symbols: SurveySymbol[]) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(`CENSUS 2027 - HLO REGISTER - HLB ${session.hlb_number}`, 14, 20);
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Location: ${session.location_name || 'N/A'}`, 14, 28);
  doc.text(`Date: ${new Date(session.created_at).toLocaleDateString('en-IN')}`, 200, 28);
  
  const tableData = symbols
    .filter(s => s.number)
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
    .map(s => {
      const pk = s.symbol_type === 'kutcha_house' ? 'Kutcha' : 'Pucca';
      const res = isNonResidential(s as PlacedSymbol) ? 'Non-Res' : 'Res';
      const ch = (s as PlacedSymbol).census_house_count;
      const chRange = ch && ch > 1 && s.number != null ? `${s.number}(1)-${s.number}(${ch})` : String(s.number);
      return [
        s.number,
        chRange,
        pk,
        res,
        s.col_4_use_type === 1 ? 'Residence' : s.col_4_use_type === 2 ? 'Res+Shop' : s.col_4_use_type ? 'Other' : '-',
        s.col_10_head_name || s.head_of_household || '-',
        s.col_9_family_count || '-',
        s.col_11_total_rooms || '-',
        s.col_12_ownership === 1 ? 'Owned' : s.col_12_ownership === 2 ? 'Rented' : '-',
        s.col_18_water_source ? 'Recorded' : '-',
        s.col_20_latrine ? 'Recorded' : '-',
        s.col_25_cooking_fuel ? 'Recorded' : '-',
        `${s.lat.toFixed(6)}, ${s.lng.toFixed(6)}`
      ];
    });

  autoTable(doc, {
    startY: 35,
    head: [['Bldg No', 'Census House No', 'P/K', 'R/NR', 'Use', 'Head of Household', 'Families', 'Rooms', 'Ownership', 'Water', 'Latrine', 'Fuel', 'GPS Coordinates']],
    body: tableData,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    styles: { fontSize: 7, cellPadding: 1.5 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  doc.save(`HLO_Register_HLB_${session.hlb_number}.pdf`);
}

export async function generateLiveExportPdf(
  session: SurveySession, 
  symbols: SurveySymbol[], 
  path: SurveyPoint[], 
  roads: RoadSegment[],
  onProgress: (msg: string) => void,
  renderOptions?: {
    includeOsmRoads?: boolean;
    osmRoads?: Coordinate[][];
    includeWalkedPath?: boolean;
    includeMappedRoads?: boolean;
    selectedAiImages?: string[];
  }
) {
  // Construct MapData format for renderMapToCanvas
  const mapData: MapData = {
    blocks: [],
    hlbNumber: session.hlb_number,
    locationName: session.location_name,
    center: { lat: 0, lng: 0 },
    district: '',
    state: '',
    enumeratorName: '',
    chargeOfficer: '',
    boundaryClosed: true,
    roadsConfirmed: true,
    numberingComplete: true,
    orientation: 'landscape',
    farmlandBlocks: [],
    waterBodies: [],
    forests: [],
    landmarks: [],
    areaStats: null,
    boundaryPins: session.polygon_geojson ? (() => {
      try {
         const geo = JSON.parse(session.polygon_geojson);
         if (geo && geo.geometry && geo.geometry.coordinates) {
           return geo.geometry.coordinates[0].map((coord: any) => ({ lng: coord[0], lat: coord[1] }));
         }
      } catch(e) {}
      return [];
    })() : [],
    symbols: symbols as PlacedSymbol[],
    roads: roads.map(r => ({
      id: r.segment_id,
      coords: r.points,
      highway: r.road_type,
      confirmed: true,
      source: 'user'
    } as RoadFeature)),
    gridConfig: { enabled: true, columns: 2, rows: 2 }
  };

  (mapData as any).renderOptions = {
    ...renderOptions,
    walkedPath: path.map(p => ({ lat: p.lat, lng: p.lng }))
  };

  if (renderOptions?.selectedAiImages) {
    (mapData as any).selectedAiImages = renderOptions.selectedAiImages;
  }

  await exportBlockPDF(mapData, 'portrait', onProgress);
}
