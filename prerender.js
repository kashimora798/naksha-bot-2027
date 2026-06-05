import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 9000;
const DIST_DIR = path.join(__dirname, 'dist');

const routes = [
  '/',
  '/nazri-naksha-kaise-banaye',
  '/nazri-naksha-kya-hota-hai',
  '/hlb-map-download',
  '/hlb-full-form',
  '/hlo-full-form',
  '/hlo-house-numbering',
  '/hlb-map-sample',
  '/hlo-app-census-guide',
  '/nazri-naksha-census-2027',
  '/how-it-works',
  '/faq',
  '/schedule',
  '/rules',
  '/up-census-map',
  '/maharashtra-census-map',
  '/bihar-census-map',
  '/mp-census-map',
  '/rajasthan-census-map',
  '/hp-census-map',
  '/kerala-census-map',
  '/west-bengal-census-map',
  '/tamil-nadu-census-map',
  '/karnataka-census-map',
  '/gujarat-census-map',
  '/punjab-haryana-census-map',
  '/uttarakhand-census-map',
  '/jharkhand-census-map',
  '/odisha-census-map',
  '/assam-census-map',
  '/chhattisgarh-census-map',
  '/telangana-census-map',
  '/andhra-pradesh-census-map',
  '/jk-census-map',
  '/delhi-census-map',
  '/goa-census-map',
  '/tripura-census-map',
  '/meghalaya-census-map',
  '/manipur-census-map',
  '/nagaland-census-map',
  '/mizoram-census-map',
  '/sikkim-census-map',
];

// Helper to serve files from dist/ folder
function serveDistFile(req, res) {
  // Decode URL in case of special characters
  const decodedUrl = decodeURIComponent(req.url);
  
  // Strip query parameters
  const pathname = decodedUrl.split('?')[0];

  let filePath = path.join(DIST_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // If requesting a path without extension, serve dist/index.html (standard SPA fallback)
  if (!path.extname(filePath)) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
    } else {
      let contentType = 'text/html';
      if (filePath.endsWith('.js')) contentType = 'application/javascript';
      else if (filePath.endsWith('.css')) contentType = 'text/css';
      else if (filePath.endsWith('.png')) contentType = 'image/png';
      else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
      else if (filePath.endsWith('.json')) contentType = 'application/json';

      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

async function run() {
  console.log('Starting local static server on port', PORT);
  const server = http.createServer(serveDistFile);
  
  await new Promise((resolve) => {
    server.listen(PORT, resolve);
  });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  } catch (err) {
    console.warn('⚠️ WARNING: Failed to launch Puppeteer (often happens on Vercel/CI environments due to missing system libraries).');
    console.warn('Skipping prerendering step. The app will deploy as a standard SPA.');
    server.close();
    process.exit(0);
  }
  
  const page = await browser.newPage();

  // Set viewport to a typical desktop size to prevent mobile scaling issues during prerender
  await page.setViewport({ width: 1200, height: 800 });

  for (const route of routes) {
    console.log(`Prerendering route: ${route}`);
    const url = `http://localhost:${PORT}${route}`;

    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for React Helmet to update the <head> — check for unique title/canonical
      await page.waitForFunction(
        () => {
          const title = document.querySelector('title')?.textContent || '';
          const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
          // Homepage is fine as-is; state pages must have their slug in canonical
          return title.length > 10 && canonical.includes('examsetu.dev');
        },
        { timeout: 5000 }
      ).catch(() => console.warn(`  ⚠️ Helmet may not have updated for ${route}`));

      // Extra settle time for any async Helmet updates
      await new Promise(r => setTimeout(r, 800));

      const html = await page.content();
      
      // Save to route folder (e.g. dist/up-census-map/index.html)
      // Note: '/' should be saved to dist/index.html, NOT dist//index.html
      const relativePath = route === '/' ? '' : route;
      const targetFolder = path.join(DIST_DIR, relativePath);
      
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      
      fs.writeFileSync(path.join(targetFolder, 'index.html'), html);
      console.log(`Successfully saved prerendered HTML: ${route}`);
    } catch (routeErr) {
      console.error(`Failed to prerender route ${route}:`, routeErr.message);
    }
  }

  // Generate sitemap.xml with correct domain and lastmod
  const now = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${routes.map(route => `  <url>
    <loc>https://examsetu.dev${route === '/' ? '' : route}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${route === '/' ? 'daily' : 'weekly'}</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>`).join('\n')}
</urlset>`;

  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemapContent);
  console.log('Successfully generated sitemap.xml');

  // Generate robots.txt
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: https://examsetu.dev/sitemap.xml

# Crawl-delay for polite bots
Crawl-delay: 1

# Block admin/auth routes
Disallow: /app
Disallow: /live-dashboard
Disallow: /live-session/
Disallow: /live-prep
Disallow: /live-survey
Disallow: /sign-in
Disallow: /sign-up
`;
  fs.writeFileSync(path.join(DIST_DIR, 'robots.txt'), robotsTxt);
  console.log('Successfully generated robots.txt');

  console.log('Finished prerendering all routes.');
  await browser.close();
  server.close();
  console.log('Static server stopped. Prerender complete.');
}

run().catch(err => {
  console.error('Fatal error during prerendering:', err);
  process.exit(1);
});
