import type { Coordinate, PlacedSymbol, RoadFeature } from '../types';
import { isHouseType, isNumberableSymbol } from '../types';

// ═══════════════════════════════════════════════════════════
// COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════

function metersToLat(m: number): number { return m / 111320; }
function metersToLng(m: number, lat: number): number {
  return m / (111320 * Math.cos((lat * Math.PI) / 180));
}
function latMeters(deg: number): number { return deg * 111320; }
function lngMeters(deg: number, lat: number): number {
  return deg * 111320 * Math.cos((lat * Math.PI) / 180);
}

// ═══════════════════════════════════════════════════════════
// GRID SNAPPING — Force markers onto a clean uniform grid
// ═══════════════════════════════════════════════════════════

interface GridCell { row: number; col: number; }

function cellKey(row: number, col: number): string { return `${row},${col}`; }

/**
 * Snap ALL symbols to a rigid grid. Two symbols can never share a cell.
 * If a cell is occupied, spiral outward to find the nearest empty one.
 */
function snapToGrid(
  symbols: PlacedSymbol[],
  gridMeters: number,
  boundary: Coordinate[]
): PlacedSymbol[] {
  if (symbols.length === 0) return symbols;

  const avgLat = symbols.reduce((s, p) => s + p.lat, 0) / symbols.length;
  const cellLat = metersToLat(gridMeters);
  const cellLng = metersToLng(gridMeters, avgLat);

  // Origin = min lat/lng of all symbols
  const origin: Coordinate = {
    lat: Math.min(...symbols.map(s => s.lat)),
    lng: Math.min(...symbols.map(s => s.lng)),
  };

  const occupied = new Set<string>();
  const result: PlacedSymbol[] = [];

  // Numbered symbols first (they need clean spacing for numbering)
  const sorted = [...symbols].sort((a, b) => {
    if (isNumberableSymbol(a.symbol_type) && !isNumberableSymbol(b.symbol_type)) return -1;
    if (!isNumberableSymbol(a.symbol_type) && isNumberableSymbol(b.symbol_type)) return 1;
    return 0;
  });

  for (const sym of sorted) {
    const baseRow = Math.round((sym.lat - origin.lat) / cellLat);
    const baseCol = Math.round((sym.lng - origin.lng) / cellLng);
    const key = cellKey(baseRow, baseCol);

    if (!occupied.has(key)) {
      occupied.add(key);
      result.push({
        ...sym,
        lat: origin.lat + baseRow * cellLat,
        lng: origin.lng + baseCol * cellLng,
      });
    } else {
      // Spiral outward to find nearest empty cell
      const found = spiralFind(baseRow, baseCol, occupied, 30);
      if (found) {
        const fKey = cellKey(found.row, found.col);
        occupied.add(fKey);
        result.push({
          ...sym,
          lat: origin.lat + found.row * cellLat,
          lng: origin.lng + found.col * cellLng,
        });
      } else {
        result.push({ ...sym }); // fallback: original position
      }
    }
  }

  return result;
}

/**
 * Spiral outward from (cr, cc) to find the nearest unoccupied cell.
 * Checks in concentric rings: ring 1 = 8 cells, ring 2 = 16 cells, etc.
 */
