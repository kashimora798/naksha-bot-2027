import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function BlogRulesPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>Nazari Naksha Rules & Format | Census of India 2027</title>
        <meta name="description" content="Learn the official rules, guidelines, and formatting requirements for drawing a Nazari Naksha (layout map) for the Census of India 2027." />
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
        <div className="mb-8">
          <span className="text-orange-600 font-bold tracking-wider uppercase text-sm">Guidelines</span>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mt-2 mb-6 font-[Baloo_2]">
            Nazari Naksha Rules and Format
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>Official Guidelines Summary</span>
            <span>•</span>
            <span>5 min read</span>
          </div>
        </div>

        <div className="prose prose-slate prose-lg max-w-none">
          <p>
            The <strong>Nazari Naksha</strong> (Layout Map) is a crucial document for every enumerator during the Census of India 2027. It serves as the geographic foundation that proves all houses within an assigned Houselisting Block (HLB) have been covered.
          </p>
          <p>
            Charge officers are very strict about the format of the Nazari Naksha. A poorly drawn map or one missing essential metadata will be rejected, forcing you to redraw it. Follow these official rules to ensure your map is accepted on the first submission.
          </p>

          <h2>Essential Map Elements</h2>
          <p>Every Nazari Naksha MUST contain the following components:</p>
          <ul>
            <li><strong>North Arrow:</strong> Orientation is mandatory. The top of the map should generally represent North.</li>
            <li><strong>Location Metadata:</strong> State, District, Tehsil/Taluka, Town/Village name, Ward number, and the specific HLB code.</li>
            <li><strong>Clear Boundaries:</strong> The outer perimeter of your block must be drawn with a distinct, thick line.</li>
            <li><strong>Landmarks:</strong> Permanent structures such as temples, mosques, schools, post offices, and prominent water bodies (rivers, ponds) must be marked to provide context.</li>
          </ul>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 my-8">
            <h3 className="text-xl font-bold text-orange-800 mt-0">Don't want to memorize symbols?</h3>
            <p className="text-orange-900 mb-4">NakshaBot automatically formats your map with the correct metadata, North arrow, and official symbols. Just point and click.</p>
            <Link to="/sign-up" className="inline-block px-6 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors no-underline">
              Generate Official Map
            </Link>
          </div>

          <h2>Rules for Numbering Buildings</h2>
          <p>
            Census houses must be numbered systematically on the map:
          </p>
          <ul>
            <li><strong>Sequence:</strong> Numbering must follow a logical sequence, usually starting from the North-West corner and ending in the South-East corner.</li>
            <li><strong>No Gaps:</strong> There should be no missed numbers in the sequence.</li>
            <li><strong>Building Types:</strong> Use squares (□) to denote Pucca (permanent) structures and triangles (△) to denote Kutcha (temporary) structures. Non-residential buildings should be shaded or marked accordingly.</li>
          </ul>

          <h2>Common Reasons for Rejection</h2>
          <p>Supervisors frequently reject hand-drawn maps for these reasons:</p>
          <ol>
            <li><strong>Lack of Scale:</strong> While it is a "free-hand sketch," maps that are wildly disproportionate confuse the numbering sequence. (This is why satellite-backed digital maps are superior).</li>
            <li><strong>Missing Roads:</strong> Failure to draw the streets and paths that separate rows of houses.</li>
            <li><strong>Overwriting:</strong> Messy corrections where numbers have been scribbled over. If you make a mistake on paper, you must start over.</li>
          </ol>

          <h2>Digital vs Manual</h2>
          <p>
            While the RGI manual refers to the Nazari Naksha as a "hand-drawn sketch," digital maps printed on A4 paper are widely accepted and preferred by modern charge officers due to their clarity and accuracy. Tools like <strong>NakshaBot</strong> ensure that the rules of scaling, standard symbols, and clear numbering are perfectly adhered to.
          </p>
        </div>
      </div>
    </div>
  );
}
