import type { Coordinate } from '../types';
import { getBbox } from './geo';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Change this to your API server address
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://pixelster.vercel.app';

const SURVEY_MAP_PROMPT = `Convert this satellite aerial image into a clean official survey map in the style of Survey of India topographic sheets. Use cream white paper background. Roads and lanes must be the dominant visual element — draw main roads as bold double black lines 3px wide with white fill between them, small lanes as single solid black lines 1.5px, footpaths as dashed black lines 1px. Building clusters must be drawn as simple solid black outlined rectangles grouped together, no individual roof details, no irregular shapes, just clean rectangular blocks. Agricultural fields and open land must have only a thin 1px outline with zero fill or hatching inside — fields must appear as empty white outlined polygons, not textured. Trees and vegetation must be represented only as small simple circular outlines 0.5px, no shading, no scribble, placed at the edge of settlement areas only. Water bodies must be light blue filled simple shapes. The entire image must have high contrast black lines on white/cream background. No artistic shading, no pencil texture, no crosshatching anywhere except optionally very light parallel lines inside agricultural fields only. The visual hierarchy must be: roads most prominent, then settlement block outlines, then field boundaries, then vegetation last. This is a government census layout map not an artistic illustration.`;

// ═══════════════════════════════════════════════════════════
// SATELLITE TILE CAPTURE — High quality rectangular capture
// ═══════════════════════════════════════════════════════════

function lng2tile(lng: number, z: number): number {
  return Math.floor((lng + 180) / 360 * Math.pow(2, z));
}
function lat2tile(lat: number, z: number): number {
  return Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, z));
}

/**
 * Capture high-quality satellite tiles covering the boundary area.
 * Returns a canvas with the satellite imagery.
 */
async function captureSatelliteTiles(
  boundary: Coordinate[],
  onProgress?: (msg: string) => void
): Promise<{ canvas: HTMLCanvasElement; tileBounds: { north: number; south: number; east: number; west: number } }> {
  const bb = getBbox(boundary);
  // Add 10% padding for context
  const padLat = (bb.north - bb.south) * 0.1;
  const padLng = (bb.east - bb.west) * 0.1;
  const south = bb.south - padLat;
  const north = bb.north + padLat;
  const west = bb.west - padLng;
  const east = bb.east + padLng;

  // Use zoom 18 for high quality, fallback to 17 for large areas
  const latDiff = north - south;
  const lngDiff = east - west;
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 16 : latDiff > 0.004 || lngDiff > 0.006 ? 17 : 18;

  const TILE = 256;
  const tx1 = lng2tile(west, zoom);
  const tx2 = lng2tile(east, zoom);
  const ty1 = lat2tile(north, zoom);
  const ty2 = lat2tile(south, zoom);

  const canvas = document.createElement('canvas');
  canvas.width = (tx2 - tx1 + 1) * TILE;
  canvas.height = (ty2 - ty1 + 1) * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const totalTiles = (tx2 - tx1 + 1) * (ty2 - ty1 + 1);
  if (totalTiles > 64) {
    onProgress?.('Area too large, reducing quality...');
    // Retry with lower zoom
    return captureSatelliteTilesAtZoom(south, west, north, east, Math.max(15, zoom - 1), onProgress);
  }

  let loaded = 0;
  for (let x = tx1; x <= tx2; x++) {
    for (let y = ty1; y <= ty2; y++) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
        await new Promise<void>(r => {
          img.onload = () => r();
          img.onerror = () => r();
        });
        ctx.drawImage(img, (x - tx1) * TILE, (y - ty1) * TILE, TILE, TILE);
        loaded++;
        onProgress?.(`Loading tiles: ${loaded}/${totalTiles}`);
      } catch { /* continue */ }
    }
  }

  return { canvas, tileBounds: getTileBounds(zoom, tx1, tx2, ty1, ty2) };
}

