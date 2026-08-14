import ee from "npm:@google/earthengine";

// ============================================================================
// _shared/landcover.ts — Dynamic World land cover (water / farmland / forest),
// factored out of fetch-landcover/index.ts so the new fetch-geodata gateway
// can call the same logic instead of duplicating the Earth Engine query.
// Functionally identical to the original — this is a lift-and-parameterize,
// not a rewrite, since the nested EE expression is easy to get subtly wrong
// and the original is already working in production.
// ============================================================================

let eeInitialized = false;

async function ensureEeInitialized(credentials: any) {
  // Earth Engine's JS SDK keeps global auth/session state — safe to init once
  // per isolate and reuse across requests within the same warm function.
  if (eeInitialized) return;
  await new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(credentials, resolve, reject);
  });
  await new Promise((resolve, reject) => {
    ee.initialize(null, null, resolve, reject);
  });
  eeInitialized = true;
}

export interface LandcoverResult {
  features: any[];
  source: 'dynamic_world';
}

export async function fetchLandcover(
  north: number, south: number, east: number, west: number,
  credentials: any,
): Promise<LandcoverResult> {
  await ensureEeInitialized(credentials);

  const region = ee.Geometry.Rectangle([west, south, east, north]);

  const dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
    .filterBounds(region)
    .filterDate('2025-01-01', '2026-01-01')
    .select('label')
    .mode();

  const water_mask = dw.eq(0);
  const farm_mask = dw.eq(4);
  const tree_mask = dw.eq(1);

  const mask_to_vectors = (mask: any, class_name: string) => {
    const vectors = mask.selfMask().reduceToVectors({
      geometry: region,
      scale: 10,
      maxPixels: 1e8,
      geometryType: 'polygon',
      eightConnected: false,
      labelProperty: 'class',
    });
    return vectors.map((f: any) => f.set('landuse_type', class_name));
  };

  const water_vectors = mask_to_vectors(water_mask, 'water');
  const farm_vectors = mask_to_vectors(farm_mask, 'farmland');
  const tree_vectors = mask_to_vectors(tree_mask, 'forest');

  const combined = water_vectors.merge(farm_vectors).merge(tree_vectors);

  const geojson: any = await new Promise((resolve, reject) => {
    combined.evaluate((result: any, error: any) => {
      if (error) reject(error);
      else resolve(result);
    });
  });

  return { features: geojson.features || [], source: 'dynamic_world' };
}
