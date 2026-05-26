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

// ── Perpendicular distance of P from line AB (meters) ──────────
function perpendicularDistM(
  P: { lat: number; lng: number },
  A: { lat: number; lng: number },
  B: { lat: number; lng: number }
): number {
  const avgLat = (A.lat + B.lat + P.lat) / 3;
  const mLat = 111320;
  const mLng = 111320 * Math.cos(avgLat * Math.PI / 180);

  const bx = (B.lng - A.lng) * mLng, by = (B.lat - A.lat) * mLat;
  const px = (P.lng - A.lng) * mLng, py = (P.lat - A.lat) * mLat;

  const abLen = Math.sqrt(bx * bx + by * by);
  if (abLen < 0.001) return Math.sqrt(px * px + py * py);

  return Math.abs(bx * py - by * px) / abLen;
}

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
 * Ramer-Douglas-Peucker line simplification.
 *
 * Removes intermediate points that lie within `tolerance` meters
 * of the simplified line → straight roads become truly straight.
 * Points where actual turns happen have high perpendicular distance
 * and are ALWAYS preserved.
 */
function rdpSimplify(
  points: { lat: number; lng: number }[],
  tolerance: number
): { lat: number; lng: number }[] {
  if (points.length < 3) return [...points];

  const start = points[0];
  const end = points[points.length - 1];

  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistM(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    // Split at the turn point and recurse both halves
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance);
    const right = rdpSimplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  }

  // All points within tolerance → collapse to a straight line
  return [start, end];
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
  rdpTolerance = 1.5
): { lat: number; lng: number }[] {
  if (points.length < 3) return [...points];

  // Step 1 — Simplify (removes wobble, keeps turns)
  const simplified = rdpSimplify(points, rdpTolerance);

  // Step 2 — Smooth (rounds turn vertices into curves)
  const smoothed = chaikinSmooth(simplified, 2, 8);

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
