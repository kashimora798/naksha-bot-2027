import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const stateData: Record<string, any> = {
  UP: {
    name: 'Uttar Pradesh',
    title: 'UP Census 2027 Nazari Naksha Maker | Kanpur Lucknow HLB Map',
    desc: 'Generate your Uttar Pradesh enumeration block map and HLB naksha instantly for Census 2027. Ideal for Kanpur, Lucknow, and all UP districts.',
    cities: 'Kanpur, Lucknow, Varanasi, Agra, and Meerut',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'up-census-map',
    keywords: 'Uttar Pradesh census map, UP HLO map maker, UP nazari naksha, UP HLB map, Kanpur census map, Lucknow nazari naksha, free Uttar Pradesh census map maker, नजरी नक्शा'
  },
  MH: {
    name: 'Maharashtra',
    title: 'Maharashtra Census 2027 HLB Map | Mumbai Pune Nazari Naksha Online',
    desc: 'Download your Census Layout Map for Maharashtra. Auto-generate your enumeration block map for Mumbai, Pune, Nagpur, and all districts.',
    cities: 'Mumbai, Pune, Nagpur, Nashik, and Thane',
    localTerm: 'प्रगणक नजरी नकाशा (Praganak Nazari Nakasha)',
    slug: 'maharashtra-census-map',
    keywords: 'Maharashtra census map, Maharashtra HLO map maker, Maharashtra nazari naksha, Maharashtra HLB map, Mumbai census map, Pune nazari naksha, free Maharashtra census map maker, प्रगणक नजरी नकाशा'
  },
  BR: {
    name: 'Bihar',
    title: 'Bihar Census 2027 Map Enumerator | Patna Gaya HLB Naksha Generator',
    desc: 'Create your Bihar Nazari Naksha online. Automate your HLB mapping for Patna, Gaya, Muzaffarpur and across Bihar for Census 2027.',
    cities: 'Patna, Gaya, Bhagalpur, Muzaffarpur, and Purnia',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'bihar-census-map',
    keywords: 'Bihar census map, Bihar HLO map maker, Bihar nazari naksha, Bihar HLB map, Patna census map, Gaya nazari naksha, free Bihar census map maker, नजरी नक्शा'
  },
  MP: {
    name: 'Madhya Pradesh',
    title: 'MP Census 2027 Nazari Naksha | Bhopal Indore HLB Map Generator',
    desc: 'Madhya Pradesh HLB map generator for Census 2027. Instantly draft your enumeration block maps for Bhopal, Indore, Gwalior and Jabalpur.',
    cities: 'Indore, Bhopal, Jabalpur, Gwalior, and Ujjain',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'mp-census-map',
    keywords: 'Madhya Pradesh census map, MP HLO map maker, MP nazari naksha, MP HLB map, Bhopal census map, Indore nazari naksha, free Madhya Pradesh census map maker, नजरी नक्शा'
  },
  RJ: {
    name: 'Rajasthan',
    title: 'Rajasthan Census 2027 Map | Jaipur Jodhpur HLB Naksha',
    desc: 'The best Rajasthan enumeration map tool. Create your HLB naksha for Jaipur, Jodhpur, Udaipur, and all Rajasthan districts instantly.',
    cities: 'Jaipur, Jodhpur, Kota, Bikaner, and Udaipur',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'rajasthan-census-map',
    keywords: 'Rajasthan census map, Rajasthan HLO map maker, Rajasthan nazari naksha, Rajasthan HLB map, Jaipur census map, Jodhpur nazari naksha, free Rajasthan census map maker, नजरी नक्शा'
  },
  HP: {
    name: 'Himachal Pradesh',
    title: 'HP Census 2027 Nazari Naksha | Shimla Mandi HLB Map',
    desc: 'Generate your HP girdawari naksha and HLB map for Census 2027. Perfect for mountainous terrain in Shimla, Mandi, Kangra, and Kullu.',
    cities: 'Shimla, Mandi, Kangra, Solan, and Kullu',
    localTerm: 'गिरदावरी / नजरी नक्शा (Girdawari / Nazari Naksha)',
    slug: 'hp-census-map',
    keywords: 'Himachal Pradesh census map, HP HLO map maker, HP nazari naksha, HP HLB map, Shimla census map, Mandi nazari naksha, free Himachal Pradesh census map maker, गिरदावरी नजरी नक्शा'
  },
  KL: {
    name: 'Kerala',
    title: 'Kerala Census 2027 Layout Map | Malappuram Kozhikode HLB Naksha',
    desc: 'Census map generator for Kerala panchayats. Generate Malayalam HLB maps for Malappuram, Kozhikode, Ernakulam and Thiruvananthapuram.',
    cities: 'Thiruvananthapuram, Kochi, Kozhikode, Thrissur, and Malappuram',
    localTerm: 'സെൻസസ് ഭൂപടം (Census Map)',
    slug: 'kerala-census-map',
    keywords: 'Kerala census map, Kerala HLO map maker, Kerala nazari naksha, Kerala HLB map, Thiruvananthapuram census map, Kochi nazari naksha, free Kerala census map maker, സെൻസസ് ഭൂപടം'
  },
  WB: {
    name: 'West Bengal',
    title: 'West Bengal Census 2027 Naksha | Kolkata HLB Map Generator',
    desc: 'Bengali enumerator map for Census 2027. Generate your Paschim Banga jaganana naksha and HLB map online for Kolkata, Howrah, and more.',
    cities: 'Kolkata, Howrah, Darjeeling, Siliguri, and Asansol',
    localTerm: 'জনগণনা নকশা (Jaganana Naksha)',
    slug: 'west-bengal-census-map',
    keywords: 'West Bengal census map, West Bengal HLO map maker, West Bengal nazari naksha, West Bengal HLB map, Kolkata census map, Howrah nazari naksha, free West Bengal census map maker, জনগণনা নকশা'
  },
  TN: {
    name: 'Tamil Nadu',
    title: 'Tamil Nadu Census 2027 HLB Map | Chennai Enumeration Block Map',
    desc: 'Generate your Tamil Nadu house listing block map. The best enumerator tool for Chennai, Coimbatore, Madurai and all TN districts.',
    cities: 'Chennai, Coimbatore, Madurai, Tiruchirappalli, and Salem',
    localTerm: 'கணக்கெடுப்பு வரைபடம் (Kanakkeduppu Varaipadam)',
    slug: 'tamil-nadu-census-map',
    keywords: 'Tamil Nadu census map, Tamil Nadu HLO map maker, Tamil Nadu nazari naksha, Tamil Nadu HLB map, Chennai census map, Coimbatore nazari naksha, free Tamil Nadu census map maker, கணக்கெடுப்பு வரைபடம்'
  },
  KA: {
    name: 'Karnataka',
    title: 'Karnataka Census 2027 Nazari Naksha | Bangalore HLB Map Generator',
    desc: 'Karnataka enumeration block map generator. Draft your HLB map for Bangalore, Mysore, Hubli, and Mangalore instantly.',
    cities: 'Bangalore, Mysore, Hubli, Mangalore, and Belagavi',
    localTerm: 'ಜನಗಣತಿ ನಕ್ಷೆ (Janaganati Nakshe)',
    slug: 'karnataka-census-map',
    keywords: 'Karnataka census map, Karnataka HLO map maker, Karnataka nazari naksha, Karnataka HLB map, Bangalore census map, Mysore nazari naksha, free Karnataka census map maker, ಜನಗಣತಿ ನಕ್ಷೆ'
  },
  GJ: {
    name: 'Gujarat',
    title: 'Gujarat Census 2027 Map | Ahmedabad Surat HLB Naksha',
    desc: 'Gujarati pragnanak naksha maker. Generate your HLB naksha for Ahmedabad, Surat, Vadodara, and Rajkot for Census 2027.',
    cities: 'Ahmedabad, Surat, Vadodara, Rajkot, and Bhavnagar',
    localTerm: 'વસ્તી ગણતરી નકશો (Vasti Ganatari Naksho)',
    slug: 'gujarat-census-map',
    keywords: 'Gujarat census map, Gujarat HLO map maker, Gujarat nazari naksha, Gujarat HLB map, Ahmedabad census map, Surat nazari naksha, free Gujarat census map maker, વસ્તી ગણતરી નકશો'
  },
  PBHR: {
    name: 'Punjab & Haryana',
    title: 'Punjab & Haryana Census 2027 HLB Map | Chandigarh Naksha Generator',
    desc: 'Generate your enumeration block naksha for Punjab, Haryana, and Chandigarh. The best map generator for Census 2027.',
    cities: 'Chandigarh, Ludhiana, Amritsar, Faridabad, and Gurugram',
    localTerm: 'ਜਨਗਣਨਾ ਨਕਸ਼ਾ / जनगड़ना नक्शा (Janaganana Naksha)',
    slug: 'punjab-haryana-census-map',
    keywords: 'Punjab Haryana census map, Punjab HLO map maker, Haryana nazari naksha, Punjab HLB map, Chandigarh census map, Ludhiana nazari naksha, free Punjab Haryana census map maker, ਜਨਗਣਨਾ ਨਕਸ਼ਾ'
  },
  UK: {
    name: 'Uttarakhand',
    title: 'Uttarakhand Census 2027 HLO Map Maker | Dehradun Haridwar Nazari Naksha',
    desc: 'Create your Uttarakhand HLO nazari naksha online free. Auto-generate HLB block maps for Dehradun, Haridwar, Nainital, and all UK districts for Census 2027.',
    cities: 'Dehradun, Haridwar, Nainital, Haldwani, and Rishikesh',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'uttarakhand-census-map',
    keywords: 'Uttarakhand census map, Uttarakhand HLO map maker, Uttarakhand nazari naksha, Uttarakhand HLB map, Dehradun census map, Haridwar nazari naksha, free Uttarakhand census map maker, नजरी नक्शा'
  },
  JH: {
    name: 'Jharkhand',
    title: 'Jharkhand Census 2027 Map Maker | Ranchi Jamshedpur HLB Nazari Naksha',
    desc: 'Generate your Jharkhand HLB nazari naksha for Census 2027 free. Best HLO map maker tool for Ranchi, Jamshedpur, Dhanbad, and all Jharkhand districts.',
    cities: 'Ranchi, Jamshedpur, Dhanbad, Bokaro, and Hazaribagh',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'jharkhand-census-map',
    keywords: 'Jharkhand census map, Jharkhand HLO map maker, Jharkhand nazari naksha, Jharkhand HLB map, Ranchi census map, Jamshedpur nazari naksha, free Jharkhand census map maker, नजरी नक्शा'
  },
  OD: {
    name: 'Odisha',
    title: 'Odisha Census 2027 HLO Nazari Naksha | Bhubaneswar Cuttack HLB Map',
    desc: 'Free Odisha census map maker. Generate your HLO nazari naksha and HLB map for Bhubaneswar, Cuttack, Rourkela, and all Odisha districts instantly.',
    cities: 'Bhubaneswar, Cuttack, Rourkela, Berhampur, and Sambalpur',
    localTerm: 'ନକ୍ସା (Naksha)',
    slug: 'odisha-census-map',
    keywords: 'Odisha census map, Odisha HLO map maker, Odisha nazari naksha, Odisha HLB map, Bhubaneswar census map, Cuttack nazari naksha, free Odisha census map maker, ନକ୍ସା'
  },
  AS: {
    name: 'Assam',
    title: 'Assam Census 2027 Map Generator | Guwahati HLO Nazari Naksha Free',
    desc: 'Generate your Assam HLB nazari naksha for Census 2027. Free HLO map maker for Guwahati, Dibrugarh, Silchar, Jorhat, and all Assam districts.',
    cities: 'Guwahati, Dibrugarh, Silchar, Jorhat, and Tezpur',
    localTerm: 'লেআউট মেপ (Layout Map)',
    slug: 'assam-census-map',
    keywords: 'Assam census map, Assam HLO map maker, Assam nazari naksha, Assam HLB map, Guwahati census map, Dibrugarh nazari naksha, free Assam census map maker, লেআউট মেপ'
  },
  CG: {
    name: 'Chhattisgarh',
    title: 'Chhattisgarh Census 2027 HLB Map | Raipur Bilaspur Nazari Naksha Maker',
    desc: 'Best Chhattisgarh HLO map maker. Create your census nazari naksha free for Raipur, Bilaspur, Durg, Korba, and all CG districts.',
    cities: 'Raipur, Bilaspur, Durg, Korba, and Bhilai',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'chhattisgarh-census-map',
    keywords: 'Chhattisgarh census map, Chhattisgarh HLO map maker, Chhattisgarh nazari naksha, Chhattisgarh HLB map, Raipur census map, Bilaspur nazari naksha, free Chhattisgarh census map maker, नजरी नक्शा'
  },
  TS: {
    name: 'Telangana',
    title: 'Telangana Census 2027 HLO Map | Hyderabad Warangal HLB Nazari Naksha',
    desc: 'Free Telangana census map maker. Generate your nazari naksha and HLO map for Hyderabad, Warangal, Nizamabad, and Karimnagar districts.',
    cities: 'Hyderabad, Warangal, Nizamabad, Karimnagar, and Khammam',
    localTerm: 'జనగణన మ్యాప్ (Janaganana Map)',
    slug: 'telangana-census-map',
    keywords: 'Telangana census map, Telangana HLO map maker, Telangana nazari naksha, Telangana HLB map, Hyderabad census map, Warangal nazari naksha, free Telangana census map maker, జనగణన మ్యాప్'
  },
  AP: {
    name: 'Andhra Pradesh',
    title: 'AP Census 2027 HLB Map Maker | Visakhapatnam Vijayawada Nazari Naksha',
    desc: 'Andhra Pradesh HLO nazari naksha maker free. Generate your HLB census map for Visakhapatnam, Vijayawada, Guntur, Tirupati, and all AP districts.',
    cities: 'Visakhapatnam, Vijayawada, Guntur, Tirupati, and Nellore',
    localTerm: 'జనగణన నక్షా (Janaganana Naksha)',
    slug: 'andhra-pradesh-census-map',
    keywords: 'Andhra Pradesh census map, AP HLO map maker, AP nazari naksha, AP HLB map, Visakhapatnam census map, Vijayawada nazari naksha, free Andhra Pradesh census map maker, జనగణన నక్షా'
  },
  JK: {
    name: 'Jammu & Kashmir',
    title: 'J&K Census 2027 Map Maker | Srinagar Jammu HLO Nazari Naksha',
    desc: 'Create your Jammu & Kashmir census nazari naksha online free. HLO map maker for Srinagar, Jammu, Anantnag, Baramulla districts.',
    cities: 'Srinagar, Jammu, Anantnag, Baramulla, and Udhampur',
    localTerm: 'نظری نقشہ / नजरी नक्शा',
    slug: 'jk-census-map',
    keywords: 'Jammu Kashmir census map, J&K HLO map maker, J&K nazari naksha, J&K HLB map, Srinagar census map, Jammu nazari naksha, free Jammu Kashmir census map maker, نظری نقشہ'
  },
  DL: {
    name: 'Delhi NCR',
    title: 'Delhi Census 2027 HLB Map Maker | NCR HLO Nazari Naksha Generator',
    desc: 'Delhi NCR census map maker free. Generate your HLO nazari naksha for all Delhi districts — North, South, East, West Delhi and NCR areas.',
    cities: 'New Delhi, Dwarka, Rohini, Shahdara, and Noida',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'delhi-census-map',
    keywords: 'Delhi census map, Delhi HLO map maker, Delhi nazari naksha, Delhi HLB map, New Delhi census map, NCR nazari naksha, free Delhi census map maker, नजरी नक्शा'
  },
  GA: {
    name: 'Goa',
    title: 'Goa Census 2027 HLO Map | Panaji Margao HLB Nazari Naksha Free',
    desc: 'Generate your Goa census nazari naksha online free. HLO map maker for Panaji, Margao, Vasco, Mapusa, and all Goa panchayats.',
    cities: 'Panaji, Margao, Vasco da Gama, Mapusa, and Ponda',
    localTerm: 'जनगणना नकाशा (Janaganana Nakasha)',
    slug: 'goa-census-map',
    keywords: 'Goa census map, Goa HLO map maker, Goa nazari naksha, Goa HLB map, Panaji census map, Margao nazari naksha, free Goa census map maker, जनगणना नकाशा'
  },
  TR: {
    name: 'Tripura',
    title: 'Tripura Census 2027 Map Maker | Agartala HLO HLB Nazari Naksha',
    desc: 'Free Tripura census map maker. Generate HLO nazari naksha and HLB maps for Agartala, Udaipur, Dharmanagar, and all Tripura districts.',
    cities: 'Agartala, Udaipur, Dharmanagar, Kailashahar, and Belonia',
    localTerm: 'লেআউট মেপ (Layout Map)',
    slug: 'tripura-census-map',
    keywords: 'Tripura census map, Tripura HLO map maker, Tripura nazari naksha, Tripura HLB map, Agartala census map, Udaipur nazari naksha, free Tripura census map maker, লেআউট মেপ'
  },
  ML: {
    name: 'Meghalaya',
    title: 'Meghalaya Census 2027 HLO Map | Shillong HLB Nazari Naksha Maker',
    desc: 'Generate your Meghalaya census map for Census 2027 free. HLO nazari naksha maker for Shillong, Tura, Jowai, and all Meghalaya districts.',
    cities: 'Shillong, Tura, Jowai, Nongstoin, and Williamnagar',
    localTerm: 'Census Map',
    slug: 'meghalaya-census-map',
    keywords: 'Meghalaya census map, Meghalaya HLO map maker, Meghalaya nazari naksha, Meghalaya HLB map, Shillong census map, Tura nazari naksha, free Meghalaya census map maker, Census Map'
  },
  MN: {
    name: 'Manipur',
    title: 'Manipur Census 2027 Map Generator | Imphal HLO HLB Nazari Naksha',
    desc: 'Free Manipur HLO map maker. Create your census nazari naksha for Imphal, Churachandpur, Thoubal, and all Manipur districts.',
    cities: 'Imphal, Churachandpur, Thoubal, Bishnupur, and Ukhrul',
    localTerm: 'মানচিত্র (Map)',
    slug: 'manipur-census-map',
    keywords: 'Manipur census map, Manipur HLO map maker, Manipur nazari naksha, Manipur HLB map, Imphal census map, Churachandpur nazari naksha, free Manipur census map maker, মানচিত্র'
  },
  NL: {
    name: 'Nagaland',
    title: 'Nagaland Census 2027 HLO Map Maker | Kohima Dimapur HLB Naksha',
    desc: 'Generate your Nagaland census nazari naksha free. HLO map maker for Kohima, Dimapur, Mokokchung, and all Nagaland districts.',
    cities: 'Kohima, Dimapur, Mokokchung, Tuensang, and Mon',
    localTerm: 'Census Map',
    slug: 'nagaland-census-map',
    keywords: 'Nagaland census map, Nagaland HLO map maker, Nagaland nazari naksha, Nagaland HLB map, Kohima census map, Dimapur nazari naksha, free Nagaland census map maker, Census Map'
  },
  MZ: {
    name: 'Mizoram',
    title: 'Mizoram Census 2027 Map | Aizawl HLO HLB Nazari Naksha Generator',
    desc: 'Free Mizoram HLO census map maker. Create your nazari naksha and HLB map for Aizawl, Lunglei, and all Mizoram districts.',
    cities: 'Aizawl, Lunglei, Champhai, Serchhip, and Kolasib',
    localTerm: 'Census Map',
    slug: 'mizoram-census-map',
    keywords: 'Mizoram census map, Mizoram HLO map maker, Mizoram nazari naksha, Mizoram HLB map, Aizawl census map, Lunglei nazari naksha, free Mizoram census map maker, Census Map'
  },
  SK: {
    name: 'Sikkim',
    title: 'Sikkim Census 2027 HLO Map Maker | Gangtok HLB Nazari Naksha Free',
    desc: 'Generate your Sikkim census nazari naksha online free. HLO map maker for Gangtok, Namchi, Mangan, and all Sikkim districts.',
    cities: 'Gangtok, Namchi, Mangan, Gyalshing, and Rangpo',
    localTerm: 'नजरी नक्शा (Nazari Naksha)',
    slug: 'sikkim-census-map',
    keywords: 'Sikkim census map, Sikkim HLO map maker, Sikkim nazari naksha, Sikkim HLB map, Gangtok census map, Namchi nazari naksha, free Sikkim census map maker, नजरी नक्शा'
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
        <meta name="keywords" content={data.keywords} />
        <link rel="canonical" href={`https://examsetu.dev/${data.slug}`} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={`https://examsetu.dev/${data.slug}`} />
        <meta property="og:title" content={data.title} />
        <meta property="og:description" content={data.desc} />
        <meta property="og:image" content="https://examsetu.dev/logo.png" />
        <meta property="og:site_name" content="NakshaBot" />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content={`https://examsetu.dev/${data.slug}`} />
        <meta property="twitter:title" content={data.title} />
        <meta property="twitter:description" content={data.desc} />
        <meta property="twitter:image" content="https://examsetu.dev/logo.png" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              { "@type": "Question", "name": `Is this valid for the ${data.name} Census 2027?`, "acceptedAnswer": { "@type": "Answer", "text": `Yes, the generated layout map follows the official guidelines required by the Registrar General of India and local charge officers in ${data.name}.` } },
              { "@type": "Question", "name": "How much does it cost?", "acceptedAnswer": { "@type": "Answer", "text": "NakshaBot is completely free to use. You can create, edit, preview, and download your final high-resolution PDF at no cost." } },
              { "@type": "Question", "name": `Does it work in rural areas of ${data.name}?`, "acceptedAnswer": { "@type": "Answer", "text": "Yes, we use the latest satellite data which works beautifully for both dense urban wards and remote rural panchayats." } }
            ]
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://examsetu.dev/" },
              { "@type": "ListItem", "position": 2, "name": `${data.name} Census Map`, "item": `https://examsetu.dev/${data.slug}` }
            ]
          })}
        </script>
      </Helmet>

      {/* ─── NAVIGATION ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[var(--color-surface)]/80 backdrop-blur-md border-b border-[var(--color-hairline)]">
        <div className="max-w-[1120px] mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-public-sans text-[var(--color-ink)] tracking-tight">NakshaBot</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/sign-in" className="text-sm font-semibold text-[var(--color-ink-secondary)] hover:text-[var(--color-ink)] transition-colors hidden sm:block">Log in</Link>
            <Link to="/sign-up" className="text-sm font-bold bg-[var(--color-accent)] text-white px-6 py-2.5 rounded-[var(--radius-full)] hover:bg-[var(--color-accent-hover)] transition-all shadow-[var(--shadow-sm)] inline-block">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="relative pt-32 pb-20 px-6 max-w-[1120px] mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[var(--radius-full)] bg-[var(--color-accent-tint)] text-[var(--color-accent)] font-semibold text-xs border border-indigo-200 shadow-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse"></span>
          {data.name} Enumeration Phase Active
        </div>
        
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-[var(--color-ink)] mb-6 font-public-sans">
          Create your {data.name} <span className="text-[var(--color-accent)]">HLB Map</span> for Census 2027.
        </h1>
        
        <p className="text-lg md:text-xl text-[var(--color-ink-secondary)] mb-10 max-w-2xl mx-auto leading-relaxed">
          Attention enumerators in {data.name}: Don't waste hours drawing the {data.localTerm} by hand. 
          NakshaBot uses satellite imagery to generate official enumeration block maps for {data.cities} and all districts instantly.
        </p>

        <Link to="/sign-up" className="inline-flex items-center justify-center px-8 py-4 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white font-bold rounded-[var(--radius-xl)] shadow-[var(--shadow-md)] transition-all text-base gap-2">
          Make Your Map Now →
        </Link>
      </section>

      {/* ─── HOW IT WORKS ─── */}
      <section className="py-16 bg-[var(--color-surface)] border-y border-[var(--color-hairline)]">
        <div className="max-w-[1120px] mx-auto px-6">
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

      {/* ─── EXPLORE OTHER STATES ─── */}
      <section className="py-16 bg-white border-t border-slate-200">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-center mb-8">Explore Census Maps for Other States</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {Object.entries(stateData).filter(([key]) => key !== stateKey).map(([key, s]: [string, any]) => (
              <Link key={key} to={`/${s.slug}`} className="text-sm text-slate-600 hover:text-orange-500 py-2 px-3 bg-slate-50 rounded-lg border border-slate-100 hover:border-orange-200 transition-colors text-center">
                {s.name}
              </Link>
            ))}
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
