import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { saveBoundaryToDb } from '../lib/survey-api';
import type { Coordinate, MapData, SymbolType, RoadFeature, WaterBody, ForestArea, Landmark } from '../types';
import { getBbox, getOSMName } from '../lib/geo';
import { exportPDF } from '../lib/pdf-export';
import { browserEnv } from '../lib/render-env.browser';

interface Props {
  user: any;
  mapData: MapData;
  projectId: string | null;
  update: (data: Partial<MapData>) => void;
  onSaveAndExit: () => void;
}

// Calculate bearing between two points to align text labels
function calculateBearing(p1: Coordinate, p2: Coordinate): number {
  const lat1 = p1.lat * Math.PI / 180;
  const lat2 = p2.lat * Math.PI / 180;
  const lon1 = p1.lng * Math.PI / 180;
  const lon2 = p2.lng * Math.PI / 180;
  const dLon = lon2 - lon1;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  let brng = Math.atan2(y, x) * 180 / Math.PI;
  if (brng < 0) brng += 360;
  if (brng > 90 && brng <= 270) {
    brng = (brng + 180) % 360;
  }
  return brng;
}

// Helper to check if point is inside boundary
const pointInPolygon = (pt: Coordinate, vs: Coordinate[]) => {
  let x = pt.lng, y = pt.lat;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    let xi = vs[i].lng, yi = vs[i].lat;
    let xj = vs[j].lng, yj = vs[j].lat;
    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Helper to check if a point is inside or very close to the boundary polygon
function isPointNearBoundary(pt: Coordinate, boundary: Coordinate[], maxDistanceDeg = 0.0012): boolean {
  if (boundary.length === 0) return false;
  if (pointInPolygon(pt, boundary)) return true;
  for (const pin of boundary) {
    const dLat = pt.lat - pin.lat;
    const dLng = pt.lng - pin.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < maxDistanceDeg) return true;
  }
  return false;
}

// Pairwise distance-based deduplication to filter out overlapping Google buildings
function removeOverlappingGoogleBuildings(buildings: any[]): any[] {
  const result: any[] = [];
  const minDistanceDeg = 0.000135; // ~15 metres — prevents visually overlapping footprint polygons
  
  // Sort by confidence descending to prioritize higher confidence segments
  const sorted = [...buildings].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  
  for (const b of sorted) {
    let tooClose = false;
    for (const kept of result) {
      const dLat = b.lat - kept.lat;
      const dLng = b.lng - kept.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < minDistanceDeg) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      result.push(b);
    }
  }
  return result;
}

// Pairwise distance-based deduplication to filter out overlapping POIs/Landmarks
function declutterPOIs(pois: Landmark[], minDistanceDeg = 0.00045): Landmark[] {
  const result: any[] = [];
  for (const p of pois) {
    let tooClose = false;
    for (const kept of result) {
      const dLat = p.lat - kept.lat;
      const dLng = p.lng - kept.lng;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);
      if (dist < minDistanceDeg) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) {
      result.push(p);
    }
  }
  return result;
}

