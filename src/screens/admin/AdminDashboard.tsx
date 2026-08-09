import { useEffect, useState, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  fetchDashboardStats,
  fetchUserEvents,
  adminLogUpiPayment,
  exportCSV,
  type DashboardStats,
  type DashboardTimelineDay,
  type DashboardFunnel,
  type DashboardRevenueBreakdown,
  type UserEvent,
} from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (paise: number) =>
  `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const pct = (n: number, d: number) =>
  d > 0 ? ((n / d) * 100).toFixed(1) : '0.0';

function Spinner() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { theme }               = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight                 = theme === 'light';
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [events, setEvents]     = useState<UserEvent[]>([]);
  const [days, setDays]         = useState(30);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [upiAmt, setUpiAmt]     = useState('');
  const [upiRef, setUpiRef]     = useState('');
  const [upiNote, setUpiNote]   = useState('');
  const [upiSaving, setUpiSaving] = useState(false);
  const [upiMsg, setUpiMsg]     = useState<string | null>(null);
  const [evtFilter, setEvtFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([
        fetchDashboardStats(days),
        fetchUserEvents(200),
      ]);
      setStats(s);
      setEvents(e);
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const handleUpiLog = async () => {
    const amount = parseFloat(upiAmt);
    if (!amount || amount <= 0) { setUpiMsg('Enter a valid amount'); return; }
    setUpiSaving(true);
    setUpiMsg(null);
    try {
      await adminLogUpiPayment(amount, upiRef || undefined, upiNote || undefined);
      setUpiAmt(''); setUpiRef(''); setUpiNote('');
      setUpiMsg('✓ UPI payment logged');
      load();
    } catch (e: any) {
      setUpiMsg(`Error: ${e.message}`);
    } finally {
      setUpiSaving(false);
    }
  };

  const filteredEvents = evtFilter === 'all'
    ? events
    : events.filter(e => e.event_type === evtFilter);

  const eventTypes = [...new Set(events.map(e => e.event_type))].sort();

  // Dynamic Theme Classes
  const cardBg   = isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl';
  const textHead = isLight ? 'text-slate-900' : 'text-gray-100';
  const textSub  = isLight ? 'text-slate-500' : 'text-gray-500';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 lg:space-y-8 max-w-[1400px]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${textHead}`}>Overview</h1>
          <p className={`text-xs sm:text-sm ${textSub}`}>Platform snapshot · IST timezone · real Postgres data</p>
        </div>
        <div className="flex items-center gap-2">
          {([7, 14, 30, 90] as const).map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs rounded-lg font-semibold transition-all ${
                days === d
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                  : isLight
                  ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            onClick={load}
            className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-colors ${
              isLight ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            ↺
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      {/* ── KPI Row ────────────────────────────────────────────────────── */}
      <KPIRow kpis={stats?.kpis} loading={loading} isLight={isLight} />

      {/* ── Revenue Breakdown + UPI Log ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RevenueBreakdown data={stats?.revenue_breakdown} totalPaise={stats?.kpis.total_revenue_paise ?? 0} loading={loading} isLight={isLight} />
        </div>
        <div className={`border rounded-2xl p-6 ${cardBg}`}>
          <p className={`text-xs font-bold uppercase tracking-wider mb-4 ${textSub}`}>Log UPI Payment</p>
          <div className="space-y-3">
            <div>
              <label className={`text-xs ${textSub}`}>Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={upiAmt}
                onChange={e => setUpiAmt(e.target.value)}
                placeholder="25"
                className={`mt-1 w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
                }`}
              />
            </div>
            <div>
              <label className={`text-xs ${textSub}`}>UPI Ref / Transaction ID</label>
              <input
                type="text"
                value={upiRef}
                onChange={e => setUpiRef(e.target.value)}
                placeholder="UPI ref (optional)"
                className={`mt-1 w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
                }`}
              />
            </div>
            <div>
              <label className={`text-xs ${textSub}`}>Note</label>
              <input
                type="text"
                value={upiNote}
                onChange={e => setUpiNote(e.target.value)}
                placeholder="Who paid, for what…"
                className={`mt-1 w-full text-sm rounded-lg px-3 py-2 border focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-700 text-gray-200'
                }`}
              />
            </div>
            <button
              onClick={handleUpiLog}
              disabled={upiSaving}
              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {upiSaving ? 'Logging…' : 'Log Payment →'}
            </button>
            {upiMsg && (
              <p className={`text-xs ${upiMsg.startsWith('✓') ? 'text-emerald-500 font-medium' : 'text-red-500'}`}>{upiMsg}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Growth Timeline ─────────────────────────────────────────────── */}
      {loading ? <div className={`border rounded-2xl ${cardBg}`}><Spinner /></div> : (
        <GrowthChart data={stats?.timeline ?? []} days={days} isLight={isLight} />
      )}

      {/* ── Conversion Funnel ───────────────────────────────────────────── */}
      <ConversionFunnel funnel={stats?.funnel} loading={loading} isLight={isLight} />

      {/* ── Retention + Live Funnel ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CohortRetention data={stats?.cohort_retention} loading={loading} isLight={isLight} />
        <LiveSessionFunnel data={stats?.live_funnel} loading={loading} isLight={isLight} />
      </div>

      {/* ── Geographic Distribution ─────────────────────────────────────── */}
      <GeoTable data={stats?.geo ?? []} totalUsers={stats?.kpis.total_users ?? 0} loading={loading} isLight={isLight} />

      {/* ── User Activity ───────────────────────────────────────────────── */}
      <div className={`border rounded-2xl p-4 sm:p-6 ${cardBg}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <p className={`font-bold ${textHead}`}>User Activity</p>
            <p className={`text-xs ${textSub}`}>Fingerprint sessions · {events.length} recent events</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={evtFilter}
              onChange={e => setEvtFilter(e.target.value)}
              className={`text-xs rounded-lg px-3 py-1.5 border focus:outline-none ${
                isLight ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-gray-950 border-gray-700 text-gray-300'
              }`}
            >
              <option value="all">All events</option>
              {eventTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <button
              onClick={() => exportCSV('user-activity', filteredEvents.map(e => ({
                time: new Date(e.created_at).toLocaleString('en-IN'),
                user: e.user_name || '—',
                event: e.event_type,
                page: e.page_path || '—',
                ip: e.ip_address || '—',
                city: e.city || '—',
                country: e.country || '—',
                fingerprint: e.fingerprint_id || '—',
              })))}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
              }`}
            >
              ↓ CSV
            </button>
          </div>
        </div>
        {loading ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[700px]">
              <thead>
                <tr className={`uppercase tracking-wider border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-600 border-gray-800'}`}>
                  <th className="text-left py-2 pr-3">Time (IST)</th>
                  <th className="text-left py-2 pr-3">User</th>
                  <th className="text-left py-2 pr-3">Event</th>
                  <th className="text-left py-2 pr-3">Page</th>
                  <th className="text-left py-2 pr-3">IP</th>
                  <th className="text-left py-2 pr-3">Location</th>
                  <th className="text-left py-2">Fingerprint</th>
                </tr>
              </thead>
              <tbody>
                {filteredEvents.slice(0, 100).map(e => (
                  <tr key={e.id} className={`border-b transition-colors ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/40 hover:bg-gray-800/20'}`}>
                    <td className={`py-2 pr-3 whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                      {new Date(e.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className={`py-2 pr-3 max-w-[100px] truncate font-medium ${isLight ? 'text-slate-800' : 'text-gray-300'}`}>
                      {e.user_name || <span className={isLight ? 'text-slate-400' : 'text-gray-600'}>anon</span>}
                    </td>
                    <td className="py-2 pr-3">
                      <EventTypeBadge type={e.event_type} isLight={isLight} />
                    </td>
                    <td className={`py-2 pr-3 font-mono ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>{e.page_path || '—'}</td>
                    <td className={`py-2 pr-3 font-mono ${isLight ? 'text-slate-600' : 'text-gray-600'}`}>{e.ip_address || '—'}</td>
                    <td className={`py-2 pr-3 ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>
                      {[e.city, e.region, e.country].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className={`py-2 font-mono text-[10px] max-w-[80px] truncate ${isLight ? 'text-slate-400' : 'text-gray-700'}`}>{e.fingerprint_id || '—'}</td>
                  </tr>
                ))}
                {filteredEvents.length === 0 && (
                  <tr><td colSpan={7} className={`py-8 text-center ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No events yet — tracking kicks in on next page load</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Row ──────────────────────────────────────────────────────────────────

function KPIRow({ kpis, loading, isLight }: { kpis?: DashboardStats['kpis']; loading: boolean; isLight: boolean }) {
  const cards = [
    {
      label: 'Total Users',
      value: loading ? '—' : (kpis?.total_users ?? 0).toLocaleString('en-IN'),
      sub: 'registered surveyors',
      color: isLight ? 'text-blue-600' : 'text-blue-400',
      icon: '👤',
    },
    {
      label: 'Paid Conversion',
      value: loading ? '—' : `${kpis?.paid_conversion_pct ?? 0}%`,
      sub: 'of users paid or donated',
      color: isLight ? 'text-orange-600' : 'text-orange-400',
      icon: '🎯',
    },
    {
      label: 'Total Revenue',
      value: loading ? '—' : fmt(kpis?.total_revenue_paise ?? 0),
      sub: 'maps + sessions + donations + UPI',
      color: isLight ? 'text-emerald-600' : 'text-emerald-400',
      icon: '₹',
    },
    {
      label: 'Active This Week',
      value: loading ? '—' : (kpis?.active_this_week ?? 0).toLocaleString('en-IN'),
      sub: 'unique users with activity',
      color: isLight ? 'text-purple-600' : 'text-purple-400',
      icon: '📈',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(c => (
        <div key={c.label} className={`border rounded-2xl p-5 transition-all ${
          isLight ? 'bg-white border-slate-200 shadow-sm hover:shadow-md' : 'bg-gray-900 border-gray-800 shadow-xl hover:border-gray-700'
        }`}>
          <div className="flex items-start justify-between mb-3">
            <p className={`text-xs font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{c.label}</p>
            <span className="text-lg opacity-70">{c.icon}</span>
          </div>
          <p className={`text-3xl font-black tabular-nums font-mono ${c.color} mb-1`}>{c.value}</p>
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-600'}`}>{c.sub}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Revenue Breakdown (stacked bar) ──────────────────────────────────────────

function RevenueBreakdown({ data, totalPaise, loading, isLight }: {
  data?: DashboardRevenueBreakdown;
  totalPaise: number;
  loading: boolean;
  isLight: boolean;
}) {
  const segments = [
    { label: 'Maps',      paise: data?.maps_paise      ?? 0, color: 'bg-orange-500',  text: isLight ? 'text-orange-700' : 'text-orange-400' },
    { label: 'Sessions',  paise: data?.sessions_paise  ?? 0, color: 'bg-purple-500',  text: isLight ? 'text-purple-700' : 'text-purple-400' },
    { label: 'Donations', paise: data?.donations_paise ?? 0, color: 'bg-pink-500',    text: isLight ? 'text-pink-700' : 'text-pink-400'   },
    { label: 'UPI',       paise: data?.upi_paise       ?? 0, color: 'bg-emerald-500', text: isLight ? 'text-emerald-700' : 'text-emerald-400' },
  ].filter(s => s.paise > 0);

  const total = segments.reduce((acc, s) => acc + s.paise, 0) || 1;

  return (
    <div className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <div className="flex items-center justify-between mb-1">
        <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Revenue Breakdown</p>
        <p className={`font-black font-mono text-xl ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>{fmt(totalPaise)}</p>
      </div>
      <p className={`text-xs mb-5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Actual charged amounts from payment_events ledger</p>

      {loading ? <Spinner /> : (
        <>
          <div className={`flex h-8 rounded-lg overflow-hidden mb-4 gap-0.5 ${isLight ? 'bg-slate-100' : 'bg-gray-800'}`}>
            {totalPaise === 0 ? (
              <div className={`flex-1 flex items-center justify-center text-xs ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No revenue recorded yet</div>
            ) : segments.map(s => (
              <div
                key={s.label}
                className={`${s.color} transition-all`}
                style={{ width: `${(s.paise / total) * 100}%` }}
                title={`${s.label}: ${fmt(s.paise)}`}
              />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Maps',      paise: data?.maps_paise      ?? 0, color: 'bg-orange-500',  text: isLight ? 'text-orange-700' : 'text-orange-400' },
              { label: 'Sessions',  paise: data?.sessions_paise  ?? 0, color: 'bg-purple-500',  text: isLight ? 'text-purple-700' : 'text-purple-400' },
              { label: 'Donations', paise: data?.donations_paise ?? 0, color: 'bg-pink-500',    text: isLight ? 'text-pink-700' : 'text-pink-400'   },
              { label: 'UPI',       paise: data?.upi_paise       ?? 0, color: 'bg-emerald-500', text: isLight ? 'text-emerald-700' : 'text-emerald-400' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.color}`} />
                <span className={`text-xs ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>{s.label}</span>
                <span className={`ml-auto font-mono font-bold text-xs ${s.text}`}>{fmt(s.paise)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Growth Timeline (SVG) ────────────────────────────────────────────────────

function GrowthChart({ data, days, isLight }: { data: DashboardTimelineDay[]; days: number; isLight: boolean }) {
  if (!data.length) {
    return (
      <div className={`border rounded-2xl p-6 h-72 flex items-center justify-center text-sm ${
        isLight ? 'bg-white border-slate-200 text-slate-400' : 'bg-gray-900 border-gray-800 text-gray-600'
      }`}>
        No data for this period
      </div>
    );
  }

  const W = 640, H = 220, PX = 44, PY = 30;
  const cW = W - PX * 2, cH = H - PY * 2;
  const n  = data.length;

  const maxU   = Math.max(...data.map(d => d.new_users),    1);
  const maxP   = Math.max(...data.map(d => d.new_projects), 1);
  const maxAll = Math.max(maxU, maxP);
  const maxRev = Math.max(...data.map(d => d.revenue_paise), 1);

  const xOf = (i: number) => PX + (n > 1 ? (i / (n - 1)) * cW : cW / 2);
  const yOf = (v: number, max: number) => PY + cH - (v / max) * cH;

  const line = (pts: {x:number;y:number}[]) =>
    pts.reduce((s, p, i) => i === 0 ? `M ${p.x} ${p.y}` : `${s} L ${p.x} ${p.y}`, '');

  const ptsU   = data.map((d, i) => ({ x: xOf(i), y: yOf(d.new_users,    maxAll) }));
  const ptsP   = data.map((d, i) => ({ x: xOf(i), y: yOf(d.new_projects, maxAll) }));
  const ptsR   = data.map((d, i) => ({ x: xOf(i), y: yOf(d.revenue_paise, maxRev) }));

  const gridVals = [0, 0.25, 0.5, 0.75, 1];
  const interval = days <= 7 ? 1 : days <= 14 ? 2 : days <= 30 ? 4 : 10;

  const gridStroke = isLight ? '#e2e8f0' : '#374151';
  const labelColor = isLight ? '#64748b' : '#4B5563';

  return (
    <div className={`border rounded-2xl p-4 sm:p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Growth &amp; Activity Trends</p>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>IST-correct daily buckets from Postgres</p>
        </div>
        <div className="flex gap-4 text-[10px] font-bold flex-wrap">
          {[
            { label: 'New Users',    color: 'bg-orange-500',  text: isLight ? 'text-orange-700' : 'text-orange-400'  },
            { label: 'Projects',     color: 'bg-purple-500',  text: isLight ? 'text-purple-700' : 'text-purple-400'  },
            { label: 'Revenue',      color: 'bg-emerald-500', text: isLight ? 'text-emerald-700' : 'text-emerald-400' },
          ].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${l.color}`} />
              <span className={l.text}>{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[500px]">
          <defs>
            {[
              { id: 'gU', c: '#f97316' },
              { id: 'gP', c: '#a855f7' },
              { id: 'gR', c: '#10b981' },
            ].map(g => (
              <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={g.c} />
                <stop offset="100%" stopColor={g.c} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>

          {/* Gridlines */}
          {gridVals.map((r, i) => {
            const y = PY + r * cH;
            return (
              <g key={i}>
                <line x1={PX} y1={y} x2={W - PX} y2={y} stroke={gridStroke} strokeWidth={0.5} strokeDasharray="3 3" />
                <text x={PX - 6} y={y + 4} fill={labelColor} fontSize={8} textAnchor="end">{Math.round(maxAll * (1 - r))}</text>
              </g>
            );
          })}

          {/* Area fills */}
          <path d={`${line(ptsU)} L ${ptsU[n-1].x} ${PY+cH} L ${ptsU[0].x} ${PY+cH} Z`} fill="url(#gU)" opacity={0.08} />
          <path d={`${line(ptsP)} L ${ptsP[n-1].x} ${PY+cH} L ${ptsP[0].x} ${PY+cH} Z`} fill="url(#gP)" opacity={0.08} />
          <path d={`${line(ptsR)} L ${ptsR[n-1].x} ${PY+cH} L ${ptsR[0].x} ${PY+cH} Z`} fill="url(#gR)" opacity={0.08} />

          {/* Lines */}
          <path d={line(ptsU)} fill="none" stroke="#f97316" strokeWidth={2} strokeLinecap="round" />
          <path d={line(ptsP)} fill="none" stroke="#a855f7" strokeWidth={2} strokeLinecap="round" />
          <path d={line(ptsR)} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" strokeDasharray="4 2" />

          {/* Dots + tooltips for users */}
          {ptsU.map((p, i) => (
            <g key={i} className="group/dot cursor-pointer">
              <circle cx={p.x} cy={p.y} r={3} fill="#f97316" stroke={isLight ? '#ffffff' : '#111827'} strokeWidth={1.5} />
              <g className="opacity-0 group-hover/dot:opacity-100 transition-opacity pointer-events-none">
                <rect x={p.x - 26} y={p.y - 26} width={52} height={16} rx={3} fill={isLight ? '#ffffff' : '#030712'} stroke={isLight ? '#cbd5e1' : '#374151'} strokeWidth={0.5} />
                <text x={p.x} y={p.y - 14} fill="#f97316" fontSize={8} fontWeight="bold" textAnchor="middle">+{data[i].new_users}u</text>
              </g>
            </g>
          ))}

          {/* X axis labels */}
          {data.map((d, i) => {
            if (i % interval !== 0 && i !== n - 1) return null;
            const [, m, day] = d.day.split('-');
            return (
              <text key={i} x={xOf(i)} y={H - PY + 16} fill={labelColor} fontSize={8} textAnchor="middle">
                {day}/{m}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── Conversion Funnel ────────────────────────────────────────────────────────

function ConversionFunnel({ funnel, loading, isLight }: { funnel?: DashboardFunnel; loading: boolean; isLight: boolean }) {
  const stages = [
    { label: 'Signups',           count: funnel?.signups         ?? 0, color: 'bg-blue-500'    },
    { label: 'Onboarding Done',   count: funnel?.onboarding_done ?? 0, color: 'bg-orange-500'  },
    { label: 'First Map Created', count: funnel?.first_map       ?? 0, color: 'bg-purple-500'  },
    { label: 'Paid / Donated',    count: funnel?.paid_or_donated ?? 0, color: 'bg-emerald-500' },
  ];

  const max = stages[0].count || 1;

  return (
    <div className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <p className={`font-bold mb-1 ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Conversion Funnel</p>
      <p className={`text-xs mb-6 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Where enumerators drop off — donation conversion optimization view</p>

      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {stages.map((s, i) => {
            const prev    = i > 0 ? stages[i - 1].count : null;
            const dropPct = prev && prev > 0 ? (((prev - s.count) / prev) * 100).toFixed(0) : null;
            const barPct  = (s.count / max) * 100;

            return (
              <div key={s.label}>
                {dropPct && Number(dropPct) > 0 && (
                  <div className="flex items-center gap-2 mb-1.5 ml-1">
                    <div className={`w-px h-3 ${isLight ? 'bg-slate-300' : 'bg-gray-700'}`} />
                    <span className="text-[11px] text-red-500 font-semibold">−{dropPct}% dropped off</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className={`w-28 sm:w-32 text-xs text-right shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{s.label}</div>
                  <div className={`flex-1 rounded-full h-8 relative overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-gray-800'}`}>
                    <div
                      className={`h-full ${s.color} rounded-full transition-all duration-700`}
                      style={{ width: `${barPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-luminosity">
                      {s.count.toLocaleString('en-IN')}
                      <span className="font-normal text-white/70 ml-1">({pct(s.count, max)}%)</span>
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Cohort Retention ────────────────────────────────────────────────────────

function CohortRetention({ data, loading, isLight }: { data?: DashboardStats['cohort_retention']; loading: boolean; isLight: boolean }) {
  const cards = [
    { label: 'D1 Retention',  pct: data?.d1_pct  ?? 0, sub: 'returned next day'  },
    { label: 'D7 Retention',  pct: data?.d7_pct  ?? 0, sub: 'returned after 1wk' },
    { label: 'D30 Retention', pct: data?.d30_pct ?? 0, sub: 'returned after 1mo'  },
  ];

  const color = (v: number) =>
    v >= 40 ? 'text-emerald-500' : v >= 20 ? 'text-orange-500' : v > 0 ? 'text-amber-500' : isLight ? 'text-slate-400' : 'text-gray-600';

  return (
    <div className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <p className={`font-bold mb-1 ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Cohort Retention</p>
      <p className={`text-xs mb-6 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Real D1/D7/D30 — computed in Postgres</p>

      {loading ? <Spinner /> : (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {cards.map(c => (
            <div key={c.label} className={`rounded-xl p-3 sm:p-4 text-center border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-950 border-gray-800'
            }`}>
              <p className={`text-2xl sm:text-3xl font-black font-mono tabular-nums ${color(c.pct)}`}>{c.pct}%</p>
              <p className={`text-xs font-bold mt-1 ${isLight ? 'text-slate-700' : 'text-gray-400'}`}>{c.label}</p>
              <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>{c.sub}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Live Session Funnel ──────────────────────────────────────────────────────

function LiveSessionFunnel({ data, loading, isLight }: { data?: DashboardStats['live_funnel']; loading: boolean; isLight: boolean }) {
  const stages = [
    { label: 'Sessions Started', count: data?.started    ?? 0, color: 'bg-blue-500'    },
    { label: 'Used AI Regen',    count: data?.regen_used ?? 0, color: 'bg-purple-500'  },
    { label: 'Paid',             count: data?.paid       ?? 0, color: 'bg-emerald-500' },
  ];
  const max = stages[0].count || 1;

  return (
    <div className={`border rounded-2xl p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <p className={`font-bold mb-1 ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Live Session Funnel</p>
      <p className={`text-xs mb-6 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Started → Regen → Paid</p>

      {loading ? <Spinner /> : (
        <div className="space-y-3">
          {stages.map(s => (
            <div key={s.label} className="flex items-center gap-3">
              <div className={`w-28 text-xs text-right shrink-0 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{s.label}</div>
              <div className={`flex-1 rounded-full h-7 relative overflow-hidden ${isLight ? 'bg-slate-100' : 'bg-gray-800'}`}>
                <div className={`h-full ${s.color} rounded-full`} style={{ width: `${(s.count / max) * 100}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white mix-blend-luminosity">
                  {s.count.toLocaleString('en-IN')}
                </span>
              </div>
              <div className={`w-12 text-right text-xs shrink-0 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{pct(s.count, max)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Geographic Distribution ──────────────────────────────────────────────────

function GeoTable({ data, totalUsers, loading, isLight }: {
  data: DashboardStats['geo'];
  totalUsers: number;
  loading: boolean;
  isLight: boolean;
}) {
  const maxCount = Math.max(...(data || []).map(r => r.user_count), 1);

  return (
    <div className={`border rounded-2xl p-4 sm:p-6 ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <p className={`font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Geographic Distribution</p>
          <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Enumerator concentration by tehsil &amp; village · {totalUsers} total users</p>
        </div>
        <button
          onClick={() => exportCSV('geo-distribution', (data || []).map(r => ({
            tehsil: r.tehsil,
            town_village: r.town_village,
            user_count: r.user_count,
            pct: r.pct,
          })))}
          className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
            isLight ? 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-700' : 'bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-300'
          }`}
        >
          ↓ CSV
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[500px]">
            <thead>
              <tr className={`uppercase tracking-wider text-xs border-b ${isLight ? 'text-slate-500 border-slate-200' : 'text-gray-600 border-gray-800'}`}>
                <th className="text-left py-2 pr-4">Tehsil</th>
                <th className="text-left py-2 pr-4">Town / Village</th>
                <th className="text-right py-2 pr-4">Users</th>
                <th className="text-left py-2 w-36">Share</th>
              </tr>
            </thead>
            <tbody>
              {(data || []).slice(0, 30).map((row, i) => (
                <tr key={i} className={`border-b transition-colors ${isLight ? 'border-slate-100 hover:bg-slate-50' : 'border-gray-800/30 hover:bg-gray-800/20'}`}>
                  <td className={`py-2 pr-4 ${isLight ? 'text-slate-800 font-medium' : 'text-gray-300'}`}>{row.tehsil}</td>
                  <td className={`py-2 pr-4 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{row.town_village}</td>
                  <td className={`py-2 pr-4 text-right tabular-nums font-medium ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{row.user_count}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <div className={`flex-1 rounded-full h-1.5 max-w-[80px] ${isLight ? 'bg-slate-200' : 'bg-gray-800'}`}>
                        <div
                          className="bg-orange-500 h-1.5 rounded-full"
                          style={{ width: `${(row.user_count / maxCount) * 100}%` }}
                        />
                      </div>
                      <span className={`text-xs w-10 text-right ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{row.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {(!data || data.length === 0) && (
                <tr><td colSpan={4} className={`py-8 text-center ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No location data — users need to fill tehsil/village in profile</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Event Type Badge ─────────────────────────────────────────────────────────

const EVENT_COLORS_DARK: Record<string, string> = {
  login:              'text-blue-400   bg-blue-500/10   border-blue-500/20',
  page_view:          'text-gray-400   bg-gray-700/40   border-gray-700',
  project_created:    'text-orange-400 bg-orange-500/10 border-orange-500/20',
  map_export:         'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  session_started:    'text-purple-400 bg-purple-500/10 border-purple-500/20',
  donation_attempted: 'text-pink-400   bg-pink-500/10   border-pink-500/20',
};

const EVENT_COLORS_LIGHT: Record<string, string> = {
  login:              'text-blue-700   bg-blue-50   border-blue-200',
  page_view:          'text-slate-600  bg-slate-100  border-slate-300',
  project_created:    'text-orange-700 bg-orange-50 border-orange-200',
  map_export:         'text-emerald-700 bg-emerald-50 border-emerald-200',
  session_started:    'text-purple-700 bg-purple-50 border-purple-200',
  donation_attempted: 'text-pink-700   bg-pink-50   border-pink-200',
};

function EventTypeBadge({ type, isLight }: { type: string; isLight: boolean }) {
  const map = isLight ? EVENT_COLORS_LIGHT : EVENT_COLORS_DARK;
  const cls = map[type] ?? (isLight ? 'text-slate-600 bg-slate-100 border-slate-300' : 'text-gray-400 bg-gray-800 border-gray-700');
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-semibold ${cls}`}>
      {type}
    </span>
  );
}
