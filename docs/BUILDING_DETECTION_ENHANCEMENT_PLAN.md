# Building Detection Enhancement Plan

## Current State
- **Parallel execution:** All 3 sources (Google, OSM, Microsoft) run simultaneously
- **No building classification:** All buildings marked as generic `pucca_house`
- **Land cover separate:** `fetch-landcover` exists but not integrated with building detection

## Requested Changes

### 1. Priority System (Sequential Fallback)
**Current:** Google + OSM + Microsoft in parallel → merge results  
**Requested:** Google → if fails/empty → OSM → if fails/empty → Microsoft

**Pros:**
- Faster response (stop when first succeeds)
- Lower API usage (don't call all three every time)
- Google is best source, use it when available

**Cons:**
- If Google returns partial results (e.g., 10 buildings), we never try OSM/MS
- Rural areas where Google has 0 might benefit from MS+OSM combined

**Recommendation:** Hybrid approach:
- Try Google first (20s timeout)
- If Google returns **0 buildings**, try OSM (12s timeout)
- If OSM returns **0 buildings**, try Microsoft (10s timeout)
- If any source returns >0, use it and stop

### 2. Building Type Classification

#### Google Open Buildings V3
**Can provide:**
- ✅ Polygon geometry
- ✅ Area in square meters
- ✅ Confidence score (0-1)
- ❌ Building type (residential/commercial/school/temple)
- ❌ Construction material (pucca/kaccha)

**Conclusion:** Google cannot classify building types.

#### OpenStreetMap
**Can provide via tags:**
- ✅ `building=house` → residential
- ✅ `building=school` → school
- ✅ `building=temple` / `amenity=place_of_worship` → temple
- ✅ `building=hospital` / `amenity=hospital` → hospital
- ✅ `building=commercial` → commercial
- ✅ `building=apartments` → apartment
- ❌ Pucca vs Kaccha (not in OSM data)

**Implementation:**
```typescript
// In fetchOSM, extract tags from el.tags
const buildingType = el.tags?.building || 'yes';
const amenity = el.tags?.amenity;

// Map to symbol types
let symbolType = 'pucca_house'; // default
if (buildingType === 'school') symbolType = 'school';
else if (buildingType === 'temple' || amenity === 'place_of_worship') symbolType = 'temple';
else if (buildingType === 'hospital' || amenity === 'hospital') symbolType = 'hospital';
else if (buildingType === 'commercial') symbolType = 'commercial';
// ... etc

out.push({ 
  lat, lng, polygon, area_sqm, 
  source: 'osm',
  buildingType: symbolType  // NEW field
});
```

#### Microsoft
**Can provide:**
- ✅ Polygon geometry
- ✅ Area (via polygon)
- ❌ Building type
- ❌ Construction material

**Conclusion:** Microsoft cannot classify building types.

#### Pucca vs Kaccha Classification
**Problem:** No dataset provides this directly.

**Heuristic approach (optional):**
- Small area (<50 m²) + rural location → `kutcha_house`
- Large area (>50 m²) + urban location → `pucca_house`
- But this is unreliable without ground truth

**Recommendation:** 
- Use OSM building types when available
- Default to `pucca_house` for Google/Microsoft
- Let enumerator correct during manual review

### 3. Land Cover Integration

#### Current State
- `fetch-landcover` exists, uses Google Dynamic World
- Returns polygons for: water, farmland, forest
- Called separately in `autoDetectArea()` function

#### Requested Enhancement
Integrate land cover into building detection response so one call returns:
- Buildings with types
- Forest polygons
- Water body polygons

**Implementation Options:**

**Option A: Keep Separate (Current)**
- Client calls `fetch-open-buildings` for buildings
- Client calls `fetch-landcover` for land cover
- Pros: Modular, each function focused
- Cons: Two API calls, two timeouts

**Option B: Unified Call**
- `fetch-open-buildings` internally calls land cover
- Returns: `{ buildings: [...], landCover: { forests: [...], water: [...] } }`
- Pros: One API call, consistent data
- Cons: Longer timeout needed, more complex function

**Recommendation:** Option B (unified) since you want it integrated.

---

## Implementation Plan

### Phase 1: Priority System (Sequential Fallback)
**File:** `supabase/functions/fetch-open-buildings/index.ts`

**Changes:**
```typescript
// OLD: Promise.allSettled([fetchMicrosoft, fetchOSM, fetchGoogle])

// NEW: Sequential with early exit
let buildings = [];
let sources = {};

// Try Google first (best coverage)
const googleResult = await fetchGoogle(n, s, e, w, poly);
sources.google = googleResult.meta;
if (googleResult.out.length > 0) {
  buildings = googleResult.out;
  console.log(`✓ Google returned ${buildings.length} buildings, skipping OSM/MS`);
} else {
  // Google failed or empty, try OSM
  const osmResult = await fetchOSM(n, s, e, w, poly);
  sources.osm = osmResult.meta;
  if (osmResult.out.length > 0) {
    buildings = osmResult.out;
    console.log(`✓ OSM returned ${buildings.length} buildings, skipping MS`);
  } else {
    // OSM failed or empty, try Microsoft
    const msResult = await fetchMicrosoft(n, s, e, w, poly);
    sources.microsoft = msResult.meta;
    buildings = msResult.out;
    console.log(`✓ Microsoft returned ${buildings.length} buildings`);
  }
}

// No merge needed since only one source is used
return { buildings, count: buildings.length, sources };
```

**Impact:**
- Faster: Stop after first success
- Lower cost: Don't call all three every time
- Simpler: No cross-source deduplication needed

### Phase 2: OSM Building Type Extraction
**File:** `supabase/functions/fetch-open-buildings/index.ts`

**Changes in fetchOSM:**
```typescript
// Update Overpass query to include tags
const q = `[out:json][timeout:20];(way["building"](${s},${w},${n},${e});relation["building"](${s},${w},${n},${e}););out geom tags;`;
//                                                                                                                    ^^^^^ ADD THIS

// In the loop, extract building type
for (const el of (d.elements || [])) {
  const tags = el.tags || {};
  const buildingTag = tags.building || 'yes';
  const amenityTag = tags.amenity;
  
  // Map OSM tags to your symbol types
  let symbolType = 'pucca_house'; // default
  if (buildingTag === 'school') symbolType = 'school';
  else if (buildingTag === 'temple' || buildingTag === 'place_of_worship' || amenityTag === 'place_of_worship') symbolType = 'temple';
  else if (buildingTag === 'hospital' || amenityTag === 'hospital') symbolType = 'hospital';
  else if (buildingTag === 'commercial' || buildingTag === 'retail') symbolType = 'commercial';
  else if (buildingTag === 'apartments' || buildingTag === 'residential') symbolType = 'pucca_house';
  else if (buildingTag === 'house' || buildingTag === 'detached') symbolType = 'pucca_house';
  
  out.push({ 
    lat, lng, polygon, area_sqm, 
    source: 'osm',
    buildingType: symbolType  // NEW
  });
}
```

**Client-side change:**
```typescript
// In MapWorkspace.tsx, use buildingType if available
const newSymbols: PlacedSymbol[] = valid.map((b: any) => ({
  id: `building-${crypto.randomUUID()}`,
  symbol_type: b.buildingType || 'pucca_house',  // Use OSM type if available
  lat: b.lat, lng: b.lng,
  number: null,
  placed_at: new Date().toISOString(),
  auto_detected: true,
}));
```

### Phase 3: Land Cover Integration
**File:** `supabase/functions/fetch-open-buildings/index.ts`

**Add land cover fetch:**
```typescript
// After getting buildings, fetch land cover
let landCover = { forests: [], waterBodies: [] };

try {
  // Reuse the same GEE token if Google buildings succeeded
  const token = geeTokenCache?.token || await getGeeToken(sa);
  
  // Fetch Dynamic World land cover
  const dwResult = await fetchDynamicWorld(n, s, e, w, poly, token);
  landCover = dwResult;
} catch (err) {
  console.error('Land cover fetch failed:', err);
  // Non-fatal, continue with buildings only
}

return { 
  buildings, 
  count: buildings.length, 
  sources,
  landCover  // NEW
};
```

**New function:**
```typescript
async function fetchDynamicWorld(n, s, e, w, poly, token) {
  // Query Dynamic World for water (class 0) and trees (class 1)
  // Similar to fetch-landcover but integrated here
  // Returns: { forests: [polygon, ...], waterBodies: [polygon, ...] }
}
```

---

## Questions for You

### 1. Priority System Behavior
When Google returns **10 buildings**, should we:
- **A)** Stop and use those 10 (faster, simpler)
- **B)** Also try OSM/MS and merge all results (more complete, slower)

