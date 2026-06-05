import * as turf from '@turf/turf';
import type { Feature, LineString, Polygon, Position } from 'geojson';
import type { Coordinate, RoadFeature, Block } from '../types';
import { getBbox, pointInPolygon } from './geo';

// ─────────────────────────────────────────────────────────────
// Block auto-detection + edit operations for Canvas Block Mapping
// Everything stays in geo space ([lng, lat]) so detected blocks slot
// straight into MapData.blocks and the existing geo PDF pipeline.
// ─────────────────────────────────────────────────────────────

const toLngLat = (c: Coordinate): Position => [c.lng, c.lat];
const toCoord = ([lng, lat]: Position): Coordinate => ({ lat, lng });

/** Excel-style labels: A..Z, AA, AB, … */
export function labelFor(i: number): string {
  let s = '';
  i += 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

/** Re-assign labels in reading order: north→south, then west→east. */
export function relabelBlocks(blocks: Block[]): Block[] {
  const withC = blocks.map(b => {
    const pts = blockPoints(b);
    const c = pts.reduce((a, p) => ({ lat: a.lat + p.lat / pts.length, lng: a.lng + p.lng / pts.length }), { lat: 0, lng: 0 });
    return { b, c };
  });
  withC.sort((x, y) => (y.c.lat - x.c.lat) || (x.c.lng - y.c.lng));
  return withC.map((x, i) => ({ ...x.b, label: labelFor(i) }));
}

/** Normalise a Block to a closed point ring (uses points[], else bbox corners). */
export function blockPoints(b: Block): Coordinate[] {
  if (b.points && b.points.length >= 3) return b.points;
  return [
    { lat: b.north, lng: b.west }, { lat: b.north, lng: b.east },
    { lat: b.south, lng: b.east }, { lat: b.south, lng: b.west },
  ];
}

function polygonToBlock(ring: Position[], label: string, autoDetected: boolean, extra?: Partial<Block>): Block {
  // Drop the closing duplicate vertex if present
  const open = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1) : ring;
  const pts = open.map(toCoord);
  const bb = getBbox(pts);
  return { id: crypto.randomUUID(), label, points: pts, ...bb, autoDetected, ...extra };
}

/**
 * Node a set of lines so they only meet at endpoints, then polygonize.
 * Returns the closed faces (as outer rings in [lng,lat]).
 */
function facesFromLines(lines: Feature<LineString>[]): Position[][] {
  // 1. Collect all pairwise intersection points per line index.
  const splitPts: Map<number, Position[]> = new Map();
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      let inter;
      try { inter = turf.lineIntersect(lines[i], lines[j]); } catch { continue; }
      for (const f of inter.features) {
        const p = f.geometry.coordinates as Position;
        (splitPts.get(i) ?? splitPts.set(i, []).get(i)!).push(p);
        (splitPts.get(j) ?? splitPts.set(j, []).get(j)!).push(p);
      }
    }
  }
  // 2. Split each line at its intersection points.
  const noded: Feature<LineString>[] = [];
  lines.forEach((line, idx) => {
    const pts = splitPts.get(idx);
    if (!pts || !pts.length) { noded.push(line); return; }
    try {
      const splitter = pts.length === 1 ? turf.point(pts[0]) : turf.multiPoint(pts);
      const pieces = turf.lineSplit(line, splitter as any);
      if (pieces.features.length) noded.push(...pieces.features);
      else noded.push(line);
    } catch { noded.push(line); }
  });
  // 3. Polygonize the noded network.
  try {
    const fc = turf.polygonize(turf.featureCollection(noded));
    return fc.features.map(f => (f.geometry as Polygon).coordinates[0]);
  } catch {
    return [];
  }
}

export interface DetectOpts {
  /** Drop faces smaller than this (m²). Default 80. */
  minAreaSqm?: number;
  /** Assumed total road width (m) carved out between blocks. Default 7. */
  roadWidthMeters?: number;
}

/**
 * Auto-detect blocks by BUFFER-AND-DIFFERENCE rather than polygonize.
 *
 * polygonize() needs a perfectly-noded planar graph — every road crossing must
 * be a shared vertex. Real OSM road centrelines (and clipped roads) are NOT
 * noded and are full of dangling service lanes, so polygonize yields no faces.
 *
 * Instead we thicken every road into a thin strip, union the strips into one
 * road mask, and subtract that mask from the boundary polygon. The leftover
 * pieces ARE the blocks. This needs no topology, tolerates dead-end stubs and
 * un-noded crossings, and naturally clips blocks to the HLB boundary.
 */
