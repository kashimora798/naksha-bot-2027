import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { load } from '@cashfreepayments/cashfree-js';
import { Sheet } from './ui/Sheet';
import { Button } from './ui/Button';
import { savePendingDonation } from '../lib/donationRecovery';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onMute24h: () => void;
  isPrintArea: boolean;
  initialAmount?: string;
  initialNote?: string;
}

// ─── REGIONAL LANGUAGES SUPPORTED ─────────────────────────────
type LangKey = 'hi' | 'en' | 'bn' | 'as' | 'ta' | 'te' | 'kn' | 'ml' | 'gu' | 'mr' | 'pa';

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
  en: {
    label: 'English',
    title: 'Support a Growing Talent — Be an Angel Backer 🚀',
    subtitle: 'Empowering independent student innovation for Census & GIS tools',
    pitch: "Hi! I'm Kratagya, a student developer building NakshaBot to keep professional Census mapping 100% free & accessible for thousands of enumerators and surveyors across India. Server & high-res mapping infrastructure is independently funded. Be an angel backer for a growing student talent! A small contribution of ₹50 or ₹100 empowers independent innovation and keeps NakshaBot 100% free for everyone. 🙏",
    scanLabel: 'Scan QR Code with any UPI App',
    chooseAmt: 'Select Donation Amount',
    orCustom: 'Custom amount',
    namePlaceholder: 'Your name (optional)',
    upiPay: 'Pay via UPI',
    cashfree: 'Pay via Cashfree',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'Share on WhatsApp',
    cantHelp: "Sorry, I can't help right now",
    mute: 'Remind me later',
    impactMap: { 50: "= daily school lunch 🍱", 100: "= a week of study support ✏️", 500: "= one month's internet 💻", 1000: "= exam form fees 🎓" },
    otherWaysTitle: 'Donate an old Laptop or Computer',
    otherWays: [
      '💻 Donate an old Laptop, Computer, or working device',
      '📱 Share NakshaBot with your colleagues & friends',
      '📮 Postal Address: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  hi: {
    label: 'हिंदी',
    title: 'युवा प्रतिभा का समर्थन करें — NakshaBot के एंजेल बैकर बनें 🚀',
    subtitle: 'स्वतंत्र छात्र इनोवेशन और मैपिंग टेक्नोलॉजी को आगे बढ़ाएं',
    pitch: 'नमस्ते! मैं कृतज्ञ हूँ, NakshaBot का छात्र-डेवलपर। मैंने NakshaBot इसलिए बनाया ताकि भारत भर के हजारों एन्यूमरेटर और सर्वेयर बिना किसी शुल्क के प्रोफेशनल HLB नक्शे बना सकें। सर्वर और मैपिंग इंफ्रास्ट्रक्चर का खर्च स्वतंत्र रूप से वहन किया जाता है। एक उभरती युवा प्रतिभा के एंजेल बैकर बनें! आपका ₹50 या ₹100 का योगदान इस स्वतंत्र इनोवेशन को सशक्त बनाएगा और NakshaBot को सभी के लिए 100% मुफ्त रखेगा। 🙏',
    scanLabel: 'किसी भी UPI ऐप से QR कोड स्कैन करें',
    chooseAmt: 'सहायता राशि चुनें',
    orCustom: 'खुद राशि लिखें',
    namePlaceholder: 'आपका नाम (वैकल्पिक)',
    upiPay: 'UPI से Pay करें',
    cashfree: 'Cashfree से Pay करें',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp पर Share करें',
    cantHelp: 'माफ़ करें, मैं अभी मदद नहीं कर सकता',
    mute: '24 घंटे के लिए बंद करें',
    impactMap: { 50: 'एक दिन का school lunch 🍱', 100: 'एक हफ्ते की पढ़ाई मदद ✏️', 500: 'एक महीने का internet 💻', 1000: 'परीक्षा फॉर्म की फीस 🎓' },
    otherWaysTitle: 'पुराना Laptop / Computer donate कर सकते हैं',
    otherWays: [
      '💻 पुराना Laptop, Computer या कोई उपकरण donate कर सकते हैं',
      '📱 दोस्तों और सहयोगियों को NakshaBot share करें',
      '📮 डाक का पता: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  bn: {
    label: 'বাংলা',
    title: 'উদীয়মান প্রতিভাকে সমর্থন করুন — এঞ্জেল ব্যাকার হন 🚀',
    subtitle: 'স্বায়ত্তশাসিত ছাত্র ইনোভেশন ও টেকনোলজিকে এগিয়ে নিয়ে যান',
    pitch: 'নমস্কার! আমি কৃতজ্ঞ, NakshaBot-এর ছাত্র-ডেভেলপার। আমি NakshaBot তৈরি করেছি যাতে ভারত জুড়ে হাজার হাজার সার্ভেয়ার বিনামূল্যে প্রফেশনাল ম্যাপ তৈরি করতে পারেন। সার্ভার এবং ডেটা ইনফ্রাস্ট্রাকচারের খরচ স্বাধীনভাবে বহন করা হয়। একজন উদীয়মান ছাত্র প্রতিভার এঞ্জেল ব্যাকার হন! আপনার ₹৫০ বা ₹ ১০০ সাহায্য স্বাধীন ইনোভেশনকে শক্তিশালী করবে এবং NakshaBot-কে সবার জন্য ১০০% ফ্রি রাখবে। 🙏',
    scanLabel: 'যেকোনো UPI অ্যাপ দিয়ে QR কোড স্ক্যান করুন',
    chooseAmt: 'পরিমাণ বেছে নিন',
    orCustom: 'অথবা নিজে লিখুন',
    namePlaceholder: 'আপনার নাম (ঐচ্ছিক)',
    upiPay: 'UPI দিয়ে পেমেন্ট করুন',
    cashfree: 'Cashfree দিয়ে পেমেন্ট',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-এ শেয়ার করুন',
    cantHelp: 'দুঃখিত, এখন সাহায্য করতে পারছি না',
    mute: 'পরে মনে করিয়ে দিন',
    impactMap: { 50: '= একদিনের স্কুল লাঞ্চ 🍱', 100: '= এক সপ্তাহের পড়াশোনার সাহায্য ✏️', 500: '= এক মাসের ইন্টারনেট 💻', 1000: '= পরীক্ষার ফর্মের ফি 🎓' },
    otherWaysTitle: 'পুরনো ল্যাপটপ বা কম্পিউটার দান করুন',
    otherWays: [
      '💻 পুরনো ল্যাপটপ, কম্পিউটার বা অন্য যেকোনো ডিভাইস দান করতে পারেন',
      '📱 বন্ধুদের সাথে NakshaBot শেয়ার করুন',
      '📮 ডাক ঠিকানা: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  as: {
    label: 'অসমীয়া',
    title: 'উদীয়মান প্ৰতিভাক সমৰ্থন কৰক — এঞ্জেল বেকাৰ হওক 🚀',
    subtitle: 'স্বায়ত্তশাসিত ছাত্ৰ ইনোভেচনক উৎসাহিত কৰক',
    pitch: 'নমস্কাৰ! মই কৃতঘ্ন, NakshaBot-ৰ ছাত্ৰ-ডেভেলপাৰ। মই NakshaBot এইবাবেই বনাইছো যাতে সমগ্ৰ ভাৰতৰ হাজাৰ হাজাৰ মানুহে বিনামূলীয়াকৈ প্ৰফেচনেল মেপ বনাব পাৰে। চাৰ্ভাৰ আৰু ডেটা খৰচ স্বতন্ত্ৰভাৱে দিয়া হয়। এজন উদীয়মান ছাত্ৰ প্ৰতিভাৰ এঞ্জেল বেকাৰ হওক! আপোনাৰ ₹৫০ বা ₹ ১০০ তেনেই সামান্য সহায়েই এই স্বতন্ত্ৰ ইনোভেচনক শক্তিশালী কৰিব। 🙏',
    scanLabel: 'যিকোনো UPI এপেৰে QR কোড স্কেন কৰক',
    chooseAmt: 'পৰিমাণ বাছক',
    orCustom: 'অথবা নিজে লিখক',
    namePlaceholder: 'আপোনাৰ নাম (ঐচ্ছিক)',
    upiPay: 'UPI ৰে পেমেণ্ট কৰক',
    cashfree: 'Cashfree ৰে পেমেণ্ট',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-ত শ্বেয়াৰ কৰক',
    cantHelp: 'দুঃখিত, এতিয়া সহায় কৰিব নোৱাৰো',
    mute: 'পিছত মনত পেলাওক',
    impactMap: { 50: '= এদিনৰ স্কুল লাঞ্চ 🍱', 100: '= এসপ্তাহৰ পঢ়া-শুনাৰ সহায় ✏️', 500: '= এমাহৰ ইণ্টাৰনেট 💻', 1000: '= পৰীক্ষাৰ ফৰ্মৰ মাচুল 🎓' },
    otherWaysTitle: 'পুৰণি লেপটপ বা কম্পিউটাৰ দান কৰিব পাৰে',
    otherWays: [
      '💻 পুৰণি লেপটপ, কম্পিউটাৰ বা যিকোনো ডিভাইচ দান কৰিব পাৰে',
      '📱 বন্ধুসকলক NakshaBot শ্বেয়াৰ কৰক',
      '📮 ডাকযোগে: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  mr: {
    label: 'मराठी',
    title: 'NakshaBot बनवणाऱ्या विद्यार्थ्याला मदत करा',
    subtitle: 'लॅपटॉपशिवाय, सायबर कॅफेतून बनवले',
    pitch: 'नमस्कार! मी NakshaBot चा एकुलता एक विद्यार्थी-डेव्हलपर आहे. माझ्याकडे लॅपटॉप नाही — मी हे संपूर्ण ॲप सायबर कॅफेमध्ये तासांचे पैसे देऊन बनवले आहे. आज NakshaBot हजारो लोकांना मदत करत आहे — पूर्णपणे मोफत. सर्व्हरचा खर्च माझ्या खिशातून जातो. ₹50 किंवा ₹100 ची छोटीशी मदत माझ्या शिक्षणासाठी खूप महत्त्वाची ठरेल. 🙏',
    scanLabel: 'कोणत्याही UPI ॲपने QR कोड स्कॅन करा',
    chooseAmt: 'रक्कम निवडा',
    orCustom: 'किंवा स्वतः लिहा',
    namePlaceholder: 'तुमचे नाव (पर्यायी)',
    upiPay: 'UPI द्वारे Pay करा',
    cashfree: 'Cashfree द्वारे Pay करा',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp वर Share करा',
    cantHelp: 'माफ करा, मी आता मदत करू शकत नाही',
    mute: 'नंतर आठवण करून द्या',
    impactMap: { 50: '= एका दिवसाचा शाळेचा डबा 🍱', 100: '= एका आठवड्याचा अभ्यासाचा खर्च ✏️', 500: '= एका महिन्याचे इंटरनेट 💻', 1000: '= परीक्षा फॉर्म फी 🎓' },
    otherWaysTitle: 'जुना Laptop / Computer दान करू शकता',
    otherWays: [
      '💻 जुना Laptop किंवा Computer दान करू शकता',
      '📱 मित्रांना NakshaBot शेअर करा',
      '📮 पत्ता: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  ta: {
    label: 'தமிழ்',
    title: 'NakshaBot உருவாக்கிய மாணவனுக்கு உதவுங்கள்',
    subtitle: 'லேப்டாப் இல்லாமல், சைபர் கஃபேவில் உருவாக்கியது',
    pitch: 'வணக்கம்! நான் NakshaBot-ஐ உருவாக்கிய தனி மாணவன். என்னிடம் லேப்டாப் இல்லை — முழு ஆப்பையும் சைபர் கஃபேயில் மணிக்கணக்கில் பணம் செலுத்தி உருவாக்கினேன். இன்று NakshaBot ஆயிரக்கணக்கான மக்களுக்கு இலவசமாக உதவுகிறது. இந்த ஆப் உங்களுக்கு உதவியிருந்தால், ₹50 அல்லது ₹100 நன்கொடை அளித்து என் கல்வியை ஆதரியுங்கள். 🙏',
    scanLabel: 'எந்த UPI ஆப் மூலமும் QR ஸ்கேன் செய்யுங்கள்',
    chooseAmt: 'தொகையை தேர்வு செய்யுங்கள்',
    orCustom: 'அல்லது தொகை உள்ளிடவும்',
    namePlaceholder: 'உங்கள் பெயர் (விருப்பத்திற்கு)',
    upiPay: 'UPI மூலம் செலுத்துங்கள்',
    cashfree: 'Cashfree மூலம் செலுத்துங்கள்',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-ல் பகிருங்கள்',
    cantHelp: 'மன்னிக்கவும், இப்போது உதவ முடியவில்லை',
    mute: 'பிறகு நினைவூட்டுங்கள்',
    impactMap: { 50: '= ஒரு நாள் பள்ளி மதிய உணவு 🍱', 100: '= ஒரு வார கல்வி உதவி ✏️', 500: '= ஒரு மாத இணையம் 💻', 1000: '= தேர்வு படிவக் கட்டணம் 🎓' },
    otherWaysTitle: 'பழைய லேப்டாப் அல்லது கணினியை நன்கொடையாக வழங்கலாம்',
    otherWays: [
      '💻 பழைய லேப்டாப், கணினி அல்லது சாதனங்களை நன்கொடையாக வழங்கலாம்',
      '📱 நண்பர்களிடம் NakshaBot பகிருங்கள்',
      '📮 தபால் முகவரி: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  te: {
    label: 'తెలుగు',
    title: 'NakshaBot తయారు చేసిన విద్యార్థికి సాయం చేయండి',
    subtitle: 'ల్యాప్‌టాప్ లేకుండా, సైబర్ కేఫ్ నుండి తయారు చేశారు',
    pitch: 'నమస్తే! నేను NakshaBot ని అభివృద్ధి చేసిన విద్యార్థిని. నా దగ్గర ల్యాప్‌టాప్ లేదు — సైబర్ కేఫ్‌లో గంటల వారీగా డబ్బులు చెల్లించి ఈ యాప్ తయారు చేశాను. ఈ యాప్ మీకు ఉపయోగపడితే, ₹50 లేదా ₹100 విరాళం ఇవ్వడం ద్వారా నా చదువుకి సాయం చేయండి. 🙏',
    scanLabel: 'ఏదైనా UPI యాప్‌తో QR కోడ్‌ని స్కాన్ చేయండి',
    chooseAmt: 'మొత్తాన్ని ఎంచుకోండి',
    orCustom: 'లేదా మీరే నమోదు చేయండి',
    namePlaceholder: 'మీ పేరు (ఐచ్ఛికం)',
    upiPay: 'UPI ద్వారా చెల్లించండి',
    cashfree: 'Cashfree ద్వారా చెల్లించండి',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp లో షేర్ చేయండి',
    cantHelp: 'క్షమించండి, ఇప్పుడు సాయం చేయలేను',
    mute: 'తర్వాత గుర్తు చేయండి',
    impactMap: { 50: '= ఒక రోజు స్కూల్ లంచ్ 🍱', 100: '= ఒక వారం చదువు సాయం ✏️', 500: '= ఒక నెల ఇంటర్నెట్ 💻', 1000: '= పరీక్ష ఫారం ఫీజు 🎓' },
    otherWaysTitle: 'పాత ল్యాప్‌టాప్ లేదా కంప్యూటర్ దానం చేయవచ్చు',
    otherWays: [
      '💻 పాత ల్యాప్‌టాప్ లేదా కంప్యూటర్ దానం చేయవచ్చు',
      '📱 మిత్రులకు NakshaBot షేర్ చేయండి',
      '📮 చిరునామా: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  kn: {
    label: 'ಕನ್ನಡ',
    title: 'NakshaBot ತಯಾರಿಸಿದ ವಿದ್ಯಾರ್ಥಿಗೆ ನೆರವಾಗಿ',
    subtitle: 'ಲ್ಯಾಪ್‌ಟಾಪ್ ಇಲ್ಲದೆ, ಸೈಬರ್ ಕೆಫೆಯಿಂದ ತಯಾರಿಸಲಾಗಿದೆ',
    pitch: 'ನಮಸ್ಕಾರ! ನಾನು NakshaBot ರೂಪಿಸಿದ ವಿದ್ಯಾರ್ಥಿ. ನನ್ನ ಬಳಿ ಲ್ಯಾಪ್‌ಟಾಪ್ ಇಲ್ಲ — ಸೈಬರ್ ಕೆಫೆಯಲ್ಲಿ ಗಂಟೆಗೆ ಹಣ ನೀಡಿ ಈ ಲ್ಯಾಪ್‌ಟಾಪ್ ಅಪ್ಲಿಕೇಶನ್ ನಿರ್ಮಿಸಿದ್ದೇನೆ. ಈ ಆಪ್ ನಿಮಗೆ ಸಹಾಯ ಮಾಡಿದ್ದರೆ, ₹50 ಅಥವಾ ₹100 ದೇಣಿಗೆ ನೀಡಿ ನನ್ನ ಶಿಕ್ಷಣಕ್ಕೆ ನೆರವಾಗಿ. 🙏',
    scanLabel: 'ಯಾವುದೇ UPI ಆಪ್‌ನಿಂದ QR ಕೋಡ್ ಸ್ಕ್ಯಾನ್ ಮಾಡಿ',
    chooseAmt: 'ಮೊತ್ತವನ್ನು ಆಯ್ಕೆಮಾಡಿ',
    orCustom: 'ಅಥವಾ ಕಸ್ಟಮ್ ಮೊತ್ತ',
    namePlaceholder: 'ನಿಮ್ಮ ಹೆಸರು (ಐಚ್ಛಿಕ)',
    upiPay: 'UPI ಮೂಲಕ ಪಾವತಿಸಿ',
    cashfree: 'Cashfree ಮೂಲಕ ಪಾವತಿಸಿ',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp ನಲ್ಲಿ ಹಂಚಿಕೊಳ್ಳಿ',
    cantHelp: 'ಕ್ಷಮಿಸಿ, ಈಗ ಸಹಾಯ ಮಾಡಲು ಸಾಧ್ಯವಿಲ್ಲ',
    mute: 'ನಂತರ ನೆನಪಿಸಿ',
    impactMap: { 50: '= ಒಂದು ದಿನದ ಶಾಲಾ ಊಟ 🍱', 100: '= ಒಂದು ವಾರದ ಶಿಕ್ಷಣ ನೆರವು ✏️', 500: '= ಒಂದು ತಿಂಗಳ ಇಂಟರ್ನೆಟ್ 💻', 1000: '= ಪರೀಕ್ಷಾ ಶುಲ್ಕ 🎓' },
    otherWaysTitle: 'ಹಳೆಯ ಲ್ಯಾಪ್‌ಟಾಪ್ ಅಥವಾ ಕಂಪ್ಯೂಟರ್ ಕೊಡುಗೆ ನೀಡಿ',
    otherWays: [
      '💻 ಹಳೆಯ ಲ್ಯಾಪ್‌ಟಾಪ್ ಅಥವಾ ಕಂಪ್ಯೂಟರ್ ಕೊಡುಗೆ ನೀಡಬಹುದು',
      '📱 ಸ್ನೇಹಿತರೊಂದಿಗೆ NakshaBot ಹಂಚಿಕೊಳ್ಳಿ',
      '📮 ವಿಳಾಸ: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  ml: {
    label: 'മലയാളം',
    title: 'NakshaBot നിർമ്മിച്ച വിദ്യാർത്ഥിയെ സഹായിക്കൂ',
    subtitle: 'ലാപ്‌ടോപ്പ് ഇല്ലാതെ, സൈബർ കഫേയിൽ നിന്ന് നിർമ്മിച്ചത്',
    pitch: 'നമസ്കാരം! ഞാൻ NakshaBot നിർമ്മിച്ച വിദ്യാർത്ഥിയാണ്. സ്വന്തമായി ലാപ്‌ടോപ്പ് ഇല്ലാത്തതിനാൽ സൈബർ കഫേയിൽ മണിക്കൂറുകൾക്ക് പണം നൽകിയാണ് ഞാൻ ഇത് വികസിപ്പിച്ചത്. ₹50 അല്ലെങ്കിൽ ₹100 സംഭാവന നൽകി എന്റെ പഠനത്തെ പിന്തുണയ്ക്കൂ. 🙏',
    scanLabel: 'ഏതെങ്കിലും UPI ആപ്പ് ഉപയോഗിച്ച് QR സ്കാൻ ചെയ്യൂ',
    chooseAmt: 'തുക തിരഞ്ഞെടുക്കൂ',
    orCustom: 'അല്ലെങ്കിൽ തുക നൽകൂ',
    namePlaceholder: 'നിങ്ങളുടെ പേര് (ഓപ്ഷണൽ)',
    upiPay: 'UPI വഴി നൽകൂ',
    cashfree: 'Cashfree വഴി നൽകൂ',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp-ൽ പങ്കുവെക്കൂ',
    cantHelp: 'ക്ഷമിക്കണം, ഇപ്പോൾ സഹായിക്കാൻ കഴിയില്ല',
    mute: 'പിന്നീട് ഓർമ്മിപ്പിക്കൂ',
    impactMap: { 50: '= ഒരു ദിവസത്തെ ഉച്ചഭക്ഷണം 🍱', 100: '= ഒരു ആഴ്ചത്തെ പഠന സഹായം ✏️', 500: '= ഒരു മാസത്തെ ഇന്റർനെറ്റ് 💻', 1000: '= പരീക്ഷ ഫീസ് 🎓' },
    otherWaysTitle: 'പഴയ ലാപ്ടോപ്പോ കമ്പ്യൂട്ടറോ നൽകാം',
    otherWays: [
      '💻 പഴയ ലാപ്ടോപ്പ് അല്ലെങ്കിൽ കമ്പ്യൂട്ടർ നൽകാം',
      '📱 കൂട്ടുകാർക്ക് NakshaBot പങ്കുവെക്കൂ',
      '📮 വിലാസം: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  gu: {
    label: 'ગુજરાતી',
    title: 'NakshaBot બનાવનાર વિદ્યાર્થીને મદદ કરો',
    subtitle: 'લેપટોપ વગર, સાયબર કેફેમાંથી બનાવ્યું',
    pitch: 'નમસ્તે! હું NakshaBot નો વિદ્યાર્થી-ડેવલપર છું. મારી પાસે લેપટોપ ન હોવાથી મેં સાયબર કેફેમાં કલાકના હિસાબે પૈસા આપીને આ એપ બનાવી છે. જો આ એપથી તમારું કામ સરળ થયું હોય, તો ₹50 કે ₹100 નું નાનું દાન મારા અભ્યાસ માટે ખૂબ મદદરૂપ થશે. 🙏',
    scanLabel: 'કોઈપણ UPI એપ વડે QR કોડ સ્કેન કરો',
    chooseAmt: 'રકમ પસંદ કરો',
    orCustom: 'અથવા કસ્ટમ રકમ',
    namePlaceholder: 'તમારું નામ (વૈકલ્પિક)',
    upiPay: 'UPI દ્વારા પે કરો',
    cashfree: 'Cashfree દ્વારા પે કરો',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp પર શેર કરો',
    cantHelp: 'માફ કરશો, હું અત્યારે મદદ કરી શકતો નથી',
    mute: 'પછી યાદ દેવડાવો',
    impactMap: { 50: '= એક દિવસનું શાળાનું ભોજન 🍱', 100: '= એક અઠવાડિયાનો અભ્યાસ ખર્ચ ✏️', 500: '= એક મહિનાનું ઇન્ટરનેટ 💻', 1000: '= પરીક્ષા ફોર્મ ફી 🎓' },
    otherWaysTitle: 'જૂનું Laptop અથવા Computer દાન કરી શકો છો',
    otherWays: [
      '💻 જૂનું Laptop અથવા Computer દાન કરી શકો છો',
      '📱 મિત્રો સાથે NakshaBot શેર કરો',
      '📮 સરનામું: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
  pa: {
    label: 'ਪੰਜਾਬੀ',
    title: 'NakshaBot ਬਣਾਉਣ ਵਾਲੇ ਵਿਦਿਆਰਥੀ ਦੀ ਮਦਦ ਕਰੋ',
    subtitle: 'ਬਿਨਾਂ ਲੈਪਟਾਪ ਦੇ, ਸਾਈਬਰ ਕੈਫੇ ਤੋਂ ਬਣਾਇਆ',
    pitch: 'ਸਤਿ ਸ਼੍ਰੀ ਅਕਾਲ! ਮੈਂ NakshaBot ਦਾ ਵਿਦਿਆਰਥੀ ਡਿਵੈਲਪਰ ਹਾਂ। ਲੈਪਟਾਪ ਨਾ ਹੋਣ ਕਰਕੇ ਮੈਂ ਇਹ ਐਪ ਸਾਈਬਰ ਕੈਫੇ ਤੋਂ ਪੈਸੇ ਦੇ ਕੇ ਬਣਾਇਆ ਹੈ। ਜੇਕਰ ਇਸ ਐਪ ਨੇ ਤੁਹਾਡੀ ਮਦਦ ਕੀਤੀ ਹੈ, ਤਾਂ ₹50 ਜਾਂ ₹100 ਦੀ ਛੋਟੀ ਜਿਹੀ ਮਦਦ ਨਾਲ ਮੇਰੀ ਪੜ੍ਹਾਈ ਵਿੱਚ ਯੋਗਦਾਨ ਪਾਓ। 🙏',
    scanLabel: 'ਕਿਸੇ ਵੀ UPI ਐਪ ਨਾਲ QR ਸਕੈਨ ਕਰੋ',
    chooseAmt: 'ਰਕਮ ਚੁਣੋ',
    orCustom: 'ਜਾਂ ਆਪਣੀ ਰਕਮ ਲਿਖੋ',
    namePlaceholder: 'ਤੁਹਾਡਾ ਨਾਮ (ਵਿਕਲਪਿਕ)',
    upiPay: 'UPI ਰਾਹੀਂ ਪੇਅ ਕਰੋ',
    cashfree: 'Cashfree ਰਾਹੀਂ ਪੇਅ ਕਰੋ',
    upiBackup: 'UPI ID: 8318810984-1@nyes',
    waShare: 'WhatsApp ਤੇ ਸ਼ੇਅਰ ਕਰੋ',
    cantHelp: 'ਮਾਫ ਕਰਨਾ, ਮੈਂ ਹੁਣੇ ਮਦਦ ਨਹੀਂ ਕਰ ਸਕਦਾ',
    mute: 'ਬਾਅਦ ਵਿੱਚ ਯਾਦ ਕਰਵਾਓ',
    impactMap: { 50: '= ਇੱਕ ਦਿਨ ਦਾ ਸਕੂਲ ਲੰਚ 🍱', 100: '= ਇੱਕ ਹਫਤੇ ਦੀ ਪੜ੍ਹਾਈ ਮਦਦ ✏️', 500: '= ਇੱਕ ਮਹੀਨੇ ਦਾ ਇੰਟਰਨੈਟ 💻', 1000: '= ਪ੍ਰੀਖਿਆ ਫਾਰਮ ਫੀਸ 🎓' },
    otherWaysTitle: 'ਪੁਰਾਣਾ ਲੈਪਟਾਪ ਜਾਂ ਕੰਪਿਊਟਰ ਦਾਨ ਕਰ ਸਕਦੇ ਹੋ',
    otherWays: [
      '💻 ਪੁਰਾਣਾ ਲੈਪਟਾਪ ਜਾਂ ਕੰਪਿਊਟਰ ਦਾਨ ਕਰ ਸਕਦੇ ਹੋ',
      '📱 ਦੋਸਤਾਂ ਨਾਲ NakshaBot ਸ਼ੇਅਰ ਕਰੋ',
      '📮 ਪਤਾ: Kratagya Singh, L89 Lachhaniya Purwa Rooma, Kanpur Nagar, UP - 208020'
    ],
  },
};

const STATE_LANG_MAP: Record<string, LangKey> = {
  'West Bengal': 'bn', 'WB': 'bn',
  'Assam': 'as', 'AS': 'as',
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
  'Maharashtra': 'mr', 'MH': 'mr',
  'Tamil Nadu': 'ta', 'TN': 'ta',
  'Andhra Pradesh': 'te', 'AP': 'te',
  'Telangana': 'te', 'TG': 'te', 'TS': 'te',
  'Karnataka': 'kn', 'KA': 'kn',
  'Kerala': 'ml', 'KL': 'ml',
  'Gujarat': 'gu', 'GJ': 'gu',
  'Punjab': 'pa', 'PB': 'pa',
};

const fixedAmounts = [50, 100, 500, 1000];
const WA_SHARE_TEXT = `मैंने एक साथी छात्र की मदद की 🙏\n\nNakshaBot से HLB नक्शा मिनटों में — बिल्कुल मुफ्त!\n\nTry it: https://examsetu.dev`;
const VIDEO_URL = "https://ybrtqteoagkptglqedsw.supabase.co/storage/v1/object/sign/t/Video%20Project%201%20(1)%20(1)%20(1).mp4?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9lM2I3OGM3OC1lNTFlLTQ1MzEtOTViMC1iY2VkMTMwZGE2ZjAiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJ0L1ZpZGVvIFByb2plY3QgMSAoMSkgKDEpICgxKS5tcDQiLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg2MTk2OTQ3LCJleHAiOjE4MTc3MzI5NDd9.GcUdabBxHfEFMqu9Z8WNIIwcqHzmEH_dx8On46weUZc";

export default function DonationPopup({ isOpen, onClose, onMute24h, isPrintArea, initialAmount, initialNote }: Props) {
  const [lang, setLang] = useState<LangKey>('en'); // Default to English
  const [customAmount, setCustomAmount] = useState(initialAmount || '100');
  const [customNote, setCustomNote] = useState(initialNote || '');
  const [copiedText, setCopiedText] = useState<'upi' | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [redirectingToCashfree, setRedirectingToCashfree] = useState(false);
  const [redirectAmount, setRedirectAmount] = useState(100);
  const [showOtherWays, setShowOtherWays] = useState(false);
  const [geoLoading, setGeoLoading] = useState(true);

  // Sync initialAmount if changed
  useEffect(() => {
    if (initialAmount) setCustomAmount(initialAmount);
    if (initialNote) setCustomNote(initialNote);
  }, [initialAmount, initialNote]);

  // Automatic Location Detection on Mount
  useEffect(() => {
    if (isOpen) {
      // Reset redirection state when opening afresh
      setRedirectingToCashfree(false);
      // Check cached language first to completely avoid repeated 429 API rate limits
      const cachedLang = sessionStorage.getItem('naksha_detected_lang') as LangKey | null;
      if (cachedLang && LANG_CONTENT[cachedLang]) {
        setLang(cachedLang);
        setGeoLoading(false);
        return;
      }

      setGeoLoading(true);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);

      fetch('https://ipapi.co/json/', { signal: controller.signal })
        .then(r => {
          if (!r.ok) throw new Error(`HTTP error ${r.status}`);
          return r.json();
        })
        .then((d: any) => {
          const region: string = d?.region || d?.region_name || d?.city || '';
          const detectedLang = STATE_LANG_MAP[region] ?? 'en';
          setLang(detectedLang);
          sessionStorage.setItem('naksha_detected_lang', detectedLang);
        })
        .catch(() => {
          // Browser locale fallback if location API is rate limited or unavailable
          const userLang = navigator.language || '';
          let fallback: LangKey = 'en';
          if (userLang.startsWith('hi')) fallback = 'hi';
          else if (userLang.startsWith('bn')) fallback = 'bn';
          else if (userLang.startsWith('ta')) fallback = 'ta';
          else if (userLang.startsWith('as')) fallback = 'as';
          setLang(fallback);
          sessionStorage.setItem('naksha_detected_lang', fallback);
        })
        .finally(() => { clearTimeout(timer); setGeoLoading(false); });

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const L = LANG_CONTENT[lang] || LANG_CONTENT.en;
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
    setRedirectingToCashfree(true);
    setRedirectAmount(amt);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const donorName = customNote || user?.user_metadata?.full_name || user?.email || 'Donor';
      const { data: don, error: donErr } = await supabase
        .from('donations').insert({
          amount: amt, name: donorName, note: customNote || 'NakshaBot Donation',
          user_id: user?.id || null, payment_status: 'unpaid'
        }).select('id').single();
      if (donErr || !don) throw new Error(donErr?.message || 'Failed to create donation');

      // Persist pending donation to recovery storage
      savePendingDonation({
        id: don.id,
        amount: amt,
        note: customNote || 'NakshaBot Donation',
        donorName,
        initiatedAt: Date.now()
      });

      const { data: cfRes, error: cfErr } = await supabase.functions.invoke('create-cashfree-payment', {
        body: { kind: 'donation', projectId: don.id }
      });
      if (cfErr || !cfRes?.paymentSessionId) throw new Error('Failed to initiate payment');

      savePendingDonation({
        id: don.id,
        amount: amt,
        note: customNote || 'NakshaBot Donation',
        donorName,
        paymentSessionId: cfRes.paymentSessionId,
        initiatedAt: Date.now()
      });

      const cashfree = await load({ mode: cfRes.cashfreeMode === 'production' ? 'production' : 'sandbox' });
      if (cashfree) {
        await cashfree.checkout({ paymentSessionId: cfRes.paymentSessionId, redirectTarget: '_self' });
      } else {
        throw new Error('Cashfree SDK failed to load');
      }
    } catch (err: any) {
      setRedirectingToCashfree(false);
      alert('Payment error: ' + err.message);
    } finally {
      setLoadingPayment(false);
    }
  };

  const LANG_CYCLE: LangKey[] = ['en', 'hi', 'bn', 'as', 'mr', 'ta', 'te', 'kn', 'ml', 'gu', 'pa'];

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
      </div>
    </div>
  );

  return (
    <>
    <Sheet open={isOpen} onClose={undefined} title={headerTitle} maxWidth="sm">
      <div className="space-y-4 text-sm text-[var(--color-ink)] pb-2">

        {/* ── PITCH CARD WITH HIGHLIGHTED VIDEO LINK ── */}
        <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-orange-50 border border-orange-200/90 rounded-2xl p-4 shadow-sm space-y-3">
          <p className="text-xs leading-relaxed text-slate-700 font-medium">{L.pitch}</p>

          {/* Highlighted Small Video Link */}
          <div className="pt-2 border-t border-orange-200/70 flex items-center justify-between gap-2">
            <a
              href={VIDEO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 text-xs font-bold text-orange-800 bg-orange-100/90 hover:bg-orange-200/90 border border-orange-300 px-3 py-1.5 rounded-xl transition-all shadow-xs"
            >
              <span>🎥 Watch Video: Story of building NakshaBot</span>
              <span className="text-[10px] text-orange-600 group-hover:translate-x-0.5 transition-transform">↗</span>
            </a>
            <span className="text-[10px] text-orange-600 font-bold bg-orange-100 px-2 py-0.5 rounded-md">100% Free App</span>
          </div>
        </div>

        {/* ── ENLARGED & CLEAN QR CODE SECTION ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-4 flex flex-col items-center text-center space-y-3">
          <p className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
            <span>📷</span>
            <span>{L.scanLabel}</span>
          </p>

          {/* Huge Unobstructed QR Code Image */}
          <div className="w-full max-w-[260px] sm:max-w-[280px] bg-white rounded-2xl border-2 border-orange-200 shadow-xl overflow-hidden p-1">
            <img
              src="/images/donation_qr.jpg"
              alt="UPI QR Code for Donation"
              className="w-full h-auto object-contain rounded-xl bg-white"
              onError={(e) => { (e.target as any).style.display = 'none'; }}
            />
          </div>

          {/* Prominent Copyable UPI ID Row */}
          <div className="w-full max-w-xs flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2">
            <div className="flex-1 text-left px-1">
              <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider">Direct UPI ID</span>
              <span className="text-xs font-mono font-bold text-slate-800">8318810984-1@nyes</span>
            </div>
            <button
              type="button"
              onClick={() => handleCopy('8318810984-1@nyes')}
              className="py-1.5 px-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer shrink-0 active:scale-95"
            >
              {copiedText === 'upi' ? '✓ Copied' : 'Copy ID'}
            </button>
          </div>
        </div>

        {/* ── AMOUNT SELECTION ── */}
        <div className="space-y-2 bg-slate-50/70 p-3 rounded-2xl border border-slate-200/80">
          <div className="flex justify-between items-center">
            <p className="text-xs font-black text-slate-600 uppercase tracking-wider">{L.chooseAmt}</p>
            {impactText && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                ₹{selectedAmt} {impactText}
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {fixedAmounts.map(amt => {
              const isSelected = customAmount === String(amt);
              const isBest = amt === 100;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setCustomAmount(String(amt))}
                  className={`relative py-2.5 text-center text-xs font-black rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-300'
                      : isBest
                      ? 'bg-amber-50 border-2 border-amber-300 text-amber-900 hover:bg-amber-100'
                      : 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {isBest && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 text-amber-950 text-[7.5px] font-black px-1.5 py-px rounded-full shadow-xs">
                      ⭐ Recommended
                    </span>
                  )}
                  ₹{amt}
                </button>
              );
            })}
          </div>

          {/* Custom amount & name */}
          <div className="flex gap-2 items-center pt-1">
            <input
              type="number"
              value={customAmount}
              onChange={e => setCustomAmount(e.target.value)}
              placeholder="Custom ₹"
              min="1"
              className="w-28 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 outline-none"
            />
            <input
              type="text"
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder={L.namePlaceholder}
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-orange-400 outline-none"
            />
          </div>
        </div>

        {/* ── PAY BUTTONS ── */}
        <div className="flex gap-2">
          <a
            href={upiLink}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-center font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-98"
          >
            📱 {L.upiPay}
          </a>
          <Button
            type="button"
            variant="filled"
            disabled={loadingPayment}
            className="flex-1 py-3 text-xs font-black rounded-xl shadow-md"
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

        {/* ── OTHER WAYS TO HELP ── */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowOtherWays(v => !v)}
            className="w-full flex items-center justify-between px-3.5 py-2 bg-slate-50 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <span>💻 {L.otherWaysTitle}</span>
            <span className="text-slate-400">{showOtherWays ? '▲' : '▼'}</span>
          </button>
          {showOtherWays && (
            <div className="px-3.5 py-2.5 space-y-1.5 bg-white border-t border-slate-100">
              {L.otherWays.map((way, i) => (
                <p key={i} className="text-[11px] text-slate-600 leading-relaxed font-medium">{way}</p>
              ))}
            </div>
          )}
        </div>

        {/* ── LANGUAGE SWITCHER & DISMISS BUTTON ── */}
        <div className="pt-2 border-t border-slate-200/80 space-y-2">
          {/* Language Selector Selector */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-[10px] font-bold text-slate-400">Language:</span>
            <select
              value={lang}
              onChange={e => setLang(e.target.value as LangKey)}
              className="text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 outline-none cursor-pointer"
            >
              {LANG_CYCLE.map(k => (
                <option key={k} value={k}>
                  🌐 {LANG_CONTENT[k].label}
                </option>
              ))}
            </select>
          </div>

          {/* Dismiss Button */}
          <button
            type="button"
            onClick={isPrintArea ? onClose : onMute24h}
            disabled={loadingPayment}
            className="w-full py-2.5 px-3 bg-gradient-to-r from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 text-rose-700 hover:text-rose-900 border border-rose-300/80 font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98 disabled:opacity-50"
          >
            <span>😞 {isPrintArea ? L.cantHelp : L.mute}</span>
            <span className="text-[10px] bg-rose-200/80 text-rose-900 px-1.5 py-0.5 rounded font-bold">✕ Close</span>
          </button>
        </div>

      </div>
    </Sheet>

    {/* ── REDIRECTING TO CASHFREE SECURE MODAL ── */}
    {redirectingToCashfree && (
      <div className="fixed inset-0 z-[99999] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-sm w-full shadow-2xl border border-orange-200/80 text-center space-y-5 relative overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Top decorative gradient bar */}
          <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-500" />
          
          {/* Animated Shield Beacon */}
          <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
            <div className="absolute inset-0 rounded-full bg-orange-400/20 animate-ping" />
            <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white flex items-center justify-center text-3xl shadow-lg shadow-orange-500/30">
              🔒
            </div>
          </div>

          <div className="space-y-1.5">
            <h3 className="text-lg font-black text-slate-900 font-public-sans tracking-tight">
              Redirecting to Cashfree
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              Establishing 256-bit SSL encrypted secure checkout
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <span className="text-xs font-semibold text-orange-950">Contribution Amount</span>
            <span className="text-base font-black text-orange-600 font-public-sans">₹{redirectAmount}</span>
          </div>

          <div className="flex items-center justify-center gap-2 text-[11px] font-semibold text-slate-600">
            <svg className="animate-spin h-4 w-4 text-orange-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Transferring to payment page…</span>
          </div>

          <p className="text-[10px] text-slate-400 font-medium">
            ⚠️ Please do not close, refresh, or press back.
          </p>
        </div>
      </div>
    )}
    </>
  );
}
