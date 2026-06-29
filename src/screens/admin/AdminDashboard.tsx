import { useEffect, useState } from 'react';
import { fetchAdminStats, fetchAdminTimelineStats, type AdminStats, type DailyStat } from '../../lib/admin-api';

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
  const [timeline, setTimeline] = useState<DailyStat[]>([]);
  const [timelineDays, setTimelineDays] = useState(14);
  const [error, setError] = useState<string | null>(null);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

  useEffect(() => {
    fetchAdminStats()
      .then(setStats)
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    setLoadingTimeline(true);
    fetchAdminTimelineStats(timelineDays)
      .then(setTimeline)
      .catch(e => setError(e.message))
      .finally(() => setLoadingTimeline(false));
  }, [timelineDays]);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Overview</h1>
      <p className="text-gray-500 text-sm mb-8">Platform-wide snapshot</p>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {STAT_CARDS.map(card => (
          <div key={card.key} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <p className="text-gray-500 text-xs uppercase tracking-wider mb-2">{card.label}</p>
            <p className={`text-4xl font-bold tabular-nums ${card.color}`}>
              {stats ? (stats as any)[card.key] : '—'}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Timeline Chart Card */}
        <div className="lg:col-span-2">
          {loadingTimeline ? (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 h-80 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <SVGTimelineChart 
              data={timeline} 
              days={timelineDays} 
              onDaysChange={setTimelineDays} 
            />
          )}
        </div>

        {/* Revenue Snapshot Card */}
        <div className="flex flex-col gap-6">
          {stats && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex-1 flex flex-col justify-center">
              <p className="text-gray-550 text-xs font-bold uppercase tracking-wider mb-2">Estimated Revenue</p>
              <p className="text-4xl font-black text-emerald-400 font-mono">
                ₹{((stats.paid_projects + stats.paid_sessions) * 25).toLocaleString('en-IN')}
              </p>
              <p className="text-gray-500 text-xs mt-2 leading-relaxed">
                Based on <span className="text-gray-300 font-bold">{stats.paid_projects + stats.paid_sessions}</span> total paid maps/live-sessions multiplied by the standard ₹25 rate.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-800 space-y-2 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Paid Projects:</span>
                  <span className="font-mono text-gray-300">{stats.paid_projects} (₹{stats.paid_projects * 25})</span>
                </div>
                <div className="flex justify-between">
                  <span>Paid Live Sessions:</span>
                  <span className="font-mono text-gray-300">{stats.paid_sessions} (₹{stats.paid_sessions * 25})</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SVGTimelineChartProps {
  data: DailyStat[];
  days: number;
  onDaysChange: (days: number) => void;
}

function SVGTimelineChart({ data, days, onDaysChange }: SVGTimelineChartProps) {
  if (data.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 h-80 flex items-center justify-center text-gray-500">
        No stats recorded for this period.
      </div>
    );
  }

  const maxVal = Math.max(...data.map(d => Math.max(d.newUsers, d.newProjects)), 5);
  
  const width = 600;
  const height = 250;
  const padding = 40;
  
  const chartWidth = width - padding * 2;
  const chartHeight = height - padding * 2;

  // Generate coordinate points for Users line
  const pointsUsers = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - (d.newUsers / maxVal) * chartHeight;
    return { x, y, val: d.newUsers, date: d.date };
  });

  // Generate coordinate points for Projects line
  const pointsProjects = data.map((d, i) => {
    const x = padding + (i / (data.length - 1)) * chartWidth;
    const y = padding + chartHeight - (d.newProjects / maxVal) * chartHeight;
    return { x, y, val: d.newProjects, date: d.date };
  });

  // Create SVG path definitions
  const pathUsers = pointsUsers.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');
  const pathProjects = pointsProjects.reduce((acc, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, '');

  const areaUsers = pointsUsers.length > 0 
    ? `${pathUsers} L ${pointsUsers[pointsUsers.length - 1].x} ${height - padding} L ${pointsUsers[0].x} ${height - padding} Z` 
    : '';

  const areaProjects = pointsProjects.length > 0 
    ? `${pathProjects} L ${pointsProjects[pointsProjects.length - 1].x} ${height - padding} L ${pointsProjects[0].x} ${height - padding} Z` 
    : '';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h3 className="text-gray-100 font-bold text-base font-[Baloo_2]">Growth & Activity Trends</h3>
          <p className="text-xs text-gray-500">Daily comparison of new registrations and projects created</p>
        </div>
        <div className="flex items-center gap-3">
          <select 
            value={days} 
            onChange={(e) => onDaysChange(Number(e.target.value))}
            className="bg-gray-950 border border-gray-800 text-gray-300 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
          >
            <option value={7}>Last 7 Days</option>
            <option value={14}>Last 14 Days</option>
            <option value={30}>Last 30 Days</option>
          </select>
          <div className="flex gap-4 text-[10px] font-bold">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block" />
              <span className="text-orange-400">New Users</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
              <span className="text-purple-400">Projects Created</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[500px] overflow-visible">
          {/* Horizontal Gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((r, idx) => {
            const y = padding + r * chartHeight;
            const val = Math.round(maxVal - r * maxVal);
            return (
              <g key={idx}>
                <line 
                  x1={padding} 
                  y1={y} 
                  x2={width - padding} 
                  y2={y} 
                  className="stroke-gray-800/40" 
                  strokeDasharray="4 4" 
                  strokeWidth={1}
                />
                <text 
                  x={padding - 10} 
                  y={y + 4} 
                  className="fill-gray-600 font-mono text-[9px]" 
                  textAnchor="end"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Area Gradients */}
          <path d={areaUsers} fill="url(#gradUsers)" opacity={0.08} />
          <path d={areaProjects} fill="url(#gradProjects)" opacity={0.08} />

          {/* Trend Lines */}
          <path d={pathUsers} fill="none" className="stroke-orange-500" strokeWidth={2.5} strokeLinecap="round" />
          <path d={pathProjects} fill="none" className="stroke-purple-500" strokeWidth={2.5} strokeLinecap="round" />

          {/* Gradients Definition */}
          <defs>
            <linearGradient id="gradUsers" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="gradProjects" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* User Data Dots */}
          {pointsUsers.map((p, idx) => (
            <g key={idx} className="group/dot cursor-pointer">
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={3.5} 
                className="fill-orange-500 stroke-gray-900" 
                strokeWidth={1.5} 
              />
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={8} 
                className="fill-orange-500 opacity-0 hover:opacity-20 transition-opacity" 
              />
              {/* Custom Tooltip */}
              <g className="opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                <rect x={p.x - 25} y={p.y - 28} width={50} height={18} rx={4} className="fill-gray-950 stroke-gray-800" strokeWidth={0.5} />
                <text x={p.x} y={p.y - 16} className="fill-orange-400 font-mono text-[9px] font-bold" textAnchor="middle">
                  +{p.val}
                </text>
              </g>
            </g>
          ))}

          {/* Projects Data Dots */}
          {pointsProjects.map((p, idx) => (
            <g key={idx} className="group/dot cursor-pointer">
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={3.5} 
                className="fill-purple-500 stroke-gray-900" 
                strokeWidth={1.5} 
              />
              <circle 
                cx={p.x} 
                cy={p.y} 
                r={8} 
                className="fill-purple-500 opacity-0 hover:opacity-20 transition-opacity" 
              />
              {/* Custom Tooltip */}
              <g className="opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                <rect x={p.x - 25} y={p.y - 28} width={50} height={18} rx={4} className="fill-gray-950 stroke-gray-800" strokeWidth={0.5} />
                <text x={p.x} y={p.y - 16} className="fill-purple-400 font-mono text-[9px] font-bold" textAnchor="middle">
                  +{p.val}
                </text>
              </g>
            </g>
          ))}

          {/* X Axis Labels */}
          {data.map((d, i) => {
            const x = padding + (i / (data.length - 1)) * chartWidth;
            const dateParts = d.date.split('-');
            const label = `${dateParts[2]}/${dateParts[1]}`;
            // Show every label if <= 10 items, or every 2 days if <= 15 items, or every 4 days if 30 items
            const interval = days <= 7 ? 1 : days <= 15 ? 2 : 4;
            const showLabel = i % interval === 0 || i === data.length - 1;
            if (!showLabel) return null;
            return (
              <text 
                key={i} 
                x={x} 
                y={height - padding + 20} 
                className="fill-gray-600 font-mono text-[9px]" 
                textAnchor="middle"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
