import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { fetchAdminUserDetail, type AdminUser, type AdminProject, type AdminSession } from '../../lib/admin-api';

const FIELD = ({ label, value }: { label: string; value: string | number | boolean | null | undefined }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-gray-600 text-xs uppercase tracking-wider">{label}</span>
    <span className="text-gray-200 text-sm">{value == null || value === '' ? '—' : String(value)}</span>
  </div>
);

const STATUS_COLOR: Record<string, string> = {
  paid: 'text-green-400 bg-green-500/10',
  unpaid: 'text-yellow-400 bg-yellow-500/10',
};

export default function AdminUserDetail() {
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
    // Store the admin-viewed project in localStorage using same keys the app reads
    localStorage.setItem('admin_preview_project_id', project.id);
    navigate(`/app?admin_view=${project.id}`);
  };

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
    <div className="p-8 max-w-4xl">
      <Link to="/kratagya/users" className="text-gray-500 hover:text-gray-300 text-xs mb-6 inline-block">
        ← Back to users
      </Link>

      <h1 className="text-2xl font-bold text-gray-100 mb-1">{profile.full_name || 'Unnamed User'}</h1>
      <p className="text-gray-500 text-sm mb-8">
        Joined {new Date(profile.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        {profile.is_admin && <span className="ml-2 text-orange-400 text-xs bg-orange-500/10 px-2 py-0.5 rounded">admin</span>}
      </p>

      {/* Profile fields */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-4">Profile</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-5">
          <FIELD label="Mobile" value={profile.mobile} />
          <FIELD label="Profession" value={profile.profession} />
          <FIELD label="Tehsil" value={profile.tehsil} />
          <FIELD label="Town / Village" value={profile.town_village} />
          <FIELD label="Ward No." value={profile.ward_no} />
          <FIELD label="EB No." value={profile.eb_no} />
          <FIELD label="Supervisor" value={profile.supervisor_name} />
          <FIELD label="Mobile Verified" value={profile.is_mobile_verified ? 'Yes' : 'No'} />
          <FIELD label="Onboarding" value={profile.onboarding_completed ? 'Complete' : 'Pending'} />
        </div>
      </section>

      {/* Projects */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-4">
          Projects ({projects.length})
        </h2>
        {projects.length === 0 ? (
          <p className="text-gray-600 text-sm">No projects yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {projects.map(project => (
              <div
                key={project.id}
                className="border border-gray-700 rounded-lg p-4 hover:border-orange-500/50 transition-colors cursor-pointer"
                onClick={() => openProject(project)}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-gray-200 text-sm font-medium truncate">{project.name || 'Untitled'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded shrink-0 font-medium ${STATUS_COLOR[project.payment_status] || 'text-gray-400 bg-gray-800'}`}>
                    {project.payment_status}
                  </span>
                </div>
                <p className="text-gray-500 text-xs">
                  {project.data?.district || '—'}{project.data?.state ? `, ${project.data.state}` : ''}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  Updated {new Date(project.updated_at).toLocaleDateString('en-IN')}
                  {' · '}{project.export_count || 0} exports
                </p>
                <p className="text-orange-400 text-xs mt-2">Open in workspace →</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Live sessions */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-gray-400 text-xs uppercase tracking-wider mb-4">
          Live Sessions ({sessions.length})
        </h2>
        {sessions.length === 0 ? (
          <p className="text-gray-600 text-sm">No live sessions yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-gray-600 text-xs uppercase border-b border-gray-800">
                  <th className="text-left py-2 pr-4">HLB</th>
                  <th className="text-left py-2 pr-4">Payment</th>
                  <th className="text-left py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id} className="border-b border-gray-800/40">
                    <td className="py-2 pr-4 text-gray-300">{s.hlb_number || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLOR[s.payment_status] || 'text-gray-400 bg-gray-800'}`}>
                        {s.payment_status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">
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
