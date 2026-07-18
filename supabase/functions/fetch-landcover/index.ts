import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ee from "npm:@google/earthengine";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to production domain before launch
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate: forward caller's JWT through Supabase client
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

    const { north, south, east, west } = await req.json();

    if (!north || !south || !east || !west) {
      return new Response(JSON.stringify({ error: 'Missing bounding box coordinates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const keyStr = Deno.env.get("EARTH_ENGINE_KEY");
    if (!keyStr) {
      return new Response(JSON.stringify({ error: 'EARTH_ENGINE_KEY secret is not set' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const credentials = JSON.parse(keyStr);

    await new Promise((resolve, reject) => {
      ee.data.authenticateViaPrivateKey(credentials, resolve, reject);
    });

    await new Promise((resolve, reject) => {
      ee.initialize(null, null, resolve, reject);
    });

    // Define the area
    const region = ee.Geometry.Rectangle([west, south, east, north]);

    // Get Dynamic World classification
    const dw = ee.ImageCollection('GOOGLE/DYNAMICWORLD/V1')
        .filterBounds(region)
        .filterDate('2025-01-01', '2026-01-01')
        .select('label')
        .mode(); // Most common classification per pixel

    // Convert to vector polygons
    const water_mask = dw.eq(0);
    const farm_mask = dw.eq(4);
    const tree_mask = dw.eq(1);

    const mask_to_vectors = (mask: any, class_name: string) => {
        const vectors = mask.selfMask()
            .reduceToVectors({
                geometry: region,
                scale: 10,
                maxPixels: 1e8,
                geometryType: 'polygon',
                eightConnected: false,
                labelProperty: 'class'
            });
        return vectors.map((f: any) => f.set('landuse_type', class_name));
    };

    const water_vectors = mask_to_vectors(water_mask, 'water');
    const farm_vectors = mask_to_vectors(farm_mask, 'farmland');
    const tree_vectors = mask_to_vectors(tree_mask, 'forest');

    const combined = water_vectors.merge(farm_vectors).merge(tree_vectors);

    // Get as GeoJSON
    // In JS SDK, evaluate() is used to get the data asynchronously
    const geojson: any = await new Promise((resolve, reject) => {
      combined.evaluate((result: any, error: any) => {
        if (error) reject(error);
        else resolve(result);
      });
    });

    return new Response(JSON.stringify({ features: geojson.features, source: 'dynamic_world' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