**My recommendation:** A (stop when first succeeds)

### 2. Building Type Accuracy
OSM building types are only available where mappers added tags. Many buildings will be generic `building=yes` with no type. Should we:
- **A)** Mark all untyped as `pucca_house` (default)
- **B)** Use area heuristic: <50m² → `kutcha_house`, >50m² → `pucca_house`
- **C)** Leave untyped as `unknown` and let enumerator classify

**My recommendation:** A (default to pucca_house, enumerator corrects)

### 3. Land Cover Scope
Should land cover include:
- **Water bodies:** Yes (useful for census)
- **Forests:** Yes (useful for census)
- **Farmland:** Yes (already in your app)
- **Roads:** No (already fetched separately)
- **Bare ground:** No (not useful)

**My recommendation:** Water + Forests + Farmland (already done)

---

## Estimated Impact

### Performance
- **Current:** 6-8s (all three sources in parallel)
- **New:** 2-4s (Google only, stops early)
- **Worst case:** 40s (Google fails → OSM fails → Microsoft)

### Accuracy
- **Building count:** Similar (one source vs merged)
- **Building types:** Better (OSM tags vs generic)
- **Land cover:** Integrated (one call vs two)

### API Costs
- **Google Earth Engine:** Same or lower (stop early)
- **OSM Overpass:** Lower (only if Google fails)
- **Microsoft:** Lower (only if both fail)

---

## Next Steps

1. **Confirm approach:** Do you want sequential (A) or hybrid (B) for priority?
2. **Implement Phase 1:** Priority system
3. **Test:** Verify Google → OSM → MS fallback works
4. **Implement Phase 2:** OSM building types
5. **Test:** Verify schools/temples are classified correctly
6. **Implement Phase 3:** Land cover integration
7. **Deploy:** All changes together

**Estimated time:** 1-2 hours for all three phases.

Ready to proceed?
