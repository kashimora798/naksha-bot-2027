import { describe, it, expect } from 'vitest';
import { generateSerpentinePath, segIntersect } from '../geo';
import type { PlacedSymbol, Block } from '../../types';

function mk(id: string, lat: number, lng: number): PlacedSymbol {
  return {
    id,
    symbol_type: 'pucca_house',
    lat,
    lng,
    number: null,
    placed_at: '2026-01-01T00:00:00Z',
  };
}

export function countCrossings(path: { lat: number; lng: number }[]): number {
  let n = 0;
  for (let i = 0; i < path.length - 1; i++) {
    for (let j = i + 2; j < path.length - 1; j++) {
      if (segIntersect(path[i], path[i + 1], path[j], path[j + 1])) {
        n++;
      }
    }
  }
  return n;
}

describe('serpentine path self-crossing minimization', () => {
  it('handles a dense organic cluster (courtyard-style) without crossing arrows', () => {
    // Synthetic cluster with 2 dense blobs at odd angles inside 1 block
    // Blob 1 (NW cluster, organic U-shape / courtyard)
    const blob1: PlacedSymbol[] = [
      mk('b1_1', 26.4510, 80.3310),
      mk('b1_2', 26.4512, 80.3312),
      mk('b1_3', 26.4509, 80.3314),
      mk('b1_4', 26.4513, 80.3311),
      mk('b1_5', 26.4511, 80.3315),
      mk('b1_6', 26.4508, 80.3313),
      mk('b1_7', 26.4514, 80.3313),
      mk('b1_8', 26.4510, 80.3316),
    ];

    // Blob 2 (SE cluster, offset courtyard)
    const blob2: PlacedSymbol[] = [
      mk('b2_1', 26.4490, 80.3340),
      mk('b2_2', 26.4492, 80.3342),
      mk('b2_3', 26.4489, 80.3344),
      mk('b2_4', 26.4493, 80.3341),
      mk('b2_5', 26.4491, 80.3345),
      mk('b2_6', 26.4488, 80.3343),
      mk('b2_7', 26.4494, 80.3343),
      mk('b2_8', 26.4490, 80.3346),
    ];

    const symbols = [...blob1, ...blob2];
    const block: Block = {
      id: 'blk1',
      label: '1',
      south: 26.4480,
      north: 26.4520,
      west: 80.3300,
      east: 80.3350,
    };

    const path = generateSerpentinePath(symbols, [block]);
    const crossings = countCrossings(path);
    expect(crossings).toBe(0);
  });
});
