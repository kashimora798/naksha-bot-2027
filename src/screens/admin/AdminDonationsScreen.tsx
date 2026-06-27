import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminDonations, type AdminDonation } from '../../lib/admin-api';

export default function AdminDonationsScreen() {
  const [donations, setDonations] = useState<AdminDonation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAdminDonations()
      .then(setDonations)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = donations.filter(d => {
    const q = search.toLowerCase();
    return (
      (d.name || '').toLowerCase().includes(q) ||
      (d.note || '').toLowerCase().includes(q) ||
      (d.owner_name || '').toLowerCase().includes(q) ||
      (d.owner_mobile || '').toLowerCase().includes(q) ||
      String(d.amount).includes(q)
    );
  });

  const totalRaised = donations.reduce((sum, d) => sum + Number(d.amount), 0);

  return (
    <div className="p-8">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 mb-1">Donation Clicks / Intents</h1>
          <p className="text-gray-500 text-sm">{donations.length} records</p>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/30 px-4 py-2.5 rounded-xl text-right">
          <span className="text-xs text-orange-400 block font-semibold uppercase tracking-wider">Total Intent Value</span>
          <span className="text-xl font-bold text-orange-300">₹{totalRaised.toLocaleString('en-IN')}</span>
        </div>
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
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-lg font-black text-orange-400 font-mono">₹{d.amount}</span>
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
              
              <div className="bg-gray-950/60 rounded-lg p-3 border border-gray-800/40 text-sm">
                <div className="flex gap-2 mb-1.5 text-xs text-gray-500">
                  <span className="font-semibold">Submitter Name/Note:</span>
                  <span className="text-gray-300 font-medium">{d.name || <span className="italic text-gray-600">None specified</span>}</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  <span className="font-semibold">UPI Pre-filled Note:</span>
                  <span className="text-gray-300 font-medium">{d.note || <span className="italic text-gray-600">None specified</span>}</span>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-600 py-12">No donations found</p>
          )}
        </div>
      )}
    </div>
  );
}
