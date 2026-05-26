import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { MapData, RoadFeature, PlacedSymbol, Coordinate } from './types';
import ProgressBar from './components/ProgressBar';
import SMSParseScreen from './screens/SMSParseScreen';
import MapWorkspace from './screens/MapWorkspace';
import PreviewScreen from './screens/PreviewScreen';
import DashboardScreen from './screens/DashboardScreen';
import LiveSurveyScreen from './screens/LiveSurveyScreen';

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
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);

  const update = useCallback((u: Partial<MapData>) => setMapData(p => ({ ...p, ...u })), []);
  const inMap = step >= 3 && step <= 6;

  // ─── SESSION STORAGE PERSISTENCE ────────────────────────
  useEffect(() => {
    // Check session storage on initial load
    const savedStep = sessionStorage.getItem('app_step');
    const savedProjectId = sessionStorage.getItem('app_project_id');
    const savedMapData = sessionStorage.getItem('app_map_data');

    const params = new URLSearchParams(window.location.search);
    const isPaymentSuccess = params.get('payment') === 'success';

    if (!isPaymentSuccess) {
      if (savedProjectId) {
        setProjectId(savedProjectId);
        if (savedStep) setStep(Number(savedStep));
        // We will fetch from supabase in a moment, but load from session storage instantly to avoid flicker
        if (savedMapData) {
          try { setMapData(JSON.parse(savedMapData)); } catch(e) {}
        }
        // Fetch latest from DB
        supabase.from('projects').select('*').eq('id', savedProjectId).single().then(({data}) => {
          if (data) {
            setMapData(prev => ({ ...prev, ...data.data, projectId: data.id, paymentStatus: data.payment_status }));
          }
        });
      } else if (savedStep && Number(savedStep) > 0) {
        setStep(Number(savedStep));
        if (savedMapData) {
          try { setMapData(JSON.parse(savedMapData)); } catch(e) {}
        }
      }
    }
  }, []);

  // Save state to session storage whenever it changes
  useEffect(() => {
    if (step > 0) {
      sessionStorage.setItem('app_step', step.toString());
      if (projectId) {
        sessionStorage.setItem('app_project_id', projectId);
      }
      try {
        sessionStorage.setItem('app_map_data', JSON.stringify(mapData));
      } catch (e) {
        console.warn('Could not save mapData to session storage (might be too large)');
      }
    } else {
      // Step 0 means Dashboard - clear session storage
      sessionStorage.removeItem('app_step');
      sessionStorage.removeItem('app_project_id');
      sessionStorage.removeItem('app_map_data');
    }
  }, [step, projectId, mapData]);

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
  // Strip huge base64 strings before saving to database
  const getCleanData = (data: typeof mapData) => {
    const clean = { ...data };
    delete clean.surveyMapBase64;
    delete clean.aiMapChunks;
    return clean;
  };

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
        const dataToSave = getCleanData(mapData);

        if (projectId) {
          // Update existing
          const { error } = await supabase
            .from('projects')
            .update({ name, data: dataToSave, updated_at: new Date().toISOString() })
            .eq('id', projectId);
          if (error) throw error;
        } else {
          // Create new
          const { data, error } = await supabase
            .from('projects')
            .insert({ user_id: user?.id, name, data: dataToSave })
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
      const dataToSave = getCleanData(mapData);
      await supabase
        .from('projects')
        .update({ name, data: dataToSave, updated_at: new Date().toISOString() })
        .eq('id', projectId);
    } catch (err) {
      console.error('Force save failed', err);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (projectId && isSignedIn) {
        forceSave();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [mapData, projectId, isSignedIn]);

  // ═══════════════════════════════════════════════════════════
  // RENDERERS
  // ═══════════════════════════════════════════════════════════───────────────────────────────────────────
  if (!isLoaded) {
    return <div className="h-screen w-screen bg-gray-50 flex items-center justify-center">Loading...</div>;
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace />;
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
        onLiveSurvey={() => {
          setProjectId(null);
          setResumeSessionId(null);
          setMapData({ ...DEFAULT_MAP_DATA, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          isInitialLoad.current = true;
          setStep(8); // Live Survey step
        }}
        onResumeLiveSurvey={(sessionId) => {
          setResumeSessionId(sessionId);
          setStep(8);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col relative">
      {/* Header controls */}
      {inMap && (
        <div className="absolute top-2 right-12 flex items-center gap-2" style={{ zIndex: 2000 }}>
          <span className={`text-xs px-2 py-1 rounded-full bg-white/90 shadow pointer-events-none ${saveStatus === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
            {saveStatus === 'saving' ? '⏳ Saving...' : saveStatus === 'saved' ? '✓ Saved' : '⚠️ Save Failed'}
          </span>
          <button 
            onClick={() => { forceSave(); setStep(0); setProjectId(null); }} 
            className="bg-white shadow px-3 py-1 rounded-full text-xs font-bold text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors"
          >
            ← Exit & Save
          </button>
        </div>
      )}

      {step >= 2 && step <= 7 && <div className="flex-shrink-0"><ProgressBar currentStep={step} /></div>}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {step === 2 && <div className="h-full overflow-auto"><SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} /></div>}
        {inMap && <MapWorkspace
          step={step} center={mapData.center} boundaryPins={mapData.boundaryPins} boundaryClosed={mapData.boundaryClosed}
          roads={mapData.roads} symbols={mapData.symbols} hlbNumber={mapData.hlbNumber} blocks={mapData.blocks} farmlandBlocks={mapData.farmlandBlocks}
          waterBodies={mapData.waterBodies} forests={mapData.forests} landuseAreas={mapData.landuseAreas} landmarks={mapData.landmarks} areaStats={mapData.areaStats}
          onUpdateBoundary={(p: Coordinate[], c: boolean) => update({ boundaryPins: p, boundaryClosed: c })}
          onUpdateRoads={(r: RoadFeature[]) => update({ roads: r })}
          onUpdateSymbols={(s: PlacedSymbol[]) => update({ symbols: s, numberingComplete: s.filter(x => x.number !== null).length > 0 })}
          onUpdateBlocks={b => update({ blocks: b })}
          onUpdateFarmland={f => update({ farmlandBlocks: f })}
          onUpdateWater={w => update({ waterBodies: w })}
          onUpdateForests={f => update({ forests: f })}
          onUpdateLandmarks={l => update({ landmarks: l })}
          onUpdateStats={s => update({ areaStats: s })}
          onUpdateOrientation={o => update({ orientation: o })}
          onUpdateMapData={update}
          onStepComplete={() => setStep(s => s + 1)}
          onJumpToPreview={() => setStep(7)}
        />}
        {(step === 7) && (
          <div className="h-full">
            <PreviewScreen
              mapData={mapData}
              onBack={() => setStep(5)}
              onExitToDashboard={() => { forceSave(); setStep(0); setProjectId(null); }}
            />
          </div>
        )}
        {step === 8 && (
          <LiveSurveyScreen 
             resumeSessionId={resumeSessionId || undefined}
             onExit={() => { setStep(0); setProjectId(null); setResumeSessionId(null); }}
             onSaveAsDraft={() => { setStep(0); setProjectId(null); setResumeSessionId(null); }}
          />
        )}
      </div>
    </div>
  );
}
