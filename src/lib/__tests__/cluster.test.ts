import { describe, it, expect } from 'vitest';
import { clusterByProximity, gridBlockOffsets, centroidXY } from '../geo';

describe('clusterByProximity', () => {
  it('groups a tight cluster and leaves a far point as singleton', () => {
    // 5 tight points around (0,0) within radius, one far away at (100,100)
    const pts = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 0.5, y: 0.5 },
      { x: 100, y: 100 },
    ];
    const clusters = clusterByProximity(pts, 2, 5);
    // One cluster of the 5 tight points, plus the far point as a singleton
    const big = clusters.find(c => c.length >= 5);
    expect(big).toBeDefined();
    expect(big!.length).toBe(5);
    expect(clusters.some(c => c.length === 1 && c[0] === 5)).toBe(true);
  });

  it('emits small groups (below minSize) as singletons', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 0 }]; // only 2, minSize 5
    const clusters = clusterByProximity(pts, 2, 5);
    expect(clusters.length).toBe(2);
    expect(clusters.every(c => c.length === 1)).toBe(true);
  });

  it('does not link points beyond the radius', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const clusters = clusterByProximity(pts, 5, 1);
    expect(clusters.length).toBe(2);
  });
});

describe('gridBlockOffsets', () => {
  it('returns exactly count points', () => {
    expect(gridBlockOffsets(7, 0, 0, 10).length).toBe(7);
  });

  it('lays out a near-square grid centered on the anchor', () => {
    const pts = gridBlockOffsets(9, 0, 0, 10); // 3x3, cell 10 → spans -10..10
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    expect(Math.min(...xs)).toBeCloseTo(-10);
    expect(Math.max(...xs)).toBeCloseTo(10);
    expect(Math.min(...ys)).toBeCloseTo(-10);
    expect(Math.max(...ys)).toBeCloseTo(10);
    // centroid of a symmetric grid is the anchor
    const c = centroidXY(pts);
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(0);
  });

  it('first point is top-left, reads in row order', () => {
    const pts = gridBlockOffsets(4, 0, 0, 10); // 2x2
    expect(pts[0].x).toBeLessThan(pts[1].x); // left before right in row 0
    expect(pts[2].y).toBeGreaterThan(pts[0].y); // row 1 below row 0
  });

  it('handles count of 0 and 1', () => {
    expect(gridBlockOffsets(0, 5, 5, 10)).toEqual([]);
    const one = gridBlockOffsets(1, 5, 5, 10);
    expect(one.length).toBe(1);
    expect(one[0]).toEqual({ x: 5, y: 5 });
  });
});

describe('centroidXY', () => {
  it('averages coordinates', () => {
    expect(centroidXY([{ x: 0, y: 0 }, { x: 10, y: 20 }])).toEqual({ x: 5, y: 10 });
  });
  it('returns origin for empty input', () => {
    expect(centroidXY([])).toEqual({ x: 0, y: 0 });
  });
});
