import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

interface Announcement {
  id: string;
  created_at: string;
  title: string;
  content: string;
  image_url: string | null;
  is_active: boolean;
}

export default function AdminAnnouncementsScreen() {
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
        // Update
        const { error: err } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingId);
        if (err) throw err;
      } else {
        // Create
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
    <div className="p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100 mb-1">User Announcements</h1>
          <p className="text-gray-500 text-sm">Create and dispatch updates directly to surveyor dashboards</p>
        </div>
        {!showForm && (
          <button
            onClick={handleAddNew}
            className="px-4 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm shadow hover:bg-orange-600 transition-colors"
          >
            📢 Create Announcement
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-8 max-w-2xl">
          <h2 className="text-lg font-bold text-gray-100 mb-4">
            {editingId ? '✏️ Edit Announcement' : '📢 Publish New Announcement'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide">Title / शीर्षक *</label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. New update launched!"
                className="w-full bg-gray-950 border border-gray-850 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide">Banner Image URL / इमेज लिंक</label>
              <input
                type="url"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="e.g. https://example.com/banner.png"
                className="w-full bg-gray-950 border border-gray-850 rounded-xl px-4 py-3 text-sm text-gray-100 focus:outline-none focus:border-orange-500"
              />
              <p className="text-[10px] text-gray-500 mt-1">Host on Imgur, PostImg, or upload externally and paste the link here.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase tracking-wide">Message Content / संदेश विवरण *</label>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="Write your announcement details..."
                rows={5}
                className="w-full bg-gray-950 border border-gray-850 rounded-xl p-4 text-sm text-gray-100 focus:outline-none focus:border-orange-500 resize-none font-sans"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 bg-gray-950 border-gray-800"
              />
              <label htmlFor="is_active" className="text-xs font-bold text-gray-400 uppercase tracking-wide cursor-pointer select-none">
                Active / लाइव है (Visible to Users)
              </label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 bg-gray-800 text-gray-300 font-bold rounded-xl text-sm hover:bg-gray-755 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-orange-500 text-white font-bold rounded-xl text-sm hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Announcement' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl mb-6 text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-12 text-center">
          <span className="text-4xl block mb-3">📢</span>
          <p className="text-gray-400 font-bold text-lg mb-1">No Announcements Published</p>
          <p className="text-gray-600 text-sm">Click "Create Announcement" to publish updates for your users.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-950/50 text-gray-500 text-xs font-bold uppercase tracking-wider">
                <th className="px-6 py-4">Announcement</th>
                <th className="px-6 py-4">Created At</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-850">
              {announcements.map(ann => (
                <tr key={ann.id} className="hover:bg-gray-850/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-start gap-4">
                      {ann.image_url && (
                        <img
                          src={ann.image_url}
                          alt="Banner"
                          className="w-16 h-10 object-cover rounded-lg border border-gray-800 shrink-0"
                          onError={(e) => { (e.target as any).src = 'https://placehold.co/100x60?text=Error'; }}
                        />
                      )}
                      <div>
                        <p className="font-bold text-gray-200 text-sm">{ann.title}</p>
                        <p className="text-gray-500 text-xs mt-1 max-w-lg line-clamp-2">{ann.content}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                    {new Date(ann.created_at).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 rounded text-[10px] font-bold ${
                      ann.is_active
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-gray-800 text-gray-500'
                    }`}>
                      {ann.is_active ? 'ACTIVE / लाइव' : 'INACTIVE / बंद'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right space-x-3 shrink-0">
                    <button
                      onClick={() => handleEdit(ann)}
                      className="text-xs text-orange-400 hover:text-orange-300 font-bold hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(ann.id)}
                      className="text-xs text-red-400 hover:text-red-300 font-bold hover:underline"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
