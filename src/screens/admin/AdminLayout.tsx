import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { checkIsAdmin } from '../../lib/admin-api';
import { supabase } from '../../lib/supabase';

const NAV = [
  { label: 'Overview',      path: '/kratagya',              icon: '◈' },
  { label: 'Users',         path: '/kratagya/users',        icon: '◉' },
  { label: 'Projects',      path: '/kratagya/projects',     icon: '◫' },
  { label: 'Live Sessions', path: '/kratagya/sessions',     icon: '◎' },
  { label: 'Feedback',      path: '/kratagya/feedback',     icon: '◈' },
  { label: 'Donations',     path: '/kratagya/donations',    icon: '♥' },
  { label: 'Announcements', path: '/kratagya/announcements', icon: '📢' },
];

export type AdminTheme = 'dark' | 'light';

export interface AdminThemeContext {
  theme: AdminTheme;
  toggleTheme: () => void;
}

export default function AdminLayout() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [theme, setTheme]           = useState<AdminTheme>(() => {
    return (localStorage.getItem('admin_theme') as AdminTheme) || 'dark';
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const location                    = useLocation();
  const navigate                    = useNavigate();

  useEffect(() => {
    checkIsAdmin().then(ok => {
      if (!ok) navigate('/', { replace: true });
      else setAuthorized(true);
    });
  }, [navigate]);

  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('admin_theme', next);
      return next;
    });
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  if (authorized === null) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-950'}`}>
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isLight = theme === 'light';

  const navContent = (
    <>
      <div className="flex items-center justify-between mb-6 px-2">
        <div>
          <div className="font-bold text-sm tracking-wider uppercase text-orange-500">
            NakshaBot Admin
          </div>
          <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Platform Management</span>
        </div>
        <button
          onClick={toggleTheme}
          title={`Switch to ${isLight ? 'Dark' : 'Light'} Mode`}
          className={`p-2 rounded-lg text-xs font-semibold border transition-all ${
            isLight
              ? 'bg-slate-200 border-slate-300 text-slate-700 hover:bg-slate-300'
              : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          {isLight ? '🌙 Dark' : '☀️ Light'}
        </button>
      </div>

      <nav className="flex-1 space-y-1">
        {NAV.map(item => {
          const active = item.path === '/kratagya'
            ? location.pathname === '/kratagya'
            : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                active
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20 font-bold'
                  : isLight
                  ? 'text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
              }`}
            >
              <span className="text-xs shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={`pt-4 border-t ${isLight ? 'border-slate-200' : 'border-slate-800'}`}>
        <button
          onClick={handleSignOut}
          className={`w-full text-left px-3.5 py-2 text-xs font-medium rounded-lg transition-colors ${
            isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          ← Sign out
        </button>
      </div>
    </>
  );

  return (
    <div className={`h-screen flex flex-col md:flex-row font-public-sans overflow-hidden ${
      isLight ? 'bg-slate-100 text-slate-900' : 'bg-slate-950 text-slate-100'
    }`}>
      {/* Mobile Header */}
      <header className={`md:hidden flex items-center justify-between px-4 py-3 border-b shrink-0 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'
      }`}>
        <button
          onClick={() => setMobileOpen(true)}
          className={`p-2 rounded-lg border text-sm ${
            isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-200'
          }`}
        >
          ☰ Menu
        </button>
        <span className="font-bold text-sm text-orange-500 tracking-wide">NakshaBot Admin</span>
        <button
          onClick={toggleTheme}
          className={`p-2 rounded-lg border text-xs font-semibold ${
            isLight ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-800 border-slate-700 text-slate-200'
          }`}
        >
          {isLight ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Desktop Sidebar */}
      <aside className={`hidden md:flex w-60 shrink-0 h-full flex-col border-r py-6 px-4 ${
        isLight ? 'bg-white border-slate-200' : 'bg-slate-900/60 border-slate-800'
      }`}>
        {navContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className={`relative w-72 max-w-[80vw] h-full flex flex-col p-6 z-10 shadow-2xl ${
            isLight ? 'bg-white text-slate-900' : 'bg-slate-900 text-slate-100'
          }`}>
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-200 text-sm font-bold p-1"
            >
              ✕
            </button>
            {navContent}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className={`flex-1 min-w-0 overflow-auto ${isLight ? 'bg-slate-100' : 'bg-slate-950'}`}>
        <Outlet context={{ theme, toggleTheme }} />
      </main>
    </div>
  );
}
