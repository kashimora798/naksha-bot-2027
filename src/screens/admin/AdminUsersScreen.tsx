import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchAdminUsers, type AdminUser } from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

export default function AdminUsersScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAdminUsers(page, 20, debouncedSearch)
      .then(res => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, debouncedSearch]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Users</h1>
        <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{total} registered accounts</p>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, mobile, tehsil, village…"
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
          Loading users…
        </div>
      ) : (
        <div className={`border rounded-2xl p-4 sm:p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[650px]">
              <thead>
                <tr className={`text-xs uppercase tracking-wider border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-500 border-gray-800'}`}>
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
                {users.map(user => (
                  <tr key={user.id} className={`border-b transition-colors ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/50 hover:bg-gray-800/30'}`}>
                    <td className="py-3 pr-4">
                      <span className={`font-medium ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{user.full_name || '—'}</span>
                      {user.is_admin && (
                        <span className="ml-2 text-[10px] bg-orange-500/20 text-orange-400 px-1.5 py-0.5 rounded font-semibold">admin</span>
                      )}
                    </td>
                    <td className={`py-3 pr-4 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{user.mobile || '—'}</td>
                    <td className={`py-3 pr-4 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                      {[user.town_village, user.tehsil].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className={`py-3 pr-4 tabular-nums ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{user.project_count}</td>
                    <td className={`py-3 pr-4 tabular-nums ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{user.live_session_count}</td>
                    <td className={`py-3 pr-4 text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(user.created_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3">
                      <Link
                        to={`/kratagya/users/${user.id}`}
                        className="text-orange-500 hover:text-orange-400 text-xs font-semibold"
                      >
                        View →
                      </Link>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`py-12 text-center ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No users found</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {total > 20 && (
            <div className={`flex items-center justify-between border-t px-4 py-4 sm:px-6 mt-4 ${isLight ? 'border-slate-200' : 'border-gray-800'}`}>
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className={`relative inline-flex items-center rounded-md border px-4 py-2 text-xs font-medium disabled:opacity-30 ${
                    isLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  Previous
                </button>
                <button
                  disabled={page * 20 >= total}
                  onClick={() => setPage(p => p + 1)}
                  className={`relative ml-3 inline-flex items-center rounded-md border px-4 py-2 text-xs font-medium disabled:opacity-30 ${
                    isLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
                  }`}
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                    Showing <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>{(page - 1) * 20 + 1}</span> to{' '}
                    <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>{Math.min(page * 20, total)}</span> of{' '}
                    <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>{total}</span> users
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={`relative inline-flex items-center rounded-l-md border px-3 py-2 text-xs font-medium disabled:opacity-30 transition-colors ${
                        isLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      Prev
                    </button>
                    {Array.from({ length: totalPages }).map((_, idx) => {
                      const pNum = idx + 1;
                      if (pNum === 1 || pNum === totalPages || Math.abs(pNum - page) <= 2) {
                        return (
                          <button
                            key={pNum}
                            onClick={() => setPage(pNum)}
                            className={`relative inline-flex items-center border px-3 py-2 text-xs font-medium transition-colors ${
                              page === pNum
                                ? 'bg-orange-500 text-white font-bold border-orange-500 z-10'
                                : isLight
                                ? 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                                : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
                            }`}
                          >
                            {pNum}
                          </button>
                        );
                      }
                      if (pNum === 2 || pNum === totalPages - 1) {
                        return <span key={pNum} className={`relative inline-flex items-center border px-3 py-2 text-xs ${isLight ? 'border-slate-300 bg-white text-slate-400' : 'border-gray-700 bg-gray-900 text-gray-600'}`}>...</span>;
                      }
                      return null;
                    })}
                    <button
                      disabled={page * 20 >= total}
                      onClick={() => setPage(p => p + 1)}
                      className={`relative inline-flex items-center rounded-r-md border px-3 py-2 text-xs font-medium disabled:opacity-30 transition-colors ${
                        isLight ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50' : 'border-gray-700 bg-gray-900 text-gray-400 hover:bg-gray-800'
                      }`}
                    >
                      Next
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