async function captureSatelliteTilesAtZoom(
  south: number, west: number, north: number, east: number,
  zoom: number, onProgress?: (msg: string) => void
): Promise<{ canvas: HTMLCanvasElement; tileBounds: { north: number; south: number; east: number; west: number } }> {
  const TILE = 256;
  const tx1 = lng2tile(west, zoom);
  const tx2 = lng2tile(east, zoom);
  const ty1 = lat2tile(north, zoom);
  const ty2 = lat2tile(south, zoom);

  const canvas = document.createElement('canvas');
  canvas.width = (tx2 - tx1 + 1) * TILE;
  canvas.height = (ty2 - ty1 + 1) * TILE;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e0e0e0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let loaded = 0;
  const total = (tx2 - tx1 + 1) * (ty2 - ty1 + 1);
  for (let x = tx1; x <= tx2; x++) {
    for (let y = ty1; y <= ty2; y++) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}`;
        await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
        ctx.drawImage(img, (x - tx1) * TILE, (y - ty1) * TILE, TILE, TILE);
        loaded++;
        onProgress?.(`Loading tiles: ${loaded}/${total}`);
      } catch { /* continue */ }
    }
  }
  return { canvas, tileBounds: getTileBounds(zoom, tx1, tx2, ty1, ty2) };
}

// ═══════════════════════════════════════════════════════════
// POLYGON-CLIPPED SATELLITE IMAGE
// Try to clip to boundary polygon for cleaner AI input
// ═══════════════════════════════════════════════════════════

function getTileBounds(zoom: number, tx1: number, tx2: number, ty1: number, ty2: number) {
  function lngFromTile(x: number) { return x / Math.pow(2, zoom) * 360 - 180; }
  function latFromTile(y: number) {
    const n = Math.PI - 2 * Math.PI * y / Math.pow(2, zoom);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }
  return {
    west: lngFromTile(tx1),
    east: lngFromTile(tx2 + 1),
    north: latFromTile(ty1),
    south: latFromTile(ty2 + 1),
  };
}

/**
 * Capture satellite image and clip to boundary polygon.
 * Areas outside the polygon are filled with white.
 */
export async function captureSatelliteForBoundary(
  boundary: Coordinate[],
  onProgress?: (msg: string) => void
): Promise<{ canvas: HTMLCanvasElement; base64: string; tileBounds: {north:number, south:number, east:number, west:number} }> {
  onProgress?.('Capturing satellite tiles...');
  const { canvas: satCanvas } = await captureSatelliteTiles(boundary, onProgress);

  // Now clip to polygon
  const bb = getBbox(boundary);
  const padLat = (bb.north - bb.south) * 0.1;
  const padLng = (bb.east - bb.west) * 0.1;
  const south = bb.south - padLat;
  const north = bb.north + padLat;
  const west = bb.west - padLng;
  const east = bb.east + padLng;

  const latDiff = north - south;
  const lngDiff = east - west;
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 16 : latDiff > 0.004 || lngDiff > 0.006 ? 17 : 18;

  const tx1 = lng2tile(west, zoom);
  const tx2 = lng2tile(east, zoom);
  const ty1 = lat2tile(north, zoom);
  const ty2 = lat2tile(south, zoom);

  const tileBounds = getTileBounds(zoom, tx1, tx2, ty1, ty2);
  const cw = satCanvas.width, ch = satCanvas.height;

  // Project boundary polygon to pixel coordinates on the canvas
  const projX = (lng: number) => ((lng - tileBounds.west) / (tileBounds.east - tileBounds.west)) * cw;
  const projY = (lat: number) => ((tileBounds.north - lat) / (tileBounds.north - tileBounds.south)) * ch;

  // Create clipped canvas
  const clipped = document.createElement('canvas');
  clipped.width = cw;
  clipped.height = ch;
  const ctx = clipped.getContext('2d')!;

  // Fill white background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cw, ch);

  // Clip to polygon and draw satellite
  ctx.save();
  ctx.beginPath();
  boundary.forEach((p, i) => {
    const x = projX(p.lng), y = projY(p.lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(satCanvas, 0, 0);
  ctx.restore();

  // Draw thin red boundary outline for context
  ctx.strokeStyle = 'rgba(200,0,0,0.4)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  boundary.forEach((p, i) => {
    const x = projX(p.lng), y = projY(p.lat);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  onProgress?.('Processing image...');

  // Convert to base64, ensure under 3.5MB
  let quality = 0.92;
  let base64 = clipped.toDataURL('image/jpeg', quality);

  // Strip the data:image/jpeg;base64, prefix for size check
  let rawB64 = base64.split(',')[1];
  let sizeBytes = rawB64.length * 0.75;

  while (sizeBytes > 3.4 * 1024 * 1024 && quality > 0.3) {
    quality -= 0.1;
    // Also downscale if still too big
    if (quality < 0.5) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.round(cw * 0.7);
      smaller.height = Math.round(ch * 0.7);
      const sctx = smaller.getContext('2d')!;
      sctx.drawImage(clipped, 0, 0, smaller.width, smaller.height);
      base64 = smaller.toDataURL('image/jpeg', quality);
    } else {
      base64 = clipped.toDataURL('image/jpeg', quality);
    }
    rawB64 = base64.split(',')[1];
    sizeBytes = rawB64.length * 0.75;
  }

  return { canvas: clipped, base64: rawB64, tileBounds };
}

/**
 * Capture FULL rectangular satellite (not clipped) for overlay use
 */
export async function captureFullSatellite(
  boundary: Coordinate[],
  onProgress?: (msg: string) => void
): Promise<{ canvas: HTMLCanvasElement; tileBounds: { north: number; south: number; east: number; west: number } }> {
  return captureSatelliteTiles(boundary, onProgress);
}

// ═══════════════════════════════════════════════════════════
// AI SURVEY MAP GENERATION — Call image-to-image API
// ═══════════════════════════════════════════════════════════

export interface SurveyMapResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

/**
 * Call the /api/pti endpoint to generate an AI survey map
 * from a satellite image.
 */
export async function generateSurveyMap(
  satelliteBase64: string,
  ratio: string = '1:1',
  onProgress?: (msg: string) => void
): Promise<SurveyMapResult> {
  onProgress?.('Sending to AI...');

  try {
    const response = await fetch(`${API_BASE}/api/pti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: SURVEY_MAP_PROMPT,
        ratio,
        imageBase64: satelliteBase64,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 413) return { success: false, error: 'Image too large (max 3.5MB)' };
      if (status === 502) return { success: false, error: 'AI generation error — try again' };
      if (status === 504) return { success: false, error: 'AI generation timed out — try again' };
      return { success: false, error: `API error (${status})` };
    }

    const data = await response.json();
    if (data.success && data.imageUrl) {
      onProgress?.('AI map generated!');
      return { success: true, imageUrl: data.imageUrl };
    }
    return { success: false, error: 'Unexpected API response' };
  } catch (e) {
    return { success: false, error: `Connection failed — is the API server running at ${API_BASE}?` };
  }
}

