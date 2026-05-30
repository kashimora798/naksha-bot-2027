import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";

// ============================================================================
// fetch-open-buildings — building footprints for an HLB bbox, free, no API key.
//
// ALL sources run together (in parallel) and every result is returned. Duplicates
// are removed ONLY across different sources (the same physical building mapped by
// two providers) — never within a source, so dense urban rows keep every house.
//
//   • Microsoft Global Building Footprints  (z9 quadkey .geojson.gz tiles)
//   • OpenStreetMap buildings via Overpass   (hard-timeout guarded)
//   • Google Open Buildings V3 (optional)    (CSV by S2 token, if reachable)
//
// Returns { buildings:[{lat,lng,area_sqm,source,polygon?}], count, sources:{...} }
// Always 200 with a per-source breakdown so the client can show WHY it was empty.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function latLngToQuadkey(lat: number, lng: number, zoom: number): string {
  const x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  const y = Math.floor(
    ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, zoom)
  );
  let qk = '';
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    qk += digit.toString();
  }
  return qk;
}

function bboxQuadkeys(n: number, s: number, e: number, w: number, zoom = 9): string[] {
  return [...new Set([
    latLngToQuadkey(n, w, zoom), latLngToQuadkey(n, e, zoom),
    latLngToQuadkey(s, w, zoom), latLngToQuadkey(s, e, zoom),
  ])];
}

// ── Microsoft Global Building Footprints ────────────────────────────────────
// Microsoft tiles at z9 only (~80 km per tile). Dense metro tiles are 125-178 MB
// compressed, so we stream-decompress line-by-line and filter to the boundary
// polygon as we go (peak memory = one chunk, not the whole tile). Tiles >50 MB
// compressed are skipped as a safety valve for Supabase CPU/wall-clock limits.
let msIndexCache: Map<string, { url: string; sizeMB: number }> | null = null;
async function fetchMicrosoftIndex(): Promise<Map<string, { url: string; sizeMB: number }>> {
  if (msIndexCache) return msIndexCache;
  const r = await fetch('https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv');
  if (!r.ok) throw new Error(`MS index HTTP ${r.status}`);
  const text = await r.text();
  const map = new Map<string, { url: string; sizeMB: number }>();
  for (const line of text.split('\n').slice(1)) { // skip header
    const cols = line.split(',');
    if (cols.length < 4) continue;
    const qk = cols[1], url = cols[2], sizeStr = cols[3];
    let sizeMB = 0;
    if (sizeStr.endsWith('MB')) sizeMB = parseFloat(sizeStr);
    else if (sizeStr.endsWith('KB')) sizeMB = parseFloat(sizeStr) / 1024;
    else if (sizeStr.endsWith('B')) sizeMB = parseFloat(sizeStr) / (1024 * 1024);
    map.set(qk, { url, sizeMB });
  }
  msIndexCache = map;
  return map;
}

async function fetchMicrosoft(n: number, s: number, e: number, w: number, poly: any) {
  const out: any[] = [];
  let tiles = 0, errors = 0, skipped = 0;
  try {
    const index = await fetchMicrosoftIndex();
    for (const qk of bboxQuadkeys(n, s, e, w, 9)) {
      const entry = index.get(qk);
      if (!entry) { errors++; continue; }
      if (entry.sizeMB > 50) { skipped++; continue; } // safety cap for dense metros
      try {
        const r = await fetch(entry.url);
        if (!r.ok) { errors++; continue; }
        tiles++;
        const stream = r.body?.pipeThrough(new DecompressionStream("gzip"));
        if (!stream) { errors++; continue; }
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let partial = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          partial += decoder.decode(value, { stream: true });
          const lines = partial.split('\n');
          partial = lines.pop() || ''; // keep incomplete line for next chunk
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const f = JSON.parse(line);
              if (!f.geometry || f.geometry.type !== 'Polygon') continue;
              const ring = f.geometry.coordinates[0];
              let cx = 0, cy = 0;
              for (const p of ring) { cx += p[0]; cy += p[1]; }
              cx /= ring.length; cy /= ring.length;
              // Quick bbox check before expensive turf ops
              if (cx < w || cx > e || cy < s || cy > n) continue;
              const geom = turf.feature(f.geometry);
              if (turf.booleanIntersects(geom, poly)) {
                const c = turf.centroid(geom);
                out.push({ lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0], polygon: f.geometry, area_sqm: turf.area(geom), source: 'microsoft' });
              }
            } catch { /* skip bad line */ }
          }
        }
        // process final partial line if any
        if (partial.trim()) {
          try {
            const f = JSON.parse(partial);
            if (f.geometry && f.geometry.type === 'Polygon') {
              const ring = f.geometry.coordinates[0];
              let cx = 0, cy = 0;
              for (const p of ring) { cx += p[0]; cy += p[1]; }
              cx /= ring.length; cy /= ring.length;
              if (cx >= w && cx <= e && cy >= s && cy <= n) {
                const geom = turf.feature(f.geometry);
                if (turf.booleanIntersects(geom, poly)) {
                  const c = turf.centroid(geom);
                  out.push({ lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0], polygon: f.geometry, area_sqm: turf.area(geom), source: 'microsoft' });
                }
              }
            }
          } catch { /* skip */ }
        }
      } catch (err) { errors++; console.error(`MS tile ${qk}:`, err); }
    }
  } catch (err) { console.error('MS index fetch failed:', err); return { source: 'microsoft', out, meta: { tiles: 0, errors: 1, reason: 'index_unavailable' } }; }
  return { source: 'microsoft', out, meta: { tiles, errors, skipped } };
}

