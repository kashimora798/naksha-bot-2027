import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import {
  fetchAdminProjects,
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
import type { AdminTheme } from './AdminLayout';

const STATUS_COLOR_DARK: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10 border-green-500/30',
  unpaid: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30',
};

const STATUS_COLOR_LIGHT: Record<string, string> = {
  paid: 'text-green-700 bg-green-50 border-green-200',
  unpaid: 'text-amber-700 bg-amber-50 border-amber-200',
};

export default function AdminProjectsScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

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

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

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

  // Search users for assign modal
  useEffect(() => {
    if (!assignProject) return;
    const t = setTimeout(() => {
      searchAdminUsers(userSearch)
        .then(setAssignUsers)
        .catch(e => setAssignError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, assignProject]);

  // Search users for transfer modal
  useEffect(() => {
    if (!transferProject) return;
    const t = setTimeout(() => {
      searchAdminUsers(transferSearch)
        .then(setTransferUsers)
        .catch(e => setTransferError(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [transferSearch, transferProject]);

  const openProject = (id: string) => {
    localStorage.setItem('admin_preview_project_id', id);
    window.location.href = `/app?admin_view=${id}`;
  };

  const handleCreate = async () => {
    if (!createName.trim()) return;
    setCreating(true);
    try {
      const proj = await createAdminProject(createName.trim());
      setShowCreate(false);
      setCreateName('');
      openProject(proj.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const openAssignModal = async (project: AdminProject) => {
    setAssignProject(project);
    setAssignError(null);
    setUserSearch('');
    try {
      const [asgn, usr] = await Promise.all([
        fetchProjectAssignments(project.id),
        searchAdminUsers(''),
      ]);
      setAssignments(asgn);
      setAssignUsers(usr);
    } catch (e: any) {
      setAssignError(e.message || 'Failed to load assignments');
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
      setAssignError(e.message || 'Failed to assign user');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!assignProject) return;
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
    if (!confirm(`Confirm ownership transfer:\n\nProject: "${transferProject.name || 'Untitled'}"\nTo: ${user.full_name || 'Unknown'}?`)) return;
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
  const totalPages = Math.ceil(total / 20);
  const statusColors = isLight ? STATUS_COLOR_LIGHT : STATUS_COLOR_DARK;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Projects</h1>
          <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{total} total projects</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shadow-md shadow-orange-500/20"
        >
          + Create Project
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, owner, district…"
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
          Loading projects…
        </div>
      ) : (
        <div className={`border rounded-2xl p-4 sm:p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                <tr className={`text-xs uppercase tracking-wider border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-500 border-gray-800'}`}>
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
                {projects.map(p => (
                  <tr key={p.id} className={`border-b transition-colors ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/50 hover:bg-gray-800/30'}`}>
                    <td className={`py-3 pr-4 font-medium max-w-[180px] truncate ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>
                      {p.name || 'Untitled'}
                    </td>
                    <td className="py-3 pr-4">
                      <Link
                        to={`/kratagya/users/${p.user_id}`}
                        className="text-orange-500 hover:text-orange-400 font-medium"
                      >
                        {p.owner_name || 'Unknown'}
                      </Link>
                      {p.owner_mobile && (
                        <div className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-600'}`}>{p.owner_mobile}</div>
                      )}
                    </td>
                    <td className={`py-3 pr-4 text-xs ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                      {p.data?.district || '—'}{p.data?.state ? `, ${p.data.state}` : ''}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${statusColors[p.payment_status] || (isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-gray-400 bg-gray-800 border-gray-700')}`}>
                        {p.payment_status}
                      </span>
                    </td>
                    <td className={`py-3 pr-4 tabular-nums ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{p.export_count || 0}</td>
                    <td className={`py-3 pr-4 text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(p.updated_at).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openProject(p.id)}
                          className="text-orange-500 hover:text-orange-400 text-xs font-semibold"
                        >
                          Open →
                        </button>
                        <button
                          onClick={() => openAssignModal(p)}
                          className="text-blue-500 hover:text-blue-400 text-xs font-semibold"
                        >
                          Assign
                        </button>
                        <button
                          onClick={() => openTransferModal(p)}
                          className="text-emerald-500 hover:text-emerald-400 text-xs font-semibold"
                        >
                          Transfer
                        </button>
                        {p.owner_mobile && (
                          <a
                            href={`https://wa.me/91${p.owner_mobile.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${p.owner_name || 'there'}, this is regarding your NakshaBot map "${p.name || 'Untitled'}". Could you help us with a quick update? Thank you!`)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                          >
                            <button className="text-green-600 hover:text-green-500 text-xs font-semibold flex items-center gap-0.5">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.085.536 4.043 1.473 5.748L0 24l6.417-1.45A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6a9.565 9.565 0 01-4.878-1.33l-.35-.207-3.608.815.871-3.516-.228-.362A9.551 9.551 0 012.4 12c0-5.295 4.305-9.6 9.6-9.6 5.296 0 9.6 4.305 9.6 9.6 0 5.296-4.304 9.6-9.6 9.6z"/>
                              </svg>
                              WA
                            </button>
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={7} className={`py-12 text-center ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No projects found</td>
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
                    <span className={`font-semibold ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>{total}</span> results
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

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-md rounded-2xl p-6 border shadow-2xl ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-gray-900 border-gray-800 text-gray-100'
          }`}>
            <h3 className="font-bold text-lg mb-4">Create Admin Project</h3>
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="Project Name…"
              className={`w-full border rounded-lg px-4 py-2 text-sm mb-4 focus:outline-none focus:border-orange-500 ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
              }`}
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowCreate(false)}
                className={`px-4 py-2 text-xs font-semibold rounded-lg ${isLight ? 'text-slate-600 hover:bg-slate-100' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-semibold rounded-lg disabled:opacity-50"
              >
                {creating ? 'Creating…' : 'Create & Open'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {assignProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl max-h-[90vh] flex flex-col ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-gray-900 border-gray-800 text-gray-100'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg">Manage Assignments</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{assignProject.name || 'Untitled'}</p>
              </div>
              <button onClick={() => setAssignProject(null)} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>

            {assignError && (
              <div className="p-3 bg-red-900/30 border border-red-700 text-red-300 text-xs rounded-lg mb-4">{assignError}</div>
            )}

            <div className="mb-4">
              <p className={`text-xs font-bold uppercase mb-2 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Assigned Users ({assignments.length})</p>
              {assignments.length === 0 ? (
                <p className={`text-xs ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No non-owner users assigned yet.</p>
              ) : (
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {assignments.map(a => (
                    <div key={a.id} className={`flex justify-between items-center p-2 rounded-lg border ${
                      isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-950 border-gray-800'
                    }`}>
                      <span className="text-xs font-medium">{a.user_name || a.user_mobile || a.user_id}</span>
                      <button
                        onClick={() => handleRevoke(a.user_id)}
                        disabled={assignLoading}
                        className="text-red-500 hover:text-red-400 text-xs"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <p className={`text-xs font-bold uppercase mb-2 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Assign User</p>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Search users to assign…"
                className={`w-full border rounded-lg px-3 py-2 text-xs mb-2 focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
                }`}
              />
              <div className="flex-1 overflow-y-auto space-y-1">
                {assignUsers.map(u => {
                  const isAssigned = assignedUserIds.has(u.id);
                  const isOwner = u.id === assignProject.user_id;
                  return (
                    <div key={u.id} className={`flex justify-between items-center p-2 rounded-lg text-xs border ${
                      isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/40 hover:bg-gray-800/40'
                    }`}>
                      <span>{u.full_name || 'Unnamed'} ({u.mobile || 'no mobile'})</span>
                      {isOwner ? (
                        <span className="text-gray-500 text-[10px]">Owner</span>
                      ) : isAssigned ? (
                        <span className="text-green-500 text-[10px]">Assigned</span>
                      ) : (
                        <button
                          onClick={() => handleAssign(u)}
                          disabled={assignLoading}
                          className="text-orange-500 hover:text-orange-400 font-semibold"
                        >
                          + Assign
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferProject && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`w-full max-w-lg rounded-2xl p-6 border shadow-2xl max-h-[90vh] flex flex-col ${
            isLight ? 'bg-white border-slate-200 text-slate-900' : 'bg-gray-900 border-gray-800 text-gray-100'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-lg">Transfer Ownership</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{transferProject.name || 'Untitled'}</p>
              </div>
              <button onClick={() => setTransferProject(null)} className="text-gray-400 hover:text-gray-200">✕</button>
            </div>

            {transferError && (
              <div className="p-3 bg-red-900/30 border border-red-700 text-red-300 text-xs rounded-lg mb-4">{transferError}</div>
            )}

            <input
              type="text"
              value={transferSearch}
              onChange={e => setTransferSearch(e.target.value)}
              placeholder="Search user by name, mobile…"
              className={`w-full border rounded-lg px-3 py-2 text-xs mb-3 focus:outline-none focus:border-orange-500 ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
              }`}
            />

            <div className="flex-1 overflow-y-auto space-y-1">
              {transferUsers.map(u => (
                <div key={u.id} className={`flex justify-between items-center p-2.5 rounded-lg text-xs border ${
                  isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/40 hover:bg-gray-800/40'
                }`}>
                  <div>
                    <p className="font-semibold">{u.full_name || 'Unnamed'}</p>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{u.mobile || 'No mobile'}</p>
                  </div>
                  {u.id === transferProject.user_id ? (
                    <span className="text-gray-500 text-[10px]">Current Owner</span>
                  ) : (
                    <button
                      onClick={() => handleTransfer(u)}
                      disabled={transferLoading}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                    >
                      Transfer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
