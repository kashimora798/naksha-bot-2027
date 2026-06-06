import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminUsers, type AdminUser } from '../../lib/admin-api';

export default function AdminUsersScreen() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.mobile || '').includes(q) ||
      (u.tehsil || '').toLowerCase().includes(q) ||
      (u.town_village || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Users</h1>
      <p className="text-gray-500 text-sm mb-6">{users.length} registered accounts</p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, mobile, tehsil…"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 mb-6"
      />

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
                <th className="text-left py-3 pr-4">Name</th>
                <th className="text-left py-3 pr-4">Mobile</th>
                <th className="text-left py-3 pr-4">Location</th>
                <th className="text-left py-3 pr-4">Projects</th>
                <th className="text-left py-3 pr-4">Sessions</th>
                <th className="text-left py-3 pr-4">Joined</th>
                <th className="text-left py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(user => (
                <tr key={user.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4">
                    <span className="text-gray-200 font-medium">{user.full_name || '—'}</span>
                    {user.is_admin && (
                      <span className="ml-2 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded">admin</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-400">{user.mobile || '—'}</td>
                  <td className="py-3 pr-4 text-gray-400">
                    {[user.town_village, user.tehsil].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 tabular-nums">{user.project_count}</td>
                  <td className="py-3 pr-4 text-gray-400 tabular-nums">{user.live_session_count}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">
                    {new Date(user.created_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3">
                    <Link
                      to={`/kratagya/users/${user.id}`}
                      className="text-orange-400 hover:text-orange-300 text-xs"
                    >
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-600">No users found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
