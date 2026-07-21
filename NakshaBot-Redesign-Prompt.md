# The NakshaBot redesign prompt

I cloned `github.com/kashimora798/naksha-bot-2027` and read the actual code (not just the screenshots) so this prompt references real files, real class names, and real bugs — not generic advice. Paste the block between the `PROMPT START`/`PROMPT END` markers straight into Claude Code (or Cursor/Windsurf/etc.) opened at the repo root. Everything above and below the markers is context for you, not part of the prompt.

## What I found in the repo (why the prompt is shaped this way)

- **Stack**: React 19 + Vite 7 + TypeScript, Tailwind CSS v4 (config lives in `src/index.css` via `@theme`, there's no `tailwind.config.js`), React Router v7, Supabase (auth + Postgres), Leaflet + Turf.js for the map canvas, `idb` for offline storage, `jspdf` for exports.
- **This is not a simple multi-page site.** `/app` mounts a single `App.tsx` that drives an 11-step wizard via `step` state (`0` = Dashboard, `3–6` = the Leaflet map workspace, `7–11` = AI map / canvas / preview / export). `MapWorkspace` is deliberately kept mounted (`display:none` when hidden) so the Leaflet instance never gets destroyed — **any redesign has to preserve this**, a rewrite that unmounts it will break map state.
- **Scale**: `DashboardScreen.tsx` (1,377 lines), `CanvasBlockScreen.tsx` (2,169 lines), `LiveSurveyScreen.tsx` (1,669 lines), `PreviewScreen.tsx` (1,382 lines), `MapWorkspace.tsx` (1,580 lines), `SatExtractorWorkspace.tsx` (1,654 lines) are giant, mostly un-componentized files — styling is bespoke inline Tailwind per screen, not shared components. There is currently **no shared UI primitives folder** — only `AppHeader`, `DonationPopup`, `LocationSelectModal`, `GuidedTour`, `ProgressBar`, `SymbolDrawer`, `HouseDataSidebar` exist as standalone components.
- **Concrete inconsistencies already in the code** (cite these to the agent so it fixes them, not just "improves" vaguely):
  - `src/index.css` declares a theme (`--color-warm-paper`, `--color-saffron`, `--color-saffron-container`, `--color-india-green`, `--color-charcoal`, fonts `Public Sans`/`Noto Sans`/`JetBrains Mono`) — but `Baloo_2` is hard-coded as a heading font in **28 separate files** and was never added to the theme.
  - Buttons/badges mix theme tokens, raw Tailwind grays (`bg-gray-900`, `border-slate-200`), and raw Tailwind semantic colors (`orange-50/500/700`, `blue-400`, `green-400`) more or less interchangeably — three different "accent" treatments on one screen.
  - Corner radii are inconsistent (`rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-[24px]`, `rounded-full`) with no scale behind them.
  - `LocationSelectModal`, `DonationPopup`, and the `AppHeader` step-menu drawer all use `animate-in fade-in zoom-in` / `animate-slide-in-left` utility classes that **are not defined anywhere** in `index.css` or the Tailwind v4 theme — these are almost certainly no-op classes, so current "animations" may not really be running.
  - Every popup in the app (`LocationSelectModal`, `DonationPopup`, delete/confirm dialogs) is a **centered modal only** — there is no bottom-sheet pattern anywhere, on any screen size. This is the biggest gap behind your "bottomsheets" ask.
  - `index.html`'s viewport meta sets `maximum-scale=1.0, user-scalable=no` — this blocks pinch-zoom, which is an accessibility regression worth fixing while you're in there.
  - Status/icons mix emoji (`⏳ Saving...`, `📍`, `🌳`, `✓`) with hand-drawn inline SVG line icons in the same views.

Everything above is baked into the prompt below so the agent fixes the *actual* problems in *this* codebase, not a hypothetical one.

---

## PROMPT START

You are doing a complete UI/UX redesign of the NakshaBot repository (React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + React Router v7 + Supabase + Leaflet). This is a **live production app with real field-survey users on Census 2027 mapping work** — you are restyling the presentation layer, not rewriting the application. Read this entire prompt before touching code.

### 0. Hard constraints — do not violate these

1. Do not change any Supabase query, table name, column name, or payload shape in `src/lib/`.
2. Do not change the `step` state machine in `App.tsx` (0 = Dashboard, 3–6 = map workspace, 7–11 = AI map/canvas/preview/export) or its localStorage persistence keys (`app_step`, `app_max_step`, `app_project_id`, `app_map_data`).
3. `MapWorkspace` must stay permanently mounted once entered and only be hidden with CSS (`display:none`/visibility), never conditionally unmounted — this is intentional, preserving live Leaflet + Turf.js state.
4. Do not rename component props, exported function signatures, or TypeScript types that other files import — grep for usages before renaming anything.
5. Preserve the existing i18n system (`src/lib/i18n`, `useTranslation`, `LanguageSelector`) and every Hindi/English bilingual string — you may restyle how text is presented (weight, size, hierarchy) but not remove either language.
6. After every phase below, run `npm run typecheck` and `npm run build` and fix anything that breaks before moving to the next phase. Never hand back a phase that doesn't build.
7. Every interactive element must keep or gain a minimum 44×44px touch target — but do not keep the current blanket `button { min-height: 52px }` global rule (`src/index.css` line ~98), since that oversizes buttons on desktop. Replace it with per-component sizing that hits 44px+ specifically on touch/mobile contexts.

### 1. Design system — build this first, in this order, before touching any screen

**1.1 — Rewrite the `@theme` block in `src/index.css`.** Replace the saffron/india-green dual-accent system with a single-accent, Apple-HIG-inspired token set, keeping Tailwind v4's native `@theme` namespaces so `bg-*`, `text-*`, `rounded-*`, `shadow-*` utilities pick them up automatically:

```css
@theme {
  /* Ink (text) */
  --color-ink: #1c1c1e;
  --color-ink-secondary: rgba(28,28,30,0.62);
  --color-ink-tertiary: rgba(28,28,30,0.32);

  /* Surfaces */
  --color-canvas: #f7f6f2;      /* page background — replaces warm-paper */
  --color-surface: #ffffff;     /* card/sheet background */
  --color-surface-2: #f2f2f0;   /* secondary flat surface, e.g. metric cards */
  --color-hairline: rgba(28,28,30,0.08);

  /* One accent, used only for actionable elements */
  --color-accent: #4340D3;      /* indigo — replaces saffron as THE brand color */
  --color-accent-tint: #EDECFB;
  --color-accent-hover: #34319F;

  /* Status — semantic only, never decorative */
  --color-success: #1D8A4E;
  --color-warning: #B4650B;
  --color-danger: #C0322A;

  /* Radius scale */
  --radius-sm: 8px;
  --radius-md: 14px;
  --radius-lg: 20px;
  --radius-xl: 28px;
  --radius-full: 999px;

  /* Shadow scale — soft and diffuse, replaces --shadow-warm-* */
  --shadow-sm: 0 1px 2px rgba(28,28,30,0.06);
  --shadow-md: 0 4px 16px rgba(28,28,30,0.08);
  --shadow-lg: 0 16px 40px rgba(28,28,30,0.14);

  /* Fonts — Baloo_2 is retired, consolidate to two families */
  --font-public-sans: 'Public Sans', sans-serif;
  --font-noto-sans: 'Noto Sans', sans-serif;
  --font-jetbrains-mono: 'JetBrains Mono', monospace;
}
```

Then **grep the whole `src/` tree for `Baloo`** (currently 28 files) and replace every instance with the `font-public-sans` utility for Latin headings — Noto Sans already covers Devanagari, so no third heading font is needed. Grep for hard-coded `orange-`, `saffron`, `slate-`, `gray-900` used as *brand* color (not neutral chrome) and replace with the new `--color-accent`/`--color-ink` tokens. Keep raw Tailwind grays only for true neutral chrome (borders, disabled states).

**1.2 — Build a `src/components/ui/` primitives folder.** None currently exists; every screen hand-rolls its own buttons/cards/badges. Create, and then migrate screens onto:

- `Button.tsx` — `variant: 'filled' | 'tinted' | 'plain'`, `size: 'sm' | 'md' | 'lg'`. Filled = solid `--color-accent`, white text. Tinted = `--color-accent-tint` background, accent text. Plain = text-only, accent color. Exactly one filled button visible per screen.
- `IconButton.tsx` — 44×44px hit area minimum, transparent by default, `--color-surface-2` on hover.
- `Card.tsx` — flat `--color-surface`, `--radius-lg`, `--shadow-sm`, no colored borders.
- `Badge.tsx` — status pills (`success`/`warning`/`danger`/`neutral`/`accent` variants), replaces ad hoc `bg-orange-50 text-orange-700` style strings scattered across files.
- `Input.tsx` / `Select.tsx` — consistent 44px height, `--radius-md`, focus ring in `--color-accent`.
- `Toast.tsx` — non-blocking, bottom-center on mobile / bottom-right on desktop, auto-dismiss. Use this to replace the inline save-status pill in `AppHeader.tsx` (currently `⏳ Saving...` / `✓ Saved` text badge) with a proper toast that only appears on state *change*, not persistently.
- `Sheet.tsx` — see section 2, this is the most important new primitive.
- `Skeleton.tsx` — loading placeholders for the Dashboard's map list and Sessions list, replacing any current blank/spinner-only loading states.

Define the motion tokens used by all of the above as plain CSS custom properties (Tailwind v4 has no built-in spring easing):

```css
:root {
  --ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
  --duration-fast: 0.18s;
  --duration-medium: 0.32s;
}
```

Do **not** rely on `animate-in`/`fade-in`/`zoom-in`/`animate-slide-in-left` utility classes anywhere (they're currently used in `LocationSelectModal.tsx`, `DonationPopup.tsx`, and `AppHeader.tsx`'s drawer but are not defined in the Tailwind v4 theme — dead classes). Replace them with explicit `@keyframes` tied to the tokens above.

### 2. Popups vs. bottom sheets — the exact pattern to implement

Build one `Sheet` primitive that renders two ways depending on viewport, instead of the "everything is a centered modal" pattern used today:

- **≥768px (tablet/desktop): centered modal.** Backdrop `rgba(0,0,0,0.4)` + `backdrop-filter: blur(8px)`. Panel: `--color-surface`, `--radius-xl`, `--shadow-lg`, max-width 480–560px depending on content, scale-in from 0.95→1 + fade, `var(--duration-medium) var(--ease-spring)`.
- **<768px (mobile): bottom sheet.** Same backdrop. Panel: full width, `--radius-xl` on top corners only, slides up `translateY(100%) → translateY(0)`, `var(--duration-medium) var(--ease-spring)`. Include a centered grabber bar (36×5px, `--color-ink-tertiary` at 30% opacity) at the top. Support drag-to-dismiss: track touch/pointer Y delta on the grabber + header, snap back if released above a 30%-of-height threshold, dismiss if below. Respect `prefers-reduced-motion` by disabling the transform transition and using opacity-only.
- Implement the breakpoint switch with a small `useMediaQuery('(min-width: 768px)')` hook (add this hook to `src/lib` or `src/utils`) — don't duplicate the component for each breakpoint.

Apply this `Sheet` primitive to replace **every** existing popup, in this order:

1. `src/components/LocationSelectModal.tsx` — currently a fixed centered-only modal with emoji icons (`📍`,`🏢`,`🌳`) and a `Baloo_2` heading; rebuild on `Sheet`, replace emoji with the new outline icon set, keep all four choice branches (`onSelectSaved`, `onSelectDemoKanpur`, `onSelectDemoLucknow`, `onSelectNew`) exactly as-is functionally.
2. `src/components/DonationPopup.tsx` — same treatment; keep the Cashfree payment trigger logic untouched, only restyle the shell.
3. `AppHeader.tsx`'s step-menu drawer (currently a hard-coded `w-64` left slide-in panel, not using `Sheet`) — convert to `Sheet` in a left-drawer orientation on desktop and full-height bottom sheet on mobile; keep the reachable/locked step logic (`isClickable`, `maxStep`) untouched.
4. `HouseDataSidebar.tsx` (`src/components/forms/`) — keep as a persistent right-hand panel on desktop (≥1024px), but present it as a `Sheet` bottom sheet on mobile/tablet instead of squeezing a sidebar onto a narrow canvas.
5. `GuidedTour.tsx` — this is a tooltip/coach-mark pattern, not a modal; leave its positioning logic alone but restyle its card to match the new tokens (currently uses its own ad hoc styling).
6. Any inline confirm/delete dialogs you find while working through `DashboardScreen.tsx`, `CanvasBlockScreen.tsx`, and `SessionDetailScreen.tsx` — consolidate them onto `Sheet` too instead of leaving bespoke `fixed inset-0` blocks in each file.

Also add, as new patterns (these don't exist yet):
- A **filter/sort bottom sheet** for the Dashboard's map list (see section 4) — filter chips + sort order, presented via `Sheet`.
- A **destructive-action confirm sheet** (delete map / discard survey) — must use `--color-danger` on the confirm button, `--color-ink-secondary` cancel as a plain button, never make delete the pre-focused default.

### 3. Fix the viewport meta and other quick accessibility wins

- `index.html`: change `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />` to drop `maximum-scale` and `user-scalable=no` — pinch-zoom should never be disabled.
- Replace emoji used as functional status indicators (save status, location pins in `LocationSelectModal`, section markers like `🚶 Live Surveys` / `🧩 ब्लॉक नक्शे`) with the outline icon set + `aria-hidden="true"` on decorative icons and proper `aria-label`s on icon-only buttons (e.g. the hamburger menu button in `AppHeader.tsx` already has `title="Menu"` — add `aria-label` too).
- Every focus state needs a visible 2px `--color-accent` ring with offset — audit `Button`/`IconButton`/`Input` primitives for this first since everything else inherits from them.

### 4. Dashboard redesign (`src/screens/DashboardScreen.tsx`) — includes the Users / Projects / New Maps overview

This is the highest-traffic screen and the one most worth getting right first.

- **Overview stats**: extend the existing `grid grid-cols-3` stats block (Maps / In Progress / Completed, around line ~538) to a 5-metric `Card`/`Skeleton`-backed grid: **Maps, In Progress, Completed, Team Members, New This Week**. "Team Members" and "New This Week" are new — pull team member count from whatever Supabase relation links users to this account/organization (check `src/lib/supabase` and the `profiles`/`projects` tables for the right join; if no team concept exists yet in the schema, stub the count at the current single user for now and leave a `// TODO(data): wire to real team table` comment rather than fabricating data). "New This Week" = count of projects with `created_at` in the last 7 days — this is derivable from existing project data with no schema change.
- Desktop: 5 cards in one row (`grid-cols-5`). Mobile: 2×2 grid for Maps/In Progress/Completed/Team Members, with "New this week" surfaced as a small accent-tinted pill under the greeting instead of a 5th grid cell.
- **New Maps strip**: add a horizontally-scrollable strip directly under Overview showing only projects created in the last 7 days, each with a small accent-tinted "New" `Badge`. Hide the entire section when there are zero new maps rather than showing an empty state.
- **Quick actions row** (currently `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5`, line ~463): keep the 5 actions (Advanced Auto-Map, नक्शा बनाएं, ब्लॉक नक्शा, फील्ड सर्वे, सीखें) but move all of them onto the neutral `--color-surface-2` tile style, and reserve `--color-accent-tint` for exactly one of them — नक्शा बनाएं/"Make a Map", since it's the primary action — instead of the current two differently-colored tiles competing for attention.
- **My Maps list**: add a search input + status filter chips (All/In Progress/Completed/Draft — use the filter-sheet pattern from section 2 on mobile, inline chips on desktop) above the list. Group entries under month headers. Convert each card (the `renderCard` function and its `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` usages, lines ~696–720) from a bordered/shadowed card to a flat hairline-separated list row with a small leading status dot (`--color-success`/`--color-warning`/`--color-ink-tertiary` for completed/in-progress/draft) — this is the fix for 40+ maps being unscannable.
- **Block Maps** (`🧩 ब्लॉक नक्शे`, line ~706): keep functionally identical, apply the same list-row treatment.
- **Navigation shell**: wrap the Dashboard (and `SessionsDashboard.tsx`, `SessionDetailScreen.tsx`, and the `admin/` screens) in a shared shell — persistent left sidebar (Home / Maps / Block Maps / Field Survey / Learn) at ≥1024px, bottom tab bar (material/blurred, icon+label, accent-tinted active state) at <1024px. This shell is new — there is currently no persistent nav, everything is one long scrolling page.

### 5. Map-creation wizard screens — different rules, same tokens

`MapWorkspace.tsx`, `CanvasBlockScreen.tsx`, `SatExtractorWorkspace.tsx`, `AIMapStep.tsx`, `PreviewScreen.tsx`, `SMSParseScreen.tsx` are the 11-step wizard. **Do not restructure their navigation** (`step`/`setStep` from `App.tsx` stays exactly as-is) — only:
- Restyle `AppHeader.tsx` (shared across all of these) with the new tokens; keep its step-progress semantics.
- Convert any tool palettes/property panels within `CanvasBlockScreen.tsx` and `SymbolDrawer.tsx` that currently sit as fixed sidebars into the responsive `Sheet` pattern on narrow viewports (persistent panel ≥1024px, bottom sheet below that) — this is where "highly UI responsive" matters most, since these are the most complex, densest screens and currently have the least mobile adaptation.
- Leave all Leaflet/Turf.js/canvas-drawing logic completely untouched — restyle only the chrome around the map/canvas (toolbars, buttons, panels), never the map layer itself.

### 6. Marketing & static pages

`LandingScreen.tsx`, `HowItWorksPage.tsx`, `FaqPage.tsx`, `ContactScreen.tsx`, `TermsScreen.tsx`, `RefundScreen.tsx`, `StateLandingPage.tsx` (23 state-specific routes, all sharing this one component), `BlogSchedulePage.tsx`, `BlogRulesPage.tsx`, `SeoArticlePage.tsx`:
- Unify all CTA buttons onto the new `Button` primitive — the landing page currently mixes an orange primary CTA with a dark secondary CTA; both become `variant="filled"`/`variant="plain"` in the single accent color.
- `ImageComparisonSlider.tsx` and `AiComparison/AiComparison.tsx` are strong, differentiated content — restyle their surrounding chrome only, keep the comparison interaction logic as-is.
- Apply consistent `max-width: 1120px` centered containers and consistent section spacing (`--space` scale, multiples of 8) across all of these instead of the current alternating full-bleed section widths.
- These pages are SEO-critical (note the `prerender.js` build step and `sitemap.xml`) — do not change any heading text content, only its visual styling, and do not remove any `react-helmet-async` meta tags.

### 7. Admin (`src/screens/admin/`)

Lower priority, but bring `AdminDashboard.tsx`, `AdminUsersScreen.tsx`, `AdminProjectsScreen.tsx`, `AdminSessionsScreen.tsx`, `AdminFeedbackScreen.tsx`, `AdminDonationsScreen.tsx`, `AdminAnnouncementsScreen.tsx` onto the same `Button`/`Card`/`Badge`/`Sheet`/`Toast` primitives once they exist, inside `AdminLayout.tsx`'s existing shell, so the internal tools don't visually diverge from the public product.

### 8. Responsive breakpoints to design and test against

```
Mobile:  < 640px   — bottom tab bar, single column, bottom sheets, 16px content margin
Tablet:  640–1023px — bottom tab bar or condensed sidebar, 2-column grids where noted, 24px margin
Desktop: ≥ 1024px  — persistent sidebar, centered modals, up to 5-column grids, 32px margin
```

Test every touched screen at 375px, 768px, 1024px, and 1440px widths before considering a phase done.

### 9. Definition of done

- [ ] `npm run typecheck` and `npm run build` pass with zero errors.
- [ ] Zero remaining references to `Baloo` anywhere in `src/`.
- [ ] Zero remaining raw `orange-`/`saffron`-as-brand-color or `animate-in`/`zoom-in`/`animate-slide-in-left` classes.
- [ ] Every popup in the app renders as a centered modal ≥768px and a draggable bottom sheet <768px, via the shared `Sheet` component — none left as bespoke `fixed inset-0` blocks.
- [ ] Dashboard shows Maps / In Progress / Completed / Team Members / New This Week, plus a New Maps strip and a searchable, filterable, month-grouped My Maps list.
- [ ] Every button/input/icon-button meets a 44×44px touch target on mobile without oversizing on desktop.
- [ ] Every interactive element has a visible focus ring, a hover state (desktop), and a press state (`scale(0.96)`, spring easing).
- [ ] `prefers-reduced-motion` degrades every sheet/modal/press animation to opacity-only.
- [ ] Viewport meta no longer blocks pinch-zoom.
- [ ] `MapWorkspace`'s Leaflet instance is confirmed still mounted-once/hidden-not-destroyed across step changes (manually verify by drawing a boundary, navigating to another step, and back).
- [ ] Both Hindi and English strings are still present and correctly weighted (Hindi as primary line, English as secondary, per the existing bilingual pattern) on every screen you touch.

Work phase by phase in the order written above (design system → popups/sheets → Dashboard → wizard chrome → marketing pages → admin), verifying build + typecheck after each phase, and tell me what you completed and what's deferred at the end of each phase rather than attempting the entire repo in one pass.

## PROMPT END

---

### How to use this

Open the repo in Claude Code (`claude` in the repo root, or the desktop app pointed at the folder) and paste the block above. Given the file sizes involved (several screens are 1,300–2,200 lines), I'd actually run it phase-by-phase as separate messages rather than one giant request — the prompt is written so each numbered section stands alone as a milestone, so you can stop after Section 1–2 (design system + popups/sheets), review the diff, then continue.
