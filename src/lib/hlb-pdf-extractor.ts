import { Coordinate } from '../types';

export interface GeoMetadata {
  page_w: number;
  page_h: number;
  vp_bbox: [number, number, number, number]; // [x0, y0, x1, y1] in PDF space
  lon_at_x0: number;
  lon_at_x1: number;
  lat_at_y0: number;
  lat_at_y1: number;
}

/**
 * Loads PDF.js dynamically from CDN.
 */
export async function loadPDFJS(): Promise<any> {
  if ((window as any).pdfjsLib) return (window as any).pdfjsLib;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      const pdfjsLib = (window as any).pdfjsLib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(pdfjsLib);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

/**
 * Loads Tesseract.js dynamically from a public CDN.
 */
async function loadTesseract(): Promise<any> {
  if ((window as any).Tesseract) return (window as any).Tesseract;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/tesseract.js@5.0.3/dist/tesseract.min.js';
    script.onload = () => resolve((window as any).Tesseract);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export interface ExtractionSuccess {
  success: true;
  boundaryPins: Coordinate[];
  center: Coordinate;
}

export interface ExtractionOcrFailed {
  success: false;
  cropCanvasDataUrl: string;
  meta: GeoMetadata;
  cropW: number;
  cropH: number;
  // Base64 or simple representation of the boundary mask so we don't pass raw heavy arrays
  maskWidth: number;
  maskHeight: number;
  maskBase64: string; // Packed binary string or serialized array
}

/**
 * Packs binary mask (0/255) into a compact base64 string for transfer/saving.
 */
export function packMask(mask: Uint8Array): string {
  // Simple run-length or binary string
  const binaryString = Array.from(mask).map(b => (b === 255 ? '1' : '0')).join('');
  return btoa(binaryString);
}

/**
 * Unpacks binary mask back to Uint8Array.
 */
export function unpackMask(packed: string): Uint8Array {
  const binaryString = atob(packed);
  const mask = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    mask[i] = binaryString[i] === '1' ? 255 : 0;
  }
  return mask;
}

/**
 * Orchestrates the full client-side GeoPDF extraction pipeline.
 */
export async function extractHLBBoundaryFromPDF(
  pdfBytes: ArrayBuffer,
  hlbNumber: string,
  progressCallback?: (status: string) => void
): Promise<ExtractionSuccess | ExtractionOcrFailed> {
  progressCallback?.('Loading PDF.js renderer...');
  const pdfjsLib = await loadPDFJS();
  
  progressCallback?.('Parsing PDF page data...');
  const pdfBytesCopy = pdfBytes.slice(0);
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytesCopy) });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  
  const pageW = page.view[2] - page.view[0];
  const pageH = page.view[3] - page.view[1];
  
  progressCallback?.('Reading GeoPDF georeference metadata...');
  const meta = parseGeoPDFMetadata(pdfBytes, pageW, pageH);
  if (!meta) {
    throw new Error('This PDF is not a georeferenced GeoPDF. It is missing the standard GIS coordinate headers.');
  }
  
  progressCallback?.('Rendering satellite basemap...');
  const scale = 1.2; // Render at 1.2x scale (perfect balance of speed, memory, and OCR readability)
  const viewport = page.getViewport({ scale });
  
  const pageCanvas = document.createElement('canvas');
  pageCanvas.width = viewport.width;
  pageCanvas.height = viewport.height;
  const pageCtx = pageCanvas.getContext('2d')!;
  
  await page.render({ canvasContext: pageCtx, viewport }).promise;
  
  // Crop to map viewport
  const img_w = pageCanvas.width;
  const img_h = pageCanvas.height;
  const [x0, y0, x1, y1] = meta.vp_bbox;
  
  const col0 = Math.floor((x0 / pageW) * img_w);
  const col1 = Math.ceil((x1 / pageW) * img_w);
  const row0 = Math.floor(((pageH - y1) / pageH) * img_h);
  const row1 = Math.ceil(((pageH - y0) / pageH) * img_h);
  
  const cropW = col1 - col0;
  const cropH = row1 - row0;
  
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d')!;
  cropCtx.drawImage(pageCanvas, col0, row0, cropW, cropH, 0, 0, cropW, cropH);
  
  progressCallback?.('Processing map boundaries & textures...');
  const imgData = cropCtx.getImageData(0, 0, cropW, cropH);
  const rawPixels = imgData.data;
  
  // Threshold and Morphological closing
  const threshMask = thresholdBrightPixels(rawPixels, cropW, cropH);
  const dilated = dilate(threshMask, cropW, cropH, 2);
  const closedMask = erode(dilated, cropW, cropH, 2);
  
  progressCallback?.('Searching for HLB block label...');
  const seed = await locateHLBSeedPixel(cropCanvas, hlbNumber);
  
  if (!seed) {
    progressCallback?.('OCR could not find the label. Asking user for manual assistance...');
    return {
      success: false,
      cropCanvasDataUrl: cropCanvas.toDataURL('image/png'),
      meta,
      cropW,
      cropH,
      maskWidth: cropW,
      maskHeight: cropH,
      maskBase64: packMask(closedMask)
    };
  }
  
  progressCallback?.('Tracing boundary contour...');
  const boundaryPins = runTracePipeline(closedMask, cropW, cropH, seed.x, seed.y, meta);
  
  // Calculate centroid center
  const sumLat = boundaryPins.reduce((acc, curr) => acc + curr.lat, 0);
  const sumLng = boundaryPins.reduce((acc, curr) => acc + curr.lng, 0);
  const center = { lat: sumLat / boundaryPins.length, lng: sumLng / boundaryPins.length };
  
  return {
    success: true,
    boundaryPins,
    center
  };
}

