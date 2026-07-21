import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { checkIsAdmin } from '../../lib/admin-api';
import { supabase } from '../../lib/supabase';

const NAV = [
  { label: 'Overview', path: '/kratagya', icon: '◈' },
  { label: 'Users', path: '/kratagya/users', icon: '◉' },
  { label: 'Projects', path: '/kratagya/projects', icon: '◫' },
  { label: 'Live Sessions', path: '/kratagya/sessions', icon: '◎' },
  { label: 'Feedback', path: '/kratagya/feedback', icon: '◈' },
  { label: 'Donations', path: '/kratagya/donations', icon: '♥' },
  { label: 'Announcements', path: '/kratagya/announcements', icon: '📢' },
];

export default function AdminLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    checkIsAdmin().then(ok => {
      if (!ok) navigate('/', { replace: true });
      else setAuthorized(true);
    });
  }, []);

  if (authorized === null) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex font-public-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 h-full flex flex-col border-r border-slate-800 py-6 px-4 gap-1 bg-slate-900/50">
        <div className="text-[var(--color-accent-tint)] font-bold text-sm tracking-wider uppercase mb-6 px-2">
          NakshaBot<br />
          <span className="text-slate-400 font-normal text-xs normal-case tracking-normal">Admin Dashboard</span>
        </div>
        {NAV.map(item => {
          const active = item.path === '/kratagya'
            ? location.pathname === '/kratagya'
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-[var(--radius-md)] text-sm font-semibold transition-all ${
                active
                  ? 'bg-[var(--color-accent)] text-white shadow-sm'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <div className="mt-auto pt-4 border-t border-slate-800">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3.5 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto bg-slate-950">
        <Outlet />
      </main>
    </div>
  );
}
