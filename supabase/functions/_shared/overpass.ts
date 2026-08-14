// ============================================================================
// _shared/overpass.ts — one resilient Overpass client for every edge function.
//
// Before this file existed, each server-side caller had its OWN way of hitting
// Overpass:
//   - fetch-open-buildings' OSM leg: a single hardcoded overpass-api.de call,
//     no fallback, so it was a single point of failure even though the
//     client-side fetchOverpass() in src/lib/geo.ts already had a 5-mirror list.
//   - extractor-backend/osm_enrichment.py (Python): same problem, single
//     hardcoded endpoint, no fallback, no shared logic with the TS side at all.
//
// This mirror list MUST stay in sync with OVERPASS_ENDPOINTS in
// src/lib/geo.ts (client-side) and OVERPASS_ENDPOINTS in
// extractor-backend/osm_enrichment.py (Python side) — three runtimes, three
// copies, one logical list. If you add/remove a mirror, update all three.
// ============================================================================

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://z.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];

export interface OverpassResult {
  ok: boolean;
  elements: any[];
  endpointUsed?: string;
  error?: string;
}

/**
 * POST an Overpass QL query, trying each mirror in OVERPASS_ENDPOINTS in turn.
 * Each attempt gets its own timeout; a mirror that times out, errors, or is
 * rate-limited (429) is skipped in favor of the next one. Returns a result
 * object rather than throwing, so callers can decide how to report a total
 * failure (e.g. as one entry in a per-layer status map) instead of the whole
 * request blowing up.
 */
export async function fetchOverpassWithFallback(
  query: string,
  timeoutMs = 15000,
): Promise<OverpassResult> {
  let lastError: string | undefined;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'NakshaBot-Census-HLB/1.0 (India Census 2027)',
        },
        body: 'data=' + encodeURIComponent(query),
      });

      if (r.status === 429) {
        lastError = `${endpoint}: rate-limited (429)`;
        continue; // try next mirror immediately, no point waiting on this one
      }
      if (!r.ok) {
        lastError = `${endpoint}: HTTP ${r.status}`;
        continue;
      }

      const data = await r.json();
      return { ok: true, elements: data.elements || [], endpointUsed: endpoint };
    } catch (err) {
      lastError = `${endpoint}: ${(err as any)?.name === 'AbortError' ? 'timeout' : String(err)}`;
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, elements: [], error: lastError || 'All Overpass mirrors failed' };
}
