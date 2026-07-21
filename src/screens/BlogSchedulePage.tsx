import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';

export default function BlogSchedulePage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>Census 2027 HLO Phase Schedule | State Wise Dates</title>
        <meta name="description" content="View the complete schedule and dates for the Census 2027 Houselisting and Housing Census (HLO) phase across all Indian states." />
        <link rel="canonical" href="https://examsetu.dev/schedule" />
        <meta property="og:type" content="article" />
        <meta property="og:url" content="https://examsetu.dev/schedule" />
        <meta property="og:title" content="Census 2027 HLO Phase Schedule | State Wise Dates" />
        <meta property="og:description" content="View the complete schedule and dates for the Census 2027 HLO phase across all Indian states." />
        <meta property="og:image" content="https://examsetu.dev/logo.png" />
        <meta property="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": "Census 2027 HLO Phase Schedule — State Wise Dates",
            "description": "View the complete schedule and dates for the Census 2027 HLO phase across all Indian states.",
            "datePublished": "2026-05-01",
            "dateModified": "2026-05-27",
            "author": { "@type": "Organization", "name": "NakshaBot" },
            "publisher": { "@type": "Organization", "name": "NakshaBot", "logo": { "@type": "ImageObject", "url": "https://examsetu.dev/logo.png" } }
          })}
        </script>
      </Helmet>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-public-sans text-slate-800 tracking-tight">NakshaBot</span>
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
          <span className="text-orange-600 font-bold tracking-wider uppercase text-sm">Census Updates</span>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mt-2 mb-6 font-public-sans">
            Census 2027 HLO Phase Schedule
          </h1>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span>Last Updated: May 2026</span>
            <span>•</span>
            <span>4 min read</span>
          </div>
        </div>

        <div className="prose prose-slate prose-lg max-w-none">
          <p>
            The Houselisting and Housing Census (HLO) is the critical first phase of Census 2027. During this period, enumerators must prepare their <strong>Nazari Naksha</strong> (layout maps) and list all buildings in their assigned blocks. The Registrar General of India (RGI) rolls this phase out state by state.
          </p>
          
          <h2>Current Active Phases (As of May 2026)</h2>
          <p>
            The following states are currently undergoing active enumeration. If you are an enumerator in these states, you need to prepare your HLB maps immediately.
          </p>
          <ul>
            <li><strong>Uttar Pradesh (UP)</strong> - Active</li>
            <li><strong>Maharashtra</strong> - Active</li>
          </ul>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-6 my-8">
            <h3 className="text-xl font-bold text-orange-800 mt-0">Prepare Your Map in Minutes</h3>
            <p className="text-orange-900 mb-4">Are you working in UP or Maharashtra? Use NakshaBot to generate your official layout map instantly instead of drawing it by hand.</p>
            <Link to="/sign-up" className="inline-block px-6 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors no-underline">
              Start Generating Map
            </Link>
          </div>

          <h2>Upcoming Phases (2026 - 2027)</h2>
          <p>
            The enumeration phase for the following states will begin shortly. Training and assignment SMS dispatch will happen 2-4 weeks prior to the start dates.
          </p>
          
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse border border-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="border border-slate-200 px-4 py-2 text-left">State</th>
                  <th className="border border-slate-200 px-4 py-2 text-left">Expected Start</th>
                  <th className="border border-slate-200 px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">Himachal Pradesh</td>
                  <td className="border border-slate-200 px-4 py-2">Upcoming</td>
                  <td className="border border-slate-200 px-4 py-2 text-orange-600 font-semibold">Preparing</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">Kerala</td>
                  <td className="border border-slate-200 px-4 py-2">Upcoming</td>
                  <td className="border border-slate-200 px-4 py-2 text-orange-600 font-semibold">Preparing</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">West Bengal</td>
                  <td className="border border-slate-200 px-4 py-2">Upcoming</td>
                  <td className="border border-slate-200 px-4 py-2 text-slate-500">Scheduled</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">Bihar</td>
                  <td className="border border-slate-200 px-4 py-2">Upcoming</td>
                  <td className="border border-slate-200 px-4 py-2 text-slate-500">Scheduled</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">Karnataka</td>
                  <td className="border border-slate-200 px-4 py-2">Q3 2026</td>
                  <td className="border border-slate-200 px-4 py-2 text-slate-500">Scheduled</td>
                </tr>
                <tr>
                  <td className="border border-slate-200 px-4 py-2">Tamil Nadu</td>
                  <td className="border border-slate-200 px-4 py-2">Q3 2026</td>
                  <td className="border border-slate-200 px-4 py-2 text-slate-500">Scheduled</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2>What to do before your phase begins?</h2>
          <p>
            When your state's phase begins, you will receive an assignment SMS from your charge officer. This SMS will contain your HLB (Houselisting Block) number. Before heading into the field, you should generate a base map to understand the boundaries. NakshaBot allows you to paste your SMS and instantly see your geographic boundaries overlaid on high-resolution satellite imagery.
          </p>
        </div>
      </div>
    </div>
  );
}
