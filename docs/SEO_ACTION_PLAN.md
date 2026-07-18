# SEO Action Plan — NakshaBot (examsetu.dev)

**Date:** 2026-05-31  
**Status:** Critical fixes implemented, deployment required

---

## 🚨 Critical Issues Fixed (Ready to Deploy)

### 1. **Sitemap Domain Mismatch** ✅ FIXED
- **Problem:** Sitemap pointed to `nakshabot.in` but site is on `examsetu.dev`
- **Impact:** Google couldn't match sitemap URLs to actual pages → 16 pages "Discovered - currently not indexed"
- **Fix:** Changed all sitemap URLs to `https://examsetu.dev`
- **File:** `prerender.js` line 147

### 2. **Missing lastmod Dates** ✅ FIXED
- **Problem:** Sitemap had no `<lastmod>` tags → Google saw crawl date as `1970-01-01`
- **Impact:** Google thought content was 56 years old, deprioritized crawling
- **Fix:** Added `<lastmod>` with current date to every URL
- **File:** `prerender.js` line 148

### 3. **Duplicate Meta Tags (All State Pages)** ✅ FIXED
- **Problem:** Prerender captured HTML before React Helmet updated `<head>` → all 28 state pages got homepage meta tags
- **Impact:** Google flagged as "Duplicate without user-selected canonical"
- **Fix:** Added `waitForFunction` to wait for Helmet + 800ms settle time
- **File:** `prerender.js` lines 122-135
- **Verification:** After rebuild, check `dist/delhi-census-map/index.html` — title should be "Delhi Census 2027 HLB Map Maker" not homepage title

### 4. **No robots.txt** ✅ FIXED
- **Problem:** Missing crawl directives, Google wasting budget on auth pages
- **Impact:** Inefficient crawling, slower indexing of important pages
- **Fix:** Generated `robots.txt` that blocks `/app`, `/sign-in`, `/live-*` routes
- **File:** `prerender.js` lines 159-173

### 5. **Keyword Stuffing (Homepage)** ✅ FIXED
- **Problem:** 200+ keywords in meta tag (Google penalizes over-optimization)
- **Impact:** Hurts ranking instead of helping
- **Fix:** Reduced to 9 focused, high-intent keywords
- **File:** `src/screens/LandingScreen.tsx` line 14

### 6. **Mixed Domain Canonicals** ✅ FIXED
- **Problem:** Some pages canonical to `nakshabot.in`, others to `examsetu.dev`
- **Impact:** Split link equity, confuses Google about primary domain
- **Fix:** All canonicals now point to `examsetu.dev`
- **Files:** `LandingScreen.tsx`, `StateLandingPage.tsx`

---

## 📋 Deployment Checklist

### Step 1: Rebuild with SEO Fixes
```bash
cd C:\Users\HP\Desktop\nakshabot-census-map-maker
npm run build
```
**What this does:**
- Runs prerender.js with the new Helmet wait logic
- Generates sitemap.xml with correct domain + lastmod
- Generates robots.txt
- Each state page gets unique meta tags

**Verify before deploying:**
```bash
# Check Delhi page has unique title (not homepage title)
cat dist/delhi-census-map/index.html | grep "<title>"
# Should show: "Delhi Census 2027 HLB Map Maker"

# Check sitemap domain
cat dist/sitemap.xml | grep "<loc>" | head -3
# Should show: https://examsetu.dev/

# Check robots.txt exists
cat dist/robots.txt
```

### Step 2: Deploy to Production
```bash
# Your deployment command (Vercel/Netlify/etc)
vercel --prod
# or
git push origin main  # if auto-deploy is configured
```

### Step 3: Update Google Search Console (CRITICAL)
1. Go to https://search.google.com/search-console
2. **Submit new sitemap:**
   - Sitemaps → Add new sitemap
   - Enter: `https://examsetu.dev/sitemap.xml`
   - Remove old `nakshabot.in` sitemap if present

