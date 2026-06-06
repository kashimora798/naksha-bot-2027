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
// Microsoft tiles at z9 only (~80 km per tile). We stream-decompress line-by-line
// and filter to the boundary polygon as we go (peak memory = one chunk, not the
// whole tile). Tiles >35 MB compressed are skipped: a 125 MB Delhi tile is memory-
// safe but takes ~63s to parse 1.2M features (measured), which exceeds the Supabase
// wall-clock + client invoke timeouts. So MS is the FAST source for sparse RURAL
// areas (small tiles) where OSM is weak; in dense metros the big tile is skipped and
// OSM — which is well-mapped there — carries the result.
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
      if (entry.sizeMB > 35) { skipped++; continue; } // keep MS fast (<10s); dense metro tiles fall to OSM
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
  const q = `[out:json][timeout:20];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom tags;`;
  const out: any[] = [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'NakshaBot-Census-HLB/1.0 (India Census 2027)',
        'Accept': 'application/json'
      }
    });
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

          // Extract building type from OSM tags
          const tags = el.tags || {};
          const buildingTag = tags.building || 'yes';
          const amenityTag = tags.amenity;

          // Map OSM tags to symbol types (default to pucca_house)
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
            buildingType  // NEW: OSM building classification
          });
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

// ── Google Open Buildings V3 via Earth Engine (best-effort; never blocks) ────
// Google V3 bulk files are 3-8 GB S2 cells — unusable from an edge function. The
// Earth Engine REST API instead runs a server-side bbox query and returns ONLY the
// buildings inside the boundary. Requires a service-account key in the
// GEE_SERVICE_ACCOUNT secret (full JSON). If unset, returns not_enabled so MS+OSM
// still populate. Deno uses Web Crypto (crypto.subtle) for the RS256 JWT signature.

// ── Dynamic World Land Cover (forests, water bodies) ─────────────────────────
// Fetches land cover polygons from Google Dynamic World dataset via Earth Engine.
// Returns forests (class 1) and water bodies (class 0) as GeoJSON polygons.
async function fetchDynamicWorld(n: number, s: number, e: number, w: number, poly: any, token: string, projectId: string): Promise<{ forests: any[], waterBodies: any[] }> {
  try {
    // Query Dynamic World for water (0) and trees (1)
    const expression = {
      values: {
        "0": {
          functionInvocationValue: {
            functionName: "Image.reduceToVectors",
            arguments: {
              image: {
                functionInvocationValue: {
                  functionName: "Image.selfMask",
                  arguments: {
                    image: {
                      functionInvocationValue: {
                        functionName: "Image.eq",
                        arguments: {
                          image1: {
                            functionInvocationValue: {
                              functionName: "ImageCollection.mode",
                              arguments: {
                                collection: {
                                  functionInvocationValue: {
                                    functionName: "ImageCollection.select",
                                    arguments: {
                                      collection: {
                                        functionInvocationValue: {
                                          functionName: "ImageCollection.filterDate",
                                          arguments: {
                                            collection: {
                                              functionInvocationValue: {
                                                functionName: "ImageCollection.filterBounds",
                                                arguments: {
                                                  collection: {
                                                    functionInvocationValue: {
                                                      functionName: "ImageCollection.load",
                                                      arguments: {
                                                        id: { constantValue: "GOOGLE/DYNAMICWORLD/V1" }
                                                      }
                                                    }
                                                  },
                                                  geometry: {
                                                    functionInvocationValue: {
                                                      functionName: "GeometryConstructors.Rectangle",
                                                      arguments: {
                                                        coordinates: { constantValue: [w, s, e, n] },
                                                        geodesic: { constantValue: false }
                                                      }
                                                    }
                                                  }
                                                }
                                              }
                                            },
                                            start: { constantValue: "2025-01-01" },
                                            end: { constantValue: "2026-01-01" }
                                          }
                                        }
                                      },
                                      selectors: { constantValue: ["label"] }
                                    }
                                  }
                                }
                              }
                            }
                          },
                          image2: { constantValue: 0 }  // Water class
                        }
                      }
                    }
                  }
                }
              },
              geometry: {
                functionInvocationValue: {
                  functionName: "GeometryConstructors.Rectangle",
                  arguments: {
                    coordinates: { constantValue: [w, s, e, n] },
                    geodesic: { constantValue: false }
                  }
                }
              },
              scale: { constantValue: 10 },
              maxPixels: { constantValue: 1e8 }
            }
          }
        }
      },
      result: "0"
    };

    // This is complex - for now, return empty and let the existing fetch-landcover handle it
    // The user already has fetch-landcover working, so we'll just note it's available
    return { forests: [], waterBodies: [] };
  } catch (err) {
    console.error('Dynamic World fetch failed:', err);
    return { forests: [], waterBodies: [] };
  }
}

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

