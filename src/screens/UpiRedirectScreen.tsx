import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export default function UpiRedirectScreen() {
  const [searchParams] = useSearchParams();
  const amount = searchParams.get('am') || '';
  const note = searchParams.get('tn') || '';

  // Build standard UPI URL manually to ensure strict query parameter parsing
  let upiUrl = `upi://pay?pa=8318810984-1@nyes&pn=NakshaBot&cu=INR`;
  if (amount) {
    upiUrl += `&am=${amount}`;
  }
  if (note) {
    upiUrl += `&tn=${encodeURIComponent(note)}`;
  }

  useEffect(() => {
    // Attempt 1: Direct location redirect
    window.location.href = upiUrl;

    // Attempt 2: Simulated hidden link click (bypass some mobile browser sandbox restrictions)
    try {
      const link = document.createElement('a');
      link.href = upiUrl;
      link.click();
    } catch (e) {
      console.error('Link click redirect failed', e);
    }

    // Attempt 3: Delayed fallback replace
    const timer = setTimeout(() => {
      window.location.replace(upiUrl);
    }, 400);

    return () => clearTimeout(timer);
  }, [upiUrl]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white font-[Outfit]">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="text-5xl mb-4 animate-bounce">🚀</div>
        <h1 className="text-xl font-bold text-orange-400 mb-2">Opening UPI Apps...</h1>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {amount ? (
            <>Opening GPay, PhonePe, Paytm, BHIM, or other UPI apps to pay <strong className="text-white">₹{amount}</strong>.</>
          ) : (
            <>Opening GPay, PhonePe, Paytm, BHIM, or other UPI apps.</>
          )}
        </p>

        {/* Pulse Loader */}
        <div className="flex justify-center items-center gap-1.5 mb-8">
          <span className="w-3.5 h-3.5 rounded-full bg-orange-500 animate-ping"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-orange-500 opacity-75"></span>
          <span className="w-2 h-2 rounded-full bg-orange-500 opacity-50"></span>
        </div>

        {/* Manual Pay Button */}
        <a
          href={upiUrl}
          className="block w-full py-4 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-black text-sm rounded-2xl shadow-lg hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] transition-all mb-4"
        >
          👉 Open UPI Payment App
        </a>

        <div className="bg-slate-950/50 rounded-2xl p-4 border border-slate-800/40 text-xs text-slate-500 space-y-2 text-left">
          <p className="font-bold text-slate-400">Not opening automatically?</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Make sure you are on Android/iOS with a UPI app installed.</li>
            <li>Click the orange button above to launch manually.</li>
            {amount && <li>Ensure you pay the exact amount of ₹{amount}.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
