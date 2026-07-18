# NakshaBot — Plan to Make the HLB Layout Map Census-2027 Compliant

> Goal: bring the software-generated PDF (`HLB_0455_Naksha_2027.pdf`) in line with the official
> ORGI "Preparation of Layout Map" / "Building & Census House" guidelines and the specimen
> Rural/Urban layout maps. Grounded in: `Census_2027_Nazari_Map_Complete_Guide.md`,
> `8-building_census_houses.pdf` (Annexure-4), `Census of India 2011 — Preparation of Layout Map.pdf`,
> and the current output PDF (14 pages).

---

## A. Gap analysis — current output vs. official spec

I rendered all pages of the current PDF and read the symbol/PDF code (`src/lib/symbols.ts`,
`src/lib/pdf-export.ts`). Findings:

### 1. Building symbology is NON-COMPLIANT (highest priority)
The spec is explicit (Annexure-4 §viii–x, guide §10):
- **Pucca building = SQUARE □**, Kutcha building = **TRIANGLE △**.
- **Wholly non-residential = the SAME shape but HATCHED** (▨ pucca-nonres, ▲ kutcha-nonres).
- Building number is written **inside** the square/triangle.

Current code (`symbols.ts` `drawSymbolOnCanvas`):
- `pucca_house` → rectangle (OK-ish, should be a true square).
- `kutcha_house` → **house-with-roof shape** ❌ (must be a triangle).
- `non_residential` → rectangle with horizontal lines ❌ (no pucca/kutcha split, no hatching).
- There is **no concept** of "residential vs non-residential" as a hatch modifier — it's a separate symbol type.

→ This is the single biggest correctness gap. An enumerator's map will be rejected because
Pucca/Kutcha can't be told apart and non-residential isn't hatched.

### 2. Title block / header is minimal (non-compliant)
Spec (guide §15, specimen maps): the sheet must carry a full **location particulars block** —
State, District, Tehsil/Taluk, Town/Village, Ward No., HLB No., (EB No.) — typically top-left,
plus a **legend box**, **north arrow**, **scale bar**, and **Enumerator/Supervisor name + signature + date**.

Current output (`pdf-export.ts:354-370`): only a centered "HLB No: 0455" white band at top and a
one-line footer "name | district, state | date". **No legend, no north arrow, no scale bar, no
signature block, no full location particulars.**

### 3. No legend box on the map pages
Specimen maps always include a legend (Pucca/Kutcha res/non-res boxes, road, rail, river, well,
temple, school, boundary line). Current pages have none.

### 4. No north arrow or scale bar on the clean/satellite map pages
Spec requires both. Current pages show neither (the overview page has nothing; block pages have nothing).

### 5. Numbering-direction arrows missing
Spec (Annexure-4 §xii, guide §13) requires **arrows on the map where the building-number sequence
jumps / changes direction**. The app computes a serpentine order (`generateSerpentinePath`) but the
PDF does not draw direction arrows.

### 6. Census-house sub-numbering not shown
Spec: a building with N census houses shows building no. in the box and `5(1)–5(4)` **below** the box.
Current `unit_count` renders an apartment as a range `10-12` inside the box, which is the wrong
convention (that range notation is for the building label, not census-house sub-numbers).

### 7. Boundary line style not per-spec
Spec: HLB boundary = dotted/dashed; neighbouring block/village boundary = different dashed line, with
**neighbouring HLB/village names written outside** each side. Current output draws a solid red boundary
with no neighbour labels.

### 8. Map-reference / locator inset missing
The official EB/HLB sheet includes a **Map Reference Index inset** (small ward map with the block
highlighted) — see specimen. Current output has an "Overview" page but no per-page locator inset.

### What is already GOOD (keep):
- Per-block clean vector pages + satellite reference pages (matches "colour or B/W" intent).
- Serpentine numbering engine already exists.
- Aspect-fill projection and symbol de-clutter/rotation already implemented.
- Pucca/Kutcha/non-residential already exist as data fields on `PlacedSymbol` and the live `SurveySymbol`.

---

## B. Target output (what the compliant PDF should contain)

Per sheet (A4/A3, colour or B/W), following the specimen:

1. **Title block (top-left)**: State, District, Tehsil/Taluk, Town/Village, Ward No., HLB No., EB No.
2. **North arrow** (top-right).
3. **Map body**: boundary (dashed) + neighbour names outside, roads (by type), rail, river/nala,
   landmarks (temple/school/PO/well/pond) with standard symbols, every building as
   **square(pucca)/triangle(kutcha)**, **hatched if non-residential**, number inside, census-house
   sub-numbers below where >1, **direction arrows** where numbering jumps.
