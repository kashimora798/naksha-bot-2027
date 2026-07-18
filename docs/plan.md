Created At: 2026-05-27T05:58:15Z
Completed At: 2026-05-27T05:58:16Z

				The command completed successfully.
				Output:
				<USER_REQUEST>
 okay this this the plan a lot of thgings are implemented implement thoes which are not implmented and for supabase use its MCP and dont push code to github # NAKSHABOT LIVE SURVEY MODE — COMPLETE IMPLEMENTATION PLAN

---

## SECTION 1 — WHAT IS ALREADY IMPLEMENTED

This section tells the AI builder exactly what exists so nothing is rebuilt unnecessarily.

**Core app infrastructure — DONE**
- React PWA with Vite, Tailwind CSS, mobile-first layout
- Supabase backend with PostgreSQL, Row Level Security, Auth via phone OTP
- Mapbox GL JS rendering with ArcGIS World Imagery satellite tiles
- Offline support via IndexedDB with sync to Supabase on reconnect
- Razorpay UPI payment integration at ₹20 per HLB export
- SMS parsing — paste census SMS, extract HLB number and GPS coordinates
- Boundary polygon drawing via crosshair and pin-drop method
- OSM Overpass API road fetching with Turf.js clipping to boundary
- Microsoft Building Footprints integration for auto building detection
- Block chunking algorithm dividing HLB into manageable sectors
- PDF export pipeline using jsPDF with three variants per block:
  - Clean vector map (white background, black lines)
  - Satellite reference (ArcGIS tiles with vector overlay)
  - AI Survey Map (Flux image-to-image stylized cartographic output)
- Symbol placement system with census icons (pucca house, kutcha house, non-residential, religious buildings, schools, hospitals, wells, water bodies)
- Sequential house numbering — manual tap-to-number system
- Block-level clean map with colored sub-block highlighting
- Supabase spatial cache table for OSM and building data
- Google Dynamic World fallback for areas with no OSM landuse coverage
- Symbol collision detection post-processor before PDF generation
- North arrow, legend, header and footer on all PDF pages

**Partially implemented — NEEDS COMPLETI
<truncated 172 bytes>
eview screen
- Implement OSM road snapping for matched roads
- Show new roads discovery summary
- Implement corrections flow for low-accuracy symbols
- Build sequential incomplete form fill flow

**Phase 7 — Sessions dashboard (Days 18–19)**
- Build SessionsDashboard screen
- Build SessionCard component with static thumbnail
- Implement thumbnail generation on session complete
- Build filter chips (All/Active/Completed/Exported)
- Build search by HLB number or location

**Phase 8 — Session detail and exports (Days 20–22)**
- Build SessionDetail screen with three tabs
- Build interactive map tab with tappable symbols
- Build house list tab with sort and filter
- Build data completeness tab
- Build DownloadOptionsSheet
- Build HouseListView numbered scrollable list
- Implement sketch map export PDF
- Implement official register PDF with jsPDF-autotable
- Implement HLO reference sheet PDF
- Wire Razorpay payment to unlock paid exports

**Phase 9 — Pre-survey preparation screen (Day 23)**
- Build LiveSurveyPrep download checklist screen
- Implement background data download with progress
- Generate and show block stats estimate
- Implement GPS signal acquisition indicator
- Cache all data to IndexedDB on prep complete

**Phase 10 — Sync and polish (Days 24–25)**
- Implement Supabase sync on session end
- Implement sync retry with exponential backoff
- Add offline amber banner
- Performance testing on ₹6,000 Android device
- Fix any GPS accuracy issues on low-end hardware
- Update Sessions navigation from main app menu

---


</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-05-27T11:27:10+05:30.
</ADDITIONAL_METADATA>
<USER_SETTINGS_CHANGE>
The user changed setting `Model Selection` from Gemini 3.5 Flash (High) to Gemini 3.1 Pro (High). No need to comment on this change if the user doesn't ask about it. If reporting what model you are, please use a human readable name instead of the exact string.
</USER_SETTINGS_CHANGE>
undefined
undefined

