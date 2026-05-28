import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AiComparison from '../components/AiComparison/AiComparison';

export default function LandingScreen() {
  // Auth buttons will now navigate to /sign-in and /sign-up

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden selection:bg-orange-200">
      <Helmet>
        <title>HLB Map Maker Online | Nazri Naksha Generator - NakshaBot</title>
        <meta name="description" content="HLB map बनाएं 15 मिनट में। Census 2027 के लिए nazri naksha online maker। SMS paste करें, AI map बनाएं, ₹20 में A4 PDF download करें। HLO ready format।" />
        <meta name="keywords" content="HLO map maker, HLB map maker, HLO nazari naksha, free nazari naksha maker, nazari naksha online, census 2027 map maker, HLB map generator, census map maker free, नजरी नक्शा, HLO नक्शा बनाओ, जनगणना नक्शा ऑनलाइन, फ्री नजरी नक्शा मेकर, जनगणना 2027 नक्शा, HLO map maker online, HLB layout map, census enumeration block map, nazari naksha kaise banaye, HLO app nazari naksha, census map generator India, UP nazari naksha, Bihar census map, Kerala HLB map, Maharashtra census naksha, Uttarakhand census map, Rajasthan HLO map, Jharkhand HLO map, Odisha HLO map, examsetu map maker, examsetu.dev" />
        <link rel="canonical" href="https://nakshabot.in/" />
        <meta name="robots" content="index, follow" />
        
        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://nakshabot.in/" />
        <meta property="og:title" content="HLB Map Maker Online | Nazri Naksha Generator - NakshaBot" />
        <meta property="og:description" content="HLB map बनाएं 15 मिनट में। Census 2027 के लिए nazri naksha online maker। SMS paste करें, AI map बनाएं, ₹20 में A4 PDF download करें। HLO ready format।" />
        <meta property="og:image" content="https://nakshabot.in/logo.png" />
        <meta property="og:site_name" content="NakshaBot" />
        <meta property="og:locale" content="en_IN" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:url" content="https://nakshabot.in/" />
        <meta property="twitter:title" content="HLB Map Maker Online | Nazri Naksha Generator - NakshaBot" />
        <meta property="twitter:description" content="HLB map बनाएं 15 मिनट में। Census 2027 के लिए nazri naksha online maker। SMS paste करें, AI map बनाएं, ₹20 में A4 PDF download करें। HLO ready format।" />
        <meta property="twitter:image" content="https://nakshabot.in/logo.png" />
        
        {/* Schema markups */}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            "name": "NakshaBot",
            "applicationCategory": "UtilityApplication",
            "operatingSystem": "Web Browser, Android",
            "description": "Census 2027 HLB Map Maker and Nazri Naksha Generator for Indian enumerators",
            "offers": {
              "@type": "Offer",
              "price": "20",
              "priceCurrency": "INR"
            },
            "inLanguage": ["hi", "en"],
            "keywords": "hlb map maker, nazri naksha, hlo map, census 2027"
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "NakshaBot",
            "alternateName": ["ExamSetu", "HLO Map Maker"],
            "url": "https://examsetu.dev/",
            "potentialAction": {
              "@type": "SearchAction",
              "target": "https://examsetu.dev/?q={search_term_string}",
              "query-input": "required name=search_term_string"
            }
          })}
        </script>
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is an HLO Map Maker / HLB Map Maker?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "An HLO (Houselisting Operations) Map Maker or HLB (Houselisting Block) Map Maker is a tool that helps census enumerators draw their official layout maps (Nazari Naksha) required during the first phase of the Census of India 2027."
                }
              },
              {
                "@type": "Question",
                "name": "How to make a Nazari Naksha online for free?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "You can use NakshaBot (examsetu.dev) to generate a Nazari Naksha online for free. Simply draw your enumeration block boundary, select satellite data, drop houses/buildings and landmarks, auto-generate the serpentine route, and export a high-quality PDF in standard formats."
                }
              },
              {
                "@type": "Question",
                "name": "Is NakshaBot valid according to Census rules?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes. NakshaBot is built exactly according to the layout mapping rules set by the Registrar General and Census Commissioner of India. It features standard symbols for Pucca/Kutcha houses, residential/commercial properties, and sequential house numbering."
                }
              }
            ]
          })}
        </script>
      </Helmet>
      
      {/* ─── NAVIGATION ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-[Baloo_2] text-slate-800 tracking-tight">NakshaBot</span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#idea" className="text-sm font-semibold text-slate-600 hover:text-orange-500 transition-colors">The Idea</a>
            <a href="#process" className="text-sm font-semibold text-slate-600 hover:text-orange-500 transition-colors">How it Works</a>
            <a href="#features" className="text-sm font-semibold text-slate-600 hover:text-orange-500 transition-colors">Features</a>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/sign-in" className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors hidden sm:block">Log in</Link>
            <Link to="/sign-up" className="text-sm font-bold bg-slate-900 text-white px-6 py-2.5 rounded-full hover:bg-slate-800 transition-all transform hover:scale-105 active:scale-95 shadow-md inline-block">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* ─── HERO SECTION ─── */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1000px] h-[500px] opacity-30 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob"></div>
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-teal-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-2000"></div>
          <div className="absolute -bottom-8 left-1/3 w-96 h-96 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl animate-blob animation-delay-4000"></div>
        </div>

        <div className="max-w-5xl mx-auto px-6 relative z-10 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs border border-orange-200 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
              Built for Census 2027
            </div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-amber-300 font-bold text-xs border border-slate-700 shadow-lg">
              🏆 1st on the Internet
            </div>
          </div>
          
          <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight text-slate-900 mb-8 leading-tight font-[Baloo_2]">
            HLB Map Maker — <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">Nazri Naksha</span> Online बनाएं Census 2027 के लिए
          </h1>
          
          <p className="text-lg lg:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            NakshaBot भारत का पहला HLB Map Maker tool है जो Census 2027 के प्रगणकों को nazri naksha बनाने में मदद करता है। अपना HLO assignment SMS paste करें, satellite map पर boundary देखें, और printable A4 HLB map PDF download करें — सिर्फ ₹20 में।
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/sign-up" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-1 transition-all text-lg flex items-center justify-center gap-2">
              Start Creating Free <span className="text-xl">→</span>
            </Link>
            <Link to="/sign-in" className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 font-bold rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-lg flex items-center justify-center">
              Log into Dashboard
            </Link>
          </div>
        </div>
      </section>

      {/* ─── AI COMPARISON SECTION ─── */}
      <AiComparison />

      {/* ─── THE IDEA (THE PROBLEM & SOLUTION) ─── */}
      <section id="idea" className="py-20 bg-white border-y border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center mb-24">
            <div>
              <h2 className="text-orange-500 font-bold tracking-wide uppercase text-sm mb-3">The Idea</h2>
              <h2 className="text-3xl lg:text-4xl font-bold font-[Baloo_2] text-slate-900 mb-6">
                Nazri Naksha क्या होता है?
              </h2>
              <p className="text-slate-600 text-lg mb-6 leading-relaxed">
                Traditionally, enumerators spend countless hours walking block by block, hand-drawing Nazari Nakshas (layout maps) on paper. These maps often suffer from scale inaccuracies, messy corrections, and lack proper geographic context.
              </p>
              <p className="text-slate-600 text-lg leading-relaxed mb-8">
                <strong>NakshaBot changes everything.</strong> We leverage high-resolution satellite imagery and OpenStreetMap data to give you a perfect bird's-eye view of your enumeration block. What used to take days of fieldwork can now be drafted from a laptop in under 15 minutes, with unparalleled accuracy and official formatting.
              </p>
              <div className="flex gap-4">
                <div className="flex-1 bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <div className="text-3xl mb-2">⏳</div>
                  <h4 className="font-bold text-slate-800 mb-1">Save Hours</h4>
                  <p className="text-sm text-slate-500">Cut down on manual drafting time.</p>
                </div>
                <div className="flex-1 bg-slate-50 rounded-2xl p-6 border border-slate-100">
                  <div className="text-3xl mb-2">🎯</div>
                  <h4 className="font-bold text-slate-800 mb-1">100% Accuracy</h4>
                  <p className="text-sm text-slate-500">Geospatially correct boundaries.</p>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-100 to-teal-100 rounded-3xl transform rotate-3"></div>
              <div className="relative bg-white p-2 rounded-3xl shadow-xl border border-slate-100 transform -rotate-2">
                <img src="/logo.png" alt="Map Demo" className="w-full h-auto rounded-2xl opacity-90 mix-blend-multiply" style={{ minHeight: '300px', objectFit: 'cover' }} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-white/90 backdrop-blur px-6 py-4 rounded-2xl shadow-lg border border-slate-100 text-center">
                    <div className="font-bold text-slate-800 font-[Baloo_2] text-xl mb-1">HLB 0042 Generated</div>
                    <div className="text-sm text-green-600 font-semibold">✓ Ready for printing</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pros and Cons Section */}
          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white border-2 border-emerald-100 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-10"></div>
              <h4 className="text-2xl font-bold font-[Baloo_2] text-slate-900 mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-lg">👍</span>
                Pros of NakshaBot
              </h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✔</span>
                  <span className="text-slate-700"><strong>Lightning Fast:</strong> Map a block in 15 minutes instead of a full day of walking.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✔</span>
                  <span className="text-slate-700"><strong>Official Accuracy:</strong> Uses real satellite data ensuring correct geographical boundaries.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✔</span>
                  <span className="text-slate-700"><strong>Clean Export:</strong> Generates crisp, legible PDFs. No more erasing or smudged paper.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-emerald-500 mt-1">✔</span>
                  <span className="text-slate-700"><strong>Auto-Routing:</strong> The serpentine path algorithm connects your houses flawlessly.</span>
                </li>
              </ul>
            </div>
            
            <div className="bg-white border-2 border-rose-100 rounded-3xl p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-bl-full -z-10"></div>
              <h4 className="text-2xl font-bold font-[Baloo_2] text-slate-900 mb-6 flex items-center gap-3">
                <span className="w-10 h-10 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center text-lg">👎</span>
                Limitations
              </h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">✖</span>
                  <span className="text-slate-700"><strong>Requires Internet:</strong> You need an active data connection to fetch satellite and OSM data.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">✖</span>
                  <span className="text-slate-700"><strong>Field Verification:</strong> While highly accurate, you still need to physically verify building usage.</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-rose-500 mt-1">✖</span>
                  <span className="text-slate-700"><strong>Device Dependency:</strong> Best used on tablets or laptops; phone screens might be too small for complex drawings.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS (THE PROCESS) ─── */}
      <section id="process" className="py-24 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-bl from-teal-900/40 to-transparent pointer-events-none"></div>
        <div className="max-w-6xl mx-auto px-6 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-teal-400 font-bold tracking-wide uppercase text-sm mb-3">The Process</h2>
            <h2 className="text-3xl lg:text-4xl font-bold font-[Baloo_2] mb-4">HLB Map Kaise Banaye? — 4 आसान Steps</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">We've broken down the complex task of map-making into an intuitive, guided workflow.</p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {/* Step 1 */}
            <div className="relative">
              <div className="text-6xl font-black text-slate-800 absolute -top-6 -left-4 z-0 opacity-50">1</div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner border border-slate-700">📍</div>
                <h4 className="text-xl font-bold mb-3 text-slate-100">Define Boundary</h4>
                <p className="text-slate-400 text-sm leading-relaxed">Search for your location and tap on the map to drop pins, drawing the exact outline of your assigned Enumeration Block.</p>
              </div>
            </div>
            
            {/* Step 2 */}
            <div className="relative">
              <div className="text-6xl font-black text-slate-800 absolute -top-6 -left-4 z-0 opacity-50">2</div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner border border-slate-700">📡</div>
                <h4 className="text-xl font-bold mb-3 text-slate-100">Auto-Detect</h4>
                <p className="text-slate-400 text-sm leading-relaxed">NakshaBot automatically pulls road networks, rivers, and place names from satellite data within your boundary.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="relative">
              <div className="text-6xl font-black text-slate-800 absolute -top-6 -left-4 z-0 opacity-50">3</div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner border border-slate-700">🏠</div>
                <h4 className="text-xl font-bold mb-3 text-slate-100">Place Symbols</h4>
                <p className="text-slate-400 text-sm leading-relaxed">Easily drop standard census symbols for Pucca Houses, Kutcha Houses, Apartments, and non-residential units. Auto-numbering included.</p>
              </div>
            </div>

            {/* Step 4 */}
            <div className="relative">
              <div className="text-6xl font-black text-slate-800 absolute -top-6 -left-4 z-0 opacity-50">4</div>
              <div className="relative z-10">
                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-2xl mb-6 shadow-inner border border-slate-700">📄</div>
                <h4 className="text-xl font-bold mb-3 text-slate-100">Export & Print</h4>
                <p className="text-slate-400 text-sm leading-relaxed">With one click, generate an official Survey of India style PDF map with a serpentine path, legend, and your credentials.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section id="features" className="py-24 bg-slate-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-orange-500 font-bold tracking-wide uppercase text-sm mb-3">Key Features</h2>
            <h3 className="text-3xl lg:text-4xl font-bold font-[Baloo_2] text-slate-900 mb-4">Everything you need, built in.</h3>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-xl flex items-center justify-center text-xl mb-6">🐍</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Auto Serpentine Path</h4>
              <p className="text-slate-600 text-sm">Automatically draws the official dotted red path connecting houses sequentially, ensuring compliant enumeration routes.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center text-xl mb-6">🏷️</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Custom Place Labels</h4>
              <p className="text-slate-600 text-sm">Need to add a local landmark not found on maps? Use our label dropper to annotate streets, chaurahas, and unique spots.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-xl flex items-center justify-center text-xl mb-6">🔲</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Block & Farmland Tool</h4>
              <p className="text-slate-600 text-sm">Draw multi-point polygons to designate agricultural fields or multi-structure blocks with precision.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center text-xl mb-6">💾</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Cloud Auto-Save</h4>
              <p className="text-slate-600 text-sm">Your maps are saved instantly to the cloud. Start on a desktop and finish up on a tablet without missing a beat.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center text-xl mb-6">📱</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Responsive Design</h4>
              <p className="text-slate-600 text-sm">A user interface designed to work smoothly on both large monitors for detailed work and tablets for on-the-go checks.</p>
            </div>

            <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center text-xl mb-6">📸</div>
              <h4 className="text-lg font-bold text-slate-900 mb-2">Satellite Overlay</h4>
              <p className="text-slate-600 text-sm">Toggle between standard drawn layout and a pure satellite view overlaid with your exact boundary and roads.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── STATE LANDING PAGES GRID ─── */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-orange-500 font-bold tracking-wide uppercase text-sm mb-3">State Census Map Makers</h2>
            <h3 className="text-3xl lg:text-4xl font-bold font-[Baloo_2] text-slate-900 mb-4">Select Your State / UT</h3>
            <p className="text-slate-600 max-w-2xl mx-auto text-base">
              Generate perfectly compliant HLO and HLB Nazari Naksha layout maps tailored to local guidelines across all Indian states.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { name: 'Uttar Pradesh', slug: 'up-census-map' },
              { name: 'Maharashtra', slug: 'maharashtra-census-map' },
              { name: 'Bihar', slug: 'bihar-census-map' },
              { name: 'Madhya Pradesh', slug: 'mp-census-map' },
              { name: 'Rajasthan', slug: 'rajasthan-census-map' },
              { name: 'Himachal Pradesh', slug: 'hp-census-map' },
              { name: 'Kerala', slug: 'kerala-census-map' },
              { name: 'West Bengal', slug: 'west-bengal-census-map' },
              { name: 'Tamil Nadu', slug: 'tamil-nadu-census-map' },
              { name: 'Karnataka', slug: 'karnataka-census-map' },
              { name: 'Gujarat', slug: 'gujarat-census-map' },
              { name: 'Punjab & Haryana', slug: 'punjab-haryana-census-map' },
              { name: 'Uttarakhand', slug: 'uttarakhand-census-map' },
              { name: 'Jharkhand', slug: 'jharkhand-census-map' },
              { name: 'Odisha', slug: 'odisha-census-map' },
              { name: 'Assam', slug: 'assam-census-map' },
              { name: 'Chhattisgarh', slug: 'chhattisgarh-census-map' },
              { name: 'Telangana', slug: 'telangana-census-map' },
              { name: 'Andhra Pradesh', slug: 'andhra-pradesh-census-map' },
              { name: 'Jammu & Kashmir', slug: 'jk-census-map' },
              { name: 'Delhi NCR', slug: 'delhi-census-map' },
              { name: 'Goa', slug: 'goa-census-map' },
              { name: 'Tripura', slug: 'tripura-census-map' },
              { name: 'Meghalaya', slug: 'meghalaya-census-map' },
              { name: 'Manipur', slug: 'manipur-census-map' },
              { name: 'Nagaland', slug: 'nagaland-census-map' },
              { name: 'Mizoram', slug: 'mizoram-census-map' },
              { name: 'Sikkim', slug: 'sikkim-census-map' }
            ].map((state) => (
              <Link
                key={state.slug}
                to={`/${state.slug}`}
                className="text-sm font-semibold text-slate-700 hover:text-orange-500 py-3 px-4 bg-slate-50 hover:bg-orange-50/30 rounded-2xl border border-slate-100 hover:border-orange-200 transition-all text-center shadow-sm hover:shadow active:scale-95 animate-transition"
              >
                {state.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOME FAQ SECTION ─── */}
      <section className="py-20 bg-slate-50 border-t border-slate-100">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-orange-500 font-bold tracking-wide uppercase text-sm mb-3">Frequently Asked Questions</h2>
            <h3 className="text-3xl lg:text-4xl font-bold font-[Baloo_2] text-slate-900">Got Questions? We have Answers</h3>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "What is an HLO Map Maker / HLB Map Maker?",
                a: "An HLO (Houselisting Operations) Map Maker or HLB (Houselisting Block) Map Maker is a tool designed specifically for Indian Census Enumerators to draw their official layout maps (Nazari Naksha) required during the HLO phase of the Census of India 2027."
              },
              {
                q: "How to make a Nazari Naksha online for free?",
                a: "You can use NakshaBot (examsetu.dev) to generate a Nazari Naksha online for free. Simply draw your enumeration block boundary, select satellite data, drop houses/buildings and landmarks, auto-generate the serpentine route, and export a high-quality PDF in standard formats."
              },
              {
                q: "Is NakshaBot valid according to Census rules?",
                a: "Yes. NakshaBot is built exactly according to the layout mapping rules set by the Registrar General and Census Commissioner of India. It features standard symbols for Pucca/Kutcha houses, residential/commercial properties, and sequential house numbering."
              },
              {
                q: "Do I need any specialized GIS training to use NakshaBot?",
                a: "No! NakshaBot is designed to be extremely simple and user-friendly. You do not need any GIS or advanced technical training. If you can use basic smartphone map applications, you can create a professional Census map in minutes."
              }
            ].map((faq, idx) => (
              <div key={idx} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
                <h4 className="font-bold text-lg text-slate-800 mb-2">{faq.q}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ─── */}
      <section className="py-24 bg-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-orange-50/50 pointer-events-none"></div>
        <div className="max-w-4xl mx-auto px-6 text-center relative z-10">
          <h2 className="text-4xl lg:text-5xl font-extrabold font-[Baloo_2] text-slate-900 mb-6">
            Ready to upgrade your workflow?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Join other forward-thinking enumerators and prepare for the 2027 Census with the best tools available. Create your account today.
          </p>
          <a href="/sign-up" className="inline-block px-10 py-5 bg-slate-900 text-white font-bold rounded-2xl shadow-xl hover:bg-slate-800 hover:-translate-y-1 transition-all text-xl">
            Create Your First Map
          </a>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-900 text-slate-400 py-16 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-6 gap-8">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <img src="/logo.png" alt="Logo" className="w-8 h-8 grayscale opacity-70" />
              <span className="font-bold text-xl font-[Baloo_2] text-white tracking-tight">NakshaBot</span>
            </div>
            <p className="text-sm leading-relaxed max-w-sm mb-6">
              Empowering Census Enumerators in India with modern, automated, and highly accurate digital mapping tools. Built for efficiency and compliance.
            </p>
            <div className="flex gap-4">
              <Link to="/sign-in" className="text-sm font-semibold text-white bg-slate-800 px-4 py-2 rounded hover:bg-slate-700 transition-colors">Log In</Link>
              <Link to="/sign-up" className="text-sm font-bold bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-500 transition-colors">Create Account</Link>
            </div>
          </div>
          <div>
            <h5 className="text-white font-bold mb-4">Resources</h5>
            <ul className="space-y-3 text-sm flex flex-col">
              <li><Link to="/how-it-works" className="hover:text-orange-400 transition-colors">How it Works</Link></li>
              <li><Link to="/faq" className="hover:text-orange-400 transition-colors">FAQ</Link></li>
              <li><Link to="/rules" className="hover:text-orange-400 transition-colors">Map Rules</Link></li>
              <li><Link to="/schedule" className="hover:text-orange-400 transition-colors">Census Schedule</Link></li>
              <li><a href="#features" className="hover:text-orange-400 transition-colors">Features</a></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white font-bold mb-4">Top States</h5>
            <ul className="space-y-3 text-sm flex flex-col">
              <li><Link to="/up-census-map" className="hover:text-orange-400 transition-colors">Uttar Pradesh</Link></li>
              <li><Link to="/maharashtra-census-map" className="hover:text-orange-400 transition-colors">Maharashtra</Link></li>
              <li><Link to="/bihar-census-map" className="hover:text-orange-400 transition-colors">Bihar</Link></li>
              <li><Link to="/mp-census-map" className="hover:text-orange-400 transition-colors">Madhya Pradesh</Link></li>
              <li><Link to="/rajasthan-census-map" className="hover:text-orange-400 transition-colors">Rajasthan</Link></li>
              <li><Link to="/west-bengal-census-map" className="hover:text-orange-400 transition-colors">West Bengal</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white font-bold mb-4">More States</h5>
            <ul className="space-y-3 text-sm flex flex-col">
              <li><Link to="/karnataka-census-map" className="hover:text-orange-400 transition-colors">Karnataka</Link></li>
              <li><Link to="/tamil-nadu-census-map" className="hover:text-orange-400 transition-colors">Tamil Nadu</Link></li>
              <li><Link to="/gujarat-census-map" className="hover:text-orange-400 transition-colors">Gujarat</Link></li>
              <li><Link to="/kerala-census-map" className="hover:text-orange-400 transition-colors">Kerala</Link></li>
              <li><Link to="/hp-census-map" className="hover:text-orange-400 transition-colors">Himachal Pradesh</Link></li>
              <li><Link to="/punjab-haryana-census-map" className="hover:text-orange-400 transition-colors">Punjab & Haryana</Link></li>
            </ul>
          </div>
          <div>
            <h5 className="text-white font-bold mb-4">Legal</h5>
            <ul className="space-y-3 text-sm flex flex-col">
              <li><a href="/terms" className="hover:text-orange-400 transition-colors">Terms & Conditions</a></li>
              <li><a href="/refunds" className="hover:text-orange-400 transition-colors">Refund Policy</a></li>
              <li><a href="/contact" className="hover:text-orange-400 transition-colors">Contact Us</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-6 mt-16 pt-8 border-t border-slate-800/50 text-sm text-slate-500 flex flex-col md:flex-row justify-between items-center gap-4">
          <p>© {new Date().getFullYear()} NakshaBot. All rights reserved.</p>
          <p>Designed for the 2027 Census of India.</p>
        </div>
      </footer>

      {/* Add custom CSS for blob animations */}
      <style>{`
        html {
          scroll-behavior: smooth;
        }
        @keyframes blob {
          0% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -50px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
          100% { transform: translate(0px, 0px) scale(1); }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
}