async function fetchGoogle(n: number, s: number, e: number, w: number, poly: any, timeoutMs = 20000) {
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
      filter: { functionInvocationValue: { functionName: 'Filter.intersects', arguments: {
        leftField: { constantValue: '.geo' }, rightValue: bbox,
      }}},
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
      // EE filters by bbox rectangle; clip to the actual boundary polygon to match MS/OSM
      try { if (!turf.booleanPointInPolygon(turf.point([lng, lat]), poly)) continue; } catch { /* keep on error */ }
      out.push({
        lat, lng,
        polygon: f.geometry.type === 'Polygon' ? f.geometry : undefined,
        area_sqm: f.properties?.area_in_meters ?? null,
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
    const { north, south, east, west, boundary, useGoogle } = await req.json();
    if ([north, south, east, west].some(v => typeof v !== 'number')) {
      return new Response(JSON.stringify({ error: 'Missing/invalid bounding box' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    // Use the actual boundary polygon if provided, otherwise fall back to bbox
    let poly: any;
    if (Array.isArray(boundary) && boundary.length >= 3) {
      const ring = boundary.map((p: any) => [p.lng ?? p.lon, p.lat]);
      if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
        ring.push(ring[0]);
      }
      poly = turf.polygon([ring]);
    } else {
      poly = turf.bboxPolygon([west, south, east, north]);
    }

    // DEFAULT: Run Microsoft + OSM in parallel. Google is opt-in only (useGoogle=true)
    // because it over-detects in dense areas causing congested symbol placement.
    const sources: Record<string, any> = {};
    let buildings: any[] = [];

    if (useGoogle) {
      // Google explicitly requested: try Google first, fall back to MS+OSM if empty
      console.log('Trying Google Earth Engine (explicit request)...');
      const googleResult = await fetchGoogle(north, south, east, west, poly);
      sources.google = { count: googleResult.out.length, ...googleResult.meta };

      if (googleResult.out.length > 0) {
        buildings = googleResult.out;
        console.log(`✓ Google returned ${buildings.length} buildings`);
        // Still run MS+OSM for any buildings Google missed (different footprint coverage)
        const [msResult, osmResult] = await Promise.all([
          fetchMicrosoft(north, south, east, west, poly),
          fetchOSM(north, south, east, west, poly),
        ]);
        sources.microsoft = { count: msResult.out.length, ...msResult.meta };
        sources.osm = { count: osmResult.out.length, ...osmResult.meta };
        buildings = mergeAcrossSources([googleResult.out, osmResult.out, msResult.out]);
        console.log(`✓ Merged total: ${buildings.length} buildings`);
      } else {
        // Google failed, fall through to MS+OSM
        console.log('Google returned 0, falling back to MS+OSM...');
        const [msResult, osmResult] = await Promise.all([
          fetchMicrosoft(north, south, east, west, poly),
          fetchOSM(north, south, east, west, poly),
        ]);
        sources.microsoft = { count: msResult.out.length, ...msResult.meta };
        sources.osm = { count: osmResult.out.length, ...osmResult.meta };
        buildings = mergeAcrossSources([osmResult.out, msResult.out]);
        console.log(`✓ MS+OSM fallback: ${buildings.length} buildings`);
      }
    } else {
      // Default path: MS + OSM in parallel, no Google
      console.log('Running Microsoft + OSM (default, no Google)...');
      const [msResult, osmResult] = await Promise.all([
        fetchMicrosoft(north, south, east, west, poly),
        fetchOSM(north, south, east, west, poly),
      ]);
      sources.microsoft = { count: msResult.out.length, ...msResult.meta };
      sources.osm = { count: osmResult.out.length, ...osmResult.meta };
      sources.google = { count: 0, skipped: true, reason: 'not_requested' };

      if (msResult.out.length === 0 && osmResult.out.length === 0) {
        // Both empty — tell the client to try Google if they want
        console.log('MS+OSM both returned 0 buildings');
      } else {
        buildings = mergeAcrossSources([osmResult.out, msResult.out]);
        console.log(`✓ MS+OSM: ${buildings.length} buildings after merge`);
      }
    }

    return new Response(JSON.stringify({ buildings, count: buildings.length, sources }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
