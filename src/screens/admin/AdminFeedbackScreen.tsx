import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchAdminFeedback, type AdminFeedback } from '../../lib/admin-api';

export default function AdminFeedbackScreen() {
  const [feedback, setFeedback] = useState<AdminFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchAdminFeedback()
      .then(setFeedback)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = feedback.filter(f => {
    const q = search.toLowerCase();
    return (
      (f.suggestions || '').toLowerCase().includes(q) ||
      (f.useful || '').toLowerCase().includes(q) ||
      (f.owner_name || '').toLowerCase().includes(q) ||
      (f.owner_mobile || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-100 mb-1">Feedback</h1>
      <p className="text-gray-500 text-sm mb-6">{feedback.length} submissions</p>

      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search feedback…"
        className="w-full max-w-sm bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 mb-6"
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
          {filtered.map(f => (
            <div
              key={f.id}
              className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  {f.user_id ? (
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/kratagya/users/${f.user_id}`}
                        className="text-orange-400 hover:text-orange-300 text-sm font-medium"
                      >
                        {f.owner_name || 'Unknown user'}
                      </Link>
                      {f.owner_mobile && (
                        <a 
                          href={`tel:${f.owner_mobile}`}
                          className="text-gray-400 hover:text-gray-300 text-xs bg-gray-800 px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                        >
                          📞 {f.owner_mobile}
                        </a>
                      )}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">Anonymous</span>
                  )}
                  {f.useful && (
                    <span className="ml-3 text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
                      {f.useful}
                    </span>
                  )}
                </div>
                <span className="text-gray-600 text-xs shrink-0">
                  {new Date(f.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                </span>
              </div>
              <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                {f.suggestions || <span className="text-gray-600 italic">No message</span>}
              </p>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-center text-gray-600 py-12">No feedback found</p>
          )}
        </div>
      )}
    </div>
  );
}
