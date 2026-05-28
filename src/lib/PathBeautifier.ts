/**
 * Path Beautification Utility
 * 
 * Transforms raw GPS path points into clean, map-quality lines:
 * - Straight roads become perfectly straight lines
 * - Curves are smooth and natural (Chaikin corner-cutting)
 * - Turns are preserved — both small gully turns and big road turns
 * - GPS noise/wobble is eliminated (Ramer-Douglas-Peucker)
 * 
 * Applied at RENDER time only — raw data is never modified.
 */

import simplify from 'simplify-js';

// ── Bearing (degrees 0-360) ─────────────────────────────────────
function bearingDeg(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
}

// ── Signed angle difference (-180 to 180) ───────────────────────
function angleDiff(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/**
 * Chaikin's corner-cutting algorithm.
 *
 * Rounds sharp turn angles into natural-looking curves while
 * leaving straight segments untouched.  Each iteration replaces
 * a corner with two quarter-points:
 *   Q = ¾·P₀ + ¼·P₁
 *   R = ¼·P₀ + ¾·P₁
 *
 * @param points Input polyline
 * @param iterations Number of smoothing passes (2 = good curves)
 * @param straightThreshold Angle below which segment is "straight" (skip subdivision)
 */
function chaikinSmooth(
  points: { lat: number; lng: number }[],
  iterations = 2,
  straightThreshold = 8
): { lat: number; lng: number }[] {
  if (points.length < 3 || iterations <= 0) return points;

  let result = [...points];

  for (let iter = 0; iter < iterations; iter++) {
    const out: { lat: number; lng: number }[] = [result[0]];

    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];

      // For interior vertices, check whether the angle warrants smoothing
      if (i > 0) {
        const prevB = bearingDeg(result[i - 1], p0);
        const nextB = bearingDeg(p0, p1);
        const angle = Math.abs(angleDiff(prevB, nextB));

        if (angle < straightThreshold) {
          // Nearly straight → keep original vertex, no subdivision
          out.push(p0);
          continue;
        }
      }

      // Chaikin quarter-points
      out.push({
        lat: 0.75 * p0.lat + 0.25 * p1.lat,
        lng: 0.75 * p0.lng + 0.25 * p1.lng,
      });
      out.push({
        lat: 0.25 * p0.lat + 0.75 * p1.lat,
        lng: 0.25 * p0.lng + 0.75 * p1.lng,
      });
    }

    out.push(result[result.length - 1]);
    result = out;
  }

  return result;
}

/**
 * Main beautification pipeline (pure function — no side effects).
 *
 * 1. **RDP** removes GPS noise → straight segments become straight
 * 2. **Chaikin** rounds remaining angles → natural curves at turns
 * 3. First/last points are pinned to originals (no drift)
 *
 * @param points Raw path points (from GPS / Kalman filter)
 * @param rdpTolerance Simplification tolerance in meters (default 1.5 m)
 */
export function beautifyPath(
  points: { lat: number; lng: number }[],
  rdpTolerance = 2.5
): { lat: number; lng: number }[] {
  if (points.length < 3) return [...points];

  // Step 1 — Simplify (removes wobble, keeps turns) using simplify-js
  const tolerance = rdpTolerance * 0.000009; // approx 1 meter in degrees
  const simplifiedPts = simplify(
    points.map(p => ({ x: p.lng, y: p.lat })),
    tolerance,
    true
  );
  const simplified = simplifiedPts.map(p => ({ lat: p.y, lng: p.x }));

  // Step 2 — Smooth (rounds turn vertices into curves)
  const smoothed = chaikinSmooth(simplified, 3, 12);

  // Step 3 — Pin endpoints exactly
  if (smoothed.length > 0) {
    smoothed[0] = { lat: points[0].lat, lng: points[0].lng };
    smoothed[smoothed.length - 1] = {
      lat: points[points.length - 1].lat,
      lng: points[points.length - 1].lng,
    };
  }

  return smoothed;
}
