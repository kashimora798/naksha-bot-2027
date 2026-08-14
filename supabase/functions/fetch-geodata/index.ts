import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";
import { fetchRoadsLayer, fetchFeaturesLayer } from "../_shared/osm-features.ts";
import { fetchBuildings } from "../_shared/buildings.ts";
import { fetchLandcover } from "../_shared/landcover.ts";

// ============================================================================
// fetch-geodata — the unified gateway for every physical-feature layer.
//
// Replaces three previously-independent network paths per screen:
//   1. Roads: fetched directly from the browser via fetchOverpass()
//   2. Buildings: a separate call to fetch-open-buildings
//   3. Landcover: a separate call to fetch-landcover
// ...each hand-coded per screen (MapWorkspace.tsx and CanvasBlockScreen.tsx
// each had their own copy of the roads query, for example).
//
// One request here, with a `layers` list, fetches whichever of
// roads / features (landuse, water, POIs, named places) / buildings /
// landcover are needed, all in parallel, and reports success/failure PER
// LAYER — a landcover timeout doesn't blank out roads that arrived fine.
//
// fetch-open-buildings and fetch-landcover are kept deployed as their own
// functions too (for backward compatibility / direct use), now both backed
// by the same _shared modules this gateway uses — so there is exactly one
// implementation of each provider's logic, not two.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to production domain before launch
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type Layer = 'roads' | 'features' | 'buildings' | 'landcover';

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } },
    );
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { north, south, east, west, boundary, useGoogle, minConfidence } = body;
    const layers: Layer[] = Array.isArray(body.layers) && body.layers.length
      ? body.layers
      : ['roads', 'features', 'buildings'];

    if ([north, south, east, west].some((v) => typeof v !== 'number')) {
      return new Response(JSON.stringify({ error: 'Missing/invalid bounding box' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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

    const result: Record<string, any> = {};
    const errors: Record<string, string> = {};

    const tasks: Promise<void>[] = [];

    if (layers.includes('roads')) {
      tasks.push((async () => {
        try {
          const r = await fetchRoadsLayer(south, west, north, east);
          if (r.ok) result.roads = { elements: r.elements };
          else errors.roads = r.error || 'Roads fetch failed';
        } catch (err) { errors.roads = String(err); }
      })());
    }

    if (layers.includes('features')) {
      tasks.push((async () => {
        try {
          const r = await fetchFeaturesLayer(south, west, north, east);
          if (r.ok) result.features = { elements: r.elements };
          else errors.features = r.error || 'Features fetch failed';
        } catch (err) { errors.features = String(err); }
      })());
    }

    if (layers.includes('buildings')) {
      tasks.push((async () => {
        try {
          const r = await fetchBuildings(north, south, east, west, poly, !!useGoogle, minConfidence);
          result.buildings = r;
        } catch (err) { errors.buildings = String(err); }
      })());
    }

    if (layers.includes('landcover')) {
      tasks.push((async () => {
        const keyStr = Deno.env.get('EARTH_ENGINE_KEY');
        if (!keyStr) { errors.landcover = 'EARTH_ENGINE_KEY secret is not set'; return; }
        try {
          const credentials = JSON.parse(keyStr);
          const r = await fetchLandcover(north, south, east, west, credentials);
          result.landcover = r;
        } catch (err) { errors.landcover = String(err); }
      })());
    }

    // Every layer runs independently — one slow/failed layer never blocks
    // or blanks out the others. Individual failures are collected in
    // `errors` so the client can offer a per-layer retry instead of
    // treating the whole request as failed.
    await Promise.all(tasks);

    return new Response(JSON.stringify({ ...result, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
