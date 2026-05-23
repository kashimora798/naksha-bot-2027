import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const stateData: Record<string, any> = {
  UP: {
    name: 'Uttar Pradesh',
    title: 'UP Census 2027 Nazari Naksha Maker | Kanpur Lucknow HLB Map',
    desc: 'Generate your Uttar Pradesh enumeration block map and HLB naksha instantly for Census 2027. Ideal for Kanpur, Lucknow, and all UP districts.',
    cities: 'Kanpur, Lucknow, Varanasi, Agra, and Meerut',
    localTerm: 'नजरी नक्शा (Nazari Naksha)'
  },
  MH: {
    name: 'Maharashtra',
    title: 'Maharashtra Census 2027 HLB Map | Mumbai Pune Nazari Naksha Online',
    desc: 'Download your Census Layout Map for Maharashtra. Auto-generate your enumeration block map for Mumbai, Pune, Nagpur, and all districts.',
    cities: 'Mumbai, Pune, Nagpur, Nashik, and Thane',
    localTerm: 'प्रगणक नजरी नकाशा (Praganak Nazari Nakasha)'
  },
  BR: {
    name: 'Bihar',
    title: 'Bihar Census 2027 Map Enumerator | Patna Gaya HLB Naksha Generator',
    desc: 'Create your Bihar Nazari Naksha online. Automate your HLB mapping for Patna, Gaya, Muzaffarpur and across Bihar for Census 2027.',
    cities: 'Patna, Gaya, Bhagalpur, Muzaffarpur, and Purnia',
    localTerm: 'नजरी नक्शा (Nazari Naksha)'
  },
  MP: {
    name: 'Madhya Pradesh',
    title: 'MP Census 2027 Nazari Naksha | Bhopal Indore HLB Map Generator',
    desc: 'Madhya Pradesh HLB map generator for Census 2027. Instantly draft your enumeration block maps for Bhopal, Indore, Gwalior and Jabalpur.',
    cities: 'Indore, Bhopal, Jabalpur, Gwalior, and Ujjain',
    localTerm: 'नजरी नक्शा (Nazari Naksha)'
  },
  RJ: {
    name: 'Rajasthan',
    title: 'Rajasthan Census 2027 Map | Jaipur Jodhpur HLB Naksha',
    desc: 'The best Rajasthan enumeration map tool. Create your HLB naksha for Jaipur, Jodhpur, Udaipur, and all Rajasthan districts instantly.',
    cities: 'Jaipur, Jodhpur, Kota, Bikaner, and Udaipur',
    localTerm: 'नजरी नक्शा (Nazari Naksha)'
  },
  HP: {
    name: 'Himachal Pradesh',
    title: 'HP Census 2027 Nazari Naksha | Shimla Mandi HLB Map',
    desc: 'Generate your HP girdawari naksha and HLB map for Census 2027. Perfect for mountainous terrain in Shimla, Mandi, Kangra, and Kullu.',
    cities: 'Shimla, Mandi, Kangra, Solan, and Kullu',
    localTerm: 'गिरदावरी / नजरी नक्शा (Girdawari / Nazari Naksha)'
  },
  KL: {
    name: 'Kerala',
    title: 'Kerala Census 2027 Layout Map | Malappuram Kozhikode HLB Naksha',
    desc: 'Census map generator for Kerala panchayats. Generate Malayalam HLB maps for Malappuram, Kozhikode, Ernakulam and Thiruvananthapuram.',
    cities: 'Thiruvananthapuram, Kochi, Kozhikode, Thrissur, and Malappuram',
    localTerm: 'സെൻസസ് ഭൂപടം (Census Map)'
  },
  WB: {
    name: 'West Bengal',
    title: 'West Bengal Census 2027 Naksha | Kolkata HLB Map Generator',
    desc: 'Bengali enumerator map for Census 2027. Generate your Paschim Banga jaganana naksha and HLB map online for Kolkata, Howrah, and more.',
    cities: 'Kolkata, Howrah, Darjeeling, Siliguri, and Asansol',
    localTerm: 'জনগণনা নকশা (Jaganana Naksha)'
  },
  TN: {
    name: 'Tamil Nadu',
    title: 'Tamil Nadu Census 2027 HLB Map | Chennai Enumeration Block Map',
    desc: 'Generate your Tamil Nadu house listing block map. The best enumerator tool for Chennai, Coimbatore, Madurai and all TN districts.',
    cities: 'Chennai, Coimbatore, Madurai, Tiruchirappalli, and Salem',
    localTerm: 'கணக்கெடுப்பு வரைபடம் (Kanakkeduppu Varaipadam)'
  },
  KA: {
    name: 'Karnataka',
    title: 'Karnataka Census 2027 Nazari Naksha | Bangalore HLB Map Generator',
    desc: 'Karnataka enumeration block map generator. Draft your HLB map for Bangalore, Mysore, Hubli, and Mangalore instantly.',
    cities: 'Bangalore, Mysore, Hubli, Mangalore, and Belagavi',
    localTerm: 'ಜನಗಣತಿ ನಕ್ಷೆ (Janaganati Nakshe)'
  },
  GJ: {
    name: 'Gujarat',
    title: 'Gujarat Census 2027 Map | Ahmedabad Surat HLB Naksha',
    desc: 'Gujarati pragnanak naksha maker. Generate your HLB naksha for Ahmedabad, Surat, Vadodara, and Rajkot for Census 2027.',
    cities: 'Ahmedabad, Surat, Vadodara, Rajkot, and Bhavnagar',
    localTerm: 'વસ્તી ગણતરી નકશો (Vasti Ganatari Naksho)'
  },
  PBHR: {
    name: 'Punjab & Haryana',
    title: 'Punjab & Haryana Census 2027 HLB Map | Chandigarh Naksha Generator',
    desc: 'Generate your enumeration block naksha for Punjab, Haryana, and Chandigarh. The best map generator for Census 2027.',
    cities: 'Chandigarh, Ludhiana, Amritsar, Faridabad, and Gurugram',
    localTerm: 'ਜਨਗਣਨਾ ਨਕਸ਼ਾ / जनगड़ना नक्शा (Janaganana Naksha)'
  }
};

