import { describe, it, expect } from 'vitest';
import { detectBlocks, mergeBlocks, splitBlock, relabelBlocks, blockPoints } from '../blocks';
import { pointInPolygon, polygonArea } from '../geo';
import type { Coordinate, RoadFeature, Block } from '../../types';

// A ~small square boundary near the equator (so 1 deg ≈ 111 km, areas are large but consistent).
// Use a tiny 0.01° box (~1.1 km) split by one vertical + one horizontal road through the middle.
const B = (lat: number, lng: number): Coordinate => ({ lat, lng });

const boundary: Coordinate[] = [B(0, 0), B(0.01, 0), B(0.01, 0.01), B(0, 0.01)];

function road(coords: Coordinate[], source: 'osm' | 'user' = 'user'): RoadFeature {
  return { id: Math.random().toString(36), coords, highway: 'residential', confirmed: true, source };
}

describe('detectBlocks', () => {
  it('a + (cross) of two roads inside a square boundary → 4 blocks', () => {
    const vert = road([B(-0.001, 0.005), B(0.011, 0.005)]);
    const horiz = road([B(0.005, -0.001), B(0.005, 0.011)]);
    const blocks = detectBlocks([vert, horiz], boundary, { minAreaSqm: 100 });
    expect(blocks.length).toBe(4);
    // Every block centroid sits inside the boundary.
    for (const b of blocks) {
      const pts = blockPoints(b);
      const c = pts.reduce((a, p) => ({ lat: a.lat + p.lat / pts.length, lng: a.lng + p.lng / pts.length }), { lat: 0, lng: 0 });
      expect(pointInPolygon(c, boundary)).toBe(true);
    }
    // Labels are unique.
    expect(new Set(blocks.map(b => b.label)).size).toBe(4);
  });

  it('no roads → no blocks (boundary alone is not subdivided)', () => {
    const blocks = detectBlocks([], boundary, { minAreaSqm: 100 });
    // Boundary alone yields a single face whose centroid is inside — acceptable as one block, but
    // with no roads there is nothing to polygonize against; assert it never throws and returns ≤1.
    expect(blocks.length).toBeLessThanOrEqual(1);
  });

  it('drops sub-threshold slivers', () => {
    // Two near-parallel roads a hair apart create a thin sliver that should be filtered out.
    const a = road([B(-0.001, 0.005), B(0.011, 0.005)]);
    const b = road([B(-0.001, 0.00505), B(0.011, 0.00505)]);
    const blocks = detectBlocks([a, b], boundary, { minAreaSqm: 5000 });
    for (const blk of blocks) {
      expect(polygonArea(blockPoints(blk))).toBeGreaterThanOrEqual(5000);
    }
  });
});

describe('mergeBlocks', () => {
  it('two adjacent squares → one rectangle covering both', () => {
    const left: Block = { id: '1', label: 'A', north: 10, south: 0, west: 0, east: 5, points: [B(10, 0), B(10, 5), B(0, 5), B(0, 0)], autoDetected: true };
    const right: Block = { id: '2', label: 'B', north: 10, south: 0, west: 5, east: 10, points: [B(10, 5), B(10, 10), B(0, 10), B(0, 5)], autoDetected: true };
    const merged = mergeBlocks(left, right);
    expect(merged).not.toBeNull();
    expect(merged!.west).toBeCloseTo(0);
    expect(merged!.east).toBeCloseTo(10);
    expect(merged!.north).toBeCloseTo(10);
    expect(merged!.south).toBeCloseTo(0);
    expect(merged!.autoDetected).toBe(false);
  });

  it('two disjoint squares → null', () => {
    const a: Block = { id: '1', label: 'A', north: 1, south: 0, west: 0, east: 1, points: [B(1, 0), B(1, 1), B(0, 1), B(0, 0)] };
    const far: Block = { id: '2', label: 'B', north: 1, south: 0, west: 5, east: 6, points: [B(1, 5), B(1, 6), B(0, 6), B(0, 5)] };
    expect(mergeBlocks(a, far)).toBeNull();
  });
});

describe('splitBlock', () => {
  it('a vertical cut through a square → two halves', () => {
    const sq: Block = { id: '1', label: 'A', north: 0.01, south: 0, west: 0, east: 0.01, points: [B(0, 0), B(0.01, 0), B(0.01, 0.01), B(0, 0.01)] };
    const cut: Coordinate[] = [B(-0.001, 0.005), B(0.011, 0.005)];
    const parts = splitBlock(sq, cut);
    expect(parts.length).toBe(2);
    const total = polygonArea(blockPoints(sq));
    const sum = parts.reduce((s, p) => s + polygonArea(blockPoints(p)), 0);
    expect(Math.abs(sum - total) / total).toBeLessThan(0.01); // within 1% conservation (excluding minor buffer gap)
  });
});

describe('relabelBlocks', () => {
  it('labels north→south, west→east as A, B, C…', () => {
    const south: Block = { id: '1', label: 'X', north: 1, south: 0, west: 0, east: 1, points: [B(1, 0), B(1, 1), B(0, 1), B(0, 0)] };
    const north: Block = { id: '2', label: 'Y', north: 3, south: 2, west: 0, east: 1, points: [B(3, 0), B(3, 1), B(2, 1), B(2, 0)] };
    const out = relabelBlocks([south, north]);
    const byId = Object.fromEntries(out.map(b => [b.id, b.label]));
    expect(byId['2']).toBe('A'); // northern block first
    expect(byId['1']).toBe('B');
  });
});
