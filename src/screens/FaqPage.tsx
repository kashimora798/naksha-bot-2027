import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

const faqs = [
  { q: "What is a Nazari Naksha in Census 2027?", a: "A Nazari Naksha is a free-hand layout map (sketch) drawn by the enumerator showing the boundaries, roads, landmarks, and all buildings within a specific Houselisting Block (HLB)." },
  { q: "What does HLB mean in the census SMS?", a: "HLB stands for Houselisting Block. It is the specific geographic area assigned to an enumerator, typically consisting of 120-150 households." },
  { q: "How do I read the assignment SMS?", a: "Your assignment SMS contains the State Code, District Code, Charge Code, and the specific HLB number, along with a central GPS coordinate to help you locate the block." },
  { q: "How many maps do I need per HLB?", a: "Generally, one Nazari Naksha is required per HLB. If the block is very large or divided by a major physical barrier (like a river or highway), it may be split into sub-blocks." },
  { q: "What is the correct format for the map?", a: "The map must include a North arrow (orientation), boundary lines, major roads/paths, permanent landmarks (temples, schools, water bodies), and numbered buildings." },
  { q: "How to mark boundaries on the map?", a: "Boundaries should be marked with bold, dark lines. Natural boundaries like rivers or man-made ones like railway lines should be clearly labeled." },
  { q: "How many houses are typically in one block?", a: "An average enumeration block contains around 120 to 150 households, though this can vary in sparsely populated rural areas or dense urban slums." },
  { q: "What are the printing requirements for the digital map?", a: "The digital map should be printed on A4 or A3 size paper in clear black-and-white or color, ensuring all building numbers and legends are legible." },
  { q: "What does the supervisor check in the layout map?", a: "Supervisors check if the boundaries match the official jurisdiction, if all permanent landmarks are present, and if the numbering sequence is logical and continuous." },
  { q: "Can I use Google Maps directly for Census?", a: "No, standard Google Maps screenshots are not accepted. The map must be a proper layout sketch with census-specific symbols. NakshaBot converts satellite data into this required format." },
  { q: "How do I show Kutcha and Pucca houses?", a: "Use a square (□) for Pucca (permanent) houses and a triangle (△) for Kutcha (temporary) houses as per the official census manual." },
  { q: "What if there are no roads in my rural block?", a: "In rural areas, use footpaths, cart tracks, streams, or field boundaries (girdawari lines) to demarcate the block." },
  { q: "How do I number buildings in a multi-story apartment?", a: "The apartment building gets one main census building number, while individual flats inside get separate census house numbers." },
  { q: "Is NakshaBot free to use?", a: "Yes, NakshaBot is completely free to use, from creating your map to downloading the final, official PDF." },
  { q: "Does the app work offline in the field?", a: "Currently, NakshaBot requires an internet connection to load the satellite imagery and auto-detect buildings. You can prepare your maps at home before field visits." }
];

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>Census 2027 FAQ | What is HLB & Nazari Naksha Rules</title>
        <meta name="description" content="Answers to common questions about Nazari Naksha, HLB numbers, assignment SMS, and map drawing rules for Census 2027 enumerators." />
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
      <div className="pt-32 pb-20 px-6 max-w-4xl mx-auto">
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-6 font-[Baloo_2]">
          Frequently Asked Questions
        </h1>
        <p className="text-xl text-slate-600 mb-12">
          Everything you need to know about generating your Nazari Naksha for Census 2027.
        </p>

        <div className="space-y-6">
          {faqs.map((faq, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h3 className="font-bold text-xl mb-3">{faq.q}</h3>
              <p className="text-slate-600 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center bg-orange-50 rounded-3xl p-10 border border-orange-100">
          <h2 className="text-2xl font-bold mb-4">Ready to save time?</h2>
          <p className="text-slate-600 mb-8 max-w-xl mx-auto">Join thousands of enumerators who are automating their layout maps with NakshaBot.</p>
          <Link to="/sign-up" className="inline-flex px-8 py-4 bg-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/30 hover:-translate-y-1 transition-all text-lg">
            Create Your Map
          </Link>
        </div>
      </div>
    </div>
  );
}
