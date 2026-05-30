import { describe, it, expect } from 'vitest';
import { pointInPolygon, polygonArea, isPolygonSelfIntersecting } from '../geo';
import type { Coordinate } from '../../types';

// A simple ~unit square near Kanpur (0.001 deg ≈ 111m)
const square: Coordinate[] = [
  { lat: 26.000, lng: 80.000 },
  { lat: 26.000, lng: 80.001 },
  { lat: 26.001, lng: 80.001 },
  { lat: 26.001, lng: 80.000 },
];

describe('pointInPolygon', () => {
  it('returns true for a point clearly inside', () => {
    expect(pointInPolygon({ lat: 26.0005, lng: 80.0005 }, square)).toBe(true);
  });

  it('returns false for a point clearly outside', () => {
    expect(pointInPolygon({ lat: 26.002, lng: 80.002 }, square)).toBe(false);
  });

  it('returns false for a point just outside an edge', () => {
    expect(pointInPolygon({ lat: 26.0005, lng: 80.0011 }, square)).toBe(false);
  });
});

describe('polygonArea', () => {
  it('returns 0 for fewer than 3 points', () => {
    expect(polygonArea([{ lat: 26, lng: 80 }, { lat: 26, lng: 80.001 }])).toBe(0);
  });

  it('computes a positive area for a valid polygon', () => {
    expect(polygonArea(square)).toBeGreaterThan(0);
  });

  it('gives roughly 111m x 111m ≈ 12300 m^2 for the test square', () => {
    // 0.001 deg lat ≈ 111.32m; lng scaled by cos(26°) ≈ 0.8988 -> ~100m
    const area = polygonArea(square);
    expect(area).toBeGreaterThan(9000);
    expect(area).toBeLessThan(13000);
  });

  it('is orientation-independent (absolute value)', () => {
    const reversed = [...square].reverse();
    expect(polygonArea(reversed)).toBeCloseTo(polygonArea(square), 5);
  });
});

describe('isPolygonSelfIntersecting', () => {
  it('returns false for a simple square', () => {
    expect(isPolygonSelfIntersecting(square)).toBe(false);
  });

  it('returns false for fewer than 4 points', () => {
    expect(isPolygonSelfIntersecting([{ lat: 26, lng: 80 }, { lat: 26, lng: 80.001 }, { lat: 26.001, lng: 80 }])).toBe(false);
  });

  it('detects a bow-tie / figure-8 polygon', () => {
    // Swapping the last two vertices of a square crosses the edges
    const bowtie: Coordinate[] = [
      { lat: 26.000, lng: 80.000 },
      { lat: 26.000, lng: 80.001 },
      { lat: 26.001, lng: 80.000 },
      { lat: 26.001, lng: 80.001 },
    ];
    expect(isPolygonSelfIntersecting(bowtie)).toBe(true);
  });
});
