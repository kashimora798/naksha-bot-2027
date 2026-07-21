import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');

// ─────────────────────────────────────────────────────────────────────────────
// ROUTE SEO MANIFEST
// Each entry defines the static SEO tags injected into dist/{slug}/index.html.
// This bypasses puppeteer entirely, so it works on Vercel CI and locally.
// ─────────────────────────────────────────────────────────────────────────────
const BASE = 'https://examsetu.dev';
const OG_IMAGE = `${BASE}/logo.png`;

const routeSeo = [
  {
    route: '/',
    lang: 'en',
    title: 'NakshaBot — Free HLO Map Maker & HLB Nazari Naksha for Census 2027',
    desc: 'NakshaBot is the #1 free HLO map maker and HLB nazari naksha generator for Census 2027. Auto-generate official layout maps from satellite data. 100% Free.',
    canonical: `${BASE}/`,
    keywords: 'HLO map maker, HLB map maker, nazari naksha, census 2027 map maker, free nazari naksha maker, नजरी नक्शा',
  },
  {
    route: '/how-it-works',
    lang: 'en',
    title: 'How NakshaBot Works — HLB Map Maker for Census 2027',
    desc: 'Learn how to use NakshaBot to create your census HLB layout map in 15 minutes using satellite imagery. Step-by-step guide for enumerators.',
    canonical: `${BASE}/how-it-works`,
    keywords: 'how to make census map, HLB map tutorial, nazari naksha kaise banaye',
  },
  {
    route: '/faq',
    lang: 'en',
    title: 'FAQ — NakshaBot HLB Map Maker for Census 2027',
    desc: 'Frequently asked questions about NakshaBot — the free HLO map maker and HLB nazari naksha tool for Census 2027 enumerators.',
    canonical: `${BASE}/faq`,
    keywords: 'NakshaBot FAQ, census map questions, HLB map help',
  },
  {
    route: '/nazri-naksha-kaise-banaye',
    lang: 'hi',
    title: 'नजरी नक्शा कैसे बनाएं | HLB Census 2027 Map Free',
    desc: 'नजरी नक्शा बनाने का सबसे आसान तरीका। NakshaBot से 15 मिनट में HLB layout map बनाएं। 100% मुफ्त।',
    canonical: `${BASE}/nazri-naksha-kaise-banaye`,
    keywords: 'नजरी नक्शा कैसे बनाएं, nazari naksha kaise banaye, HLB map free, census 2027 naksha',
  },
  {
    route: '/nazri-naksha-kya-hota-hai',
    lang: 'hi',
    title: 'नजरी नक्शा क्या होता है | Census Layout Map explained',
    desc: 'नजरी नक्शा (Nazari Naksha) क्या है और इसे Census 2027 के लिए कैसे बनाते हैं? पूरी जानकारी हिंदी में।',
    canonical: `${BASE}/nazri-naksha-kya-hota-hai`,
    keywords: 'नजरी नक्शा क्या है, nazari naksha kya hota hai, census layout map',
  },
  {
    route: '/hlb-map-download',
    lang: 'en',
    title: 'HLB Map Download Free | Census 2027 Layout Map PDF',
    desc: 'Download your HLB layout map as A4 PDF free. NakshaBot generates official census maps for all Indian states.',
    canonical: `${BASE}/hlb-map-download`,
    keywords: 'HLB map download, census map PDF, layout map free download',
  },
  {
    route: '/hlb-full-form',
    lang: 'en',
    title: 'HLB Full Form | House Listing Block — Census 2027',
    desc: 'What does HLB stand for? HLB full form is House Listing Block. Learn everything about HLB maps and how to create them for Census 2027.',
    canonical: `${BASE}/hlb-full-form`,
    keywords: 'HLB full form, house listing block, HLB meaning census',
  },
  {
    route: '/hlo-full-form',
    lang: 'en',
    title: 'HLO Full Form | House Listing Operation — Census 2027',
    desc: 'What does HLO stand for? HLO full form is House Listing Operation. Learn about HLO maps and the Census 2027 process.',
    canonical: `${BASE}/hlo-full-form`,
    keywords: 'HLO full form, house listing operation, HLO meaning census',
  },
  {
    route: '/hlo-house-numbering',
    lang: 'en',
    title: 'HLO House Numbering Guide | Census 2027 Serpentine Path',
    desc: 'How to number houses in HLO Census 2027. Complete guide on serpentine path, U-loop, and house numbering for enumerators.',
    canonical: `${BASE}/hlo-house-numbering`,
    keywords: 'HLO house numbering, census house numbering, serpentine path census',
  },
  {
    route: '/hlb-map-sample',
    lang: 'en',
    title: 'HLB Map Sample | Census 2027 Layout Map Example PDF',
    desc: 'View a sample HLB layout map for Census 2027. Download an example nazari naksha to understand the official format required by RGI.',
    canonical: `${BASE}/hlb-map-sample`,
    keywords: 'HLB map sample, census map example, nazari naksha sample',
  },
  {
    route: '/hlo-app-census-guide',
    lang: 'en',
    title: 'HLO App Census 2027 Guide | Enumerator Digital Tools',
    desc: 'Complete guide to HLO digital app for Census 2027 enumerators. How to use NakshaBot alongside the HLO app.',
    canonical: `${BASE}/hlo-app-census-guide`,
    keywords: 'HLO app census guide, digital census tool, HLO app guide 2027',
  },
  {
    route: '/nazri-naksha-census-2027',
    lang: 'hi',
    title: 'नजरी नक्शा Census 2027 | जनगणना HLB नक्शा Free Online',
    desc: 'Census 2027 के लिए नजरी नक्शा बनाएं मुफ्त। Satellite map से 15 मिनट में HLB layout map तैयार करें। सभी राज्यों के प्रगणकों के लिए।',
    canonical: `${BASE}/nazri-naksha-census-2027`,
    keywords: 'नजरी नक्शा census 2027, जनगणना नक्शा, HLB map 2027, nazari naksha census',
  },
  {
    route: '/schedule',
    lang: 'en',
    title: 'Census 2027 Schedule | State-wise Enumeration Dates — NakshaBot',
    desc: 'View the complete Census 2027 state-wise enumeration schedule. Know when your state\'s house listing phase begins.',
    canonical: `${BASE}/schedule`,
    keywords: 'census 2027 schedule, enumeration dates, state census dates 2027',
  },
  {
    route: '/rules',
    lang: 'en',
    title: 'Census 2027 HLB Map Rules | RGI Guidelines — NakshaBot',
    desc: 'Official RGI guidelines and rules for creating HLB layout maps in Census 2027. What must be included in your nazari naksha.',
    canonical: `${BASE}/rules`,
    keywords: 'census HLB map rules, RGI guidelines census, nazari naksha rules',
  },
  // ── State Pages (standard StateLandingPage) ──────────────────────────────
  { route: '/up-census-map', lang: 'hi', title: 'UP Census 2027 Nazari Naksha Maker | Kanpur Lucknow HLB Map', desc: 'Generate your Uttar Pradesh enumeration block map for Census 2027. 100% Free. Kanpur, Lucknow, Varanasi, Agra enumerators.', canonical: `${BASE}/up-census-map`, keywords: 'UP census map, Uttar Pradesh HLO map, UP nazari naksha, Lucknow HLB map, Kanpur census 2027' },
  { route: '/maharashtra-census-map', lang: 'mr', title: 'Maharashtra Census 2027 HLB Map | Mumbai Pune Nazari Naksha Online', desc: 'Download your Census Layout Map for Maharashtra. Auto-generate enumeration block map for Mumbai, Pune, Nagpur. 100% Free.', canonical: `${BASE}/maharashtra-census-map`, keywords: 'Maharashtra census map, Mumbai HLB map, Pune census 2027, प्रगणक नजरी नकाशा' },
  { route: '/bihar-census-map', lang: 'hi', title: 'Bihar Census 2027 Map | Patna Gaya HLB Naksha Generator Free', desc: 'Create your Bihar Nazari Naksha online free. HLB mapping for Patna, Gaya, Muzaffarpur for Census 2027.', canonical: `${BASE}/bihar-census-map`, keywords: 'Bihar census map, Bihar nazari naksha, Patna HLB map, census 2027 Bihar' },
  { route: '/mp-census-map', lang: 'hi', title: 'MP Census 2027 Nazari Naksha | Bhopal Indore HLB Map Generator', desc: 'Madhya Pradesh HLB map generator for Census 2027. Free for Bhopal, Indore, Gwalior enumerators.', canonical: `${BASE}/mp-census-map`, keywords: 'MP census map, Madhya Pradesh nazari naksha, Bhopal HLB map, Indore census 2027' },
  { route: '/rajasthan-census-map', lang: 'hi', title: 'Rajasthan Census 2027 Map | Jaipur Jodhpur HLB Naksha Free', desc: 'Create your HLB naksha for Jaipur, Jodhpur, Udaipur for Census 2027. 100% Free.', canonical: `${BASE}/rajasthan-census-map`, keywords: 'Rajasthan census map, Jaipur HLB map, Jodhpur census 2027, nazari naksha Rajasthan' },
  { route: '/hp-census-map', lang: 'hi', title: 'HP Census 2027 Nazari Naksha | Shimla Mandi HLB Map Free', desc: 'Generate your Himachal Pradesh girdawari naksha and HLB map for Census 2027. Free for Shimla, Mandi, Kangra enumerators.', canonical: `${BASE}/hp-census-map`, keywords: 'Himachal Pradesh census map, HP nazari naksha, Shimla HLB map, गिरदावरी नजरी नक्शा' },
  { route: '/kerala-census-map', lang: 'ml', title: 'Kerala Census 2027 Layout Map | Malappuram Kozhikode HLB Naksha', desc: 'Census map generator for Kerala panchayats. HLB maps for Malappuram, Kozhikode, Ernakulam. 100% Free.', canonical: `${BASE}/kerala-census-map`, keywords: 'Kerala census map, Kerala HLB map, Kozhikode census 2027, സെൻസസ് ഭൂപടം' },
  { route: '/karnataka-census-map', lang: 'kn', title: 'Karnataka Census 2027 Nazari Naksha | Bangalore HLB Map Generator', desc: 'Karnataka enumeration block map generator. Draft your HLB map for Bangalore, Mysore, Hubli. 100% Free.', canonical: `${BASE}/karnataka-census-map`, keywords: 'Karnataka census map, Bangalore HLB map, ಜನಗಣತಿ ನಕ್ಷೆ, Karnataka census 2027' },
  { route: '/gujarat-census-map', lang: 'gu', title: 'Gujarat Census 2027 Map | Ahmedabad Surat HLB Naksha Free', desc: 'Gujarati pragnanak naksha maker. HLB naksha for Ahmedabad, Surat, Vadodara. 100% Free.', canonical: `${BASE}/gujarat-census-map`, keywords: 'Gujarat census map, Ahmedabad HLB map, વસ્તી ગણતરી નકશો, Gujarat census 2027' },
  { route: '/punjab-haryana-census-map', lang: 'pa', title: 'Punjab & Haryana Census 2027 HLB Map | Chandigarh Naksha Generator', desc: 'Generate enumeration block naksha for Punjab, Haryana, and Chandigarh. 100% Free.', canonical: `${BASE}/punjab-haryana-census-map`, keywords: 'Punjab census map, Haryana HLB map, Chandigarh census 2027, ਜਨਗਣਨਾ ਨਕਸ਼ਾ' },
  { route: '/uttarakhand-census-map', lang: 'hi', title: 'Uttarakhand Census 2027 HLO Map Maker | Dehradun Haridwar Nazari Naksha', desc: 'Create your Uttarakhand HLO nazari naksha free. HLB block maps for Dehradun, Haridwar, Nainital.', canonical: `${BASE}/uttarakhand-census-map`, keywords: 'Uttarakhand census map, Dehradun HLB map, nazari naksha Uttarakhand' },
  { route: '/jharkhand-census-map', lang: 'hi', title: 'Jharkhand Census 2027 Map Maker | Ranchi Jamshedpur HLB Nazari Naksha', desc: 'Generate your Jharkhand HLB nazari naksha for Census 2027. Free for Ranchi, Jamshedpur, Dhanbad enumerators.', canonical: `${BASE}/jharkhand-census-map`, keywords: 'Jharkhand census map, Ranchi HLB map, census 2027 Jharkhand' },
  { route: '/odisha-census-map', lang: 'or', title: 'Odisha Census 2027 HLO Nazari Naksha | Bhubaneswar Cuttack HLB Map', desc: 'Free Odisha census map maker for Bhubaneswar, Cuttack, Rourkela. ନକ୍ସା (Naksha) generator. 100% Free.', canonical: `${BASE}/odisha-census-map`, keywords: 'Odisha census map, Bhubaneswar HLB map, ନକ୍ସା, census 2027 Odisha' },
  { route: '/chhattisgarh-census-map', lang: 'hi', title: 'Chhattisgarh Census 2027 HLB Map | Raipur Bilaspur Nazari Naksha Maker', desc: 'Best Chhattisgarh HLO map maker. Census nazari naksha for Raipur, Bilaspur, Durg. 100% Free.', canonical: `${BASE}/chhattisgarh-census-map`, keywords: 'Chhattisgarh census map, Raipur HLB map, census 2027 CG' },
  { route: '/telangana-census-map', lang: 'te', title: 'Telangana Census 2027 HLO Map | Hyderabad Warangal HLB Nazari Naksha', desc: 'Free Telangana census map maker for Hyderabad, Warangal, Nizamabad. జనగణన మ్యాప్. 100% Free.', canonical: `${BASE}/telangana-census-map`, keywords: 'Telangana census map, Hyderabad HLB map, జనగణన మ్యాప్, census 2027 TS' },
  { route: '/andhra-pradesh-census-map', lang: 'te', title: 'AP Census 2027 HLB Map Maker | Visakhapatnam Vijayawada Nazari Naksha', desc: 'Andhra Pradesh HLO nazari naksha maker. HLB census map for Visakhapatnam, Vijayawada, Guntur. 100% Free.', canonical: `${BASE}/andhra-pradesh-census-map`, keywords: 'AP census map, Visakhapatnam HLB map, జనగణన నక్షా, census 2027 AP' },
  { route: '/jk-census-map', lang: 'ur', title: 'J&K Census 2027 Map Maker | Srinagar Jammu HLO Nazari Naksha', desc: 'Create Jammu & Kashmir census nazari naksha free. HLO map for Srinagar, Jammu, Anantnag. نظری نقشہ', canonical: `${BASE}/jk-census-map`, keywords: 'JK census map, Srinagar HLB map, نظری نقشہ, census 2027 Jammu Kashmir' },
  { route: '/delhi-census-map', lang: 'hi', title: 'Delhi Census 2027 HLB Map Maker | NCR HLO Nazari Naksha Generator', desc: 'Delhi NCR census map maker. HLO nazari naksha for all Delhi districts. 100% Free.', canonical: `${BASE}/delhi-census-map`, keywords: 'Delhi census map, NCR HLB map, Delhi nazari naksha, census 2027 Delhi' },
  { route: '/goa-census-map', lang: 'en', title: 'Goa Census 2027 HLO Map | Panaji Margao HLB Nazari Naksha Free', desc: 'Generate Goa census nazari naksha. HLO map for Panaji, Margao, Vasco. 100% Free.', canonical: `${BASE}/goa-census-map`, keywords: 'Goa census map, Panaji HLB map, census 2027 Goa' },
  { route: '/meghalaya-census-map', lang: 'en', title: 'Meghalaya Census 2027 HLO Map | Shillong HLB Nazari Naksha Maker', desc: 'Generate your Meghalaya census map. HLO nazari naksha for Shillong, Tura, Jowai. 100% Free.', canonical: `${BASE}/meghalaya-census-map`, keywords: 'Meghalaya census map, Shillong HLB map, census 2027 Meghalaya' },
  { route: '/nagaland-census-map', lang: 'en', title: 'Nagaland Census 2027 HLO Map Maker | Kohima Dimapur HLB Naksha', desc: 'Generate Nagaland census nazari naksha free. HLO map for Kohima, Dimapur. 100% Free.', canonical: `${BASE}/nagaland-census-map`, keywords: 'Nagaland census map, Kohima HLB map, census 2027 Nagaland' },
  { route: '/mizoram-census-map', lang: 'en', title: 'Mizoram Census 2027 Map | Aizawl HLO HLB Nazari Naksha Generator', desc: 'Free Mizoram HLO census map maker for Aizawl, Lunglei. 100% Free.', canonical: `${BASE}/mizoram-census-map`, keywords: 'Mizoram census map, Aizawl HLB map, census 2027 Mizoram' },
  { route: '/sikkim-census-map', lang: 'en', title: 'Sikkim Census 2027 HLO Map Maker | Gangtok HLB Nazari Naksha Free', desc: 'Generate Sikkim census nazari naksha free. HLO map for Gangtok, Namchi. 100% Free.', canonical: `${BASE}/sikkim-census-map`, keywords: 'Sikkim census map, Gangtok HLB map, census 2027 Sikkim' },
  // ── Deep Native-Language SEO Pages ───────────────────────────────────────
  {
    route: '/tamil-nadu-census-map',
    lang: 'ta',
    title: 'தமிழ்நாடு Census 2027 HLB Map | கணக்கெடுப்பு தளவமைப்பு வரைபடம் Online - NakshaBot',
    desc: 'தமிழ்நாடு Census 2027 HLB layout map online-ல் உருவாக்குங்கள். 100% Free. Chennai, Coimbatore, Madurai enumerators-க்கு satellite map-இல் இருந்து A4 PDF.',
    canonical: `${BASE}/tamil-nadu-census-map`,
    keywords: 'Tamil Nadu census map 2027, தமிழ்நாடு கணக்கெடுப்பு நக்சா, HLB map Tamil Nadu, கணக்கெடுப்பு தளவமைப்பு வரைபடம், census naksha Tamil Nadu, Chennai census map',
  },
  {
    route: '/tripura-census-map',
    lang: 'bn',
    title: 'ত্রিপুরা Census 2027 HLB Map | আদমশুমারি লেআউট নক্শা Online Free - NakshaBot',
    desc: 'ত্রিপুরা Census 2027 HLB layout map বিনামূল্যে online-এ তৈরি করুন। Agartala, Udaipur প্রগণকদের জন্য satellite map থেকে A4 PDF। ১০০% বিনামূল্যে।',
    canonical: `${BASE}/tripura-census-map`,
    keywords: 'ত্রিপুরা আদমশুমারি নক্শা, Tripura census map 2027, HLB map Tripura, আদমশুমারি লেআউট মানচিত্র, Agartala census map',
  },
  {
    route: '/west-bengal-census-map',
    lang: 'bn',
    title: 'পশ্চিমবঙ্গ Census 2027 HLB Map | জনগণনা লেআউট নক্শা Online বিনামূল্যে - NakshaBot',
    desc: 'পশ্চিমবঙ্গ Census 2027 HLB layout map online-এ বিনামূল্যে তৈরি করুন। Kolkata, Howrah, Siliguri প্রগণকদের জন্য satellite map থেকে A4 PDF।',
    canonical: `${BASE}/west-bengal-census-map`,
    keywords: 'পশ্চিমবঙ্গ আদমশুমারি নক্শা, West Bengal census map 2027, HLB map West Bengal, Kolkata census map, জনগণনা লেআউট মানচিত্র',
  },
  {
    route: '/assam-census-map',
    lang: 'as',
    title: 'অসম Census 2027 HLB Map | জনগণনা বিন্যাস মানচিত্ৰ Online বিনামূলীয়া - NakshaBot',
    desc: 'অসম Census 2027 HLB layout map online-ত বিনামূলীয়াকৈ তৈয়াৰ কৰক। Guwahati, Dibrugarh, Silchar গণনাকাৰীসকলৰ বাবে satellite map-ৰ পৰা A4 PDF।',
    canonical: `${BASE}/assam-census-map`,
    keywords: 'অসম জনগণনা মানচিত্ৰ, Assam census map 2027, HLB map Assam, Guwahati census map, লোকপিয়ল বিন্যাস মানচিত্ৰ',
  },
  {
    route: '/manipur-census-map',
    lang: 'mni',
    title: 'Manipur Census 2027 HLB Map | লোকশুমারি লেআউট মানচিত্র Online Free - NakshaBot',
    desc: 'Manipur Census 2027 HLB layout map online-দা free-দা তৌগৎলগনি। Imphal, Churachandpur, Thoubal enumerators-শিংগীদমক satellite map-তগী A4 PDF।',
    canonical: `${BASE}/manipur-census-map`,
    keywords: 'Manipur census map 2027, মণিপুর জনগণনা নক্শা, HLB map Manipur, Imphal census map, লোকশুমারি লেআউট মানচিত্র',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// STATIC SEO INJECTION
// Read dist/index.html, inject route-specific SEO tags, save to dist/{slug}/
// This is fast, reliable, works on Vercel CI — no puppeteer needed for SEO.
// ─────────────────────────────────────────────────────────────────────────────
function injectSeoIntoHtml(baseHtml, seo) {
  const seoBlock = `
  <title>${seo.title}</title>
  <meta name="description" content="${seo.desc}" />
  <meta name="keywords" content="${seo.keywords || ''}" />
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
  <link rel="canonical" href="${seo.canonical}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${seo.canonical}" />
  <meta property="og:title" content="${seo.title}" />
  <meta property="og:description" content="${seo.desc}" />
  <meta property="og:image" content="${OG_IMAGE}" />
  <meta property="og:site_name" content="NakshaBot" />
  <meta property="og:locale" content="${seo.lang}_IN" />
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="${seo.canonical}" />
  <meta property="twitter:title" content="${seo.title}" />
  <meta property="twitter:description" content="${seo.desc}" />
  <meta property="twitter:image" content="${OG_IMAGE}" />`.trim();

  // Inject just before </head>
  let html = baseHtml.replace('</head>', `${seoBlock}\n</head>`);
  // Set the correct lang attribute on <html>
  html = html.replace(/<html[^>]*>/, `<html lang="${seo.lang}">`);
  return html;
}

async function run() {
  console.log('📦 Starting static SEO injection for all routes...');

  const baseHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf-8');
  const now = new Date().toISOString().split('T')[0];

  for (const seo of routeSeo) {
    const html = injectSeoIntoHtml(baseHtml, seo);
    const relativePath = seo.route === '/' ? '' : seo.route;
    const targetFolder = path.join(DIST_DIR, relativePath);

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    fs.writeFileSync(path.join(targetFolder, 'index.html'), html);
    console.log(`✅ ${seo.route}`);
  }

  // ── Sitemap ───────────────────────────────────────────────────────────────
  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routeSeo.map(s => `  <url>
    <loc>${BASE}${s.route === '/' ? '' : s.route}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${s.route === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${s.route === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapContent);
  console.log('✅ sitemap.xml generated');

  // ── robots.txt ───────────────────────────────────────────────────────────
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: ${BASE}/sitemap.xml

Crawl-delay: 1

Disallow: /app
Disallow: /live-dashboard
Disallow: /live-session/
Disallow: /live-prep
Disallow: /live-survey
Disallow: /sign-in
Disallow: /sign-up
`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt);
  console.log('✅ robots.txt generated');

  console.log('\n🎉 Prerender complete. All routes have unique SEO tags.');
}

run().catch(err => {
  console.error('Fatal error during prerendering:', err);
  process.exit(1);
});
