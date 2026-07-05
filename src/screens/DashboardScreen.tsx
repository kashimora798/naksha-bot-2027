import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { idbStore, SurveySession } from '../lib/idb';
import type { MapData } from '../types';
import ProfileScreen from './ProfileScreen';
import DonationPopup from '../components/DonationPopup';
import { useTranslation, LanguageSelector } from '../lib/i18n';
import { extractHLBBoundaryFromPDF, runTracePipeline, unpackMask } from '../lib/hlb-pdf-extractor';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  data: Partial<MapData>;
  created_at: string;
  updated_at: string;
  payment_status: string;
  export_count: number;
  isAssigned?: boolean;
}

interface Props {
  user: any;
  userProfile?: any;
  onLoadProject: (projectId: string, data: Partial<MapData>) => void;
  onNewProject: (initialData?: Partial<MapData>) => void;
  onLiveSurvey?: (initialData?: Partial<MapData>) => void;
  onResumeLiveSurvey?: (sessionId: string) => void;
  onDemoMap?: () => void;
  onCanvasBlockMap?: () => void;
  onProfileUpdated?: (profile: any) => void;
  onSatExtractorMap?: () => void;
}

export default function DashboardScreen({ user, userProfile, onLoadProject, onNewProject, onLiveSurvey, onResumeLiveSurvey, onDemoMap, onCanvasBlockMap, onProfileUpdated, onSatExtractorMap }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [liveSessions, setLiveSessions] = useState<SurveySession[]>([]);
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Advanced Auto-Map (GeoPDF Extraction) States
  const [showAdvancedMapModal, setShowAdvancedMapModal] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [hlbCode, setHlbCode] = useState('');
  const [extractStatus, setExtractStatus] = useState('');
  const [extractError, setExtractError] = useState<string | null>(null);
  const [ocrFailedData, setOcrFailedData] = useState<any | null>(null);

  // Video Tutorial Popup States
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // WhatsApp Group Popup
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Only one popup fires per browser session
  const sessionPopupShown = useRef(false);

  const handleExtract = async () => {
    if (!pdfFile || !hlbCode.trim()) {
      setExtractError('Please upload a PDF file and enter the 4-digit HLB code.');
      return;
    }
    setExtractError(null);
    setExtractStatus('Sending PDF to Python microservice...');
    try {
      const formData = new FormData();
      formData.append('file', pdfFile);
      formData.append('hlb', hlbCode.trim());

      const apiUrl = import.meta.env.VITE_EXTRACTOR_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/extract`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || `Server returned error status ${res.status}`);
      }

      const geojson = await res.json();
      const coords = geojson.geometry?.coordinates?.[0];
      if (!coords || coords.length < 3) {
        throw new Error('Server returned an invalid boundary polygon structure.');
      }
      
      const boundaryPins = coords.map(([lng, lat]: any) => ({ lat, lng }));

      // Calculate center
      const sumLat = boundaryPins.reduce((acc: number, curr: any) => acc + curr.lat, 0);
      const sumLng = boundaryPins.reduce((acc: number, curr: any) => acc + curr.lng, 0);
      const center = { lat: sumLat / boundaryPins.length, lng: sumLng / boundaryPins.length };

      // Save to recent list in localStorage
      try {
        const saved = JSON.parse(localStorage.getItem('recent_boundaries') || '[]');
        const updatedList = [
          { hlbNumber: hlbCode.trim(), center, boundaryPins, timestamp: new Date().toISOString() },
          ...saved.filter((x: any) => x.hlbNumber !== hlbCode.trim())
        ];
        localStorage.setItem('recent_boundaries', JSON.stringify(updatedList.slice(0, 10)));
      } catch (e) {
        console.warn('Failed to save to localStorage recent_boundaries:', e);
      }

      setShowAdvancedMapModal(false);
      setPdfFile(null);
      setHlbCode('');
      setExtractStatus('');

      onNewProject({
        hlbNumber: hlbCode.trim(),
        boundaryPins,
        boundaryClosed: true,
        center,
        isAutoFetched: true
      });
    } catch (err: any) {
      console.error(err);
      setExtractError(err.message || 'Connection failed. Make sure the Python microservice is running.');
      setExtractStatus('');
    }
  };

  const handleMapImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!ocrFailedData) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    const originalW = ocrFailedData.cropW;
    const originalH = ocrFailedData.cropH;
    const displayW = rect.width;
    const displayH = rect.height;
    
    const seedX = Math.round((clickX / displayW) * originalW);
    const seedY = Math.round((clickY / displayH) * originalH);
    
    try {
      setExtractStatus('Tracing boundary from your clicked point...');
      const mask = unpackMask(ocrFailedData.maskBase64);
      const boundaryPins = runTracePipeline(mask, originalW, originalH, seedX, seedY, ocrFailedData.meta);
      
      const sumLat = boundaryPins.reduce((acc, curr) => acc + curr.lat, 0);
      const sumLng = boundaryPins.reduce((acc, curr) => acc + curr.lng, 0);
      const center = { lat: sumLat / boundaryPins.length, lng: sumLng / boundaryPins.length };
      
      setShowAdvancedMapModal(false);
      setOcrFailedData(null);
      setPdfFile(null);
      setHlbCode('');
      setExtractStatus('');
      
      onNewProject({
        hlbNumber: hlbCode.trim(),
        boundaryPins,
        boundaryClosed: true,
        center,
        isAutoFetched: true
      });
    } catch (err: any) {
      setExtractError(err.message || 'Tracing failed. Make sure you clicked inside a fully enclosed boundary.');
      setExtractStatus('');
    }
  };

  const handleStartCanvasMap = () => {
    const hasSeen = localStorage.getItem('seen_canvas_tutorial_video');
    if (hasSeen === 'true') {
      onCanvasBlockMap?.();
    } else {
      setShowVideoModal(true);
    }
  };

  const confirmStartCanvasMap = () => {
    if (dontShowAgain) {
      localStorage.setItem('seen_canvas_tutorial_video', 'true');
    }
    setShowVideoModal(false);
    onCanvasBlockMap?.();
  };

  // Feedback State
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [showDonate, setShowDonate] = useState(false);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [verifyingDonation, setVerifyingDonation] = useState(false);
  const [showThankYouDonation, setShowThankYouDonation] = useState(false);
  const [verifiedDonationDetails, setVerifiedDonationDetails] = useState<any | null>(null);
  const [donationFailReason, setDonationFailReason] = useState<'cancelled' | 'failed' | 'technical_error' | null>(null);
  const [donationFailAmount, setDonationFailAmount] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const donationId = params.get('donation_return');

    if (donationId) {
      window.history.replaceState({}, document.title, window.location.pathname);
      setVerifyingDonation(true);

      supabase.functions.invoke('verify-payment', {
        body: { projectId: donationId, kind: 'donation' }
      }).then(({ data, error }) => {
        setVerifyingDonation(false);
        if (error) {
          setDonationFailReason('technical_error');
          return;
        }
        if (data?.paid) {
          if (data?.donation) setVerifiedDonationDetails(data.donation);
          setShowThankYouDonation(true);
        } else {
          const reason = data?.reason ?? '';
          if (reason === 'payment_cancelled') {
            setDonationFailAmount(data?.donation?.amount ?? null);
            setDonationFailReason('cancelled');
          } else if (reason === 'payment_failed') {
            setDonationFailAmount(data?.donation?.amount ?? null);
            setDonationFailReason('failed');
          } else if (reason === 'technical_error') {
            setDonationFailReason('technical_error');
          } else {
            // Any other unconfirmed state — treat as cancelled (order still ACTIVE)
            setDonationFailReason('cancelled');
          }
        }
      }).catch(() => {
        setVerifyingDonation(false);
        setDonationFailReason('technical_error');
      });
    }
  }, []);

  const checkLimitAndStart = (action: () => void) => {
    if (projects.length >= 7 && userProfile?.is_admin !== true) {
      alert(
        "⚠️ सीमा समाप्त / Limit Reached:\n" +
        "आप अधिकतम 7 प्रोजेक्ट ही बना सकते हैं। नया प्रोजेक्ट बनाने के लिए कृपया पुराना प्रोजेक्ट हटाएं।\n\n" +
        "You can create a maximum of 7 projects. Please delete an existing project before creating a new one."
      );
      return;
    }
    action();
  };

  useEffect(() => {
    supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAnnouncements(data);
      });
  }, []);

  useEffect(() => {
    if (sessionPopupShown.current) return;
    if (!localStorage.getItem('naksha_demo_done')) {
      setShowDemoModal(true);
      localStorage.setItem('naksha_demo_done', 'true');
      sessionPopupShown.current = true;
    } else if (!localStorage.getItem('naksha_whatsapp_popup')) {
      setShowWhatsApp(true);
      localStorage.setItem('naksha_whatsapp_popup', 'true');
      sessionPopupShown.current = true;
    }
  }, []);

  useEffect(() => {
    async function loadProjects() {
      if (!user?.id) return;
      try {
        // Own projects + assigned project IDs in parallel
        const [ownResult, assignmentsResult] = await Promise.all([
          supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false }),
          supabase
            .from('project_assignments')
            .select('project_id')
            .eq('user_id', user.id),
        ]);

        if (ownResult.error) throw ownResult.error;
        const visibleProjects = (ownResult.data || []).filter(p => !p.data?.deletedUI);
        setProjects(visibleProjects);

        // Fetch the actual assigned project rows
        const assignedIds = (assignmentsResult.data || []).map((a: any) => a.project_id);
        if (assignedIds.length) {
          const { data: sharedData } = await supabase
            .from('projects')
            .select('*')
            .in('id', assignedIds)
            .order('updated_at', { ascending: false });
          setAssignedProjects((sharedData || []).map(p => ({ ...p, isAssigned: true })));
        }

        if (visibleProjects.length >= 3 && !localStorage.getItem('naksha_dashboard_feedback') && !sessionPopupShown.current) {
          setShowFeedback(true);
          localStorage.setItem('naksha_dashboard_feedback', 'true');
          sessionPopupShown.current = true;
        }
      } catch (err: any) {
        console.error('Error fetching projects:', err);
        setError(err.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [user?.id]);

  // Load IDB live survey drafts
  useEffect(() => {
    idbStore.getAllSessions().then(sessions => {
      setLiveSessions(sessions.sort((a, b) => b.startTime - a.startTime));
    }).catch(() => {});
  }, []);

  const handleDeleteUI = async (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    if (!window.confirm(`Remove "${project.name || 'Untitled Map'}" from dashboard?`)) return;
    try {
      const updatedData = { ...(project.data || {}), deletedUI: true };
      const { error } = await supabase.from('projects').update({ data: updatedData }).eq('id', project.id);
      if (error) throw error;
      setProjects(prev => prev.filter(p => p.id !== project.id));
    } catch (err) {
      alert('Failed to remove map. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-warm-paper)] flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--color-saffron)]/10 flex items-center justify-center animate-bounce"><span className="text-2xl">🗺️</span></div>
        <p className="text-gray-500 font-semibold animate-pulse font-public-sans">Loading your maps…</p>
      </div>
    );
  }

  const pendingSessions = liveSessions.filter(s => s.state === 'paused');
  const completedSessions = liveSessions.filter(s => s.state === 'completed');

  const submitFeedback = async () => {
    setFeedbackLoading(true);
    try {
      await supabase.from('feedbacks').insert([{
        suggestions: feedbackText,
        useful: 'Dashboard Experience',
        user_id: user?.id ?? null,
      }]);
      setFeedbackSubmitted(true);
      localStorage.setItem('naksha_dashboard_feedback', 'true');
    } catch (err) {
      console.error(err);
      setFeedbackSubmitted(true);
      localStorage.setItem('naksha_dashboard_feedback', 'true');
    }
    setFeedbackLoading(false);
  };

  const skipFeedback = () => {
    localStorage.setItem('naksha_dashboard_feedback', 'true');
    setShowFeedback(false);
  };

  return (
    <div className="min-h-screen flex flex-col font-noto-sans bg-[var(--color-warm-paper)]">
      {/* ── Sticky top bar ── */}
      <header className="sticky top-0 z-20 bg-white/85 backdrop-blur border-b border-[var(--color-saffron)]/10">
        <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-9 h-9 sm:w-10 sm:h-10 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold font-public-sans text-[var(--color-charcoal)] truncate leading-tight">{t('brand')}</h1>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate">{t('subBrand')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {announcements.length > 0 && (
              <button
                onClick={() => setShowAnnouncementsModal(true)}
                className="relative p-2 bg-orange-50 border border-orange-200 rounded-xl text-sm font-semibold text-orange-600 hover:bg-orange-100 transition-colors flex items-center justify-center min-w-[36px] min-h-[36px] sm:min-w-[40px] sm:min-h-[40px]"
                title="View Announcements / सूचनाएं"
              >
                <span className="text-base sm:text-lg">🔔</span>
                <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[9px] w-4.5 h-4.5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                  {announcements.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setShowWhatsApp(true)}
              className="px-3 sm:px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm font-semibold text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1.5"
              title="Join WhatsApp Support Group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.5L4 29l7.697-1.807A12.93 12.93 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10a10.93 10.93 0 01-5.25-1.336l-.37-.213-4.572 1.074 1.117-4.46-.234-.385A9.955 9.955 0 016 15C6 9.477 10.477 5 16 5zm-3.47 5.5c-.2 0-.52.075-.795.375C11.46 11.175 10.5 12.1 10.5 13.97c0 1.875 1.375 3.688 1.563 3.938.187.25 2.687 4.25 6.593 5.813 3.25 1.281 3.907 1.031 4.625.969.719-.063 2.313-.938 2.641-1.844.328-.906.328-1.688.226-1.844-.094-.156-.344-.25-.719-.437-.375-.188-2.219-1.094-2.563-1.219-.344-.125-.594-.188-.843.188-.25.375-.969 1.219-1.188 1.469-.218.25-.437.281-.812.094-.375-.188-1.582-.582-3.013-1.852-1.113-.992-1.863-2.215-2.082-2.59-.218-.375-.023-.578.164-.766.168-.168.375-.438.563-.656.187-.219.25-.375.375-.625.125-.25.063-.47-.031-.657-.094-.187-.844-2.031-1.157-2.78-.312-.75-.625-.65-.843-.663-.219-.012-.469-.012-.719-.012z"/>
              </svg>
              <span className="hidden sm:inline">{t('helpGroup')}</span>
            </button>
            <button
              onClick={() => setShowDonate(true)}
              className="px-3 sm:px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm font-semibold text-orange-600 hover:bg-orange-100 transition-colors flex items-center gap-1.5"
            >
              <span>🙏</span><span className="hidden sm:inline">{t('support')}</span>
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className="px-3 sm:px-4 py-2 bg-[var(--color-warm-paper)] border border-[var(--color-saffron)]/15 rounded-xl text-sm font-semibold text-gray-700 hover:bg-[var(--color-saffron)]/5 transition-colors flex items-center gap-1.5"
            >
              <span>👤</span><span className="hidden sm:inline">{t('profile')}</span>
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-3 sm:px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              {t('signOut')}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {/* ── Greeting ── */}
        <div className="mb-5">
          <h2 className="text-2xl sm:text-3xl font-bold font-public-sans text-[var(--color-charcoal)]">
            {`Namaste, ${(userProfile?.full_name || user?.user_metadata?.full_name || user?.email || 'Surveyor').split(' ')[0]} 👋`}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Pick up where you left off, or start something new.</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 text-sm">{error}</div>
        )}

        {/* ── Primary action cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <button
            onClick={() => checkLimitAndStart(() => setShowAdvancedMapModal(true))}
            className="group text-left p-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-700 text-white shadow-[var(--shadow-warm-2)] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl mb-2.5">⚡</div>
            <p className="font-bold text-sm font-public-sans leading-tight">Advanced Auto-Map</p>
            <p className="text-[11px] text-white/75 mt-0.5">GeoPDF Extract</p>
            <p className="text-[10px] text-white/60 mt-1 leading-snug hidden sm:block">सीमा और सड़कें तुरंत लाएं</p>
          </button>
          <button
            onClick={() => checkLimitAndStart(() => onSatExtractorMap?.())}
            className="group text-left p-4 rounded-2xl bg-gradient-to-br from-violet-600 to-violet-700 text-white shadow-[var(--shadow-warm-2)] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl mb-2.5">🛰️</div>
            <p className="font-bold text-sm font-public-sans leading-tight">Advanced Sat-Extractor</p>
            <p className="text-[11px] text-white/75 mt-0.5">Satellite Extraction</p>
            <p className="text-[10px] text-white/60 mt-1 leading-snug hidden sm:block">Google Open Footprints</p>
          </button>
          <button
            onClick={() => checkLimitAndStart(() => onNewProject(undefined))}
            className="group text-left p-4 rounded-2xl bg-[var(--color-saffron-container)] text-white shadow-[var(--shadow-warm-2)] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl mb-2.5">🗺️</div>
            <p className="font-bold text-sm font-public-sans leading-tight">नक्शा बनाएं</p>
            <p className="text-[11px] text-white/75 mt-0.5 leading-snug">Make a Map</p>
            <p className="text-[10px] text-white/60 mt-1 leading-snug hidden sm:block">सैटेलाइट से HLB नक्शा बनाएं</p>
          </button>
          <button
            onClick={() => checkLimitAndStart(handleStartCanvasMap)}
            className="group text-left p-4 rounded-2xl bg-white border border-emerald-100 shadow-[var(--shadow-warm-1)] hover:shadow-[var(--shadow-warm-2)] active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-xl mb-2.5">🧩</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-charcoal)] leading-tight">ब्लॉक नक्शा</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Block Map</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug hidden sm:block">सड़कों से ब्लॉक अपने-आप बनेंगे</p>
          </button>
          <button
            onClick={() => navigate('/live-dashboard')}
            className="group text-left p-4 rounded-2xl bg-white border border-[var(--color-saffron)]/15 shadow-[var(--shadow-warm-1)] hover:shadow-[var(--shadow-warm-2)] active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-xl mb-2.5">🚶</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-charcoal)] leading-tight">फील्ड सर्वे</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Field Survey</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug hidden sm:block">GPS से घर दर्ज करें</p>
          </button>
          <button
            onClick={onDemoMap}
            className="group text-left p-4 rounded-2xl bg-white border border-blue-100 shadow-[var(--shadow-warm-1)] hover:shadow-[var(--shadow-warm-2)] active:scale-[0.99] transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-xl mb-2.5">🎓</div>
            <p className="font-bold text-sm font-public-sans text-[var(--color-charcoal)] leading-tight">सीखें</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Learn</p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug hidden sm:block">2 मिनट का guided tour</p>
          </button>
        </div>

        {/* ── How it works strip (shown only for new users with no projects) ── */}
        {projects.length === 0 && assignedProjects.length === 0 && (
          <div className="bg-white rounded-2xl border border-[var(--color-saffron)]/10 shadow-[var(--shadow-warm-1)] px-4 py-3 mb-6">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2.5">नक्शा कैसे बनता है / How it works</p>
            <div className="flex items-center gap-1 overflow-x-auto pb-1">
              {[
                { icon: '📩', label: 'SMS paste', sub: 'HLB area' },
                { icon: '📐', label: 'सीमा खींचें', sub: 'Boundary' },
                { icon: '🏠', label: 'मकान डालें', sub: 'Buildings' },
                { icon: '🔢', label: 'नंबर दें', sub: 'Number' },
                { icon: '🖨️', label: 'Print करें', sub: 'Export' },
              ].map((s, i, arr) => (
                <div key={i} className="flex items-center gap-1 flex-shrink-0">
                  <div className="flex flex-col items-center">
                    <span className="text-lg">{s.icon}</span>
                    <span className="text-[10px] font-bold text-[var(--color-charcoal)] text-center leading-tight mt-0.5">{s.label}</span>
                    <span className="text-[9px] text-gray-400 text-center">{s.sub}</span>
                  </div>
                  {i < arr.length - 1 && <span className="text-gray-300 text-sm font-bold mx-1">→</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Stats strip ── */}
        {(projects.length > 0 || liveSessions.length > 0) && (
          <div className="grid grid-cols-3 gap-3 mb-8">
            <div className="bg-white rounded-2xl p-4 border border-[var(--color-saffron)]/10 shadow-[var(--shadow-warm-1)] text-center">
              <p className="text-2xl font-bold text-[var(--color-saffron)] font-public-sans">{projects.length}</p>
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Maps</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-amber-100 shadow-[var(--shadow-warm-1)] text-center">
              <p className="text-2xl font-bold text-amber-600 font-public-sans">{pendingSessions.length}</p>
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">In Progress</p>
            </div>
            <div className="bg-white rounded-2xl p-4 border border-green-100 shadow-[var(--shadow-warm-1)] text-center">
              <p className="text-2xl font-bold text-green-600 font-public-sans">{completedSessions.length}</p>
              <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Completed</p>
            </div>
          </div>
        )}

        {/* ── Live Surveys Section ── */}
        {liveSessions.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)]">🚶 Live Surveys</h2>
              <button
                onClick={() => navigate('/live-prep')}
                className="px-3.5 py-2 bg-[var(--color-saffron)] text-white rounded-xl font-bold text-xs shadow active:scale-95 transition-all"
              >
                + New Survey
              </button>
            </div>

            {pendingSessions.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wide mb-2">⏳ Pending</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {pendingSessions.map(session => (
                    <div key={session.session_id}
                      className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] border border-amber-100 flex items-center gap-3 group relative overflow-hidden cursor-pointer hover:shadow-[var(--shadow-warm-2)] active:bg-amber-50 transition-all"
                      onClick={() => onResumeLiveSurvey?.(session.session_id)}>
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 rounded-l-2xl" />
                      <div className="flex-1 pl-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>
                        </div>
                        <p className="font-bold text-sm text-[var(--color-charcoal)] truncate">{session.location_name || 'Live Survey'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {session.houses_count ?? 0} houses · {((session.distance_m ?? 0) / 1000).toFixed(2)} km walked
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(session.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex-shrink-0 bg-[var(--color-saffron)] text-white rounded-xl px-3 py-2 text-xs font-bold min-h-[44px] flex items-center">
                        Continue →
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {completedSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-green-600 uppercase tracking-wide mb-2">✅ Completed</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {completedSessions.map(session => (
                    <div key={session.session_id}
                      className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] border border-green-100 flex items-center gap-3 relative overflow-hidden">
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-green-500 rounded-l-2xl" />
                      <div className="flex-1 pl-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Completed</span>
                        </div>
                        <p className="font-bold text-sm text-[var(--color-charcoal)] truncate">{session.location_name || 'Live Survey'}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {session.houses_count ?? 0} houses · {((session.distance_m ?? 0) / 1000).toFixed(2)} km walked
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(session.created_at).toLocaleDateString()}</p>
                      </div>
                      <div className="flex-shrink-0 bg-green-100 text-green-700 rounded-xl px-3 py-2 text-xs font-bold">✓ Done</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ── Maps Section ── */}
        {(() => {
          const canvasProjects = projects.filter((p: any) => p.data?.mode === 'canvas');
          const deskProjects = projects.filter((p: any) => p.data?.mode !== 'canvas');

          const renderCard = (project: any, isCanvas = false) => {
            const syms: any[] = project.data?.symbols || [];
            const totalBuildings = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type)).length;
            const numberedBuildings = syms.filter((s: any) => ['pucca_house','kutcha_house','apartment','non_residential'].includes(s.symbol_type) && s.number !== null).length;
            const allNumbered = totalBuildings > 0 && numberedBuildings === totalBuildings;
            const hlb = project.data?.hlbNumber;
            return (
            <div
              key={project.id}
              onClick={() => onLoadProject(project.id, { ...project.data, paymentStatus: project.payment_status, exportCount: project.export_count })}
              className={`bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] cursor-pointer hover:shadow-[var(--shadow-warm-2)] hover:-translate-y-0.5 transition-all group relative overflow-hidden border ${isCanvas ? 'border-emerald-100' : 'border-[var(--color-saffron)]/10'}`}
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${isCanvas ? 'bg-emerald-400' : 'bg-[var(--color-india-green)]'}`} />
              <button
                onClick={(e) => handleDeleteUI(e, project)}
                className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all min-h-[36px]"
                title="Remove from Dashboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div className="pl-2">
                <div className="flex items-start justify-between mb-2 pr-6">
                  <h3 className="text-sm font-bold font-public-sans text-[var(--color-charcoal)] group-hover:text-[var(--color-saffron)] transition-colors truncate">
                    {isCanvas && <span className="mr-1">🧩</span>}{project.name || 'Untitled Map'}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {totalBuildings > 0 && (
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full font-jetbrains-mono ${allNumbered ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                      {allNumbered ? `✓ ${totalBuildings} मकान` : `${numberedBuildings}/${totalBuildings} नंबर`}
                    </span>
                  )}
                  {hlb && <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-jetbrains-mono">HLB {hlb}</span>}
                </div>
                <div className="text-xs text-gray-500 space-y-0.5 font-jetbrains-mono">
                  {(project.data?.district || project.data?.state) && (
                    <p className="truncate text-[11px]">📍 {[project.data?.district, project.data?.state].filter(Boolean).join(', ')}</p>
                  )}
                  <p className="text-[10px] text-gray-400 pt-1.5 border-t border-gray-100">{new Date(project.updated_at).toLocaleDateString('hi-IN')}</p>
                </div>
              </div>
            </div>
            );
          };

          return (
            <div className="space-y-8">
              {/* ── Regular Desk Maps ── */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold font-public-sans text-[var(--color-charcoal)]">🗺️ {t('myMaps')}</h2>
                  {deskProjects.length > 0 && <span className="text-xs text-gray-400 font-semibold">{deskProjects.length}</span>}
                </div>
                {deskProjects.length === 0 ? (
                  <div className="bg-white rounded-[24px] p-8 text-center shadow-[var(--shadow-warm-1)] border border-[var(--color-saffron)]/10">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-3xl mx-auto mb-3">🗺️</div>
                    <h3 className="text-base font-bold font-public-sans text-[var(--color-charcoal)] mb-1">{t('noProjects')}</h3>
                    <p className="text-xs text-gray-500 mb-1">No maps yet</p>
                    <p className="text-sm text-gray-600 max-w-sm mx-auto mb-5">पहले tour लें — 2 मिनट में पूरा तरीका समझें। फिर अपना नक्शा बनाएं।</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      <button onClick={onDemoMap} className="px-5 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-sm shadow-[var(--shadow-warm-1)] hover:bg-blue-100 transition-colors min-h-[52px]">🎓 Tour देखें / Take Tour</button>
                      <button onClick={() => checkLimitAndStart(() => onNewProject(undefined))} className="px-5 py-3 bg-[var(--color-saffron-container)] text-white rounded-xl font-bold text-sm shadow-[var(--shadow-warm-2)] hover:bg-[var(--color-saffron)] transition-colors min-h-[52px]">{t('newMap')}</button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {deskProjects.map((p: any) => renderCard(p, false))}
                  </div>
                )}
              </div>

              {/* ── Canvas Block Maps ── */}
              {canvasProjects.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold font-public-sans text-[var(--color-charcoal)]">🧩 ब्लॉक नक्शे <span className="text-gray-400 font-normal text-sm">/ Block Maps</span></h2>
                  <button onClick={() => checkLimitAndStart(handleStartCanvasMap)} className="px-3 py-1.5 bg-emerald-500 text-white rounded-xl font-bold text-xs shadow active:scale-95 transition-all">+ नया</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{canvasProjects.map(p => renderCard(p, true))}</div>
              </div>
              )}

              {/* ── Shared with me ── */}
              {assignedProjects.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)]">📋 Shared with Me</h2>
                    <span className="text-xs text-gray-400 font-semibold">{assignedProjects.length} project{assignedProjects.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {assignedProjects.map(project => (
                      <div
                        key={project.id}
                        onClick={() => onLoadProject(project.id, { ...project.data, paymentStatus: project.payment_status, exportCount: project.export_count })}
                        className="bg-white rounded-2xl p-5 shadow-[var(--shadow-warm-1)] cursor-pointer hover:shadow-[var(--shadow-warm-2)] hover:-translate-y-0.5 transition-all group relative overflow-hidden border border-purple-100"
                      >
                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-purple-400 rounded-l-2xl" />
                        <div className="pl-2">
                          <div className="flex items-start gap-2 mb-3">
                            <h3 className="text-base font-bold font-public-sans text-[var(--color-charcoal)] group-hover:text-purple-600 transition-colors truncate flex-1">
                              {project.name || 'Untitled Map'}
                            </h3>
                            <span className="flex-shrink-0 text-[10px] font-bold bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">Shared</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-3">
                            <span className="text-[11px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded-full font-jetbrains-mono">{project.data?.blocks?.length || 0} Blocks</span>
                            <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-jetbrains-mono">HLB {project.data?.hlbNumber || '—'}</span>
                          </div>
                          <div className="text-xs text-gray-500 space-y-1 font-jetbrains-mono">
                            <p className="truncate">📍 {project.data?.district || '—'}, {project.data?.state || '—'}</p>
                            <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">Edited {new Date(project.updated_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {showDemoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-300">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-3xl mx-auto mb-4">🗺️</div>
            <h2 className="text-xl font-black text-gray-800 text-center mb-2 font-[Baloo_2]">Welcome to NakshaBot!</h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              See how to build a complete HLB census map in under 2 minutes. We've set up a guided tour over the real app for you.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => { setShowDemoModal(false); onDemoMap?.(); }}
                className="w-full bg-[var(--color-saffron)] text-white font-bold py-3 rounded-xl shadow active:scale-95 transition-all"
              >
                🎓 Start the Tour
              </button>
              <button
                onClick={() => { localStorage.setItem('naksha_demo_done', 'true'); setShowDemoModal(false); }}
                className="w-full bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      {showProfile && (
        <ProfileScreen
          user={user}
          userProfile={userProfile}
          onClose={() => setShowProfile(false)}
          onSaved={(prof) => { onProfileUpdated?.(prof); }}
        />
      )}

      {showFeedback && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          {!feedbackSubmitted ? (
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4 text-2xl">✨</div>
              <h3 className="font-bold text-slate-800 mb-2 font-[Baloo_2] text-xl">How is your experience?</h3>
              <p className="text-sm text-slate-500 mb-4">You've created some maps! We'd love to hear your thoughts or any suggestions you have.</p>
              
              {/* Donate Appeal Box */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-4 text-center">
                <p className="text-xs text-orange-950 font-bold leading-snug">
                  💖 App useful? You can support this solo student developer!
                </p>
                <button
                  onClick={() => {
                    setShowFeedback(false);
                    setShowDonate(true);
                  }}
                  className="mt-2 w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-lg shadow active:scale-95 transition-all"
                >
                  🤝 Donate / Help Student
                </button>
              </div>

              <div className="space-y-4">
                <textarea 
                  value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                  placeholder="Tell us what you think..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm h-32 focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
                />

                <div className="flex gap-3 pt-2">
                  <button onClick={skipFeedback} className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-colors">
                    Skip
                  </button>
                  <button onClick={submitFeedback} disabled={feedbackLoading || !feedbackText.trim()} className="flex-1 py-3 bg-[var(--color-saffron)] text-white rounded-xl font-bold shadow-lg hover:bg-orange-600 disabled:opacity-70 transition-all">
                    {feedbackLoading ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center relative">
              <div className="text-6xl mb-4">🙏</div>
              <h3 className="font-bold text-green-800 text-2xl mb-2 font-[Baloo_2]">Thank You!</h3>
              <p className="text-sm text-slate-600 mb-4">Your feedback has been recorded.</p>

              {/* Donate Appeal Box */}
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 mb-5 text-center">
                <p className="text-xs text-orange-950 font-bold leading-snug">
                  Class 12 के छात्र की पढ़ाई में सहायता करें / Support Class 12 student's studies
                </p>
                <button
                  onClick={() => {
                    setShowFeedback(false);
                    setShowDonate(true);
                  }}
                  className="mt-2 w-full py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-lg shadow active:scale-95 transition-all"
                >
                  🤝 Donate / Help Student
                </button>
              </div>

              <button onClick={() => setShowFeedback(false)} className="w-full py-3 bg-[var(--color-saffron)] text-white rounded-xl font-bold font-[Baloo_2] shadow hover:bg-orange-600">
                Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Donation Modal ── */}
      <DonationPopup
        isOpen={showDonate}
        onClose={() => setShowDonate(false)}
        onMute24h={() => setShowDonate(false)}
        isPrintArea={false}
      />

      {/* ── WhatsApp Group Modal ── */}
      {showWhatsApp && (
        <div className="fixed inset-0 z-[3500] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom sm:zoom-in duration-300">

            {/* Header */}
            <div className="bg-gradient-to-br from-green-500 to-emerald-600 px-6 py-5 text-white relative">
              <button
                onClick={() => setShowWhatsApp(false)}
                className="absolute top-3 right-4 text-white/60 hover:text-white text-2xl font-bold leading-none"
                aria-label="Close"
              >×</button>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white" viewBox="0 0 32 32" fill="currentColor">
                    <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.5L4 29l7.697-1.807A12.93 12.93 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10a10.93 10.93 0 01-5.25-1.336l-.37-.213-4.572 1.074 1.117-4.46-.234-.385A9.955 9.955 0 016 15C6 9.477 10.477 5 16 5zm-3.47 5.5c-.2 0-.52.075-.795.375C11.46 11.175 10.5 12.1 10.5 13.97c0 1.875 1.375 3.688 1.563 3.938.187.25 2.687 4.25 6.593 5.813 3.25 1.281 3.907 1.031 4.625.969.719-.063 2.313-.938 2.641-1.844.328-.906.328-1.688.226-1.844-.094-.156-.344-.25-.719-.437-.375-.188-2.219-1.094-2.563-1.219-.344-.125-.594-.188-.843.188-.25.375-.969 1.219-1.188 1.469-.218.25-.437.281-.812.094-.375-.188-1.582-.582-3.013-1.852-1.113-.992-1.863-2.215-2.082-2.59-.218-.375-.023-.578.164-.766.168-.168.375-.438.563-.656.187-.219.25-.375.375-.625.125-.25.063-.47-.031-.657-.094-.187-.844-2.031-1.157-2.78-.312-.75-.625-.65-.843-.663-.219-.012-.469-.012-.719-.012z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-black font-[Baloo_2] leading-tight">ExamSetu Support &amp;</h3>
                  <p className="text-sm text-white/85 font-semibold">Nazri Naksha Help Group 🚀</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-3 text-sm text-slate-700">
              <p className="leading-relaxed">This group is created to help all users of <strong>examsetu.dev</strong> with:</p>
              <ul className="space-y-2 pl-1">
                {[
                  'Solving software-related problems and technical issues',
                  'Guidance regarding features and usage',
                  'Support for generating and understanding Nazri Naksha',
                  'Quick updates and assistance from the team',
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 text-green-500 flex-shrink-0">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-center">
                <p className="text-xs text-green-800 font-semibold">Feel free to ask doubts, report issues, and help others in the community.</p>
                <p className="text-[11px] text-green-600 mt-0.5">We are here to make your work smoother and easier. ✨</p>
              </div>
            </div>

            {/* Actions */}
            <div className="px-6 pb-6 space-y-2">
              <a
                href="https://chat.whatsapp.com/FXoZ2HqifdZ2rgzukag4be"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowWhatsApp(false)}
                className="flex items-center justify-center gap-2 w-full py-3.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black text-sm rounded-2xl shadow-lg active:scale-[0.98] transition-all hover:brightness-105"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                  <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.5L4 29l7.697-1.807A12.93 12.93 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10a10.93 10.93 0 01-5.25-1.336l-.37-.213-4.572 1.074 1.117-4.46-.234-.385A9.955 9.955 0 016 15C6 9.477 10.477 5 16 5zm-3.47 5.5c-.2 0-.52.075-.795.375C11.46 11.175 10.5 12.1 10.5 13.97c0 1.875 1.375 3.688 1.563 3.938.187.25 2.687 4.25 6.593 5.813 3.25 1.281 3.907 1.031 4.625.969.719-.063 2.313-.938 2.641-1.844.328-.906.328-1.688.226-1.844-.094-.156-.344-.25-.719-.437-.375-.188-2.219-1.094-2.563-1.219-.344-.125-.594-.188-.843.188-.25.375-.969 1.219-1.188 1.469-.218.25-.437.281-.812.094-.375-.188-1.582-.582-3.013-1.852-1.113-.992-1.863-2.215-2.082-2.59-.218-.375-.023-.578.164-.766.168-.168.375-.438.563-.656.187-.219.25-.375.375-.625.125-.25.063-.47-.031-.657-.094-.187-.844-2.031-1.157-2.78-.312-.75-.625-.65-.843-.663-.219-.012-.469-.012-.719-.012z"/>
                </svg>
                Join WhatsApp Group
              </a>
              <button
                onClick={() => setShowWhatsApp(false)}
                className="w-full py-2 text-slate-400 text-xs font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Maybe later
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── Tutorial Video Modal ── */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <span className="font-bold flex items-center gap-2 text-base font-[Baloo_2]">
                🎥 Canvas Blocks Map Tutorial (ट्यूटोरियल वीडियो)
              </span>
              <button 
                onClick={() => setShowVideoModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white text-lg font-bold transition-all"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 bg-slate-955 flex flex-col items-center">
              <div className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-inner">
                <iframe
                  className="absolute inset-0 w-full h-full border-0"
                  src="https://www.youtube.com/embed/CmojjKhI220?autoplay=1"
                  title="How to make nazri naksha for census 2027 . HLB nazri naksha making tutorial in 10 minutes"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                ></iframe>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="rounded border-slate-350 text-emerald-600 focus:ring-emerald-500 w-4.5 h-4.5"
                />
                Don't show this video tutorial again (दोबारा न दिखाएं)
              </label>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setShowVideoModal(false)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmStartCanvasMap}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow"
                >
                  Proceed to Create Map →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Announcements List Modal */}
      {showAnnouncementsModal && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden relative max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <span className="font-bold flex items-center gap-2 text-base font-[Baloo_2]">
                🔔 घोषणाएं / Announcements
              </span>
              <button 
                onClick={() => setShowAnnouncementsModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white text-lg font-bold transition-all"
              >
                ✕
              </button>
            </div>

            {/* Announcements List */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {announcements.map((ann, idx) => (
                <div key={ann.id} className={`flex flex-col gap-3 pb-6 ${idx < announcements.length - 1 ? 'border-b border-slate-100' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">
                      Update {idx + 1}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(ann.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-base leading-tight font-public-sans">
                    {ann.title}
                  </h3>
                  {ann.image_url && (
                    <div className="w-full h-44 relative overflow-hidden rounded-2xl bg-gray-50 border border-slate-100 shrink-0">
                      <img 
                        src={ann.image_url} 
                        alt={ann.title} 
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as any).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans whitespace-pre-line">
                    {ann.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button 
                onClick={() => setShowAnnouncementsModal(false)}
                className="px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow transition-colors w-full sm:w-auto"
              >
                Close / बंद करें
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Donation Cancelled Modal ── */}
      {donationFailReason === 'cancelled' && (
        <div className="fixed inset-0 z-[5000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-7 text-center max-w-md w-full shadow-2xl animate-in zoom-in duration-200 relative border border-slate-100">
            <button onClick={() => setDonationFailReason(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl font-bold leading-none cursor-pointer">×</button>
            <div className="text-5xl mb-4">🙏</div>
            <h3 className="font-extrabold text-orange-500 text-xl mb-1 font-[Baloo_2]">कोई बात नहीं, फिर कोशिश करें!</h3>
            <h4 className="font-black text-slate-700 text-sm mb-4 uppercase tracking-wider">No Worries — Try Again!</h4>
            <div className="space-y-3 text-left text-xs text-slate-600 border-t border-b border-slate-100 py-4 mb-4">
              <p className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded-xl font-semibold text-orange-900">
                🇮🇳 <strong>हिन्दी:</strong> आपने भुगतान रद्द कर दिया, लेकिन कोई बात नहीं — हम जानते हैं कि नीयत साफ है! जब भी मन हो, आप दोबारा कोशिश कर सकते हैं। आपकी दुआएं और प्रोत्साहन भी हमारे लिए किसी खजाने से कम नहीं।
              </p>
              <p className="bg-blue-50 border-l-4 border-blue-400 p-3 rounded-xl font-semibold text-blue-900">
                🌍 <strong>English:</strong> You cancelled the payment — but that's absolutely okay! We know your heart is in the right place. Whenever you feel ready, please try again. Your encouragement and goodwill mean the world to us even without money.
              </p>
            </div>
            {donationFailAmount && <p className="text-xs text-slate-400 mb-4 font-mono">Attempted amount: ₹{donationFailAmount}</p>}
            <button onClick={() => { setDonationFailReason(null); setShowDonate(true); }}
              className="w-full mb-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-xl shadow-md active:scale-[0.98] transition-all cursor-pointer">
              💖 दोबारा प्रयास करें / Try Again
            </button>
            <button onClick={() => setDonationFailReason(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer">
              बाद में / Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* ── Donation Failed Modal ── */}
      {donationFailReason === 'failed' && (
        <div className="fixed inset-0 z-[5000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-7 text-center max-w-md w-full shadow-2xl animate-in zoom-in duration-200 relative border border-slate-100">
            <button onClick={() => setDonationFailReason(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl font-bold leading-none cursor-pointer">×</button>
            <div className="text-5xl mb-4">😔</div>
            <h3 className="font-extrabold text-rose-500 text-xl mb-1 font-[Baloo_2]">भुगतान विफल हो गया!</h3>
            <h4 className="font-black text-slate-700 text-sm mb-4 uppercase tracking-wider">Payment Failed</h4>
            <div className="space-y-3 text-left text-xs text-slate-600 border-t border-b border-slate-100 py-4 mb-4">
              <p className="bg-rose-50 border-l-4 border-rose-400 p-3 rounded-xl font-semibold text-rose-900">
                🇮🇳 <strong>हिन्दी:</strong> आपका भुगतान किसी तकनीकी कारण से पूर्ण नहीं हो सका। अगर राशि आपके खाते से कट गई है तो चिंता न करें — 3-5 कार्यदिवसों में वापस हो जाएगी। कृपया दोबारा प्रयास करें।
              </p>
              <p className="bg-rose-50 border-l-4 border-rose-400 p-3 rounded-xl font-semibold text-rose-900">
                🌍 <strong>English:</strong> Your payment could not be completed due to a technical issue. If any amount was deducted, it will be refunded within 3–5 business days. Please try again.
              </p>
            </div>
            {donationFailAmount && <p className="text-xs text-slate-400 mb-4 font-mono">Failed amount: ₹{donationFailAmount}</p>}
            <button onClick={() => { setDonationFailReason(null); setShowDonate(true); }}
              className="w-full mb-2 py-3 bg-gradient-to-r from-rose-500 to-orange-500 text-white font-black text-xs rounded-xl shadow-md active:scale-[0.98] transition-all cursor-pointer">
              🔁 दोबारा प्रयास करें / Retry Payment
            </button>
            <button onClick={() => setDonationFailReason(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer">
              बाद में / Maybe Later
            </button>
          </div>
        </div>
      )}

      {/* ── Technical Error Modal ── */}
      {donationFailReason === 'technical_error' && (
        <div className="fixed inset-0 z-[5000] bg-black/70 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-7 text-center max-w-md w-full shadow-2xl animate-in zoom-in duration-200 relative border border-slate-100">
            <button onClick={() => setDonationFailReason(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl font-bold leading-none cursor-pointer">×</button>
            <div className="text-5xl mb-4">🔧</div>
            <h3 className="font-extrabold text-amber-600 text-xl mb-1 font-[Baloo_2]">तकनीकी गड़बड़ी! माफ करें 🙏</h3>
            <h4 className="font-black text-slate-700 text-sm mb-4 uppercase tracking-wider">Technical Error — We're Sorry!</h4>
            <div className="space-y-3 text-left text-xs text-slate-600 border-t border-b border-slate-100 py-4 mb-4">
              <p className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-xl font-semibold text-amber-900">
                🇮🇳 <strong>हिन्दी:</strong> हमारी तरफ से एक तकनीकी गड़बड़ी हो गई जिसके लिए हम दिल से माफी मांगते हैं। अगर पैसे कटे हैं तो कृपया नीचे WhatsApp बटन से तुरंत सूचित करें — हम तुरंत समाधान करेंगे।
              </p>
              <p className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-xl font-semibold text-amber-900">
                🌍 <strong>English:</strong> A technical error occurred on our end and we sincerely apologise. If money was debited, please report it via WhatsApp below — we will resolve it immediately.
              </p>
            </div>
            <button onClick={() => {
              const text = `नमस्ते / Hello,\n\nNakshaBot पर दान करने का प्रयास करते समय तकनीकी त्रुटि आई!\nI faced a technical error while trying to donate on NakshaBot!\n\nकृपया जांचें / Please check and resolve 🙏`;
              window.open(`https://wa.me/919696240590?text=${encodeURIComponent(text)}`, '_blank');
            }}
              className="w-full mb-2 py-3 bg-green-500 hover:bg-green-600 text-white font-black text-xs rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer">
              💬 WhatsApp पर रिपोर्ट करें / Report on WhatsApp
            </button>
            <button onClick={() => { setDonationFailReason(null); setShowDonate(true); }}
              className="w-full mb-2 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-black text-xs rounded-xl transition-all cursor-pointer">
              🔁 दोबारा प्रयास / Retry
            </button>
            <button onClick={() => setDonationFailReason(null)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer">
              बंद करें / Close
            </button>
          </div>
        </div>
      )}

      {/* ── Donation Verifying Loader Modal ── */}
      {verifyingDonation && (
        <div className="fixed inset-0 z-[5000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full shadow-2xl animate-in zoom-in duration-200">
            <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="font-bold text-slate-800 text-lg mb-1 font-[Baloo_2]">Verifying Donation...</h3>
            <p className="text-xs text-slate-500">कृपया प्रतीक्षा करें, आपका योगदान सत्यापित किया जा रहा है...</p>
          </div>
        </div>
      )}

      {/* ── Donation Thank You Success Modal ── */}
      {showThankYouDonation && (
        <div className="fixed inset-0 z-[5000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-7 text-center max-w-md w-full shadow-2xl animate-in zoom-in duration-200 relative border border-slate-100 max-h-[90vh] overflow-y-auto scrollbar-thin">
            <button
              onClick={() => setShowThankYouDonation(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-650 text-xl font-bold leading-none cursor-pointer"
            >×</button>
            <div className="text-6xl mb-4 animate-bounce">❤️</div>
            <h3 className="font-extrabold text-orange-500 text-xl sm:text-2xl mb-1 font-[Baloo_2] tracking-wide">
              दिल से आभार, हे देवतुल्य इंसान!
            </h3>
            <h4 className="font-black text-slate-700 text-sm mb-4 font-sans uppercase tracking-wider">
              Heartfelt Gratitude, You Noble Soul!
            </h4>
            
            <div className="space-y-3.5 text-left text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-b border-slate-100 py-4 mb-4">
              <p className="font-semibold text-orange-950/80 bg-orange-50/50 p-3 rounded-xl border-l-4 border-orange-500">
                🇮🇳 <strong>हिन्दी:</strong> आप केवल एक दानदाता नहीं हैं, बल्कि मानवता की वह सच्ची मिसाल हैं जो भारत के युवा हुनर को पंख देती है। जब तक आप जैसे सहृदय लोग हमारे साथ खड़े हैं, तब तक कोई भी अभाव या आर्थिक संकट हमारे सपनों और हौसलों को रोक नहीं सकता। आपकी यह मदद मेरे अध्ययन और NakshaBot के विकास को जारी रखने में बेहद बहुमूल्य है।
              </p>
              <p className="font-semibold text-emerald-950/80 bg-emerald-50/50 p-3 rounded-xl border-l-4 border-emerald-500">
                🌍 <strong>English:</strong> You are not just a donor; you are a living proof of humanity that nurtures and promotes young talent in India. As long as noble souls like you are there to support us, money or financial hardships can never stop our dreams. Your contribution is invaluable to my education and the growth of NakshaBot.
              </p>
            </div>

            {verifiedDonationDetails && (
              <div className="bg-slate-50 rounded-2xl p-4 mb-4 text-left space-y-1.5 border border-slate-100 font-mono text-[11px] sm:text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">NAME:</span>
                  <span className="text-slate-800 font-black">{verifiedDonationDetails.name || 'Anonymous Donor'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400 font-bold">AMOUNT PAID:</span>
                  <span className="text-emerald-600 font-black font-bold">₹{verifiedDonationDetails.amount}</span>
                </div>
                {verifiedDonationDetails.payment_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-bold">TXN ID:</span>
                    <span className="text-orange-650 font-bold select-all">{verifiedDonationDetails.payment_id}</span>
                  </div>
                )}
              </div>
            )}

            {verifiedDonationDetails && (
              <button
                onClick={() => {
                  const text = `नमस्ते / Hello,

मैंने NakshaBot (Nazri Naksha Maker) की पढ़ाई में सहायता के लिए सफलतापूर्वक योगदान दिया है!
I have successfully contributed to support your studies!

💖 विवरण (Donation Details):
- नाम (Name): ${verifiedDonationDetails.name || 'Anonymous'}
- राशि (Amount): ₹${verifiedDonationDetails.amount}
- संदेश (Message): ${verifiedDonationDetails.note || 'Study Support'}
- भुगतान आईडी (Payment ID): ${verifiedDonationDetails.payment_id || verifiedDonationDetails.id}

शुभकामनाएं / Best wishes!`;
                  const waUrl = `https://wa.me/919696240590?text=${encodeURIComponent(text)}`;
                  window.open(waUrl, '_blank');
                }}
                className="w-full mb-2 py-3 bg-green-500 hover:bg-green-600 text-white font-black text-xs rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                💬 व्हाट्सएप पर रसीद भेजें (Share Proof on WhatsApp)
              </button>
            )}

            <button
              onClick={() => setShowThankYouDonation(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
            >
              Close / बंद करें
            </button>
          </div>
        </div>
      )}

      {/* ── Advanced Auto-Map GeoPDF Extraction Modal ── */}
      {showAdvancedMapModal && (
        <div className="fixed inset-0 z-[4000] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-200 relative border border-slate-100 max-h-[90vh] overflow-y-auto flex flex-col">
            <button 
              onClick={() => {
                setShowAdvancedMapModal(false);
                setPdfFile(null);
                setHlbCode('');
                setExtractError(null);
                setExtractStatus('');
              }} 
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 text-xl font-bold leading-none cursor-pointer"
            >
              ×
            </button>

            <div className="space-y-5">
              <div className="text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center text-3xl mx-auto mb-3 shadow-inner">⚡</div>
                <h3 className="text-lg font-extrabold text-slate-800 font-public-sans">Advanced Auto-Map Extractor</h3>
                <p className="text-xs text-slate-500 mt-1">Upload georeferenced GeoPDF to automatically trace boundary and fetch roads via Python microservice.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">1. HLB Number (4-Digits)</label>
                  <input 
                    type="text" 
                    maxLength={4}
                    value={hlbCode}
                    onChange={e => setHlbCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-semibold font-mono"
                    placeholder="e.g. 0542"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">2. Upload GeoPDF File</label>
                  <div className="border-2 border-dashed border-slate-200 hover:border-indigo-500 rounded-2xl p-6 transition-all bg-slate-50/50 flex flex-col items-center justify-center cursor-pointer relative group">
                    <input 
                      type="file" 
                      accept=".pdf"
                      onChange={e => setPdfFile(e.target.files?.[0] || null)}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span className="text-2xl mb-2 text-slate-400 group-hover:scale-110 transition-transform">📂</span>
                    <span className="text-xs font-bold text-slate-700">{pdfFile ? pdfFile.name : 'Select official Layout PDF'}</span>
                    <span className="text-[10px] text-slate-400 mt-1">Only Census georeferenced maps (.pdf)</span>
                  </div>
                </div>
              </div>

              {extractError && (
                <div className="bg-red-50 border-l-4 border-red-500 p-3.5 rounded-xl text-xs text-red-700 font-semibold leading-relaxed">
                  ⚠️ {extractError}
                </div>
              )}

              {extractStatus && (
                <div className="bg-indigo-50/70 border-l-4 border-indigo-500 p-3.5 rounded-xl text-xs text-indigo-900 font-semibold animate-pulse flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600 animate-ping" />
                  {extractStatus}
                </div>
              )}

              <div className="pt-2">
                <button
                  onClick={handleExtract}
                  disabled={!pdfFile || hlbCode.length !== 4 || extractStatus !== ''}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-xs rounded-xl shadow-lg hover:shadow-indigo-100 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer tracking-wider uppercase"
                >
                  Start Extraction ⚡
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
