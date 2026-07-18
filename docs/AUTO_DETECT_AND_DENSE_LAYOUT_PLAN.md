# NakshaBot — Plan: Auto Building Detection + Dense-Cluster Layout (Free)

> Addresses 4 problems: (1) OSM often empty, (2) Microsoft/Google integrations detect nothing,
> (3) house boxes cut across roads in the PDF, (4) dense clusters become an unreadable mess.
> Researched against Google Open Buildings V3, VIDA combined footprints, and ORGI layout rules.

---

## PART A — Why the current data fetch fails (root causes, verified in code)

### A1. OSM Overpass (`geo.ts` processOverpassData, MapWorkspace.tsx:348/422)
- Rural India OSM building coverage is genuinely sparse → frequently 0 buildings even when the
  query is correct.
- Elements without `geometry` are **silently skipped** (`geo.ts:253`), 8–10s timeouts abort silently,
  and the catch blocks only `console.warn` (`MapWorkspace.tsx:431`). So "nothing happened" looks
  identical to "no data".

### A2. Microsoft Building Footprints (`supabase/functions/fetch-buildings/index.ts`)
- Endpoint is correct (`minedbuildings...global-buildings/{quadkey}.geojson.gz`) but:
  - **Empty catch blocks** at lines 111 & 131 swallow parse/geometry errors.
  - If a quadkey tile doesn't exist (rural gap), `response.ok` is false and the loop continues silently.
  - Area filter 15–800 m² (`MapWorkspace.tsx:385`) discards big/long rural structures.

### A3. Google Dynamic World (`supabase/functions/fetch-landcover/index.ts`) — **CRITICAL BUG**
- The function returns `{ features, source }` but the client reads `resLandcover.data?.landuseAreas`
  with a `.points` property (`MapWorkspace.tsx:453-459`). **Field-name mismatch → the result is
  always discarded.** This integration has never worked. (Also: Dynamic World is land-COVER, not
  buildings — it can't detect houses anyway; it's only useful for farmland/water.)

**Conclusion:** The integrations don't work mostly because (a) the data sources are empty in rural
India, (b) failures are silent, and (c) Dynamic World is the wrong tool + has a field bug. The fix is
a better building source, not more silent fallbacks.

---

## PART B — Better building data, completely free

### B1. Google Open Buildings V3 + VIDA combined (RECOMMENDED primary)

> **FIX 2026-05-30 (Delhi dense-area regression):** the first `fetch-open-buildings` ran Microsoft
> and OSM in parallel and merged with a ~6 m centroid dedupe. In dense Delhi that dedupe collapsed
> distinct neighbouring buildings, AND a huge Overpass response could hang the whole call — so it
> returned almost nothing where the old MS-only `fetch-buildings` worked fine. Rewritten: Microsoft
> is PRIMARY and returned immediately; OSM runs ONLY as a fallback when MS < 8 buildings, behind a
> 9 s AbortController timeout; cross-source merge drops an MS building only if a hand-mapped OSM one
> is within ~3 m and NEVER dedupes within the same source. Delhi now matches the old function.
- **Google Open Buildings V3** covers all of India incl. rural, ~1.8B footprints, each with a
  **confidence score**. Free.
- **VIDA "Google-Microsoft-OSM Open Buildings"** (Source Cooperative) merges Google+MS+OSM into
  cloud-native **GeoParquet partitioned by country (ISO)** and **PMTiles** for the whole planet, free,
  no API key. India partition: `country_iso=IND`.
- Two ways to consume, both free:
  - **GeoParquet via DuckDB-wasm in the browser**: query only the bbox of the HLB with a spatial
    filter — pulls a few KB, no server. (`duckdb_tutorial.md` from VIDA shows the SQL.)
  - **PMTiles via a Supabase Edge Function**: range-request the building vector tiles for the bbox,
    extract polygons, return centroids. Keeps heavy deps server-side.
- **Action:** replace the broken Dynamic World building path and the flaky MS-only path with a single
  `fetch-open-buildings` edge function hitting the VIDA `country_iso=IND` GeoParquet by bbox, returning
  building centroids + footprint polygons + confidence. Place as `auto_detected` pucca/kutcha guesses
  (default pucca; user confirms type on tap).

### B2. On-device tile segmentation (OPTIONAL, the "see the satellite tiles and dot the houses")
Feasible fully client-side & free, but lower accuracy than B1 — use as a *fallback* when B1 returns
nothing (truly unmapped new construction):
- Fetch the ESRI/Google satellite tiles already used for the boundary bbox (we already render them).
- Run a small **TensorFlow.js / ONNX-web** building-segmentation model (e.g. a quantized U-Net or
  YOLOv8-seg exported to tfjs) on each 256² tile in a Web Worker → binary building mask.
- Post-process the mask: connected-components → centroid of each blob → drop a **small dot** at each
  candidate building (this is exactly the UX you described).
- User taps a dot → it becomes a placed house (type defaults to pucca, editable). Dots they ignore
  are discarded on finalize.
- **Cost:** $0 (model runs in the browser). **Caveats:** needs a pretrained model (~5–15 MB),
  works best on dense/urban roofs, weaker on thatch/kutcha; we MUST show it as "AI suggestion,
  verify on ground" per ORGI rule (AI maps are assist-only, never the official map).

**Recommendation:** Do **B1 first** (far higher accuracy, trivial compute). Add **B2** later as the
"detect from the actual satellite image" booster for areas B1 misses.

### B3. Make failures LOUD
Every fetch path must report count + reason: "Open Buildings: 0 in this area — try AI tile detect
or place manually." No more silent `console.warn`. (Ties into the existing empty-road toast from P2-3.)

---

## PART C — Fix house boxes cutting across roads (the image you sent)

