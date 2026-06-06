import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminSessions, type AdminSession } from '../../lib/admin-api';

const STATUS_COLOR: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10 border-green-500/30',
  unpaid: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
};

export default function AdminSessionsScreen() {
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

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Live Sessions</h1>
      <p className="text-gray-500 text-sm mb-6">{sessions.length} total sessions</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search HLB, owner…"
          className="bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 w-64"
        />
        {(['all', 'paid', 'unpaid'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded text-xs capitalize transition-colors ${
              filter === f
                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                : 'bg-gray-900 text-gray-500 border border-gray-700 hover:text-gray-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
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
                <tr key={s.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4 text-gray-200 font-medium">{s.hlb_number || '—'}</td>
                  <td className="py-3 pr-4">
                    <Link to={`/kratagya/users/${s.user_id}`} className="text-orange-400 hover:text-orange-300">
                      {s.owner_name || 'Unknown'}
                    </Link>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLOR[s.payment_status] || 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                      {s.payment_status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs tabular-nums">
                    {s.regen_used}/{s.regen_allowance}
                  </td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">
                    {new Date(s.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3">
                    <a
                      href={`/live-session/${s.session_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-400 hover:text-orange-300 text-xs"
                    >
                      View →
                    </a>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-600">No sessions found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
