import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>How to Make Nazari Naksha | Census 2027 Map Steps</title>
        <meta name="description" content="Learn how to draw your houselisting block map and generate a Nazari Naksha online for Census 2027 in 3 easy steps." />
      </Helmet>

      {/* Navigation */}
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

      {/* Content */}
      <div className="pt-32 pb-20 px-6 max-w-3xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-6 font-[Baloo_2]">
          How to Make a Nazari Naksha for Census 2027
        </h1>
        <p className="text-xl text-slate-600 mb-12">
          Generating your Houselisting Block (HLB) map takes less than 15 minutes. Follow these simple steps.
        </p>

        <div className="space-y-12">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-600 font-bold mb-4">1</div>
            <h2 className="text-2xl font-bold mb-4">Paste Your Assignment SMS</h2>
            <p className="text-slate-600 mb-4">When you are assigned an enumeration block, you receive an official SMS containing the HLB code and GPS coordinates. Simply copy that SMS and paste it into NakshaBot. We automatically extract your location.</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-600 font-bold mb-4">2</div>
            <h2 className="text-2xl font-bold mb-4">Verify Boundaries & Roads</h2>
            <p className="text-slate-600 mb-4">We load high-resolution satellite imagery for your block. Click the corners of your block to draw the boundary. NakshaBot will automatically snap to roads and paths, ensuring your map is geographically accurate.</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-600 font-bold mb-4">3</div>
            <h2 className="text-2xl font-bold mb-4">Auto-Detect Buildings</h2>
            <p className="text-slate-600 mb-4">Instead of drawing every house manually, use our AI auto-detect feature. It identifies structures within your boundary and drops census numbering pins on them instantly.</p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-orange-100 text-orange-600 font-bold mb-4">4</div>
            <h2 className="text-2xl font-bold mb-4">Download & Print</h2>
            <p className="text-slate-600 mb-4">Once your layout is correct, pay a one-time fee of ₹20 to generate the final PDF. It comes pre-formatted with the official legend, orientation, and metadata required for Census 2027.</p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Link to="/sign-up" className="inline-flex px-8 py-4 bg-slate-900 text-white font-bold rounded-2xl shadow-lg hover:-translate-y-1 transition-all text-lg">
            Start Your First Map
          </Link>
        </div>
      </div>
    </div>
  );
}
