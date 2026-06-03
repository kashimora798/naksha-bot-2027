import * as turf from '@turf/turf';
import { idbStore, SurveySymbol, SurveyPoint, RoadSegment } from './idb';
import { serpentineNumbering, snapRoadsToOSM } from './geo';
import type { Coordinate } from '../types';

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // metres
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type SurveyState = 'SETUP' | 'PREPARING' | 'READY' | 'RECORDING' | 'PAUSED' | 'REVIEWING' | 'COMPLETED';

/** Map the engine's fine-grained state to the 3-value persisted session state. */
function toPersistedState(s: SurveyState): 'active' | 'completed' | 'paused' {
  if (s === 'COMPLETED') return 'completed';
  if (s === 'PAUSED') return 'paused';
  return 'active';
}

export class LiveSurveyEngine {
  blockPolygon: any;
  supabase: any;
  idb: typeof idbStore;
  rawPoints: SurveyPoint[] = [];
  smoothedPath: SurveyPoint[] = [];
  roadSegments: RoadSegment[] = [];
  currentSegment: { type: string, points: SurveyPoint[] } = { type: 'residential', points: [] };
  symbols: SurveySymbol[] = [];
  drawnFeatures: any = { blocks: [], farmlandBlocks: [], forests: [], waterBodies: [], landuseAreas: [], landmarks: [] };
  sessionId: string;
  startTime: number | null = null;
  state: SurveyState = 'READY';
  bearingBuffer: SurveyPoint[] = [];
  
  kalman = {
    lat: { x: 0, p: 1, q: 0.0005, r: 0.0005 },
    lng: { x: 0, p: 1, q: 0.0005, r: 0.0005 }
  };

  watchId: number | null = null;
  wakeLock: any = null;
  listeners: { [event: string]: Function[] } = {};

  // OSM road snap integration
  osmRoadLines: { coords: {lat: number, lng: number}[], highway: string, name?: string }[] = [];
  onOsmRoad = false;
  currentOsmRoad: { highway: string, name?: string } | null = null;

  // Return path detection
  returnDetectedFlag = false;
  returnMode: 'none' | 'two_lane' | 'follow_back' = 'none';

  snapToRoadsEnabled = true;
  snapBuffer: SurveyPoint[] = [];
  snapInterval: any = null;
  recentPointsBuffer: SurveyPoint[] = [];

  constructor(blockPolygon: any, supabaseClient: any, idbService: typeof idbStore, existingSessionId?: string) {
    this.blockPolygon = blockPolygon;
    this.supabase = supabaseClient;
    this.idb = idbService;
    this.sessionId = existingSessionId || crypto.randomUUID();
  }

  setSnapToRoadsEnabled(enabled: boolean) {
    this.snapToRoadsEnabled = enabled;
    if (!enabled && this.snapInterval) {
      clearInterval(this.snapInterval);
      this.snapInterval = null;
    } else if (enabled && !this.snapInterval && this.state === 'RECORDING') {
      this.startSnapInterval();
    }
  }

