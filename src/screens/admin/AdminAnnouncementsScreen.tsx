import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import type { AdminTheme } from './AdminLayout';

interface Announcement {
  id: string;
  created_at: string;
  title: string;
  content: string;
  image_url: string | null;
  is_active: boolean;
}

export default function AdminAnnouncementsScreen() {
  const { theme } = useOutletContext<{ theme: AdminTheme }>() || { theme: 'dark' };
  const isLight = theme === 'light';

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (err) throw err;
      setAnnouncements(data || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (ann: Announcement) => {
    setEditingId(ann.id);
    setTitle(ann.title);
    setContent(ann.content);
    setImageUrl(ann.image_url || '');
    setIsActive(ann.is_active);
    setShowForm(true);
  };

  const handleAddNew = () => {
    setEditingId(null);
    setTitle('');
    setContent('');
    setImageUrl('');
    setIsActive(true);
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setTitle('');
    setContent('');
    setImageUrl('');
    setIsActive(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('Title and Content are required!');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        image_url: imageUrl.trim() || null,
        is_active: isActive
      };

      if (editingId) {
        const { error: err } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        const { error: err } = await supabase
          .from('announcements')
          .insert(payload);
        if (err) throw err;
      }

      handleCancel();
      await fetchAnnouncements();
    } catch (err: any) {
      console.error(err);
      alert('Error saving announcement: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this announcement?')) return;
    try {
      const { error: err } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);
      if (err) throw err;
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      console.error(err);
      alert('Failed to delete announcement: ' + err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-xl sm:text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-gray-100'}`}>User Announcements</h1>
          <p className={`text-xs sm:text-sm ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>Create and dispatch updates directly to surveyor dashboards</p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-xs sm:text-sm shadow hover:bg-orange-600 transition-colors cursor-pointer"
          >
            📢 Create Announcement
          </button>
        )}
      </div>

      {showForm && (
        <div className={`border rounded-2xl p-6 max-w-2xl ${
          isLight ? 'bg-white border-slate-200 shadow-sm text-slate-900' : 'bg-gray-900 border-gray-800 text-gray-100'
        }`}>
          <h2 className="text-lg font-bold mb-4">
            {editingId ? '✏️ Edit Announcement' : '📢 Publish New Announcement'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wide ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>Title / शीर्षक *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. New update launched!"
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-800 text-gray-100'
                }`}
                required
              />
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wide ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>Banner Image URL / इमेज लिंक</label>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="e.g. https://example.com/banner.png"
                className={`w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-800 text-gray-100'
                }`}
              />
              <p className={`text-[10px] mt-1 ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>Host on Imgur, PostImg, or upload externally and paste the link here.</p>
            </div>

            <div>
              <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wide ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>Message Content / संदेश विवरण *</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your announcement details..."
                rows={5}
                className={`w-full border rounded-xl p-4 text-sm focus:outline-none focus:border-orange-500 resize-none font-sans ${
                  isLight ? 'bg-slate-50 border-slate-300 text-slate-900' : 'bg-gray-950 border-gray-800 text-gray-100'
                }`}
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 border-gray-300 focus:ring-orange-500"
              />
              <label htmlFor="is_active" className={`text-xs font-bold uppercase tracking-wide cursor-pointer select-none ${isLight ? 'text-slate-700' : 'text-gray-400'}`}>
                Active / लाइव है (Visible to Users)
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className={`px-5 py-2.5 font-bold rounded-xl text-sm transition-colors cursor-pointer ${
                  isLight ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Announcement' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className={`border rounded-2xl p-12 text-center ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800'
        }`}>
          <span className="text-4xl block mb-3">📢</span>
          <p className={`font-bold text-lg mb-1 ${isLight ? 'text-slate-800' : 'text-gray-400'}`}>No Announcements Published</p>
          <p className={`text-sm ${isLight ? 'text-slate-500' : 'text-gray-600'}`}>Click "Create Announcement" to publish updates for your users.</p>
        </div>
      ) : (
        <div className={`border rounded-2xl overflow-hidden ${
          isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-gray-900 border-gray-800 shadow-xl'
        }`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[650px]">
              <thead>
                <tr className={`border-b text-xs font-bold uppercase tracking-wider ${
                  isLight ? 'border-slate-200 bg-slate-50 text-slate-500' : 'border-gray-800 bg-gray-950/50 text-gray-500'
                }`}>
                  <th className="px-6 py-4">Announcement</th>
                  <th className="px-6 py-4">Created At</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-gray-800'}`}>
                {announcements.map(ann => (
                  <tr key={ann.id} className={`transition-colors ${isLight ? 'hover:bg-slate-50' : 'hover:bg-gray-800/30'}`}>
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-4">
                        {ann.image_url && (
                          <img
                            src={ann.image_url}
                            alt="Banner"
                            className="w-16 h-10 object-cover rounded-lg border border-gray-300 shrink-0"
                            onError={(e) => { (e.target as any).src = 'https://placehold.co/100x60?text=Error'; }}
                          />
                        )}
                        <div>
                          <p className={`font-bold text-sm ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{ann.title}</p>
                          <p className={`text-xs mt-1 max-w-lg line-clamp-2 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{ann.content}</p>
                        </div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-xs font-mono ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      {new Date(ann.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold ${
                        ann.is_active
                          ? 'bg-green-500/10 text-green-600'
                          : isLight ? 'bg-slate-100 text-slate-500' : 'bg-gray-800 text-gray-500'
                      }`}>
                        {ann.is_active ? 'ACTIVE / लाइव' : 'INACTIVE / बंद'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-3 shrink-0">
                      <button
                        onClick={() => handleEdit(ann)}
                        className="text-xs text-orange-500 hover:text-orange-400 font-bold hover:underline cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(ann.id)}
                        className="text-xs text-rose-500 hover:text-rose-400 font-bold hover:underline cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
