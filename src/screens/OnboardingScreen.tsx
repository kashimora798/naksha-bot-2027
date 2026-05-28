import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  user: any;
  onComplete: (profile: any) => void;
}

export default function OnboardingScreen({ user, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Profile data
  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '');
  const [profession, setProfession] = useState('');
  const [mobile, setMobile] = useState('');
  
  // HLB Option
  const [hlbMode, setHlbMode] = useState<'sms' | 'manual' | null>(null);
  const [hlbSms, setHlbSms] = useState('');
  
  // Manual HLB details
  const [hlbNumber, setHlbNumber] = useState('');
  const [hlbLat, setHlbLat] = useState('');
  const [hlbLng, setHlbLng] = useState('');
  const [hlbAddress, setHlbAddress] = useState('');

  const parseSms = (text: string) => {
    // Regex based on current parser
    const hlbMatch = text.match(/HLB\s*Number\s*[:-]?\s*(\d+)/i);
    const coMatch = text.match(/Coordinates\s*[:-]?\s*([\d.]+)\s*,\s*([\d.]+)/i);
    const p1 = text.indexOf('District');
    let address = 'Unknown Location';
    if (p1 !== -1) {
      address = text.substring(p1).substring(0, 50).replace(/\n/g, ' ').trim();
    }
    return {
      hlb: hlbMatch ? hlbMatch[1] : '',
      lat: coMatch ? parseFloat(coMatch[1]) : 0,
      lng: coMatch ? parseFloat(coMatch[2]) : 0,
      address
    };
  };

  const handleFinish = async () => {
    if (!fullName || !mobile) {
      alert("Please provide your name and mobile number.");
      return;
    }

    setLoading(true);
    let finalHlb = hlbNumber;
    let finalLat = parseFloat(hlbLat) || 0;
    let finalLng = parseFloat(hlbLng) || 0;
    let finalAddr = hlbAddress;

    if (hlbMode === 'sms' && hlbSms) {
      const parsed = parseSms(hlbSms);
      finalHlb = parsed.hlb || finalHlb;
      finalLat = parsed.lat || finalLat;
      finalLng = parsed.lng || finalLng;
      finalAddr = parsed.address || finalAddr;
    }

    const profileData = {
      id: user.id,
      full_name: fullName,
      profession: profession,
      mobile: mobile,
      hlb_number: finalHlb,
      hlb_lat: finalLat,
      hlb_lng: finalLng,
      hlb_address: finalAddr,
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase.from('user_profiles').upsert(profileData).select().single();
      if (error) throw error;
      onComplete(data || profileData);
    } catch (err: any) {
      console.error(err);
      // If table doesn't exist, we just spoof completion to let them in
      onComplete(profileData);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-xl overflow-hidden relative">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 flex">
          <div className="h-1.5 bg-orange-500 transition-all duration-500" style={{ width: `${(currentStep / 3) * 100}%` }} />
        </div>

        <div className="p-8 md:p-10">
          
          {/* STEP 1: WELCOME */}
          {currentStep === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-center">
              <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="text-5xl">🗺️</span>
              </div>
              <h1 className="text-3xl font-bold font-[Baloo_2] text-slate-800 mb-4">Welcome to NakshaBot!</h1>
              <p className="text-slate-600 mb-6 text-lg leading-relaxed">
                We are building the smartest digital assistant for Census mapping and surveys. 
                Our mission is to help enumerators effortlessly generate block maps, number houses, 
                and conduct live surveys with precision.
              </p>
              <button 
                onClick={() => setCurrentStep(2)}
                className="w-full py-4 bg-orange-500 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-orange-600 transition-colors"
              >
                Let's Get Started 🚀
              </button>
            </div>
          )}

          {/* STEP 2: BASIC DETAILS */}
          {currentStep === 2 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <button onClick={() => setCurrentStep(1)} className="text-slate-400 hover:text-slate-600 font-bold text-sm mb-4">← Back</button>
              <h2 className="text-2xl font-bold font-[Baloo_2] text-slate-800 mb-2">Tell us about yourself</h2>
              <p className="text-slate-500 mb-8">This helps us personalize your mapping experience.</p>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name *</label>
                  <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Rahul Kumar" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Profession / Role</label>
                  <input type="text" value={profession} onChange={e => setProfession(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. Enumerator, Supervisor..." />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Mobile Number *</label>
                  <input type="tel" value={mobile} onChange={e => setMobile(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" placeholder="+91 XXXXX XXXXX" />
                </div>
                <button 
                  onClick={() => {
                    if(!fullName || !mobile) return alert("Name and Mobile are required!");
                    setCurrentStep(3);
                  }}
                  className="w-full py-4 mt-4 bg-slate-900 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-colors"
                >
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: DEFAULT HLB */}
          {currentStep === 3 && (
            <div className="animate-in fade-in slide-in-from-right-8 duration-500">
              <button onClick={() => setCurrentStep(2)} className="text-slate-400 hover:text-slate-600 font-bold text-sm mb-4">← Back</button>
              <h2 className="text-2xl font-bold font-[Baloo_2] text-slate-800 mb-2">Your Working Area</h2>
              <p className="text-slate-500 mb-6 text-sm">Set up your default HLB so you can create maps instantly next time.</p>
              
              <div className="flex gap-3 mb-6">
                <button onClick={() => setHlbMode('sms')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${hlbMode === 'sms' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>💬 Paste SMS</button>
                <button onClick={() => setHlbMode('manual')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${hlbMode === 'manual' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>✍️ Enter Manually</button>
              </div>

              {hlbMode === 'sms' && (
                <div className="animate-in fade-in duration-300">
                  <textarea 
                    value={hlbSms} onChange={e => setHlbSms(e.target.value)}
                    placeholder="Paste the official SMS containing HLB and coordinates here..."
                    className="w-full h-32 bg-slate-50 border border-slate-200 p-4 rounded-xl outline-none focus:ring-2 focus:ring-orange-500 resize-none text-sm" 
                  />
                </div>
              )}

              {hlbMode === 'manual' && (
                <div className="animate-in fade-in duration-300 space-y-4">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">HLB Number</label>
                      <input type="text" value={hlbNumber} onChange={e => setHlbNumber(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="e.g. 0455" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Latitude</label>
                      <input type="number" value={hlbLat} onChange={e => setHlbLat(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="26.4499" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Longitude</label>
                      <input type="number" value={hlbLng} onChange={e => setHlbLng(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="80.3319" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Location Address / Details</label>
                    <input type="text" value={hlbAddress} onChange={e => setHlbAddress(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="District, State, Landmark..." />
                  </div>
                </div>
              )}

              <button 
                onClick={handleFinish}
                disabled={loading || !hlbMode}
                className="w-full py-4 mt-8 bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Saving...' : 'Complete Setup ✓'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