  async loadSessionData() {
    const session = await this.idb.getSession(this.sessionId);
    if (session) {
      // Persisted state is the 3-value enum; resume into the matching engine state.
      // An 'active' session that was interrupted resumes PAUSED so the user explicitly restarts recording.
      this.state = session.state === 'completed' ? 'COMPLETED'
                 : session.state === 'paused' ? 'PAUSED'
                 : 'PAUSED';
      this.startTime = session.startTime || Date.now();
      if (session.polygon_geojson) {
        try { this.blockPolygon = JSON.parse(session.polygon_geojson); } catch(e){}
      }
    }
    
    const syms = await this.idb.getSymbolsForSession(this.sessionId);
    this.symbols = syms;
    
    const pts = await this.idb.getPointsForSession(this.sessionId);
    this.rawPoints = pts;
    this.smoothedPath = pts;
    
    const rds = await this.idb.getSegmentsForSession(this.sessionId);
    this.roadSegments = rds;
    
    this.emit('symbolsUpdated', this.symbols);
  }

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  off(event: string, callback?: Function) {
    if (!this.listeners[event]) return;
    if (callback) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    } else {
      delete this.listeners[event];
    }
  }

  emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
  }

  destroy() {
    // Clean up GPS watcher
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    // Clean up snap interval
    if (this.snapInterval) {
      clearInterval(this.snapInterval);
      this.snapInterval = null;
    }
    // Release wake lock
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
    // Clear all listeners
    this.listeners = {};
  }

  async startSurvey() {
    this.state = 'RECORDING';
    this.startTime = Date.now();
    
    await this.idb.setSession({
      session_id: this.sessionId,
      state: 'active',
      startTime: this.startTime,
      hlb_number: this.blockPolygon.properties?.hlb_number || 'unknown',
      created_at: new Date().toISOString()
    });
    
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.handlePosition(pos),
      err => this.handleGPSError(err),
      {
        enableHighAccuracy: true,
        // Allow a fix up to 2s old so a brief signal dip doesn't fire a TIMEOUT,
        // and give low-end field devices longer to acquire under tree cover.
        maximumAge: 2000,
        timeout: 15000
      }
    );
    
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        console.warn('Wake lock failed', e);
      }
    }
    if (this.snapToRoadsEnabled) {
      this.startSnapInterval();
    }
    this.emit('stateChanged', this.state);
  }

  pauseSurvey() {
    if (this.state !== 'RECORDING') return;
    this.state = 'PAUSED';
    
    if (this.currentSegment.points.length >= 2) {
      this.roadSegments.push({ 
        segment_id: crypto.randomUUID(),
        session_id: this.sessionId,
        road_type: this.currentSegment.type,
        type: this.currentSegment.type,
        points: [...this.currentSegment.points]
      });
      this.currentSegment = {
        type: this.currentSegment.type,
        points: []
      };
    }
    
    this.saveToIDB();
    this.emit('stateChanged', this.state);
    
    if (this.snapInterval) {
      clearInterval(this.snapInterval);
      this.snapInterval = null;
    }
  }

  resumeSurvey() {
    if (this.state !== 'PAUSED') return;
    this.state = 'RECORDING';
    
    // Seed the new segment with the last known point to keep the road continuous
    if (this.currentSegment.points.length === 0 && this.smoothedPath.length > 0) {
      this.currentSegment.points.push(this.smoothedPath[this.smoothedPath.length - 1]);
    }

    this.emit('stateChanged', this.state);
    if (this.snapToRoadsEnabled) {
      this.startSnapInterval();
    }
  }

  async endSurvey() {
    if (this.currentSegment.points.length >= 2) {
      this.roadSegments.push({
        segment_id: crypto.randomUUID(),
        session_id: this.sessionId,
        road_type: this.currentSegment.type,
        type: this.currentSegment.type,
        points: [...this.currentSegment.points]
      });
    }
    
    this.state = 'REVIEWING';
    this.emit('stateChanged', this.state);
    
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }
    
    if (this.wakeLock) {
      await this.wakeLock.release().catch(console.error);
    }
    
    // Convert to compatible type for numbering
    this.symbols = serpentineNumbering(this.symbols as any) as any;
    
    if (this.snapToRoadsEnabled) {
      this.roadSegments = await snapRoadsToOSM(this.roadSegments, this.blockPolygon) as any;
    }
    
    await this.saveToIDB();
    await this.syncToSupabase();
    
    return this.generateSurveyResult();
  }

  handleGPSError(err: GeolocationPositionError) {
    console.error("GPS Error", err);
    this.emit('gpsError', err);
  }

  handleVehicleDetected() {
    this.emit('vehicleDetected');
    this.pauseSurvey();
  }

  handlePosition(pos: GeolocationPosition) {
    const raw: SurveyPoint = {
      point_id: crypto.randomUUID(),
      session_id: this.sessionId,
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      speed: pos.coords.speed || 0,
      heading: pos.coords.heading,
      timestamp: pos.timestamp
    };

    const smoothed = this.kalmanFilter(raw);

    // Always update bearing buffer for compass
    this.bearingBuffer.push(smoothed);
    if (this.bearingBuffer.length > 5) this.bearingBuffer.shift();

    // Always check boundary
    const pt = turf.point([smoothed.lng, smoothed.lat]);
    let inside = true;
    if (this.blockPolygon?.geometry) {
      try {
        const poly = turf.polygon(this.blockPolygon.geometry.coordinates);
        inside = turf.booleanPointInPolygon(pt, poly);
      } catch (e) { /* ignore */ }
    }

    // Update recent points buffer for stationary detection
    this.recentPointsBuffer.push(smoothed);
    if (this.recentPointsBuffer.length > 5) this.recentPointsBuffer.shift();

    let isPathPoint = false;
    let emitPosition: SurveyPoint = smoothed;

    // Movement Classification
    const classifyMovement = (p: SurveyPoint): 'vehicle' | 'bicycle' | 'fast_walk' | 'poor_gps' | 'walking' | 'unknown' => {
      if (p.speed === null || p.speed === undefined) return 'unknown';
      if (p.speed > 8.3) return 'vehicle';     // >30 km/h
      if (p.speed > 4.2) return 'bicycle';     // >15 km/h
      if (p.speed > 2.0) return 'fast_walk';   // >7 km/h
      if (p.accuracy > 20) return 'poor_gps';
      return 'walking';
    };

    const movementType = classifyMovement(raw);

    // Vehicle detection - warn instead of auto-pause (too many false positives from GPS glitches, bicycles, running)
    if (movementType === 'vehicle' && this.state === 'RECORDING') {
      this.emit('speedWarning', { speed: raw.speed, message: 'High speed detected. Are you in a vehicle? Pause survey if needed.' });
      // Don't auto-pause - let enumerator decide
      // this.handleVehicleDetected();
      // return;
    }

    // Stationary detection filter (Thick overlapping lines fix)
    const isStationary = (recent: SurveyPoint[], threshold = 1.0) => {
      if (recent.length < 5) return false;
      const center = {
        lat: recent.reduce((s, p) => s + p.lat, 0) / 5,
        lng: recent.reduce((s, p) => s + p.lng, 0) / 5
      };
      const maxDeviation = Math.max(...recent.map(p => 
        turf.distance(
          turf.point([center.lng, center.lat]),
          turf.point([p.lng, p.lat]),
          { units: 'meters' }
        )
      ));
      return maxDeviation < threshold;
    };

    if (isStationary(this.recentPointsBuffer)) {
      // Update position but do not record path
      this.emit('positionUpdate', {
        position: emitPosition,
        accuracy: raw.accuracy,
        insideBoundary: inside,
        bearing: this.getSmoothedBearing(),
        pathLength: this.smoothedPath.length,
        isPathPoint: false
      });
      return;
    }

    const canRecord = this.state === 'RECORDING' && this.returnMode !== 'follow_back';
    // Relaxed threshold for Indian field conditions (urban canyons, tree cover, narrow gullies)
    // 50m is realistic for 2G/3G GPS in rural India; 20m was too strict and caused constant recording failures
    const passesQuality = raw.accuracy <= 50;

    // Warn if accuracy is degraded but still acceptable
    if (raw.accuracy > 30 && raw.accuracy <= 50) {
      this.emit('accuracyWarning', { accuracy: raw.accuracy, message: 'GPS accuracy is reduced. Move to open area for better signal.' });
    } else if (raw.accuracy > 50) {
      this.emit('accuracyWarning', { accuracy: raw.accuracy, message: 'GPS accuracy is poor. Path recording paused until signal improves.' });
    }

    if (canRecord && passesQuality && (movementType === 'walking' || movementType === 'fast_walk' || movementType === 'unknown')) {
      let addToPath = true;

      if (this.smoothedPath.length > 0) {
        const last = this.smoothedPath[this.smoothedPath.length - 1];
        const dist = haversineDistance(last.lat, last.lng, smoothed.lat, smoothed.lng);
        // Reduced from 2m → 0.8m so path keeps up with walking pace
        if (dist < 0.8) addToPath = false;
      }

      if (addToPath) {
        let finalPoint: SurveyPoint = { ...smoothed };

        // OSM road proximity check & snap
        if (this.snapToRoadsEnabled && this.osmRoadLines.length > 0) {
          const osmCheck = this.checkOsmRoadProximity(smoothed);
          if (osmCheck.onRoad) {
            if (!this.onOsmRoad) {
              this.onOsmRoad = true;
              this.currentOsmRoad = osmCheck.road;
              this.emit('osmRoadEntered', { road: osmCheck.road });
            }
            if (osmCheck.snappedPoint) {
              finalPoint = { ...finalPoint, lat: osmCheck.snappedPoint.lat, lng: osmCheck.snappedPoint.lng };
            }
          } else if (this.onOsmRoad) {
            this.onOsmRoad = false;
            this.currentOsmRoad = null;
            this.emit('osmRoadLeft');
          }
        }

        this.rawPoints.push(raw);
        this.smoothedPath.push(finalPoint);
        this.currentSegment.points.push(finalPoint);
        this.snapBuffer.push(finalPoint); // For batch OSRM map matching
        isPathPoint = true;
        emitPosition = finalPoint;

        // Return path detection (after walking enough)
        if (!this.returnDetectedFlag && this.roadSegments.length > 0 && this.smoothedPath.length > 30) {
          const b = this.getSmoothedBearing();
          if (this.checkReturnPath(finalPoint, b)) {
            this.returnDetectedFlag = true;
            this.emit('returnDetected');
          }
        }

        if (this.smoothedPath.length % 20 === 0) {
          this.saveToIDB();
        }
      }
    }

    // Single emit per GPS fix — always updates marker, conditionally updates path
    this.emit('positionUpdate', {
      position: emitPosition,
      accuracy: raw.accuracy,
      insideBoundary: inside,
      bearing: this.getSmoothedBearing(),
      pathLength: this.smoothedPath.length,
      isPathPoint
    });
  }

  getSmoothedBearing() {
    if (this.bearingBuffer.length < 2) return 0;
    const first = this.bearingBuffer[0];
    const last = this.bearingBuffer[this.bearingBuffer.length - 1];
    return turf.bearing(
      turf.point([first.lng, first.lat]),
      turf.point([last.lng, last.lat])
    );
  }

  // ── OSM Road Snap Integration ─────────────────────────────
  setOsmRoads(roads: { coords: {lat: number, lng: number}[], highway: string, name?: string }[]) {
    this.osmRoadLines = roads;
  }

  checkOsmRoadProximity(point: {lat: number, lng: number}): { onRoad: boolean, road?: any, snappedPoint?: {lat: number, lng: number} } {
    const SNAP_ENTER = 8;   // meters to enter road
    const SNAP_LEAVE = 15;  // meters to leave (hysteresis)
    const threshold = this.onOsmRoad ? SNAP_LEAVE : SNAP_ENTER;
    const margin = 0.0002;  // ~22m bbox pre-filter

    let closestDist = Infinity;
    let closestRoad: any = null;
    let closestSnapped: {lat: number, lng: number} | null = null;

    for (const road of this.osmRoadLines) {
      if (!road.coords || road.coords.length < 2) continue;
      // Quick bounding-box pre-filter to avoid expensive turf calls
      const hasNearby = road.coords.some(c =>
        Math.abs(c.lat - point.lat) < margin && Math.abs(c.lng - point.lng) < margin
      );
      if (!hasNearby) continue;
      try {
        const line = turf.lineString(road.coords.map(c => [c.lng, c.lat]));
        const pt = turf.point([point.lng, point.lat]);
        const nearest = turf.nearestPointOnLine(line, pt);
        const distM = (nearest.properties.dist || 0) * 1000;
        if (distM < closestDist) {
          closestDist = distM;
          closestRoad = road;
          closestSnapped = { lat: nearest.geometry.coordinates[1], lng: nearest.geometry.coordinates[0] };
        }
      } catch (e) { /* ignore bad geometries */ }
    }

    // Snapping threshold (only snap if within 10 meters)
    return closestDist <= 10
      ? { onRoad: true, road: closestRoad, snappedPoint: closestSnapped! }
      : { onRoad: false };
  }

  // ── OSRM Map Matching ─────────────────────────────────────
  startSnapInterval() {
    if (this.snapInterval) clearInterval(this.snapInterval);
    this.snapInterval = setInterval(async () => {
      if (!this.snapToRoadsEnabled) return;
      if (this.snapBuffer.length < 5) return;
      
      const pointsToSnap = [...this.snapBuffer];
      // Keep last point for continuity in next batch
      this.snapBuffer = [pointsToSnap[pointsToSnap.length - 1]]; 
      
      const snapped = await this.snapTrackToRoads(pointsToSnap);
      
      // Update the current segment with snapped coordinates
      if (snapped && snapped.length > 0) {
        // We replace the last N points in the current segment with the snapped points
        const numToReplace = pointsToSnap.length - 1; // Don't replace the very first point of this batch to keep continuity
        if (this.currentSegment.points.length >= numToReplace) {
           this.currentSegment.points.splice(-numToReplace, numToReplace, ...snapped.slice(1));
           this.emit('pathSnapped', this.currentSegment.points);
           this.saveToIDB();
        }
      }
    }, 30000); // every 30 seconds
  }

  async snapTrackToRoads(rawPoints: SurveyPoint[]) {
    if (rawPoints.length < 2) return rawPoints;
    
    const coords = rawPoints.map(p => `${p.lng},${p.lat}`).join(';');
    const radiuses = rawPoints.map(p => Math.min(p.accuracy * 2, 50)).join(';');
    const timestamps = rawPoints.map(p => Math.floor(p.timestamp / 1000)).join(';');
    
    try {
      const url = `https://router.project-osrm.org/match/v1/foot/${coords}?radiuses=${radiuses}&timestamps=${timestamps}&geometries=geojson&annotations=true&overview=full`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = await response.json();
      
      if (data.code !== 'Ok' || !data.matchings?.length) {
        return rawPoints; 
      }
      
      // Check confidence - if low, it's likely an unmapped gully, so keep raw
      const confidence = data.matchings[0].confidence;
      if (confidence < 0.6) return rawPoints;
      
      const snappedCoords = data.matchings[0].geometry.coordinates;
      // Re-hydrate the snapped coords with point structure
      return snappedCoords.map((coord: number[], i: number) => ({
        ...rawPoints[Math.min(i, rawPoints.length - 1)],
        lat: coord[1],
        lng: coord[0]
      }));
    } catch (error) {
      return rawPoints; // never break survey
    }
  }

  // ── Return Path Detection ─────────────────────────────────
  checkReturnPath(point: {lat: number, lng: number}, currentBearing: number): boolean {
    for (const seg of this.roadSegments) {
      for (let i = 0; i < seg.points.length - 1; i++) {
        const p = seg.points[i];
        const dist = haversineDistance(point.lat, point.lng, p.lat, p.lng);
        if (dist < 5) {
          const next = seg.points[i + 1];
          const segBearing = turf.bearing(turf.point([p.lng, p.lat]), turf.point([next.lng, next.lat]));
          const diff = Math.abs(currentBearing - segBearing);
          const normalized = diff > 180 ? 360 - diff : diff;
          if (normalized > 150) return true; // opposite direction ≈ returning
        }
      }
    }
    return false;
  }

  setReturnMode(mode: 'none' | 'two_lane' | 'follow_back') {
    this.returnMode = mode;
  }

  placeSymbol(symbolType: string, direction: 'left'|'center'|'right'|'compass' = 'center', fallbackPos?: { lat: number, lng: number }, details?: any, customHeading?: number) {
    // If not moving, just use center or default position
    let currentPos = this.smoothedPath.length > 0 ? this.smoothedPath[this.smoothedPath.length - 1] : null;
    if (!currentPos && fallbackPos) {
      currentPos = {
        point_id: crypto.randomUUID(),
        session_id: this.sessionId,
        lat: fallbackPos.lat,
        lng: fallbackPos.lng,
        accuracy: 10,
        speed: 0,
        heading: 0,
        timestamp: Date.now()
      };
    }
    if (!currentPos) return null;

    const bearing = this.getSmoothedBearing();
    let finalLat = currentPos.lat;
    let finalLng = currentPos.lng;

    if (direction === 'compass' && customHeading !== undefined) {
      // Place 7 meters in the direction the phone is pointing
      const offset = turf.destination(
        turf.point([currentPos.lng, currentPos.lat]),
        0.007, // 7 meters
        customHeading,
        { units: 'kilometers' }
      );
      finalLng = offset.geometry.coordinates[0];
      finalLat = offset.geometry.coordinates[1];
    } else if (direction !== 'center') {
      const offsetBearing = direction === 'left' ? bearing - 90 : bearing + 90;
      const normalized = ((offsetBearing % 360) + 360) % 360;
      const offset = turf.destination(
        turf.point([currentPos.lng, currentPos.lat]),
        0.003, // 3 meters
        normalized,
        { units: 'kilometers' }
      );
      finalLng = offset.geometry.coordinates[0];
      finalLat = offset.geometry.coordinates[1];
    }

    // Boundary check
    if (this.blockPolygon?.geometry) {
      try {
        const pt = turf.point([finalLng, finalLat]);
        const poly = turf.polygon(this.blockPolygon.geometry.coordinates);
        const inside = turf.booleanPointInPolygon(pt, poly);
        if (!inside) {
          const approve = window.confirm("⚠️ Warning: This symbol is outside the block boundary. Do you still want to place it?");
          if (!approve) return null;
        }
      } catch (e) { /* ignore bad geometries */ }
    }

    // Duplicate detection - check if house already exists within 5m
    const nearby = this.symbols.filter(s =>
      ['pucca_house', 'kutcha_house', 'apartment', 'non_residential'].includes(s.symbol_type) &&
      haversineDistance(s.lat, s.lng, finalLat, finalLng) < 5
    );
    if (nearby.length > 0) {
      this.emit('duplicateWarning', {
        existing: nearby[0],
        message: `House #${nearby[0].number || '?'} already exists within 5m. Move away or skip.`
      });
      return null;
    }

    const symbol: SurveySymbol = {
      id: `live_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
      symbol_id: crypto.randomUUID(),
      session_id: this.sessionId,
      symbol_type: symbolType as any,
      lat: finalLat,
      lng: finalLng,
      number: null,
      source: 'live_survey',
      placement_direction: direction,
      bearing_at_placement: bearing,
      gps_accuracy: currentPos.accuracy,
      placed_at: new Date().toISOString(),
      ...(details || {})
    };
    
    this.symbols.push(symbol);
    this.recalculateHouseNumbers();
    this.saveToIDB();
    
    const patterns = { left: [50], right: [50, 30, 50], center: [100], compass: [100] };
    if (navigator.vibrate) {
      navigator.vibrate(patterns[direction]);
    }
    
    this.emit('symbolsUpdated', this.symbols);
    return symbol;
  }

  undoLastSymbol() {
    if (this.symbols.length === 0) return;
    const removed = this.symbols.pop();
    if (removed) {
      this.idb.removeSymbol(removed.symbol_id);
    }
    this.recalculateHouseNumbers();
    this.saveToIDB();
    this.emit('symbolsUpdated', this.symbols);
    return removed;
  }

  undoLastRoadSegment() {
    if (this.roadSegments.length === 0) return;
    const removed = this.roadSegments.pop();
    this.saveToIDB();
    this.emit('roadSegmentsUpdated', this.roadSegments);
    return removed;
  }

  updateSymbolDetails(symbolId: string, details: any) {
    const sym = this.symbols.find(s => s.symbol_id === symbolId);
    if (sym) {
      Object.assign(sym, details);
      this.saveToIDB();
      this.emit('symbolsUpdated', this.symbols);
    }
  }

  private recalculateHouseNumbers() {
    this.symbols = serpentineNumbering(this.symbols as any) as any;
  }

  switchRoadType(newType: string) {
    if (this.currentSegment.type === newType) return;
    
    if (this.currentSegment.points.length >= 2) {
      this.roadSegments.push({
        segment_id: crypto.randomUUID(),
        session_id: this.sessionId,
        road_type: this.currentSegment.type,
        type: this.currentSegment.type,
        points: [...this.currentSegment.points]
      });
    }
    
    const lastPoint = this.currentSegment.points[this.currentSegment.points.length - 1];
    this.currentSegment = {
      type: newType,
      points: lastPoint ? [lastPoint] : []
    };
    
    this.emit('roadTypeChanged', newType);
  }

  kalmanFilter(raw: SurveyPoint): SurveyPoint {
    // Dynamic measurement noise based on device's reported accuracy (variance)
    // Scale it so that 1m accuracy = small r, 100m accuracy = large r
    const dynamicR = (raw.accuracy * raw.accuracy) / 10; 
    
    const filterAxis = (axis: 'lat' | 'lng', measurement: number) => {
      const k = this.kalman[axis];
      k.p = k.p + k.q;
      // Use dynamicR if raw.accuracy is available, otherwise fallback to k.r
      const currentR = raw.accuracy ? dynamicR : k.r;
      const gain = k.p / (k.p + currentR);
      k.x = k.x === 0 ? measurement : k.x + gain * (measurement - k.x);
      k.p = (1 - gain) * k.p;
      return k.x;
    };
    
    return {
      ...raw,
      lat: filterAxis('lat', raw.lat),
      lng: filterAxis('lng', raw.lng)
    };
  }

  async saveToIDB() {
    // Basic auto-save.
    const toSave = this.smoothedPath.slice(-20);
    if (toSave.length > 0) {
      await this.idb.addPoints(toSave);
    }
    await this.idb.updateSessionState(this.sessionId, toPersistedState(this.state), {
       houses_count: this.symbols.filter(s => ['pucca_house', 'kutcha_house'].includes(s.symbol_type as string)).length,
       distance_m: Math.round(this.calculateTotalDistance()),
       polygon_geojson: this.blockPolygon ? JSON.stringify(this.blockPolygon) : undefined,
       drawn_features: JSON.stringify(this.drawnFeatures)
    });
  }

  async syncToSupabase() {
    // In a real app, send this.roadSegments and this.symbols to Supabase.
    // E.g. POST to /rest/v1/roads_contributions
    console.log('Syncing to Supabase...');
  }

  calculateTotalDistance() {
    let dist = 0;
    for (let i = 1; i < this.smoothedPath.length; i++) {
      dist += haversineDistance(
        this.smoothedPath[i-1].lat, this.smoothedPath[i-1].lng,
        this.smoothedPath[i].lat, this.smoothedPath[i].lng
      );
    }
    return dist;
  }

  generateSurveyResult() {
    const roadFeatures = this.roadSegments
      .filter(seg => seg.points.length >= 2)
      .map(seg => turf.lineString(
        seg.points.map(p => [p.lng, p.lat]),
        {
          highway: seg.type,
          source: 'live_survey',
          survey_date: new Date().toISOString(),
          session_id: this.sessionId
        }
      ));
    
    return {
      sessionId: this.sessionId,
      roads: turf.featureCollection(roadFeatures),
      symbols: this.symbols,
      stats: {
        totalDistance: this.calculateTotalDistance(),
        duration: this.startTime ? Date.now() - this.startTime : 0,
        houseCount: this.symbols.filter(s => 
          ['pucca_house','kutcha_house'].includes(s.symbol_type)
        ).length,
        roadCount: this.roadSegments.length,
        gpsPointCount: this.rawPoints.length
      }
    };
  }
}
