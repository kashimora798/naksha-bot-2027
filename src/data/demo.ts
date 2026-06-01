import type { Coordinate } from '../types';

// ── Curated demo content for the guided tour ────────────────────────────────
// A real block in the New Delhi / Noida belt with dense roads + buildings, so
// the tour's auto road-fetch and building-detection always return data.

export const DEMO_BOUNDARY: Coordinate[] = [
  { lat: 28.57124652002394, lng: 77.41150259971619 },
  { lat: 28.56974836181537, lng: 77.41181373596193 },
  { lat: 28.57070002453253, lng: 77.41753220558168 },
  { lat: 28.571934346521527, lng: 77.42218852043153 },
  { lat: 28.572273546974372, lng: 77.42256402969362 },
  { lat: 28.572989633227895, lng: 77.42205977439882 },
  { lat: 28.573451317833424, lng: 77.42114782333375 },
  { lat: 28.573988376968117, lng: 77.42071866989137 },
  { lat: 28.5750059551782, lng: 77.41961359977724 },
  { lat: 28.574487745282646, lng: 77.41846561431886 },
  { lat: 28.574751561548442, lng: 77.41681337356569 },
  { lat: 28.574883469433257, lng: 77.41547226905824 },
  { lat: 28.57472329555162, lng: 77.4151933193207 },
  { lat: 28.57242430238014, lng: 77.4132513999939 },
  { lat: 28.57142554379179, lng: 77.41165280342103 },
];

// Centroid of the boundary above — the demo map opens (and the HLB pin sits) here.
export const DEMO_CENTER: Coordinate = (() => {
  const n = DEMO_BOUNDARY.length;
  const sum = DEMO_BOUNDARY.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / n, lng: sum.lng / n };
})();

export const DEMO_HLB_NUMBER = '0231';
export const DEMO_DISTRICT = 'New Delhi';
export const DEMO_STATE = 'Delhi';

// Pre-baked AI survey map for the demo — avoids hitting the AI API on every run.
export const DEMO_AI_IMAGE_URL = 'https://access.vheer.com/results/NHkzh0xq_1780294046688.jpg';
