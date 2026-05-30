import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { idbStore, SurveySession } from '../lib/idb';
import type { MapData } from '../types';
import ProfileScreen from './ProfileScreen';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  data: Partial<MapData>;
  created_at: string;
  updated_at: string;
  payment_status: string;
  export_count: number;
}

interface Props {
  user: any;
  userProfile?: any;
  onLoadProject: (projectId: string, data: Partial<MapData>) => void;
  onNewProject: (initialData?: Partial<MapData>) => void;
  onLiveSurvey?: (initialData?: Partial<MapData>) => void;
  onResumeLiveSurvey?: (sessionId: string) => void;
  onDemoMap?: () => void;
  onProfileUpdated?: (profile: any) => void;
}

export default function DashboardScreen({ user, userProfile, onLoadProject, onNewProject, onLiveSurvey, onResumeLiveSurvey, onDemoMap, onProfileUpdated }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [liveSessions, setLiveSessions] = useState<SurveySession[]>([]);
  const [showDemoModal, setShowDemoModal] = useState(false);

  // Feedback State
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('naksha_demo_done')) {
      setShowDemoModal(true);
      localStorage.setItem('naksha_demo_done', 'true');
    }
  }, []);

  useEffect(() => {
    async function loadProjects() {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        const visibleProjects = (data || []).filter(p => !p.data?.deletedUI);
        setProjects(visibleProjects);

        // Show feedback if they have maps and haven't seen it yet
        if (visibleProjects.length > 0 && !localStorage.getItem('naksha_dashboard_feedback')) {
          setShowFeedback(true);
          localStorage.setItem('naksha_dashboard_feedback', 'true');
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 font-semibold animate-pulse">Loading your maps...</p>
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
        useful: 'Dashboard Experience'
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
    <div className="min-h-screen flex flex-col p-6 font-noto-sans bg-transparent">
      <div className="max-w-4xl w-full mx-auto">
        <header className="flex items-center justify-between mb-8 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-10 h-10 sm:w-12 sm:h-12 object-contain flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl font-bold font-public-sans text-[var(--color-charcoal)] truncate">NakshaBot</h1>
              <p className="text-xs sm:text-sm text-gray-600 truncate">Welcome back, {user?.user_metadata?.full_name || user?.email || 'Surveyor'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowProfile(true)}
              className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
            >
              <span>👤</span><span className="hidden sm:inline">Profile</span>
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 text-sm">{error}</div>
        )}

        {/* ── Live Maps Section ── */}
        {liveSessions.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold font-public-sans text-[var(--color-charcoal)]">🗺️ Live Surveys</h2>
              <button
                onClick={() => onLiveSurvey?.(undefined)}
                className="px-4 py-2 bg-[var(--color-saffron)] text-white rounded-xl font-bold text-sm shadow active:scale-95 transition-all min-h-[44px]"
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
                      className="bg-white rounded-2xl p-4 shadow-[var(--shadow-warm-1)] border border-amber-100 flex items-center gap-3 group relative overflow-hidden cursor-pointer active:bg-amber-50 transition-colors"
                      onClick={() => onResumeLiveSurvey?.(session.session_id)}>
                      <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-amber-400 rounded-l-2xl" />
                      <div className="flex-1 pl-1">
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
                      <div className="flex-1 pl-1">
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

        {/* ── Regular Maps Section ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
          <h2 className="text-xl font-bold font-public-sans text-[var(--color-charcoal)]">Your Maps</h2>
          <div className="grid grid-cols-2 sm:flex gap-2">
            {liveSessions.length === 0 && (
              <button
                onClick={() => onLiveSurvey?.(undefined)}
                className="px-4 py-2.5 bg-white border border-[var(--color-saffron)] text-[var(--color-saffron)] rounded-xl font-bold text-sm shadow-[var(--shadow-warm-1)] hover:bg-orange-50 transition-colors min-h-[52px]"
              >
                🚶‍♂️ Live Survey
              </button>
            )}
            <button
              onClick={onDemoMap}
              className="px-4 py-2.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold text-sm shadow-[var(--shadow-warm-1)] hover:bg-blue-100 transition-colors min-h-[52px]"
            >
              🎓 Try Demo
            </button>
            <button
              onClick={() => onNewProject(undefined)}
              className="col-span-2 sm:col-span-1 px-4 py-2.5 bg-[var(--color-saffron-container)] text-white rounded-xl font-bold text-sm shadow-[var(--shadow-warm-1)] hover:bg-[var(--color-saffron)] transition-colors min-h-[52px]"
            >
              + Create New Map
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-[24px] p-12 text-center shadow-[var(--shadow-warm-1)] border border-gray-100 relative overflow-hidden">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gray-200" />
            <div className="text-5xl mb-4">🗺️</div>
            <h3 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)] mb-2">No maps yet</h3>
            <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">Start by creating a new map or using Live Survey mode.</p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => onLiveSurvey?.(undefined)} className="px-6 py-3 bg-white border border-[var(--color-saffron)] text-[var(--color-saffron)] rounded-xl font-bold shadow hover:bg-orange-50 transition-colors min-h-[52px]">🚶‍♂️ Live Survey</button>
              <button onClick={() => onNewProject(undefined)} className="px-6 py-3 bg-[var(--color-saffron-container)] text-white rounded-xl font-bold shadow-[var(--shadow-warm-2)] hover:bg-[var(--color-saffron)] transition-colors min-h-[52px]">Start First Map</button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => onLoadProject(project.id, { ...project.data, paymentStatus: project.payment_status, exportCount: project.export_count })}
                className="bg-white rounded-[24px] p-5 shadow-[var(--shadow-warm-1)] border border-gray-50 cursor-pointer hover:shadow-[var(--shadow-warm-2)] transition-all group relative overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-[var(--color-india-green)]" />
                <button
                  onClick={(e) => handleDeleteUI(e, project)}
                  className="absolute top-2 right-2 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all min-h-[36px]"
                  title="Remove from Dashboard"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
                <div className="flex justify-between items-start mb-3 pr-6 pl-2">
                  <h3 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)] group-hover:text-[var(--color-saffron)] transition-colors truncate">
                    {project.name || 'Untitled Map'}
                  </h3>
                </div>
                <div className="flex items-center gap-2 mb-3 pl-2">
                  <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-1 rounded font-jetbrains-mono">
                    {project.data?.blocks?.length || 0} Blocks
                  </span>
                </div>
                <div className="text-xs text-gray-600 space-y-1 pl-2 font-jetbrains-mono">
                  <p>HLB: {project.data?.hlbNumber || '—'}</p>
                  <p className="truncate">Loc: {project.data?.district || '—'}, {project.data?.state || '—'}</p>
                  <p className="mt-3 pt-3 border-t border-gray-100 text-[10px] text-gray-400">
                    Last edited: {new Date(project.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showDemoModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full animate-in fade-in zoom-in duration-300">
            <div className="text-4xl text-center mb-4">🗺️</div>
            <h2 className="text-xl font-black text-gray-800 text-center mb-2">Welcome to NakshaBot!</h2>
            <p className="text-sm text-gray-600 text-center mb-6">
              Learn how to quickly create a stunning HLO Census map in less than 2 minutes. We've set up a guided demo for you.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => { setShowDemoModal(false); onDemoMap?.(); }}
                className="w-full bg-[var(--color-saffron)] text-white font-bold py-3 rounded-xl shadow active:scale-95 transition-all"
              >
                Start Interactive Demo
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
              <p className="text-sm text-slate-500 mb-6">You've created some maps! We'd love to hear your thoughts or any suggestions you have.</p>
              
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
              <p className="text-sm text-slate-600 mb-6">Your feedback has been recorded.</p>
              <button onClick={() => setShowFeedback(false)} className="w-full py-3 bg-[var(--color-saffron)] text-white rounded-xl font-bold font-[Baloo_2] shadow hover:bg-orange-600">
                Close
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
