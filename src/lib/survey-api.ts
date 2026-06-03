import type { Coordinate } from '../types';
import { getBbox } from './geo';
import { supabase } from './supabase';

// ═══════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════

// Change this to your API server address
export const API_BASE = import.meta.env.VITE_API_BASE || 'https://pixelster.vercel.app';

export const SURVEY_MAP_PROMPT = `Convert this satellite aerial image into a clean official survey map in the style of Survey of India topographic sheets. Use cream white paper background. Roads and lanes must be the dominant visual element — draw main roads as bold double black lines 3px wide with white fill between them, small lanes as single solid black lines 1.5px, footpaths as dashed black lines 1px. Building clusters must be drawn as simple solid black outlined rectangles grouped together, no individual roof details, no irregular shapes, just clean rectangular blocks. Agricultural fields and open land must have only a thin 1px outline with zero fill or hatching inside — fields must appear as empty white outlined polygons, not textured. Trees and vegetation must be represented only as small simple circular outlines 0.5px, no shading, no scribble, placed at the edge of settlement areas only. Water bodies must be light blue filled simple shapes. The entire image must have high contrast black lines on white/cream background. No artistic shading, no pencil texture, no crosshatching anywhere except optionally very light parallel lines inside agricultural fields only. The visual hierarchy must be: roads most prominent, then settlement block outlines, then field boundaries, then vegetation last. This is a government census layout map not an artistic illustration. and also the red colour boundary should be marked with the dotted line in the map `;

export const SURVEY_MAP_PROMPT_2 = `Convert this satellite image into a high-contrast cadastral layout map for official census boundary verification. The map must have a stark white background with solid black line details. Visual priority 1 is roads: draw all streets as clean, double-lined pathways with white space in between. Visual priority 2 is buildings: draw all structures as simple, solid-outlined dark grey or black rectangles, forming legible block segments. Agricultural fields, plots, and land boundaries must be marked with very fine black outlines, leaving the interior clean and transparent. Forests and tree clusters should be represented by minimal, green-tinted outlined zones without dense textures. All lines must be sharp, vector-quality, and flat, suitable for technical printing. No gradients, shadows, or hand-drawn sketches. Draw the red census area boundary as a bold, dashed red line.`;

export const SURVEY_MAP_PROMPT_3 = `Convert this satellite view into a detailed urban census layout plan. Background must be solid off-white. Highlight urban density: draw individual buildings and housing clusters as crisp, grey-filled rectangles with distinct black outlines, leaving narrow white alleys between them. Major roads must be drawn as thick double-line roads, and smaller lanes as single lines. Include simple symbols or small circular outlines for landmarks and public spaces. Avoid realistic satellite textures, terrain shading, or complex colors. Use a minimalist, technical vector cartography style with high contrast. The red study boundary must be plotted as a clear dashed red line.`;