/**
 * Download an image URL and convert to base64 for PDF embedding
 */
export async function fetchImageAsBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/jpeg', 0.92));
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

/**
 * Full pipeline: capture satellite → send to AI → return generated map URL
 */
export async function generateSurveyMapFromBoundary(
  mapData: any, // using any to avoid circular type dependency if MapData isn't imported, but we can import MapData
  orientation: 'landscape' | 'portrait',
  onProgress?: (msg: string) => void
): Promise<SurveyMapResult> {
  const boundary = mapData.boundaryPins;
  if (!boundary || boundary.length < 3) return { success: false, error: 'Need at least 3 boundary points' };

  onProgress?.('Capturing full satellite view...');
  
  // Calculate bounding box with 5% padding
  const { getBbox } = await import('./geo');
  const bb = getBbox(boundary);
  const pLng = (bb.east - bb.west) * 0.05 || 0.0005;
  const pLat = (bb.north - bb.south) * 0.05 || 0.0005;
  
  // Create a padded bounding box representing the full canvas view
  const paddedBoundary = [
    { lat: bb.south - pLat, lng: bb.west - pLng },
    { lat: bb.north + pLat, lng: bb.west - pLng },
    { lat: bb.north + pLat, lng: bb.east + pLng },
    { lat: bb.south - pLat, lng: bb.east + pLng }
  ];

  const { canvas: satCanvas, tileBounds } = await captureFullSatellite(paddedBoundary, onProgress);
  const cw = satCanvas.width;
  const ch = satCanvas.height;

  // Composite sketch map over satellite so AI can trace roads
  const { renderMapToCanvas } = await import('./pdf-export');
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = cw;
  overlayCanvas.height = ch;
  const ctx = overlayCanvas.getContext('2d')!;
  ctx.drawImage(satCanvas, 0, 0);

  const sketchCanvas = document.createElement('canvas');
  renderMapToCanvas(sketchCanvas, { ...mapData, orientation }, cw, ch, { transparentBg: true, hideSymbols: true, focusBounds: tileBounds });
  ctx.drawImage(sketchCanvas, 0, 0);

  onProgress?.('Processing image for AI...');
  
  // Convert to base64, ensure under 3.4MB
  let quality = 0.92;
  let base64 = overlayCanvas.toDataURL('image/jpeg', quality);
  let rawB64 = base64.split(',')[1];
  let sizeBytes = rawB64.length * 0.75;

  while (sizeBytes > 3.4 * 1024 * 1024 && quality > 0.3) {
    quality -= 0.1;
    if (quality < 0.5) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.round(cw * 0.7);
      smaller.height = Math.round(ch * 0.7);
      const sctx = smaller.getContext('2d')!;
      sctx.drawImage(overlayCanvas, 0, 0, smaller.width, smaller.height);
      base64 = smaller.toDataURL('image/jpeg', quality);
    } else {
      base64 = overlayCanvas.toDataURL('image/jpeg', quality);
    }
    rawB64 = base64.split(',')[1];
    sizeBytes = rawB64.length * 0.75;
  }

  const ar = cw / ch;
  let ratio = '1:1';
  if (ar > 1.4) ratio = '16:9';
  else if (ar > 1.15) ratio = '4:3';
  else if (ar < 0.7) ratio = '9:16';
  else if (ar < 0.85) ratio = '3:4';
  
  return generateSurveyMap(rawB64, ratio, onProgress);
}