export function detectBlocks(roads: RoadFeature[], boundary: Coordinate[], opts: DetectOpts = {}): Block[] {
  const minArea = opts.minAreaSqm ?? 80;
  const halfWidth = (opts.roadWidthMeters ?? 7) / 2;
  if (boundary.length < 3) return [];

  let boundaryPoly;
  try { boundaryPoly = turf.polygon([closeRing(boundary.map(toLngLat))]); } catch { return []; }

  // 1. Buffer every road centreline into a thin area.
  const buffers: any[] = [];
  for (const r of roads) {
    if (r.coords.length < 2) continue;
    try {
      const line = turf.lineString(r.coords.map(toLngLat));
      const buf = turf.buffer(line, halfWidth, { units: 'meters' });
      if (buf) buffers.push(buf);
    } catch { /* skip */ }
  }
  if (!buffers.length) return [];

  // 2. Union all road strips into a single mask.
  let roadMask;
  try { roadMask = buffers.length === 1 ? buffers[0] : turf.union(turf.featureCollection(buffers)); }
  catch { return []; }
  if (!roadMask) return [];

  // 3. boundary − roads = the blocks.
  let diff;
  try { diff = turf.difference(turf.featureCollection([boundaryPoly, roadMask])); }
  catch { return []; }
  if (!diff) return [];

  const rings: Position[][] = diff.geometry.type === 'MultiPolygon'
    ? (diff.geometry.coordinates as Position[][][]).map(poly => poly[0])
    : [(diff.geometry as Polygon).coordinates[0]];

  const out: Block[] = [];
  for (const ring of rings) {
    if (ring.length < 4) continue;
    let areaSqm = 0;
    try { areaSqm = turf.area(turf.polygon([closeRing(ring)])); } catch { /* keep */ }
    if (areaSqm && areaSqm < minArea) continue; // drop slivers along the boundary edge
    out.push(polygonToBlock(ring, '', true));
  }
  return relabelBlocks(out);
}

/** Union two adjacent blocks. Returns null if they are disjoint (MultiPolygon). */
export function mergeBlocks(a: Block, b: Block): Block | null {
  try {
    const pa = turf.polygon([closeRing(blockPoints(a).map(toLngLat))]);
    const pb = turf.polygon([closeRing(blockPoints(b).map(toLngLat))]);
    const u = turf.union(turf.featureCollection([pa, pb]));
    if (!u || u.geometry.type !== 'Polygon') return null;
    // Carry forward symbolSizeMultiplier from the first source block
    return polygonToBlock((u.geometry as Polygon).coordinates[0], a.label, false, { symbolSizeMultiplier: a.symbolSizeMultiplier });
  } catch {
    return null;
  }
}

function extendLine(coords: Coordinate[], extDist: number = 0.0003): Coordinate[] {
  if (coords.length < 2) return coords;
  const extended = [...coords];
  
  // Extend start (away from segment direction by extDist)
  const p0 = coords[0];
  const p1 = coords[1];
  const dx = p0.lng - p1.lng;
  const dy = p0.lat - p1.lat;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    const extLng = p0.lng + (dx / len) * extDist;
    const extLat = p0.lat + (dy / len) * extDist;
    extended[0] = { lat: extLat, lng: extLng };
  }
  
  // Extend end (away from segment direction by extDist)
  const n = coords.length;
  const pen = coords[n - 2];
  const last = coords[n - 1];
  const edx = last.lng - pen.lng;
  const edy = last.lat - pen.lat;
  const elen = Math.hypot(edx, edy);
  if (elen > 0) {
    const extLng = last.lng + (edx / elen) * extDist;
    const extLat = last.lat + (edy / elen) * extDist;
    extended[n - 1] = { lat: extLat, lng: extLng };
  }
  
  return extended;
}

/** Split a block by a user-drawn cut line into two (or more) blocks. */
export function splitBlock(b: Block, cutLine: Coordinate[]): Block[] {
  if (cutLine.length < 2) return [b];
  try {
    const poly = turf.polygon([closeRing(blockPoints(b).map(toLngLat))]);
    const diagonal = Math.hypot(b.east - b.west, b.north - b.south);
    const extDist = Math.max(0.005, diagonal * 2); // Dynamic: at least ~550m or 2x the block diagonal
    const extLine = extendLine(cutLine, extDist);
    const line = turf.lineString(extLine.map(toLngLat));
    
    // Thicken the cut line slightly (e.g. 0.4 meters)
    const buffer = turf.buffer(line, 0.4, { units: 'meters' });
    if (!buffer) return [b];
    
    // Subtract the buffer from the block
    const diff = turf.difference(turf.featureCollection([poly, buffer]));
    if (!diff) return [b];
    
    const rings: Position[][] = diff.geometry.type === 'MultiPolygon'
      ? (diff.geometry.coordinates as Position[][][]).map(poly => poly[0])
      : [(diff.geometry as Polygon).coordinates[0]];
      
    if (rings.length < 2) return [b]; // didn't cut it into pieces
    
    return rings.map((ring, i) => polygonToBlock(ring, `${b.label}${i + 1}`, false, { symbolSizeMultiplier: b.symbolSizeMultiplier }));
  } catch (err) {
    console.error('splitBlock error:', err);
    return [b];
  }
}

function closeRing(ring: Position[]): Position[] {
  if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) {
    return [...ring, ring[0]];
  }
  return ring;
}
