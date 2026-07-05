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

/** Shortest distance (m) from point p to the nearest road segment. */
export function minRoadDistM(p: Coordinate, roads: RoadFeature[]): number {
  const mLat = M_PER_DEG_LAT, mLng = mPerDegLng(p.lat);
  let best = Infinity;
  for (const rd of roads) {
    if (!rd.coords || rd.coords.length < 2) continue;
    for (let i = 0; i < rd.coords.length - 1; i++) {
      const a = rd.coords[i], b = rd.coords[i + 1];
      const ax = (a.lng - p.lng) * mLng, ay = (a.lat - p.lat) * mLat;
      const bx = (b.lng - p.lng) * mLng, by = (b.lat - p.lat) * mLat;
      best = Math.min(best, segDistToOrigin(ax, ay, bx, by));
    }
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
 * exclusions) and shrinks until `count` points fit. Every point is kept a margin
 * inside the block edge AND clear of every exclusion polygon, so houses never
 * straddle a road/boundary or land inside a marked field.
 */
function latticeInBlock(ring: Coordinate[], count: number, bearingDeg: number, exclusions: Coordinate[][], layout: LayoutMode): { points: Coordinate[]; cellMeters: number };
function latticeInBlock(ring: Coordinate[], count: number, bearingDeg: number, exclusions: Coordinate[][], layout: LayoutMode, roads?: RoadFeature[], roadBufferMeters?: number): { points: Coordinate[]; cellMeters: number };
function latticeInBlock(ring: Coordinate[], count: number, bearingDeg: number, exclusions: Coordinate[][], layout: LayoutMode, roads?: RoadFeature[], roadBufferMeters?: number): { points: Coordinate[]; cellMeters: number } {
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

  const excludedArea = exclusions.reduce((s, ex) => s + (ex.length >= 3 ? polygonArea(ex) : 0), 0);
  const availArea = Math.max(1, polygonArea(ring) - excludedArea);

  const targetSpacing = Math.sqrt(availArea / Math.max(1, count));
  const gridStep = Math.max(1.2, Math.min(15.0, targetSpacing / 4.5));

  const roadBuf = (roads && roadBufferMeters) ? roadBufferMeters : 0;

  const usable = (p: Coordinate, margin: number) => {
    if (!pointInPolygon(p, ring)) return false;
    if (minEdgeDistM(p, ring) < margin) return false;
    // Keep symbols clear of roads
    if (roadBuf > 0 && roads && minRoadDistM(p, roads) < roadBuf) return false;
    for (const ex of exclusions) {
      if (ex.length < 3) continue;
      if (pointInPolygon(p, ex)) return false;
      if (minEdgeDistM(p, ex) < margin) return false;
    }
    return true;
  };

  interface Candidate {
    p: Coordinate;
    u: number;
    v: number;
    edgeDist: number;
    exDist: number;
  }

  // Find candidate points using a dynamic initial edge margin
  let candidates: Candidate[] = [];
  
  for (const m of [0.8, 0.4, 0.0]) {
    candidates = [];
    for (let v = vMin; v <= vMax + 0.01; v += gridStep) {
      for (let u = uMin; u <= uMax + 0.01; u += gridStep) {
        const p = toLatLng(u, v);
        if (usable(p, m)) {
          const edgeDist = minEdgeDistM(p, ring);
          let exDist = Infinity;
          for (const ex of exclusions) {
            if (ex.length >= 3) {
              exDist = Math.min(exDist, minEdgeDistM(p, ex));
            }
          }
          candidates.push({ p, u, v, edgeDist, exDist });
        }
      }
    }
    if (candidates.length >= count) {
      break;
    }
  }

  // Sort candidates in serpentine row-major order
  const rowOf = (v: number) => Math.round((vMax - v) / gridStep);
  candidates.sort((a, b) => {
    const ra = rowOf(a.v), rb = rowOf(b.v);
    if (ra !== rb) return ra - rb;
    return ra % 2 === 0 ? a.u - b.u : b.u - a.u;
  });

  const selectPoints = (cand: Candidate[], dist: number, maxCount: number, layoutMode: LayoutMode) => {
    let selected: Candidate[] = [];
    const reqMargin = Math.max(3.5, Math.min(5.0, dist * 0.42));
    
    // For 'rows' (along roads), try to restrict to points close to block edges.
    const maxEdgeDist = layoutMode === 'rows' ? Math.max(reqMargin + 5.0, 7.5) : Infinity;
    const distYScale = layoutMode === 'serpentine' ? 1.35 : 1.0;

    for (const c of cand) {
      if (c.edgeDist < reqMargin || c.exDist < reqMargin) {
        continue;
      }
      if (layoutMode === 'rows' && c.edgeDist > maxEdgeDist) {
        continue;
      }
      let ok = true;
      for (const s of selected) {
        const dx = c.u - s.u;
        const dy = (c.v - s.v) * distYScale;
        if (dx * dx + dy * dy < dist * dist) {
          ok = false;
          break;
        }
      }
      if (ok) {
        selected.push(c);
        if (selected.length === maxCount) {
          break;
        }
      }
    }

    // Fallback for rows layout: if we couldn't fit the requested count, do a standard select
    if (layoutMode === 'rows' && selected.length < maxCount) {
      selected = [];
      for (const c of cand) {
        if (c.edgeDist < reqMargin || c.exDist < reqMargin) {
          continue;
        }
        let ok = true;
        for (const s of selected) {
          const dx = c.u - s.u;
          const dy = c.v - s.v;
          if (dx * dx + dy * dy < dist * dist) {
            ok = false;
            break;
          }
        }
        if (ok) {
          selected.push(c);
          if (selected.length === maxCount) {
            break;
          }
        }
      }
    }

    return selected;
  };

  const minCellAllowed = 5.0;
  let low = minCellAllowed;
  let high = Math.max(minCellAllowed + 1.0, Math.hypot(uMax - uMin, vMax - vMin));
  let bestD = minCellAllowed;
  let bestPts: Candidate[] = [];

  // Binary search for maximum spacing D that fits `count` points
  if (candidates.length > 0) {
    for (let step = 0; step < 15; step++) {
      const mid = (low + high) / 2;
      const selected = selectPoints(candidates, mid, count, layout);
      if (selected.length >= count) {
        bestD = mid;
        bestPts = selected;
        low = mid;
      } else {
        high = mid;
      }
    }

    if (bestPts.length < count) {
      // Fallback: allow the margin to shrink down to 1.5m to guarantee we fit them, and spacing to 4.5m
      bestD = 4.5;
      const fallbackSelect = (cand: Candidate[], dist: number, maxCount: number) => {
        const selected: Candidate[] = [];
        const reqMargin = 3.0;
        for (const c of cand) {
          if (c.edgeDist < reqMargin || c.exDist < reqMargin) {
            continue;
          }
          let ok = true;
          for (const s of selected) {
            const dx = c.u - s.u;
            const dy = c.v - s.v;
            if (dx * dx + dy * dy < dist * dist) {
              ok = false;
              break;
            }
          }
          if (ok) {
            selected.push(c);
            if (selected.length === maxCount) {
              break;
            }
          }
        }
        return selected;
      };
      bestPts = fallbackSelect(candidates, minCellAllowed, count);
    }
  }

  return { points: bestPts.map(x => x.p), cellMeters: bestD };
}

/**
 * The placement grid for a block (slot centres + cell size), so the UI can
 * draw the grid the houses snap to. `count` sizes the lattice density.
 */
export function blockGrid(block: Block, count: number, layout: LayoutMode, exclusions: Coordinate[][] = [], roads?: RoadFeature[], roadBufferMeters?: number): { centers: Coordinate[]; cellMeters: number } {
  const ring = blockPoints(block);
  if (ring.length < 3 || count <= 0) return { centers: [], cellMeters: 0 };
  const bearing = longestEdgeBearing(ring);
  const { points, cellMeters } = latticeInBlock(ring, count, bearing, exclusions, layout, roads, roadBufferMeters);
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
  const ROAD_BUFFER = 8; // metres from road centreline — keeps icons fully clear of road stroke
  const { points } = latticeInBlock(ring, total, bearing, opts.exclusions ?? [], opts.layout, opts.roads, ROAD_BUFFER);
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
  const ROAD_BUFFER = 8; // metres from road centreline — keeps icons fully clear of road stroke
  const { points } = latticeInBlock(ring, count, bearing, opts.exclusions ?? [], layout, opts.roads, ROAD_BUFFER);
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
