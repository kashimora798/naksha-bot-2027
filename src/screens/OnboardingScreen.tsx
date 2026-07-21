import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { isValidPhoneNumber } from 'libphonenumber-js';

interface Props {
  user: any;
  onComplete: (profile: any) => void;
}

export default function OnboardingScreen({ user, onComplete }: Props) {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Profile data (initialize from localStorage if available)
  const [fullName, setFullName] = useState(() => localStorage.getItem('onb_name') || user?.user_metadata?.full_name || '');
  const [profession, setProfession] = useState(() => localStorage.getItem('onb_prof') || '');
  const [mobile, setMobile] = useState(() => localStorage.getItem('onb_mobile') || '');
  const [mobileVerified, setMobileVerified] = useState(false);
  const [mobileError, setMobileError] = useState('');

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('onb_name', fullName);
    localStorage.setItem('onb_prof', profession);
    localStorage.setItem('onb_mobile', mobile);
  }, [fullName, profession, mobile]);
  

  // HLB Option
  const [hlbMode, setHlbMode] = useState<'sms' | 'manual' | null>(null);
  const [hlbSms, setHlbSms] = useState('');
  
  // Manual HLB details
  const [hlbNumber, setHlbNumber] = useState('');
  const [hlbLat, setHlbLat] = useState('');
  const [hlbLng, setHlbLng] = useState('');
  const [hlbAddress, setHlbAddress] = useState('');

  // Census layout-map title-block particulars (Phase 2)
  const [tehsil, setTehsil] = useState('');
  const [townVillage, setTownVillage] = useState('');
  const [wardNo, setWardNo] = useState('');
  const [ebNo, setEbNo] = useState('');
  const [supervisorName, setSupervisorName] = useState('');

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

    if (!isValidPhoneNumber(mobile, 'IN')) {
      setMobileError('Please enter a valid 10-digit Indian mobile number.');
      alert("Invalid Mobile Number! Please ensure you enter a valid Indian number.");
      return;
    }

    setLoading(true);
    setSaveError('');
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
      tehsil: tehsil || null,
      town_village: townVillage || null,
      ward_no: wardNo || null,
      eb_no: ebNo || null,
      supervisor_name: supervisorName || null,
      is_mobile_verified: mobileVerified,
      onboarding_completed: true,
      updated_at: new Date().toISOString()
    };

    try {
      const { data, error } = await supabase.from('user_profiles').upsert(profileData).select().single();
      if (error) throw error;
      localStorage.removeItem('onb_name');
      localStorage.removeItem('onb_prof');
      localStorage.removeItem('onb_mobile');
      onComplete(data || profileData);
    } catch (err: any) {
      console.error('Onboarding save failed:', err);
      // Surface the failure instead of silently pretending it saved — otherwise
      // the user's details are lost without them knowing. They can retry.
      setSaveError(
        err?.message
          ? `Could not save your details: ${err.message}. Please check your connection and try again.`
          : 'Could not save your details. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
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
              <h1 className="text-3xl font-bold font-public-sans text-slate-800 mb-4">Welcome to NakshaBot!</h1>
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
              <h2 className="text-2xl font-bold font-public-sans text-slate-800 mb-2">Tell us about yourself</h2>
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
                  <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg mb-3">
                    <p className="text-sm text-orange-800 font-medium">🎁 Note: Verified early users will receive free gifts & premium access in the future! Please provide your exact mobile number.</p>
                  </div>
                  

                  <div className="relative">
                    <span className="absolute left-4 top-4 text-slate-500 font-bold">+91</span>
                    <input 
                      type="tel" 
                      maxLength={10}
                      value={mobile.replace('+91', '')} 
                      onChange={e => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                        setMobile(val ? `+91${val}` : '');
                        setMobileError('');
                      }} 
                      className="w-full bg-slate-50 border border-slate-200 p-4 pl-12 rounded-xl outline-none focus:ring-2 focus:ring-orange-500" 
                      placeholder="10-digit number" 
                    />
                  </div>
                  {mobileError && <p className="text-red-500 text-xs mt-2 font-semibold">{mobileError}</p>}
                </div>
                <button 
                  onClick={() => {
                    if(!fullName || !mobile) return alert("Name and Mobile are required!");
                    if (!isValidPhoneNumber(mobile, 'IN')) return setMobileError('Please enter a valid 10-digit Indian mobile number.');
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
              <h2 className="text-2xl font-bold font-public-sans text-slate-800 mb-2">Your Working Area</h2>
              <p className="text-slate-500 mb-4 text-sm">Set up your default HLB so you can create maps instantly next time. <span className="text-slate-400">(Optional — you can add it later.)</span></p>

              <div className="flex gap-3 mb-3">
                <button onClick={() => setHlbMode(m => m === 'sms' ? null : 'sms')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${hlbMode === 'sms' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>💬 Paste SMS</button>
                <button onClick={() => setHlbMode(m => m === 'manual' ? null : 'manual')} className={`flex-1 py-3 rounded-xl border-2 font-bold text-sm transition-all ${hlbMode === 'manual' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>✍️ Enter Manually</button>
              </div>
              {!hlbMode && (
                <p className="text-xs text-slate-400 mb-6">No HLB yet? Just leave this and press <strong>Complete Setup</strong> — you can add it anytime from your Profile.</p>
              )}
              {hlbMode && <div className="mb-6" />}

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

              {/* Layout Map Details — always shown so the PDF title block is filled
                  regardless of whether the user sets an HLB now. */}
              <div className="mt-5 pt-5 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Layout Map Details (for your PDF title block)</p>
                <p className="text-[11px] text-slate-400 mb-3">Optional — used to fill your map's title block. You can edit these later in Profile.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tehsil / Taluk</label>
                    <input type="text" value={tehsil} onChange={e => setTehsil(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="e.g. Sadar" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Town / Village</label>
                    <input type="text" value={townVillage} onChange={e => setTownVillage(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="e.g. Bajheri" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Ward No.</label>
                    <input type="text" value={wardNo} onChange={e => setWardNo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="e.g. 14" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">EB No. (2011)</label>
                    <input type="text" value={ebNo} onChange={e => setEbNo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="optional" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Supervisor Name</label>
                    <input type="text" value={supervisorName} onChange={e => setSupervisorName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-3 rounded-xl outline-none focus:ring-1 focus:ring-orange-500 text-sm" placeholder="Name of your Supervisor" />
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-3">
                  <p className="text-sm text-red-600 font-semibold">{saveError}</p>
                </div>
              )}

              <button
                onClick={handleFinish}
                disabled={loading}
                className="w-full py-4 mt-6 bg-green-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Saving...' : saveError ? 'Retry & Complete Setup' : hlbMode ? 'Complete Setup ✓' : 'Skip HLB & Complete Setup ✓'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
