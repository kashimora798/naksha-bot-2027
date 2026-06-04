import type { Coordinate, PlacedSymbol, Block, RoadFeature, SymbolType } from '../types';
import { isHouseType } from '../types';
import { getBbox, pointInPolygon, polygonArea, distanceBetween } from './geo';
import { blockPoints } from './blocks';

// ─────────────────────────────────────────────────────────────
// Auto-place N symbols inside a block polygon, "in a mannered way".
// Produces positions only (number = null); serpentine numbering is
// applied separately by the screen via geo.ts getSerpentineOrder so
// the proven census numbering is reused across all blocks.
// ─────────────────────────────────────────────────────────────

export type LayoutMode = 'grid' | 'rows' | 'serpentine';

export interface PlaceOpts {
  count: number;
  type: SymbolType;
  layout: LayoutMode;
  roads?: RoadFeature[];
  /** apartment unit count */
  unitCount?: number;
  /** Polygons (lat/lng rings) where houses must NOT be placed — fields, ponds, forests. */
  exclusions?: Coordinate[][];
}

const M_PER_DEG_LAT = 111320;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/** Distance (m) from origin to segment (ax,ay)-(bx,by) in a local metre frame. */
function segDistToOrigin(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? -(ax * dx + ay * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Shortest distance (m) from point p to the polygon's edges (planar metre approx near p). */
export function minEdgeDistM(p: Coordinate, ring: Coordinate[]): number {
  const mLat = M_PER_DEG_LAT, mLng = mPerDegLng(p.lat);
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ax = (a.lng - p.lng) * mLng, ay = (a.lat - p.lat) * mLat;
    const bx = (b.lng - p.lng) * mLng, by = (b.lat - p.lat) * mLat;
    best = Math.min(best, segDistToOrigin(ax, ay, bx, by));
  }
  return best;
}

/** Bearing (deg) of the polygon's longest edge — the "road frontage" direction. */
export function longestEdgeBearing(ring: Coordinate[]): number {
  let best = 0, bestLen = -1;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const len = distanceBetween(a, b);
    if (len > bestLen) {
      bestLen = len;
      const lat1 = (a.lat * Math.PI) / 180, lat2 = (b.lat * Math.PI) / 180, dLng = ((b.lng - a.lng) * Math.PI) / 180;
      const y = Math.sin(dLng) * Math.cos(lat2);
      const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
      best = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    }
  }
  return best;
}

/**
 * Generate up to `count` interior lattice points, in row order, aligned to
 * `bearingDeg` (0 = north/east axis-aligned grid; longest-edge bearing = rows
 * parallel to roads).
 *
 * Dynamic spacing: the cell size is seeded from the AVAILABLE area (block minus
 * exclusions) and shrunk until `count` points fit. Every point is kept a margin
 * inside the block edge AND clear of every exclusion polygon, so houses never
 * straddle a road/boundary or land inside a marked field.
 */
function latticeInBlock(ring: Coordinate[], count: number, bearingDeg: number, exclusions: Coordinate[][]): { points: Coordinate[]; cellMeters: number } {
  const c = ring.reduce((a, p) => ({ lat: a.lat + p.lat / ring.length, lng: a.lng + p.lng / ring.length }), { lat: 0, lng: 0 });
  const mLat = M_PER_DEG_LAT, mLng = mPerDegLng(c.lat);
  const th = (bearingDeg * Math.PI) / 180;
  const sin = Math.sin(th), cos = Math.cos(th);

  // local metric basis: e_u along bearing, e_v perpendicular
  const toLatLng = (u: number, v: number): Coordinate => {
    const de = u * sin + v * cos, dn = u * cos - v * sin;
    return { lat: c.lat + dn / mLat, lng: c.lng + de / mLng };
  };

  const uv = ring.map(p => {
    const de = (p.lng - c.lng) * mLng, dn = (p.lat - c.lat) * mLat;
    return { u: de * sin + dn * cos, v: de * cos - dn * sin };
  });
  const uMin = Math.min(...uv.map(p => p.u)), uMax = Math.max(...uv.map(p => p.u));
  const vMin = Math.min(...uv.map(p => p.v)), vMax = Math.max(...uv.map(p => p.v));

  // Seed cell size from the BOUNDING BOX area (not polygon area).
  // The lattice sweeps the full [uMin,uMax]×[vMin,vMax] bbox; using polygon
  // area gives too-small cells for irregular/split polygons (L-shapes, triangles)
  // causing the first pass to already exceed `count` and returning congested pts.
  // Using bbox area guarantees a spacing appropriate for the sweep region;
  // pointInPolygon filtering then keeps only truly interior points.
  const bboxArea = Math.max(1, (uMax - uMin) * (vMax - vMin));
  const excludedArea = exclusions.reduce((s, ex) => s + (ex.length >= 3 ? polygonArea(ex) : 0), 0);
  const availArea = Math.max(1, polygonArea(ring) - excludedArea);
  // Fill ratio: what fraction of the bbox is actually polygon interior.
  // Use this to correct the density so we still converge quickly.
  const fillRatio = Math.max(0.15, Math.min(1, availArea / bboxArea));
  let cell = Math.max(1.5, Math.sqrt(bboxArea / Math.max(1, count / fillRatio)) * 0.95);

  const usable = (p: Coordinate, margin: number) => {
    if (!pointInPolygon(p, ring)) return false;
    if (minEdgeDistM(p, ring) < margin) return false;            // keep clear of road/boundary
    for (const ex of exclusions) {
      if (ex.length < 3) continue;
      if (pointInPolygon(p, ex)) return false;                   // never inside a field
      if (minEdgeDistM(p, ex) < margin) return false;            // keep a gap around the field
    }
    return true;
  };

  // Tight fixed margin: keep just a small clearance from the block edge so
  // houses align close to road boundaries (like a real census map) but still
  // have a small visual gap. A cell-proportional component handles very coarse
  // grids. Previously margin = max(2.6, cell*0.38) was far too large and caused
  // all interior points to be stripped in narrow blocks, yielding a single row.
  const EDGE_MARGIN = 1.8; // metres — absolute minimum clearance from block edge

  for (let iter = 0; iter < 20; iter++) {
    // margin = 1.8m + 8% of cell, capped at half-cell so we never exceed usable area.
    const margin = Math.min(cell * 0.48, EDGE_MARGIN + cell * 0.08);
    const pts: { p: Coordinate; u: number; v: number }[] = [];
    for (let v = vMin; v <= vMax; v += cell) {
      for (let u = uMin; u <= uMax; u += cell) {
        const p = toLatLng(u, v);
        if (usable(p, margin)) pts.push({ p, u, v });
      }
    }
    // Stop when we have enough points OR cell is already at the minimum.
    // Min cell is 3.5m so even 6-7m wide blocks can fit two rows.
    if (pts.length >= count || cell <= 3.5) {
      // row-major order: rows top→bottom (descending v), snake within each row
      const rowOf = (v: number) => Math.round((vMax - v) / cell);
      pts.sort((a, b) => {
        const ra = rowOf(a.v), rb = rowOf(b.v);
        if (ra !== rb) return ra - rb;
        return ra % 2 === 0 ? a.u - b.u : b.u - a.u;
      });
      return { points: pts.slice(0, count).map(x => x.p), cellMeters: cell };
    }
    cell = Math.max(3.5, cell * 0.78);
  }
  return { points: [], cellMeters: cell };
}

