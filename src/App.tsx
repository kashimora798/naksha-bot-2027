import { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import type { MapData, RoadFeature, PlacedSymbol, Coordinate } from './types';
import { isHouseType } from './types';
import AppHeader from './components/AppHeader';
import SMSParseScreen from './screens/SMSParseScreen';
import MapWorkspace from './screens/MapWorkspace';
import PreviewScreen from './screens/PreviewScreen';
import AIMapStep from './screens/AIMapStep';
import DashboardScreen from './screens/DashboardScreen';
import LiveSurveyScreen from './screens/LiveSurveyScreen';
import SessionsDashboard from './screens/SessionsDashboard';
import SessionDetailScreen from './screens/SessionDetailScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import { ErrorBoundary } from './components/ErrorBoundary';

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
  // Furthest step the user has reached in this project. Steps unlock once
  // reached and stay unlocked — going back doesn't re-lock later steps.
  const [maxStep, setMaxStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData>(DEFAULT_MAP_DATA);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [justPaid, setJustPaid] = useState(false); // show the thank-you screen once after a successful payment
  const [userProfile, setUserProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const navigate = useNavigate();
  // To track when we should actually save vs initial load
  const isInitialLoad = useRef(true);
  const [resumeSessionId, setResumeSessionId] = useState<string | null>(null);

  const update = useCallback((u: Partial<MapData>) => setMapData(p => ({ ...p, ...u })), []);
  // inMap: true for all map-workspace steps (3–6). MapWorkspace is ALWAYS mounted
  // once entered (just hidden with display:none) so the Leaflet map instance is
  // never destroyed on tab switches or when preview/other screens overlay it.
  const hasEnteredMap = step >= 3 && step <= 8;
  const inMap = step >= 3 && step <= 6;

  // Title-block particulars seeded from the user's profile (Phase 2). Saved project
  // data overrides these; new projects inherit them so the PDF title block is filled.
  const profileMapDefaults = (): Partial<MapData> => ({
    enumeratorName: userProfile?.full_name || user?.user_metadata?.full_name || user?.email || 'Surveyor',
    supervisorName: userProfile?.supervisor_name || '',
    tehsil: userProfile?.tehsil || '',
    townVillage: userProfile?.town_village || '',
    wardNo: userProfile?.ward_no || '',
    ebNo: userProfile?.eb_no || '',
  });

  // ─── LOCAL STORAGE PERSISTENCE ────────────────────────
  useEffect(() => {
    // Check local storage on initial load
    const savedStep = localStorage.getItem('app_step');
    const savedMaxStep = localStorage.getItem('app_max_step');
    const savedProjectId = localStorage.getItem('app_project_id');
    const savedMapData = localStorage.getItem('app_map_data');

    const params = new URLSearchParams(window.location.search);
    const isPaymentSuccess = params.get('payment') === 'success';

    if (!isPaymentSuccess) {
      if (savedMaxStep) setMaxStep(Number(savedMaxStep));
      if (savedProjectId) {
        setProjectId(savedProjectId);
        if (savedStep) setStep(Number(savedStep));
        // We will fetch from supabase in a moment, but load from local storage instantly to avoid flicker
        if (savedMapData) {
          try { setMapData(JSON.parse(savedMapData)); } catch(e) {}
        }
        // Fetch latest from DB
        supabase.from('projects').select('*').eq('id', savedProjectId).single().then(({data}) => {
          if (data) {
            // Replace entirely with DB data (don't merge with stale localStorage)
            setMapData({ ...data.data, projectId: data.id, paymentStatus: data.payment_status });
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

  // Save state to local storage whenever it changes
  useEffect(() => {
    if (step > 0) {
      localStorage.setItem('app_step', step.toString());
      localStorage.setItem('app_max_step', maxStep.toString());
      if (projectId) {
        localStorage.setItem('app_project_id', projectId);
      }
      try {
        localStorage.setItem('app_map_data', JSON.stringify(mapData));
      } catch (e) {
        console.warn('Could not save mapData to local storage (might be too large)');
      }
    } else {
      // Step 0 means Dashboard - clear local storage
      localStorage.removeItem('app_step');
      localStorage.removeItem('app_max_step');
      localStorage.removeItem('app_project_id');
      localStorage.removeItem('app_map_data');
    }
  }, [step, projectId, mapData, maxStep]);

  // Track the furthest step reached. Bump-only while in a project (going back
  // never re-locks later steps), and reset to 0 when the user lands on the
  // dashboard so a fresh project starts locked again. The first run is skipped
  // so a restored maxStep (from localStorage on refresh) isn't clobbered before
  // the saved step is applied.
  const didInitMax = useRef(false);
  useEffect(() => {
    if (!didInitMax.current) { didInitMax.current = true; return; }
    if (step === 0) setMaxStep(0);
    else setMaxStep(m => Math.max(m, step));
  }, [step]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoaded(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Only update session state when the user identity changes (sign in/out).
      // Silent token refreshes keep the same user.id — updating state for those
      // would trigger a full App re-render and cause MapWorkspace to re-mount
      // (destroying the Leaflet map) every time the browser refreshes the JWT
      // on tab focus. We compare user IDs to skip no-op updates.
      setSession((prev: any) => {
        const prevId = (prev as any)?.user?.id ?? null;
        const nextId = newSession?.user?.id ?? null;
        if (prevId === nextId) return prev; // same user — skip re-render
        return newSession;
      });
    });

    const params = new URLSearchParams(window.location.search);
    const isPaymentSuccess = params.get('payment') === 'success';
    const paymentProjectId = params.get('project_id');
    const paymentKind = params.get('kind');
    const livePreviewId = params.get('live_preview_id');

    if (livePreviewId) {
      import('./lib/idb').then(({ idbStore }) => {
        idbStore.getSession(livePreviewId).then(async (session) => {
           if (!session) return;
           let paymentStatus = 'unpaid';
           try {
             const { data: { session: authSession } } = await supabase.auth.getSession();
             if (authSession?.user) {
               const { data: liveExp } = await supabase.from('live_exports')
                 .select('payment_status')
                 .eq('session_id', livePreviewId)
                 .maybeSingle();
               if (liveExp) {
                 paymentStatus = liveExp.payment_status;
               }
             }
           } catch (e) {
             console.error('Failed to fetch live export status:', e);
           }
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
                coords: seg.points,
                highway: seg.road_type || 'residential',
                confirmed: true,
                source: 'user' as const,
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
               projectId: livePreviewId,
               isLive: true,
               paymentStatus: paymentStatus,
             });
             setStep(8);
            });
        });
      });
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isPaymentSuccess && paymentProjectId) {
      // Cashfree redirected back here. We MUST wait for the auth session to fully
      // restore after the full-page redirect before calling any Supabase function
      // or RLS-protected query. Using onAuthStateChange guarantees we have a valid
      // session, unlike getSession() which may return null during hydration.
      (async () => {
        // Step 1: Wait for a valid auth session (up to 15 seconds)
        let authSession: any = null;
        const { data: { session: immediateSession } } = await supabase.auth.getSession();
        if (immediateSession?.access_token) {
          authSession = immediateSession;
        } else {
          // Session not ready yet — wait for onAuthStateChange to fire
          authSession = await new Promise<any>((resolve) => {
            const timeout = setTimeout(() => resolve(null), 15000);
            const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_evt, sess) => {
              if (sess?.access_token) {
                clearTimeout(timeout);
                authSub.unsubscribe();
                resolve(sess);
              }
            });
          });
        }

        if (!authSession) {
          console.error('Auth session not available after payment redirect');
          alert('Session expired — please sign in again to access your download.');
          setStep(0);
          return;
        }

        // Step 2: Verify payment server-side (with retries)
        let isPaid = false;
        try {
          for (let attempt = 0; attempt < 4; attempt++) {
            const { data, error } = await supabase.functions.invoke('verify-payment', {
              body: { projectId: paymentProjectId, kind: paymentKind === 'live' ? 'live' : 'project' },
            });
            if (!error && data?.paid) {
              isPaid = true;
              break;
            }
            await new Promise(r => setTimeout(r, 2000)); // 2s between retries
          }
        } catch (e) { console.error('verify-payment failed', e); }

        if (paymentKind === 'live') {
          // Load live session from IndexedDB
          import('./lib/idb').then(({ idbStore }) => {
            idbStore.getSession(paymentProjectId).then((session) => {
              if (!session) {
                alert('Payment verified! But we could not find your live session locally.');
                setStep(0);
                return;
              }
              Promise.all([
                idbStore.getSymbolsForSession(paymentProjectId),
                idbStore.getSegmentsForSession(paymentProjectId)
              ]).then(([symbols, segments]) => {
                const df = session.drawn_features ? JSON.parse(session.drawn_features) : { blocks: [], farmlandBlocks: [], forests: [], waterBodies: [], landuseAreas: [], landmarks: [] };
                let poly = null;
                if (session.polygon_geojson) try { poly = JSON.parse(session.polygon_geojson); } catch(e){}
                const center = poly && poly.geometry?.coordinates[0][0] ? { lat: poly.geometry.coordinates[0][0][1], lng: poly.geometry.coordinates[0][0][0] } : DEFAULT_MAP_DATA.center;
                
                const roadFeatures = segments.filter(seg => seg.points.length >= 2).map(seg => ({
                   id: seg.segment_id,
                   coords: seg.points,
                   highway: seg.road_type || 'residential',
                   confirmed: true,
                   source: 'user' as const,
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
                  projectId: paymentProjectId,
                  isLive: true,
                  paymentStatus: isPaid ? 'paid' : 'unpaid'
                });
                setJustPaid(isPaid);
                setStep(8);
              });
            });
          });
        } else {
          // Step 3: Load the project (with retries, 2s apart)
          let data: any = null;
          for (let i = 0; i < 6 && !data; i++) {
            const r = await supabase.from('projects').select('*').eq('id', paymentProjectId).maybeSingle();
            data = r.data;
            if (!data) await new Promise(res => setTimeout(res, 2000));
          }
          if (data) {
            setProjectId(data.id);
            setMapData({
              ...DEFAULT_MAP_DATA,
              ...data.data,
              projectId: data.id,
              paymentStatus: data.payment_status,
              exportCount: data.export_count,
            });
             setJustPaid(data.payment_status === 'paid');
            setStep(8); // Always land on the preview/download screen.
          } else {
            console.error('Could not load project after payment');
            alert('Payment verified! But we could not load your map. Please go to Dashboard and open your project.');
            setStep(0);
          }
        }
      })();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (isPaymentSuccess) {
      alert('Payment successful! Your export is now unlocked.');
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => subscription.unsubscribe();
  }, []);

  // Track previous user id to avoid re-fetching profile on silent token refreshes.
  const prevUserId = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user?.id ?? null;
    if (uid === prevUserId.current) return; // same user — skip profile re-fetch
    prevUserId.current = uid;
    if (uid) {
      setProfileLoading(true);
      supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle().then(({ data, error }) => {
        if (error && error.code !== 'PGRST116') console.error('Error fetching profile:', error);
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
    // Don't auto-save if we're not past the setup steps, or if this is the
    // guided demo/tour — tour runs are throwaway and must never hit the DB.
    if (step < 3 || !isSignedIn || isDemoMode || isInitialLoad.current) {
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
  }, [mapData, projectId, step, isSignedIn, user?.id, isDemoMode]);

  const forceSave = async () => {
    if (!isSignedIn || !projectId || isDemoMode) return;
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
      if (projectId && isSignedIn && !isDemoMode) {
        forceSave();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [mapData, projectId, isSignedIn, isDemoMode]);

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
    // Signed-out users can still use demo maps (steps 2-8) and live survey (step 10).
    // Only the dashboard (0), SMS (1) and live survey (10) have dedicated signed-out
    // screens; steps 2-8 fall through to the shared map shell below so navigation
    // never lands on a blank screen.
    if (step === 0) {
      return <div className="min-h-screen bg-gray-50 flex flex-col font-noto-sans text-[var(--color-charcoal)]">
        <DashboardScreen
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
        />
      </div>;
    }

    if (step === 1) {
      return <div className="min-h-screen bg-gray-50 flex flex-col font-noto-sans text-[var(--color-charcoal)]">
        <SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} onBack={() => setStep(0)} isDemoMode={isDemoMode} />
      </div>;
    }

    if (step === 10) {
      return <div className="min-h-screen bg-gray-50 flex flex-col font-noto-sans text-[var(--color-charcoal)]">
        <ErrorBoundary>
          <LiveSurveyScreen onExit={() => { setStep(0); setResumeSessionId(null); }} resumeSessionId={resumeSessionId || undefined} />
        </ErrorBoundary>
      </div>;
    }
    // steps 2-8 fall through to the shared map shell below
  }

  if (isSignedIn && step === 0) {
    const needsOnboarding = !userProfile || !userProfile.onboarding_completed;
    
    if (needsOnboarding) {
      return <OnboardingScreen user={user} onComplete={(profile) => setUserProfile(profile)} />;
    }

    return (
      <DashboardScreen
        user={user}
        userProfile={userProfile}
        onProfileUpdated={(prof) => setUserProfile(prof)}
        onLoadProject={(id, data) => {
          setProjectId(id);
          setIsDemoMode(false);
          setMapData({ ...DEFAULT_MAP_DATA, ...profileMapDefaults(), ...data, projectId: id, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          isInitialLoad.current = true;
           // Determine where to resume based on data
          if (data.blocks && data.blocks.length > 0) setStep(8);
          else if (data.symbols && data.symbols.length > 0) setStep(5);
          else if (data.roads && data.roads.length > 0) setStep(4);
          else if (data.boundaryClosed) setStep(3);
          else setStep(3);
        }}
        onNewProject={(initialData) => {
          setMapData({ ...DEFAULT_MAP_DATA, ...profileMapDefaults(), ...initialData, enumeratorName: user?.user_metadata?.full_name || user?.email || 'Surveyor' });
          setProjectId(null);
          setIsDemoMode(false);
          isInitialLoad.current = true;
          setStep(initialData?.hlbNumber ? 3 : 2); // Step 2 = SMS screen in the map shell
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
      {step >= 2 && step < 9 && (
        <AppHeader
          currentStep={step}
          maxStep={maxStep}
          setStep={setStep}
          saveStatus={saveStatus}
          onSaveAndExit={() => { forceSave(); setStep(0); setMaxStep(0); setProjectId(null); setIsDemoMode(false); }}
          inMap={inMap}
        />
      )}
      <div className="flex-1 relative overflow-hidden min-h-0">
        <ErrorBoundary>
        {step === 2 && <div className="h-full overflow-auto"><SMSParseScreen onComplete={(h, c, d, s) => { update({ hlbNumber: h, center: c, district: d || 'Unknown', state: s || 'Unknown' }); setStep(3); }} onBack={() => setStep(0)} isDemoMode={isDemoMode} /></div>}
        {/* MapWorkspace is kept permanently mounted (never conditionally removed)
            once the user enters the map flow. We toggle visibility with display:none
            so the Leaflet map instance stays alive across tab switches, preventing
            the map from being destroyed and re-created every time the tab gains focus.
            Without this, onAuthStateChange token refreshes → React re-renders →
            inMap toggles → Leaflet map.remove() + new L.map() = visible jitter. */}
        <div style={{ display: hasEnteredMap ? (inMap ? 'block' : 'none') : 'none', position: 'absolute', inset: 0 }}>
          {hasEnteredMap && <MapWorkspace
            step={step} center={mapData.center} boundaryPins={mapData.boundaryPins} boundaryClosed={mapData.boundaryClosed}
            roads={mapData.roads} symbols={mapData.symbols} hlbNumber={mapData.hlbNumber} blocks={mapData.blocks} farmlandBlocks={mapData.farmlandBlocks}
            waterBodies={mapData.waterBodies} forests={mapData.forests} landuseAreas={mapData.landuseAreas} landmarks={mapData.landmarks} areaStats={mapData.areaStats}
            onUpdateBoundary={(p: Coordinate[], c: boolean) => update({ boundaryPins: p, boundaryClosed: c })}
            onUpdateRoads={(r: RoadFeature[]) => update({ roads: r })}
            onUpdateSymbols={(s: PlacedSymbol[]) => {
              const houses = s.filter(x => isHouseType(x.symbol_type));
              update({ symbols: s, numberingComplete: houses.length > 0 && houses.every(x => x.number !== null) });
            }}
            onUpdateBlocks={b => update({ blocks: b })}
            onUpdateFarmland={f => update({ farmlandBlocks: f })}
            onUpdateWater={w => update({ waterBodies: w })}
            onUpdateForests={f => update({ forests: f })}
            onUpdateLandmarks={l => update({ landmarks: l })}
            onUpdateStats={s => update({ areaStats: s })}
            onUpdateOrientation={o => update({ orientation: o })}
            onUpdateMapData={update}
            onStepComplete={() => setStep(s => s + 1)}
            onJumpToPreview={() => setStep(8)}
            isDemoMode={isDemoMode}
            onDemoComplete={() => setIsDemoMode(false)}
          />}
        </div>
        {(step === 7) && (
          <div className="h-full">
            <AIMapStep
              mapData={mapData}
              onStepComplete={() => setStep(8)}
              onBack={() => setStep(6)}
              onUpdateMapData={update}
              isDemoMode={isDemoMode}
            />
          </div>
        )}
        {(step === 8) && (
          <div className="h-full">
            <PreviewScreen
              mapData={mapData}
              isDemoMode={isDemoMode}
              justPaid={justPaid}
              onBack={() => setStep(7)}
              onExitToDashboard={() => { forceSave(); setJustPaid(false); setStep(0); setMaxStep(0); setProjectId(null); setIsDemoMode(false); }}
            />
          </div>
        )}
        </ErrorBoundary>
        {step === 10 && (
          <ErrorBoundary>
            <LiveSurveyScreen onExit={() => { setStep(0); setResumeSessionId(null); }} resumeSessionId={resumeSessionId || undefined} />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
