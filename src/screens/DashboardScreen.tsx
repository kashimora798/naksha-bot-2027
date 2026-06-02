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

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 text-sm">{error}</div>
        )}

        {/* ── Primary action cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          <button
            onClick={() => onNewProject(undefined)}
            className="group text-left p-5 rounded-2xl bg-[var(--color-saffron-container)] text-white shadow-[var(--shadow-warm-2)] hover:brightness-105 active:scale-[0.99] transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center text-2xl mb-3">🗺️</div>
            <p className="font-bold text-base font-public-sans">Create New Map</p>
            <p className="text-xs text-white/80 mt-0.5">Build an HLB map from satellite imagery</p>
          </button>
          <button
            onClick={() => onLiveSurvey?.(undefined)}
            className="group text-left p-5 rounded-2xl bg-white border border-[var(--color-saffron)]/15 shadow-[var(--shadow-warm-1)] hover:shadow-[var(--shadow-warm-2)] active:scale-[0.99] transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-2xl mb-3">🚶</div>
            <p className="font-bold text-base font-public-sans text-[var(--color-charcoal)]">Live Survey</p>
            <p className="text-xs text-gray-500 mt-0.5">Walk the area with GPS recording</p>
          </button>
          <button
            onClick={onDemoMap}
            className="group text-left p-5 rounded-2xl bg-white border border-blue-100 shadow-[var(--shadow-warm-1)] hover:shadow-[var(--shadow-warm-2)] active:scale-[0.99] transition-all"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center text-2xl mb-3">🎓</div>
            <p className="font-bold text-base font-public-sans text-[var(--color-charcoal)]">Take the Tour</p>
            <p className="text-xs text-gray-500 mt-0.5">2-minute guided walkthrough</p>
          </button>
        </div>

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
                onClick={() => onLiveSurvey?.(undefined)}
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)]">Your Maps</h2>
          {projects.length > 0 && <span className="text-xs text-gray-400 font-semibold">{projects.length} total</span>}
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-[24px] p-10 sm:p-12 text-center shadow-[var(--shadow-warm-1)] border border-[var(--color-saffron)]/10">
            <div className="w-16 h-16 rounded-2xl bg-[var(--color-saffron)]/10 flex items-center justify-center text-4xl mx-auto mb-4">🗺️</div>
            <h3 className="text-lg font-bold font-public-sans text-[var(--color-charcoal)] mb-2">No maps yet</h3>
            <p className="text-sm text-gray-600 max-w-sm mx-auto mb-6">Create your first census map, or take the 2-minute guided tour to see how it works.</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button onClick={onDemoMap} className="px-5 py-3 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl font-bold shadow-[var(--shadow-warm-1)] hover:bg-blue-100 transition-colors min-h-[52px]">🎓 Take the Tour</button>
              <button onClick={() => onNewProject(undefined)} className="px-5 py-3 bg-[var(--color-saffron-container)] text-white rounded-xl font-bold shadow-[var(--shadow-warm-2)] hover:bg-[var(--color-saffron)] transition-colors min-h-[52px]">Start First Map</button>
            </div>
          </div>
        ) : (() => {
          const renderCard = (project: any) => (
            <div
              key={project.id}
              onClick={() => onLoadProject(project.id, { ...project.data, paymentStatus: project.payment_status, exportCount: project.export_count })}
              className="bg-white rounded-2xl p-5 shadow-[var(--shadow-warm-1)] border border-[var(--color-saffron)]/10 cursor-pointer hover:shadow-[var(--shadow-warm-2)] hover:-translate-y-0.5 transition-all group relative overflow-hidden"
            >
              <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${project.payment_status === 'paid' ? 'bg-green-500' : 'bg-[var(--color-india-green)]'}`} />
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
                <div className="flex items-start justify-between mb-3 pr-6">
                  <h3 className="text-base font-bold font-public-sans text-[var(--color-charcoal)] group-hover:text-[var(--color-saffron)] transition-colors truncate">
                    {project.name || 'Untitled Map'}
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                  <span className="text-[11px] font-bold bg-[var(--color-india-green)]/10 text-[var(--color-india-green)] px-2 py-1 rounded-full font-jetbrains-mono">{project.data?.blocks?.length || 0} Blocks</span>
                  <span className="text-[11px] font-bold bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-jetbrains-mono">HLB {project.data?.hlbNumber || '—'}</span>
                  {project.payment_status === 'paid'
                    ? <span className="text-[11px] font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">✓ Paid · tap to download</span>
                    : <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Draft</span>}
                </div>
                <div className="text-xs text-gray-500 space-y-1 font-jetbrains-mono">
                  <p className="truncate">📍 {project.data?.district || '—'}, {project.data?.state || '—'}</p>
                  <p className="text-[10px] text-gray-400 pt-2 border-t border-gray-100">Edited {new Date(project.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          );
          const paid = projects.filter((p: any) => p.payment_status === 'paid');
          const drafts = projects.filter((p: any) => p.payment_status !== 'paid');
          return (
            <div className="space-y-6">
              {paid.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">✓ Paid — ready to download ({paid.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{paid.map(renderCard)}</div>
                </div>
              )}
              {drafts.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Drafts ({drafts.length})</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{drafts.map(renderCard)}</div>
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