/**
 * Traces the WGS84 contour from a closed mask and a seed pixel coordinate.
 */
export function runTracePipeline(
  closedMask: Uint8Array,
  cropW: number,
  cropH: number,
  seedX: number,
  seedY: number,
  meta: GeoMetadata
): Coordinate[] {
  const filled = floodFill(closedMask, cropW, cropH, seedX, seedY);
  const contour = traceContour(filled, cropW, cropH);
  if (contour.length === 0) {
    throw new Error('Flood fill did not produce a closed boundary. Check if the block is fully enclosed on the map.');
  }
  
  const simplified = simplifyRDP(contour, 1.5); // tolerance of 1.5 pixels
  
  const boundaryPins: Coordinate[] = simplified.map(([col, row]) => 
    pixelToLonLat(col, row, meta, cropW, cropH)
  );
  
  // Close the polygon ring
  if (boundaryPins.length > 0) {
    boundaryPins.push({ ...boundaryPins[0] });
  }
  
  return boundaryPins;
}


/**
 * Step 1: Scan PDF raw byte stream to extract GeoPDF /VP -> /Measure -> /GEO metadata tags.
 */
export function parseGeoPDFMetadata(pdfBytes: ArrayBuffer, pageW: number, pageH: number): GeoMetadata | null {
  const text = new TextDecoder('ascii').decode(new Uint8Array(pdfBytes));

  const bboxMatch = text.match(/\/BBox\s*\[\s*(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s+(-?\d+\.?\d*)\s*\]/);
  const gptsMatch = text.match(/\/GPTS\s*\[\s*([^\]]+)\s*\]/);
  const lptsMatch = text.match(/\/LPTS\s*\[\s*([^\]]+)\s*\]/);

  if (!bboxMatch || !gptsMatch || !lptsMatch) {
    console.warn('PDF is not a georeferenced GeoPDF (missing /BBox, /GPTS, or /LPTS in dictionary).');
    return null;
  }

  const vp_bbox: [number, number, number, number] = [
    parseFloat(bboxMatch[1]),
    parseFloat(bboxMatch[2]),
    parseFloat(bboxMatch[3]),
    parseFloat(bboxMatch[4])
  ];

  const gpts = gptsMatch[1].trim().split(/\s+/).map(parseFloat);
  const lpts = lptsMatch[1].trim().split(/\s+/).map(parseFloat);

  if (gpts.length === 0 || lpts.length === 0 || gpts.some(isNaN) || lpts.some(isNaN)) {
    return null;
  }

  // Pair up normalized viewport corners LPTS[2i:2i+2] with real lat/lon GPTS[2i:2i+2]
  const corners: { lx: number; ly: number; lat: number; lon: number }[] = [];
  for (let i = 0; i < lpts.length; i += 2) {
    const lx = lpts[i];
    const ly = lpts[i + 1];
    const lat = gpts[i];
    const lon = gpts[i + 1];
    corners.push({ lx, ly, lat, lon });
  }

  // Calculate WGS84 boundaries on left/right and bottom/top
  const x0Corners = corners.filter(c => c.lx < 0.5);
  const x1Corners = corners.filter(c => c.lx >= 0.5);
  const y0Corners = corners.filter(c => c.ly < 0.5);
  const y1Corners = corners.filter(c => c.ly >= 0.5);

  const lon_at_x0 = x0Corners.reduce((sum, c) => sum + c.lon, 0) / x0Corners.length;
  const lon_at_x1 = x1Corners.reduce((sum, c) => sum + c.lon, 0) / x1Corners.length;
  const lat_at_y0 = y0Corners.reduce((sum, c) => sum + c.lat, 0) / y0Corners.length;
  const lat_at_y1 = y1Corners.reduce((sum, c) => sum + c.lat, 0) / y1Corners.length;

  return {
    page_w: pageW,
    page_h: pageH,
    vp_bbox,
    lon_at_x0,
    lon_at_x1,
    lat_at_y0,
    lat_at_y1
  };
}