/**
 * The placement grid for a block (slot centres + cell size), so the UI can
 * draw the grid the houses snap to. `count` sizes the lattice density.
 */
export function blockGrid(block: Block, count: number, layout: LayoutMode, exclusions: Coordinate[][] = []): { centers: Coordinate[]; cellMeters: number } {
  const ring = blockPoints(block);
  if (ring.length < 3 || count <= 0) return { centers: [], cellMeters: 0 };
  const bearing = longestEdgeBearing(ring);
  const { points, cellMeters } = latticeInBlock(ring, count, bearing, exclusions);
  return { centers: points, cellMeters };
}

export interface SymGroup { type: SymbolType; count: number; unitCount?: number; }

/**
 * Place a MIX of symbol types in one block, e.g. 10 pucca + 2 kutcha. Types are
 * assigned along the serpentine lattice order (first group fills first slots).
 */
export function placeGroupsInBlock(block: Block, groups: SymGroup[], opts: { layout: LayoutMode; roads?: RoadFeature[]; exclusions?: Coordinate[][] }): PlacedSymbol[] {
  const total = groups.reduce((s, g) => s + Math.max(0, g.count), 0);
  if (total <= 0) return [];
  const ring = blockPoints(block);
  if (ring.length < 3) return [];
  const bearing = longestEdgeBearing(ring);
  const { points } = latticeInBlock(ring, total, bearing, opts.exclusions ?? []);
  const seq: { type: SymbolType; unitCount?: number }[] = [];
  for (const g of groups) for (let i = 0; i < Math.max(0, g.count); i++) seq.push({ type: g.type, unitCount: g.unitCount });
  return points.map((p, i) => {
    const t = seq[i] ?? seq[seq.length - 1];
    // Apply unit_count to any house type when unitCount > 1 (census model: any building can have multiple census houses)
    const hasUnits = (t.unitCount ?? 1) > 1;
    return {
      id: crypto.randomUUID(),
      symbol_type: t.type,
      lat: p.lat,
      lng: p.lng,
      number: null,
      placed_at: new Date().toISOString(),
      is_residential: isHouseType(t.type) ? true : undefined,
      unit_count: (isHouseType(t.type) && hasUnits) ? (t.unitCount ?? 2) : undefined,
    };
  });
}

/** Place up to `count` symbols of `type` inside `block` using the chosen layout. */
export function placeHousesInBlock(block: Block, opts: PlaceOpts): PlacedSymbol[] {
  const { count, type, layout } = opts;
  if (count <= 0) return [];
  const ring = blockPoints(block);
  if (ring.length < 3) return [];
  const bearing = longestEdgeBearing(ring);
  const { points } = latticeInBlock(ring, count, bearing, opts.exclusions ?? []);
  return points.map(p => ({
    id: crypto.randomUUID(),
    symbol_type: type,
    lat: p.lat,
    lng: p.lng,
    number: null,
    placed_at: new Date().toISOString(),
    is_residential: isHouseType(type) ? true : undefined,
    unit_count: type === 'apartment' ? (opts.unitCount ?? 2) : undefined,
  }));
}

// re-export for convenience
export { getBbox };