export default function StateLandingPage({ stateKey }: { stateKey: string }) {
  const data = stateData[stateKey];
  if (!data) return null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>{data.title}</title>
        <meta name="description" content={data.desc} />
      </Helmet>

      {/* ─── NAVIGATION ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-[Baloo_2] text-slate-800 tracking-tight">NakshaBot</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/sign-in" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors hidden sm:block">Log in</Link>
            <Link to="/sign-up" className="text-sm font-bold bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-slate-800 transition-all transform shadow-md inline-block">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="relative pt-32 pb-20 px-6 max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs border border-orange-200 shadow-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
          {data.name} Enumeration Phase Active
        </div>
        
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-900 mb-6 font-[Baloo_2]">
          Create your {data.name} <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">HLB Map</span> for Census 2027.
        </h1>
        
        <p className="text-lg md:text-xl text-slate-600 mb-10 leading-relaxed">
          Attention enumerators in {data.name}: Don't waste hours drawing the {data.localTerm} by hand. 
          NakshaBot uses satellite imagery to generate official enumeration block maps for {data.cities} and all districts instantly.
        </p>

        <Link to="/sign-up" className="inline-flex items-center justify-center px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:-translate-y-1 transition-all text-lg gap-2">
          Make Your Map Now →
        </Link>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-16 bg-white border-y border-slate-200">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-12">How it works for {data.name} Enumerators</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="text-4xl mb-4">📱</div>
              <h3 className="font-bold text-xl mb-2">1. Paste SMS</h3>
              <p className="text-slate-600">Paste your official assignment SMS containing the HLB coordinates.</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="text-4xl mb-4">🗺️</div>
              <h3 className="font-bold text-xl mb-2">2. Auto-Detect</h3>
              <p className="text-slate-600">Our tool overlays {data.name}'s satellite map and marks buildings automatically.</p>
            </div>
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <div className="text-4xl mb-4">🖨️</div>
              <h3 className="font-bold text-xl mb-2">3. Download PDF</h3>
              <p className="text-slate-600">Download your formatted {data.localTerm} ready for charge officer submission.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-10">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-2">Is this valid for the {data.name} Census 2027?</h3>
              <p className="text-slate-600">Yes, the generated layout map follows the official guidelines required by the Registrar General of India and local charge officers in {data.name}.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-2">How much does it cost?</h3>
              <p className="text-slate-600">NakshaBot is completely free to use. You can create, edit, preview, and download your final high-resolution PDF at no cost.</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-2">Does it work in rural areas of {data.name}?</h3>
              <p className="text-slate-600">Yes, we use the latest satellite data which works beautifully for both dense urban wards and remote rural panchayats.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="py-10 text-center text-slate-500 text-sm border-t border-slate-200 bg-white">
        <p>&copy; 2026 NakshaBot. Helping enumerators across {data.name}.</p>
        <div className="flex justify-center gap-4 mt-4">
          <Link to="/how-it-works" className="hover:text-slate-900">How it Works</Link>
          <Link to="/faq" className="hover:text-slate-900">FAQ</Link>
        </div>
      </footer>
    </div>
  );
}
