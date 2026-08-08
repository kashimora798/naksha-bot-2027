import { useState, useEffect } from 'react';
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

// ─── LANGUAGE CONTENT ─────────────────────────────────────────
type LangKey = 'hi' | 'en' | 'bn' | 'ta' | 'as' | 'mni';

interface LangContent {
  label: string;
  title: string;
  subtitle: string;
  pitch: string;
  scanLabel: string;
  chooseAmt: string;
  orCustom: string;
  namePlaceholder: string;
  upiPay: string;
  cashfree: string;
  upiBackup: string;
  waShare: string;
  cantHelp: string;
  mute: string;
  impactMap: Record<number, string>;
  otherWaysTitle: string;
  otherWays: string[];
}

const LANG_CONTENT: Record<LangKey, LangContent> = {
  hi: {
    label: 'हिंदी',
    title: 'NakshaBot बनाने वाले छात्र की मदद करें',
    subtitle: 'साइबर कैफे से, बिना laptop के बनाया',
    pitch: 'नमस्ते! मैं NakshaBot का अकेला छात्र-डेवलपर हूँ। मेरे पास laptop नहीं है — मैंने यह पूरा ऐप cyber café में, घंटे-दर-घंटे पैसे देकर बनाया है। आज NakshaBot हजारों लोगों की मदद कर रहा है — बिल्कुल मुफ्त, कोई विज्ञापन नहीं। Server और tools का खर्च मेरी जेब से जाता है। अगर इस ऐप ने आपका थोड़ा भी काम आसान किया, तो ₹50 या ₹100 की मदद मेरे लिए बहुत मायने रखेगी। इससे मेरी पढ़ाई और NakshaBot दोनों चलते रहेंगे। 🙏',
    scanLabel: 'स्कैन / Click for QR',
    chooseAmt: 'राशि चुनें',
    orCustom: 'या खुद लिखें',
    namePlaceholder: 'आपका नाम (वैकल्पिक)',
    upiPay: 'UPI से Pay करें',
    cashfree: 'Cashfree से Pay करें',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp पर Share करें',
    cantHelp: 'माफ़ करें, मैं अभी मदद नहीं कर सकता',
    mute: '24 घंटे के लिए बंद करें',
    impactMap: { 50: 'एक दिन का school lunch', 100: 'एक हफ्ते की पढ़ाई मदद', 500: 'एक महीने का internet', 1000: 'परीक्षा फॉर्म की फीस' },
    otherWaysTitle: 'पुराना Laptop / Computer donate कर सकते हैं',
    otherWays: [
      '💻 पुराना Laptop, Computer या कोई उपकरण donate कर सकते हैं',
      '📱 दोस्तों और सहयोगियों को NakshaBot share करें',
      '📮 डाक का पता: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  en: {
    label: 'English',
    title: 'Help the student who built NakshaBot',
    subtitle: 'Built from a cyber café, without a laptop',
    pitch: "Hi! I'm the solo student developer behind NakshaBot. Because I don't own a laptop, I built this entire app from a cyber café, paying for computer time by the hour. Today, NakshaBot helps thousands of people — completely free, no ads. Server & tool costs come out of my pocket. If this app made your work even a little easier, a small donation of ₹50 or ₹100 would mean the world to me. It'll support my education and keep NakshaBot free for everyone. 🙏",
    scanLabel: 'Scan / Click for QR',
    chooseAmt: 'Choose Amount',
    orCustom: 'Or enter custom',
    namePlaceholder: 'Your name (optional)',
    upiPay: 'Pay via UPI',
    cashfree: 'Pay via Cashfree',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'Share on WhatsApp',
    cantHelp: "Sorry, I can't help right now",
    mute: 'Remind me later',
    impactMap: { 50: "= his daily school lunch 🍱", 100: "= a week of study support ✏️", 500: "= one month's internet 💻", 1000: "= exam form fees 🎓" },
    otherWaysTitle: 'Donate an old Laptop or Computer',
    otherWays: [
      '💻 Donate an old Laptop, Computer, or working device',
      '📱 Share NakshaBot with your colleagues & friends',
      '📮 Postal Address: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  bn: {
    label: 'বাংলা',
    title: 'NakshaBot-এর ছাত্রকে সাহায্য করুন',
    subtitle: 'ল্যাপটপ ছাড়া, সাইবার ক্যাফে থেকে বানানো',
    pitch: 'নমস্কার! আমি NakshaBot-এর একমাত্র ছাত্র-ডেভেলপার। আমার নিজের ল্যাপটপ নেই — পুরো অ্যাপটা সাইবার ক্যাফেতে ঘণ্টার পর ঘণ্টা পয়সা দিয়ে বানিয়েছি। আজ NakshaBot হাজারো মানুষের কাজ সহজ করছে — সম্পূর্ণ বিনামূল্যে। Server ও tool-এর খরচ আমার নিজের পকেট থেকে যায়। যদি এই অ্যাপ আপনার একটুও কাজে লেগে থাকে, তাহলে ₹৫০ বা ₹১০০ দিলে আমার অনেক উপকার হবে। এতে আমার পড়াশোনা ও NakshaBot দুটোই চলবে। 🙏',
    scanLabel: 'স্ক্যান / QR দেখতে ক্লিক করুন',
    chooseAmt: 'পরিমাণ বেছে নিন',
    orCustom: 'অথবা নিজে লিখুন',
    namePlaceholder: 'আপনার নাম (ঐচ্ছিক)',
    upiPay: 'UPI দিয়ে পেমেন্ট করুন',
    cashfree: 'Cashfree দিয়ে পেমেন্ট',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-এ শেয়ার করুন',
    cantHelp: 'দুঃখিত, এখন সাহায্য করতে পারছি না',
    mute: 'পরে মনে করিয়ে দিন',
    impactMap: { 50: '= একদিনের স্কুল লাঞ্চ', 100: '= এক সপ্তাহের পড়াশোনার সাহায্য', 500: '= এক মাসের ইন্টারনেট', 1000: '= পরীক্ষার ফর্মের ফি' },
    otherWaysTitle: 'পুরনো ল্যাপটপ বা কম্পিউটার দান করুন',
    otherWays: [
      '💻 পুরনো ল্যাপটপ, কম্পিউটার বা অন্য যেকোনো ডিভাইস দান করতে পারেন',
      '📱 বন্ধুদের সাথে NakshaBot শেয়ার করুন',
      '📮 ডাক ঠিকানা: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  ta: {
    label: 'தமிழ்',
    title: 'NakshaBot உருவாக்கிய மாணவனுக்கு உதவுங்கள்',
    subtitle: 'லேப்டாப் இல்லாமல், சைபர் கஃபேவில் உருவாக்கியது',
    pitch: 'வணக்கம்! நான் NakshaBot-ஐ உருவாக்கிய தனி மாணவன். என்னிடம் லேப்டாப் இல்லை — முழு ஆப்பையும் சைபர் கஃபேயில் மணிக்கணக்கில் பணம் செலுத்தி உருவாக்கினேன். இன்று NakshaBot ஆயிரக்கணக்கான மக்களுக்கு இலவசமாக உதவுகிறது. சர்வர் மற்றும் கருவி செலவுகள் என் சொந்த பணத்தில் இருந்து செல்கின்றன. இந்த ஆப் உங்களுக்கு சிறிதும் உதவியிருந்தால், ₹50 அல்லது ₹100 கொடுத்தால் என் கல்வி மற்றும் NakshaBot இரண்டும் தொடரும். 🙏',
    scanLabel: 'QR ஸ்கேன் செய்ய கிளிக் செய்க',
    chooseAmt: 'தொகையை தேர்வு செய்யுங்கள்',
    orCustom: 'அல்லது தொகை உள்ளிடவும்',
    namePlaceholder: 'உங்கள் பெயர் (விருப்பத்திற்கு)',
    upiPay: 'UPI மூலம் செலுத்துங்கள்',
    cashfree: 'Cashfree மூலம் செலுத்துங்கள்',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-ல் பகிருங்கள்',
    cantHelp: 'மன்னிக்கவும், இப்போது உதவ முடியவில்லை',
    mute: 'பிறகு நினைவூட்டுங்கள்',
    impactMap: { 50: '= ஒரு நாள் பள்ளி மதிய உணவு', 100: '= ஒரு வார கல்வி உதவி', 500: '= ஒரு மாத இணையம்', 1000: '= தேர்வு படிவக் கட்டணம்' },
    otherWaysTitle: 'பழைய லேப்டாப் அல்லது கணினியை நன்கொடையாக வழங்கலாம்',
    otherWays: [
      '💻 பழைய லேப்டாப், கணினி அல்லது சாதனங்களை நன்கொடையாக வழங்கலாம்',
      '📱 நண்பர்களிடம் NakshaBot பகிருங்கள்',
      '📮 தபால் முகவரி: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  as: {
    label: 'অসমীয়া',
    title: 'NakshaBot বনোৱা ছাত্ৰজনক সহায় কৰক',
    subtitle: 'লেপটপ নোহোৱাকৈ, চাইবাৰ কেফেত বনোৱা',
    pitch: 'নমস্কাৰ! মই NakshaBot-ৰ একমাত্ৰ ছাত্ৰ-ডেভেলপাৰ। মোৰ নিজৰ লেপটপ নাই — গোটেই এপটো চাইবাৰ কেফেত ঘণ্টাৰ পিছত ঘণ্টা পইচা দি বনাইছো। আজি NakshaBot হাজাৰ হাজাৰ মানুহক বিনামূলীয়াকৈ সহায় কৰিছে। চাৰ্ভাৰ আৰু টুলৰ খৰচ মোৰ নিজৰ পকেটৰ পৰা যায়। এই এপে আপোনাৰ কামত সামান্য সহায়ো কৰিছে নেকি? তেন্তে ₹৫০ বা ₹১০০ দিলে মোৰ বহুত উপকাৰ হ\'ব। 🙏',
    scanLabel: 'স্কেন / QR ক্লিক কৰক',
    chooseAmt: 'পৰিমাণ বাছক',
    orCustom: 'অথবা নিজে লিখক',
    namePlaceholder: 'আপোনাৰ নাম (ঐচ্ছিক)',
    upiPay: 'UPI ৰে পেমেণ্ট কৰক',
    cashfree: 'Cashfree ৰে পেমেণ্ট',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-ত শ্বেয়াৰ কৰক',
    cantHelp: 'দুঃখিত, এতিয়া সহায় কৰিব নোৱাৰো',
    mute: 'পিছত মনত পেলাওক',
    impactMap: { 50: '= এদিনৰ স্কুল লাঞ্চ', 100: '= এসপ্তাহৰ পঢ়া-শুনাৰ সহায়', 500: '= এমাহৰ ইণ্টাৰনেট', 1000: '= পৰীক্ষাৰ ফৰ্মৰ মাচুল' },
    otherWaysTitle: 'পুৰণি লেপটপ বা কম্পিউটাৰ দান কৰিব পাৰে',
    otherWays: [
      '💻 পুৰণি লেপটপ, কম্পিউটাৰ বা যিকোনো ডিভাইচ দান কৰিব পাৰে',
      '📱 বন্ধুসকলক NakshaBot শ্বেয়াৰ কৰক',
      '📮 ডাকযোগে: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  mni: {
    label: 'মেইতেই',
    title: 'NakshaBot তৈরি করা ছাত্রকে সাহায্য করুন',
    subtitle: 'ল্যাপটপ ছাড়া, সাইবার ক্যাফে থেকে তৈরি',
    pitch: 'নমস্কার! আমি NakshaBot-এর একা ছাত্র-ডেভেলপার। আমার নিজের ল্যাপটপ নেই — পুরো অ্যাপটা সাইবার ক্যাফেতে ঘণ্টায় ঘণ্টায় পয়সা দিয়ে তৈরি করেছি। আজ NakshaBot হাজারো মানুষকে বিনামূল্যে সাহায্য করছে। Server ও tool-এর খরচ আমার পকেট থেকে যায়। ₹৫০ বা ₹১০০-এর সাহায্য আমার পড়াশুনা ও NakshaBot চালু রাখতে সাহায্য করবে। 🙏',
    scanLabel: 'স্কান / QR দেখতে ক্লিক করুন',
    chooseAmt: 'পরিমাণ বেছে নিন',
    orCustom: 'নিজে লিখুন',
    namePlaceholder: 'আপনার নাম (ঐচ্ছিক)',
    upiPay: 'UPI দিয়ে পেমেন্ট',
    cashfree: 'Cashfree দিয়ে পেমেন্ট',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-এ শেয়ার করুন',
    cantHelp: 'দুঃখিত, এখন সাহায্য করতে পারছি না',
    mute: 'পরে মনে করিয়ে দিন',
    impactMap: { 50: '= একদিনের স্কুল খাবার', 100: '= এক সপ্তাহের পড়ার সাহায্য', 500: '= এক মাসের ইন্টারনেট', 1000: '= পরীক্ষার ফর্ম ফি' },
    otherWaysTitle: 'পুরনো ল্যাপটপ বা কম্পিউটার দান করুন',
    otherWays: [
      '💻 ল্যাপটপ, কম্পিউটার বা যেকোনো ডিভাইস দান করতে পারেন',
      '📱 বন্ধুদের সাথে NakshaBot শেয়ার করুন',
      '📮 ডাক ঠিকানা: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
};

const STATE_LANG_MAP: Record<string, LangKey> = {
  'West Bengal': 'bn', 'WB': 'bn',
  'Tamil Nadu': 'ta', 'TN': 'ta',
  'Assam': 'as', 'AS': 'as',
  'Manipur': 'mni', 'MN': 'mni',
  'Uttar Pradesh': 'hi', 'UP': 'hi',
  'Bihar': 'hi', 'BR': 'hi',
  'Madhya Pradesh': 'hi', 'MP': 'hi',
  'Rajasthan': 'hi', 'RJ': 'hi',
  'Haryana': 'hi', 'HR': 'hi',
  'Delhi': 'hi', 'DL': 'hi',
  'Jharkhand': 'hi', 'JH': 'hi',
  'Chhattisgarh': 'hi', 'CG': 'hi',
  'Himachal Pradesh': 'hi', 'HP': 'hi',
  'Uttarakhand': 'hi', 'UK': 'hi',
  'Punjab': 'hi', 'PB': 'hi',
  'Gujarat': 'hi', 'GJ': 'hi',
  'Maharashtra': 'hi', 'MH': 'hi',
};

const fixedAmounts = [50, 100, 500, 1000];
const WA_SHARE_TEXT = `मैंने एक साथी छात्र की मदद की 🙏\n\nNakshaBot से HLB नक्शा मिनटों में — बिल्कुल मुफ्त!\n\nTry it: https://examsetu.dev`;
const VIDEO_URL = "https://ybrtqteoagkptglqedsw.supabase.co/storage/v1/object/sign/t/Video%20Project%201%20(1)%20(1)%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lM2I3OGM3OC1lNTFlLTQ1MzEtOTViMC1iY2VkMTMwZGE2ZjAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0L1ZpZGVvIFByb2plY3QgMSAoMSkgKDEpICgxKS5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg2MTk2OTQ3LCJleHAiOjE4MTc3MzI5NDd9.GcUdabBxHfEFMqu9Z8WNIIwcqHzmEH_dx8On46weUZc";

export default function DonationPopup({ isOpen, onClose, onMute24h, isPrintArea }: Props) {
  const [lang, setLang] = useState<LangKey>('en');
  const [customAmount, setCustomAmount] = useState('100');
  const [customNote, setCustomNote] = useState('');
  const [copiedText, setCopiedText] = useState<'upi' | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [showOtherWays, setShowOtherWays] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);

  // Lightbox modal for QR code
  const [showQrShowbox, setShowQrShowbox] = useState(false);

  // Lazy loaded video URL (loaded only after popup fully opens)
  const [videoSrc, setVideoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setGeoLoading(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      fetch('https://ipapi.co/json/', { signal: controller.signal })
        .then(r => r.json())
        .then((d: any) => {
          const region: string = d?.region || d?.region_name || '';
          const detectedLang = STATE_LANG_MAP[region] ?? 'en';
          setLang(detectedLang);
        })
        .catch(() => { setLang('en'); })
        .finally(() => { clearTimeout(timer); setGeoLoading(false); });

      // Lazy load video after popup opens completely
      const vTimer = setTimeout(() => {
        setVideoSrc(VIDEO_URL);
      }, 350);

      return () => {
        clearTimeout(timer);
        clearTimeout(vTimer);
        controller.abort();
      };
    } else {
      setVideoSrc(null);
      setShowQrShowbox(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const L = LANG_CONTENT[lang];
  const selectedAmt = Number(customAmount) || 0;
  const impactText = L.impactMap[selectedAmt];
  const upiLink = `upi://pay?pa=8318810984-1@nyes&pn=NakshaBot&am=${customAmount || '100'}&cu=INR&tn=${encodeURIComponent('NakshaBot Donation')}`;

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedText('upi');
    setTimeout(() => setCopiedText(null), 1500);
  };

  const handleGeneratePayment = async () => {
    const amt = parseFloat(customAmount);
    if (isNaN(amt) || amt <= 0) { alert('Please enter a valid amount'); return; }
    setLoadingPayment(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: don, error: donErr } = await supabase
        .from('donations').insert({
          amount: amt, name: customNote || 'Donor', note: customNote || 'NakshaBot Donation',
          user_id: user?.id || null, payment_status: 'unpaid'
        }).select('id').single();
      if (donErr || !don) throw new Error(donErr?.message || 'Failed to create donation');
      const { data: cfRes, error: cfErr } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { kind: 'donation', projectId: don.id }
      });
      if (cfErr || !cfRes?.paymentSessionId) throw new Error('Failed to initiate payment');
      const cashfree = await load({ mode: cfRes.cashfreeMode === 'production' ? 'production' : 'sandbox' });
      if (cashfree) await cashfree.checkout({ paymentSessionId: cfRes.paymentSessionId, redirectTarget: '_self' });
      else throw new Error('Cashfree SDK failed to load');
    } catch (err: any) {
      alert('Payment error: ' + err.message);
    } finally {
      setLoadingPayment(false);
    }
  };

  const LANG_CYCLE: LangKey[] = ['hi', 'en', 'bn', 'ta', 'as', 'mni'];
  const cycleLang = () => {
    const idx = LANG_CYCLE.indexOf(lang);
    setLang(LANG_CYCLE[(idx + 1) % LANG_CYCLE.length]);
  };

  const headerTitle = (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="text-2xl shrink-0">🙏</span>
      <div className="min-w-0">
        <h3 className="text-sm font-black text-[var(--color-ink)] font-public-sans leading-tight truncate">{L.title}</h3>
        <p className="text-[10px] text-[var(--color-ink-secondary)] font-medium flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-pulse inline-block"/>
          {L.subtitle}
          {geoLoading && <span className="ml-1 opacity-50 text-[9px]">· detecting location…</span>}
        </p>
        <p className="text-[10px] font-black text-rose-600 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md mt-1 inline-flex items-center gap-1">
          <span>👇</span>
          <span>{lang === 'hi' ? 'बंद करने के लिए नीचे तक स्क्रॉल करें' : 'Scroll to bottom to close popup'}</span>
        </p>
      </div>
    </div>
  );

  return (
    <>
      <Sheet open={isOpen} onClose={undefined} title={headerTitle} maxWidth="sm">
        <div className="space-y-3 text-sm text-[var(--color-ink)]">

          {/* ── PITCH ── */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-3.5 space-y-2">
            <p className="text-xs leading-relaxed text-slate-700">{L.pitch}</p>

            {/* ── TRUST VIDEO (Lazy loaded, 9:16 Portrait Ratio) ── */}
            {videoSrc && (
              <div className="mt-2 pt-2 border-t border-orange-200/60 flex flex-col items-center">
                <div className="flex items-center justify-between w-full mb-1">
                  <span className="text-[10px] font-bold text-orange-800 flex items-center gap-1">
                    🎥 Watch: Kratagya Singh , Who built NakshaBot
                  </span>
                  <span className="text-[9px] bg-orange-200 text-orange-900 font-bold px-1.5 py-0.5 rounded">9:16 Story</span>
                </div>
                <div className="relative w-full max-w-[210px] aspect-[9/16] bg-black rounded-xl overflow-hidden shadow-md border border-orange-300">
                  <video
                    src={videoSrc}
                    controls
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── LANG + QR ROW ── */}
          <div className="flex items-center gap-3 bg-[var(--color-surface-2)] p-2.5 rounded-xl border border-[var(--color-hairline)]">
            {/* Clickable QR code to open Showbox */}
            <div
              onClick={() => setShowQrShowbox(true)}
              className="relative group cursor-pointer shrink-0"
              title="Click to view big QR image & download"
            >
              <img
                src="/images/donation_qr.jpg"
                alt="UPI QR Code"
                className="w-20 h-20 rounded-lg border border-[var(--color-hairline)] shadow-sm object-contain bg-white group-hover:scale-105 transition-transform"
                onError={(e) => { (e.target as any).style.display = 'none'; }}
              />
              <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors rounded-lg flex items-center justify-center">
                <span className="text-[9px] text-white font-bold bg-black/60 px-1.5 py-0.5 rounded backdrop-blur">🔍 Expand</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black text-[var(--color-ink-secondary)] uppercase tracking-wider">{L.scanLabel}</p>
                <button
                  type="button"
                  onClick={() => setShowQrShowbox(true)}
                  className="text-[9px] text-orange-600 font-bold hover:underline cursor-pointer"
                >
                  🔍 Big QR
                </button>
              </div>

              {/* UPI ID copy row */}
              <div className="flex items-center gap-1.5 bg-[var(--color-surface)] border border-[var(--color-hairline)] rounded-lg px-2 py-1">
                <span className="text-[10px] font-mono font-bold text-[var(--color-ink)] flex-1 truncate">8318810984-1@nyes</span>
                <button
                  type="button"
                  onClick={() => handleCopy('8318810984-1@nyes')}
                  className="text-[9px] bg-[var(--color-accent)] text-white font-bold px-2 py-0.5 rounded cursor-pointer shrink-0"
                >
                  {copiedText === 'upi' ? '✓ Copied' : 'Copy'}
                </button>
              </div>

              {/* Language cycler */}
              <button
                type="button"
                onClick={cycleLang}
                className="w-full text-[10px] text-[var(--color-accent)] font-bold border border-[var(--color-hairline)] rounded-lg py-1 hover:bg-[var(--color-surface)] transition-colors cursor-pointer"
              >
                🌐 {L.label} → Switch Language
              </button>
            </div>
          </div>

          {/* ── AMOUNT SELECTION ── */}
          <div className="space-y-2">
            <p className="text-[10px] font-black text-[var(--color-ink-secondary)] uppercase tracking-wider">{L.chooseAmt}</p>
            <div className="grid grid-cols-4 gap-1.5">
              {fixedAmounts.map(amt => {
                const isSelected = customAmount === String(amt);
                const isBest = amt === 100;
                return (
                  <div key={amt} className="relative">
                    {isBest && (
                      <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-900 text-[7px] font-black px-1 py-px rounded-full whitespace-nowrap z-10 shadow">
                        ⭐ Best
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomAmount(String(amt))}
                      className={`w-full mt-1 py-2 text-center text-xs font-black rounded-lg transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--color-accent)] text-white shadow ring-2 ring-[var(--color-accent)]/30'
                          : isBest
                          ? 'bg-amber-50 border-2 border-amber-300 text-amber-900 hover:bg-amber-100'
                          : 'bg-[var(--color-surface-2)] border border-[var(--color-hairline)] text-[var(--color-ink)] hover:bg-indigo-50'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Custom amount input */}
            <div className="flex gap-2 items-center">
              <span className="text-[10px] font-bold text-[var(--color-ink-secondary)] shrink-0">{L.orCustom}</span>
              <input
                type="number"
                value={customAmount}
                onChange={e => setCustomAmount(e.target.value)}
                placeholder="₹"
                min="1"
                className="flex-1 px-2.5 py-1.5 text-xs border border-[var(--color-hairline)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-bold text-[var(--color-ink)]"
              />
              <input
                type="text"
                value={customNote}
                onChange={e => setCustomNote(e.target.value)}
                placeholder={L.namePlaceholder}
                className="flex-1 px-2.5 py-1.5 text-xs border border-[var(--color-hairline)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] text-[var(--color-ink)]"
              />
            </div>

            {/* Impact line */}
            {impactText && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg">
                <span className="text-green-700 text-[11px] font-bold">₹{selectedAmt}</span>
                <span className="text-green-600 text-[11px]">{impactText}</span>
              </div>
            )}
          </div>

          {/* ── PAY BUTTONS ── */}
          <div className="flex gap-2">
            <a
              href={upiLink}
              className="flex-1 py-3 bg-[var(--color-success)] hover:opacity-90 text-white text-center font-black text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1"
            >
              📱 {L.upiPay}
            </a>
            <Button
              type="button"
              variant="filled"
              disabled={loadingPayment}
              className="flex-1 text-xs font-black"
              onClick={handleGeneratePayment}
            >
              {loadingPayment
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/>
                : <>💳 {L.cashfree}</>
              }
            </Button>
          </div>

          {/* ── WHATSAPP SHARE ── */}
          <a
            href={`https://wa.me/?text=${encodeURIComponent(WA_SHARE_TEXT)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-2.5 bg-[#25D366] hover:bg-[#1EBE5E] text-white text-center font-bold text-xs rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M11.999 0C5.373 0 0 5.373 0 12c0 2.117.551 4.102 1.514 5.831L.054 23.617a.75.75 0 00.917.921l5.91-1.476A11.945 11.945 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 11.999 0zm.001 21.75a9.693 9.693 0 01-4.932-1.35l-.353-.21-3.658.915.961-3.55-.229-.364A9.694 9.694 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
            </svg>
            {L.waShare}
          </a>

          {/* ── OTHER WAYS TO HELP (collapsible: Laptop/Computer donation) ── */}
          <div className="border border-[var(--color-hairline)] rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowOtherWays(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-[var(--color-surface-2)] text-[11px] font-bold text-[var(--color-ink-secondary)] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span>💻 {L.otherWaysTitle}</span>
              <span className="text-[var(--color-ink-tertiary)]">{showOtherWays ? '▲' : '▼'}</span>
            </button>
            {showOtherWays && (
              <div className="px-3 py-2 space-y-1.5 bg-[var(--color-surface)]">
                {L.otherWays.map((way, i) => (
                  <p key={i} className="text-[11px] text-[var(--color-ink-secondary)] leading-relaxed font-medium">{way}</p>
                ))}
              </div>
            )}
          </div>

          {/* ── DISMISS BUTTON — Highlighted & Clear ── */}
          <div className="pt-1 border-t border-[var(--color-hairline)] space-y-1">
            <p className="text-[10px] text-center text-slate-400 font-semibold">
              {lang === 'hi' ? 'पॉपअप बंद करने के लिए नीचे दिए गए बटन पर क्लिक करें:' : 'Click below to close this dialog:'}
            </p>
            <button
              type="button"
              onClick={isPrintArea ? onClose : onMute24h}
              disabled={loadingPayment}
              className="w-full py-2.5 px-3 bg-gradient-to-r from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 text-rose-700 hover:text-rose-900 border-2 border-rose-300 font-black text-xs rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
            >
              <span>😞 {isPrintArea ? L.cantHelp : L.mute}</span>
              <span className="text-[10px] bg-rose-200/80 text-rose-900 px-1.5 py-0.5 rounded font-bold">✕ Close</span>
            </button>
          </div>
        </div>
      </Sheet>

      {/* ── QR CODE SHOWBOX / LIGHTBOX MODAL ── */}
      {showQrShowbox && (
        <div
          className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setShowQrShowbox(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 max-w-xs w-full shadow-2xl flex flex-col items-center gap-3 text-center animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center w-full pb-2 border-b border-slate-100">
              <h4 className="font-bold text-slate-800 text-xs">Donation QR Code</h4>
              <button
                onClick={() => setShowQrShowbox(false)}
                className="text-slate-400 hover:text-slate-700 text-sm font-bold px-2 py-0.5 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <img
              src="/images/donation_qr.jpg"
              alt="NakshaBot Donation QR Code"
              className="w-56 h-56 object-contain rounded-xl border border-slate-200 shadow-md bg-white"
            />
            <p className="text-[11px] text-slate-500 font-medium">Scan using GPay, PhonePe, Paytm or BHIM</p>
            <div className="flex gap-2 w-full pt-1">
              <a
                href="/images/donation_qr.jpg"
                download="NakshaBot_Donation_QR.jpg"
                className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-1.5"
              >
                📥 Download QR
              </a>
              <button
                onClick={() => setShowQrShowbox(false)}
                className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
