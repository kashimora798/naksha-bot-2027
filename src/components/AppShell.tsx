import React from 'react';
import { useMediaQuery } from '../lib/useMediaQuery';

export interface AppShellProps {
  activeTab?: 'home' | 'maps' | 'block-maps' | 'field-survey' | 'learn' | 'admin';
  onNavigate: (tab: 'home' | 'maps' | 'block-maps' | 'field-survey' | 'learn' | 'admin') => void;
  children: React.ReactNode;
  userEmail?: string;
}

export const AppShell: React.FC<AppShellProps> = ({
  activeTab = 'home',
  onNavigate,
  children,
  userEmail
}) => {
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const navItems = [
    {
      id: 'home' as const,
      label: 'Home',
      labelHi: 'होम',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 00-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    },
    {
      id: 'maps' as const,
      label: 'Maps',
      labelHi: 'नक्शे',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
      )
    },
    {
      id: 'block-maps' as const,
      label: 'Block Maps',
      labelHi: 'ब्लॉक नक्शे',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      )
    },
    {
      id: 'field-survey' as const,
      label: 'Field Survey',
      labelHi: 'फील्ड सर्वे',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      )
    },
    {
      id: 'learn' as const,
      label: 'Learn',
      labelHi: 'सीखें',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-ink)] flex flex-col lg:flex-row">
      {/* Persistent Left Sidebar on Desktop (>=1024px) */}
      {isDesktop && (
        <aside className="w-64 bg-[var(--color-surface)] border-r border-[var(--color-hairline)] flex flex-col shrink-0 min-h-screen sticky top-0 h-screen z-30 shadow-[var(--shadow-sm)]">
          {/* Logo & Brand Header */}
          <div className="p-6 border-b border-[var(--color-hairline)] flex items-center gap-3">
            <div className="w-10 h-10 rounded-[var(--radius-md)] bg-[var(--color-accent)] text-white flex items-center justify-center font-bold text-xl shadow-[var(--shadow-sm)]">
              🗺️
            </div>
            <div>
              <span className="font-bold text-lg text-[var(--color-ink)] font-public-sans tracking-tight block leading-tight">
                NakshaBot
              </span>
              <span className="text-[10px] text-[var(--color-accent)] font-semibold uppercase tracking-wider block">
                Census 2027
              </span>
            </div>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto scrollbar-thin">
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-[var(--radius-md)] text-sm font-bold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-[var(--color-accent-tint)] text-[var(--color-accent)] shadow-sm'
                      : 'text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]'
                  }`}
                >
                  <span className={isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-ink-tertiary)]'}>
                    {item.icon}
                  </span>
                  <span className="font-public-sans">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Account / Footer */}
          {userEmail && (
            <div className="p-4 border-t border-[var(--color-hairline)] bg-[var(--color-surface-2)]/50">
              <div className="flex items-center gap-3 px-2 py-1.5">
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent-tint)] text-[var(--color-accent)] flex items-center justify-center font-bold text-xs">
                  {userEmail[0]?.toUpperCase() || 'U'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--color-ink)] truncate">{userEmail}</p>
                  <p className="text-[10px] text-[var(--color-ink-tertiary)]">Enumerator Account</p>
                </div>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Main Screen Content */}
      <main className="flex-1 min-w-0 pb-24 lg:pb-8">
        {children}
      </main>

      {/* Glassmorphism Bottom Tab Bar on Mobile & Tablet (<1024px) */}
      {!isDesktop && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)]/90 backdrop-blur-lg border-t border-[var(--color-hairline)] px-2 py-1.5 shadow-[var(--shadow-lg)] flex items-center justify-around">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-[var(--radius-md)] min-w-[56px] transition-all cursor-pointer ${
                  isActive
                    ? 'text-[var(--color-accent)] font-bold'
                    : 'text-[var(--color-ink-tertiary)] hover:text-[var(--color-ink-secondary)]'
                }`}
              >
                <div className={`p-1 rounded-[var(--radius-sm)] ${isActive ? 'bg-[var(--color-accent-tint)]' : ''}`}>
                  {item.icon}
                </div>
                <span className="text-[10px] font-public-sans tracking-tight mt-0.5">
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
};
