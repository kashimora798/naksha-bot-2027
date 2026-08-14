import * as turf from "https://esm.sh/@turf/turf@6.5.0";
import { fetchOverpassWithFallback } from "./overpass.ts";

// ============================================================================
// _shared/buildings.ts — the Microsoft + OSM + Google building waterfall.
//
// Factored out of fetch-open-buildings/index.ts so BOTH the standalone
// fetch-open-buildings function (kept for backward compatibility — anything
// still calling it directly keeps working unchanged) and the new unified
// fetch-geodata gateway import exactly the same logic. Previously this ~350
// lines of merge/dedup logic existed in exactly one place; now it exists in
// exactly one place AND is reusable, instead of being copy-pasted a second
// time for the gateway.
//
// The only functional change from the original: fetchOSM() now goes through
// fetchOverpassWithFallback() (5 mirrors) instead of a single hardcoded
// overpass-api.de call. That single-endpoint call was the one leg of the
// building pipeline with no resilience at all, even though MS and Google
// each have their own fallback path already (MS→OSM, OSM→(nothing further
// unless Google was requested)).
// ============================================================================

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
let msIndexCache: Map<string, { url: string; sizeMB: number }> | null = null;
async function fetchMicrosoftIndex(): Promise<Map<string, { url: string; sizeMB: number }>> {
  if (msIndexCache) return msIndexCache;
  const r = await fetch('https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv');
  if (!r.ok) throw new Error(`MS index HTTP ${r.status}`);
  const text = await r.text();
  const map = new Map<string, { url: string; sizeMB: number }>();
  for (const line of text.split('\n').slice(1)) {
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
      if (entry.sizeMB > 35) { skipped++; continue; }
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
          partial = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const f = JSON.parse(line);
              if (!f.geometry || f.geometry.type !== 'Polygon') continue;
              const ring = f.geometry.coordinates[0];
              let cx = 0, cy = 0;
              for (const p of ring) { cx += p[0]; cy += p[1]; }
              cx /= ring.length; cy /= ring.length;
              if (cx < w || cx > e || cy < s || cy > n) continue;
              const geom = turf.feature(f.geometry);
              if (turf.booleanIntersects(geom, poly)) {
                const c = turf.centroid(geom);
                out.push({ lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0], polygon: f.geometry, area_sqm: turf.area(geom), source: 'microsoft' });
              }
            } catch { /* skip bad line */ }
          }
        }
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
  } catch (err) {
    console.error('MS index fetch failed:', err);
    return { source: 'microsoft', out, meta: { tiles: 0, errors: 1, reason: 'index_unavailable' } };
  }
  return { source: 'microsoft', out, meta: { tiles, errors, skipped } };
}

// ── OpenStreetMap buildings via Overpass — now with mirror fallback ─────────
async function fetchOSM(n: number, s: number, e: number, w: number, poly: any, timeoutMs = 15000) {
  const q = `[out:json][timeout:20];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom tags;`;
  const out: any[] = [];
  const result = await fetchOverpassWithFallback(q, timeoutMs);
  if (!result.ok) return { source: 'osm', out, meta: { ok: false, reason: result.error } };

  for (const el of result.elements) {
    if (!el.geometry || el.geometry.length < 3) continue;
    const ring = el.geometry.map((p: any) => [p.lon, p.lat]);
    if (ring.length && (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])) ring.push(ring[0]);
    try {
      const geom = turf.polygon([ring]);
      if (turf.booleanIntersects(geom, poly)) {
        const c = turf.centroid(geom);
        const tags = el.tags || {};
        const buildingTag = tags.building || 'yes';
        const amenityTag = tags.amenity;
        let buildingType = 'pucca_house';
        if (buildingTag === 'school') buildingType = 'school';
        else if (buildingTag === 'temple' || buildingTag === 'place_of_worship' || amenityTag === 'place_of_worship') buildingType = 'temple';
        else if (buildingTag === 'hospital' || amenityTag === 'hospital') buildingType = 'hospital';
        else if (buildingTag === 'commercial' || buildingTag === 'retail') buildingType = 'commercial';
        else if (buildingTag === 'apartments' || buildingTag === 'residential') buildingType = 'pucca_house';
        else if (buildingTag === 'house' || buildingTag === 'detached') buildingType = 'pucca_house';

        out.push({
          lat: c.geometry.coordinates[1],
          lng: c.geometry.coordinates[0],
          polygon: geom.geometry,
          area_sqm: turf.area(geom),
          source: 'osm',
          buildingType,
        });
      }
    } catch { /* skip malformed ring */ }
  }
  return { source: 'osm', out, meta: { ok: true, endpointUsed: result.endpointUsed } };
}

