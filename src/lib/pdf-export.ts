import jsPDF from 'jspdf';
import type { MapData, Coordinate, SymbolType, PlacedSymbol, RoadFeature } from '../types';
import { SYMBOL_DEFS, isPakkaRoad, getUnitCount, polyCenter } from '../types';
import { getBbox, polygonArea, generateSerpentinePath, distanceBetween, pointInPolygon } from './geo';
import { drawSymbolOnCanvas } from './symbols';
import { declutterSymbols } from './declutter';

// ═══════════════════════════════════════════════════════════
// RENDER MAP TO CANVAS
// Key: ASPECT-FILL projection — X and Y scale INDEPENDENTLY
// This stretches the map to fill the ENTIRE canvas with zero padding.
// No white gaps. No uniform scaling that leaves 50% blank.
// ═══════════════════════════════════════════════════════════
export function renderMapToCanvas(
  canvas: HTMLCanvasElement, data: MapData, maxW: number, maxH: number,
  options?: { watermark?: boolean; transparentBg?: boolean; hideSymbols?: boolean; focusBounds?: { south: number, west: number, north: number, east: number } }
): void {
  const orient = data.orientation || 'portrait';
  const aspect = orient === 'landscape' ? 297 / 210 : 210 / 297;
  let w: number, h: number;
  if (aspect >= 1) { w = maxW; h = Math.round(maxW / aspect); }
  else { h = maxH; w = Math.round(maxH * aspect); }

  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
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

  // ASPECT FILL: independent X/Y scaling
  const scX = w / rLng, scY = h / rLat;
  const proj = (c: Coordinate): [number, number] => [
    (c.lng - pW) * scX,
    (pN - c.lat) * scY
  ];
  const avgSc = (scX + scY) / 2;
  const symSz = Math.max(16, Math.min(30, avgSc * 0.00013));

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
      ctx.fillText(style.label, cx, cy);
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
      ctx.fillText(`🌾 ${fb.label}`, cx, cy);
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
    ctx.fillText(`Block ${b.label}`, cx, cy);
  });

  // ─── BOUNDARY ───────────────────────────────────────────
  ctx.strokeStyle = '#CC0000'; ctx.lineWidth = 3; ctx.setLineDash([]);
  ctx.beginPath();
  data.boundaryPins.forEach((p, i) => { const [x, y] = proj(p); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.closePath();
  ctx.fillStyle = 'rgba(204,0,0,0.06)'; ctx.fill(); ctx.stroke();
  data.boundaryPins.forEach((p, i) => {
    const [x, y] = proj(p);
    ctx.fillStyle = '#CC0000'; ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#FFF'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
  });

  // ─── ROADS — double-line style, ALL shown ──────────────
  for (const road of data.roads) {
    if (road.coords.length < 2) continue;
    const pk = isPakkaRoad(road.highway);
    const rs = ['residential', 'unclassified', 'tertiary', 'service', 'living_street'].includes(road.highway);
    const kt = ['footway', 'path', 'track', 'pedestrian', 'steps'].includes(road.highway);
    let oW: number, iW: number;
    if (pk) { oW = 7; iW = 3.5; } else if (rs) { oW = 5; iW = 2; } else if (kt) { oW = 4; iW = 1.5; } else { oW = 4.5; iW = 2; }
    const dash = kt ? [8, 5] : [];
    const col = road.confirmed ? '#000' : '#555';
    
    // Draw outer road border
    ctx.strokeStyle = col; ctx.lineWidth = oW; ctx.setLineDash(dash);
    ctx.beginPath(); road.coords.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
    // Draw inner road fill
    ctx.strokeStyle = '#FFF'; ctx.lineWidth = iW; ctx.setLineDash(dash);
    ctx.beginPath(); road.coords.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();

    // ─── DRAW ROAD NAME ───
    if (road.osm_id && (road as any).name) {
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
        ctx.font = 'bold 9px sans-serif'; 
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
        ctx.strokeText((road as any).name, 0, 0);
        ctx.fillStyle = '#111';
        ctx.fillText((road as any).name, 0, 0);
        ctx.restore();
      }
    }
  }
  ctx.setLineDash([]);

  // ─── SERPENTINE ─────────────────────────────────────────
  if (!options?.hideSymbols) {
    const serp = generateSerpentinePath(data.symbols, data.blocks?.length > 0 ? data.blocks : undefined);
    if (serp.length >= 2) {
      ctx.strokeStyle = 'rgba(220,50,50,0.2)'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
      ctx.beginPath(); serp.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ─── SYMBOLS — Upright viewport aligned ───────
  if (!options?.hideSymbols) {
    // Phase 5: Fast Symbol Collision Detection
    // Declutter has been removed as it was displacing user's exact manual placements
    const resolvedSymbols = data.symbols;

    for (const sym of resolvedSymbols) {
      const [x, y] = proj(sym);
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.beginPath(); ctx.arc(x, y, symSz * 0.5, 0, Math.PI * 2); ctx.fill();
      drawSymbolOnCanvas(ctx, sym.symbol_type, x, y, symSz, sym.number, getUnitCount(sym));
    }
  }

  // ─── LANDMARK LABELS ────────────────────────────────────
  if (!options?.hideSymbols) {
    for (const lm of (data.landmarks || [])) {
      if (lm.selectedForPdf === false) continue;
      const [x, y] = proj({ lat: lm.lat, lng: lm.lng });
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`• ${lm.name}`, x, y - 5);
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
      const lH = usedTypes.size * 15 + 8, lX = 8, lY = h - lH;
      ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(lX - 3, lY - 3, 118, lH);
      ctx.strokeStyle = '#DDD'; ctx.lineWidth = 0.5; ctx.strokeRect(lX - 3, lY - 3, 118, lH);
      let ly = lY + 2;
      usedTypes.forEach(t => {
        const d = SYMBOL_DEFS.find(dd => dd.type === t);
        drawSymbolOnCanvas(ctx, t, lX + 8, ly, 9, null, 1);
        ctx.fillStyle = '#000'; ctx.font = '9px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(d?.labelHi || '', lX + 20, ly);
        ly += 15;
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
export function exportPDF(data: MapData, canvas?: HTMLCanvasElement): void {
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
    const c = document.createElement('canvas');
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
  doc.setTextColor(0);
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
function findNearestRoadBearing(sym: PlacedSymbol, roads: RoadFeature[]): number {
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
// HELPER: Capture satellite tiles from ArcGIS
// ═══════════════════════════════════════════════════════════
function lng2t(lng: number, z: number): number { return Math.floor((lng + 180) / 360 * Math.pow(2, z)); }
function lat2t(lat: number, z: number): number { return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z)); }

async function captureSat(s: number, w: number, n: number, e: number): Promise<HTMLCanvasElement> {
  const dlat = n - s, dlng = e - w;
  const z = dlat > 0.006 ? 16 : dlat > 0.002 ? 17 : 18;
  const T = 256;
  const x1 = lng2t(w, z), x2 = lng2t(e, z), y1 = lat2t(n, z), y2 = lat2t(s, z);
  const c = document.createElement('canvas');
  c.width = (x2 - x1 + 1) * T; c.height = (y2 - y1 + 1) * T;
  const ctx = c.getContext('2d')!;
ctx.fillStyle = '#ddd'; ctx.fillRect(0, 0, c.width, c.height);
  if ((x2 - x1 + 1) * (y2 - y1 + 1) > 36) return c;
  for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
    try {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      ctx.drawImage(img, (x - x1) * T, (y - y1) * T, T, T);
    } catch {}
  }
  return c;
}

// ═══════════════════════════════════════════════════════════
// BLOCK-WISE EXPORT with satellite reference
// ═══════════════════════════════════════════════════════════
export async function exportBlockPDF(
  data: MapData,
  orient: 'landscape' | 'portrait',
  onProgress: (msg: string) => void
): Promise<void> {
  const isL = orient === 'landscape';
  const a4W = isL ? 297 : 210;
  const a4H = isL ? 210 : 297;
  const dpi = 150;
  const pw = Math.round((a4W * dpi) / 25.4);
  const ph = Math.round((a4H * dpi) / 25.4);
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: 'a4' });

  const blocks = data.blocks && data.blocks.length > 1 ? data.blocks : [];
  let totalPages = blocks.length > 1 ? 1 + blocks.length * 2 : 1;
  if (data.surveyMapBase64) {
    totalPages += 2;
  }
  let page = 0;

  const bb = getBbox(data.boundaryPins);
  const pLng = (bb.east - bb.west) * 0.05 || 0.0005;
  const pLat = (bb.north - bb.south) * 0.05 || 0.0005;
  const pW = bb.west - pLng; const pE = bb.east + pLng;
  const pS = bb.south - pLat; const pN = bb.north + pLat;

  const satCanvas = await captureSat(pS, pW, pN, pE);

  // ─── PAGE 1: OVERVIEW (all blocks visible) ──────────────
  onProgress(`Page ${++page}/${totalPages} — Overview`);
  await new Promise(r => setTimeout(r, 50));
  {
    const c = document.createElement('canvas');
    renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph);
    doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'OVERVIEW');
  }

  // ─── PAGE 1.5: AI COMPARISON OVERLAY ────────────────────────
  if (data.surveyMapBase64) {
    onProgress(`Page ${++page}/${totalPages} — AI Comparison Overlay`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();

    const c2 = document.createElement('canvas');
    c2.width = pw; c2.height = ph;
    const ctx2 = c2.getContext('2d')!;
    ctx2.drawImage(satCanvas, 0, 0, pw, ph);

    ctx2.globalAlpha = 0.5;
    
    let imgData = data.surveyMapBase64;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = imgData.startsWith('http') || imgData.startsWith('data:') ? imgData : `data:image/jpeg;base64,${imgData}`;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Skip silently on error
    });
    ctx2.drawImage(img, 0, 0, pw, ph);

    ctx2.globalAlpha = 1.0;
    doc.addImage(c2.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'AI COMPARISON OVERLAY');

    // ─── PAGE 1.6: FULL AI MAP (CLEAN) ──────────────────────────
    onProgress(`Page ${++page}/${totalPages} — Full AI Survey Map`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    try {
      doc.addImage(img, 'JPEG', 0, 0, a4W, a4H);
      addOverlays(doc, data, a4W, a4H, 'AI SURVEY MAP');
    } catch (e) {
      console.error('Failed to add AI image to PDF', e);
    }
  }

  // ─── BLOCK PAGES ───────────────────────────────────────
  if (blocks.length > 1) {
    for (let bi = 0; bi < blocks.length; bi++) {
      const blk = blocks[bi];

      // Clean map for this block
      onProgress(`Page ${++page}/${totalPages} — Block ${blk.label}`);
      await new Promise(r => setTimeout(r, 50));
      const blkPts = blk.points || [
        { lat: blk.south, lng: blk.west }, { lat: blk.north, lng: blk.west },
        { lat: blk.north, lng: blk.east }, { lat: blk.south, lng: blk.east },
      ];
      const blkBB = getBbox(blkPts);

      {
        const c = document.createElement('canvas');
        const blkSym = data.symbols.filter(s => {
          return pointInPolygon({ lat: s.lat, lng: s.lng }, blkPts);
        });
        const fakeData: MapData = {
          ...data, orientation: orient,
          symbols: blkSym,
          blocks: blocks.map((b, i) => i === bi ? { ...b } : { ...b }),
        };
        renderMapToCanvas(c, fakeData, pw, ph, { focusBounds: blkBB });
        // Highlight current block, dim others
        const ctx = c.getContext('2d')!;
        const [w, h] = [c.width, c.height];
        
        // Calculate the specific projection used for this block map
        const pLng = (blkBB.east - blkBB.west) * 0.15;
        const pLat = (blkBB.north - blkBB.south) * 0.15;
        const pW = blkBB.west - pLng;
        const pN = blkBB.north + pLat;
        const rLng = (blkBB.east + pLng) - pW;
        const rLat = pN - (blkBB.south - pLat);
        const scX = w / rLng, scY = h / rLat;

        blocks.forEach((b, i) => {
          if (i === bi) return;
          const pts = b.points || [
            { lat: b.south, lng: b.west }, { lat: b.north, lng: b.west },
            { lat: b.north, lng: b.east }, { lat: b.south, lng: b.east },
          ];
          const pp = pts.map(p => [(p.lng - pW) * scX, (pN - p.lat) * scY]);
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath(); pp.forEach(([x, y], j) => j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)); ctx.closePath(); ctx.fill();
        });
        doc.addPage();
        doc.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, a4W, a4H);
        addOverlays(doc, data, a4W, a4H, `BLOCK ${blk.label}`);
      }

      // Satellite reference for this block
      onProgress(`Page ${++page}/${totalPages} — Satellite ${blk.label}`);
      await new Promise(r => setTimeout(r, 50));
      {
        // Capture satellite dynamically for this block
        const padLng = (blkBB.east - blkBB.west) * 0.15;
        const padLat = (blkBB.north - blkBB.south) * 0.15;
        const blockSatCanvas = await captureSat(blkBB.south - padLat, blkBB.west - padLng, blkBB.north + padLat, blkBB.east + padLng);

        doc.addPage();
        doc.addImage(blockSatCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, a4W, a4H);
        const c = document.createElement('canvas');
        renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { transparentBg: true, hideSymbols: true, focusBounds: blkBB });
        doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
        addOverlays(doc, data, a4W, a4H, `SATELLITE — Block ${blk.label}`);
      }
    }
  } else {
    // No blocks — just add satellite page
    onProgress(`Page ${++page}/${totalPages} — Satellite`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    doc.addImage(satCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, a4W, a4H);
    const c = document.createElement('canvas');
    renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { transparentBg: true, hideSymbols: true });
    doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
    addOverlays(doc, data, a4W, a4H, 'SATELLITE REFERENCE');
  }

  doc.save(`HLB_${data.hlbNumber || '0000'}_Naksha_2027.pdf`);
}

function addOverlays(doc: jsPDF, data: MapData, w: number, h: number, subtitle: string) {
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, w, 11, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  doc.text(`HLB No: ${data.hlbNumber} — ${subtitle}`, w / 2, 7.5, { align: 'center' });
  doc.setFillColor(255, 255, 255);
  doc.rect(0, h - 8, w, 8, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${data.enumeratorName || ''} | ${data.district}, ${data.state} | ${new Date().toLocaleDateString('en-IN')}`, w / 2, h - 2.5, { align: 'center' });
}
