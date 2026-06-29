import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { load } from '@cashfreepayments/cashfree-js';

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
  const [copiedText, setCopiedText] = useState<'upi' | 'phone' | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  const handleCopy = (text: string, type: 'upi' | 'phone') => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedText(type);
      setTimeout(() => setCopiedText(null), 1500);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
    }
  };

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

    setLoadingPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // 1. Save unpaid intent to DB to get a unique donation id
      const { data: don, error: donErr } = await supabase
        .from('donations')
        .insert({
          amount: amt,
          name: finalNote,
          note: finalNote,
          user_id: user?.id || null,
          payment_status: 'unpaid'
        })
        .select('id')
        .single();

      if (donErr || !don) {
        throw new Error(donErr?.message || 'Failed to create donation intent');
      }

      // 2. Invoke create-cashfree-payment edge function
      const { data: cfRes, error: cfErr } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { kind: 'donation', projectId: don.id }
      });

      if (cfErr || !cfRes?.paymentSessionId) {
        throw new Error(cfErr?.message || 'Failed to initiate Cashfree checkout session');
      }

      // 3. Load Cashfree JS SDK and checkout
      const cashfree = await load({
        mode: import.meta.env.VITE_CASHFREE_MODE === 'production' ? 'production' : 'sandbox'
      });

      if (cashfree) {
        await cashfree.checkout({ 
          paymentSessionId: cfRes.paymentSessionId, 
          redirectTarget: '_self' 
        });
      } else {
        throw new Error('Cashfree SDK failed to load');
      }
    } catch (err: any) {
      console.error(err);
      alert(isHindi 
        ? 'भुगतान शुरू करने में त्रुटि: ' + err.message 
        : 'Error starting payment: ' + err.message
      );
    } finally {
      setLoadingPayment(false);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGeneratePayment(customAmount, customNote);
  };

  return (
    <div className="fixed inset-0 z-[4000] bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden my-8 transition-all animate-in fade-in zoom-in duration-200">
        {/* Header Section */}
        <div className="bg-gradient-to-br from-orange-500 to-amber-500 px-6 py-5 text-white text-center relative">
          <button 
            onClick={onClose}
            disabled={loadingPayment}
            className="absolute top-3 right-4 text-white/70 hover:text-white text-xl font-bold leading-none disabled:opacity-50"
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
            type="button"
            disabled={loadingPayment}
            onClick={() => setIsHindi(!isHindi)}
            className="w-full py-1.5 text-[11px] text-slate-400 font-semibold border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            style={{ minHeight: '32px' }}
          >
            {isHindi ? 'Read in English →' : 'हिंदी में पढ़ें →'}
          </button>

          {/* Static Quick Scan Option */}
          <div className="flex flex-col items-center justify-center p-3.5 bg-slate-50 rounded-2xl border border-slate-100/80">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              {isHindi ? 'त्वरित स्कैन (Scan for Quick Pay)' : 'Scan for Quick Pay'}
            </p>
            <img 
              src="/images/donation_qr.jpg" 
              alt="UPI QR Code" 
              className="w-44 h-auto rounded-2xl border border-slate-200/80 shadow-sm hover:scale-[1.02] transition-transform duration-200" 
              onError={(e) => { (e.target as any).style.display = 'none'; }}
            />
          </div>

          {/* Fixed Amount Selection */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {isHindi ? 'मदद के लिए राशि चुनें (Select Support Amount)' : 'Choose support amount'}
            </p>
            <div className="grid grid-cols-4 gap-1.5 font-jetbrains-mono">
              {fixedAmounts.map(amt => {
                const isSelected = customAmount === String(amt);
                return (
                  <button
                    type="button"
                    key={amt}
                    disabled={loadingPayment}
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
                disabled={loadingPayment}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder={isHindi ? 'राशि ₹ (Amount)' : 'Amount ₹'}
                className="w-1/3 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 font-bold text-slate-800"
                min="1"
                required
              />
              <input
                type="text"
                value={customNote}
                disabled={loadingPayment}
                onChange={e => setCustomNote(e.target.value)}
                placeholder={isHindi ? 'अपना नाम / संदेश (Your Name/Msg)' : 'Your Name / Message'}
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-orange-400 text-slate-800"
              />
            </div>
            <button
              type="submit"
              disabled={loadingPayment}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-center font-black text-sm rounded-xl shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              style={{ minHeight: '44px' }}
            >
              {loadingPayment ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>🚀 {isHindi ? 'सुरक्षित भुगतान करें (Pay Securely)' : 'Pay Securely via Cashfree'}</>
              )}
            </button>
          </form>

          {/* Backup Manual Payment Methods (inside form scroll area) */}
          <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-2 text-left">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
              {isHindi ? '⚠️ ऑनलाइन भुगतान विफल होने पर बैकअप विकल्प' : '⚠️ Manual Pay Option (If Gateway Fails)'}
            </p>
            <div className="flex flex-col gap-1.5 text-xs font-mono">
              <div className="flex justify-between items-center bg-white px-3 py-1.5 rounded-xl border border-slate-100/60 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400">UPI ID</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 font-bold select-all text-[11px]">8318810984-1@nyes</span>
                  <button
                    type="button"
                    disabled={loadingPayment}
                    onClick={() => handleCopy('8318810984-1@nyes', 'upi')}
                    className="text-[9px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {copiedText === 'upi' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center bg-white px-3 py-1.5 rounded-xl border border-slate-100/60 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400">PHONE</span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-700 font-bold select-all text-[11px]">8318810984</span>
                  <button
                    type="button"
                    disabled={loadingPayment}
                    onClick={() => handleCopy('8318810984', 'phone')}
                    className="text-[9px] bg-orange-500 hover:bg-orange-600 text-white font-bold px-2 py-1 rounded-lg transition-colors cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    {copiedText === 'phone' ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-6 pb-5 pt-2.5 border-t border-slate-50 bg-slate-50/50 flex flex-col items-center gap-2">
          <p className="text-center text-[10px] text-slate-400 font-medium font-mono">UPI: 8318810984-1@nyes</p>
          {isPrintArea ? (
            <button 
              type="button"
              onClick={onClose}
              disabled={loadingPayment}
              className="w-full py-2 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
              style={{ minHeight: '36px' }}
            >
              {isHindi ? 'बाद में' : 'Maybe later'}
            </button>
          ) : (
            <button 
              type="button"
              onClick={onMute24h}
              disabled={loadingPayment}
              className="w-full py-2 text-slate-500 text-xs font-semibold rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50"
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
