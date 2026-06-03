import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { idbStore } from '../lib/idb';
import type { SurveySession } from '../lib/idb';
import { supabase } from '../lib/supabase';

export default function SessionsDashboard() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SurveySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [payments, setPayments] = useState<Record<string, string>>({});

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const data = await idbStore.getAllSessions();
        setSessions(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
        
        // Fetch payment statuses
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: exports } = await supabase
            .from('live_exports')
            .select('session_id, payment_status')
            .eq('user_id', session.user.id);
          if (exports) {
            const statusMap: Record<string, string> = {};
            exports.forEach(x => {
              statusMap[x.session_id] = x.payment_status;
            });
            setPayments(statusMap);
          }
        }
      } catch (err) {
        console.error('Failed to load sessions:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSessions();
  }, []);

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this session? This cannot be undone.')) {
      try {
        await idbStore.deleteSession(sessionId);
        setSessions(prev => prev.filter(s => s.session_id !== sessionId));
      } catch (err) {
        console.error('Failed to delete session:', err);
      }
    }
  };

  const filteredSessions = sessions.filter(s => {
    if (filter === 'ACTIVE') return s.state !== 'completed';
    if (filter === 'COMPLETED') return s.state === 'completed';
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="bg-white shadow-sm px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/')} className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center active:scale-95">
            ←
          </button>
          <div>
            <h1 className="text-xl font-black text-gray-800 tracking-tight">Survey Sessions</h1>
            <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Offline Drafts & Sync</p>
          </div>
        </div>
      </header>

      <div className="p-4 flex-1 max-w-lg mx-auto w-full">
        {/* FILTERS */}
        <div className="flex gap-2 mb-6">
          <button 
            onClick={() => setFilter('ALL')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${filter === 'ALL' ? 'bg-gray-800 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            All
          </button>
          <button 
            onClick={() => setFilter('ACTIVE')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${filter === 'ACTIVE' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            Active
          </button>
          <button 
            onClick={() => setFilter('COMPLETED')}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${filter === 'COMPLETED' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}
          >
            Completed
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col justify-center items-center py-20 text-gray-400">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin mb-4"></div>
            <p className="font-medium text-sm">Loading offline sessions...</p>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="bg-white border border-gray-200 border-dashed rounded-2xl p-8 text-center mt-4">
            <div className="text-4xl mb-4">🗺️</div>
            <h3 className="font-bold text-gray-800 text-lg mb-2">No Sessions Found</h3>
            <p className="text-sm text-gray-500 mb-6">You haven't started any live surveys yet.</p>
            <button onClick={() => navigate('/live-prep')} className="bg-[var(--color-saffron)] text-white font-bold py-3 px-6 rounded-xl shadow-lg active:scale-95 transition-all">
              Start New Survey
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 pb-20">
            {filteredSessions.map(session => (
              <div 
                key={session.session_id}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 transition-transform"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-black text-lg text-gray-800">{session.hlb_number || 'Draft Session'}</span>
                      {session.state === 'completed' ? (
                        payments[session.session_id] === 'paid' ? (
                          <span className="bg-green-100 text-green-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">✓ Paid</span>
                        ) : (
                          <span className="bg-amber-100 text-amber-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider font-jetbrains-mono">Draft</span>
                        )
                      ) : (
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">Active</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium">
                      {new Date(session.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={(e) => handleDelete(e, session.session_id)}
                      className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 transition-colors"
                      title="Delete Session"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                      ›
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-50">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Houses</p>
                    <p className="text-sm font-black text-gray-800">{session.houses_count || 0}</p>
                  </div>
                  <div className="text-center border-l border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Distance</p>
                    <p className="text-sm font-black text-gray-800">{(session.distance_m || 0) < 1000 ? `${session.distance_m || 0}m` : `${((session.distance_m || 0)/1000).toFixed(1)}km`}</p>
                  </div>
                  <div className="text-center border-l border-gray-100">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Location</p>
                    <p className="text-xs font-bold text-gray-800 truncate px-1">{session.location_name || 'Unknown'}</p>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  <button 
                    onClick={() => navigate(`/live-session/${session.session_id}`)}
                    className="flex-1 bg-gray-100 text-gray-700 font-bold text-sm py-3 rounded-xl hover:bg-gray-200 active:scale-95 transition-all"
                  >
                    View Register & Map
                  </button>
                  {session.state !== 'completed' && (
                    <button 
                      onClick={() => navigate(`/live-survey?session=${session.session_id}`)}
                      className="flex-1 bg-[var(--color-saffron)] text-white font-bold text-sm py-3 rounded-xl shadow-md hover:bg-orange-600 active:scale-95 transition-all"
                    >
                      Resume Survey
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Floating Action Button */}
      <button 
        onClick={() => navigate('/live-prep')}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[var(--color-saffron)] text-white rounded-full shadow-[0_4px_14px_rgba(255,107,0,0.4)] flex items-center justify-center text-2xl active:scale-90 transition-transform z-20"
      >
        +
      </button>
    </div>
  );
}