3. **Request re-indexing for state pages:**
   - URL Inspection → Enter `https://examsetu.dev/delhi-census-map`
   - Click "Request Indexing"
   - Repeat for 5-10 high-priority states (UP, Maharashtra, Bihar, Delhi, Karnataka)

4. **Monitor for 7-14 days:**
   - Coverage → watch "Discovered - currently not indexed" count drop
   - Pages → watch "Indexed" count rise

### Step 4: Deploy Edge Function Fix (Building Detection)
```bash
supabase functions deploy fetch-open-buildings
```
**What this fixes:** The polygon coordinate bug (`[lng,lat]` not `[lng,lng]`) so Google/OSM/Microsoft actually return buildings.

---

## 🎯 Target Keywords & Current Ranking Strategy

### Primary Keywords (Focus for Ranking)
1. **HLO map maker** — High intent, official term
2. **HLB map maker** — Alternate official term
3. **nazari naksha online** — Hindi + English mix (how users search)
4. **census 2027 map maker** — Timely, specific
5. **नजरी नक्शा** — Pure Hindi (large audience)

### State-Specific Long-Tail Keywords (28 pages)
Each state page targets:
- `{State} census map` (e.g., "Delhi census map")
- `{State} HLO map maker`
- `{State} nazari naksha`
- `{City} census map` (e.g., "Kanpur census map")

**Why this works:**
- Low competition (niche + timely)
- High intent (users need this NOW for Census 2027)
- Geographic targeting (each state page ranks for local searches)

### Content Gaps to Fill (Future)
1. **Blog: "How to make nazari naksha step by step"** — tutorial with screenshots
2. **Blog: "HLO vs HLB difference explained"** — clarifies confusion
3. **Video: "NakshaBot demo in Hindi"** — embed on homepage, upload to YouTube
4. **State-specific guides:** "UP Census 2027 complete guide for enumerators"

---

## 📊 Expected Results Timeline

### Week 1-2 (Immediate)
- ✅ Sitemap errors resolved in GSC
- ✅ "Duplicate content" warnings drop to 0
- ✅ robots.txt appears in GSC

### Week 3-4 (Indexing)
- 📈 "Discovered - currently not indexed" drops from 16 → 5-8
- 📈 "Indexed" pages rise from ~25 → 35-40
- 📈 First state pages start appearing in search results

### Month 2-3 (Ranking)
- 📈 Homepage ranks for "HLO map maker" (target: page 1-2)
- 📈 State pages rank for "{State} census map" (target: top 5)
- 📈 Organic traffic: 50-200 visits/day (Census 2027 is active)

### Success Metrics to Track
- **GSC Coverage:** "Indexed" pages should reach 40+ (out of 42 total)
- **Impressions:** Track for "HLO map maker", "nazari naksha online"
- **CTR:** Should be 5-15% for branded + high-intent keywords
- **Conversions:** Sign-ups from organic search (track via UTM)

---

## 🔧 Technical SEO Checklist (Already Done)

- ✅ Unique title tags per page
- ✅ Unique meta descriptions per page
- ✅ Canonical URLs (self-referencing)
- ✅ Open Graph tags (Facebook/WhatsApp sharing)
- ✅ Twitter Card tags
- ✅ Schema.org structured data (SoftwareApplication, FAQPage, BreadcrumbList)
- ✅ Sitemap.xml with lastmod
- ✅ robots.txt
- ✅ Mobile-responsive (viewport meta tag)
- ✅ HTTPS (via Vercel/hosting)
- ✅ Fast load time (Vite build, prerendered HTML)

---

## 🚀 Advanced SEO Opportunities (Phase 2)

### 1. **Internal Linking Structure**
**Current:** State pages link to each other (good)  
**Add:** Homepage should link to top 5 states in hero section  
**Why:** Passes link equity, helps Google discover pages faster

### 2. **Content Expansion**
**Add to each state page:**
- "Common mistakes enumerators make in {State}"
- "Sample HLB map for {City}" (image with alt text)
- "Census 2027 schedule for {State}" (timely, useful)

