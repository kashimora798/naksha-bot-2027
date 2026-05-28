import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { idbStore } from '../lib/idb';
import { SurveySession, SurveySymbol, SurveyPoint, RoadSegment } from '../types';
import L from 'leaflet';
import { generateOfficialRegister, generateLiveExportPdf } from '../lib/pdf-export';

export default function SessionDetailScreen() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SurveySession | null>(null);
  const [symbols, setSymbols] = useState<SurveySymbol[]>([]);
  const [path, setPath] = useState<SurveyPoint[]>([]);
  const [roads, setRoads] = useState<RoadSegment[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'MAP' | 'HOUSES' | 'EXPORT'>('MAP');
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;
      try {
        const s = await idbStore.getSession(id);
        if (s) setSession(s as SurveySession);
        
        const sym = await idbStore.getSymbolsForSession(id);
        setSymbols(sym);
        
        const pts = await idbStore.getPointsForSession(id);
        setPath(pts);
        
        const rds = await idbStore.getSegmentsForSession(id);
        setRoads(rds);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [id]);

  useEffect(() => {
    if (activeTab === 'MAP' && !loading && session && mapContainerRef.current) {
      if (mapRef.current) return;
      
      const map = L.map(mapContainerRef.current, { zoomControl: false, attributionControl: false }).setView([20, 78], 18);
      L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 21 }).addTo(map);
      
      const bounds = L.latLngBounds([]);
      
      // Draw Boundary
      if (session.polygon_geojson) {
        try {
          const geojson = JSON.parse(session.polygon_geojson);
          const layer = L.geoJSON(geojson, { style: { color: '#FF6B00', weight: 3, fill: false } }).addTo(map);
          bounds.extend(layer.getBounds());
        } catch(e) {}
      }
      
      // Draw Path
      if (path.length > 1) {
        const latlngs = path.map(p => [p.lat, p.lng] as L.LatLngExpression);
        const polyline = L.polyline(latlngs, { color: '#000', weight: 4 }).addTo(map);
        L.polyline(latlngs, { color: '#fff', weight: 2, dashArray: '5,5' }).addTo(map);
        bounds.extend(polyline.getBounds());
      }
      
      // Draw Symbols
      symbols.forEach(sym => {
        const isHouse = ['pucca_house', 'kutcha_house'].includes(sym.symbol_type as string);
        const html = `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:white;border-radius:50%;border:2px solid ${isHouse ? '#22c55e' : '#6b7280'};font-size:10px;font-weight:bold">${sym.number || ''}</div>`;
        L.marker([sym.lat, sym.lng], { icon: L.divIcon({ html, className: '', iconSize: [24,24] }) }).addTo(map);
        bounds.extend([[sym.lat, sym.lng]]);
      });
      
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [20, 20] });
      }
      
      mapRef.current = map;
    }
  }, [activeTab, loading, session, path, symbols]);

  if (loading) return <div className="p-8 text-center">Loading...</div>;
  if (!session) return <div className="p-8 text-center text-red-500">Session not found</div>;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
      <header className="bg-white shadow-sm px-4 py-4 flex flex-col gap-4 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/live-dashboard')} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-95">
            ←
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-800">HLB {session.hlb_number}</h1>
            <p className="text-xs text-gray-500 font-medium">{session.location_name}</p>
          </div>
        </div>

        <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
          <button onClick={() => setActiveTab('MAP')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'MAP' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Map View
          </button>
          <button onClick={() => setActiveTab('HOUSES')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'HOUSES' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Houses ({symbols.filter(s => s.number).length})
          </button>
          <button onClick={() => setActiveTab('EXPORT')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${activeTab === 'EXPORT' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            Export
          </button>
        </div>
      </header>

      <div className="flex-1 relative">
        {activeTab === 'MAP' && (
          <div ref={mapContainerRef} className="absolute inset-0 bg-gray-200" />
        )}

        {activeTab === 'HOUSES' && (
          <div className="p-4 flex flex-col gap-3">
            {symbols.filter(s => s.number).sort((a,b) => parseInt(a.number || '0') - parseInt(b.number || '0')).map(sym => (
              <div key={sym.symbol_id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-black text-xl flex-shrink-0">
                  {sym.number}
                </div>
                <div className="flex-1">
                  <h4 className="font-bold text-gray-800 text-sm">
                    {sym.col_10_head_name || sym.head_of_household || <span className="italic text-gray-400">नाम नहीं भरा</span>}
                  </h4>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold uppercase">
                      {sym.symbol_type.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium tracking-wide">
                      {sym.col_9_family_count ? `${sym.col_9_family_count} Families` : ''} 
                      {sym.col_11_total_rooms ? ` • ${sym.col_11_total_rooms} Rooms` : ''}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className={`text-xs font-bold ${sym.form_fill_percentage === 100 ? 'text-green-600' : 'text-orange-500'}`}>
                    {sym.form_fill_percentage || 0}%
                  </span>
                  <div className="w-16 h-1.5 bg-gray-100 rounded-full mt-1 overflow-hidden">
                    <div className={`h-full ${sym.form_fill_percentage === 100 ? 'bg-green-500' : 'bg-orange-400'}`} style={{ width: `${sym.form_fill_percentage || 0}%` }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'EXPORT' && (
          <div className="p-4 flex flex-col gap-4">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-black text-gray-800 mb-2">Nazari Naksha PDF</h3>
              <p className="text-xs text-gray-500 mb-4">Official A4 format map with legend and boundary markings.</p>
              <button 
                onClick={async () => {
                  const btn = document.activeElement as HTMLButtonElement;
                  if (btn) btn.innerText = 'Generating...';
                  try {
                    await generateLiveExportPdf(session, symbols, path, roads, (msg) => {
                      if (btn) btn.innerText = msg;
                    });
                  } finally {
                    if (btn) btn.innerText = 'Download Sketch Map PDF';
                  }
                }}
                className="w-full bg-[var(--color-saffron)] text-white font-bold py-3 rounded-xl shadow active:scale-95 transition-all"
              >
                Download Sketch Map PDF
              </button>
            </div>

            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="font-black text-gray-800 mb-2">Official HLO Register</h3>
              <p className="text-xs text-gray-500 mb-4">PDF export of all marked houses and detailed schedule data.</p>
              <button 
                onClick={async () => {
                  await generateOfficialRegister(session, symbols);
                }}
                className="w-full bg-gray-800 text-white font-bold py-3 rounded-xl shadow active:scale-95 transition-all"
              >
                Download Register PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