// ── Google Open Buildings V3 via Earth Engine (best-effort; never blocks) ───
function b64url(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem.replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const bin = atob(body);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let geeTokenCache: { token: string; exp: number } | null = null;
async function getGeeToken(sa: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (geeTokenCache && geeTokenCache.exp > now + 60) return geeTokenCache.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/earthengine.readonly https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  const jwt = `${unsigned}.${b64url(sig)}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!r.ok) throw new Error(`token exchange ${r.status}`);
  const j = await r.json();
  geeTokenCache = { token: j.access_token, exp: now + (j.expires_in || 3600) };
  return j.access_token;
}

async function fetchGoogle(n: number, s: number, e: number, w: number, poly: any, minConfidence = 0.70, timeoutMs = 20000) {
  const out: any[] = [];
  const raw = Deno.env.get('GEE_SERVICE_ACCOUNT');
  if (!raw) return { source: 'google', out, meta: { ok: true, reason: 'not_enabled' } };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const sa = JSON.parse(raw);
    const token = await getGeeToken(sa);
    const bbox = { functionInvocationValue: { functionName: 'GeometryConstructors.Rectangle', arguments: {
      coordinates: { constantValue: [w, s, e, n] }, geodesic: { constantValue: false }, evenOdd: { constantValue: true },
    }}};
    const expression = { values: { '0': { functionInvocationValue: { functionName: 'Collection.filter', arguments: {
      collection: { functionInvocationValue: { functionName: 'Collection.loadTable', arguments: {
        tableId: { constantValue: 'GOOGLE/Research/open-buildings/v3/polygons' },
      }}},
      filter: { functionInvocationValue: { functionName: 'Filter.and', arguments: {
        filters: { constantValue: [
          { functionInvocationValue: { functionName: 'Filter.intersects', arguments: {
            leftField: { constantValue: '.geo' }, rightValue: bbox,
          }}},
          { functionInvocationValue: { functionName: 'Filter.greaterThanOrEquals', arguments: {
            leftField: { constantValue: 'confidence' }, rightValue: { constantValue: minConfidence }
          }}}
        ]}
      }}}
    }}}}, result: '0' };
    const r = await fetch(`https://earthengine.googleapis.com/v1/projects/${sa.project_id}/value:compute`, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression }),
    });
    if (!r.ok) {
      const body = await r.text();
      return { source: 'google', out, meta: { ok: false, reason: `ee ${r.status}: ${body.slice(0, 120)}` } };
    }
    const data = await r.json();
    const feats = data.result?.features || data.features || [];
    for (const f of feats) {
      if (!f.geometry) continue;
      const c = f.properties?.longitude_latitude?.coordinates;
      const lat = c ? c[1] : undefined, lng = c ? c[0] : undefined;
      if (lat == null || lng == null) continue;
      try { if (!turf.booleanPointInPolygon(turf.point([lng, lat]), poly)) continue; } catch { /* keep on error */ }
      out.push({
        lat, lng,
        polygon: f.geometry.type === 'Polygon' ? f.geometry : undefined,
        area_sqm: f.properties?.area_in_meters ?? null,
        confidence: f.properties?.confidence ?? null,
        source: 'google',
      });
    }
    return { source: 'google', out, meta: { ok: true, count: out.length } };
  } catch (err) {
    const reason = (err as any)?.name === 'AbortError' ? 'timeout' : String(err);
    console.error('Google EE:', reason);
    return { source: 'google', out, meta: { ok: false, reason } };
  } finally {
    clearTimeout(timer);
  }
}

// Cross-source conflation — unchanged from the original: at most one building
// per source per cluster, so two providers mapping the same structure collapse
// to one, while genuinely distinct neighbours from the SAME source are kept.
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
        c.sources.add(b.source);
        attached = true;
        break;
      }
    }
    if (!attached) clusters.push({ lat: b.lat, lng: b.lng, sources: new Set([b.source]), rep: b });
  }
  return clusters.map(c => c.rep);
}

export interface BuildingFetchResult {
  buildings: any[];
  count: number;
  sources: Record<string, any>;
}

/**
 * The full MS + OSM + (optional) Google waterfall, as one call.
 * Same behavior as the original fetch-open-buildings handler:
 *  - useGoogle=false (default): MS + OSM in parallel, merged.
 *  - useGoogle=true: Google first; if it returns results, still runs MS+OSM
 *    in the background and merges all three; if Google returns nothing,
 *    falls back to MS+OSM only.
 */
export async function fetchBuildings(
  north: number, south: number, east: number, west: number,
  poly: any, useGoogle: boolean, minConfidence?: number,
): Promise<BuildingFetchResult> {
  const sources: Record<string, any> = {};
  let buildings: any[] = [];

  if (useGoogle) {
    const googleResult = await fetchGoogle(north, south, east, west, poly, minConfidence ?? 0.70);
    sources.google = { count: googleResult.out.length, ...googleResult.meta };

    if (googleResult.out.length > 0) {
      buildings = googleResult.out;
      const [msResult, osmResult] = await Promise.all([
        fetchMicrosoft(north, south, east, west, poly),
        fetchOSM(north, south, east, west, poly),
      ]);
      sources.microsoft = { count: msResult.out.length, ...msResult.meta };
      sources.osm = { count: osmResult.out.length, ...osmResult.meta };
      buildings = mergeAcrossSources([googleResult.out, osmResult.out, msResult.out]);
    } else {
      const [msResult, osmResult] = await Promise.all([
        fetchMicrosoft(north, south, east, west, poly),
        fetchOSM(north, south, east, west, poly),
      ]);
      sources.microsoft = { count: msResult.out.length, ...msResult.meta };
      sources.osm = { count: osmResult.out.length, ...osmResult.meta };
      buildings = mergeAcrossSources([osmResult.out, msResult.out]);
    }
  } else {
    const [msResult, osmResult] = await Promise.all([
      fetchMicrosoft(north, south, east, west, poly),
      fetchOSM(north, south, east, west, poly),
    ]);
    sources.microsoft = { count: msResult.out.length, ...msResult.meta };
    sources.osm = { count: osmResult.out.length, ...osmResult.meta };
    sources.google = { count: 0, skipped: true, reason: 'not_requested' };
    buildings = mergeAcrossSources([osmResult.out, msResult.out]);
  }

  return { buildings, count: buildings.length, sources };
}
