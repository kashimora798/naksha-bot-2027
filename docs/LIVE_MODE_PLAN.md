# Live Mode Overhaul + HLO Register Export — Plan

## Context

Live mode (GPS field survey, `step 10`) is ~90% built (quick wins in `LIVE_MODE_QUICK_WINS_DEPLOYED.md` are done) but three big gaps remain, and the user now wants a **complete, separate live-mode flow**: an intelligent map **plus** an official Census-2027 HLO data register, gated by the **same ₹25** payment, exportable as **PDF + XLSX**, driven by a **logical (conditional) form** built from the official schedule in `HLO_SE_Questions_Hindi_English.md`.

Why now: data is currently trapped in the app (no official register export), the house form has no skip-logic, and the column field-set predates the official schedule. This makes live surveys un-submittable to the census office.

### ⚠️ Key finding — column numbering is misaligned with the official 2027 schedule
The stored fields in `src/types/index.ts` (`PlacedSymbol`) use numbers that **don't match** the official HLO 2027 columns:

| Stored field (app) | App means | Official 2027 col | Official meaning |
|---|---|---|---|
| `col_4_use_type` | use of house | **7** | floor material is col 4 |
| `col_6_wall_material` | wall | **5** | |
| `col_7_roof_material` | roof | **6** | |
| `col_9_family_count` | persons | **10** | household no. is col 9 |
| `col_10_head_name` | head name | **11** | persons count is col 10 |
| `col_11_total_rooms` | rooms | **15** | |
| `col_12_ownership` | ownership | **14** | |
| `col_18_water_source` | water source | **17** | |

The official 34-column schedule must be the source of truth. **Decision needed** (see end): introduce a clean canonical field set keyed to official cols 1–34 and migrate old data, vs. keep current names and only map at export time.

---

## Part A — Logical (conditional) HLO form

Rebuild the house data form (`src/components/forms/HouseDataSidebar.tsx`) as a **schema-driven form** that renders cols 2–34 with the exact codes from the doc and enforces the official **skip logic**:

- **Col 7 (use)** drives everything:
  - `7 ∈ {1 residence, 2 res-cum-other}` → show **col 8** (condition) + the household block (cols 9–13) + normal-household block (cols 14–34).
  - `7 ∈ {3…9}` (non-residential) or `0` (vacant) → **hide** cols 8–34 entirely.
- **Cols 9–13** shown only when residential.
- **Institutional household** (household no. `999`) → **hide cols 12, 13** and the normal-household block (14–34).
- **Col 21** (latrine type) shown only if **col 20 ∈ {1, 2}**.
- **Col 18a** (water availability) always paired with col 17.
- Auto fields: **col 1** (line no.), **col 9** (household no. auto), **col 34** (mobile, from profile) — read-only/auto.
- Each field renders as labelled code-buttons (e.g. Floor: मिट्टी(1)…) with Hindi+English, matching the doc.

**Implementation:** one `HLO_SCHEDULE` schema (array of field defs: key, col no., Hindi+Eng label, input type, options[code→label], `visibleWhen(form)`), driven into a generic renderer. This replaces ad-hoc fields and guarantees the form == the register == the official codes.

---

## Part B — Official register export (all 34 columns)

New `src/lib/register-export.ts` producing the HLO register from a live session's symbols:

- **Columns:** all official 1–34, one row per household (institutional rows included). Codes shown as code **and** short label where space allows.
- **PDF:** A3 landscape via `jspdf` + `jspdf-autotable` (already deps). Tiny font (~5–6pt), abbreviated multi-line headers (e.g. "Floor\n(4)"), repeating header row, zebra rows. Reuse the title/footer furniture style from `pdf-export.ts` (`drawTitleBlock`/`drawSignatureFooter`).
- **XLSX:** add **SheetJS (`xlsx`)** — full 34-col sheet + a second "Codes" legend sheet. (Alt: zero-dep CSV; XLSX needs a lib — decision below.)
- **Codes→labels** map lives next to `HLO_SCHEDULE` so form, PDF, and XLSX stay in sync.

