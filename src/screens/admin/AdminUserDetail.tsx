import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useOutletContext } from 'react-router-dom';
import { fetchAdminUserDetail, formatWhatsAppNumber, type AdminUser, type AdminProject, type AdminSession } from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

const FIELD = ({ label, value, isLight }: { label: string; value: string | number | boolean | null | undefined; isLight: boolean }) => (
  <div className="flex flex-col gap-0.5">
    <span className={`text-xs uppercase tracking-wider ${isLight ? 'text-slate-500 font-semibold' : 'text-gray-500'}`}>{label}</span>
    <span className={`text-sm ${isLight ? 'text-slate-900 font-medium' : 'text-gray-200'}`}>{value == null || value === '' ? '—' : String(value)}</span>
  </div>
);

const STATUS_COLOR_DARK: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10',
  unpaid: 'text-yellow-400 bg-yellow-500/10',
};

const STATUS_COLOR_LIGHT: Record<string, string> = {
  paid: 'text-green-700 bg-green-50 border border-green-200',
  unpaid: 'text-amber-700 bg-amber-50 border border-amber-200',
};

export default function AdminUserDetail() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AdminUser | null>(null);
  const [projects, setProjects] = useState<AdminProject[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetchAdminUserDetail(id)
      .then(({ profile, projects, sessions }) => {
        setProfile(profile);
        setProjects(projects);
        setSessions(sessions);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const openProject = (project: AdminProject) => {
    localStorage.setItem('admin_preview_project_id', project.id);
    navigate(`/app?admin_view=${project.id}`);
  };

  const statusColors = isLight ? STATUS_COLOR_LIGHT : STATUS_COLOR_DARK;

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-gray-500 text-sm">
        <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
        Loading…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-8 text-red-400 text-sm">{error || 'User not found'}</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl space-y-6">
      <Link to="/kratagya/users" className={`text-xs font-semibold inline-block ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-gray-500 hover:text-gray-300'}`}>
        ← Back to users
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={`text-xl sm:text-2xl font-bold flex items-center gap-3 ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>
          {profile.full_name || 'Unnamed User'}
        </h1>
        {profile.mobile && (
          <a
            href={`https://wa.me/${formatWhatsAppNumber(profile.mobile)}?text=${encodeURIComponent(`Hi ${profile.full_name || 'there'}, this is the NakshaBot team. We wanted to connect with you regarding your account.`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.085.536 4.043 1.473 5.748L0 24l6.417-1.45A11.934 11.934 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.6a9.565 9.565 0 01-4.878-1.33l-.35-.207-3.608.815.871-3.516-.228-.362A9.551 9.551 0 012.4 12c0-5.295 4.305-9.6 9.6-9.6 5.296 0 9.6 4.305 9.6 9.6 0 5.296-4.304 9.6-9.6 9.6z"/>
            </svg>
            WhatsApp
          </a>
        )}
      </div>

      <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
        Joined {new Date(profile.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        {profile.is_admin && <span className="ml-2 text-orange-500 font-semibold text-xs bg-orange-500/10 px-2 py-0.5 rounded">admin</span>}
      </p>

      {/* Profile fields */}
      <section className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
        <h2 className={`text-xs uppercase tracking-wider font-bold mb-4 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <FIELD label="Mobile" value={profile.mobile} isLight={isLight} />
          <FIELD label="Profession" value={profile.profession} isLight={isLight} />
          <FIELD label="Tehsil" value={profile.tehsil} isLight={isLight} />
          <FIELD label="Town / Village" value={profile.town_village} isLight={isLight} />
          <FIELD label="Ward No." value={profile.ward_no} isLight={isLight} />
          <FIELD label="EB No." value={profile.eb_no} isLight={isLight} />
          <FIELD label="Supervisor" value={profile.supervisor_name} isLight={isLight} />
          <FIELD label="Mobile Verified" value={profile.is_mobile_verified ? 'Yes' : 'No'} isLight={isLight} />
          <FIELD label="Onboarding" value={profile.onboarding_completed ? 'Complete' : 'Pending'} isLight={isLight} />
        </div>
      </section>

      {/* Projects */}
      <section className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
        <h2 className={`text-xs uppercase tracking-wider font-bold mb-4 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
          Projects ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <p className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No projects yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map(project => (
              <div
                key={project.id}
                className={`border rounded-xl p-4 transition-all cursor-pointer ${
                  isLight ? 'border-slate-200 hover:border-orange-500 bg-slate-50 hover:bg-white' : 'border-gray-800 hover:border-orange-500/50 bg-gray-950'
                }`}
                onClick={() => openProject(project)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className={`text-sm font-medium truncate ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{project.name || 'Untitled'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 font-medium ${statusColors[project.payment_status] || (isLight ? 'text-slate-500 bg-slate-100' : 'text-gray-400 bg-gray-800')}`}>
                    {project.payment_status}
                  </span>
                </div>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                  {project.data?.district || '—'}{project.data?.state ? `, ${project.data.state}` : ''}
                </p>
                <p className={`text-xs mt-1 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>
                  Updated {new Date(project.updated_at).toLocaleDateString('en-IN')}
                  {' · '}{project.export_count || 0} exports
                </p>
                <p className="text-orange-500 text-xs font-semibold mt-2">Open in workspace →</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live sessions */}
      <section className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
        <h2 className={`text-xs uppercase tracking-wider font-bold mb-4 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
          Live Sessions ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No live sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[400px]">
              <thead>
                <tr className={`text-xs uppercase border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-600 border-gray-800'}`}>
                  <th className="text-left py-2 pr-4">HLB</th>
                  <th className="text-left py-2 pr-4">Payment</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className={`border-b ${isLight ? 'border-slate-100' : 'border-gray-800/40'}`}>
                    <td className={`py-2 pr-4 ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>{s.hlb_number || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded font-semibold ${statusColors[s.payment_status] || (isLight ? 'text-slate-500 bg-slate-100' : 'text-gray-400 bg-gray-800')}`}>
                        {s.payment_status}
                      </span>
                    </td>
                    <td className={`py-2 text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(s.created_at).toLocaleDateString('en-IN')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
