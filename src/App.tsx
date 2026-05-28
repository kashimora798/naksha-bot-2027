import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { MapData, RoadFeature, PlacedSymbol, Coordinate } from './types';
import AppHeader from './components/AppHeader';
import SMSParseScreen from './screens/SMSParseScreen';
import MapWorkspace from './screens/MapWorkspace';
import PreviewScreen from './screens/PreviewScreen';
import DashboardScreen from './screens/DashboardScreen';
import LiveSurveyScreen from './screens/LiveSurveyScreen';
import SessionsDashboard from './screens/SessionsDashboard';
import SessionDetailScreen from './screens/SessionDetailScreen';
import OnboardingScreen from './screens/OnboardingScreen';

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
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const navigate = useNavigate();
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
    const livePreviewId = params.get('live_preview_id');

    if (livePreviewId) {
      import('./lib/idb').then(({ idbStore }) => {
        idbStore.getSession(livePreviewId).then(session => {
           if (!session) return;
           Promise.all([
             idbStore.getSymbolsForSession(livePreviewId),
             idbStore.getSegmentsForSession(livePreviewId)
           ]).then(([symbols, segments]) => {
             const df = session.drawn_features ? JSON.parse(session.drawn_features) : { blocks: [], farmlandBlocks: [], forests: [], waterBodies: [], landuseAreas: [], landmarks: [] };
             let poly = null;
             if (session.polygon_geojson) try { poly = JSON.parse(session.polygon_geojson); } catch(e){}
             const center = poly && poly.geometry?.coordinates[0][0] ? { lat: poly.geometry.coordinates[0][0][1], lng: poly.geometry.coordinates[0][0][0] } : DEFAULT_MAP_DATA.center;
             
             const roadFeatures = segments.filter(seg => seg.points.length >= 2).map(seg => ({
                id: seg.segment_id,
                type: seg.type as any,
                points: seg.points
             }));

             setMapData({
               ...DEFAULT_MAP_DATA,
               hlbNumber: session.hlb_number || 'LIVE',
               center: center,
               symbols: symbols as any[],
               roads: roadFeatures,
               blocks: df.blocks,
               farmlandBlocks: df.farmlandBlocks,
               forests: df.forests,
               waterBodies: df.waterBodies,
               landuseAreas: df.landuseAreas,
               landmarks: df.landmarks,
               boundaryPins: poly ? poly.geometry.coordinates[0].map((c: any) => ({ lat: c[1], lng: c[0] })) : [],
               boundaryClosed: true,
               numberingComplete: true,
             });
             setStep(7);
           });
        });
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isPaymentSuccess && paymentProjectId) {
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

  useEffect(() => {
    if (session?.user?.id) {
      setProfileLoading(true);
      supabase.from('user_profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
        setUserProfile(data);
        setProfileLoading(false);
      });
    } else {
      setUserProfile(null);
      setProfileLoading(false);
    }
  }, [session]);

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
  if (!isLoaded || profileLoading) {
    return <div className="h-screen w-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mb-4 animate-bounce"><span className="text-2xl">🗺️</span></div>
      <p className="text-slate-500 font-bold font-[Baloo_2] animate-pulse">Loading NakshaBot...</p>
    </div>;
  }

  if (!isSignedIn) {
    return <div className="min-h-screen bg-gray-50 flex flex-col font-noto-sans text-[var(--color-charcoal)]">
      {step === 0 && <DashboardScreen 
        user={session?.user} 
        userProfile={userProfile}
        onLoadProject={(id, d) => { setProjectId(id); setMapData(prev => ({...prev, ...d, projectId: id, paymentStatus: (d as any).payment_status})); setStep(3); }} 
        onNewProject={(initialData) => { setMapData({ ...DEFAULT_MAP_DATA, ...initialData }); setProjectId(null); setStep(initialData?.hlbNumber ? 3 : 1); }} 
        onLiveSurvey={(initialData) => { 
          if (initialData) {
            update({ ...initialData });
          }
          setStep(10); 
        }}
        onResumeLiveSurvey={(id) => { setResumeSessionId(id); setStep(10); }}
        onDemoMap={() => { setMapData(DEFAULT_MAP_DATA); setProjectId(null); setIsDemoMode(true); setStep(2); }}
      />}
      
      {step === 1 && <SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} onBack={() => setStep(0)} isDemoMode={isDemoMode} />}
      
      {step === 10 && <LiveSurveyScreen onExit={() => { setStep(0); setResumeSessionId(null); }} resumeSessionId={resumeSessionId || undefined} />}
    </div>;
  }

  if (step === 0) {
    const needsOnboarding = !userProfile || !userProfile.onboarding_completed;
    
    if (needsOnboarding) {
      return <OnboardingScreen user={user} onComplete={(profile) => setUserProfile(profile)} />;
    }

    return (
      <DashboardScreen
        user={user}
        userProfile={userProfile}
        onLoadProject={(id, data) => {
          setProjectId(id);
          setIsDemoMode(false);
          setMapData({ ...DEFAULT_MAP_DATA, ...data, projectId: id, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          isInitialLoad.current = true;
          // Determine where to resume based on data
          if (data.blocks && data.blocks.length > 0) setStep(7);
          else if (data.symbols && data.symbols.length > 0) setStep(5);
          else if (data.roads && data.roads.length > 0) setStep(4);
          else if (data.boundaryClosed) setStep(3);
          else setStep(3);
        }}
        onNewProject={(initialData) => {
          setMapData({ ...DEFAULT_MAP_DATA, ...initialData, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          setProjectId(null);
          setIsDemoMode(false);
          isInitialLoad.current = true;
          setStep(initialData?.hlbNumber ? 3 : 1); // Skip SMS if we already have HLB
        }}
        onLiveSurvey={(initialData) => {
          if (initialData) {
            update({ ...initialData });
          }
          setStep(10);
        }}
        onResumeLiveSurvey={(sessionId) => {
          navigate(`/live-session/${sessionId}`);
        }}
        onDemoMap={() => {
          setMapData(DEFAULT_MAP_DATA);
          setProjectId(null);
          setIsDemoMode(true);
          setStep(2);
        }}
      />
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-gray-50 flex flex-col relative">
      {step >= 2 && step < 8 && (
        <AppHeader 
          currentStep={step} 
          setStep={setStep} 
          saveStatus={saveStatus} 
          onSaveAndExit={() => { forceSave(); setStep(0); setProjectId(null); setIsDemoMode(false); }} 
          inMap={inMap} 
        />
      )}
      <div className="flex-1 relative overflow-hidden min-h-0">
        {step === 2 && <div className="h-full overflow-auto"><SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} isDemoMode={isDemoMode} /></div>}
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
          isDemoMode={isDemoMode}
          onDemoComplete={() => setIsDemoMode(false)}
        />}
        {(step === 7) && (
          <div className="h-full">
            <PreviewScreen
              mapData={mapData}
              onBack={() => setStep(5)}
              onExitToDashboard={() => { forceSave(); setStep(0); setProjectId(null); setIsDemoMode(false); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