---

## Part C — Separate live-mode flow + ₹25 paywall (map AND register)

Live surveys are stored in **IndexedDB** (`idb.ts`), not the `projects` table, so they need their own payment hook:

- On "Export" in a completed live session, show the **same paywall modal** (reuse the `PreviewScreen` paywall). One ₹25 unlocks **both** the live **map PDF** and the **register (PDF/XLSX)** for that session.
- Persist a paid record keyed to the session: a `live_exports` row in Supabase (`session_id`, `user_id`, `payment_id`, `payment_status`) reusing the existing Cashfree functions (`create-cashfree-payment` extended with a `kind: 'live'` + `sessionId`; `verify-payment` handles both). Same trigger-locked `payment_status`.
- **Map render:** reuse the isomorphic renderer — `generateLiveExportPdf` already builds `MapData` from the session and calls `exportBlockPDF`. Route it through the **server** `/api/render-pdf` path (anti-theft) by first saving the session's `MapData` to a `projects`-like row, **or** add a sibling `/api/render-live-pdf` that accepts the session payload. (Map stays server-rendered; register can be client-side since it's tabular, not an image — but gate it on the same paid check.)

---

## Part D — Remaining live-mode bugs/intelligence (from the analysis doc)

Prioritized, after the quick wins already shipped:
1. **Offline building cache** — fetch footprints during boundary-draw, store in IDB, use during recording (rural = no signal). `LiveSurveyScreen` fetchOsmData → cache in `idb.ts`.
2. **Serpentine auto-numbering** — renumber houses NW→clockwise, not chronological (`LiveSurveyEngine.recalculateHouseNumbers`).
3. **Stationary path-gap fix** + **OSM snap toggle** + **block placement outside boundary** (engine).
4. **Form validation** — required head name + persons for residential before save.
5. (Later/optional) photo capture, voice, batch placement, smart suggestions.

---

## Files

| Area | Files |
|---|---|
| Conditional form | `src/lib/hlo-schedule.ts` (new, schema+codes), `src/components/forms/HouseDataSidebar.tsx` (rewrite as schema-driven), `src/types/index.ts` (canonical fields) |
| Register export | `src/lib/register-export.ts` (new: PDF A3 + XLSX), reuse `pdf-export.ts` furniture |
| Live paywall + paid flow | `src/screens/LiveSurveyScreen.tsx` / a new `LiveExportScreen`, reuse `PreviewScreen` paywall; `supabase/functions/create-cashfree-payment` + `verify-payment` (add live kind); migration `live_exports` table |
| Server map render | reuse `api/render-pdf.ts` or add `api/render-live-pdf.ts`; `src/lib/pdf-export.ts` `generateLiveExportPdf` |
| Live bugs | `src/lib/LiveSurveyEngine.ts`, `src/lib/idb.ts`, `src/screens/LiveSurveyScreen.tsx` |

## Verification
- Form: pick col 7 = 3 → cols 8–34 hide; col 7 = 1 + household 999 → cols 12,13,14–34 hide; col 20 = 4 → col 21 hidden. 
- Register PDF (A3) opens with all 34 headers legible; XLSX opens in Excel with data + codes legend.
- Live export shows paywall; after ₹25 both map PDF and register download; re-export works; unpaid is blocked server-side.
- Live bug fixes: offline buildings load with no network; numbers follow serpentine; no placement outside boundary.
- `npm run typecheck` + `npm test` green.

## Open decisions (need your call before building)
1. **Column renumbering:** realign all fields to the official 2027 numbering (cleaner, correct, but a data migration for existing surveys) — recommended — vs. keep current names + map only at export.
2. **XLSX library:** add SheetJS `xlsx` (true .xlsx, ~1 dep) — recommended — vs. ship CSV only (zero-dep, opens in Excel but not native .xlsx).
3. **Live map anti-theft:** route live map through the server renderer (consistent anti-theft, more wiring) vs. allow client render for live (simpler, weaker protection) — register stays gated either way.
