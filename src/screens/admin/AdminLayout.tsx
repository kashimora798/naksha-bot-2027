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
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="h-screen bg-gray-950 text-gray-100 flex font-mono overflow-hidden">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 h-full flex flex-col border-r border-gray-800 py-6 px-4 gap-1">
        <div className="text-orange-400 font-bold text-sm tracking-widest uppercase mb-6 px-2">
          NakshaBot<br />
          <span className="text-gray-500 font-normal text-xs normal-case tracking-normal">admin</span>
        </div>
        {NAV.map(item => {
          const active = item.path === '/kratagya'
            ? location.pathname === '/kratagya'
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                active
                  ? 'bg-orange-500/20 text-orange-300'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
        <div className="mt-auto">
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
