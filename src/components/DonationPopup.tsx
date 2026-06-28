import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMute24h: () => void;
  isPrintArea: boolean;
}

export default function DonationPopup({ isOpen, onClose, onMute24h, isPrintArea }: Props) {
  const [isHindi, setIsHindi] = useState(true);
  const [customAmount, setCustomAmount] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [generatedPayment, setGeneratedPayment] = useState<{
    amount: string;
    note: string;
    upiUrl: string;
    qrCodeUrl: string;
    expiresAt: number;
  } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300);

  useEffect(() => {
    if (!generatedPayment) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.round((generatedPayment.expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [generatedPayment]);

  if (!isOpen) return null;

  const fixedAmounts = [50, 100, 500, 1000, 2000, 5000, 10000];

  const handleGeneratePayment = async (amountStr: string, noteStr: string) => {
    const amt = parseFloat(amountStr);
    if (isNaN(amt) || amt <= 0) {
      alert(isHindi ? 'कृपया मान्य राशि दर्ज करें' : 'Please enter a valid amount');
      return;
    }

    const defaultNote = isHindi 
      ? 'स्कूल फीस और स्टेशनरी मदद' 
      : 'School fees & stationery help';
    const finalNote = noteStr.trim() || defaultNote;

    const upiUrl = `upi://pay?pa=8318810984-1@nyes&pn=NakshaBot&cu=INR&am=${amt}&tn=${encodeURIComponent(finalNote)}`;
    const redirectUrl = `https://examsetu.dev/pay?am=${amt}&tn=${encodeURIComponent(finalNote)}`;
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(redirectUrl)}&margin=10`;

    setGeneratedPayment({
      amount: String(amt),
      note: finalNote,
      upiUrl,
      qrCodeUrl,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    setTimeLeft(300);

    // Save intent to DB (persistent)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('donations').insert({
        amount: amt,
        name: finalNote,
        note: finalNote,
        user_id: user?.id || null
      });
    } catch (err) {
      console.error('Error saving donation intent to DB:', err);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGeneratePayment(customAmount, customNote);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-[4000] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden my-8 transition-all animate-in fade-in zoom-in duration-200">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-6 py-5 text-white text-center relative">
          <button 
            onClick={onClose}
            className="absolute top-3 right-4 text-white/70 hover:text-white text-xl font-bold leading-none"
            aria-label="Close"
            style={{ minHeight: 'auto' }}
          >
            ×
          </button>
          <div className="text-4xl mb-2">🙏</div>
          {isHindi ? (
            <>
              <h3 className="text-xl font-black font-[Baloo_2] tracking-wide">स्कूल फीस और पढ़ाई में मदद की अपील</h3>
              <p className="text-xs text-white/90 mt-1">अकेले छात्र ने बनाया (Solo Student Developer)</p>
            </>
          ) : (
            <>
              <h3 className="text-xl font-black font-[Baloo_2] tracking-wide">Appeal for School Fees & Study Help</h3>
              <p className="text-xs text-white/90 mt-1">Built solo by a student developer</p>
            </>
          )}
        </div>

        {/* Content Section */}
        <div className="px-6 py-4 text-sm text-slate-700 space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {isHindi ? (
            <>
              <p className="leading-relaxed">
                मैं एक <strong>अकेला विद्यार्थी</strong> हूँ जिसने यह NakshaBot ऐप खुद बनाया है। मुझे अपनी **स्कूल/कॉलेज की फीस** और **पढ़ाई की स्टेशनरी (बुक्स, पेन)** के खर्चों के लिए आपकी मदद की जरूरत है।
              </p>
              <p className="leading-relaxed">
                नक्शा बनाने में cyber café में <strong>₹50–100</strong> का खर्च होता। NakshaBot ने यह मुफ्त किया। अगर आपको यह उपयोगी लगा, तो कृपया मुझे अपनी पढ़ाई जारी रखने में सहायता करें।
              </p>
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-500 rounded-r-xl p-3.5 my-2.5">
                <p className="text-orange-950 text-xs font-bold leading-relaxed">
                  📢 "आपकी छोटी-छोटी मदद से किसी की बहुत बड़ी मदद हो सकती है, थोड़ा सा दिल बड़ा करके एक छात्र के सपनों को सहारा दें।"
                </p>
              </div>
            </>
          ) : (
            <>
              <p className="leading-relaxed">
                I am a <strong>student developer who built this app solo</strong>. I need your help to support my **school/college fees** and **stationery (books, pens)** to continue my education.
              </p>
              <p className="leading-relaxed">
                Cyber cafés charge <strong>₹50–100</strong> for a map. NakshaBot did it instantly for free. If this app helped you, please contribute toward my studies.
              </p>
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-orange-500 rounded-r-xl p-3.5 my-2.5">
                <p className="text-orange-950 text-xs font-bold leading-relaxed">
                  📢 "Your small contributions can provide huge support to someone in need. Open your heart a little to help a student's dreams come true."
                </p>
              </div>
            </>
          )}

          {/* Language Toggle Button */}
          <button 
            onClick={() => setIsHindi(!isHindi)}
            className="w-full py-1.5 text-[11px] text-slate-400 font-semibold border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors"
            style={{ minHeight: '32px' }}
          >
            {isHindi ? 'Read in English →' : 'हिंदी में पढ़ें →'}
          </button>

          {/* Dynamic Payment State Panel */}
          {generatedPayment ? (
            <div className="space-y-4 pt-3 border-t border-slate-100 text-center animate-in fade-in slide-in-from-bottom-2 duration-200">
              <div className="bg-orange-50/70 border border-orange-100/80 rounded-2xl p-4 flex flex-col items-center">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-0.5">
                  {isHindi ? 'भुगतान की राशि' : 'Contribution Amount'}
                </span>
                <span className="text-3xl font-black text-orange-500 font-mono">₹{generatedPayment.amount}</span>
                {generatedPayment.note && (
                  <span className="text-xs text-slate-500 mt-1 italic font-medium">
                    "{generatedPayment.note}"
                  </span>
                )}
              </div>

              {timeLeft > 0 ? (
                <div className="flex flex-col items-center gap-3.5">
                  {/* QR Code Container */}
                  <div className="bg-white p-3 rounded-3xl border border-slate-200 shadow-sm relative">
                    <img 
                      src={generatedPayment.qrCodeUrl} 
                      alt="UPI QR Code" 
                      className="w-48 h-48 rounded-xl"
                    />
                  </div>

                  {/* Countdown Timer */}
                  <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5 bg-slate-100 px-4 py-1.5 rounded-full font-mono shadow-sm">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                    <span>
                      {isHindi 
                        ? `QR कोड सक्रिय (समय शेष: ${formatTime(timeLeft)})` 
                        : `QR Code Active (Expires in: ${formatTime(timeLeft)})`}
                    </span>
                  </div>

                  {/* Payment Button or No-App Warning */}
                  {isMobile ? (
                    <a
                      href={generatedPayment.upiUrl}
                      className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-black text-sm rounded-2xl shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      📱 {isHindi ? 'UPI ऐप से भुगतान करें' : 'Pay via UPI App'}
                    </a>
                  ) : (
                    <div className="w-full p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-[11px] text-rose-800 font-semibold leading-relaxed">
                      ⚠️ {isHindi 
                        ? 'डेस्कटॉप पर कोई UPI ऐप नहीं मिला (No UPI App Available)। कृपया अपने मोबाइल से ऊपर दिए गए QR कोड को स्कैन करके भुगतान करें।' 
                        : 'No UPI apps available on desktop. Please scan the QR code above using any UPI app on your phone.'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="text-4xl animate-bounce">⏰</div>
                  <p className="text-sm font-black text-rose-500">
                    {isHindi ? 'QR कोड की समय सीमा समाप्त (Expired)' : 'QR Code has expired'}
                  </p>
                  <button
                    onClick={() => handleGeneratePayment(generatedPayment.amount, generatedPayment.note)}
                    className="px-6 py-2.5 bg-orange-500 text-white font-black text-xs rounded-xl hover:bg-orange-600 transition-colors shadow-md active:scale-95"
                  >
                    🔄 {isHindi ? 'नया QR कोड जेनरेट करें' : 'Regenerate QR Code'}
                  </button>
                </div>
              )}

              <button
                onClick={() => setGeneratedPayment(null)}
                className="w-full py-2 text-slate-400 hover:text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                ← {isHindi ? 'दूसरी राशि चुनें' : 'Choose different amount'}
              </button>
            </div>
          ) : (
            <>
              {/* Static Quick Scan Option */}
              <div className="flex flex-col items-center justify-center p-3.5 bg-slate-50 rounded-2xl border border-slate-100/80">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  {isHindi ? 'त्वरित स्कैन (Scan for Quick Pay)' : 'Scan for Quick Pay'}
                </p>
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent('https://examsetu.dev/pay')}&margin=10`}
                  alt="UPI QR Code" 
                  className="w-44 h-auto rounded-2xl border border-slate-200/80 shadow-sm hover:scale-[1.02] transition-transform duration-200" 
                />
              </div>

              {/* Fixed Amount Selection */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {isHindi ? 'मदद के लिए राशि चुनें (Select Support Amount)' : 'Choose support amount'}
                </p>
                <div className="grid grid-cols-4 gap-1.5">
                  {fixedAmounts.map(amt => {
                    const isSelected = customAmount === String(amt);
                    return (
                      <button
                        type="button"
                        key={amt}
                        onClick={() => setCustomAmount(String(amt))}
                        className={`py-2.5 text-center font-bold text-xs rounded-xl active:scale-95 transition-all flex items-center justify-center gap-0.5 ${
                          isSelected
                            ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
                            : 'bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100'
                        }`}
                        style={{ minHeight: '38px' }}
                      >
                        ₹{amt}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount Form */}
              <form onSubmit={handleFormSubmit} className="space-y-2 pt-2 border-t border-slate-100">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  {isHindi ? 'या अन्य राशि और संदेश लिखें (Or enter other amount & note)' : 'Or custom amount & message'}
                </p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    placeholder={isHindi ? 'राशि ₹ (Amount)' : 'Amount ₹'}
                    className="w-1/3 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 font-bold text-slate-800"
                    min="1"
                    required
                  />
                  <input
                    type="text"
                    value={customNote}
                    onChange={e => setCustomNote(e.target.value)}
                    placeholder={isHindi ? 'अपना नाम / संदेश (Your Name/Msg)' : 'Your Name / Message'}
                    className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 text-slate-800"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-black text-sm rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                  style={{ minHeight: '44px' }}
                >
                  🚀 {isHindi ? 'UPI QR कोड जेनरेट करें' : 'Generate UPI QR Code'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-1 border-t border-slate-50 bg-slate-50/50 flex flex-col items-center gap-1.5">
          <p className="text-center text-[10px] text-slate-400 font-medium font-mono">UPI: 8318810984-1@nyes</p>
          {isPrintArea ? (
            <button 
              onClick={onClose}
              className="w-full py-2 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-100 transition-colors"
              style={{ minHeight: '36px' }}
            >
              {isHindi ? 'बाद में' : 'Maybe later'}
            </button>
          ) : (
            <button 
              onClick={onMute24h}
              className="w-full py-2 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-100 transition-colors"
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
