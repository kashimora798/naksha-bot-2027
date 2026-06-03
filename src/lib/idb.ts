import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { PlacedSymbol, Coordinate } from '../types';

export interface SurveySession {
  session_id: string;
  hlb_number: string;
  state: 'active' | 'completed' | 'paused';
  created_at: string;
  startTime: number;
  location_name?: string;
  houses_count?: number;
  distance_m?: number;
  polygon_geojson?: string;
  drawn_features?: string;
}

export interface SurveyPoint extends Coordinate {
  point_id: string;
  session_id: string;
  timestamp: number;
  accuracy: number;
  speed: number;
  heading: number | null;
}

export interface SurveySymbol extends PlacedSymbol {
  symbol_id: string;
  session_id: string;
  placed_at: string;
  source: string;
  placement_direction: string;
  bearing_at_placement: number;
  gps_accuracy: number;
}

export interface RoadSegment {
  segment_id: string;
  session_id: string;
  type: string;
  points: Coordinate[];
  road_type: string;
  is_new_road?: boolean;
}

export interface CachedFootprints {
  session_id: string;
  buildings: any[];
  roads: any[];
  water?: any[];
  forests?: any[];
  farmland?: any[];
}

interface NakshaBotDB extends DBSchema {
  survey_sessions: {
    key: string;
    value: SurveySession;
    indexes: { 'hlb_number': string, 'state': string, 'created_at': string };
  };
  survey_points: {
    key: string;
    value: SurveyPoint;
    indexes: { 'session_id': string, 'timestamp': number };
  };
  survey_symbols: {
    key: string;
    value: SurveySymbol;
    indexes: { 'session_id': string, 'symbol_type': string };
  };
  road_segments: {
    key: string;
    value: RoadSegment;
    indexes: { 'session_id': string, 'road_type': string, 'is_new_road': number };
  };
  cached_footprints: {
    key: string;
    value: CachedFootprints;
  };
}

let dbPromise: Promise<IDBPDatabase<NakshaBotDB>>;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<NakshaBotDB>('nakshabot-live-survey', 3, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const sessionStore = db.createObjectStore('survey_sessions', { keyPath: 'session_id' });
          sessionStore.createIndex('hlb_number', 'hlb_number');
          sessionStore.createIndex('state', 'state');
          sessionStore.createIndex('created_at', 'created_at');

          const pointStore = db.createObjectStore('survey_points', { keyPath: 'point_id' });
          pointStore.createIndex('session_id', 'session_id');
          pointStore.createIndex('timestamp', 'timestamp');

          const symbolStore = db.createObjectStore('survey_symbols', { keyPath: 'symbol_id' });
          symbolStore.createIndex('session_id', 'session_id');
          symbolStore.createIndex('symbol_type', 'symbol_type');

          const roadStore = db.createObjectStore('road_segments', { keyPath: 'segment_id' });
          roadStore.createIndex('session_id', 'session_id');
          roadStore.createIndex('road_type', 'road_type');
          roadStore.createIndex('is_new_road', 'is_new_road');
        }
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains('cached_footprints')) {
            db.createObjectStore('cached_footprints', { keyPath: 'session_id' });
          }
        }
      },
    });
  }
  return dbPromise;
}

export const idbStore = {
  async setSession(session: SurveySession) {
    const db = await getDB();
    await db.put('survey_sessions', session);
  },
  
  async getSession(session_id: string) {
    const db = await getDB();
    return db.get('survey_sessions', session_id);
  },

  async getAllSessions(): Promise<SurveySession[]> {
    const db = await getDB();
    return db.getAll('survey_sessions');
  },

  async updateSessionState(session_id: string, state: SurveySession['state'], extra?: Partial<SurveySession>) {
    const db = await getDB();
    // Use a transaction to ensure atomic read-modify-write
    const tx = db.transaction('survey_sessions', 'readwrite');
    const existing = await tx.store.get(session_id);
    if (existing) {
      await tx.store.put({ ...existing, state, ...extra });
    }
    await tx.done;
  },

  async addPoint(point: SurveyPoint) {
    const db = await getDB();
    await db.put('survey_points', point);
  },

  async addPoints(points: SurveyPoint[]) {
    const db = await getDB();
    const tx = db.transaction('survey_points', 'readwrite');
    points.forEach(p => tx.store.put(p));
    await tx.done;
  },

  async getPointsForSession(session_id: string): Promise<SurveyPoint[]> {
    const db = await getDB();
    return db.getAllFromIndex('survey_points', 'session_id', session_id);
  },

  async addSymbol(symbol: SurveySymbol) {
    const db = await getDB();
    await db.put('survey_symbols', symbol);
  },

  async addSymbols(symbols: SurveySymbol[]) {
    const db = await getDB();
    const tx = db.transaction('survey_symbols', 'readwrite');
    symbols.forEach(s => tx.store.put(s));
    await tx.done;
  },

  async getSymbolsForSession(session_id: string): Promise<SurveySymbol[]> {
    const db = await getDB();
    return db.getAllFromIndex('survey_symbols', 'session_id', session_id);
  },

  async removeSymbol(symbol_id: string) {
    const db = await getDB();
    await db.delete('survey_symbols', symbol_id);
  },

  async addSegment(segment: RoadSegment) {
    const db = await getDB();
    await db.put('road_segments', segment);
  },

  async addSegments(segments: RoadSegment[]) {
    const db = await getDB();
    const tx = db.transaction('road_segments', 'readwrite');
    segments.forEach(s => tx.store.put(s));
    await tx.done;
  },

  async getSegmentsForSession(session_id: string): Promise<RoadSegment[]> {
    const db = await getDB();
    return db.getAllFromIndex('road_segments', 'session_id', session_id);
  },

  async saveCachedFootprints(footprints: CachedFootprints) {
    const db = await getDB();
    await db.put('cached_footprints', footprints);
  },

  async getCachedFootprints(session_id: string): Promise<CachedFootprints | undefined> {
    const db = await getDB();
    if (!db.objectStoreNames.contains('cached_footprints')) return undefined;
    return db.get('cached_footprints', session_id);
  },

  async deleteSession(session_id: string) {
    const db = await getDB();
    
    // Delete session entry
    await db.delete('survey_sessions', session_id);
    
    // Delete associated points
    const pointsTx = db.transaction('survey_points', 'readwrite');
    const pointsKeys = await pointsTx.store.index('session_id').getAllKeys(session_id);
    for (const key of pointsKeys) {
      pointsTx.store.delete(key);
    }
    await pointsTx.done;
    
    // Delete associated symbols
    const symbolsTx = db.transaction('survey_symbols', 'readwrite');
    const symbolsKeys = await symbolsTx.store.index('session_id').getAllKeys(session_id);
    for (const key of symbolsKeys) {
      symbolsTx.store.delete(key);
    }
    await symbolsTx.done;
    
    // Delete associated road segments
    const roadsTx = db.transaction('road_segments', 'readwrite');
    const roadsKeys = await roadsTx.store.index('session_id').getAllKeys(session_id);
    for (const key of roadsKeys) {
      roadsTx.store.delete(key);
    }
    await roadsTx.done;

    // Delete associated footprints if the store exists
    if (db.objectStoreNames.contains('cached_footprints')) {
      try {
        await db.delete('cached_footprints', session_id);
      } catch (e) {
        console.error('Error deleting cached footprints:', e);
      }
    }
  }
};
