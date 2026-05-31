# Deployment Checklist — NakshaBot

## ✅ Pre-Deployment Verification (Run After Prerender Completes)

### 1. Verify SEO Fixes in Built Files
```bash
cd C:\Users\HP\Desktop\nakshabot-census-map-maker

# Check Delhi page has UNIQUE title (not homepage title)
grep "<title>" dist/delhi-census-map/index.html
# Expected: "Delhi Census 2027 HLB Map Maker | NCR HLO Nazari Naksha Generator"

# Check UP page has UNIQUE title
grep "<title>" dist/up-census-map/index.html
# Expected: "UP Census 2027 Nazari Naksha Maker | Kanpur Lucknow HLB Map"

# Check sitemap uses examsetu.dev (not nakshabot.in)
grep "<loc>" dist/sitemap.xml | head -5
# Expected: All URLs start with https://examsetu.dev

# Check sitemap has lastmod dates (not 1970-01-01)
grep "<lastmod>" dist/sitemap.xml | head -3
# Expected: 2026-05-31 or current date

# Check robots.txt was generated
cat dist/robots.txt
# Expected: User-agent: *, Sitemap: https://examsetu.dev/sitemap.xml

# Check Delhi page has unique canonical
grep 'rel="canonical"' dist/delhi-census-map/index.html
# Expected: https://examsetu.dev/delhi-census-map
```

### 2. If ANY Check Fails
- Re-run: `npm run build` (includes prerender)
- Check prerender output for errors
- Verify React Helmet is installed: `npm list react-helmet-async`

---

## 🚀 Deployment Steps

### Step 1: Deploy Website
```bash
# Option A: Vercel
vercel --prod

# Option B: Netlify
netlify deploy --prod

# Option C: Manual (if using custom hosting)
# Upload entire dist/ folder to your web server
```

### Step 2: Deploy Building Detection Edge Function
```bash
# Set Google Earth Engine service account secret
supabase secrets set GEE_SERVICE_ACCOUNT="$(Get-Content -Raw 'exalted-legacy-488915-g1-ff8135213abe.json')"
# Or in Git Bash:
# supabase secrets set GEE_SERVICE_ACCOUNT="$(cat exalted-legacy-488915-g1-ff8135213abe.json)"

# Deploy the function
supabase functions deploy fetch-open-buildings

# Verify deployment
supabase functions list
# Should show: fetch-open-buildings (version 6 or higher)
```

### Step 3: Update Google Search Console
1. Go to https://search.google.com/search-console
2. Select your property: `examsetu.dev`

**Submit New Sitemap:**
- Left sidebar → **Sitemaps**
- Click "Add a new sitemap"
- Enter: `sitemap.xml`
- Click "Submit"
- If old `nakshabot.in` sitemap exists, delete it

**Request Re-Indexing (High Priority Pages):**
- Left sidebar → **URL Inspection**
- Enter URL: `https://examsetu.dev/delhi-census-map`
- Click "Request Indexing"
- Repeat for:
  - `https://examsetu.dev/up-census-map`
  - `https://examsetu.dev/maharashtra-census-map`
  - `https://examsetu.dev/bihar-census-map`
  - `https://examsetu.dev/karnataka-census-map`
  - `https://examsetu.dev/tamil-nadu-census-map`

---

## 🧪 Post-Deployment Testing

### Test Building Detection (Critical)
1. Open your deployed site: `https://examsetu.dev`
2. Sign in / Sign up
3. Create a new map
4. Draw a boundary in **Delhi (Mayapuri area):**
   - Coordinates: ~28.6153°N, 77.1145°E
5. Click "Auto-Detect Buildings"
6. **Expected result:**
   ```
   ✅ Detected 2500+ buildings (MS 0 · OSM 40 · Google 2558)
   ```
7. **If you see `(MS 0 · OSM 0 · Google 0)`:**
   - Check browser console for errors
   - Check Supabase function logs
   - Verify `GEE_SERVICE_ACCOUNT` secret is set

