import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchLandcover } from "../_shared/landcover.ts";

// ============================================================================
// fetch-landcover — Dynamic World land cover (water / farmland / forest).
//
// Kept as a standalone endpoint for backward compatibility. The actual Earth
// Engine query now lives in ../_shared/landcover.ts, shared with the
// fetch-geodata gateway — this file is just auth + request parsing.
// ============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: restrict to production domain before launch
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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

    const { features, source } = await fetchLandcover(north, south, east, west, credentials);

    return new Response(JSON.stringify({ features, source }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