/**
 * Step 3: Threshold bright white pixels (boundary line candidates)
 */
export function thresholdBrightPixels(pixels: Uint8ClampedArray, w: number, h: number, thresh = 205): Uint8Array {
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const idx = i / 4;
    bright[idx] = (r > thresh && g > thresh && b > thresh) ? 255 : 0;
  }
  return bright;
}

/**
 * Morphological dilation: expands white pixels to bridge anti-aliased/dashed gaps.
 */
export function dilate(src: Uint8Array, w: number, h: number, k = 2): Uint8Array {
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      if (src[rowOffset + x] === 255) {
        for (let ky = -k; ky <= k; ky++) {
          const ny = y + ky;
          if (ny >= 0 && ny < h) {
            const nRowOffset = ny * w;
            for (let kx = -k; kx <= k; kx++) {
              const nx = x + kx;
              if (nx >= 0 && nx < w) {
                dst[nRowOffset + nx] = 255;
              }
            }
          }
        }
      }
    }
  }
  return dst;
}

/**
 * Morphological erosion: shrinks white pixels back to clean borders.
 */
export function erode(src: Uint8Array, w: number, h: number, k = 2): Uint8Array {
  const dst = new Uint8Array(w * h);
  dst.fill(255); // Initialize all as active walls
  for (let y = 0; y < h; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      // Out-of-bounds padding is treated as 0, so any pixel within distance k of the border becomes 0
      if (x < k || x >= w - k || y < k || y >= h - k) {
        dst[rowOffset + x] = 0;
        continue;
      }

      if (src[rowOffset + x] === 0) {
        for (let ky = -k; ky <= k; ky++) {
          const ny = y + ky;
          if (ny >= 0 && ny < h) {
            const nRowOffset = ny * w;
            for (let kx = -k; kx <= k; kx++) {
              const nx = x + kx;
              if (nx >= 0 && nx < w) {
                dst[nRowOffset + nx] = 0;
              }
            }
          }
        }
      }
    }
  }
  return dst;
}

/**
 * Step 4: Runs Tesseract OCR on a thresholded text mask canvas to locate the seed label.
 */
export async function locateHLBSeedPixel(
  cropCanvas: HTMLCanvasElement,
  hlbNumber: string
): Promise<{ x: number; y: number } | null> {
  try {
    const Tesseract = await loadTesseract();
    const result = await Tesseract.recognize(cropCanvas, 'eng');
    const words = result.data.words || [];

    // Look for target HLB digits block
    const cleanHlb = hlbNumber.trim().replace(/^0+/, ''); // strip leading zeros for flexible matching
    for (const w of words) {
      const cleanWord = w.text.trim().replace(/^0+/, '');
      if (cleanWord.includes(cleanHlb)) {
        const { x0, y0, x1, y1 } = w.bbox;
        return {
          x: Math.round((x0 + x1) / 2),
          y: Math.round((y0 + y1) / 2)
        };
      }
    }
  } catch (err) {
    console.error('Failed to run local OCR seed search:', err);
  }
  return null;
}

/**
 * Step 5: Flood fill inside boundary walls starting from the seed pixel.
 */