### Test in Different Regions
- **Urban (Delhi):** Should show Google 2000+, OSM 30-50
- **Medium (Jaipur):** Should show Google 500-1000, OSM 20-40, MS 0-20
- **Rural (Mizoram hills):** Should show MS 5-50, OSM 0-10, Google 100-500

### Verify SEO (After 24 Hours)
1. Google Search Console → **Coverage**
   - "Valid" pages should increase
   - "Discovered - currently not indexed" should start decreasing
2. Google Search Console → **Sitemaps**
   - Status should be "Success"
   - "Discovered URLs" should show 42

---

## 📊 Monitoring (First 2 Weeks)

### Daily (First 3 Days)
- Check Supabase function logs for errors
- Test building detection in 2-3 different cities
- Monitor user sign-ups (if any errors reported)

### Weekly (First Month)
- Google Search Console → Coverage report
  - Track "Discovered - currently not indexed" count (should drop)
  - Track "Valid" indexed pages (should rise to 40+)
- Google Search Console → Performance
  - Track impressions for "HLO map maker", "nazari naksha online"
  - Track clicks (should start appearing week 2-3)

### Monthly
- Review organic traffic in Google Analytics
- Check which state pages are ranking
- Identify top-performing keywords
- Plan content expansion based on data

---

## 🚨 Troubleshooting

### Building Detection Returns 0
**Symptom:** `(MS 0 · OSM 0 · Google 0)` even in dense areas

**Diagnosis:**
```bash
# Check Supabase function logs
supabase functions logs fetch-open-buildings --tail

# Common issues:
# - "GEE_SERVICE_ACCOUNT not set" → run secrets set command
# - "token exchange 400" → JSON key is malformed
# - "ee 403" → Earth Engine API not enabled for project
# - "OSM: timeout" → Overpass API is slow, try again
```

**Fix:**
- Verify secret: `supabase secrets list` (should show GEE_SERVICE_ACCOUNT)
- Re-deploy function: `supabase functions deploy fetch-open-buildings`
- Test with smaller boundary (< 1 km²)

### State Pages Not Indexing
**Symptom:** Still "Discovered - currently not indexed" after 2 weeks

**Diagnosis:**
1. Check actual HTML on live site:
   ```bash
   curl https://examsetu.dev/delhi-census-map | grep "<title>"
   ```
2. If title is still homepage title → prerender didn't work
3. If title is correct → Google needs more time (wait 2 more weeks)

**Fix:**
- Re-run: `npm run build` and redeploy
- Request indexing again in GSC
- Add more content to state pages (300+ words)

### Google Earth Engine Quota Exceeded
**Symptom:** `ee 429: quota exceeded` in function logs

**Diagnosis:**
- Free tier: 10,000 requests/day
- If exceeded: too many users or someone testing repeatedly

**Fix:**
- Implement rate limiting on client side
- Cache results per quadkey in Supabase table (Phase 2)
- Upgrade to paid Earth Engine tier if needed

---

## 📞 Support Contacts

**Google Search Console Issues:**
- Help: https://support.google.com/webmasters

**Supabase Function Issues:**
- Docs: https://supabase.com/docs/guides/functions
- Discord: https://discord.supabase.com

**Earth Engine API Issues:**
- Docs: https://developers.google.com/earth-engine
- Forum: https://groups.google.com/g/google-earth-engine-developers

---

## ✅ Success Criteria

### Week 1
- ✅ Website deployed without errors
- ✅ Building detection works in 3+ test cities
- ✅ Sitemap submitted to GSC (status: Success)
- ✅ No critical errors in function logs

### Week 2-4
- ✅ "Discovered - currently not indexed" drops from 16 → <8
- ✅ At least 5 state pages indexed
- ✅ First organic impressions appear in GSC

### Month 2-3
- ✅ 35+ pages indexed (out of 42 total)
- ✅ State pages rank in top 10 for "{State} census map"
- ✅ Organic traffic: 50-200 visits/day
- ✅ 10+ sign-ups from organic search

---

**Last Updated:** 2026-05-31  
**Next Review:** After deployment + 7 days
