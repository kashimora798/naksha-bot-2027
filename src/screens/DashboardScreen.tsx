import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { idbStore, SurveySession } from '../lib/idb';
import type { MapData } from '../types';
import ProfileScreen from './ProfileScreen';
import DonationPopup from '../components/DonationPopup';

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
}

export default function DashboardScreen({ user, userProfile, onLoadProject, onNewProject, onLiveSurvey, onResumeLiveSurvey, onDemoMap, onCanvasBlockMap, onProfileUpdated }: Props) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [assignedProjects, setAssignedProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [liveSessions, setLiveSessions] = useState<SurveySession[]>([]);
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Video Tutorial Popup States
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // WhatsApp Group Popup
  const [showWhatsApp, setShowWhatsApp] = useState(false);

  // Only one popup fires per browser session
  const sessionPopupShown = useRef(false);

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
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);

  const checkLimitAndStart = (action: () => void) => {
    if (projects.length >= 7) {
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
              <h1 className="text-lg sm:text-xl font-bold font-public-sans text-[var(--color-charcoal)] truncate leading-tight">NakshaBot</h1>
              <p className="text-[11px] sm:text-xs text-gray-500 truncate">Census 2027 Mapping</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowWhatsApp(true)}
              className="px-3 sm:px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm font-semibold text-green-700 hover:bg-green-100 transition-colors flex items-center gap-1.5"
              title="Join WhatsApp Support Group"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 flex-shrink-0" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.832 6.5L4 29l7.697-1.807A12.93 12.93 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm0 2c5.523 0 10 4.477 10 10s-4.477 10-10 10a10.93 10.93 0 01-5.25-1.336l-.37-.213-4.572 1.074 1.117-4.46-.234-.385A9.955 9.955 0 016 15C6 9.477 10.477 5 16 5zm-3.47 5.5c-.2 0-.52.075-.795.375C11.46 11.175 10.5 12.1 10.5 13.97c0 1.875 1.375 3.688 1.563 3.938.187.25 2.687 4.25 6.593 5.813 3.25 1.281 3.907 1.031 4.625.969.719-.063 2.313-.938 2.641-1.844.328-.906.328-1.688.226-1.844-.094-.156-.344-.25-.719-.437-.375-.188-2.219-1.094-2.563-1.219-.344-.125-.594-.188-.843.188-.25.375-.969 1.219-1.188 1.469-.218.25-.437.281-.812.094-.375-.188-1.582-.582-3.013-1.852-1.113-.992-1.863-2.215-2.082-2.59-.218-.375-.023-.578.164-.766.168-.168.375-.438.563-.656.187-.219.25-.375.375-.625.125-.25.063-.47-.031-.657-.094-.187-.844-2.031-1.157-2.78-.312-.75-.625-.65-.843-.663-.219-.012-.469-.012-.719-.012z"/>
              </svg>
              <span className="hidden sm:inline">Help Group</span>
            </button>
            <button
              onClick={() => setShowDonate(true)}
              className="px-3 sm:px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm font-semibold text-orange-600 hover:bg-orange-100 transition-colors flex items-center gap-1.5"
            >
              <span>🙏</span><span className="hidden sm:inline">Support</span>
            </button>
            <button
              onClick={() => setShowProfile(true)}
              className="px-3 sm:px-4 py-2 bg-[var(--color-warm-paper)] border border-[var(--color-saffron)]/15 rounded-xl text-sm font-semibold text-gray-700 hover:bg-[var(--color-saffron)]/5 transition-colors flex items-center gap-1.5"
            >
              <span>👤</span><span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-3 sm:px-4 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Sign Out
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

        {/* ── Announcements Banner ── */}
        {announcements.length > 0 && (
          <div className="mb-6 space-y-4">
            {announcements.map(ann => (
              <div 
                key={ann.id} 
                onClick={() => setSelectedAnnouncement(ann)}
                className="bg-white border border-orange-100 rounded-2xl shadow-[var(--shadow-warm-1)] overflow-hidden flex flex-col md:flex-row hover:border-orange-200 hover:shadow-[var(--shadow-warm-2)] hover:scale-[0.995] active:scale-[0.99] cursor-pointer transition-all group"
                title="Click to view details / विवरण देखने के लिए क्लिक करें"
              >
                {ann.image_url && (
                  <div className="md:w-1/3 h-32 md:h-auto relative overflow-hidden shrink-0 bg-gray-50 flex items-center justify-center">
                    <img 
                      src={ann.image_url} 
                      alt={ann.title} 
                      className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" 
                      onError={(e) => { (e.target as any).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="p-5 flex-1 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">
                      📢 Update / सूचना
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {new Date(ann.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-800 text-base sm:text-lg mb-1.5 leading-tight font-public-sans">
                    {ann.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans line-clamp-2">
                    {ann.content}
                  </p>
                  <span className="text-[10px] text-orange-500 font-bold mt-2 hover:underline">Read details →</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 text-sm">{error}</div>
        )}

        {/* ── Primary action cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
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
                  <h2 className="text-base font-bold font-public-sans text-[var(--color-charcoal)]">🗺️ आपके नक्शे <span className="text-gray-400 font-normal text-sm">/ Your Maps</span></h2>
                  {deskProjects.length > 0 && <span className="text-xs text-gray-400 font-semibold">{deskProjects.length}</span>}
                </div>
                {deskProjects.length === 0 ? (
                  <div className="bg-white rounded-[24px] p-8 text-center shadow-[var(--shadow-warm-1)] border border-[var(--color-saffron)]/10">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-3xl mx-auto mb-3">🗺️</div>
                    <h3 className="text-base font-bold font-public-sans text-[var(--color-charcoal)] mb-1">अभी तक कोई नक्शा नहीं</h3>
                    <p className="text-xs text-gray-500 mb-1">No maps yet</p>
                    <p className="text-sm text-gray-600 max-w-sm mx-auto mb-5">पहले tour लें — 2 मिनट में पूरा तरीका समझें। फिर अपना नक्शा बनाएं।</p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      <button onClick={onDemoMap} className="px-5 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-sm shadow-[var(--shadow-warm-1)] hover:bg-blue-100 transition-colors min-h-[52px]">🎓 Tour देखें / Take Tour</button>
                      <button onClick={() => checkLimitAndStart(() => onNewProject(undefined))} className="px-5 py-3 bg-[var(--color-saffron-container)] text-white rounded-xl font-bold text-sm shadow-[var(--shadow-warm-2)] hover:bg-[var(--color-saffron)] transition-colors min-h-[52px]">नक्शा बनाएं →</button>
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
      {/* Announcement Detail Modal */}
      {selectedAnnouncement && (
        <div className="fixed inset-0 z-[3000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden relative max-h-[90vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setSelectedAnnouncement(null)} 
              className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center font-bold text-lg transition-colors"
              aria-label="Close"
            >
              ×
            </button>
            {selectedAnnouncement.image_url && (
              <div className="w-full h-48 sm:h-56 relative overflow-hidden shrink-0 bg-gray-100">
                <img 
                  src={selectedAnnouncement.image_url} 
                  alt={selectedAnnouncement.title} 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className="p-6 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 px-2 py-0.5 rounded-md">
                  📢 Update / सूचना
                </span>
                <span className="text-[10px] text-gray-400 font-mono">
                  {new Date(selectedAnnouncement.created_at).toLocaleDateString()}
                </span>
              </div>
              <h3 className="font-bold text-slate-800 text-lg sm:text-xl mb-3 leading-tight font-public-sans">
                {selectedAnnouncement.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed font-sans whitespace-pre-line">
                {selectedAnnouncement.content}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button 
                onClick={() => setSelectedAnnouncement(null)}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl shadow transition-colors"
              >
                Close / बंद करें
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
