import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminDonations, type AdminDonation, verifyDonation, deleteDonation } from '../../lib/admin-api';

export default function AdminDonationsScreen() {
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
      alert(
        "Failed to mark as paid: " + err.message + 
        "\n\nMake sure the database migration has been run! File is located at supabase/migrations/20260628_add_is_paid_to_donations.sql"
      );
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
    // Search query filter
    const q = search.toLowerCase();
    const matchesSearch = (
      (d.name || '').toLowerCase().includes(q) ||
      (d.note || '').toLowerCase().includes(q) ||
      (d.owner_name || '').toLowerCase().includes(q) ||
      (d.owner_mobile || '').toLowerCase().includes(q) ||
      String(d.amount).includes(q)
    );
    if (!matchesSearch) return false;

    // Tab filter
    if (filterTab === 'pending') return !d.is_paid;
    if (filterTab === 'paid') return !!d.is_paid;
    return true;
  });

  const totalIntents = donations.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalVerifiedPaid = donations.filter(d => d.is_paid).reduce((sum, d) => sum + Number(d.amount), 0);

  const pendingCount = donations.filter(d => !d.is_paid).length;
  const paidCount = donations.filter(d => d.is_paid).length;

  return (
    <div className="p-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 mb-1">Donation Verifications</h1>
          <p className="text-gray-500 text-sm">{donations.length} total records clicked</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-gray-900 border border-gray-800 px-4 py-2.5 rounded-xl text-right">
            <span className="text-[10px] text-gray-500 block font-semibold uppercase tracking-wider">Total Intent Value</span>
            <span className="text-lg font-bold text-gray-400">₹{totalIntents.toLocaleString('en-IN')}</span>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/30 px-4 py-2.5 rounded-xl text-right">
            <span className="text-[10px] text-emerald-400 block font-semibold uppercase tracking-wider">Verified Paid Value</span>
            <span className="text-lg font-bold text-emerald-300">₹{totalVerifiedPaid.toLocaleString('en-IN')}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-800 pb-px mb-6">
        <button
          onClick={() => setFilterTab('pending')}
          className={`pb-2.5 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            filterTab === 'pending'
              ? 'border-orange-500 text-orange-400 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Pending Intents
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-mono">
            {pendingCount}
          </span>
        </button>
        <button
          onClick={() => setFilterTab('paid')}
          className={`pb-2.5 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            filterTab === 'paid'
              ? 'border-orange-500 text-orange-400 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          Verified Paid (Kept)
          <span className="text-xs bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded-full font-mono">
            {paidCount}
          </span>
        </button>
        <button
          onClick={() => setFilterTab('all')}
          className={`pb-2.5 px-4 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
            filterTab === 'all'
              ? 'border-orange-500 text-orange-400 font-bold'
              : 'border-transparent text-gray-500 hover:text-gray-300'
          }`}
        >
          All Logs
          <span className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full font-mono">
            {donations.length}
          </span>
        </button>
      </div>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search donations (name, note, amount, phone)…"
        className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 mb-6"
      />

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          <div className="w-4 h-4 border border-gray-600 border-t-orange-500 rounded-full animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(d => (
            <div
              key={d.id}
              className={`bg-gray-900 border rounded-xl p-5 hover:border-gray-700 transition-colors ${
                d.is_paid ? 'border-emerald-950/65' : 'border-gray-800'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-black text-orange-400 font-mono">₹{d.amount}</span>
                  {d.is_paid || d.payment_status === 'paid' ? (
                    <span className="bg-emerald-500/10 text-emerald-400 text-[10px] px-2 py-0.5 rounded-full border border-emerald-500/20 font-semibold font-mono">
                      ✓ Paid (Success)
                    </span>
                  ) : d.payment_status === 'failed' ? (
                    <span className="bg-rose-500/10 text-rose-400 text-[10px] px-2 py-0.5 rounded-full border border-rose-500/20 font-semibold font-mono">
                      ❌ Failed
                    </span>
                  ) : d.payment_status === 'abandoned' ? (
                    <span className="bg-gray-500/15 text-gray-400 text-[10px] px-2 py-0.5 rounded-full border border-gray-800 font-semibold font-mono">
                      🏳️ Abandoned
                    </span>
                  ) : (
                    <span className="bg-amber-500/10 text-amber-400 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/20 font-semibold font-mono">
                      ⏳ Unpaid / Pending
                    </span>
                  )}
                  {d.user_id ? (
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/kratagya/users/${d.user_id}`}
                        className="text-orange-400 hover:text-orange-300 text-sm font-medium"
                      >
                        {d.owner_name || 'Registered user'}
                      </Link>
                      {d.owner_mobile && (
                        <a 
                          href={`tel:${d.owner_mobile}`}
                          className="text-gray-400 hover:text-gray-300 text-xs bg-gray-800 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                        >
                          📞 {d.owner_mobile}
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">Guest User</span>
                  )}
                </div>
                <span className="text-gray-600 text-xs shrink-0">
                  {new Date(d.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                    hour: 'numeric', minute: 'numeric'
                  })}
                </span>
              </div>
              
              <div className="bg-gray-950/60 rounded-lg p-3 border border-gray-800/40 text-sm mb-4 space-y-1.5">
                <div className="flex gap-2 text-xs text-gray-500">
                  <span className="font-semibold w-24 shrink-0">Donor Name:</span>
                  <span className="text-gray-300 font-medium">{d.name || <span className="italic text-gray-600">None specified</span>}</span>
                </div>
                {d.payment_id && (
                  <div className="flex gap-2 text-xs text-gray-500">
                    <span className="font-semibold w-24 shrink-0">Cashfree ID:</span>
                    <span className="text-orange-400 font-mono select-all">{d.payment_id}</span>
                  </div>
                )}
                <div className="flex gap-2 text-xs text-gray-500">
                  <span className="font-semibold w-24 shrink-0">Message/Note:</span>
                  <span className="text-gray-300 font-medium">{d.note || <span className="italic text-gray-600">None specified</span>}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 items-center">
                {!d.is_paid && (
                  <button
                    disabled={updatingId !== null}
                    onClick={() => handleMarkPaid(d.id)}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg shadow disabled:opacity-50 transition-colors"
                  >
                    {updatingId === d.id ? 'Saving...' : 'Yes, Mark Paid'}
                  </button>
                )}
                <button
                  disabled={updatingId !== null}
                  onClick={() => handleDelete(d.id)}
                  className="px-4 py-1.5 border border-red-900/50 hover:bg-red-950/20 text-red-400 font-semibold text-xs rounded-lg disabled:opacity-50 transition-colors"
                >
                  {updatingId === d.id ? 'Deleting...' : 'Delete / Not Paid'}
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-600 py-12">No records in this tab</p>
          )}
        </div>
      )}
    </div>
  );
}
