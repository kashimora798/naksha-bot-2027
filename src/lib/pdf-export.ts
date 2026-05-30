import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MapData, Coordinate, SymbolType, PlacedSymbol, RoadFeature } from '../types';
import type { SurveySession, SurveySymbol, SurveyPoint, RoadSegment } from './idb';
import { SYMBOL_DEFS, isPakkaRoad, getUnitCount, polyCenter, isHouseType, isNonResidential } from '../types';
import { getBbox, polygonArea, generateSerpentinePath, distanceBetween, pointInPolygon, clusterByProximity, gridBlockOffsets, centroidXY } from './geo';
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
  const numSymbols = data.symbols?.length || 1;
  // Symbol size from LOCAL spacing, not global count: measure the median nearest-
  // neighbour distance between symbols in canvas space and size boxes to ~70% of it,
  // so sparse areas stay large/legible and only genuinely tight pockets shrink.
  let symSz: number;
  {
    const globalScale = Math.max(0.4, Math.min(1, 100 / numSymbols));
    const base = Math.max(16 * globalScale, Math.min(42 * globalScale, avgSc * 0.0002));
    const pts = (data.symbols || []).map(s => proj(s));
    if (pts.length >= 2) {
      // Sample up to 60 symbols for nearest-neighbour spacing (O(n*k) but bounded).
      const sample = pts.length > 60 ? pts.filter((_, i) => i % Math.ceil(pts.length / 60) === 0) : pts;
      const nn: number[] = [];
      for (let i = 0; i < sample.length; i++) {
        let best = Infinity;
        for (let j = 0; j < pts.length; j++) {
          if (pts[j] === sample[i]) continue;
          const d = Math.hypot(sample[i][0] - pts[j][0], sample[i][1] - pts[j][1]);
          if (d < best) best = d;
        }
        if (isFinite(best)) nn.push(best);
      }
      nn.sort((a, b) => a - b);
      const medianNN = nn.length ? nn[Math.floor(nn.length / 2)] : base;
      // Box ~70% of local spacing, clamped to a legible range; never larger than base.
      symSz = Math.max(10, Math.min(base, medianNN * 0.7));
    } else {
      symSz = base;
    }
  }

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

  // ─── ROADS — double-line style, ALL shown ──────────────
  for (const road of data.roads) {
    if (road.coords.length < 2) continue;
    const pk = isPakkaRoad(road.highway);
    const rs = ['residential', 'unclassified', 'tertiary', 'service', 'living_street'].includes(road.highway);
    const kt = ['footway', 'path', 'track', 'pedestrian', 'steps'].includes(road.highway);
    let oW: number, iW: number;
    if (pk) { oW = 16; iW = 8; } else if (rs) { oW = 12; iW = 6; } else if (kt) { oW = 10; iW = 5; } else { oW = 11; iW = 5.5; }
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
  ctx.setLineDash([]);

  // ─── SERPENTINE ─────────────────────────────────────────
  if (!options?.hideSymbols) {
    const serp = generateSerpentinePath(data.symbols, data.blocks?.length > 0 ? data.blocks : undefined);
    if (serp.length >= 2) {
      ctx.strokeStyle = 'rgba(220,50,50,0.2)'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
      ctx.beginPath(); serp.forEach((c, i) => { const [x, y] = proj(c); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }); ctx.stroke();
      ctx.setLineDash([]);

      // ─── NUMBERING-DIRECTION ARROWS (ORGI Annexure-4 §xii) ───
      // Draw an arrowhead wherever the numbering path changes heading beyond a
      // threshold (a "jump"), plus the very first step so the start direction is clear.
      const projPts = serp.map(c => proj(c));
      const headingAt = (i: number) => Math.atan2(projPts[i + 1][1] - projPts[i][1], projPts[i + 1][0] - projPts[i][0]);
      const drawArrow = (x: number, y: number, ang: number) => {
        const len = Math.max(7, symSz * 0.5);
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.strokeStyle = '#C0392B'; ctx.fillStyle = '#C0392B'; ctx.lineWidth = 2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len * 0.5, -len * 0.35); ctx.lineTo(-len * 0.5, len * 0.35); ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      let prevAng = headingAt(0);
      // First-step arrow at the start of the path
      drawArrow(projPts[1][0], projPts[1][1], prevAng);
      for (let i = 1; i < projPts.length - 1; i++) {
        const ang = headingAt(i);
        let d = Math.abs(ang - prevAng);
        if (d > Math.PI) d = 2 * Math.PI - d;
        // Heading changed by > ~50° → mark the jump with an arrow at the turn.
        if (d > 0.9) drawArrow(projPts[i + 1][0], projPts[i + 1][1], ang);
        prevAng = ang;
      }
      ctx.setLineDash([]);
    }
  }

  // ─── SYMBOLS — Upright viewport aligned ───────
  if (!options?.hideSymbols) {
    // Phase 5: Canvas-Space Solar Grid Snapping
    // Align symbols into a perfect non-overlapping grid on the high-res canvas
    const gridSz = symSz * 1.25;
    const occupied = new Set<string>();
    const snappedSymbols: { x: number, y: number, sym: PlacedSymbol, idealX: number, idealY: number }[] = [];

    // Precompute road segments in canvas space for collision avoidance.
    const roadSegs: [number, number, number, number][] = [];
    for (const road of data.roads || []) {
      if (road.coords.length < 2) continue;
      for (let i = 0; i < road.coords.length - 1; i++) {
        const [x1, y1] = proj(road.coords[i]);
        const [x2, y2] = proj(road.coords[i + 1]);
        roadSegs.push([x1, y1, x2, y2]);
      }
    }
    // Distance from point to a line segment (canvas px).
    const ptSegDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number): number => {
      const dx = x2 - x1, dy = y2 - y1;
      const l2 = dx * dx + dy * dy;
      let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    };
    // A cell center is "clear" if it's at least clearDist from every road segment.
    const clearDist = symSz * 0.62;
    const cellClearsRoads = (cx: number, cy: number): boolean => {
      for (const [x1, y1, x2, y2] of roadSegs) {
        if (ptSegDist(cx, cy, x1, y1, x2, y2) < clearDist) return false;
      }
      return true;
    };

    // Prioritize houses first to ensure they get the best grid spots
    const sortedSymbols = [...data.symbols].sort((a, b) => {
      const aH = isHouseType(a.symbol_type) ? -1 : 1;
      const bH = isHouseType(b.symbol_type) ? -1 : 1;
      return aH - bH;
    });

    // ─── DENSE-CLUSTER SCHEMATIC SPREAD (ORGI: map is not-to-scale) ───
    // House symbols packed tighter than one grid cell are laid out as a neat block
    // in numbering order near their real centroid, with a leader back to the cluster.
    // Non-clustered symbols fall through to the spiral snap below.
    const housePts = sortedSymbols
      .map((s, i) => ({ s, i, p: proj(s) }))
      .filter(o => isHouseType(o.s.symbol_type));
    const clusterCell = gridSz; // schematic block spacing
    const clusters = housePts.length >= 4
      ? clusterByProximity(housePts.map(o => ({ x: o.p[0], y: o.p[1] })), gridSz * 0.9, 5)
      : housePts.map((_, i) => [i]);
    const prePlaced = new Map<string, { x: number; y: number; idealX: number; idealY: number }>();
    for (const cl of clusters) {
      if (cl.length < 5) continue; // only genuinely dense groups get spread
      const members = cl.map(ci => housePts[ci]);
      // Keep numbering order if already numbered, else spatial order.
      members.sort((a, b) => (a.s.number ?? 1e9) - (b.s.number ?? 1e9));
      const cen = centroidXY(members.map(m => ({ x: m.p[0], y: m.p[1] })));
      const offs = gridBlockOffsets(members.length, cen.x, cen.y, clusterCell);
      members.forEach((m, k) => {
        const gx = Math.round(offs[k].x / gridSz), gy = Math.round(offs[k].y / gridSz);
        occupied.add(`${gx},${gy}`);
        prePlaced.set(m.s.id, { x: gx * gridSz, y: gy * gridSz, idealX: m.p[0], idealY: m.p[1] });
      });
    }

    for (const sym of sortedSymbols) {
      const pre = prePlaced.get(sym.id);
      if (pre) { snappedSymbols.push({ ...pre, sym }); continue; }
      const [idealX, idealY] = proj(sym);
      const gX0 = Math.round(idealX / gridSz);
      const gY0 = Math.round(idealY / gridSz);
      const free = (gx: number, gy: number) =>
        !occupied.has(`${gx},${gy}`) && cellClearsRoads(gx * gridSz, gy * gridSz);

      if (free(gX0, gY0)) {
        occupied.add(`${gX0},${gY0}`);
        snappedSymbols.push({ x: gX0 * gridSz, y: gY0 * gridSz, sym, idealX, idealY });
      } else {
        // Spiral search for the nearest cell that is empty AND clear of roads.
        let found = false;
        for (let ring = 1; ring <= 24 && !found; ring++) {
          for (let dx = -ring; dx <= ring && !found; dx++) {
            for (let dy = -ring; dy <= ring && !found; dy++) {
              if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
                if (free(gX0 + dx, gY0 + dy)) {
                  const gX = gX0 + dx, gY = gY0 + dy;
                  occupied.add(`${gX},${gY}`);
                  snappedSymbols.push({ x: gX * gridSz, y: gY * gridSz, sym, idealX, idealY });
                  found = true;
                }
              }
            }
          }
        }
        if (!found) {
          // Last resort: nearest empty cell ignoring roads, so we never drop a house.
          for (let ring = 1; ring <= 24 && !found; ring++) {
            for (let dx = -ring; dx <= ring && !found; dx++) {
              for (let dy = -ring; dy <= ring && !found; dy++) {
                if ((Math.abs(dx) === ring || Math.abs(dy) === ring) && !occupied.has(`${gX0 + dx},${gY0 + dy}`)) {
                  const gX = gX0 + dx, gY = gY0 + dy;
                  occupied.add(`${gX},${gY}`);
                  snappedSymbols.push({ x: gX * gridSz, y: gY * gridSz, sym, idealX, idealY });
                  found = true;
                }
              }
            }
          }
        }
        if (!found) snappedSymbols.push({ x: idealX, y: idealY, sym, idealX, idealY });
      }
    }

    // Leader lines: when a box was nudged far from its true location, connect them
    // so the number stays associated with the real house (standard cartographic practice).
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.8; ctx.setLineDash([3, 2]);
    for (const { x, y, idealX, idealY } of snappedSymbols) {
      if (Math.hypot(x - idealX, y - idealY) > gridSz * 1.5) {
        ctx.beginPath(); ctx.moveTo(idealX, idealY); ctx.lineTo(x, y); ctx.stroke();
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.beginPath(); ctx.arc(idealX, idealY, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.setLineDash([]);

    for (const { x, y, sym } of snappedSymbols) {
      drawSymbolOnCanvas(ctx, sym, x, y, symSz);
    }
  }

  // ─── LANDMARK LABELS ────────────────────────────────────
  if (!options?.hideSymbols) {
    for (const lm of (data.landmarks || [])) {
      if (lm.selectedForPdf === false) continue;
      const [x, y] = proj({ lat: lm.lat, lng: lm.lng });
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.font = 'bold 14px sans-serif';
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
        drawSymbolOnCanvas(ctx, { symbol_type: t }, lX + 8, ly, 9);
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
  const sheet = data.sheetSize === 'a3' ? 'a3' : 'a4';
  // A4: 210×297, A3: 297×420 (mm)
  const shortSide = sheet === 'a3' ? 297 : 210;
  const longSide = sheet === 'a3' ? 420 : 297;
  const a4W = isL ? longSide : shortSide;
  const a4H = isL ? shortSide : longSide;
  const dpi = 150;
  const pw = Math.round((a4W * dpi) / 25.4);
  const ph = Math.round((a4H * dpi) / 25.4);
  const doc = new jsPDF({ orientation: orient, unit: 'mm', format: sheet });

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
    addOverlays(doc, data, a4W, a4H, 'OVERVIEW', { south: pS, west: pW, north: pN, east: pE });
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
    addOverlays(doc, data, a4W, a4H, 'AI COMPARISON OVERLAY', { south: pS, west: pW, north: pN, east: pE });

    // ─── PAGE 1.6: FULL AI MAP (CLEAN) ──────────────────────────
    onProgress(`Page ${++page}/${totalPages} — Full AI Survey Map`);
    await new Promise(r => setTimeout(r, 50));
    doc.addPage();
    try {
      doc.addImage(img, 'JPEG', 0, 0, a4W, a4H);
      addOverlays(doc, data, a4W, a4H, 'AI SURVEY MAP', { south: pS, west: pW, north: pN, east: pE });
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
        addOverlays(doc, data, a4W, a4H, `BLOCK ${blk.label}`, blkBB);
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
        const blockSatCanvas = await captureSat(blkBB.south - padLat, blkBB.west - padLng, blkBB.north + padLat, blkBB.east + padLng);

        doc.addPage();
        doc.addImage(blockSatCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, a4W, a4H);
        const c = document.createElement('canvas');
        renderMapToCanvas(c, { ...data, orientation: orient }, pw, ph, { transparentBg: true, hideSymbols: true, focusBounds: blkBB });
        doc.addImage(c.toDataURL('image/png'), 'PNG', 0, 0, a4W, a4H);
        addOverlays(doc, data, a4W, a4H, `SATELLITE — Block ${blk.label}`, blkBB);
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
    addOverlays(doc, data, a4W, a4H, 'SATELLITE REFERENCE', { south: pS, west: pW, north: pN, east: pE });
  }

  // ─── ENLARGED-INSET PAGES for extremely congested clusters (ORGI §16) ───
  // Each very dense cluster gets its own full-page enlarged, schematic blow-up so
  // every house number is legible. A marker on the main map references "Inset N".
  await addClusterInsetPages(doc, data, orient, a4W, a4H, pw, ph, onProgress, () => ++page, totalPages);

  doc.save(`HLB_${data.hlbNumber || '0000'}_Naksha_2027.pdf`);
}

// Detect extremely dense clusters (in lat/lng space) and render one enlarged page each.
async function addClusterInsetPages(
  doc: jsPDF, data: MapData, _orient: 'landscape' | 'portrait',
  a4W: number, a4H: number, _pw: number, _ph: number,
  onProgress: (m: string) => void, nextPage: () => number, _total: number
) {
  const houses = (data.symbols || []).filter(s => isHouseType(s.symbol_type));
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
        doc.text(String(m.number), cx, cy + (isKutcha ? box * 0.18 : 0) + 1, { align: 'center' });
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
  if (bbox) drawScaleBar(doc, bbox, 8, h - 11, w);
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
  x: number, y: number, pageW: number
) {
  // Meters across the page width → choose a "nice" round bar length.
  const midLat = (bbox.south + bbox.north) / 2;
  const mPerDegLng = 111320 * Math.cos((midLat * Math.PI) / 180);
  const widthMeters = (bbox.east - bbox.west) * mPerDegLng;
  if (!isFinite(widthMeters) || widthMeters <= 0) return;
  const mmPerMeter = pageW / widthMeters;
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
  onProgress: (msg: string) => void
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

  await exportBlockPDF(mapData, 'portrait', onProgress);
}
