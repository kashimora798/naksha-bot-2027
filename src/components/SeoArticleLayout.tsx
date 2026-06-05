import React from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';

interface SeoArticleLayoutProps {
  title: string;
  metaDescription: string;
  h1: string;
  schema?: string;
  children: React.ReactNode;
}

export default function SeoArticleLayout({ title, metaDescription, h1, schema, children }: SeoArticleLayoutProps) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <Helmet>
        <title>{title}</title>
        <meta name="description" content={metaDescription} />
        {schema && <script type="application/ld+json">{schema}</script>}
      </Helmet>
      
      {/* ─── NAVIGATION ─── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/50">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="NakshaBot Logo" className="w-8 h-8 object-contain" />
            <span className="font-bold text-xl font-[Baloo_2] text-slate-800 tracking-tight">NakshaBot</span>
          </Link>
          <Link to="/" className="text-sm font-bold bg-slate-900 text-white px-5 py-2 rounded-full hover:bg-slate-800 transition-colors shadow-sm">
            Generate Map
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-20">
        <article className="prose prose-slate prose-lg lg:prose-xl max-w-none prose-headings:font-[Baloo_2] prose-a:text-orange-600 hover:prose-a:text-orange-700">
          <h1 className="text-4xl lg:text-5xl font-extrabold text-slate-900 mb-8 leading-tight">
            {h1}
          </h1>
          
          {children}
          
          <div className="mt-16 pt-8 border-t border-slate-200">
            <div className="bg-gradient-to-r from-orange-50 to-rose-50 rounded-3xl p-8 border border-orange-100 text-center">
              <h3 className="text-2xl font-bold font-[Baloo_2] text-slate-900 mb-4">अभी अपना Nazri Naksha बनाएं</h3>
              <p className="text-slate-600 mb-6">Census 2027 के लिए HLO ready format में A4 PDF download करें — सिर्फ ₹5 में।</p>
              <Link to="/" className="inline-flex items-center gap-2 bg-gradient-to-r from-orange-500 to-rose-500 text-white font-bold px-8 py-4 rounded-full shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50 hover:-translate-y-1 transition-all">
                Start Creating Free →
              </Link>
            </div>
          </div>
        </article>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-12 text-center text-sm border-t border-slate-800">
        <p>© 2026 NakshaBot. All rights reserved.</p>
      </footer>
    </div>
  );
}
