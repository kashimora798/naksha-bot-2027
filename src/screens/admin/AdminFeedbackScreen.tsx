import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchAdminFeedback, type AdminFeedback } from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

export default function AdminFeedbackScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAdminFeedback()
      .then(setFeedback)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = feedback.filter(f => {
    const q = search.toLowerCase();
    return (
      (f.suggestions || '').toLowerCase().includes(q) ||
      (f.useful || '').toLowerCase().includes(q) ||
      (f.owner_name || '').toLowerCase().includes(q) ||
      (f.owner_mobile || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Feedback</h1>
        <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{feedback.length} submissions</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search feedback…"
        className={`w-full max-w-sm border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm'
            : 'bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-600'
        }`}
      />

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
          Loading feedback…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(f => (
            <div
              key={f.id}
              className={`border rounded-2xl p-5 transition-colors ${
                isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  {f.user_id ? (
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/kratagya/users/${f.user_id}`}
                        className="text-orange-500 hover:text-orange-400 text-sm font-medium"
                      >
                        {f.owner_name || 'Unknown user'}
                      </Link>
                      {f.owner_mobile && (
                        <a 
                          href={`tel:${f.owner_mobile}`}
                          className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                            isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                          }`}
                        >
                          📞 {f.owner_mobile}
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>Anonymous</span>
                  )}
                  {f.useful && (
                    <span className={`ml-3 text-xs px-2 py-0.5 rounded font-medium ${
                      isLight ? 'bg-slate-100 text-slate-600' : 'bg-gray-800 text-gray-400'
                    }`}>
                      {f.useful}
                    </span>
                  )}
                </div>
                <span className={`text-xs shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>
                  {new Date(f.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
              <p className={`text-sm leading-relaxed whitespace-pre-wrap ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>
                {f.suggestions || <span className={`italic ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No message</span>}
              </p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className={`text-center py-12 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No feedback found</p>
          )}
        </div>
      )}
    </div>
  );
}