// ── OpenStreetMap buildings via Overpass (hard timeout) ──────────────────────
async function fetchOSM(n: number, s: number, e: number, w: number, poly: any, timeoutMs = 12000) {
  const q = `[out:json][timeout:20];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom;`;
  const out: any[] = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, { signal: ctrl.signal });
    if (!r.ok) return { source: 'osm', out, meta: { ok: false, reason: `http ${r.status}` } };
    const d = await r.json();
    for (const el of (d.elements || [])) {
      if (!el.geometry || el.geometry.length < 3) continue;
      const ring = el.geometry.map((p: any) => [p.lon, p.lat]);
      if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
      try {
        const geom = turf.polygon([ring]);
        if (turf.booleanIntersects(geom, poly)) {
          const c = turf.centroid(geom);
          out.push({ lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0], polygon: geom.geometry, area_sqm: turf.area(geom), source: 'osm' });
        }
      } catch { /* skip */ }
    }
    return { source: 'osm', out, meta: { ok: true } };
  } catch (err) {
    const reason = (err as any)?.name === 'AbortError' ? 'timeout' : String(err);
    console.error('OSM:', reason);
    return { source: 'osm', out, meta: { ok: false, reason } };
  } finally {
    clearTimeout(timer);
  }
}

// ── Google Open Buildings V3 (best-effort; never blocks the response) ────────
// Google publishes V3 as large per-S2-cell CSVs on GCS. There is no light
// bbox-tile endpoint, so we attempt it behind a short timeout and simply skip if
// it isn't quickly available — the other two sources still return.
async function fetchGoogle(_n: number, _s: number, _e: number, _w: number, _poly: any, timeoutMs = 8000) {
  const out: any[] = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Placeholder for a future GeoParquet/PMTiles reader (DuckDB-wasm). Until that
    // is wired, return empty without error so MS+OSM still populate.
    return { source: 'google', out, meta: { ok: true, reason: 'not_enabled' } };
  } catch (err) {
    const reason = (err as any)?.name === 'AbortError' ? 'timeout' : String(err);
    return { source: 'google', out, meta: { ok: false, reason } };
  } finally {
    clearTimeout(timer);
  }
}

// Cross-source conflation. Every building is kept EXCEPT a true cross-source
// duplicate: buildings are grouped into clusters that hold at most ONE building
// per source, so two providers mapping the same structure collapse to one, while
// genuinely distinct neighbours from the SAME source are always preserved (this is
// what keeps dense urban rows intact). Representative = highest-priority source
// (OSM hand-mapped > Google > Microsoft), since we process in that order.
function mergeAcrossSources(groups: any[][]): any[] {
  const pref: Record<string, number> = { osm: 0, google: 1, microsoft: 2 };
  const all = groups.flat().sort((a, b) => (pref[a.source] ?? 9) - (pref[b.source] ?? 9));
  const near = 3.6e-5; // ~4 m in degrees
  const clusters: { lat: number; lng: number; sources: Set<string>; rep: any }[] = [];
  for (const b of all) {
    let attached = false;
    for (const c of clusters) {
      if (!c.sources.has(b.source) &&
          Math.abs(c.lat - b.lat) < near && Math.abs(c.lng - b.lng) < near) {
        c.sources.add(b.source); // same building from another source → fold in, drop b
        attached = true;
        break;
      }
    }
    if (!attached) clusters.push({ lat: b.lat, lng: b.lng, sources: new Set([b.source]), rep: b });
  }
  return clusters.map(c => c.rep);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { north, south, east, west, boundary } = await req.json();
    if ([north, south, east, west].some(v => typeof v !== 'number')) {
      return new Response(JSON.stringify({ error: 'Missing/invalid bounding box' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Use the actual boundary polygon if provided, otherwise fall back to bbox
    let poly: any;
    if (Array.isArray(boundary) && boundary.length >= 3) {
      const ring = boundary.map((p: any) => [p.lng, p.lon]);
      // Close the ring if not already closed
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0]);
      }
      poly = turf.polygon([ring]);
    } else {
      poly = turf.bboxPolygon([west, south, east, north]);
    }

    // All sources run TOGETHER. Each is independently guarded, so a slow/empty
    // one can never stop the others from returning. (allSettled = never rejects.)
    const settled = await Promise.allSettled([
      fetchMicrosoft(north, south, east, west, poly),
      fetchOSM(north, south, east, west, poly),
      fetchGoogle(north, south, east, west, poly),
    ]);
    const results = settled.map((r, i) =>
      r.status === 'fulfilled' ? r.value
        : { source: ['microsoft', 'osm', 'google'][i], out: [], meta: { ok: false, reason: 'rejected' } });

    const buildings = mergeAcrossSources(results.map(r => r.out));
    const sources: Record<string, any> = {};
    for (const r of results) sources[r.source] = { count: r.out.length, ...r.meta };

    return new Response(JSON.stringify({ buildings, count: buildings.length, sources }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
