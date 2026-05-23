import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import type { MapData } from './types';
import ProgressBar from './components/ProgressBar';
import SMSParseScreen from './screens/SMSParseScreen';
import MapWorkspace from './screens/MapWorkspace';
import PreviewScreen from './screens/PreviewScreen';
import DashboardScreen from './screens/DashboardScreen';
import LandingScreen from './screens/LandingScreen';

const DEFAULT_MAP_DATA: MapData = {
  hlbNumber: '', center: { lat: 26.4499, lng: 80.3319 },
  district: '', state: '', enumeratorName: '', chargeOfficer: '',
  boundaryPins: [], boundaryClosed: false, roads: [], roadsConfirmed: false,
  symbols: [], numberingComplete: false, blocks: [], orientation: 'portrait',
  farmlandBlocks: [], waterBodies: [], forests: [], landmarks: [], areaStats: null,
};

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [step, setStep] = useState(0); // 0 = Dashboard
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData>(DEFAULT_MAP_DATA);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');

  // To track when we should actually save vs initial load
  const isInitialLoad = useRef(true);

  const update = useCallback((u: Partial<MapData>) => setMapData(p => ({ ...p, ...u })), []);
  const inMap = step >= 3 && step <= 6;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    const params = new URLSearchParams(window.location.search);
    const isPaymentSuccess = params.get('payment') === 'success';
    const paymentProjectId = params.get('project_id');

    if (isPaymentSuccess && paymentProjectId) {
      // 1. Force update the DB locally so they don't have to wait for the webhook
      supabase.from('projects').update({ payment_status: 'paid' }).eq('id', paymentProjectId).then(() => {
        // 2. Fetch the project
        supabase.from('projects').select('*').eq('id', paymentProjectId).single().then(({data}) => {
          if (data) {
             setProjectId(data.id);
             setMapData({ 
               ...DEFAULT_MAP_DATA, 
               ...data.data, 
               projectId: data.id, 
               paymentStatus: 'paid', 
               exportCount: data.export_count, 
               autoExport: true 
             });
             setStep(7); // Jump straight to preview screen
          }
        });
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isPaymentSuccess) {
      alert('Payment successful! Your export is now unlocked.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => subscription.unsubscribe();
  }, []);

  const isSignedIn = !!session;
  const user = session?.user;

  useEffect(() => {
    if (isSignedIn && step > 0) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
      document.documentElement.style.height = '100vh';
    } else {
      document.body.style.overflow = 'auto';
      document.body.style.height = 'auto';
      document.documentElement.style.height = 'auto';
    }
  }, [isSignedIn, step]);

  // ─── AUTO-SAVE LOGIC ──────────────────────────────────────
  useEffect(() => {
    // Don't auto-save if we're not past the setup steps
    if (step < 3 || !isSignedIn || isInitialLoad.current) {
      if (step >= 3) isInitialLoad.current = false;
      return;
    }

    const saveTimer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        const name = `HLB ${mapData.hlbNumber || 'Draft'}`;

        if (projectId) {
          // Update existing
          const { error } = await supabase
            .from('projects')
            .update({ name, data: mapData, updated_at: new Date().toISOString() })
            .eq('id', projectId);
          if (error) throw error;
        } else {
          // Create new
          const { data, error } = await supabase
            .from('projects')
            .insert({ user_id: user?.id, name, data: mapData })
            .select('id')
            .single();
          if (error) throw error;
          setProjectId(data.id);
          setMapData(prev => ({ ...prev, projectId: data.id }));
        }
        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('error');
      }
    }, 2000); // 2 second debounce

    return () => clearTimeout(saveTimer);
  }, [mapData, projectId, step, isSignedIn, user?.id]);

  const forceSave = async () => {
    if (!isSignedIn || !projectId) return;
    try {
      const name = `HLB ${mapData.hlbNumber || 'Draft'}`;
      await supabase
        .from('projects')
        .update({ name, data: mapData, updated_at: new Date().toISOString() })
        .eq('id', projectId);
    } catch (err) {
      console.error('Force save failed', err);
    }
  };

  // ─── RENDERERS ───────────────────────────────────────────
  if (!isLoaded) {
    return <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!isSignedIn) {
    return <LandingScreen />;
  }

  if (step === 0) {
    return (
      <DashboardScreen
        user={user}
        onLoadProject={(id, data) => {
          setProjectId(id);
          setMapData({ ...DEFAULT_MAP_DATA, ...data, projectId: id, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          isInitialLoad.current = true;
          // Determine where to resume based on data
          if (data.blocks && data.blocks.length > 0) setStep(7);
          else if (data.symbols && data.symbols.length > 0) setStep(5);
          else if (data.roads && data.roads.length > 0) setStep(4);
          else if (data.boundaryClosed) setStep(3);
          else setStep(3);
        }}
        onNewProject={() => {
          setProjectId(null);
          setMapData({ ...DEFAULT_MAP_DATA, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          isInitialLoad.current = true;
          setStep(2); // SMS Parse step
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col relative">
      {/* Auto-save indicator */}
      {inMap && (
        <div className="absolute top-2 right-4 z-50 pointer-events-none">
          <span className={`text-xs px-2 py-1 rounded-full bg-white/90 shadow ${saveStatus === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
            {saveStatus === 'saving' ? '⏳ Saving...' : saveStatus === 'saved' ? '✓ Saved' : '⚠️ Save Failed'}
          </span>
        </div>
      )}

      {step >= 2 && step <= 7 && <div className="flex-shrink-0"><ProgressBar currentStep={step} /></div>}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {step === 2 && <div className="h-full overflow-auto"><SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} /></div>}
        {inMap && <MapWorkspace
          step={step} center={mapData.center} boundaryPins={mapData.boundaryPins} boundaryClosed={mapData.boundaryClosed}
          roads={mapData.roads} symbols={mapData.symbols} hlbNumber={mapData.hlbNumber} blocks={mapData.blocks} farmlandBlocks={mapData.farmlandBlocks}
          waterBodies={mapData.waterBodies} forests={mapData.forests} landmarks={mapData.landmarks} areaStats={mapData.areaStats}
          onUpdateBoundary={(p, c) => update({ boundaryPins: p, boundaryClosed: c })}
          onUpdateRoads={r => update({ roads: r })}
          onUpdateSymbols={s => update({ symbols: s, numberingComplete: s.filter(x => x.number !== null).length > 0 })}
          onUpdateBlocks={b => update({ blocks: b })}
          onUpdateFarmland={f => update({ farmlandBlocks: f })}
          onUpdateWater={w => update({ waterBodies: w })}
          onUpdateForests={f => update({ forests: f })}
          onUpdateLandmarks={l => update({ landmarks: l })}
          onUpdateStats={s => update({ areaStats: s })}
          onUpdateOrientation={o => update({ orientation: o })}
          onStepComplete={() => setStep(s => s + 1)}
          onJumpToPreview={() => setStep(7)}
        />}
        {(step === 7 || step === 8) && (
          <div className="h-full">
            <PreviewScreen
              mapData={mapData}
              onBack={() => setStep(5)}
              onExitToDashboard={() => { forceSave(); setStep(0); setProjectId(null); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
