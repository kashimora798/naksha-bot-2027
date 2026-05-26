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

export class LiveSurveyEngine {
  blockPolygon: any;
  supabase: any;
  idb: typeof idbStore;
  rawPoints: SurveyPoint[] = [];
  smoothedPath: SurveyPoint[] = [];
  roadSegments: RoadSegment[] = [];
  currentSegment: { type: string, points: SurveyPoint[] } = { type: 'residential', points: [] };
  symbols: SurveySymbol[] = [];
  sessionId: string;
  startTime: number | null = null;
  state: SurveyState = 'READY';
  bearingBuffer: SurveyPoint[] = [];
  
  kalman = {
    lat: { x: 0, p: 1, q: 0.00001, r: 0.0001 },
    lng: { x: 0, p: 1, q: 0.00001, r: 0.0001 }
  };

  watchId: number | null = null;
  wakeLock: any = null;
  listeners: { [event: string]: Function[] } = {};

  constructor(blockPolygon: any, supabaseClient: any, idbService: typeof idbStore) {
    this.blockPolygon = blockPolygon;
    this.supabase = supabaseClient;
    this.idb = idbService;
    this.sessionId = crypto.randomUUID();
  }

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event: string, data?: any) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => cb(data));
    }
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
        maximumAge: 0,
        timeout: 10000
      }
    );
    
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await (navigator as any).wakeLock.request('screen');
      } catch (e) {
        console.warn('Wake lock failed', e);
      }
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
  }

  resumeSurvey() {
    if (this.state !== 'PAUSED') return;
    this.state = 'RECORDING';
    this.emit('stateChanged', this.state);
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
    
    this.roadSegments = await snapRoadsToOSM(this.roadSegments, this.blockPolygon) as any;
    
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
    if (this.state !== 'RECORDING') return;
    
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
    
    if (raw.accuracy > 30) return; // Ignore very inaccurate GPS fixes

    if (raw.speed > 4.2) { 
      this.handleVehicleDetected();
      return;
    }
    
    const smoothed = this.kalmanFilter(raw);
    
    if (this.smoothedPath.length > 0) {
      const last = this.smoothedPath[this.smoothedPath.length - 1];
      const dist = haversineDistance(last.lat, last.lng, smoothed.lat, smoothed.lng);
      
      const timeDiffSec = (raw.timestamp - last.timestamp) / 1000;
      const realSpeed = timeDiffSec > 0 ? (dist / timeDiffSec) : 0;
      
      // If sudden jump implies impossible running speed but OS didn't flag speed, it's a glitch bounce
      if (realSpeed > 4.2) return;
      
      // Ignore tiny movements (< 2m) to prevent wandering while sitting
      if (dist < 2) return; 
    }
    
    this.rawPoints.push(raw);
    this.smoothedPath.push(smoothed);
    this.currentSegment.points.push(smoothed);
    
    this.bearingBuffer.push(smoothed);
    if (this.bearingBuffer.length > 5) {
      this.bearingBuffer.shift();
    }
    
    // Ensure boundary exists before checking
    const pt = turf.point([smoothed.lng, smoothed.lat]);
    let inside = true;
    if (this.blockPolygon && this.blockPolygon.geometry) {
       // Convert to valid turf polygon if needed
       try {
         const poly = turf.polygon(this.blockPolygon.geometry.coordinates);
         inside = turf.booleanPointInPolygon(pt, poly);
       } catch (e) {
         // ignore
       }
    }
    
    this.emit('positionUpdate', { 
      position: smoothed, 
      accuracy: raw.accuracy,
      insideBoundary: inside,
      pathLength: this.smoothedPath.length,
      bearing: this.getSmoothedBearing()
    });
    
    if (this.smoothedPath.length % 20 === 0) {
      this.saveToIDB();
    }
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

  placeSymbol(symbolType: string, direction: 'left'|'center'|'right' = 'center', fallbackPos?: { lat: number, lng: number }) {
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
    
    if (direction !== 'center') {
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
      placed_at: new Date().toISOString()
    };
    
    this.symbols.push(symbol);
    this.saveToIDB();
    
    const patterns = { left: [50], right: [50, 30, 50], center: [100] };
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
    this.saveToIDB();
    this.emit('symbolsUpdated', this.symbols);
    return removed;
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
    const filterAxis = (axis: 'lat' | 'lng', measurement: number) => {
      const k = this.kalman[axis];
      k.p = k.p + k.q;
      const gain = k.p / (k.p + k.r);
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
    // To prevent blocking, we could copy data and save asynchronously.
    const toSave = this.smoothedPath.slice(-20);
    if (toSave.length > 0) {
      await this.idb.addPoints(toSave);
    }
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
