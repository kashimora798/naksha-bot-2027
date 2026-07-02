import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  fetchAdminProjects,
  fetchAdminUsers,
  fetchProjectAssignments,
  createAdminProject,
  assignProjectToUser,
  revokeProjectAssignment,
  transferProjectOwner,
  searchAdminUsers,
  type AdminProject,
  type AdminUser,
  type AdminAssignment,
} from '../../lib/admin-api';

const STATUS_COLOR: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10 border-green-500/30',
  unpaid: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
};

export default function AdminProjectsScreen() {
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'unpaid'>('all');

  // Create project modal
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);

  // Assign modal state
  const [assignProject, setAssignProject] = useState<AdminProject | null>(null);
  const [assignments, setAssignments] = useState<AdminAssignment[]>([]);
  const [assignUsers, setAssignUsers] = useState<AdminUser[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [assignError, setAssignError] = useState<string | null>(null);

  // Transfer modal state
  const [transferProject, setTransferProject] = useState<AdminProject | null>(null);
  const [transferUsers, setTransferUsers] = useState<AdminUser[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferSearch, setTransferSearch] = useState('');
  const [transferError, setTransferError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input to limit API calls
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset page to 1 on search change
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // Reset page to 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [filter]);

  // Fetch paginated, filtered, and searched projects
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchAdminProjects(page, 20, debouncedSearch, filter)
      .then(res => {
        setProjects(res.projects);
        setTotal(res.total);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, filter, debouncedSearch]);

  // Search users for assign modal (debounced database query)
  useEffect(() => {
    if (!assignProject) return;
    setAssignLoading(true);
    setAssignError(null);
    const t = setTimeout(() => {
      searchAdminUsers(userSearch)
        .then(setAssignUsers)
        .catch(e => setAssignError(e.message))
        .finally(() => setAssignLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, assignProject]);

  // Search users for transfer modal (debounced database query)
  useEffect(() => {
    if (!transferProject) return;
    setTransferLoading(true);
    setTransferError(null);
    const t = setTimeout(() => {
      searchAdminUsers(transferSearch)
        .then(setTransferUsers)
        .catch(e => setTransferError(e.message))
        .finally(() => setTransferLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [transferSearch, transferProject]);

  const filtered = projects;

  const openProject = (id: string) => {
    window.open(`/app?admin_view=${id}`, '_blank');
  };

  // ── Create project ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const created = await createAdminProject(createName.trim());
      setProjects(prev => [created, ...prev]);
      setShowCreate(false);
      setCreateName('');
    } catch (e: any) {
      alert(e.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  // ── Assign modal ────────────────────────────────────────────────────────────

  const openAssignModal = async (project: AdminProject) => {
    setAssignProject(project);
    setAssignError(null);
    setUserSearch('');
    setAssignLoading(true);
    try {
      const asgns = await fetchProjectAssignments(project.id);
      setAssignments(asgns);
    } catch (e: any) {
      setAssignError(e.message);
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssign = async (user: AdminUser) => {
    if (!assignProject) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await assignProjectToUser(assignProject.id, user.id);
      const updated = await fetchProjectAssignments(assignProject.id);
      setAssignments(updated);
    } catch (e: any) {
      setAssignError(e.message || 'Failed to assign');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!assignProject) return;
    if (!confirm('Remove this user\'s access?')) return;
    setAssignLoading(true);
    setAssignError(null);
    try {
      await revokeProjectAssignment(assignProject.id, userId);
      setAssignments(prev => prev.filter(a => a.user_id !== userId));
    } catch (e: any) {
      setAssignError(e.message || 'Failed to revoke');
    } finally {
      setAssignLoading(false);
    }
  };

  const openTransferModal = async (project: AdminProject) => {
    setTransferProject(project);
    setTransferError(null);
    setTransferSearch('');
  };

  const handleTransfer = async (user: AdminUser) => {
    if (!transferProject) return;
    if (!confirm(`Confirm project ownership transfer:\n\nProject: "${transferProject.name || 'Untitled'}"\nTo user: ${user.full_name || 'Unknown'} (${user.mobile || 'no mobile'})?`)) return;
    setTransferLoading(true);
    setTransferError(null);
    try {
      await transferProjectOwner(transferProject.id, user.id);
      
      setProjects(prev => prev.map(p => {
        if (p.id === transferProject.id) {
          return {
            ...p,
            user_id: user.id,
            owner_name: user.full_name,
            owner_mobile: user.mobile
          };
        }
        return p;
      }));
      
      setTransferProject(null);
    } catch (e: any) {
      setTransferError(e.message || 'Failed to transfer ownership');
    } finally {
      setTransferLoading(false);
    }
  };

  const assignedUserIds = new Set(assignments.map(a => a.user_id));

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-gray-100">Projects</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create Project
        </button>
      </div>
      <p className="text-gray-500 text-sm mb-6">{total} total projects</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, owner, district…"
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
                <th className="text-left py-3 pr-4">Project</th>
                <th className="text-left py-3 pr-4">Owner</th>
                <th className="text-left py-3 pr-4">Location</th>
                <th className="text-left py-3 pr-4">Status</th>
                <th className="text-left py-3 pr-4">Exports</th>
                <th className="text-left py-3 pr-4">Updated</th>
                <th className="text-left py-3 pr-4" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-900/50 transition-colors">
                  <td className="py-3 pr-4 text-gray-200 font-medium max-w-[180px] truncate">
                    {p.name || 'Untitled'}
                  </td>
                  <td className="py-3 pr-4">
                    <Link
                      to={`/kratagya/users/${p.user_id}`}
                      className="text-orange-400 hover:text-orange-300"
                    >
                      {p.owner_name || 'Unknown'}
                    </Link>
                    {p.owner_mobile && (
                      <div className="text-gray-600 text-xs">{p.owner_mobile}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-gray-400 text-xs">
                    {p.data?.district || '—'}{p.data?.state ? `, ${p.data.state}` : ''}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded border ${STATUS_COLOR[p.payment_status] || 'text-gray-400 bg-gray-800 border-gray-700'}`}>
                      {p.payment_status}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-gray-400 tabular-nums">{p.export_count || 0}</td>
                  <td className="py-3 pr-4 text-gray-500 text-xs">
                    {new Date(p.updated_at).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openProject(p.id)}
                        className="text-orange-400 hover:text-orange-300 text-xs"
                      >
                        Open →
                      </button>
                      <button
                        onClick={() => openAssignModal(p)}
                        className="text-blue-400 hover:text-blue-300 text-xs"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => openTransferModal(p)}
                        className="text-emerald-400 hover:text-emerald-300 text-xs"
                      >
                        Transfer
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-gray-600">No projects found</td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {total > 20 && (
            <div className="flex items-center justify-between border-t border-gray-800 px-4 py-4 sm:px-6 mt-4">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="relative inline-flex items-center rounded-md border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={page * 20 >= total}
                  onClick={() => setPage(p => p + 1)}
                  className="relative ml-3 inline-flex items-center rounded-md border border-gray-700 bg-gray-900 px-4 py-2 text-xs font-medium text-gray-400 hover:bg-gray-800 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-300">{(page - 1) * 20 + 1}</span> to{' '}
                    <span className="font-semibold text-gray-300">{Math.min(page * 20, total)}</span> of{' '}
                    <span className="font-semibold text-gray-300">{total}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      disabled={page <= 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className="relative inline-flex items-center rounded-l-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
                    >
                      Prev
                    </button>
                    {Array.from({ length: Math.ceil(total / 20) }).map((_, idx) => {
                      const pNum = idx + 1;
                      if (pNum === 1 || pNum === Math.ceil(total / 20) || Math.abs(pNum - page) <= 2) {
                        return (
                          <button
                            key={pNum}
                            onClick={() => setPage(pNum)}
                            className={`relative inline-flex items-center border border-gray-700 px-3 py-2 text-xs font-medium transition-colors ${
                              page === pNum
                                ? 'bg-orange-500 text-white font-bold border-orange-500 z-10'
                                : 'bg-gray-900 text-gray-400 hover:bg-gray-800'
                            }`}
                          >
                            {pNum}
                          </button>
                        );
                      }
                      if (pNum === 2 || pNum === Math.ceil(total / 20) - 1) {
                        return <span key={pNum} className="relative inline-flex items-center border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-600">...</span>;
                      }
                      return null;
                    })}
                    <button
                      disabled={page * 20 >= total}
                      onClick={() => setPage(p => p + 1)}
                      className="relative inline-flex items-center rounded-r-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs font-medium text-gray-400 hover:bg-gray-800 disabled:opacity-30 transition-colors"
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

      {/* ── Create Project Modal ───────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h2 className="text-lg font-bold text-gray-100 mb-1">Create Project</h2>
            <p className="text-gray-500 text-xs mb-4">A blank project will be created under your admin account. Assign it to users after creation.</p>
            <input
              autoFocus
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Project name (e.g. HLB 123)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreate(false); setCreateName(''); }}
                className="flex-1 py-2.5 bg-gray-800 text-gray-400 rounded-lg text-sm hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !createName.trim()}
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign Modal ──────────────────────────────────────────────────────── */}
      {assignProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-800 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-100">Assign Project</h2>
                  <p className="text-gray-500 text-xs mt-0.5 truncate max-w-xs">{assignProject.name || 'Untitled'}</p>
                </div>
                <button
                  onClick={() => setAssignProject(null)}
                  className="text-gray-600 hover:text-gray-300 text-xl leading-none mt-0.5"
                >×</button>
              </div>

              {/* Current assignees */}
              {assignments.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Currently assigned</p>
                  <div className="space-y-1.5">
                    {assignments.map(a => (
                      <div key={a.id} className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-1.5">
                        <div>
                          <span className="text-blue-300 text-sm font-medium">{a.user_name || 'User'}</span>
                          {a.user_mobile && <span className="text-gray-500 text-xs ml-2">{a.user_mobile}</span>}
                        </div>
                        <button
                          onClick={() => handleRevoke(a.user_id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          Revoke
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* User search + list */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Add user</p>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search by name or mobile…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            {assignError && (
              <p className="px-6 text-red-400 text-xs">{assignError}</p>
            )}

            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-1.5 mt-2">
              {assignLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-4 justify-center">
                  <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : assignUsers.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-6">No users found</p>
              ) : (
                assignUsers.map(u => {
                  const alreadyAssigned = assignedUserIds.has(u.id);
                  return (
                    <div
                      key={u.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-800 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-gray-200 text-sm font-medium truncate">{u.full_name || 'Unknown'}</p>
                        <p className="text-gray-500 text-xs">{u.mobile || '—'} · {u.tehsil || '—'}</p>
                      </div>
                      {alreadyAssigned ? (
                        <span className="text-xs text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full flex-shrink-0 ml-2">Assigned</span>
                      ) : (
                        <button
                          onClick={() => handleAssign(u)}
                          className="text-xs bg-orange-500 hover:bg-orange-400 text-white px-3 py-1 rounded-lg transition-colors flex-shrink-0 ml-2"
                        >
                          Assign
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
      {/* ── Transfer Modal ────────────────────────────────────────────────────── */}
      {transferProject && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-800 flex-shrink-0">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-100">Transfer Project Ownership</h2>
                  <p className="text-gray-500 text-xs mt-0.5 truncate max-w-xs">
                    Current Owner: <span className="text-orange-400 font-semibold">{transferProject.owner_name || 'Unknown'}</span>
                  </p>
                </div>
                <button
                  onClick={() => setTransferProject(null)}
                  className="text-gray-600 hover:text-gray-300 text-xl leading-none mt-0.5"
                >×</button>
              </div>
            </div>

            {/* User search */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Search New Owner</p>
              <input
                type="text"
                value={transferSearch}
                onChange={e => setTransferSearch(e.target.value)}
                placeholder="Search by name or mobile…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500"
              />
            </div>

            {transferError && (
              <p className="px-6 text-red-400 text-xs">{transferError}</p>
            )}

            <div className="flex-1 overflow-y-auto px-6 pb-5 space-y-1.5 mt-2">
              {transferLoading ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-4 justify-center">
                  <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
                  Loading…
                </div>
              ) : transferUsers.filter(u => u.id !== transferProject.user_id).length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-6">No other users found</p>
              ) : (
                transferUsers.filter(u => u.id !== transferProject.user_id).map(u => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-800 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-gray-200 text-sm font-medium truncate">{u.full_name || 'Unknown'}</p>
                      <p className="text-gray-500 text-xs">{u.mobile || '—'} · {u.tehsil || '—'}</p>
                    </div>
                    <button
                      onClick={() => handleTransfer(u)}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-lg transition-colors flex-shrink-0 ml-2"
                    >
                      Transfer
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