export const PREDEFINED_PROMPTS = [
  { id: 'soi_topo', name: 'Official Topographic Layout', prompt: SURVEY_MAP_PROMPT },
  { id: 'cadastral', name: 'Cadastral Census Block Map', prompt: SURVEY_MAP_PROMPT_2 },
  { id: 'urban_density', name: 'Urban High-Density Plan', prompt: SURVEY_MAP_PROMPT_3 }
];


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
export async function captureSatelliteTiles(
  boundary: Coordinate[],
  onProgress?: (msg: string) => void,
  targetAspect?: number
): Promise<{ canvas: HTMLCanvasElement; tileBounds: { north: number; south: number; east: number; west: number } }> {
  const bb = getBbox(boundary);
  // Add 5% base padding to ensure boundary never touches the very edge
  const padLat = (bb.north - bb.south) * 0.05;
  const padLng = (bb.east - bb.west) * 0.05;
  let south = bb.south - padLat;
  let north = bb.north + padLat;
  let west = bb.west - padLng;
  let east = bb.east + padLng;

  // If a target aspect ratio is provided (e.g. A4 paper), pad the bounds further
  // so that the resulting image perfectly matches the aspect ratio without being cropped by CSS object-cover
  if (targetAspect) {
    const latDiff = north - south;
    const lngDiff = east - west;
    const centerLat = (north + south) / 2;
    const lngMultiplier = Math.cos(centerLat * Math.PI / 180);
    const widthMeters = lngDiff * 111320 * lngMultiplier;
    const heightMeters = latDiff * 111000;
    
    const currentAspect = widthMeters / heightMeters;
    if (currentAspect < targetAspect) {
      // Too tall, pad width (longitude)
      const newWidthMeters = heightMeters * targetAspect;
      const paddingLng = ((newWidthMeters - widthMeters) / (111320 * lngMultiplier)) / 2;
      west -= paddingLng;
      east += paddingLng;
    } else {
      // Too wide, pad height (latitude)
      const newHeightMeters = widthMeters / targetAspect;
      const paddingLat = ((newHeightMeters - heightMeters) / 111000) / 2;
      south -= paddingLat;
      north += paddingLat;
    }
  }

  const latDiff = north - south;
  const lngDiff = east - west;
  // Prioritize high-res zoom 18/19 for quality AI detection
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 17 : latDiff > 0.004 || lngDiff > 0.006 ? 18 : 19;

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

  // Now calculate crop to padded bounding box
  const bb = getBbox(boundary);
  const padLat = (bb.north - bb.south) * 0.05;
  const padLng = (bb.east - bb.west) * 0.05;
  const south = bb.south - padLat;
  const north = bb.north + padLat;
  const west = bb.west - padLng;
  const east = bb.east + padLng;

  const latDiff = north - south;
  const lngDiff = east - west;
  const zoom = latDiff > 0.008 || lngDiff > 0.012 ? 17 : latDiff > 0.004 || lngDiff > 0.006 ? 18 : 19;

  const tx1 = lng2tile(west, zoom);
  const tx2 = lng2tile(east, zoom);
  const ty1 = lat2tile(north, zoom);
  const ty2 = lat2tile(south, zoom);

  const tileBounds = getTileBounds(zoom, tx1, tx2, ty1, ty2);
  const cw = satCanvas.width, ch = satCanvas.height;

  // Project boundary polygon to pixel coordinates on the canvas
  const projX = (lng: number) => ((lng - tileBounds.west) / (tileBounds.east - tileBounds.west)) * cw;
  const projY = (lat: number) => ((tileBounds.north - lat) / (tileBounds.north - tileBounds.south)) * ch;

  // Find the exact pixel bounding box of the padded area
  const pxWest = Math.max(0, projX(west));
  const pxEast = Math.min(cw, projX(east));
  const pxNorth = Math.max(0, projY(north)); 
  const pxSouth = Math.min(ch, projY(south));

  const cropWidth = pxEast - pxWest;
  const cropHeight = pxSouth - pxNorth;

  // Create heavily zoomed canvas
  const zoomed = document.createElement('canvas');
  zoomed.width = cropWidth;
  zoomed.height = cropHeight;
  const ctx = zoomed.getContext('2d')!;

  // Fill background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, cropWidth, cropHeight);

  // Draw ONLY the cropped region for maximum zoom
  ctx.drawImage(satCanvas, pxWest, pxNorth, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

  // Draw bold red boundary outline for context
  ctx.strokeStyle = 'rgba(255,0,0,1.0)';
  ctx.lineWidth = Math.max(3, cropWidth * 0.005);
  ctx.beginPath();
  boundary.forEach((p, i) => {
    // offset projection by crop origin
    const x = projX(p.lng) - pxWest, y = projY(p.lat) - pxNorth;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  onProgress?.('Processing image...');

  // Convert to base64, ensure under 3.4MB
  let quality = 0.92;
  let base64 = zoomed.toDataURL('image/jpeg', quality);
  let rawB64 = base64.split(',')[1];
  let sizeBytes = rawB64.length * 0.75;

  let currentCanvas = zoomed;

  while (sizeBytes > 3.4 * 1024 * 1024) {
    quality -= 0.1;
    if (quality < 0.4) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(100, Math.round(currentCanvas.width * 0.7));
      smaller.height = Math.max(100, Math.round(currentCanvas.height * 0.7));
      const sctx = smaller.getContext('2d')!;
      sctx.drawImage(currentCanvas, 0, 0, smaller.width, smaller.height);
      currentCanvas = smaller;
      quality = 0.8; 
    }
    base64 = currentCanvas.toDataURL('image/jpeg', Math.max(0.1, quality));
    rawB64 = base64.split(',')[1];
    sizeBytes = rawB64.length * 0.75;
  }

  return { canvas: currentCanvas, base64: rawB64, tileBounds };
}

/**
 * Capture FULL rectangular satellite (not clipped) for overlay use
 */
export async function captureFullSatellite(
  boundary: Coordinate[],
  onProgress?: (msg: string) => void,
  targetAspect?: number
): Promise<{ canvas: HTMLCanvasElement; tileBounds: { north: number; south: number; east: number; west: number } }> {
  return captureSatelliteTiles(boundary, onProgress, targetAspect);
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
  onProgress?: (msg: string) => void,
  customPrompt?: string
): Promise<SurveyMapResult> {
  onProgress?.('Sending to AI...');

  try {
    const response = await fetch(`${API_BASE}/api/pti`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: customPrompt || SURVEY_MAP_PROMPT,
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
  onProgress?: (msg: string) => void,
  onPreviewImage?: (base64DataUrl: string) => Promise<boolean>,
  customPrompt?: string
): Promise<SurveyMapResult> {
  const boundary = mapData.boundaryPins;
  if (!boundary || boundary.length < 3) return { success: false, error: 'Need at least 3 boundary points' };

  onProgress?.('Capturing tight satellite view...');
  
  const { base64 } = await captureSatelliteForBoundary(boundary, onProgress);
  const fullBase64DataUrl = `data:image/jpeg;base64,${base64}`;

  if (onPreviewImage) {
    onProgress?.('Waiting for preview approval...');
    const approved = await onPreviewImage(fullBase64DataUrl);
    if (!approved) {
      return { success: false, error: 'Cancelled by user after preview' };
    }
    onProgress?.('Sending to AI...');
  }

  // If we have a project ID and are not in demo mode, use the secure serverless API
  if (mapData.projectId) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        onProgress?.('Generating AI map securely...');
        const response = await fetch('/api/generate-map', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            projectId: mapData.projectId,
            satelliteBase64: base64,
            prompt: customPrompt || SURVEY_MAP_PROMPT,
            promptKey: customPrompt ? 'custom' : 'default',
            ratio: 'auto',
            kind: (mapData as any).isLive ? 'live' : 'project'
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          if (response.status === 402 && errData.error === 'regen_limit') {
            return { success: false, error: 'regen_limit' };
          }
          return { success: false, error: errData.error || `Server error (${response.status})` };
        }

        const data = await response.json();
        if (data && data.url) {
          return { success: true, imageUrl: data.url };
        }
      }
    } catch (e: any) {
      console.error('Secure generation failed, falling back to direct API:', e);
    }
  }

  // The Vercel API supports ratio: "auto" to preserve our carefully calculated A4 dimensions!
  return generateSurveyMap(base64, 'auto', onProgress, customPrompt);
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
