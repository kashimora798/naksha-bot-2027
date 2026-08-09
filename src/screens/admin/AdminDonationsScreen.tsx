import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { fetchAdminDonations, type AdminDonation, verifyDonation, deleteDonation } from '../../lib/admin-api';
import type { AdminTheme } from './AdminLayout';

export default function AdminDonationsScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const [donations, setDonations] = useState<AdminDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'pending' | 'paid' | 'all'>('pending');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminDonations()
      .then(setDonations)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const handleMarkPaid = async (id: string) => {
    setUpdatingId(id);
    try {
      await verifyDonation(id, true);
      setDonations(prev => prev.map(d => d.id === id ? { ...d, is_paid: true } : d));
    } catch (err: any) {
      console.error(err);
      alert("Failed to mark as paid: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure this record is unpaid/unwanted and you want to remove it?')) return;
    setUpdatingId(id);
    try {
      await deleteDonation(id);
      setDonations(prev => prev.filter(d => d.id !== id));
    } catch (err: any) {
      console.error(err);
      alert("Failed to delete record: " + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = donations.filter(d => {
    const q = search.toLowerCase();
    const matchesSearch = (
      (d.name || '').toLowerCase().includes(q) ||
      (d.note || '').toLowerCase().includes(q) ||
      (d.owner_name || '').toLowerCase().includes(q) ||
      (d.owner_mobile || '').toLowerCase().includes(q) ||
      String(d.amount).includes(q)
    );
    if (!matchesSearch) return false;

    if (filterTab === 'pending') return !d.is_paid;
    if (filterTab === 'paid') return !!d.is_paid;
    return true;
  });

  const totalIntents = donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalVerifiedPaid = donations.filter(d => d.is_paid).reduce((sum, d) => sum + Number(d.amount), 0);

  const pendingCount = donations.filter(d => !d.is_paid).length;
  const paidCount = donations.filter(d => d.is_paid).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>Donation Verifications</h1>
          <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{donations.length} total records clicked</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <div className={`px-4 py-2 rounded-xl border text-right ${isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800'}`}>
            <span className={`text-[10px] block font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Total Intent Value</span>
            <span className={`text-lg font-bold ${isLight ? 'text-slate-700' : 'text-gray-400'}`}>₹{totalIntents.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-2 rounded-xl text-right">
            <span className="text-[10px] text-emerald-600 block font-semibold uppercase tracking-wider">Verified Paid Value</span>
            <span className={`text-lg font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`}>₹{totalVerifiedPaid.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className={`flex gap-2 border-b pb-px ${isLight ? 'border-slate-200' : 'border-gray-800'}`}>
        {(['pending', 'paid', 'all'] as const).map(t => {
          const count = t === 'pending' ? pendingCount : t === 'paid' ? paidCount : donations.length;
          const label = t === 'pending' ? 'Pending Intents' : t === 'paid' ? 'Verified Paid' : 'All Logs';
          return (
            <button
              key={t}
              onClick={() => setFilterTab(t)}
              className={`pb-2.5 px-4 text-xs sm:text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
                filterTab === t
                  ? 'border-orange-500 text-orange-500 font-bold'
                  : isLight
                  ? 'border-transparent text-slate-500 hover:text-slate-800'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
              <span className={`text-xs px-2 py-0.5 rounded-full font-mono ${
                t === 'paid'
                  ? 'bg-emerald-500/20 text-emerald-600'
                  : isLight
                  ? 'bg-slate-200 text-slate-700'
                  : 'bg-gray-800 text-gray-400'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search donations (name, note, amount, phone)…"
        className={`w-full max-w-md border rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-orange-500 ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 shadow-sm'
            : 'bg-gray-900 border-gray-700 text-gray-200 placeholder-gray-600'
        }`}
      />

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700 rounded-xl text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
          Loading donations…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(d => (
            <div
              key={d.id}
              className={`border rounded-2xl p-5 transition-colors ${
                isLight
                  ? 'bg-white border-slate-200 shadow-sm hover:border-slate-300'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-black text-orange-500 font-mono">₹{d.amount}</span>
                  {d.is_paid || d.payment_status === 'paid' ? (
                    <span className="bg-emerald-500/10 text-emerald-600 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold font-mono">
                      ✓ Paid (Success)
                    </span>
                  ) : d.payment_status === 'failed' ? (
                    <span className="bg-rose-500/10 text-rose-500 text-[10px] px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold font-mono">
                      ❌ Failed
                    </span>
                  ) : (
                    <span className="bg-amber-500/10 text-amber-600 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold font-mono">
                      ⏳ Unpaid / Pending
                    </span>
                  )}
                  {d.user_id ? (
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/kratagya/users/${d.user_id}`}
                        className="text-orange-500 hover:text-orange-400 text-sm font-medium"
                      >
                        {d.owner_name || 'Registered user'}
                      </Link>
                      {d.owner_mobile && (
                        <a 
                          href={`tel:${d.owner_mobile}`}
                          className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 transition-colors ${
                            isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-gray-800 text-gray-400 hover:text-gray-300'
                          }`}
                        >
                          📞 {d.owner_mobile}
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className={`text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>Guest User</span>
                  )}
                </div>
                <span className={`text-xs shrink-0 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>
                  {new Date(d.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: 'numeric', minute: 'numeric'
                  })}
                </span>
              </div>
              
              <div className={`rounded-xl p-3 border text-sm mb-4 space-y-1.5 ${
                isLight ? 'bg-slate-50 border-slate-200' : 'bg-gray-950/60 border-gray-800/40'
              }`}>
                <div className={`flex gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>
                  <span className="font-semibold w-24 shrink-0">Donor Name:</span>
                  <span className={`font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{d.name || <span className="italic text-gray-400">None specified</span>}</span>
                </div>
                {d.payment_id && (
                  <div className={`flex gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>
                    <span className="font-semibold w-24 shrink-0">Cashfree ID:</span>
                    <span className="text-orange-500 font-mono select-all">{d.payment_id}</span>
                  </div>
                )}
                <div className={`flex gap-2 text-xs ${isLight ? 'text-slate-600' : 'text-gray-500'}`}>
                  <span className="font-semibold w-24 shrink-0">Message/Note:</span>
                  <span className={`font-medium ${isLight ? 'text-slate-900' : 'text-gray-300'}`}>{d.note || <span className="italic text-gray-400">None specified</span>}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 items-center">
                {!d.is_paid && (
                  <button
                    disabled={updatingId !== null}
                    onClick={() => handleMarkPaid(d.id)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {updatingId === d.id ? 'Saving...' : 'Yes, Mark Paid'}
                  </button>
                )}
                <button
                  disabled={updatingId !== null}
                  onClick={() => handleDelete(d.id)}
                  className={`px-4 py-1.5 border font-semibold text-xs rounded-xl disabled:opacity-50 transition-colors cursor-pointer ${
                    isLight ? 'border-rose-300 text-rose-600 hover:bg-rose-50' : 'border-red-900/50 text-red-400 hover:bg-red-950/20'
                  }`}
                >
                  {updatingId === d.id ? 'Deleting...' : 'Delete / Not Paid'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className={`text-center py-12 ${isLight ? 'text-slate-400' : 'text-gray-600'}`}>No records in this tab</p>
          )}
        </div>
      )}
    </div>
  );
}
