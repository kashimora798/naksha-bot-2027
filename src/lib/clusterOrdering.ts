import type { Coordinate, PlacedSymbol, Block } from '../types';
import { clusterByProximity } from './geo';

export function distM(a: Coordinate, b: Coordinate): number {
  const mLat = 111320, mLng = 111320 * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const dx = (b.lng - a.lng) * mLng, dy = (b.lat - a.lat) * mLat;
  return Math.hypot(dx, dy);
}

export function medianNNDist(pts: PlacedSymbol[]): number {
  if (pts.length < 2) return 10;
  const ds = pts.map(p => Math.min(...pts.filter(q => q.id !== p.id).map(q => distM(p, q))));
  ds.sort((a, b) => a - b);
  return ds[Math.floor(ds.length / 2)] || 10;
}

export function nwseScore(lat: number, lng: number): number {
  return -lat + lng;
}

/**
 * Cheap regularity test: rows have low variance in nearest-neighbour distance;
 * organic clumps have high variance.
 */
export function looksLikeRows(pts: PlacedSymbol[]): boolean {
  if (pts.length < 4) return true;
  const nn = pts.map(p => Math.min(...pts.filter(q => q.id !== p.id).map(q => distM(p, q))));
  const mean = nn.reduce((a, b) => a + b, 0) / nn.length;
  if (mean === 0) return true;
  const variance = nn.reduce((a, b) => a + (b - mean) ** 2, 0) / nn.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < 0.35;
}

export function nearestNeighborPath(pts: PlacedSymbol[], start: PlacedSymbol): PlacedSymbol[] {
  const remaining = new Set(pts.filter(p => p.id !== start.id));
  const path = [start];
  let current = start;
  while (remaining.size > 0) {
    let best: PlacedSymbol | null = null;
    let bestD = Infinity;
    for (const p of remaining) {
      const d = distM(current, p);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) break;
    path.push(best);
    remaining.delete(best);
    current = best;
  }
  return path;
}

/**
 * Classic open-path 2-opt. Provably removes crossing edge pairs.
 * Any two arrows that cross can be uncrossed by reversing the segment between them.
 */
export function twoOptOpenPath(path: PlacedSymbol[], maxPasses = 40): PlacedSymbol[] {
  const n = path.length;
  if (n <= 3) return path;
  const result = [...path];
  let improved = true;
  let pass = 0;
  while (improved && pass++ < maxPasses) {
    improved = false;
    for (let i = 0; i < n - 2; i++) {
      const a = result[i], b = result[i + 1];
      for (let j = i + 2; j < n - 1; j++) {
        const c = result[j], d = result[j + 1];
        const before = distM(a, b) + distM(c, d);
        const after = distM(a, c) + distM(b, d);
        if (after + 0.01 < before) {
          let lo = i + 1, hi = j;
          while (lo < hi) {
            [result[lo], result[hi]] = [result[hi], result[lo]];
            lo++;
            hi--;
          }
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }
  return result;
}

/**
 * Cluster-aware ordering for houses in a block.
 * Groups houses into spatial clusters, orders clusters NW->SE,
 * and within clusters uses row-serpentine for regular rows or 2-opt NN walk for organic clusters.
 */
export function clusterAwareOrder(
  houses: PlacedSymbol[],
  serpentineInBlockRaw: (h: PlacedSymbol[], b: Block) => Coordinate[],
  blk: Block
): Coordinate[] {
  if (houses.length <= 3) return houses.map(h => ({ lat: h.lat, lng: h.lng }));

  const radius = medianNNDist(houses) * 1.4;
  const idxClusters = clusterByProximity(
    houses.map(h => ({ x: h.lng * 111320, y: h.lat * 111320 })),
    radius,
    3
  );
  const clusters = idxClusters.map(idxs => idxs.map(i => houses[i]));

  clusters.sort((A, B) => {
    const ca = { lat: A.reduce((s, h) => s + h.lat, 0) / A.length, lng: A.reduce((s, h) => s + h.lng, 0) / A.length };
    const cb = { lat: B.reduce((s, h) => s + h.lat, 0) / B.length, lng: B.reduce((s, h) => s + h.lng, 0) / B.length };
    return nwseScore(ca.lat, ca.lng) - nwseScore(cb.lat, cb.lng);
  });

  const out: Coordinate[] = [];
  for (const cluster of clusters) {
    if (cluster.length <= 2 || looksLikeRows(cluster)) {
      out.push(...serpentineInBlockRaw(cluster, blk));
    } else {
      const start = cluster.reduce((a, b) => (nwseScore(a.lat, a.lng) < nwseScore(b.lat, b.lng) ? a : b));
      const path = twoOptOpenPath(nearestNeighborPath(cluster, start));
      out.push(...path.map(h => ({ lat: h.lat, lng: h.lng })));
    }
  }
  return out;
}
