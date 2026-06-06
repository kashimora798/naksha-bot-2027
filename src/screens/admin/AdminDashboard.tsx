import { useEffect, useState } from 'react';
import { fetchAdminStats, type AdminStats } from '../../lib/admin-api';

const STAT_CARDS = [
  { key: 'total_users',     label: 'Total Users',         color: 'text-blue-400' },
  { key: 'total_projects',  label: 'Total Projects',      color: 'text-purple-400' },
  { key: 'paid_projects',   label: 'Paid Projects',       color: 'text-green-400' },
  { key: 'total_sessions',  label: 'Live Sessions',       color: 'text-yellow-400' },
  { key: 'paid_sessions',   label: 'Paid Sessions',       color: 'text-emerald-400' },
  { key: 'total_feedback',  label: 'Feedback Received',   color: 'text-orange-400' },
];

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(e => setError(e.message));
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Overview</h1>
      <p className="text-gray-500 text-sm mb-8">Platform-wide snapshot</p>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {STAT_CARDS.map(card => (
          <div key={card.key} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-4xl font-bold tabular-nums ${card.color}`}>
              {stats ? (stats as any)[card.key] : '—'}
            </p>
          </div>
        ))}
      </div>

      {stats && (
        <div className="mt-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <p className="text-gray-400 text-sm mb-3 uppercase tracking-wider">Revenue (rough)</p>
          <p className="text-3xl font-bold text-green-400">
            ₹{((stats.paid_projects + stats.paid_sessions) * 25).toLocaleString('en-IN')}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            {stats.paid_projects + stats.paid_sessions} paid maps × ₹25
          </p>
        </div>
      )}
    </div>
  );
}
