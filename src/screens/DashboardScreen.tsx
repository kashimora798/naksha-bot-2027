import { useEffect, useState } from 'react';
import { useAuth, useUser, SignOutButton } from '@clerk/clerk-react';
import { createSupabaseClient } from '../lib/supabase';
import type { MapData } from '../types';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  data: Partial<MapData>;
  created_at: string;
  updated_at: string;
}

interface Props {
  onLoadProject: (projectId: string, data: Partial<MapData>) => void;
  onNewProject: () => void;
}

export default function DashboardScreen({ onLoadProject, onNewProject }: Props) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProjects() {
      if (!user?.id) return;
      try {
        const supabase = createSupabaseClient(getToken);
        const { data, error } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false });

        if (error) throw error;
        setProjects(data || []);
      } catch (err: any) {
        console.error('Error fetching projects:', err);
        setError(err.message || 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    }
    loadProjects();
  }, [getToken, user?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500 font-semibold animate-pulse">Loading your maps...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col p-6">
      <div className="max-w-4xl w-full mx-auto">
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-3xl font-bold font-[Baloo_2] text-gray-900">NakshaBot</h1>
              <p className="text-sm text-gray-500">Welcome back, {user?.firstName || 'Surveyor'}</p>
            </div>
          </div>
          <SignOutButton>
            <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              Sign Out
            </button>
          </SignOutButton>
        </header>

        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 border border-red-100 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-800">Your Maps</h2>
          <button
            onClick={onNewProject}
            className="px-5 py-2.5 bg-orange-500 text-white rounded-xl font-bold shadow hover:bg-orange-600 transition-colors"
          >
            + Create New Map
          </button>
        </div>

        {projects.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-gray-100">
            <div className="text-5xl mb-4">🗺️</div>
            <h3 className="text-lg font-bold text-gray-700 mb-2">No maps yet</h3>
            <p className="text-sm text-gray-500 max-w-sm mx-auto mb-6">
              Start by creating a new map. Your progress will be saved automatically as you draw.
            </p>
            <button
              onClick={onNewProject}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg hover:bg-orange-600 transition-colors"
            >
              Start First Map
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => onLoadProject(project.id, project.data)}
                className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md hover:border-orange-200 transition-all group"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-800 group-hover:text-orange-600 transition-colors">
                    {project.name || 'Untitled Map'}
                  </h3>
                  <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2 py-1 rounded">
                    {project.data?.blocks?.length || 0} Blocks
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <p>HLB: {project.data?.hlbNumber || '—'}</p>
                  <p>Location: {project.data?.district || '—'}, {project.data?.state || '—'}</p>
                  <p className="mt-3 pt-3 border-t border-gray-50 text-[10px] text-gray-400">
                    Last edited: {new Date(project.updated_at).toLocaleDateString()} {new Date(project.updated_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
