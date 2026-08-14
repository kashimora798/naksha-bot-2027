import { fetchOverpassWithFallback } from "./overpass.ts";

// ============================================================================
// _shared/osm-features.ts — roads and "everything else" (landuse, water,
// POIs, named places) queries for the fetch-geodata gateway.
//
// These two query strings were previously hand-copied into MapWorkspace.tsx
// AND CanvasBlockScreen.tsx (roads query, byte-identical in both, with only
// the timeout differing — 10s vs 8s) plus buildComprehensiveQuery() in
// src/lib/geo.ts (features query). Client-side callers still use those
// client versions via fetchOverpass() in src/lib/geo.ts for now — this
// module gives the SERVER an equally resilient path so the gateway can run
// the same queries with retry/mirror-fallback, in one round trip alongside
// buildings and landcover, instead of the client making 3 separate calls.
//
// IMPORTANT: the features query mirrors buildComprehensiveQuery() in
// src/lib/geo.ts. If one changes, update the other — see that file's comment.
// ============================================================================

export function buildRoadsQuery(south: number, west: number, north: number, east: number, pad = 0.003): string {
  const s = south - pad, w = west - pad, n = north + pad, e = east + pad;
  return `[out:json][timeout:30][bbox:${s},${w},${n},${e}];
    (
      way["highway"];
      way["highway"~"footway|path|track|steps|cycleway|pedestrian|living_street"];
      way["footway"="crossing"];
      way["path"];
      way["track"];
    );
    out geom;`;
}

export function buildFeaturesQuery(south: number, west: number, north: number, east: number, pad = 0.002): string {
  const s = south - pad, w = west - pad, n = north + pad, e = east + pad;
  return `[out:json][timeout:30][bbox:${s},${w},${n},${e}];
(
  way["building"];way["highway"];
  way["landuse"~"farmland|agriculture|forest|meadow|orchard|vineyard|plant_nursery|greenhouse_horticulture"];
  way["natural"~"water|wood|wetland|scrub|heath|grassland|bay|beach|shingle"];
  way["waterway"~"river|stream|canal|drain|ditch"];
  way["leisure"~"park|garden|playground|pitch|swimming_pool"];
  way["amenity"~"school|hospital|clinic|place_of_worship|post_office|pharmacy|police|fire_station|community_centre|marketplace|bus_station|parking|fuel|bank"];
  node["amenity"~"school|hospital|clinic|place_of_worship|post_office|water_well|pharmacy|bank|police|atm|bus_station|fuel|parking|marketplace|community_centre"];
  node["place"];
  node["natural"~"spring|water|tree|cave_entrance|peak"];
  node["man_made"~"water_well|water_tower|tower|monitoring_station|pumping_station"];
  way["tourism"~"hotel|guest_house|hostel|museum|attraction|viewpoint|information"];
  node["tourism"~"hotel|guest_house|museum|attraction|viewpoint|information|guest_house"];
  node["shop"~"supermarket|convenience|general|bakery|butcher|clothes"];
  way["shop"~"supermarket|mall"];
  way["historic"];node["historic"];
  node["name"];
  way["name"]["building"];
  way["name"]["amenity"];
  way["name"]["leisure"];
  way["name"]["tourism"];
  way["name"]["shop"];
);
out geom;`;
}

export interface OsmLayerResult {
  elements: any[];
  ok: boolean;
  error?: string;
}

export async function fetchRoadsLayer(south: number, west: number, north: number, east: number): Promise<OsmLayerResult> {
  const result = await fetchOverpassWithFallback(buildRoadsQuery(south, west, north, east), 15000);
  return { elements: result.elements, ok: result.ok, error: result.error };
}

export async function fetchFeaturesLayer(south: number, west: number, north: number, east: number): Promise<OsmLayerResult> {
  const result = await fetchOverpassWithFallback(buildFeaturesQuery(south, west, north, east), 20000);
  return { elements: result.elements, ok: result.ok, error: result.error };
}