4. **Legend box** (bottom-left): the four building boxes + road/rail/river/boundary/landmark keys.
5. **Scale bar** (bottom) + "FOR OFFICIAL USE ONLY".
6. **Locator inset** (bottom-right): ward/overview with this block highlighted.
7. **Signature block (bottom)**: Enumerator name+sign, Supervisor name+sign, Date.
8. **Official register page** (already exists via `generateOfficialRegister`) — verify columns match
   the AHL/Schedule fields and building/census-house numbers.

---

## C. Implementation plan (phased, each independently shippable)

### Phase 1 — Compliant building symbology (CRITICAL) ✅ DONE (2026-05-30)
Files: `src/lib/symbols.ts` (canvas + SVG), `src/types/index.ts`, tests.
Implemented:
- Added `is_residential` + `census_house_count` to `PlacedSymbol`; helpers `buildingShape`,
  `isNonResidential`, `isBuildingSymbol` (precedence: explicit flag → col_4_use_type {1,2}=res → legacy type).
- Rewrote `drawSymbolOnCanvas(ctx, sym, x, y, size)`: pucca/apartment → square, kutcha → triangle,
  wholly non-residential → diagonal hatching clipped to the shape, number inside, census-house
  sub-numbers `N(1)-N(k)` below the box. Landmark icons unchanged.
- Updated `getSmallSymbolSVG` on-screen markers to match (square/closed-path triangle/clipped hatch).
- 11 new unit tests for the derivation helpers (31 total passing). tsc clean, build green.
Files: `src/lib/symbols.ts` (canvas), and the Leaflet small-SVG for on-screen parity.
- Model the symbol as **(shape, hatched)** derived from census data, not as separate types:
  - shape = square if pucca/apartment, triangle if kutcha.
  - hatched = true when the building is wholly non-residential (`col_4_use_type` non-residential,
    or `symbol_type === 'non_residential'`, or a new `is_residential=false` flag).
- Rewrite `drawSymbolOnCanvas`:
  - `pucca` → true square; `kutcha` → triangle; number centered inside.
  - non-residential → draw diagonal hatch lines clipped to the shape.
- Keep dedicated icons (temple/mosque/school/PO/well/pond) for landmarks — those are spec-correct.
- Decision needed: today `non_residential` is its own `SymbolType`. Recommend adding an explicit
  `is_residential` boolean to `PlacedSymbol`/`SurveySymbol` and deriving pucca/kutcha from the wall/roof
  material columns where present, so a single building can be pucca+nonres (hatched square).