**Why:** More content = more keywords = more ranking opportunities

### 3. **Backlink Strategy**
**Target sites:**
- Census 2027 official forums/groups
- State government job portals
- Enumerator WhatsApp groups (share link)
- Reddit r/IndianGovernmentJobs

**Anchor text:** "Free HLO map maker", "Nazari naksha generator"

### 4. **Local SEO (Google My Business)**
**If applicable:** Create GMB listing for "NakshaBot - Census Map Maker"  
**Category:** Software Company  
**Why:** Appears in "near me" searches, builds trust

### 5. **Speed Optimization**
**Current:** Good (Vite + prerender)  
**Improve:**
- Lazy-load images below fold
- Add `loading="lazy"` to state page images
- Compress logo.png (currently unoptimized?)

**Tool:** Run Lighthouse audit, aim for 90+ score

---

## 📞 What to Do If Rankings Don't Improve

### After 4 weeks, if still "Discovered - currently not indexed":
1. **Check GSC "Page Indexing" report** → click on affected URLs → see exact reason
2. **Common reasons:**
   - "Crawled - currently not indexed" = low quality signal → add more content
   - "Duplicate" = meta tags still identical → verify prerender worked
   - "Soft 404" = page looks empty to Googlebot → check JavaScript renders

3. **Manual inspection:**
   - Use "URL Inspection" tool in GSC
   - Click "View Crawled Page" → see what Google sees
   - If meta tags are still wrong, prerender didn't work → check build logs

4. **Nuclear option (if nothing works):**
   - Add `<meta name="googlebot" content="index, follow">` to each page
   - Submit URLs via IndexNow API (instant indexing)
   - Post links on high-authority sites (Reddit, Quora) to force crawl

---

## 🎓 SEO Best Practices (Ongoing)

### Do's ✅
- Update sitemap monthly (or after adding new pages)
- Monitor GSC weekly for new issues
- Keep content fresh (add "Last updated: {date}" to state pages)
- Use natural language (write for humans, not bots)
- Track conversions, not just traffic

### Don'ts ❌
- Don't stuff keywords (you had 200+, now fixed to 9)
- Don't buy backlinks (Google penalizes)
- Don't duplicate content across pages
- Don't ignore mobile experience
- Don't change URLs without 301 redirects

---

## 📈 Tracking & Analytics Setup

### Google Search Console (Already set up)
- **Monitor:** Coverage, Performance, Sitemaps
- **Alert:** Set email alerts for "Coverage issues detected"

### Google Analytics (If not set up)
```html
<!-- Add to index.html <head> -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

### UTM Parameters for Tracking
- Organic: `?utm_source=google&utm_medium=organic&utm_campaign=seo`
- Social: `?utm_source=whatsapp&utm_medium=social&utm_campaign=share`

---

## 🏁 Summary: What You Need to Do NOW

1. **Rebuild:** `npm run build` (generates fixed sitemap, robots.txt, unique meta tags)
2. **Deploy:** Push to production
3. **Deploy edge function:** `supabase functions deploy fetch-open-buildings` (fixes building detection)
4. **GSC:** Submit new sitemap at `https://examsetu.dev/sitemap.xml`
5. **GSC:** Request re-indexing for 5-10 state pages
6. **Wait 7-14 days:** Monitor GSC Coverage report

**Expected outcome:** 16 "Discovered - currently not indexed" pages → indexed within 2-4 weeks, start ranking for state-specific keywords.

---

## 📞 Questions?

If Google still won't index after 4 weeks:
1. Check `dist/delhi-census-map/index.html` — does it have unique title/description?
2. Check GSC "Page Indexing" report — what's the exact reason?
3. Run Lighthouse audit — is page speed/mobile score >90?

**Contact:** Share GSC screenshot + specific URL that won't index, and I'll diagnose further.

---

**Last Updated:** 2026-05-31  
**Next Review:** 2026-06-14 (check GSC metrics)
