import { describe, it, expect } from 'vitest';

// Mirror of the canvas-space point-to-segment distance used in renderMapToCanvas's
// road-aware placement. Kept in sync with pdf-export.ts ptSegDist.
function ptSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

describe('ptSegDist (road-aware placement)', () => {
  it('distance to a point on the segment is 0', () => {
    expect(ptSegDist(5, 0, 0, 0, 10, 0)).toBeCloseTo(0);
  });
  it('perpendicular distance to a horizontal segment', () => {
    expect(ptSegDist(5, 4, 0, 0, 10, 0)).toBeCloseTo(4);
  });
  it('clamps past the segment end (uses endpoint distance)', () => {
    expect(ptSegDist(13, 0, 0, 0, 10, 0)).toBeCloseTo(3);
  });
  it('clamps before the segment start', () => {
    expect(ptSegDist(-3, 4, 0, 0, 10, 0)).toBeCloseTo(5);
  });
  it('zero-length segment falls back to point distance', () => {
    expect(ptSegDist(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});

describe('road-clear cell selection', () => {
  // A vertical road at x=50; houses must be placed at least clearDist away from it.
  const road: [number, number, number, number] = [50, 0, 50, 100];
  const clearDist = 12;
  const clears = (cx: number, cy: number) => ptSegDist(cx, cy, ...road) >= clearDist;

  it('rejects a cell sitting on the road', () => {
    expect(clears(50, 50)).toBe(false);
    expect(clears(55, 50)).toBe(false);
  });
  it('accepts a cell well clear of the road', () => {
    expect(clears(70, 50)).toBe(true);
    expect(clears(30, 50)).toBe(true);
  });
  it('spiral finds the nearest clear cell beside the road', () => {
    // Simulate the grid spiral from an ideal cell that lands on the road.
    const gridSz = 13;
    const gX0 = Math.round(50 / gridSz), gY0 = Math.round(50 / gridSz);
    let picked: [number, number] | null = null;
    for (let ring = 1; ring <= 24 && !picked; ring++) {
      for (let dx = -ring; dx <= ring && !picked; dx++) {
        for (let dy = -ring; dy <= ring && !picked; dy++) {
          if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
            const cx = (gX0 + dx) * gridSz, cy = (gY0 + dy) * gridSz;
            if (clears(cx, cy)) picked = [cx, cy];
          }
        }
      }
    }
    expect(picked).not.toBeNull();
    expect(clears(picked![0], picked![1])).toBe(true);
  });
});