Root cause (verified): symbol placement is a pure **grid-snap in canvas space**
(`pdf-export.ts:280-327`) with a spiral search that only avoids *other symbols* — it has **zero road
awareness**. `declutterSymbols` even accepts a `roads` param but never uses it (`declutter.ts:207`).

### C1. Road-aware placement (core fix)
- Build a set of road polylines in canvas space once per render.
- In the spiral search, reject any candidate cell whose center is within `symSz*0.6` of a road
  polyline (point-to-segment distance). Keep spiralling until a cell clears both symbols AND roads.
- Effect: boxes get nudged just off the carriageway, sitting beside the road like the specimen maps,
  instead of on top of it.

### C2. Leader lines when nudged far
- If a symbol is moved > ~1.5×gridSz from its true position to avoid a road/cluster, draw a thin
  **leader line** from the box back to the true dot location (standard cartographic practice, keeps
  the number associated with the real house).

---

## PART D — Dense clusters: the rules-compliant solution

Per ORGI rules (your guide §13, §16 Case 4/5, and the "not to scale" principle §1): the layout map
is **freehand, NOT to scale**, and congested clusters are handled by **schematic spreading + arrows**,
and where needed an **enlarged inset** of the congested patch. So the valid approaches are:

### D1. Schematic "spread" for dense clusters (rules-allowed, since map is not to scale)
✅ DONE (2026-05-30): added pure helpers `clusterByProximity` (union-find proximity grouping),
`gridBlockOffsets` (row-order near-square block), `centroidXY` in geo.ts (9 unit tests). The PDF
renderer pre-passes house symbols: groups of ≥5 packed tighter than ~0.9×grid are laid out as a
neat block in numbering order at the cluster centroid; existing leader-line logic connects each
back to its true location. Non-clustered symbols still use the road-aware spiral snap.
- Detect clusters: group symbols whose pairwise spacing < the minimum legible box gap.
- For a dense cluster, **lay the houses out on a regular schematic grid/row** near their real centroid
  rather than at exact coordinates — allowed because the map is explicitly not-to-scale and the goal
  is "clearly identify & locate every structure," not metric accuracy.
- Connect the schematic block to its real location with a leader + the serpentine **direction arrows**
  (already added in Phase 3) so the numbering order stays unambiguous.

### D2. Enlarged inset for very congested patches (rules-allowed)
✅ DONE (2026-05-30): `addClusterInsetPages` in pdf-export.ts detects clusters of ≥12 houses within
~3% of the block span (lat/lng `clusterByProximity`) and appends one full **enlarged inset page** per
cluster — a large, schematic, numbered grid of just that cluster (pucca=square, kutcha=triangle),
titled "ENLARGED INSET N — Congested Cluster • not to scale" with the signature footer. Chosen as a
separate page rather than an on-map callout box to avoid colliding with the legend/north/locator/
footer furniture. tsc clean.
- When a cluster is too dense even after D1 (e.g. >N houses in a tiny area), draw a **callout box**
  in a free margin of the sheet: an enlarged, schematic blow-up of just that cluster with its house
  numbers, and a marker ("see inset A") at the real location. This is the standard census method for
  congested bastis/rows and mirrors the urban specimen.

### D3. Adaptive density scaling (cheap immediate win)
- The current `densityScale` (`pdf-export.ts:58-61`) shrinks boxes globally. Instead, scale the
  **grid spacing** per local density so sparse areas stay large/legible and only the dense pocket
  tightens — combined with C1 this removes most overlap.

---

## PART E — Suggested build order
1. **C1 road-aware placement** + **D3 adaptive grid** — immediate, fixes the screenshot, no new deps.
   ✅ DONE (2026-05-30): spiral search now rejects cells within 0.62×symSz of any road polyline;
   symSz derived from median nearest-neighbour spacing (local density) not global count.
   ✅ C2 leader lines also done (box→true-dot dashed line when nudged >1.5×grid). 8 unit tests added.
2. **C2 leader lines** + **D1 schematic spread** — makes dense areas readable & rules-compliant.
3. **B1 Open Buildings (VIDA IND GeoParquet) edge function** — real auto-detection that works in rural India.
   ✅ DONE (2026-05-30): added `supabase/functions/fetch-open-buildings` (Microsoft global footprints
   + OSM buildings, merged & de-duped, returns `sources` breakdown). Client `fetchBuildingsForBlock`
   now calls it, widened area filter 10–1200 m², places `auto_detected` pucca dots. NOTE: still
   Microsoft+OSM, not yet the Google/VIDA GeoParquet (needs a parquet reader in Deno) — that's a
   future upgrade; current version already improves coverage + is testable.
4. **B3 loud failures** — wire into existing toasts.
   ✅ DONE (2026-05-30): `bldgMsg` banner in the symbol panel shows detected count + per-source
   breakdown, or an explicit "unmapped — place manually" / "network failed" message. Fixed the
   Dynamic World field-name bug (now accepts `{features}` GeoJSON, not just `landuseAreas`).
   Added a manual "Auto-Detect Buildings" button; auto-runs once on entering the symbols step.
5. **D2 enlarged inset** — polish for the worst clusters.
6. **B2 on-device tile segmentation** — optional booster; only after B1 proven.

## Open questions for you
1. Detection source priority: **Open Buildings (B1) first**, with on-device AI (B2) only as fallback? (Recommended.)
2. For dense clusters, prefer **schematic spread (D1)** inline, or **enlarged inset (D2)**, or both (spread first, inset only when extreme)?
3. DuckDB-wasm in the browser vs. a Supabase edge function for Open Buildings — any preference? (Edge function keeps the bundle small.)
4. OK to render auto-detected buildings as **unconfirmed dots the user taps to confirm**, defaulting type to Pucca?
