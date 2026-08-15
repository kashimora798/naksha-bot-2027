import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchAdminSessions, type AdminSession } from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

const STATUS_COLOR_DARK: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10 border-green-500/30',
  unpaid: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
};

const STATUS_COLOR_LIGHT: Record<string, string> = {
  paid: 'text-green-700 bg-green-50 border-green-200',
  unpaid: 'text-amber-700 bg-amber-50 border-amber-200',
};

export default function AdminSessionsScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  useEffect(() => {
    fetchAdminSessions()
      .then(setSessions)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = sessions.filter(s => {
    if (filter !== 'all' && s.payment_status !== filter) return false;
    const q = search.toLowerCase();
    return (
      (s.hlb_number || '').toLowerCase().includes(q) ||
      (s.owner_name || '').toLowerCase().includes(q) ||
      (s.session_id || '').includes(q)
    );
  });

  const statusColors = isLight ? STATUS_COLOR_LIGHT : STATUS_COLOR_DARK;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Live Sessions</h1>
        <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{sessions.length} total sessions</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search HLB, owner…"
          className={`w-full sm:w-64 border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500 ${
            isLight
              ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm'
              : 'bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-600'
          }`}
        />
        {(['all', 'paid', 'unpaid'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs capitalize font-semibold transition-colors cursor-pointer ${
              filter === f
                ? 'bg-orange-500 text-white shadow-sm'
                : isLight
                ? 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                : 'bg-gray-900 text-gray-400 border border-gray-800 hover:text-gray-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
          Loading sessions…
        </div>
      ) : (
        <div className={`border rounded-2xl p-4 sm:p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[600px]">
              <thead>
                <tr className={`text-xs uppercase tracking-wider border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-500 border-gray-800'}`}>
                  <th className="text-left py-3 pr-4">HLB No.</th>
                  <th className="text-left py-3 pr-4">Owner</th>
                  <th className="text-left py-3 pr-4">Payment</th>
                  <th className="text-left py-3 pr-4">Regen</th>
                  <th className="text-left py-3 pr-4">Date</th>
                  <th className="text-left py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} className={`border-b transition-colors ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/50 hover:bg-gray-800/30'}`}>
                    <td className={`py-3 pr-4 font-medium ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{s.hlb_number || '—'}</td>
                    <td className="py-3 pr-4">
                      <Link to={`/kratagya/users/${s.user_id}`} className="text-orange-500 hover:text-orange-400 font-medium">
                        {s.owner_name || 'Unknown'}
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${statusColors[s.payment_status] || (isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-gray-400 bg-gray-800 border-gray-700')}`}>
                        {s.payment_status}
                      </span>
                    </td>
                    <td className={`py-3 pr-4 text-xs tabular-nums ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                      {s.regen_used}/{s.regen_allowance}
                    </td>
                    <td className={`py-3 pr-4 text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(s.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3">
                      <a
                        href={`/live-session/${s.session_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-orange-500 hover:text-orange-400 text-xs font-semibold"
                      >
                        View →
                      </a>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className={`py-12 text-center ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No sessions found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