export default function SatExtractorWorkspace({ user, mapData, projectId, update, onSaveAndExit }: Props) {
  const [hlbCode, setHlbCode] = useState(mapData.hlbNumber || '');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  
  // Extraction states
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);
  
  // Settings & Toggles
  const [accuracy, setAccuracy] = useState(0.70);
  const [fetchingBuildings, setFetchingBuildings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);

  // Drawing States
  const [drawingMode, setDrawingMode] = useState<'none' | 'road' | 'poi'>('none');
  const [tempPoints, setTempPoints] = useState<Coordinate[]>([]);
  
  // Layer visibility toggles
  const [showSatellite, setShowSatellite] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showRoads, setShowRoads] = useState(true);
  const [showWater, setShowWater] = useState(true);
  const [showPOIs, setShowPOIs] = useState(true);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showRoadNames, setShowRoadNames] = useState(true);

  // Print layout settings
  const [printTitle, setPrintTitle] = useState(mapData.hlbNumber ? `Nazari Naksha - HLB ${mapData.hlbNumber}` : 'Nazari Naksha');
  const [showPrintLegend, setShowPrintLegend] = useState(true);
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printRotation, setPrintRotation] = useState(0);
  const [isLandscape, setIsLandscape] = useState(true);
  const [showBuildingsInPdf, setShowBuildingsInPdf] = useState(true);
  const [showArrowsInPdf, setShowArrowsInPdf] = useState(true);
  
  // Refs for synchronization and print preview Leaflet instance
  const previewMapContainerRef = useRef<HTMLDivElement>(null);
  const previewMapRef = useRef<L.Map | null>(null);
  const touchStartAngle = useRef<number | null>(null);
  const baseRotation = useRef<number>(0);

  const mapDataRef = useRef(mapData);
  useEffect(() => { mapDataRef.current = mapData; }, [mapData]);

  const updateRef = useRef(update);
  useEffect(() => { updateRef.current = update; }, [update]);

  const drawingModeRef = useRef(drawingMode);
  useEffect(() => { drawingModeRef.current = drawingMode; }, [drawingMode]);

  const tempPointsRef = useRef(tempPoints);
  useEffect(() => { tempPointsRef.current = tempPoints; }, [tempPoints]);
  
  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tempDrawGroup = useRef<L.FeatureGroup | null>(null);
  const layersRef = useRef<{
    satellite?: L.TileLayer;
    boundary?: L.Polygon;
    roadsGroup?: L.FeatureGroup;
    roadLabelsGroup?: L.FeatureGroup;
    waterGroup?: L.FeatureGroup;
    forestsGroup?: L.FeatureGroup;
    poiGroup?: L.FeatureGroup;
    buildingsGroup?: L.FeatureGroup;
  }>({});


  // Monitor resize to toggle sidebar behavior
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const centerLatLng: [number, number] = mapData.center 
      ? [mapData.center.lat, mapData.center.lng] 
      : [26.4499, 80.3319];

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(centerLatLng, mapData.center ? 16 : 13);
    mapRef.current = map;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Google Satellite Hybrid layer
    const sat = L.tileLayer('https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      attribution: 'Google Satellite'
    });
    
    if (showSatellite) {
      sat.addTo(map);
    }
    layersRef.current.satellite = sat;

    // Feature Groups
    layersRef.current.roadsGroup = L.featureGroup().addTo(map);
    layersRef.current.roadLabelsGroup = L.featureGroup().addTo(map);
    layersRef.current.waterGroup = L.featureGroup().addTo(map);
    layersRef.current.forestsGroup = L.featureGroup().addTo(map);
    layersRef.current.poiGroup = L.featureGroup().addTo(map);
    layersRef.current.buildingsGroup = L.featureGroup().addTo(map);

    // Temporary Drawing Group
    tempDrawGroup.current = L.featureGroup().addTo(map);

    // Map Click Handler for Drawing Mode
    map.on('click', (e: L.LeafletMouseEvent) => {
      const mode = drawingModeRef.current;
      const latlng = e.latlng;

      if (mode === 'poi') {
        const name = prompt("Enter Landmark / POI Name:");
        if (name && name.trim()) {
          const newPoi: Landmark = {
            id: `landmark-custom-${crypto.randomUUID()}`,
            name: name.trim(),
            type: 'POI',
            lat: latlng.lat,
            lng: latlng.lng,
            selectedForPdf: true
          };
          const currentPOIs = mapDataRef.current.landmarks || [];
          updateRef.current({ landmarks: [...currentPOIs, newPoi] });
        }
        setDrawingMode('none');
      } else if (mode === 'road') {
        const pt = { lat: latlng.lat, lng: latlng.lng };
        const pts = [...tempPointsRef.current, pt];
        setTempPoints(pts);
        
        // Redraw temporary path
        const tg = tempDrawGroup.current;
        if (tg) {
          tg.clearLayers();
          pts.forEach((p) => {
            L.circleMarker([p.lat, p.lng], { radius: 5, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 1 }).addTo(tg);
          });
          if (pts.length >= 2) {
            L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#8b5cf6', weight: 4, dashArray: '5,5' }).addTo(tg);
          }
        }
      }
    });

    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update satellite layer visibility
  useEffect(() => {
    const map = mapRef.current;
    const sat = layersRef.current.satellite;
    if (!map || !sat) return;
    if (showSatellite) {
      sat.addTo(map);
    } else {
      sat.remove();
    }
  }, [showSatellite]);

  // Handle Save Drawing Road
  const handleSaveDrawingRoad = () => {
    if (tempPoints.length < 2) {
      alert("Please click on the map to add at least 2 points for the road.");
      return;
    }
    const name = prompt("Enter Road Name (Optional):");
    if (name === null) return;

    const newRoad: RoadFeature = {
      id: `road-custom-${crypto.randomUUID()}`,
      coords: tempPoints,
      highway: 'residential',
      name: name.trim() || undefined,
      confirmed: true,
      source: 'user'
    };

    update({ roads: [...(mapData.roads || []), newRoad] });

    setTempPoints([]);
    tempDrawGroup.current?.clearLayers();
    setDrawingMode('none');
  };

  // Handle Cancel Drawing Road
  const handleCancelDrawingRoad = () => {
    setTempPoints([]);
    tempDrawGroup.current?.clearLayers();
    setDrawingMode('none');
  };

  // Handle Undo Last Point
  const handleUndoPoint = () => {
    if (tempPoints.length === 0) return;
    const pts = tempPoints.slice(0, -1);
    setTempPoints(pts);

    const tg = tempDrawGroup.current;
    if (tg) {
      tg.clearLayers();
      pts.forEach((p) => {
        L.circleMarker([p.lat, p.lng], { radius: 5, color: '#8b5cf6', fillColor: '#8b5cf6', fillOpacity: 1 }).addTo(tg);
      });
      if (pts.length >= 2) {
        L.polyline(pts.map(p => [p.lat, p.lng]), { color: '#8b5cf6', weight: 4, dashArray: '5,5' }).addTo(tg);
      }
    }
  };

  // Clear Map layers
  const clearMap = () => {
    const lg = layersRef.current;
    if (lg.boundary) { lg.boundary.remove(); lg.boundary = undefined; }
    lg.roadsGroup?.clearLayers();
    lg.roadLabelsGroup?.clearLayers();
    lg.waterGroup?.clearLayers();
    lg.forestsGroup?.clearLayers();
    lg.poiGroup?.clearLayers();
    lg.buildingsGroup?.clearLayers();
  };

  // Draw boundary on map
  const drawBoundary = useCallback((pins: Coordinate[]) => {
    const map = mapRef.current;
    if (!map || pins.length < 3) return;

    if (layersRef.current.boundary) {
      layersRef.current.boundary.remove();
    }

    const latLngs = pins.map(p => [p.lat, p.lng] as [number, number]);
    const poly = L.polygon(latLngs, {
      color: '#ef4444',
      fillColor: 'transparent',
      weight: 3,
      dashArray: '8, 5'
    });

    if (showBoundary) {
      poly.addTo(map);
    }
    layersRef.current.boundary = poly;

    map.fitBounds(poly.getBounds(), { padding: [20, 20] });
  }, [showBoundary]);

  // Handle drawing & loading when boundary pins are loaded
  useEffect(() => {
    if (mapData.boundaryPins && mapData.boundaryPins.length >= 3) {
      drawBoundary(mapData.boundaryPins);
      
      // Render existing features from project state
      renderRoadsLayer(mapData.roads || []);
      renderWaterLayer(mapData.waterBodies || []);
      renderForestsLayer(mapData.forests || []);
      renderPOIsLayer(mapData.landmarks || []);
      
      // Google building footprints
      const bldList = (mapData.symbols || []).filter(s => s.polygon != null);
      renderBuildingsLayer(bldList);
    }
  }, [mapData.boundaryPins, mapData.roads, mapData.waterBodies, mapData.forests, mapData.landmarks, mapData.symbols, drawBoundary]);

  // Toggle boundary layer
  useEffect(() => {
    const map = mapRef.current;
    const poly = layersRef.current.boundary;
    if (!map || !poly) return;
    if (showBoundary) {
      poly.addTo(map);
    } else {
      poly.remove();
    }
  }, [showBoundary]);

  // Handle GeoPDF Boundary Extraction
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hlbCode.trim()) { setExtractError('Please enter a 4-digit HLB code.'); return; }
    if (!pdfFile) { setExtractError('Please select a Census GeoPDF file.'); return; }

    setExtractStatus('Uploading GeoPDF layout map...');
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('hlb', hlbCode.trim());

      const url = import.meta.env.VITE_EXTRACTOR_API_URL || 'https://naksha-bot-backend.render.com/api/extract';
      const res = await fetch(url, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server error ${res.status}`);
      }

      const geojson = await res.json();
      const coords = geojson.geometry?.coordinates?.[0];
      if (!coords || coords.length < 3) {
        throw new Error('Server returned an invalid boundary polygon structure.');
      }
      
      const pins = coords.map(([lng, lat]: any) => ({ lat, lng }));
      
      // Calculate centroid
      const sumLat = pins.reduce((acc: number, curr: any) => acc + curr.lat, 0);
      const sumLng = pins.reduce((acc: number, curr: any) => acc + curr.lng, 0);
      const centerPt = { lat: sumLat / pins.length, lng: sumLng / pins.length };

      setPrintTitle(`Nazari Naksha - HLB ${hlbCode.trim()}`);

      // Save boundary to Database
      if (user?.id) {
        setExtractStatus('Saving extracted boundary to Supabase database...');
        await saveBoundaryToDb(user.id, hlbCode.trim(), geojson, centerPt);
      }

      // Update project state
      update({
        hlbNumber: hlbCode.trim(),
        boundaryPins: pins,
        boundaryClosed: true,
        center: centerPt,
        isAutoFetched: true
      });

      setExtractStatus('');
      triggerOSMFetch(pins);

    } catch (err: any) {
      setExtractError(err.message || 'GeoPDF boundary extraction failed.');
      setExtractStatus('');
    }
  };

  // Auto Fetch OSM roads, water, and POIs
  const triggerOSMFetch = async (pins: Coordinate[]) => {
    setExtractStatus('Fetching roads, water bodies, and local POIs from OpenStreetMap...');
    
    // Pad the bounding box slightly (~160 meters) to capture nearby roads and crossings
    const box = getBbox(pins);
    const pad = 0.0015;
    const bb = {
      north: box.north + pad,
      south: box.south - pad,
      east: box.east + pad,
      west: box.west - pad
    };
    
    // Construct Overpass query
    const overpassQuery = `
      [out:json][timeout:25];
      (
        way["highway"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["natural"="water"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["landuse"="forest"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["natural"="wood"](${bb.south},${bb.west},${bb.north},${bb.east});
        
        // Fetch all named features (temples, buildings, mosques, shops, nurseries, landmarks)
        node["name"](${bb.south},${bb.west},${bb.north},${bb.east});
        way["name"][!"highway"](${bb.south},${bb.west},${bb.north},${bb.east});
      );
      out body geom;
    `;

    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: overpassQuery
      });

      if (!r.ok) throw new Error(`Overpass returned status ${r.status}`);
      const data = await r.json();
      const elements = data.elements || [];

      // Process elements
      const parsedRoads: RoadFeature[] = [];
      const parsedWater: WaterBody[] = [];
      const parsedForests: ForestArea[] = [];
      const parsedPOIs: Landmark[] = [];

      for (const el of elements) {
        const tags = el.tags || {};
        const elName = getOSMName(tags);

        if (el.type === 'way' && el.geometry && el.geometry.length >= 2) {
          const coords = el.geometry.map((g: any) => ({ lat: g.lat, lng: g.lon }));
          
          if (tags.highway) {
            parsedRoads.push({
              id: `road-${el.id || crypto.randomUUID()}`,
              coords,
              highway: tags.highway,
              name: elName,
              confirmed: true,
              source: 'osm',
              osm_id: el.id
            });
          } else if (tags.natural === 'water') {
            const sumLat = coords.reduce((acc: number, curr: any) => acc + curr.lat, 0);
            const sumLng = coords.reduce((acc: number, curr: any) => acc + curr.lng, 0);
            parsedWater.push({
              id: `water-${el.id || crypto.randomUUID()}`,
              name: elName || 'Water Body',
              type: 'pond',
              coords,
              center: { lat: sumLat / coords.length, lng: sumLng / coords.length }
            });
          } else if (tags.landuse === 'forest' || tags.natural === 'wood') {
            parsedForests.push({
              id: `forest-${el.id || crypto.randomUUID()}`,
              name: elName || 'Forest Area',
              points: coords
            });
          } else if (elName) {
            // Named way polygon landmark (e.g. school, temple, building compound)
            const pt = { lat: coords[0].lat, lng: coords[0].lng };
            if (isPointNearBoundary(pt, pins, 0.0015)) {
              const sumLat = coords.reduce((acc: number, curr: any) => acc + curr.lat, 0);
              const sumLng = coords.reduce((acc: number, curr: any) => acc + curr.lng, 0);
              parsedPOIs.push({
                id: `landmark-${el.id || crypto.randomUUID()}`,
                name: elName,
                type: tags.amenity || tags.building || tags.landuse || 'POI',
                lat: sumLat / coords.length,
                lng: sumLng / coords.length,
                selectedForPdf: true
              });
            }
          }
        } else if (el.type === 'node') {
          const pt = { lat: el.lat, lng: el.lon };
          if (elName && isPointNearBoundary(pt, pins, 0.0015)) {
            const type = tags.amenity || tags.shop || tags.tourism || 'POI';
            parsedPOIs.push({
              id: `landmark-${el.id || crypto.randomUUID()}`,
              name: elName,
              type: type,
              lat: el.lat,
              lng: el.lon,
              selectedForPdf: true
            });
          }
        }
      }

      // Update project state, triggering auto-save to database
      update({
        roads: parsedRoads,
        waterBodies: parsedWater,
        forests: parsedForests,
        landmarks: parsedPOIs
      });

    } catch (e: any) {
      console.warn("Failed to fetch features from OSM:", e);
      setExtractError("Fetched boundary, but failed to fetch detailed OSM layers.");
    } finally {
      setExtractStatus('');
    }
  };

  // Render roads to Map
  const renderRoadsLayer = (rdsList: RoadFeature[]) => {
    const rg = layersRef.current.roadsGroup;
    const lg = layersRef.current.roadLabelsGroup;
    if (!rg || !lg) return;

    rg.clearLayers();
    lg.clearLayers();

    rdsList.forEach(r => {
      if (r.coords.length < 2) return;
      const latlngs = r.coords.map((c: any) => [c.lat, c.lng]);
      
      const pk = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'paved'].includes(r.highway);
      const rs = ['residential', 'unclassified', 'service', 'living_street'].includes(r.highway);
      const kt = ['footway', 'path', 'track', 'pedestrian', 'steps', 'unpaved'].includes(r.highway);

      const lc = '#000'; // casing color
      const gc = '#FFF'; // inline center color

      let poly;
      if (pk) {
        poly = L.polyline(latlngs, { color: lc, weight: 8, opacity: 0.95, interactive: true });
        rg.addLayer(poly);
        rg.addLayer(L.polyline(latlngs, { color: gc, weight: 4, opacity: 0.95, interactive: false }));
      } else if (rs) {
        poly = L.polyline(latlngs, { color: lc, weight: 6, opacity: 0.95, interactive: true });
        rg.addLayer(poly);
        rg.addLayer(L.polyline(latlngs, { color: gc, weight: 2.5, opacity: 0.95, interactive: false }));
      } else if (kt) {
        poly = L.polyline(latlngs, { color: lc, weight: 5, dashArray: '10,6', opacity: 0.95, interactive: true });
        rg.addLayer(poly);
        rg.addLayer(L.polyline(latlngs, { color: gc, weight: 2, dashArray: '10,6', opacity: 0.95, interactive: false }));
      } else {
        poly = L.polyline(latlngs, { color: lc, weight: 5, opacity: 0.95, interactive: true });
        rg.addLayer(poly);
        rg.addLayer(L.polyline(latlngs, { color: gc, weight: 2, opacity: 0.95, interactive: false }));
      }

      // Add Click Listener to Rename/Delete Road
      if (poly) {
        poly.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          if (drawingModeRef.current !== 'none') return;
          const act = confirm(`Modify road "${r.name || 'Unnamed Road'}":\n\n- Click OK to Rename\n- Click Cancel to Delete`);
          if (act) {
            const newName = prompt(`Rename road "${r.name || 'Unnamed Road'}":`, r.name || '');
            if (newName !== null) {
              const updatedRoads = rdsList.map(rd => rd.id === r.id ? { ...rd, name: newName.trim() || undefined } : rd);
              updateRef.current({ roads: updatedRoads });
            }
          } else {
            const confirmDel = confirm(`Are you sure you want to delete this road?`);
            if (confirmDel) {
              const updatedRoads = rdsList.filter(rd => rd.id !== r.id);
              updateRef.current({ roads: updatedRoads });
            }
          }
        });
      }

      // Aligned Road Name Labels (Only rendered if road segment is near the boundary)
      if (r.name && r.coords.length >= 2) {
        const midIdx = Math.floor(r.coords.length / 2);
        const p1 = r.coords[midIdx - 1];
        const p2 = r.coords[midIdx];

        if (isPointNearBoundary(p2, mapData.boundaryPins, 0.00065)) {
          const bearing = calculateBearing(p1, p2);

          const customIcon = L.divIcon({
            className: 'custom-road-label-container',
            html: `<div style="transform: rotate(${bearing}deg); font-family: 'Public Sans', sans-serif; font-size: 8px; font-weight: 800; color: #1e293b; background: rgba(255,255,255,0.85); padding: 1px 4.5px; border-radius: 4px; border: 1px solid #94a3b8; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05); pointer-events: none;">${r.name}</div>`,
            iconSize: [0, 0]
          });

          L.marker([p2.lat, p2.lng], { icon: customIcon, interactive: false }).addTo(lg);
        }
      }
    });

    if (!showRoads) rg.remove();
    if (!showRoadNames) lg.remove();
  };

  // Toggle roads visibility
  useEffect(() => {
    const map = mapRef.current;
    const rg = layersRef.current.roadsGroup;
    if (!map || !rg) return;
    if (showRoads) rg.addTo(map);
    else rg.remove();
  }, [showRoads]);

  // Toggle road names visibility
  useEffect(() => {
    const map = mapRef.current;
    const lg = layersRef.current.roadLabelsGroup;
    if (!map || !lg) return;
    if (showRoadNames) lg.addTo(map);
    else lg.remove();
  }, [showRoadNames]);

  // Render water bodies to Map
  const renderWaterLayer = (watList: WaterBody[]) => {
    const wg = layersRef.current.waterGroup;
    if (!wg) return;
    wg.clearLayers();

    watList.forEach(w => {
      const latlngs = w.coords.map((c: any) => [c.lat, c.lng]);
      L.polygon(latlngs, {
        color: '#0369a1',
        fillColor: '#38bdf8',
        fillOpacity: 0.35,
        weight: 1.5
      }).bindTooltip(w.name, { sticky: true }).addTo(wg);
    });

    if (!showWater) wg.remove();
  };

  // Toggle water bodies visibility
  useEffect(() => {
    const map = mapRef.current;
    const wg = layersRef.current.waterGroup;
    if (!map || !wg) return;
    if (showWater) wg.addTo(map);
    else wg.remove();
  }, [showWater]);

  // Render forest bodies to Map
  const renderForestsLayer = (forestsList: ForestArea[]) => {
    const fg = layersRef.current.forestsGroup;
    if (!fg) return;
    fg.clearLayers();

    forestsList.forEach(f => {
      const latlngs = f.points.map((c: any) => [c.lat, c.lng]);
      L.polygon(latlngs, {
        color: '#166534',
        fillColor: '#22c55e',
        fillOpacity: 0.25,
        weight: 1.5
      }).bindTooltip(f.name, { sticky: true }).addTo(fg);
    });

    if (!showWater) fg.remove();
  };

  // Toggle forest bodies visibility (grouped with water bodies toggle)
  useEffect(() => {
    const map = mapRef.current;
    const fg = layersRef.current.forestsGroup;
    if (!map || !fg) return;
    if (showWater) fg.addTo(map);
    else fg.remove();
  }, [showWater]);

  // Render POIs to Map
  const renderPOIsLayer = (poisList: Landmark[]) => {
    const pg = layersRef.current.poiGroup;
    if (!pg) return;
    pg.clearLayers();

    // Declutter list to avoid overlapping text labels
    const cleanPois = declutterPOIs(poisList);

    cleanPois.forEach((p, idx) => {
      const isNumberMode = mapData.poiNamingApproach === 'number';
      const customIcon = L.divIcon({
        className: 'custom-poi-label-container',
        html: isNumberMode
          ? `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -50%); pointer-events: none;">
              <div style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #6366f1; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); font-family: 'Public Sans', sans-serif; font-size: 9px; font-weight: 800; color: white;">
                ${idx + 1}
              </div>
            </div>
          `
          : `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -10px); pointer-events: none;">
              <div style="width: 7px; height: 7px; border-radius: 50%; background: #6366f1; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.35);"></div>
              <div style="margin-top: 2px; font-family: 'Public Sans', sans-serif; font-size: 8px; font-weight: 850; color: #0f172a; background: rgba(255,255,255,0.92); padding: 1px 4.5px; border-radius: 4px; border: 1px solid #cbd5e1; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; text-transform: uppercase; letter-spacing: 0.1px;">
                ${p.name}
              </div>
            </div>
          `,
        iconSize: [0, 0]
      });

      const marker = L.marker([p.lat, p.lng], { icon: customIcon, interactive: true });
      
      if (isNumberMode) {
        marker.bindTooltip(p.name, { direction: 'top', className: 'bg-slate-800 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow' });
      }

      // Interactive POI renaming & deletion
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (drawingModeRef.current !== 'none') return;
        const act = confirm(`Modify landmark "${p.name}":\n\n- Click OK to Rename\n- Click Cancel to Delete`);
        if (act) {
          const newName = prompt(`Rename landmark "${p.name}":`, p.name);
          if (newName && newName.trim()) {
            const updatedPOIs = poisList.map(item => item.id === p.id ? { ...item, name: newName.trim() } : item);
            updateRef.current({ landmarks: updatedPOIs });
          }
        } else {
          const confirmDel = confirm(`Are you sure you want to delete "${p.name}"?`);
          if (confirmDel) {
            const updatedPOIs = poisList.filter(item => item.id !== p.id);
            updateRef.current({ landmarks: updatedPOIs });
          }
        }
      });

      marker.addTo(pg);
    });

    if (!showPOIs) pg.remove();
  };

  // Toggle POIs visibility
  useEffect(() => {
    const map = mapRef.current;
    const pg = layersRef.current.poiGroup;
    if (!map || !pg) return;
    if (showPOIs) pg.addTo(map);
    else pg.remove();
  }, [showPOIs]);

  // Fetch Google Open Buildings Footprints with Accuracy Filter
  const fetchGoogleBuildings = async () => {
    if (!mapData.boundaryPins || mapData.boundaryPins.length === 0) return;
    setFetchingBuildings(true);
    setExtractStatus('Fetching Google Open Buildings footprints...');

    const bb = getBbox(mapData.boundaryPins);
    try {
      const res = await supabase.functions.invoke('fetch-open-buildings', {
        body: {
          north: bb.north,
          south: bb.south,
          east: bb.east,
          west: bb.west,
          boundary: mapData.boundaryPins.map(p => ({ lat: p.lat, lng: p.lng })),
          useGoogle: true,
          minConfidence: accuracy
        }
      });

      if (res.error) throw res.error;

      const list = res.data?.buildings || [];
      const valid = list.filter((b: any) => b.polygon && Array.isArray(b.polygon.coordinates));

      // Remove overlapping duplicate structures returned by GEE
      const deduped = removeOverlappingGoogleBuildings(valid);

      // Map to PlacedSymbols
      const newBuildingSymbols = deduped.map((b: any) => ({
        id: `building-${crypto.randomUUID()}`,
        symbol_type: 'pucca_house' as SymbolType,
        lat: b.lat,
        lng: b.lng,
        number: null,
        placed_at: new Date().toISOString(),
        auto_detected: true,
        polygon: b.polygon
      }));

      // Update state, saving to database
      update({
        symbols: [...(mapData.symbols || []).filter(s => s.polygon == null), ...newBuildingSymbols]
      });

    } catch (e: any) {
      console.warn("Failed to fetch Google footprints:", e);
      alert("Failed to retrieve Google Open Buildings footprints.");
    } finally {
      setFetchingBuildings(false);
      setExtractStatus('');
    }
  };

  // Render Google Open Buildings footprints on Map
  const renderBuildingsLayer = (bldList: any[]) => {
    const bg = layersRef.current.buildingsGroup;
    if (!bg) return;
    bg.clearLayers();

    bldList.forEach(b => {
      if (!b.polygon || !b.polygon.coordinates) return;
      const latlngs = b.polygon.coordinates[0].map(([lng, lat]: any) => [lat, lng]);
      
      L.polygon(latlngs, {
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        weight: 1
      }).addTo(bg);
    });

    if (!showBuildings) bg.remove();
  };

  // Touch Gesture Event Listeners for Rotation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchStartAngle.current = Math.atan2(dy, dx) * 180 / Math.PI;
      baseRotation.current = printRotation;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && touchStartAngle.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentAngle = Math.atan2(dy, dx) * 180 / Math.PI;
      const delta = currentAngle - touchStartAngle.current;
      
      let newRot = (baseRotation.current + delta) % 360;
      if (newRot < 0) newRot += 360;
      setPrintRotation(Math.round(newRot));
    }
  };

  const handleTouchEnd = () => {
    touchStartAngle.current = null;
  };

  // PDF Export Trigger
  const handleDownloadPDF = () => {
    const previewMap = previewMapRef.current;
    if (!previewMap) return;

    setExtractStatus('Generating high-resolution A4 map PDF...');
    
    setTimeout(() => {
      try {
        const bounds = previewMap.getBounds();
        const focusBounds = {
          south: bounds.getSouth(),
          west: bounds.getWest(),
          north: bounds.getNorth(),
          east: bounds.getEast()
        };

        const docData: MapData = {
          ...mapDataRef.current,
          poiNamingApproach: mapDataRef.current.poiNamingApproach || 'label',
          orientation: isLandscape ? 'landscape' : 'portrait'
        };

        exportPDF(docData, undefined, browserEnv, {
          rotation: printRotation,
          inkMode: 'color',
          hideSymbols: !showBuildingsInPdf,
          hideSerpentineArrows: !showArrowsInPdf
        });

      } catch (err) {
        console.error('Failed to export PDF:', err);
        alert('Could not export PDF. Please check coordinates.');
      } finally {
        setExtractStatus('');
      }
    }, 150);
  };

  // Initialize Print Preview Map
  useEffect(() => {
    if (!showPrintPreview || !previewMapContainerRef.current) return;

    const centerLatLng: [number, number] = mapDataRef.current.center 
      ? [mapDataRef.current.center.lat, mapDataRef.current.center.lng] 
      : [26.4499, 80.3319];

    const previewMap = L.map(previewMapContainerRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView(centerLatLng, mapDataRef.current.center ? 16 : 13);
    previewMapRef.current = previewMap;

    // Google Satellite Hybrid layer
    L.tileLayer('https://mt1.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
      maxZoom: 22
    }).addTo(previewMap);

    // Boundary polygon
    if (mapDataRef.current.boundaryPins && mapDataRef.current.boundaryPins.length >= 3) {
      const poly = L.polygon(mapDataRef.current.boundaryPins.map(p => [p.lat, p.lng]), {
        color: '#ef4444',
        fillColor: 'transparent',
        weight: 3,
        dashArray: '8, 5'
      }).addTo(previewMap);
      
      previewMap.fitBounds(poly.getBounds(), { padding: [15, 15] });
    }

    // Roads Group
    const rg = L.featureGroup().addTo(previewMap);
    const lg = L.featureGroup().addTo(previewMap);
    (mapDataRef.current.roads || []).forEach(r => {
      if (r.coords.length < 2) return;
      const latlngs = r.coords.map((c: any) => [c.lat, c.lng]);
      const pk = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'paved'].includes(r.highway);
      const rs = ['residential', 'unclassified', 'service', 'living_street'].includes(r.highway);
      const kt = ['footway', 'path', 'track', 'pedestrian', 'steps', 'unpaved'].includes(r.highway);
      const lc = '#000';
      const gc = '#FFF';

      if (pk) {
        L.polyline(latlngs, { color: lc, weight: 8, opacity: 0.95 }).addTo(rg);
        L.polyline(latlngs, { color: gc, weight: 4, opacity: 0.95 }).addTo(rg);
      } else if (rs) {
        L.polyline(latlngs, { color: lc, weight: 6, opacity: 0.95 }).addTo(rg);
        L.polyline(latlngs, { color: gc, weight: 2.5, opacity: 0.95 }).addTo(rg);
      } else if (kt) {
        L.polyline(latlngs, { color: lc, weight: 5, dashArray: '10,6', opacity: 0.95 }).addTo(rg);
        L.polyline(latlngs, { color: gc, weight: 2, dashArray: '10,6', opacity: 0.95 }).addTo(rg);
      } else {
        L.polyline(latlngs, { color: lc, weight: 5, opacity: 0.95 }).addTo(rg);
        L.polyline(latlngs, { color: gc, weight: 2, opacity: 0.95 }).addTo(rg);
      }

      if (r.name && isPointNearBoundary(r.coords[Math.floor(r.coords.length / 2)], mapDataRef.current.boundaryPins, 0.00065)) {
        const midIdx = Math.floor(r.coords.length / 2);
        const bearing = calculateBearing(r.coords[midIdx - 1], r.coords[midIdx]);
        const customIcon = L.divIcon({
          className: 'custom-road-label-container',
          html: `<div style="transform: rotate(${bearing}deg); font-family: 'Public Sans', sans-serif; font-size: 8px; font-weight: 800; color: #1e293b; background: rgba(255,255,255,0.85); padding: 1px 4.5px; border-radius: 4px; border: 1px solid #94a3b8; white-space: nowrap;">${r.name}</div>`,
          iconSize: [0, 0]
        });
        L.marker([r.coords[midIdx].lat, r.coords[midIdx].lng], { icon: customIcon, interactive: false }).addTo(lg);
      }
    });

    // Water & Forests
    const wg = L.featureGroup().addTo(previewMap);
    (mapDataRef.current.waterBodies || []).forEach(w => {
      const latlngs = w.coords.map((c: any) => [c.lat, c.lng]);
      L.polygon(latlngs, { color: '#0369a1', fillColor: '#38bdf8', fillOpacity: 0.35, weight: 1.5 }).addTo(wg);
    });
    (mapDataRef.current.forests || []).forEach(f => {
      const latlngs = f.points.map((c: any) => [c.lat, c.lng]);
      L.polygon(latlngs, { color: '#166534', fillColor: '#22c55e', fillOpacity: 0.25, weight: 1.5 }).addTo(wg);
    });

    // POIs Group
    const pg = L.featureGroup().addTo(previewMap);
    const cleanPois = declutterPOIs(mapDataRef.current.landmarks || []);
    cleanPois.forEach((p, idx) => {
      const isNumberMode = mapDataRef.current.poiNamingApproach === 'number';
      const customIcon = L.divIcon({
        className: 'custom-poi-label-container',
        html: isNumberMode 
          ? `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -50%); pointer-events: none;">
              <div style="display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 50%; background: #6366f1; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.3); font-family: 'Public Sans', sans-serif; font-size: 9px; font-weight: 800; color: white;">
                ${idx + 1}
              </div>
            </div>
          `
          : `
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; transform: translate(-50%, -10px); pointer-events: none;">
              <div style="width: 7px; height: 7px; border-radius: 50%; background: #6366f1; border: 1.5px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.35);"></div>
              <div style="margin-top: 2px; font-family: 'Public Sans', sans-serif; font-size: 8px; font-weight: 850; color: #0f172a; background: rgba(255,255,255,0.92); padding: 1px 4.5px; border-radius: 4px; border: 1px solid #cbd5e1; white-space: nowrap; box-shadow: 0 1px 3px rgba(0,0,0,0.1); text-align: center; text-transform: uppercase; letter-spacing: 0.1px;">
                ${p.name}
              </div>
            </div>
          `,
        iconSize: [0, 0]
      });
      const marker = L.marker([p.lat, p.lng], { icon: customIcon, interactive: true });
      if (isNumberMode) {
        marker.bindTooltip(p.name, { direction: 'top', className: 'bg-slate-800 text-white font-bold text-[9px] px-1.5 py-0.5 rounded shadow' });
      }
      marker.addTo(pg);
    });

    // Google Buildings
    const bg = L.featureGroup().addTo(previewMap);
    const bldList = (mapDataRef.current.symbols || []).filter(s => s.polygon != null);
    bldList.forEach(b => {
      if (!b.polygon || !b.polygon.coordinates) return;
      const latlngs = b.polygon.coordinates[0].map(([lng, lat]: any) => [lat, lng]);
      L.polygon(latlngs, { color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.2, weight: 1 }).addTo(bg);
    });

    setTimeout(() => {
      previewMap.invalidateSize();
    }, 200);

    return () => {
      previewMap.remove();
      previewMapRef.current = null;
    };
  }, [showPrintPreview, mapData.poiNamingApproach]);

  return (
    <div className="flex h-screen w-screen bg-slate-900 overflow-hidden font-public-sans text-slate-100 print:bg-white print:text-black">
      
      {/* Printable Title Strip (rendered only in Print View at the bottom) */}
      <div className="hidden print:flex absolute bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-white/95 border border-slate-300 px-6 py-2 rounded-full shadow-md items-center gap-6 text-[10px] font-bold text-slate-700 font-public-sans uppercase tracking-wide whitespace-nowrap">
        <span>📋 {printTitle || 'Nazari Naksha'}</span>
        <span className="w-px h-3 bg-slate-300"></span>
        <span>🏢 HLB: {hlbCode || '—'}</span>
        <span className="w-px h-3 bg-slate-300"></span>
        <span>📅 Date: {new Date().toLocaleDateString()}</span>
        <span className="w-px h-3 bg-slate-300"></span>
        <span>✍️ Inspector Sign: __________________</span>
      </div>

      {showPrintLegend && (
        <div className="hidden print:block absolute bottom-6 right-6 z-[9999] bg-white/95 border border-slate-200 p-3 rounded-lg shadow-md w-44">
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-1.5 mb-1.5">Legend</h4>
          <div className="space-y-1 text-[9px] font-semibold text-slate-600">
            <div className="flex items-center gap-1.5"><div className="w-3 h-1 border-t-2 border-dashed border-red-500"></div> Boundary Line</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1.5 bg-indigo-600/50 border border-indigo-600"></div> Google Building</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-1 bg-slate-800"></div> Roads/Highways</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-2 bg-sky-400/35 border border-sky-400"></div> Water Body</div>
          </div>
        </div>
      )}

      {/* Floating Controls Scrim Trigger (visible on mobile only) */}
      <button
        onClick={() => setSidebarOpen(true)}
        className="md:hidden fixed top-4 left-4 z-[999] bg-slate-800/90 hover:bg-slate-800 border border-slate-700 text-slate-200 p-2.5 rounded-xl shadow-lg flex items-center justify-center font-bold text-xs gap-1.5 active:scale-95 transition-all print:hidden cursor-pointer"
      >
        ⚙️ Controls
      </button>

      {/* Mobile drawer background backdrop scrim */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="md:hidden fixed inset-0 z-[1999] bg-black/60 backdrop-blur-xs transition-opacity duration-200 print:hidden"
        />
      )}

      {/* Left Settings & Controls Sidebar / Mobile Drawer (Hidden during browser printing) */}
      <div className={`
        fixed md:relative top-0 bottom-0 left-0 z-[2000] md:z-10
        w-[310px] sm:w-[350px] md:w-[380px] bg-slate-800 border-r border-slate-700/60 
        flex flex-col print:hidden transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        
        {/* Header */}
        <div className="p-4 border-b border-slate-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🛰️</span>
            <div>
              <h2 className="font-extrabold text-sm uppercase tracking-wider text-slate-200 leading-none">Sat-Extractor</h2>
              <span className="text-[10px] text-violet-400 font-bold tracking-widest uppercase mt-1 block">Satellite Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={onSaveAndExit}
              className="py-1.5 px-3 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs font-bold text-slate-200 transition-colors shadow-sm cursor-pointer"
            >
              Exit
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden p-2 text-slate-400 hover:text-slate-200 text-lg font-bold leading-none cursor-pointer"
            >
              ×
            </button>
          </div>
        </div>

        {/* Scrollable Setup & Control Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Form 1: Setup & Extract (if no boundary is present) */}
          {(!mapData.boundaryPins || mapData.boundaryPins.length === 0) && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">📐 Extract Boundary Polygon</h3>
              <form onSubmit={handleExtract} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">HLB Code (4 digits)</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={hlbCode}
                    onChange={e => setHlbCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="e.g. 0455"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Census GeoPDF File</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-bold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!!extractStatus}
                  className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
                >
                  {extractStatus ? 'Processing Extraction...' : 'Extract & Sync Boundary ⚡'}
                </button>
              </form>

              {extractError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-900/60 p-2.5 rounded-lg font-medium leading-relaxed">{extractError}</p>
              )}
            </div>
          )}

          {/* Interactive Custom Drawing Tools */}
          {mapData.boundaryPins && mapData.boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">✏️ Custom Editor Tools</h3>
              
              {drawingMode === 'none' ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      setDrawingMode('road');
                      setTempPoints([]);
                      if (window.innerWidth < 768) setSidebarOpen(false);
                    }}
                    className="py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold shadow transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
                  >
                    <span>🛣️</span>
                    <span>Draw Road</span>
                  </button>
                  <button
                    onClick={() => {
                      setDrawingMode('poi');
                      if (window.innerWidth < 768) setSidebarOpen(false);
                    }}
                    className="py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs font-bold shadow transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
                  >
                    <span>📍</span>
                    <span>Place Landmark</span>
                  </button>
                </div>
              ) : drawingMode === 'road' ? (
                <div className="space-y-3 bg-violet-950/20 border border-violet-800/40 p-3 rounded-lg">
                  <p className="text-xs font-bold text-violet-300">🛣️ DRAWING ROAD MODE</p>
                  <p className="text-[10px] text-slate-400 leading-snug">Click on the map to add road nodes. Click at least 2 points.</p>
                  <div className="text-[10px] font-mono text-slate-300 bg-slate-900 px-2 py-1 rounded">
                    Nodes Added: {tempPoints.length}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDrawingRoad}
                      disabled={tempPoints.length < 2}
                      className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Save Road
                    </button>
                    <button
                      onClick={handleUndoPoint}
                      disabled={tempPoints.length === 0}
                      className="py-2 px-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Undo
                    </button>
                    <button
                      onClick={handleCancelDrawingRoad}
                      className="py-2 px-2.5 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2 bg-violet-950/20 border border-violet-800/40 p-3 rounded-lg">
                  <p className="text-xs font-bold text-violet-300">📍 PLACE LANDMARK MODE</p>
                  <p className="text-[10px] text-slate-400 leading-snug">Click anywhere on the map to place a named landmark pin.</p>
                  <button
                    onClick={() => setDrawingMode('none')}
                    className="w-full py-2 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-bold transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <p className="text-[9px] text-slate-400 leading-snug">
                💡 Tip: Click on any existing road or landmark directly on the map to rename or delete it!
              </p>
            </div>
          )}

          {/* OSM Roads & Landmarks Manual Button */}
          {mapData.boundaryPins && mapData.boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-public-sans flex items-center justify-between">
                <span>🗺️ OSM Roads & Forests</span>
                {mapData.roads && mapData.roads.length > 0 && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">Fetched</span>
                )}
              </h3>
              <button
                onClick={() => triggerOSMFetch(mapData.boundaryPins)}
                disabled={!!extractStatus}
                className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all disabled:opacity-50"
              >
                {extractStatus && extractStatus.includes('OpenStreetMap') ? 'Fetching OSM Features...' : 'Fetch Roads & Landmarks (OSM) 🗺️'}
              </button>
              <p className="text-[9px] text-slate-400 leading-snug">Queries OpenStreetMap for roads, local rivers/ponds, forests, and landmarks.</p>
            </div>
          )}

          {/* Google Open Buildings Action */}
          {mapData.boundaryPins && mapData.boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🏠 Google Open Buildings</h3>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                  <span>CONFIDENCE THRESHOLD</span>
                  <span className="text-violet-400 font-mono">{(accuracy * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.05"
                  value={accuracy}
                  onChange={e => setAccuracy(parseFloat(e.target.value))}
                  className="w-full accent-violet-500 bg-slate-900 cursor-pointer h-1.5 rounded-lg"
                />
                <p className="text-[9px] text-slate-400 leading-snug">Higher value filters out low-confidence structures to match sat view.</p>
              </div>

              <button
                onClick={fetchGoogleBuildings}
                disabled={fetchingBuildings || !!extractStatus}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {fetchingBuildings ? 'Downloading Footprints...' : 'Fetch Building Footprints 🛰️'}
              </button>
            </div>
          )}

          {/* Layer Visibility Toggles */}
          <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">👁️ Toggle Map Layers</h3>
            <div className="space-y-2.5 text-xs text-slate-300">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showSatellite} onChange={e => setShowSatellite(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Google Satellite Hybrid</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showBoundary} onChange={e => setShowBoundary(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span className="flex items-center gap-2"><span className="w-3.5 h-0.5 border-t border-dashed border-red-500"></span> Red Boundary Line</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showRoads} onChange={e => setShowRoads(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Roads & Highways (OSM)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showRoadNames} onChange={e => setShowRoadNames(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Road Name Labels (Aligned)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showWater} onChange={e => setShowWater(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Water Bodies & Forests</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showPOIs} onChange={e => setShowPOIs(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Points of Interest (POIs)</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={showBuildings} onChange={e => setShowBuildings(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                <span>Building Footprints ({(mapData.symbols || []).filter(s => s.polygon != null).length})</span>
              </label>
            </div>
          </div>

          {/* Print Layout Section */}
          {mapData.boundaryPins && mapData.boundaryPins.length > 0 && (
            <div className="bg-slate-800/40 border border-slate-700/80 rounded-xl p-4 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">🖨️ Layout Customization</h3>
              
              <div className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">Map Title (Print header)</label>
                  <input
                    type="text"
                    value={printTitle}
                    onChange={e => setPrintTitle(e.target.value)}
                    placeholder="Nazari Naksha - HLB 0455"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-violet-500"
                  />
                </div>

                {/* POI Naming Toggle */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">POI Naming Approach</label>
                  <div className="grid grid-cols-2 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700">
                    <button
                      onClick={() => update({ poiNamingApproach: 'label' })}
                      className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                        (mapData.poiNamingApproach || 'label') === 'label'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Direct Label
                    </button>
                    <button
                      onClick={() => update({ poiNamingApproach: 'number' })}
                      className={`py-1.5 text-[10px] font-bold rounded transition-all cursor-pointer ${
                        (mapData.poiNamingApproach || 'label') === 'number'
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Numbered List
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-2.5 cursor-pointer select-none text-xs text-slate-300">
                  <input type="checkbox" checked={showPrintLegend} onChange={e => setShowPrintLegend(e.target.checked)} className="rounded accent-violet-500 border-slate-700 bg-slate-900 w-3.5 h-3.5" />
                  <span>Show Map Legend Box</span>
                </label>

                <button
                  onClick={() => setShowPrintPreview(true)}
                  className="w-full py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all cursor-pointer"
                >
                  Configure & Download PDF 🖨️
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-3 bg-slate-900/40 border-t border-slate-700/60 text-center">
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Powered by DuckDB & Google Earth Engine</p>
        </div>

      </div>

      {/* Main Map Workspace Canvas */}
      <div className="flex-1 relative bg-slate-950 flex flex-col h-full w-full">
        {/* Loading Overlay */}
        {extractStatus && (
          <div className="absolute inset-0 bg-slate-900/80 z-[1000] flex flex-col items-center justify-center space-y-4 print:hidden">
            <svg className="animate-spin h-10 w-10 text-violet-500" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm font-semibold text-slate-200 tracking-wide">{extractStatus}</p>
          </div>
        )}

        {/* Leaflet container */}
        <div ref={mapContainerRef} className="absolute inset-0 z-10 print:h-screen print:w-screen" style={{ height: '100%', width: '100%', minHeight: '100%' }} />

        {/* Map Workspace Instructions Overlay */}
        {(!mapData.boundaryPins || mapData.boundaryPins.length === 0) && !extractStatus && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-900/90 border border-slate-800 p-8 rounded-2xl max-w-sm text-center shadow-2xl z-20 print:hidden">
            <span className="text-5xl block mb-4">🗺️</span>
            <h3 className="font-extrabold text-lg text-slate-200 mb-2">Sat-Extractor Workspace</h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              Upload a Census layout PDF and enter the target 4-digit HLB code to load the georeferenced satellite editor mode.
            </p>
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Zero drawing required</p>
          </div>
        )}
      </div>

      {/* Print Styles Sheet injected to customize layout during browser print */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 5mm;
          }
          body, html, #root {
            height: 100% !important;
            width: 100% !important;
            background: white !important;
            color: black !important;
          }
          .print\\:hidden, 
          header, 
          nav, 
          button, 
          input, 
          .leaflet-control-zoom, 
          .leaflet-control-attribution {
            display: none !important;
          }
          .leaflet-tile-pane {
            display: none !important;
          }
          .print\\:h-screen {
            position: absolute !important;
            inset: 0 !important;
            height: 100vh !important;
            width: 100vw !important;
            z-index: 1 !important;
          }
          .leaflet-container {
            background: white !important;
          }
          .custom-road-label-container div {
            border-color: #475569 !important;
            box-shadow: none !important;
          }
        }
      `}</style>
      {/* ── DEDICATED PRINT & PDF ROTATION PREVIEW MODAL ── */}
      {showPrintPreview && (
        <div className="fixed inset-0 z-[3000] bg-slate-950/95 flex flex-col items-center justify-between p-4 sm:p-6 overflow-y-auto">
          
          {/* Header */}
          <div className="w-full max-w-5xl flex items-center justify-between border-b border-slate-800 pb-3 mb-2">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-200">A4 PDF Map Layout Preview</h2>
              <p className="text-[10px] text-slate-400 mt-0.5">Use pinch gestures or slider to rotate the map. Zoom and drag to align.</p>
            </div>
            <button
              onClick={() => setShowPrintPreview(false)}
              className="py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 transition-colors shadow-sm cursor-pointer"
            >
              Close Setup
            </button>
          </div>

          {/* Map Preview Page Wrapper */}
          <div 
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            className="flex-1 flex items-center justify-center w-full max-h-[70vh] py-4"
          >
            <div 
              className="relative bg-slate-900 shadow-2xl overflow-hidden border border-slate-700 rounded-xl transition-all duration-150"
              style={{
                width: isLandscape ? 'min(90vw, 560px)' : 'min(90vw, 396px)',
                height: isLandscape ? 'min(63vw, 396px)' : 'min(127vw, 560px)',
                aspectRatio: isLandscape ? '297/210' : '210/297'
              }}
            >
              {/* Actual Map Container */}
              <div 
                ref={previewMapContainerRef} 
                className="absolute inset-0 origin-center transition-transform duration-100 ease-out"
                style={{
                  transform: `rotate(${printRotation}deg)`,
                  width: '100%',
                  height: '100%'
                }}
              />
            </div>
          </div>

          {/* Controls Footer */}
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
            {/* Slider Rotation control */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                <span>ROTATE MAP ALIGNMENT</span>
                <span className="text-violet-400 font-mono">{printRotation}°</span>
              </div>
              <input
                type="range"
                min="0"
                max="360"
                step="1"
                value={printRotation}
                onChange={e => setPrintRotation(parseInt(e.target.value))}
                className="w-full accent-violet-500 bg-slate-950 cursor-pointer h-1.5 rounded-lg"
              />
            </div>

            {/* Toggle options for PDF elements */}
            <div className="grid grid-cols-2 gap-3 border-t border-slate-800 pt-3">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={showBuildingsInPdf}
                  onChange={e => setShowBuildingsInPdf(e.target.checked)}
                  className="rounded accent-violet-500 border-slate-800 bg-slate-950 w-3.5 h-3.5 animate-transition"
                />
                <span>Include Buildings in PDF</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer select-none text-[10px] font-bold text-slate-300">
                <input
                  type="checkbox"
                  checked={showArrowsInPdf}
                  onChange={e => setShowArrowsInPdf(e.target.checked)}
                  className="rounded accent-violet-500 border-slate-800 bg-slate-950 w-3.5 h-3.5 animate-transition"
                />
                <span>Include Arrows in PDF</span>
              </label>
            </div>

            {/* Page Settings */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">A4 PAGE ORIENTATION</label>
                <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setIsLandscape(true)}
                    className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${isLandscape ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'}`}
                  >
                    Landscape
                  </button>
                  <button
                    onClick={() => setIsLandscape(false)}
                    className={`py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${!isLandscape ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400'}`}
                  >
                    Portrait
                  </button>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleDownloadPDF}
                  className="w-full py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-lg text-xs font-black shadow-md hover:shadow-indigo-900/50 active:scale-95 transition-all cursor-pointer text-center uppercase tracking-wider"
                >
                  Download PDF Map 📥
                </button>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