export function floodFill(mask: Uint8Array, w: number, h: number, seedX: number, seedY: number): Uint8Array {
  const filled = new Uint8Array(w * h);
  const visited = new Uint8Array(w * h);
  const queue: [number, number][] = [[seedX, seedY]];
  visited[seedY * w + seedX] = 1;

  let head = 0;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    filled[cy * w + cx] = 255;

    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const idx = ny * w + nx;
        // mask[idx] === 0 represents free space/black; visited[idx] === 0 is unvisited
        if (mask[idx] === 0 && visited[idx] === 0) {
          visited[idx] = 1;
          queue.push([nx, ny]);
        }
      }
    }
  }
  return filled;
}

/**
 * Step 6: Traces the outer border contour of the flood-filled region using Moore-Neighborhood.
 */
export function traceContour(filled: Uint8Array, w: number, h: number): [number, number][] {
  let startX = -1, startY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (filled[y * w + x] === 255) {
        startX = x;
        startY = y;
        break;
      }
    }
    if (startX !== -1) break;
  }
  if (startX === -1) return [];

  const contour: [number, number][] = [];
  let cx = startX, cy = startY;

  const dirs = [
    [0, -1], [1, -1], [1, 0], [1, 1],
    [0, 1], [-1, 1], [-1, 0], [-1, -1]
  ];

  let dirIdx = 7;
  const maxLoops = w * h;
  let loopCount = 0;

  do {
    contour.push([cx, cy]);
    let found = false;
    const backDir = (dirIdx + 5) % 8; // scan starting from opposite direction + 1 clockwise

    for (let i = 0; i < 8; i++) {
      const nextDir = (backDir + i) % 8;
      const nx = cx + dirs[nextDir][0];
      const ny = cy + dirs[nextDir][1];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
        if (filled[ny * w + nx] === 255) {
          cx = nx;
          cy = ny;
          dirIdx = nextDir;
          found = true;
          break;
        }
      }
    }
    if (!found) break;
    loopCount++;
  } while ((cx !== startX || cy !== startY) && loopCount < maxLoops);

  return contour;
}

/**
 * Ramer-Douglas-Peucker polygon contour simplifier.
 */
function getSqSegDist(p: [number, number], p1: [number, number], p2: [number, number]): number {
  let x = p1[0], y = p1[1], dx = p2[0] - x, dy = p2[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      x = p2[0]; y = p2[1];
    } else if (t > 0) {
      x += dx * t; y += dy * t;
    }
  }
  dx = p[0] - x;
  dy = p[1] - y;
  return dx * dx + dy * dy;
}

function simplifyDPStep(
  points: [number, number][],
  first: number,
  last: number,
  sqTolerance: number,
  simplified: [number, number][]
) {
  let maxSqDist = sqTolerance;
  let index = -1;
  for (let i = first + 1; i < last; i++) {
    const sqDist = getSqSegDist(points[i], points[first], points[last]);
    if (sqDist > maxSqDist) {
      index = i;
      maxSqDist = sqDist;
    }
  }
  if (index > -1) {
    if (index - first > 1) simplifyDPStep(points, first, index, sqTolerance, simplified);
    simplified.push(points[index]);
    if (last - index > 1) simplifyDPStep(points, index, last, sqTolerance, simplified);
  }
}

export function simplifyRDP(points: [number, number][], tolerance: number): [number, number][] {
  if (points.length <= 2) return points;
  const sqTolerance = tolerance * tolerance;
  const last = points.length - 1;
  const simplified = [points[0]];
  simplifyDPStep(points, 0, last, sqTolerance, simplified);
  simplified.push(points[last]);
  return simplified;
}

/**
 * Transform pixel (col, row) to WGS84 (lon, lat) WGS84 coordinates.
 */
export function pixelToLonLat(col: number, row: number, meta: GeoMetadata, cropW: number, cropH: number): Coordinate {
  const Lx = col / cropW;
  const Ly = 1 - row / cropH; // row grows down, latitude grows up
  const lat = meta.lat_at_y0 + Ly * (meta.lat_at_y1 - meta.lat_at_y0);
  const lng = meta.lon_at_x0 + Lx * (meta.lon_at_x1 - meta.lon_at_x0);
  return { lat, lng };
}
