import { SignInButton, SignUpButton } from '@clerk/clerk-react';

export default function LandingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden selection:bg-orange-200">
      
      {/* ─── NAVIGATION ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-[Baloo_2] text-slate-800 tracking-tight">NakshaBot</span>
          </div>
          <div className="flex items-center gap-4">
            <SignInButton mode="modal">
              <button className="text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors">Log in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="text-sm font-bold bg-slate-900 text-white px-5 py-2 rounded-full hover:bg-slate-800 transition-all transform hover:scale-105 active:scale-95 shadow-md">
                Get Started
              </button>
            </SignUpButton>
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-100 text-orange-700 font-semibold text-xs mb-8 border border-orange-200 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
            Census 2027 Ready
          </div>
          
          <h1 className="text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 mb-8 leading-tight font-[Baloo_2]">
            Digitize your <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">Nazari Naksha</span><br />
            in minutes, not days.
          </h1>
          
          <p className="text-lg lg:text-xl text-slate-600 mb-10 max-w-2xl mx-auto leading-relaxed">
            NakshaBot is the ultimate digital tool for Census Enumerators. Seamlessly overlay satellite imagery, auto-detect buildings, and generate official HLB layout maps instantly.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <SignUpButton mode="modal">
              <button className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-1 transition-all text-lg flex items-center justify-center gap-2">
                Start Creating Free <span className="text-xl">→</span>
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="w-full sm:w-auto px-8 py-4 bg-white text-slate-700 font-bold rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-all text-lg">
                Log into Dashboard
              </button>
            </SignInButton>
          </div>
        </div>
      </section>

      {/* ─── FEATURES SECTION ─── */}
      <section className="py-20 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-[Baloo_2] text-slate-900 mb-4">Why choose NakshaBot?</h2>
            <p className="text-slate-500 max-w-2xl mx-auto">We've automated the tedious parts of map-making so you can focus on accurate data collection.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-xl hover:border-orange-100 transition-all group">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-6 group-hover:scale-110 transition-transform">🛰️</div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">Satellite & OSM Integration</h3>
              <p className="text-slate-600 leading-relaxed">Auto-fetch roads, water bodies, and landmarks for any HLB boundary in India directly from satellite and OpenStreetMap data.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-xl hover:border-teal-100 transition-all group">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-6 group-hover:scale-110 transition-transform">🤖</div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">AI-Powered Extraction</h3>
              <p className="text-slate-600 leading-relaxed">Instantly convert cluttered satellite imagery into clean, official-looking Survey of India style topographic maps using AI.</p>
            </div>

            <div className="p-8 rounded-3xl bg-slate-50 border border-slate-100 hover:shadow-xl hover:border-blue-100 transition-all group">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-2xl shadow-sm mb-6 group-hover:scale-110 transition-transform">📄</div>
              <h3 className="text-xl font-bold text-slate-800 mb-3">One-Click PDF Export</h3>
              <p className="text-slate-600 leading-relaxed">Generate ready-to-print, high-resolution PDF layout maps complete with legends, north arrows, and surveyor metadata.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ─── */}
      <footer className="bg-slate-900 text-slate-400 py-12 text-center border-t border-slate-800">
        <div className="flex items-center justify-center gap-2 mb-4">
          <img src="/logo.png" alt="Logo" className="w-6 h-6 grayscale opacity-50" />
          <span className="font-bold font-[Baloo_2] text-slate-300">NakshaBot</span>
        </div>
        <p className="text-sm">Built for the 2027 Census of India. Streamlining enumeration mapping.</p>
      </footer>

      {/* Add custom CSS for blob animations */}
      <style>{`
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
