import { describe, it, expect } from 'vitest';
import {
  parseGeoPDFMetadata,
  thresholdBrightPixels,
  dilate,
  erode,
  simplifyRDP,
  pixelToLonLat,
  packMask,
  unpackMask,
  GeoMetadata
} from '../hlb-pdf-extractor';

describe('hlb-pdf-extractor GeoPDF parsing', () => {
  it('parses georeference tags from mock PDF bytes', () => {
    const mockPDFString = `
      /VP [
        <<
          /BBox [10 10 590 830]
          /Measure <<
            /Subtype /GEO
            /GPTS [26.0 80.0 26.0 80.1 26.1 80.1 26.1 80.0]
            /LPTS [0.0 0.0 1.0 0.0 1.0 1.0 0.0 1.0]
          >>
        >>
      ]
    `;
    const bytes = new TextEncoder().encode(mockPDFString).buffer;
    const meta = parseGeoPDFMetadata(bytes, 600, 840);

    expect(meta).not.toBeNull();
    if (meta) {
      expect(meta.vp_bbox).toEqual([10, 10, 590, 830]);
      expect(meta.lon_at_x0).toBeCloseTo(80.0);
      expect(meta.lon_at_x1).toBeCloseTo(80.1);
      expect(meta.lat_at_y0).toBeCloseTo(26.0);
      expect(meta.lat_at_y1).toBeCloseTo(26.1);
    }
  });

  it('returns null if tags are missing', () => {
    const bytes = new TextEncoder().encode('Dummy PDF content').buffer;
    expect(parseGeoPDFMetadata(bytes, 600, 840)).toBeNull();
  });
});

describe('hlb-pdf-extractor image processing helpers', () => {
  it('thresholds bright white pixels correctly', () => {
    // 2x2 image data (RGBA)
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255, // white
      100, 100, 100, 255, // dark gray
      210, 215, 220, 255, // light gray (bright)
      0, 0, 0, 255        // black
    ]);
    const mask = thresholdBrightPixels(pixels, 2, 2, 205);
    expect(mask).toEqual(new Uint8Array([255, 0, 255, 0]));
  });

  it('packs and unpacks binary masks correctly', () => {
    const originalMask = new Uint8Array([255, 0, 255, 255, 0]);
    const packed = packMask(originalMask);
    const unpacked = unpackMask(packed);
    expect(unpacked).toEqual(originalMask);
  });

  it('performs dilation and erosion morphology correctly', () => {
    const grid = new Uint8Array([
      0,   0,   0,
      0, 255,   0,
      0,   0,   0
    ]);
    // Dilate with kernel radius 1 -> fills the grid
    const dilated = dilate(grid, 3, 3, 1);
    expect(dilated[0]).toBe(255);
    expect(dilated[4]).toBe(255);

    // Erode with kernel radius 1 -> central pixel stays, neighbors shrink
    const eroded = erode(dilated, 3, 3, 1);
    expect(eroded[0]).toBe(0);
    expect(eroded[4]).toBe(255);
  });
});

describe('hlb-pdf-extractor polygon simplification & georeferencing', () => {
  it('simplifies lines using RDP algorithm', () => {
    // A straight line with a tiny deviation
    const line: [number, number][] = [
      [0, 0],
      [10, 0.1],
      [20, 0]
    ];
    const simplified = simplifyRDP(line, 0.5);
    expect(simplified).toEqual([[0, 0], [20, 0]]);
  });

  it('maps pixel coordinates to WGS84 correctly', () => {
    const meta: GeoMetadata = {
      page_w: 600,
      page_h: 800,
      vp_bbox: [0, 0, 600, 800],
      lon_at_x0: 80.0,
      lon_at_x1: 81.0,
      lat_at_y0: 26.0,
      lat_at_y1: 27.0
    };
    // Center point mapping
    const pt = pixelToLonLat(300, 400, meta, 600, 800);
    expect(pt.lat).toBeCloseTo(26.5);
    expect(pt.lng).toBeCloseTo(80.5);
  });
});
