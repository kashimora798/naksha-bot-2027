import { useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMute24h: () => void;
  isPrintArea: boolean;
}

export default function DonationPopup({ isOpen, onClose, onMute24h, isPrintArea }: Props) {
  const [isHindi, setIsHindi] = useState(true);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-6 py-6 text-white text-center relative">
          <button 
            onClick={onClose}
            className="absolute top-3 right-4 text-white/60 hover:text-white text-xl font-bold leading-none"
            aria-label="Close"
            style={{ minHeight: 'auto' }}
          >
            ×
          </button>
          <div className="text-4xl mb-2">🙏</div>
          {isHindi ? (
            <>
              <h3 className="text-xl font-black font-[Baloo_2]">NakshaBot बिल्कुल मुफ्त है</h3>
              <p className="text-sm text-white/85 mt-1">एक छात्र ने अकेले बनाया</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-black font-[Baloo_2]">NakshaBot is 100% Free</h3>
              <p className="text-sm text-white/85 mt-1">Built solo by a student</p>
            </>
          )}
        </div>

        {/* Content Section */}
        <div className="px-6 py-5 text-sm text-slate-700 space-y-3">
          {isHindi ? (
            <>
              <p className="leading-relaxed">
                मैं एक <strong>अकेला विद्यार्थी</strong> हूँ जिसने यह पूरा ऐप खुद बनाया है — बिना किसी टीम के, बिना किसी फंडिंग के।
              </p>
              <p className="leading-relaxed">
                जो नक्शा आपने अभी बनाया, उसे हाथ से बनाने में <strong>3–4 घंटे</strong> लगते और cyber café में <strong>₹50–100</strong> का खर्च होता। NakshaBot ने यह मिनटों में किया — बिल्कुल मुफ्त।
              </p>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                <p className="text-xs text-orange-800 font-semibold">सर्वर खर्च असली है। ₹10 भी बहुत मदद करता है।</p>
                <p className="text-[11px] text-orange-600 mt-0.5">हर रुपया इसे सबके लिए मुफ्त रखने में जाता है।</p>
              </div>
            </>
          ) : (
            <>
              <p className="leading-relaxed">
                I am a <strong>student who built this entire app solo</strong> — no team, no funding, no company behind it.
              </p>
              <p className="leading-relaxed">
                The map you just made would take <strong>3–4 hours by hand</strong> and cost <strong>₹50–100</strong> at a cyber café. NakshaBot did it in minutes — completely free.
              </p>
              <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                <p className="text-xs text-orange-800 font-semibold">Server costs are real. Even ₹10 helps a lot.</p>
                <p className="text-[11px] text-orange-600 mt-0.5">Every rupee goes toward keeping it free for everyone.</p>
              </div>
            </>
          )}

          {/* Language Toggle Button */}
          <button 
            onClick={() => setIsHindi(!isHindi)}
            className="w-full py-1.5 text-[11px] text-slate-400 font-medium border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
            style={{ minHeight: '32px' }}
          >
            {isHindi ? 'Read in English →' : 'हिंदी में पढ़ें →'}
          </button>
        </div>

        {/* Action Buttons Section */}
        <div className="px-6 pb-6 space-y-2">
          <a 
            href="upi://pay?pa=8318810984-1@nyes&amp;pn=NakshaBot&amp;cu=INR" 
            className="block w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-black text-sm rounded-2xl shadow-lg active:scale-[0.98] transition-all"
            target="_blank"
            rel="noopener noreferrer"
            style={{ minHeight: '48px', lineHeight: '48px', padding: '0 16px' }}
          >
            {isHindi ? 'UPI से Donate करें' : 'Donate via UPI'}
          </a>
          <p className="text-center text-[10px] text-slate-400">UPI: 8318810984-1@nyes</p>
          
          {isPrintArea ? (
            <button 
              onClick={onClose}
              className="w-full py-2 text-slate-400 text-xs font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ minHeight: '36px' }}
            >
              {isHindi ? 'बाद में' : 'Maybe later'}
            </button>
          ) : (
            <button 
              onClick={onMute24h}
              className="w-full py-2 text-slate-400 text-xs font-medium rounded-xl hover:bg-slate-50 transition-colors"
              style={{ minHeight: '36px' }}
            >
              {isHindi ? '24 घंटे के लिए बंद करें (Mute)' : 'Mute for 24 hours'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
