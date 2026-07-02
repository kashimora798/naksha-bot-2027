import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { LanguageSelector } from '../lib/i18n';

interface Props {
  user: any;
  userProfile: any;
  onClose: () => void;
  onSaved: (profile: any) => void;
}

// Editable profile — name, profession, contact, working area (HLB), and the
// Census layout-map title-block particulars used by the PDF export.
export default function ProfileScreen({ user, userProfile, onClose, onSaved }: Props) {
  const p = userProfile || {};
  const [fullName, setFullName] = useState(p.full_name || '');
  const [profession, setProfession] = useState(p.profession || '');
  const [mobile, setMobile] = useState(p.mobile || '');
  const [hlbNumber, setHlbNumber] = useState(p.hlb_number || '');
  const [hlbLat, setHlbLat] = useState(p.hlb_lat != null ? String(p.hlb_lat) : '');
  const [hlbLng, setHlbLng] = useState(p.hlb_lng != null ? String(p.hlb_lng) : '');
  const [hlbAddress, setHlbAddress] = useState(p.hlb_address || '');
  const [tehsil, setTehsil] = useState(p.tehsil || '');
  const [townVillage, setTownVillage] = useState(p.town_village || '');
  const [wardNo, setWardNo] = useState(p.ward_no || '');
  const [ebNo, setEbNo] = useState(p.eb_no || '');
  const [supervisorName, setSupervisorName] = useState(p.supervisor_name || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true); setError(null);
    const lat = parseFloat(hlbLat); const lng = parseFloat(hlbLng);
    const profileData = {
      id: user.id,
      full_name: fullName.trim() || null,
      profession: profession.trim() || null,
      mobile: mobile.trim() || null,
      hlb_number: hlbNumber.trim() || null,
      hlb_lat: isFinite(lat) ? lat : null,
      hlb_lng: isFinite(lng) ? lng : null,
      hlb_address: hlbAddress.trim() || null,
      tehsil: tehsil.trim() || null,
      town_village: townVillage.trim() || null,
      ward_no: wardNo.trim() || null,
      eb_no: ebNo.trim() || null,
      supervisor_name: supervisorName.trim() || null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };
    const { data, error: upErr } = await supabase
      .from('user_profiles').upsert(profileData).select().maybeSingle();
    setSaving(false);
    if (upErr) { setError(upErr.message); return; }
    setSaved(true);
    onSaved(data || profileData);
    setTimeout(() => setSaved(false), 2000);
  };

  const field = (label: string, val: string, set: (v: string) => void, ph = '', type = 'text') => (
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
      <input type={type} value={val} onChange={e => set(e.target.value)}
        className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm"
        placeholder={ph} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[3000] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">Your Profile</h2>
          <button onClick={onClose} className="text-slate-400 font-black text-xl leading-none px-2" aria-label="Close">×</button>
        </div>

        <div className="overflow-auto p-5 space-y-5 flex-1">
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Personal</p>
            <div className="grid grid-cols-1 gap-3">
              {field('Full Name', fullName, setFullName, 'Your name')}
              <div className="grid grid-cols-2 gap-3">
                {field('Profession', profession, setProfession, 'e.g. Enumerator')}
                {field('Mobile', mobile, setMobile, '10-digit', 'tel')}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                <input value={user?.email || ''} disabled
                  className="w-full bg-slate-100 border border-slate-200 p-3 rounded-xl text-sm text-slate-500" />
              </div>
            </div>
          </div>
          
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Language (भाषा)</p>
            <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">App Language</span>
              <LanguageSelector />
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Working Area (HLB)</p>
            <div className="grid grid-cols-2 gap-3">
              {field('HLB Number', hlbNumber, setHlbNumber, 'e.g. 0455')}
              <div />
              {field('Latitude', hlbLat, setHlbLat, 'e.g. 26.4499')}
              {field('Longitude', hlbLng, setHlbLng, 'e.g. 80.3319')}
            </div>
            <div className="mt-3">{field('Address / Locality', hlbAddress, setHlbAddress, 'Area description')}</div>
          </div>

          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Layout Map Details (PDF title block)</p>
            <div className="grid grid-cols-2 gap-3">
              {field('Tehsil / Taluk', tehsil, setTehsil, 'e.g. Sadar')}
              {field('Town / Village', townVillage, setTownVillage, 'e.g. Bajheri')}
              {field('Ward No.', wardNo, setWardNo, 'e.g. 14')}
              {field('EB No. (2011)', ebNo, setEbNo, 'optional')}
            </div>
            <div className="mt-3">{field('Supervisor Name', supervisorName, setSupervisorName, 'Your Supervisor')}</div>
          </div>

          {error && <p className="text-sm text-red-600 font-semibold">{error}</p>}
        </div>

        <div className="p-5 border-t border-slate-100">
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 bg-green-600 text-white rounded-xl font-bold shadow-lg hover:bg-green-700 transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