function spiralFind(
  cr: number, cc: number, occupied: Set<string>, maxRing: number
): GridCell | null {
  for (let ring = 1; ring <= maxRing; ring++) {
    // Top and bottom edges of the ring
    for (let dc = -ring; dc <= ring; dc++) {
      if (!occupied.has(cellKey(cr - ring, cc + dc))) return { row: cr - ring, col: cc + dc };
      if (!occupied.has(cellKey(cr + ring, cc + dc))) return { row: cr + ring, col: cc + dc };
    }
    // Left and right edges (excluding corners already checked)
    for (let dr = -ring + 1; dr <= ring - 1; dr++) {
      if (!occupied.has(cellKey(cr + dr, cc - ring))) return { row: cr + dr, col: cc - ring };
      if (!occupied.has(cellKey(cr + dr, cc + ring))) return { row: cr + dr, col: cc + ring };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// COLLISION RESOLUTION — Push overlapping markers apart
// ═══════════════════════════════════════════════════════════

function distMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const avgLat = (a.lat + b.lat) / 2;
  const dx = lngMeters(b.lng - a.lng, avgLat);
  const dy = latMeters(b.lat - a.lat);
  return Math.sqrt(dx * dx + dy * dy);
}

function resolveCollisions(
  symbols: PlacedSymbol[],
  minDistMeters: number,
  iterations: number = 15
): PlacedSymbol[] {
  const result = symbols.map(s => ({ ...s }));
  const avgLat = result.reduce((s, p) => s + p.lat, 0) / (result.length || 1);

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < result.length; i++) {
      for (let j = i + 1; j < result.length; j++) {
        const d = distMeters(result[i], result[j]);
        if (d < minDistMeters && d > 0.001) {
          // Push apart by the full overlap amount (not half)
          const push = (minDistMeters - d) * 0.6;
          const dx = result[j].lng - result[i].lng;
          const dy = result[j].lat - result[i].lat;
          const len = Math.sqrt(dx * dx + dy * dy) || 0.000001;
          const pushLat = metersToLat(push) * (dy / len);
          const pushLng = metersToLng(push, avgLat) * (dx / len);

          result[i].lat -= pushLat;
          result[i].lng -= pushLng;
          result[j].lat += pushLat;
          result[j].lng += pushLng;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }

  return result;
}

// ═══════════════════════════════════════════════════════════
// ROAD ALIGNMENT — Rotate icons to face nearest road
// ═══════════════════════════════════════════════════════════

export function getRoadAlignmentAngle(
  sym: { lat: number; lng: number },
  roads: RoadFeature[]
): number {
  let bestDist = Infinity;
  let bestAngle = 0;

  for (const road of roads) {
    for (let i = 0; i < road.coords.length - 1; i++) {
      const a = road.coords[i], b = road.coords[i + 1];
      const mx = (a.lat + b.lat) / 2, my = (a.lng + b.lng) / 2;
      const d = distMeters(sym, { lat: mx, lng: my });

      if (d < bestDist) {
        bestDist = d;
        const rdx = b.lng - a.lng;
        const rdy = b.lat - a.lat;
        let angle = Math.atan2(rdy, rdx) * (180 / Math.PI);
        // Snap to nearest 90° for CLEAN alignment (solar panel look)
        angle = Math.round(angle / 90) * 90;
        bestAngle = angle;
      }
    }
  }

  return bestAngle;
}

export function buildRotationMap(
  symbols: PlacedSymbol[],
  roads: RoadFeature[]
): Map<string, number> {
  const map = new Map<string, number>();
  if (roads.length === 0) return map;
  for (const sym of symbols) {
    if (isHouseType(sym.symbol_type)) {
      map.set(sym.id, getRoadAlignmentAngle(sym, roads));
    }
  }
  return map;
}

// ═══════════════════════════════════════════════════════════
// MASTER DECLUTTER — Grid snap → Collision push → Done
// ═══════════════════════════════════════════════════════════

export function declutterSymbols(
  symbols: PlacedSymbol[],
  boundary: Coordinate[],
  roads: RoadFeature[],
  options?: { gridSize?: number; minDist?: number }
): PlacedSymbol[] {
  if (symbols.length < 2) return symbols;

  // Adaptive grid size based on density — MUCH more aggressive now
  const area = boundary.length >= 3 ? approxArea(boundary) : 10000;
  const density = symbols.length / Math.max(1, area / 10000); // per hectare

  // Key insight: marker icons are ~20px which at zoom 17-18 = ~12-16m
  // Grid must be larger than that to prevent any visual overlap between boxes
  const defaultGrid = density > 80 ? 22 : density > 40 ? 26 : density > 15 ? 28 : 24;
  const gridSize = options?.gridSize ?? defaultGrid;
  const minDist = options?.minDist ?? Math.max(16, gridSize * 0.9);

  // Step 1: Grid snap (ensures rigid spacing)
  let result = snapToGrid(symbols, gridSize, boundary);

  // Step 2: Collision resolution (handles any remaining overlaps)
  result = resolveCollisions(result, minDist, 15);

  return result;
}

function approxArea(coords: Coordinate[]): number {
  if (coords.length < 3) return 0;
  const avgLat = coords.reduce((s, c) => s + c.lat, 0) / coords.length;
  const mLat = 111320, mLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    area += coords[i].lng * mLng * coords[j].lat * mLat;
    area -= coords[j].lng * mLng * coords[i].lat * mLat;
  }
  return Math.abs(area) / 2;
}
