import type { Coordinate } from '../types';

export function pixelsToLatLng(
  x: number,
  y: number,
  tileWidth: number,
  tileHeight: number,
  bounds: { north: number; south: number; east: number; west: number }
): Coordinate {
  // x goes from 0 (west) to tileWidth (east)
  // y goes from 0 (north) to tileHeight (south)
  
  const lng = bounds.west + (x / tileWidth) * (bounds.east - bounds.west);
  const lat = bounds.north - (y / tileHeight) * (bounds.north - bounds.south);
  
  return { lat, lng };
}

// Distance between two coords in meters
function getDistanceMeters(coord1: Coordinate, coord2: Coordinate) {
  const R = 6371e3; // metres
  const φ1 = (coord1.lat * Math.PI) / 180; // φ, λ in radians
  const φ2 = (coord2.lat * Math.PI) / 180;
  const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in metres
}

export function generateHouseGrid(
  cluster: { x1: number; y1: number; x2: number; y2: number; orientation_degrees: number; estimated_house_count: number },
  tileWidth: number,
  tileHeight: number,
  bounds: { north: number; south: number; east: number; west: number }
): Coordinate[] {
  const houses: Coordinate[] = [];
  const count = Math.max(1, cluster.estimated_house_count);
  
  // Calculate center of cluster in pixels
  const cx = (cluster.x1 + cluster.x2) / 2;
  const cy = (cluster.y1 + cluster.y2) / 2;
  
  // Box dimensions in pixels
  const w = Math.abs(cluster.x2 - cluster.x1);
  const h = Math.abs(cluster.y2 - cluster.y1);
  
  // Determine grid dimensions (rows and cols) to fit 'count' houses
  // Assume houses are roughly square or slightly rectangular
  const ratio = w / (h || 1);
  let cols = Math.round(Math.sqrt(count * ratio));
  let rows = Math.round(count / (cols || 1));
  if (cols < 1) cols = 1;
  if (rows < 1) rows = 1;
  
  // Spacing between houses in pixels
  const dx = w / cols;
  const dy = h / rows;
  
  const rad = (cluster.orientation_degrees * Math.PI) / 180;
  const cosT = Math.cos(rad);
  const sinT = Math.sin(rad);

  let placed = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (placed >= count) break;
      
      // Calculate unrotated offset from center
      const offsetX = (c + 0.5) * dx - (w / 2);
      const offsetY = (r + 0.5) * dy - (h / 2);
      
      // Rotate offset
      const rotX = offsetX * cosT - offsetY * sinT;
      const rotY = offsetX * sinT + offsetY * cosT;
      
      // Final pixel pos
      const px = cx + rotX;
      const py = cy + rotY;
      
      houses.push(pixelsToLatLng(px, py, tileWidth, tileHeight, bounds));
      placed++;
    }
  }
  
  return houses;
}
