import { describe, it, expect } from 'vitest';

// Mirror of mergeAcrossSources in supabase/functions/fetch-open-buildings/index.ts.
// Cluster-based conflation: each cluster holds at most one building per source,
// so same-source neighbours are never collapsed.
type B = { lat: number; lng: number; source: string };
function mergeAcrossSources(groups: B[][]): B[] {
  const pref: Record<string, number> = { osm: 0, google: 1, microsoft: 2 };
  const all = groups.flat().sort((a, b) => (pref[a.source] ?? 9) - (pref[b.source] ?? 9));
  const near = 3.6e-5; // ~4 m
  const clusters: { lat: number; lng: number; sources: Set<string>; rep: B }[] = [];
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

describe('mergeAcrossSources', () => {
  it('keeps every building when sources do not overlap', () => {
    const ms: B[] = [{ lat: 26.0, lng: 80.0, source: 'microsoft' }];
    const osm: B[] = [{ lat: 26.01, lng: 80.01, source: 'osm' }];
    expect(mergeAcrossSources([ms, osm]).length).toBe(2);
  });

  it('drops the MS building when an OSM one is within ~4 m (cross-source dup)', () => {
    const ms: B[] = [{ lat: 26.0, lng: 80.0, source: 'microsoft' }];
    const osm: B[] = [{ lat: 26.0 + 1e-5, lng: 80.0, source: 'osm' }]; // ~1 m away
    const merged = mergeAcrossSources([ms, osm]);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('osm'); // OSM preferred, kept
  });

  it('NEVER dedupes neighbours within the same source (dense rows preserved)', () => {
    // Two Microsoft buildings ~1 m apart — both must survive.
    const ms: B[] = [
      { lat: 26.0, lng: 80.0, source: 'microsoft' },
      { lat: 26.0 + 1e-5, lng: 80.0, source: 'microsoft' },
    ];
    expect(mergeAcrossSources([ms, []]).length).toBe(2);
  });

  it('prefers OSM, then Google, then Microsoft for an overlapping triple', () => {
    const p = { lat: 26.0, lng: 80.0 };
    const ms: B[] = [{ ...p, source: 'microsoft' }];
    const osm: B[] = [{ ...p, source: 'osm' }];
    const google: B[] = [{ ...p, source: 'google' }];
    const merged = mergeAcrossSources([ms, osm, google]);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('osm');
  });

  it('keeps a dense same-source cluster even when another source overlaps one of them', () => {
    const ms: B[] = [
      { lat: 26.0, lng: 80.0, source: 'microsoft' },
      { lat: 26.0 + 1e-5, lng: 80.0, source: 'microsoft' },
      { lat: 26.0 + 2e-5, lng: 80.0, source: 'microsoft' },
    ];
    const osm: B[] = [{ lat: 26.0, lng: 80.0, source: 'osm' }]; // overlaps first MS
    const merged = mergeAcrossSources([ms, osm]);
    // OSM one kept, first MS dropped as cross-source dup, other two MS survive → 3
    expect(merged.length).toBe(3);
    expect(merged.filter(b => b.source === 'osm').length).toBe(1);
    expect(merged.filter(b => b.source === 'microsoft').length).toBe(2);
  });
});
