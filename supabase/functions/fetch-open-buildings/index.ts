import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";
import { fetchBuildings } from "../_shared/buildings.ts";

// ============================================================================
// fetch-open-buildings — building footprints for an HLB bbox, free, no API key.
//
// Kept as a standalone endpoint for backward compatibility (anything calling
// it directly keeps working). The actual MS + OSM + Google waterfall and
// cross-source merge logic now live in ../_shared/buildings.ts, shared with
// the fetch-geodata gateway — this file is just auth + request parsing.
//
//   • Microsoft Global Building Footprints  (z9 quadkey .geojson.gz tiles)
//   • OpenStreetMap buildings via Overpass   (mirror-fallback guarded)
//   • Google Open Buildings V3 (optional)    (CSV by S2 token, if reachable)
//
// Returns { buildings:[{lat,lng,area_sqm,source,polygon?}], count, sources:{...} }
// Always 200 with a per-source breakdown so the client can show WHY it was empty.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to production domain before launch
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { north, south, east, west, boundary, useGoogle, minConfidence } = await req.json();
    if ([north, south, east, west].some(v => typeof v !== 'number')) {
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

    const { buildings, count, sources } = await fetchBuildings(north, south, east, west, poly, !!useGoogle, minConfidence);

    return new Response(JSON.stringify({ buildings, count, sources }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
