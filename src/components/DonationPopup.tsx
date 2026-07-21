import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { load } from '@cashfreepayments/cashfree-js';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';

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

      const { data: cfRes, error: cfErr } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { kind: 'donation', projectId: don.id }
      });

      if (cfErr || !cfRes?.paymentSessionId) {
        throw new Error(cfErr?.message || 'Failed to initiate Cashfree checkout session');
      }

      const cashfree = await load({
        mode: (cfRes.cashfreeMode === 'production') ? 'production' : 'sandbox'
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

  const upiLink = `upi://pay?pa=8318810984-1@nyes&pn=NakshaBot&am=${customAmount || '50'}&cu=INR&tn=${encodeURIComponent(customNote || 'Donation')}`;

  const headerTitle = (
    <div className="flex items-center gap-2">
      <span className="text-xl" role="img" aria-label="hands folded">🙏</span>
      <div>
        <h3 className="text-base font-bold text-[var(--color-ink)] font-public-sans tracking-tight leading-tight">
          {isHindi ? 'स्कूल फीस और पढ़ाई में मदद की अपील' : 'Appeal for School Fees & Study Help'}
        </h3>
        <p className="text-[11px] text-[var(--color-ink-secondary)] font-normal">
          {isHindi ? 'अकेले छात्र ने बनाया (Solo Student Developer)' : 'Built solo by a student developer'}
        </p>
      </div>
    </div>
  );

  return (
    <Sheet open={isOpen} onClose={onClose} title={headerTitle} maxWidth="md">
      <div className="space-y-4 text-sm text-[var(--color-ink)]">
        {isHindi ? (
          <>
            <p className="leading-relaxed text-xs sm:text-sm">
              मैं एक <strong>अकेला विद्यार्थी</strong> हूँ जिसने यह NakshaBot ऐप खुद बनाया है। मुझे अपनी **स्कूल/कॉलेज की फीस** और **पढ़ाई की स्टेशनरी (बुक्स, पेन)** के खर्चों के लिए आपकी मदद की जरूरत है।
            </p>
            <p className="leading-relaxed text-xs sm:text-sm">
              नक्शा बनाने में cyber café में <strong>₹50–100</strong> का खर्च होता। NakshaBot ने यह मुफ्त किया। अगर आपको यह उपयोगी लगा, तो कृपया मुझे अपनी पढ़ाई जारी रखने में सहायता करें।
            </p>
            <div className="bg-[var(--color-accent-tint)] border-l-4 border-[var(--color-accent)] rounded-r-[var(--radius-md)] p-3 my-2">
              <p className="text-[var(--color-accent)] text-xs font-bold leading-relaxed">
                📢 "आपकी छोटी-छोटी मदद से किसी की बहुत बड़ी मदद हो सकती है, थोड़ा सा दिल बड़ा करके एक छात्र के सपनों को सहारा दें।"
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-xs sm:text-sm">
              I am a <strong>student developer who built this app solo</strong>. I need your help to support my **school/college fees** and **stationery (books, pens)** to continue my education.
            </p>
            <p className="leading-relaxed text-xs sm:text-sm">
              Cyber cafés charge <strong>₹50–100</strong> for a map. NakshaBot did it instantly for free. If this app helped you, please contribute toward my studies.
            </p>
            <div className="bg-[var(--color-accent-tint)] border-l-4 border-[var(--color-accent)] rounded-r-[var(--radius-md)] p-3 my-2">
              <p className="text-[var(--color-accent)] text-xs font-bold leading-relaxed">
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
          className="w-full py-1.5 text-xs text-[var(--color-accent)] font-semibold border border-[var(--color-hairline)] rounded-[var(--radius-md)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isHindi ? 'Read in English →' : 'हिंदी में पढ़ें →'}
        </button>

        {/* Static Quick Scan Option */}
        <div className="flex flex-col items-center justify-center p-3.5 bg-[var(--color-surface-2)] rounded-[var(--radius-lg)] border border-[var(--color-hairline)]">
          <p className="text-[11px] font-bold text-[var(--color-ink-secondary)] uppercase tracking-wider mb-2">
            {isHindi ? 'त्वरित स्कैन (Scan for Quick Pay)' : 'Scan for Quick Pay'}
          </p>
          <img 
            src="/images/donation_qr.jpg" 
            alt="UPI QR Code" 
            className="w-40 h-auto rounded-[var(--radius-md)] border border-[var(--color-hairline)] shadow-[var(--shadow-sm)]" 
            onError={(e) => { (e.target as any).style.display = 'none'; }}
          />
        </div>

        {/* Fixed Amount Selection */}
        <div className="space-y-2 pt-2 border-t border-[var(--color-hairline)]">
          <p className="text-[11px] font-bold text-[var(--color-ink-secondary)] uppercase tracking-wider">
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
                  className={`py-2 text-center font-bold text-xs rounded-[var(--radius-md)] transition-all flex items-center justify-center gap-0.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--color-accent)] text-white shadow-sm'
                      : 'bg-[var(--color-surface-2)] border border-[var(--color-hairline)] text-[var(--color-ink)] hover:bg-indigo-50'
                  }`}
                >
                  ₹{amt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Amount Form */}
        <form onSubmit={handleFormSubmit} className="space-y-2 pt-2 border-t border-[var(--color-hairline)]">
          <p className="text-[11px] font-bold text-[var(--color-ink-secondary)] uppercase tracking-wider">
            {isHindi ? 'या अन्य राशि और संदेश लिखें' : 'Or custom amount & message'}
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              value={customAmount}
              disabled={loadingPayment}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder={isHindi ? 'राशि ₹' : 'Amount ₹'}
              className="w-1/3 px-3 py-2 text-sm border border-[var(--color-hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-bold text-[var(--color-ink)]"
              min="1"
              required
            />
            <input
              type="text"
              value={customNote}
              disabled={loadingPayment}
              onChange={e => setCustomNote(e.target.value)}
              placeholder={isHindi ? 'अपना नाम / संदेश' : 'Your Name / Message'}
              className="flex-1 px-3 py-2 text-sm border border-[var(--color-hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-[var(--color-ink)]"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <a
              href={upiLink}
              className="flex-1 py-3 bg-[var(--color-success)] hover:opacity-90 text-white text-center font-bold text-xs rounded-[var(--radius-md)] shadow-sm transition-all flex items-center justify-center gap-1.5 min-h-[44px]"
            >
              📱 {isHindi ? 'UPI ऐप से भुगतान' : 'Pay via UPI App'}
            </a>
            <Button
              type="submit"
              variant="filled"
              disabled={loadingPayment}
              className="flex-1 min-h-[44px] text-xs font-bold"
            >
              {loadingPayment ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>💳 {isHindi ? 'कैशफ्री गेटवे' : 'Pay via Cashfree'}</>
              )}
            </Button>
          </div>
        </form>

        {/* Backup Manual Payment Methods */}
        <div className="w-full bg-[var(--color-surface-2)] border border-[var(--color-hairline)] rounded-[var(--radius-lg)] p-3 space-y-2 text-left">
          <p className="text-[10px] font-bold text-[var(--color-ink-secondary)] uppercase tracking-widest text-center">
            {isHindi ? '⚠️ ऑनलाइन भुगतान विफल होने पर बैकअप विकल्प' : '⚠️ Manual Pay Option (If Gateway Fails)'}
          </p>
          <div className="flex flex-col gap-1.5 text-xs font-jetbrains-mono">
            <div className="flex justify-between items-center bg-[var(--color-surface)] px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-hairline)]">
              <span className="text-[10px] font-bold text-[var(--color-ink-tertiary)]">UPI ID</span>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-ink)] font-bold select-all text-[11px]">8318810984-1@nyes</span>
                <button
                  type="button"
                  disabled={loadingPayment}
                  onClick={() => handleCopy('8318810984-1@nyes', 'upi')}
                  className="text-[10px] bg-[var(--color-accent-tint)] text-[var(--color-accent)] font-bold px-2 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {copiedText === 'upi' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <div className="flex justify-between items-center bg-[var(--color-surface)] px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-hairline)]">
              <span className="text-[10px] font-bold text-[var(--color-ink-tertiary)]">PHONE</span>
              <div className="flex items-center gap-2">
                <span className="text-[var(--color-ink)] font-bold select-all text-[11px]">8318810984</span>
                <button
                  type="button"
                  disabled={loadingPayment}
                  onClick={() => handleCopy('8318810984', 'phone')}
                  className="text-[10px] bg-[var(--color-accent-tint)] text-[var(--color-accent)] font-bold px-2 py-1 rounded-[var(--radius-sm)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {copiedText === 'phone' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-[var(--color-hairline)] flex flex-col items-center gap-2">
          {isPrintArea ? (
            <button 
              type="button"
              onClick={onClose}
              disabled={loadingPayment}
              className="w-full py-2 text-[var(--color-ink-secondary)] text-xs font-semibold rounded-[var(--radius-md)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isHindi ? 'बाद में' : 'Maybe later'}
            </button>
          ) : (
            <button 
              type="button"
              onClick={onMute24h}
              disabled={loadingPayment}
              className="w-full py-2 text-[var(--color-ink-secondary)] text-xs font-semibold rounded-[var(--radius-md)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {isHindi ? '24 घंटे के लिए बंद करें (Mute)' : 'Mute for 24 hours'}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
