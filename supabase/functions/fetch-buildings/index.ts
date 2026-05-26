import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as turf from "https://esm.sh/@turf/turf@6.5.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function latLngToQuadkey(lat: number, lng: number, zoom: number): string {
  let x = Math.floor(((lng + 180) / 360) * Math.pow(2, zoom));
  let y = Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
  let quadkey = '';
  for (let i = zoom; i > 0; i--) {
    let digit = 0;
    const mask = 1 << (i - 1);
    if ((x & mask) !== 0) digit += 1;
    if ((y & mask) !== 0) digit += 2;
    quadkey += digit.toString();
  }
  return quadkey;
}

function getBoundingBoxQuadkeys(north: number, south: number, east: number, west: number, zoom = 9): string[] {
  const nwKey = latLngToQuadkey(north, west, zoom);
  const neKey = latLngToQuadkey(north, east, zoom);
  const swKey = latLngToQuadkey(south, west, zoom);
  const seKey = latLngToQuadkey(south, east, zoom);
  return [...new Set([nwKey, neKey, swKey, seKey])];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { north, south, east, west } = await req.json();

    if (!north || !south || !east || !west) {
      return new Response(JSON.stringify({ error: 'Missing bounding box coordinates' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const quadkeys = getBoundingBoxQuadkeys(north, south, east, west, 9);
    const blockPolygon = turf.bboxPolygon([west, south, east, north]);
    
    let buildings: any[] = [];

    for (const qk of quadkeys) {
      const url = `https://minedbuildings.z5.web.core.windows.net/global-buildings/${qk}.geojson.gz`;
      try {
        const response = await fetch(url);
        if (!response.ok) {
          continue; 
        }
        
        const ds = new DecompressionStream("gzip");
        const decompressedStream = response.body?.pipeThrough(ds);
        
        if (!decompressedStream) continue;
        
        const reader = decompressedStream.getReader();
        let chunks: Uint8Array[] = [];
        let totalLength = 0;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            totalLength += value.length;
          }
        }
        
        const concatenated = new Uint8Array(totalLength);
        let position = 0;
        for (const chunk of chunks) {
          concatenated.set(chunk, position);
          position += chunk.length;
        }
        
        const textDecoder = new TextDecoder();
        const jsonText = textDecoder.decode(concatenated);
        
        let features = [];
        try {
          // Attempt FeatureCollection
          const geojson = JSON.parse(jsonText);
          if (geojson.type === 'FeatureCollection' && Array.isArray(geojson.features)) {
            features = geojson.features;
          } else {
            throw new Error("Not a FeatureCollection");
          }
        } catch (e) {
          // Fallback to JSONL
          const lines = jsonText.trim().split('\n');
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              features.push(JSON.parse(line));
            } catch (err) {}
          }
        }
        
        for (const feature of features) {
          if (!feature.geometry || feature.geometry.type !== 'Polygon') continue;
          
          try {
            const geom = turf.feature(feature.geometry);
            if (turf.booleanIntersects(geom, blockPolygon)) {
              const centroid = turf.centroid(geom);
              const area = turf.area(geom);
              
              buildings.push({
                lat: centroid.geometry.coordinates[1],
                lng: centroid.geometry.coordinates[0],
                polygon: feature.geometry,
                area_sqm: area
              });
            }
          } catch (e) {}
        }
      } catch (err) {
        console.error(`Error processing quadkey ${qk}:`, err);
      }
    }

    return new Response(JSON.stringify({ buildings, count: buildings.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
