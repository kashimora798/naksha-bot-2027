import { describe, it, expect } from 'vitest';
import { placeHousesInBlock } from '../placement-blocks';
import { pointInPolygon, distanceBetween } from '../geo';
import type { Block, Coordinate } from '../../types';

const B = (lat: number, lng: number): Coordinate => ({ lat, lng });

// ~110m x 110m square block near equator.
const square: Block = {
  id: '1', label: 'A', north: 0.001, south: 0, west: 0, east: 0.001,
  points: [B(0, 0), B(0.001, 0), B(0.001, 0.001), B(0, 0.001)],
};

describe('placeHousesInBlock', () => {
  for (const layout of ['grid', 'rows', 'serpentine'] as const) {
    it(`[${layout}] places exactly the requested count, all inside the polygon`, () => {
      const houses = placeHousesInBlock(square, { count: 16, type: 'pucca_house', layout });
      expect(houses.length).toBe(16);
      for (const h of houses) {
        expect(pointInPolygon({ lat: h.lat, lng: h.lng }, square.points!)).toBe(true);
      }
    });
  }

  it('positions are reasonably spread (no two houses coincide)', () => {
    const houses = placeHousesInBlock(square, { count: 12, type: 'pucca_house', layout: 'grid' });
    let minD = Infinity;
    for (let i = 0; i < houses.length; i++)
      for (let j = i + 1; j < houses.length; j++)
        minD = Math.min(minD, distanceBetween(houses[i], houses[j]));
    expect(minD).toBeGreaterThan(1); // metres
  });

  it('count of 1 returns a single point inside the block', () => {
    const houses = placeHousesInBlock(square, { count: 1, type: 'kutcha_house', layout: 'grid' });
    expect(houses.length).toBe(1);
    expect(pointInPolygon({ lat: houses[0].lat, lng: houses[0].lng }, square.points!)).toBe(true);
  });

  it('apartments carry a unit_count', () => {
    const houses = placeHousesInBlock(square, { count: 3, type: 'apartment', layout: 'grid', unitCount: 4 });
    expect(houses.every(h => h.unit_count === 4)).toBe(true);
  });

  it('never places a house inside an excluded field', () => {
    // A field covering the right half of the block.
    const field: Coordinate[] = [B(0, 0.0005), B(0.001, 0.0005), B(0.001, 0.001), B(0, 0.001)];
    const houses = placeHousesInBlock(square, { count: 20, type: 'pucca_house', layout: 'grid', exclusions: [field] });
    expect(houses.length).toBeGreaterThan(0);
    for (const h of houses) {
      expect(pointInPolygon({ lat: h.lat, lng: h.lng }, square.points!)).toBe(true);
      expect(pointInPolygon({ lat: h.lat, lng: h.lng }, field)).toBe(false); // all in the left half
    }
  });

  it('keeps houses a margin inside the block edge (dynamic spacing)', () => {
    // With few houses in a big block, none should sit right on the boundary line.
    const houses = placeHousesInBlock(square, { count: 4, type: 'pucca_house', layout: 'grid' });
    const edges = square.points!;
    for (const h of houses) {
      // crude: house must be strictly interior, not equal to any vertex
      expect(edges.some(v => v.lat === h.lat && v.lng === h.lng)).toBe(false);
    }
  });

  it('places houses across both legs of an L-shaped block', () => {
    // L-shape block: horizontal leg on bottom, vertical leg on left.
    // Vertical neck: lat [0.0003, 0.001], lng [0, 0.0003]
    // Horizontal leg: lat [0, 0.0003], lng [0.0003, 0.001]
    const lShape: Block = {
      id: 'lshape', label: 'L', north: 0.001, south: 0, west: 0, east: 0.001,
      points: [B(0, 0), B(0.001, 0), B(0.001, 0.0003), B(0.0003, 0.0003), B(0.0003, 0.001), B(0, 0.001)],
    };

    const houses = placeHousesInBlock(lShape, { count: 8, type: 'pucca_house', layout: 'grid' });
    expect(houses.length).toBe(8);

    // Verify all are inside the L-shape
    for (const h of houses) {
      expect(pointInPolygon({ lat: h.lat, lng: h.lng }, lShape.points!)).toBe(true);
    }

    // Verify some are in the vertical neck (lat > 0.0003)
    const inNeck = houses.filter(h => h.lat > 0.0003 && h.lng <= 0.0003);
    // Verify some are in the horizontal leg (lng > 0.0003)
    const inLeg = houses.filter(h => h.lng > 0.0003 && h.lat <= 0.0003);

    expect(inNeck.length).toBeGreaterThan(0);
    expect(inLeg.length).toBeGreaterThan(0);
  });
});
