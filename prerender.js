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

  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();

  // Set viewport to a typical desktop size to prevent mobile scaling issues during prerender
  await page.setViewport({ width: 1200, height: 800 });

  for (const route of routes) {
    console.log(`Prerendering route: ${route}`);
    const url = `http://localhost:${PORT}${route}`;
    
    try {
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      
      // Wait a brief extra moment for the DOM / Helmet to settle
      await new Promise(r => setTimeout(r, 600));

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

  console.log('Finished prerendering all routes.');
  await browser.close();
  server.close();
  console.log('Static server stopped. Prerender complete.');
}

run().catch(err => {
  console.error('Fatal error during prerendering:', err);
  process.exit(1);
});