### Phase 2 — Title block, legend, north arrow, scale bar, signatures ✅ DONE (2026-05-30)
File: `src/lib/pdf-export.ts`, `src/types/index.ts`, `src/screens/OnboardingScreen.tsx`,
`src/screens/PreviewScreen.tsx`, `src/App.tsx`, the user_profiles migration.
Implemented:
- Rewrote `addOverlays` into proper sheet furniture: `drawTitleBlock` (CENSUS 2027 banner + HLB +
  page subtitle + full location particulars top-left), `drawNorthArrow` (vector, top-right),
  `drawScaleBar` (computed from each page's geographic bbox, "nice" round length, top-left of footer),
  `drawSignatureFooter` (Enumerator + Supervisor sign lines + FOR OFFICIAL USE + date).
- Every page (overview, AI, block, satellite) now passes its bbox so the scale bar is per-page-correct.
- Added `tehsil/townVillage/wardNo/ebNo/supervisorName/sheetSize` to `MapData`; added matching
  columns to the `user_profiles` migration (idempotent `add column if not exists`).
- Onboarding step 3 now collects Tehsil/Town-Village/Ward/EB/Supervisor; `App.tsx` seeds these from
  the profile into every new/loaded project (saved data still wins).
- **Phase 2-c A4/A3 toggle**: `exportBlockPDF` honours `data.sheetSize`; PreviewScreen has an A4/A3
  switch (A4 default). Legend box already lives inside the map canvas (`renderMapToCanvas`).
- Fixed jsPDF single-arg color-setter type errors (use 3-arg numeric form). tsc clean, 31 tests pass.

(original notes below)
File: `src/lib/pdf-export.ts`.
- Add a reusable `drawSheetFurniture(doc, data, {scaleMetersPerPx, bbox})` that renders:
  title block, north arrow (SVG/vector), scale bar (computed from the page's geographic extent),
  legend box, "FOR OFFICIAL USE ONLY", and the signature block.
- Replace the current thin header/footer bands with this furniture, leaving the map inset within
  a framed area (like the specimen) rather than full-bleed, so furniture has room.
- `MapData` already has `district`/`state`; add `tehsil`, `townVillage`, `wardNo`, `ebNo`,
  `supervisorName` (collected in onboarding/SMS-parse or a new "map details" form).

### Phase 3 — Numbering-direction arrows + census-house sub-numbers ✅ DONE (2026-05-30)
- Added direction arrows on the clean map: arrowheads drawn along the serpentine path at the
  start and wherever heading changes > ~50° (the "number jumps" case). `src/lib/pdf-export.ts`.
- Census-house sub-numbers `N(1)…N(k)` below the building box were implemented in Phase 1
  (`drawSymbolOnCanvas` via `census_house_count`).

### Phase 4 — Boundary styling + neighbour labels + locator inset ✅ DONE (2026-05-30)
- HLB boundary changed from solid red to dashed (12/6) with faint fill; numbered corner pins kept.
- Added `MapData.neighbours {north,south,east,west}`; names drawn just outside each bbox edge.
- Added `drawLocatorInset` — top-right thumbnail of the whole HLB with the current block filled,
  drawn on each per-block clean page.

### Phase 5 — Register/AHL alignment ✅ DONE (2026-05-30)
- `generateOfficialRegister` now includes Census-House-No (`N(1)-N(k)`), P/K (Pucca/Kutcha), and
  R/NR (residential/non-residential via `isNonResidential`) columns alongside the existing
  use/head/families/rooms/ownership/water/latrine/fuel/GPS columns. Canonical census column names
  used throughout.

---
(original phase notes retained below)

### Phase 3 (orig) — Numbering-direction arrows + census-house sub-numbers
- Render census-house sub-numbers `N(1)…N(k)` beneath the building box when a building has >1 census
  house; keep apartment unit handling but switch the label convention to match spec.

### Phase 4 — Boundary styling + neighbour labels + locator inset
- HLB boundary → dashed; allow entering neighbouring HLB/village names per side and place them
  outside the boundary on the relevant edge.
- Add a small locator inset (reuse the existing overview render at thumbnail size) to each block page.

### Phase 5 — Register/AHL alignment
- Verify `generateOfficialRegister` columns against the Schedule-1/Schedule-A and AHL fields
  (building no., census-house no., pucca/kutcha, use type, head name, etc.) and the canonical
  census column names already fixed (`col_21_latrine_type`, `col_25_cooking_fuel`).

---

## D. Open questions for you (before building)
1. **Symbol model:** OK to add an explicit `is_residential` flag and derive pucca/kutcha + hatching
   from it, instead of the current separate `non_residential` symbol type? (Recommended.)
2. **Extra location fields** (Tehsil, Town/Village, Ward, EB No., Supervisor name): collect these in
   onboarding, in the SMS/details step, or a new "Map Details" form before export?
3. **Sheet size:** spec prefers **A-3** for the tentative EB/HLB map; current export is A-4. Support A-3
   (or a toggle)?
4. **Colour vs B/W:** keep colour as default with a B/W export option (spec allows either)?
5. **Priority order:** confirm Phase 1 (symbology) first — it's the biggest compliance gap.

### DECISIONS (confirmed 2026-05-29)
1. **Symbol model → Add `is_residential` flag.** Derive shape from pucca/kutcha (square/triangle),
   hatch when `is_residential === false`. A building can be pucca+non-residential (hatched square)
   or kutcha+non-residential (hatched triangle). The legacy `non_residential` symbol type will be
   migrated/mapped onto (shape from material, hatched=true).
2. **Location fields → collect in the ONBOARDING profile** (enumerator name, supervisor name, default
   Tehsil/Town-Village/Ward/EB). Reused across all maps; needs `user_profiles` columns added to the
   migration and the onboarding form. Per-map overrides still allowed at export if needed.
3. **Sheet size → keep A-4 default, add an A-3 toggle** on the export.
4. **Colour vs B/W → (still open)** default colour; B/W toggle is a nice-to-have, not blocking.
5. **Build order → user will REVIEW THIS PLAN FIRST before Phase 1 begins.** Do not start coding yet.


---

## E. Effort estimate
- Phase 1: ~half day (symbol rewrite + on-screen parity + legend entries).
- Phase 2: ~1 day (sheet furniture is the bulk).
- Phase 3: ~half day. Phase 4: ~half day. Phase 5: ~2–3 hrs verification.