export async function generateChunkedSurveyMaps(
  boundary: Coordinate[],
  chunkSizeMeters: number,
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; error?: string; chunks?: { label: string; bbox: Coordinate[]; imageBase64: string }[] }> {
  if (boundary.length < 3) return { success: false, error: 'Need at least 3 boundary points' };

  // Step 1: Generate grid chunks
  const { generateGridChunks } = await import('./geo');
  const chunks = generateGridChunks(boundary, chunkSizeMeters);
  if (chunks.length === 0) return { success: false, error: 'No chunks generated' };

  const results: { label: string; bbox: Coordinate[]; imageBase64: string }[] = [];

  // Step 2: Process each chunk
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (onProgress) onProgress(`Processing chunk ${i + 1} of ${chunks.length} (${chunk.label})...`);

    // Capture satellite for this chunk's bounding box
    const { base64 } = await captureSatelliteForBoundary(chunk.bbox, onProgress);

    // Generate survey map (using square ratio for chunks)
    const aiResult = await generateSurveyMap(base64, '1:1', onProgress);

    if (aiResult.success && aiResult.imageUrl) {
      // Store the raw URL instead of base64 to avoid huge JSON payloads that fail to save to the database.
      results.push({ label: chunk.label, bbox: chunk.bbox, imageBase64: aiResult.imageUrl });
    } else {
      return { success: false, error: `Failed on chunk ${chunk.label}: ${aiResult.error}` };
    }
  }

  return { success: true, chunks: results };
}
