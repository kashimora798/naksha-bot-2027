# NakshaBot — Apple-Aesthetic Redesign Guideline
### Dashboard + Landing Page · Desktop & Mobile

This is a complete, implementable redesign spec for NakshaBot, moving the current UI toward Apple's design language (HIG-style clarity, deference, depth) while fixing the specific navigation and information-density problems visible in the current dashboard and landing page. It covers design tokens, information architecture, the home page (including the new Users / Projects / New Maps overview you asked for), component specs, and a shortlist of landing-page fixes — for both desktop and mobile.

---

## 1. What's not working today

A quick, honest read of the current dashboard (mobile + desktop) and landing page:

- **Too many accent colors competing at once** — the indigo "Advanced Auto-Map" tile, the orange "नक्शा बनाएं" tile, green checkmark badges, orange "in progress" badges, and a green "Block Maps" section header are all fighting for attention on one screen. Nothing is clearly *the* primary action.
- **No persistent navigation.** Everything lives in one long vertical scroll — quick actions, stats, live surveys, 29+ map cards, then another 20+ block-map cards. On desktop this wastes the wide viewport; on mobile it means endless scrolling to get anywhere.
- **The stats row undersells the account.** "43 Maps / 1 In Progress / 0 Completed" is the only summary data. There's no sense of the *team* behind the account (who's using it) or *what's new* since the last visit — which is exactly what you asked to add.
- **"My Maps" has no way to scan it quickly.** It's a flat, ungrouped list mixing drafts, completed maps, and maps from five different cities, sorted only by date, with no search or filter.
- **Icon and card styling is inconsistent** — some tiles are colored squares with emoji-like icons, some are line icons, some cards have colored left borders, some don't. It reads as several different UI kits stitched together rather than one system.
- **Landing page mixes multiple button colors and card treatments** (orange primary CTA, dark "Log into Dashboard," teal tab pills, colored feature icons) and leans on stacked full-width sections with little visual rhythm between them.

The redesign below addresses each of these directly.

---

## 2. Design foundations

### 2.1 Typography

Use a system-first stack (renders true San Francisco on Apple devices, a metrically close fallback elsewhere). NakshaBot is bilingual (Hindi/English), so pair it with **Noto Sans Devanagari** for Hindi tatsam text so weight/size stay visually consistent across scripts.

```css
--font-display: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Inter", sans-serif;
--font-text: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", sans-serif;
--font-hindi: "Noto Sans Devanagari", -apple-system, sans-serif;
```

| Role | Size / Line height | Weight | Use |
|---|---|---|---|
| Large Title | 34px / 41px | 700 | "Namaste, FitCare 👋" |
| Title 1 | 28px / 34px | 700 | Section-level page headers |
| Title 2 | 22px / 28px | 600 | "My Maps", "Overview" |
| Headline | 17px / 22px | 600 | Card titles (map name, tile label) |
| Body | 17px / 22px | 400 | Descriptions, list metadata |
| Subheadline | 15px / 20px | 400 | Secondary metadata (location, date) |
| Footnote | 13px / 18px | 400 | Badge text, timestamps |
| Caption | 12px / 16px | 500 | Stat labels, tab labels |

Rule of thumb: use **weight**, not size, to separate a map title from its metadata — don't introduce a fourth or fifth font size to do that job.

### 2.2 Color — pick one accent

The single biggest fix available here: **collapse every current accent into one.** Recommend **Indigo `#5B5FEF`** (close to the existing "Advanced Auto-Map" tile) as the sole accent for every actionable element — primary buttons, active nav state, links, selected tabs, the "New" badge ring. Orange and green stop being "brand colors" and become purely **semantic** (in-progress / completed), used only on tiny status badges, never on large surfaces.

```css
:root {
  --label: rgba(0,0,0,0.92);
  --label-secondary: rgba(0,0,0,0.58);
  --label-tertiary: rgba(0,0,0,0.30);

  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f7;   /* page background */
  --bg-tertiary: #ffffff;    /* card surfaces */
  --separator: rgba(0,0,0,0.08);

  --accent: #5B5FEF;         /* the ONE accent — replaces indigo tile + orange tile */
  --accent-tint: rgba(91,95,239,0.12);

  --success: #34c759;   /* completed status only */
  --warning: #ff9500;   /* in-progress status only */
  --danger:  #ff3b30;   /* draft / error status only */
}

[data-theme="dark"] {
  --label: rgba(255,255,255,0.92);
  --label-secondary: rgba(255,255,255,0.55);
  --label-tertiary: rgba(255,255,255,0.28);
  --bg-primary: #000000;
  --bg-secondary: #1c1c1e;
  --bg-tertiary: #2c2c2e;
  --separator: rgba(255,255,255,0.12);
  --accent: #7B7FFF;
  --accent-tint: rgba(123,127,255,0.18);
  --success: #30d158; --warning: #ff9f0a; --danger: #ff453a;
}
```

**Materials:** the top bar and mobile bottom tab bar use frosted glass, not a flat white/beige fill:

```css
.material-regular {
  background-color: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 0.5px solid var(--separator);
}
```

### 2.3 Spacing, shape, depth

```css
--space-2: 8px; --space-4: 16px; --space-6: 24px; --space-8: 32px; --space-10: 40px;

--radius-sm: 8px;    /* badges, chips */
--radius-md: 14px;   /* buttons, list rows */
--radius-lg: 20px;   /* cards, tiles */
--radius-full: 999px; /* pills only */

--shadow-sm: 0 1px 2px rgba(0,0,0,0.06);   /* resting cards */
--shadow-md: 0 4px 12px rgba(0,0,0,0.08);  /* hover / dragged */
```

Replace the current card style (colored left border + drop shadow on every single card) with **flat cards on `--bg-tertiary`, 0.5px hairline separators between list rows**, and reserve shadow for genuinely elevated elements (the "+ New Survey" floating button, open sheets).

### 2.4 Iconography

Standardize on **one outline icon set** at a consistent stroke weight (SF Symbols-style, or Tabler/Phosphor outline as a web substitute). Every quick-action tile currently uses a different visual language (flat color block, emoji-style graphic, line icon) — replace all of them with: neutral `--bg-secondary` squircle background + a single-color outline icon, tinted `--accent` only for the one primary action ("नक्शा बनाएं / Make a Map").

---

## 3. Information architecture — fixing navigation

**Desktop:** move from "one long page" to a persistent left sidebar + scrollable content pane.

```
┌───────────┬─────────────────────────────────────────┐
│  Sidebar  │  Top bar (material, sticky)              │
│  (240px)  ├─────────────────────────────────────────┤
│           │  Content (max-width 1120px, centered)    │
│  Home     │                                           │
│  Maps     │                                           │
│  Block    │                                           │
│  Survey   │                                           │
│  Learn    │                                           │
│  ───      │                                           │
│  Profile  │                                           │
└───────────┴─────────────────────────────────────────┘
```

**Mobile:** replace the row of 5 quick-action cards competing with the header for top-of-screen space with a **bottom tab bar** (material, icon + label, accent tint on the active tab) — the thumb-reachable Apple pattern. Quick actions move into a compact horizontal scroll strip just below the greeting, not full-width stacked tiles.

```
Home · Maps · Survey (center, elevated) · Learn · Profile
```

This alone resolves most of the "too much scrolling to find anything" problem — Maps, Block Maps, and Field Survey each become their own screen instead of stacked sections on one infinite page.

---

## 4. Home page redesign (the core ask)

### 4.1 New "Overview" stat row — adds Users, Projects, New Maps

Replace the 3-tile stat row (Maps / In Progress / Completed) with a 5-metric overview that answers "how is my team doing" at a glance:

| Metric | Source | Why it's new |
|---|---|---|
| **Maps** | total maps created | existing |
| **In Progress** | status = pending/draft | existing |
| **Completed** | status = completed | existing |
| **Team members** *(Users)* | count of active users on this account | **new** — FitCare is an org account; surfacing "6 surveyors active" builds trust that the team is working, and is the entry point to an invite/manage-team flow |
| **New this week** | maps created in last 7 days | **new** — turns "43 Maps" from a static number into a sense of momentum |

**Desktop:** 5 metric cards in a single row, `--bg-secondary` flat fill, no border, `--radius-lg`, equal width, `gap: 16px`.

**Mobile:** 2×2 grid for Maps / In Progress / Completed / Team Members, with "New this week" surfaced instead as a small accent-tinted pill directly under the greeting ("+4 maps this week") rather than a 5th grid cell — keeps the grid clean at narrow width.

```
Desktop:  [ 43 Maps ] [ 1 In Progress ] [ 0 Completed ] [ 6 Team Members ] [ +4 This Week ]

Mobile:   Namaste, FitCare 👋            [+4 maps this week]
          [ 43 Maps ]      [ 1 In Progress ]
          [ 0 Completed ]  [ 6 Team ]
```

### 4.2 New "New Maps" strip — surfaces recent activity

Today, a newly created map is buried in the same flat list as maps from three months ago. Add a dedicated horizontally-scrollable strip, directly under Overview, showing only maps created in the **last 7 days**, each tagged with a small `--accent`-tinted "New" pill. This gives "new maps" real visibility without cluttering the main list.

- Card: map thumbnail placeholder or auto-generated tile color, map name, location, "New" pill, relative timestamp ("2 days ago").
- If there are zero new maps, hide the section entirely rather than showing an empty state — don't spend permanent vertical space on a rare-empty section.

### 4.3 "My Maps" — from flat list to a scannable, filterable list

- Add a **search field + filter chips** (All / In Progress / Completed / Draft) directly above the list — this is the single highest-leverage fix for "easy to navigate," given the account already has 43+ maps.
- Group rows under **month headers** ("July 2026", "June 2026") instead of one continuous list — matches how Photos/Files group by date on iOS/macOS.
- Convert each entry from a bordered card to a **flat list row** with a 0.5px hairline separator: leading status dot (green/orange/gray) + map name + metadata line (block ID, location, date) + trailing count ("505 मकान") + chevron.
- Desktop: list rows sit inside one grouped card per month (`--bg-tertiary`, `--radius-lg`, internal hairlines). Mobile: same row style, full width, no card wrapper — rows separated only by hairlines, which is lighter for a narrow screen.

### 4.4 Live Survey card

Keep this concept — it's good — but restyle: `--bg-tertiary` surface, `--radius-lg`, `--shadow-sm`, status shown as a small `--warning`-tinted pill (not a full orange-tinted badge dominating the card), and the "Continue" button becomes a `.btn-filled` in `--accent`, not orange, so it reads as *the* primary action on the page.

### 4.5 Full desktop layout (top to bottom)

1. Sticky material top bar — logo, search, notifications, "+ New Survey" (filled, accent), profile avatar.
2. Greeting — "Namaste, FitCare 👋" + subtitle.
3. Quick actions — 5 icon tiles in a single row, neutral background, one tinted (Make a Map).
4. Overview — 5 metric cards.
5. Live Surveys — pending survey card(s).
6. New Maps — horizontal strip (only if non-empty).
7. My Maps — search/filter bar + month-grouped list, paginated or "Show more" after ~10 rows rather than rendering all 43+ at once.

*(Block Maps becomes its own sidebar destination rather than a second infinite list stacked under My Maps.)*

### 4.6 Full mobile layout (top to bottom)

1. Material top bar — logo, bell, avatar (compact).
2. Greeting + "New this week" pill.
3. Quick actions — horizontal scroll strip, not stacked full-width cards.
4. Overview — 2×2 metric grid.
5. Live Surveys — full-width card(s).
6. New Maps — horizontal scroll strip.
7. My Maps — search bar + filter chips (horizontal scroll) + grouped, hairline-separated rows, "Show more" pagination.
8. Bottom tab bar — Home / Maps / Survey / Learn / Profile, material, fixed.

---

## 5. Component specifications

**Quick action tile**
```css
.action-tile {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  display: flex; flex-direction: column; gap: 8px;
}
.action-tile.primary { background: var(--accent-tint); }
.action-tile.primary .icon { color: var(--accent); }
```
One tile per screen may use `.primary` — the rest stay neutral. Currently four different tiles are colored; after this change, only "नक्शा बनाएं / Make a Map" keeps a tint.

**Metric card**
```css
.metric-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  text-align: left;
}
.metric-card .value { font: 700 28px/1.1 var(--font-display); color: var(--label); }
.metric-card .label { font: 500 12px/1.3 var(--font-text); color: var(--label-secondary); text-transform: uppercase; letter-spacing: 0.02em; }
```

**Map list row**
```css
.map-row {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 16px;
  border-bottom: 0.5px solid var(--separator);
}
.map-row .status-dot { width: 8px; height: 8px; border-radius: 50%; }
.status-dot.completed { background: var(--success); }
.status-dot.progress  { background: var(--warning); }
.status-dot.draft     { background: var(--label-tertiary); }
```

**"New" badge**
```css
.badge-new {
  background: var(--accent-tint); color: var(--accent);
  font: 600 12px/1 var(--font-text);
  padding: 4px 10px; border-radius: var(--radius-full);
}
```

**Primary button**
```css
.btn-filled {
  background: var(--accent); color: #fff;
  border-radius: var(--radius-md);
  padding: 10px 18px; font: 600 17px var(--font-text);
}
```

**Bottom tab bar (mobile)**
```css
.tab-bar {
  background-color: rgba(255,255,255,0.72);
  backdrop-filter: blur(20px) saturate(180%);
  border-top: 0.5px solid var(--separator);
  display: flex; justify-content: space-around;
  padding: 8px 0 max(8px, env(safe-area-inset-bottom));
}
.tab-bar .active { color: var(--accent); }
.tab-bar .item { color: var(--label-tertiary); font: 500 11px var(--font-text); }
```

---

## 6. Landing page — key fixes

The marketing site has the same "too many accents" problem plus uneven section rhythm. Priority fixes, roughly in order of impact:

1. **One CTA color.** The orange "Start Creating Free" and the dark "Log into Dashboard" should become `.btn-filled` (accent) for the primary and `.btn-plain` (accent text, no fill) for the secondary — drop orange from the marketing site entirely so it matches the app.
2. **Simplify the hero.** Bilingual headline is fine conceptually, but keep Hindi and English on visually distinct weight/size tiers (e.g., Hindi as Title 1 above, English as Body below) rather than interleaving script mid-sentence at the same size.
3. **Feature icon consistency.** The "Advanced Canvas Mode" and "Everything you need" grids currently mix colored icon chips — move to the same neutral-squircle-plus-outline-icon pattern as the app's quick-action tiles, so the marketing site and product feel like one system.
4. **Section rhythm.** Use consistent `--space-10`+ vertical gaps between major sections and a single centered `max-width: 1120px` container throughout, rather than alternating full-bleed colored bands.
5. **The satellite-image comparison slider and tutorial video** are strong, differentiated content — keep them, just restyle their surrounding chrome (tab pills, borders) to match tokens above.

---

## 7. Motion

```css
--ease-spring: cubic-bezier(0.32, 0.72, 0, 1);
--duration-fast: 0.18s;
--duration-medium: 0.32s;
```

- Tappable elements (tiles, buttons, list rows): `scale(0.96)` + slight opacity drop on press, spring easing.
- New Maps strip and filter chips: momentum scroll, no custom animation needed.
- Sheets (e.g., "New Survey" flow on mobile): slide up from bottom, dimmed+blurred backdrop, spring easing, grabber bar at top.
- Respect `prefers-reduced-motion`: fall back to opacity-only transitions.

---

## 8. Implementation checklist

- [ ] Collapse all accent usage to one indigo `--accent`; orange/green/red become status-only.
- [ ] Build persistent desktop sidebar; remove single-long-scroll layout.
- [ ] Build mobile bottom tab bar; move quick actions to a horizontal scroll strip.
- [ ] Add Overview metrics: Team Members (Users) and New This Week, alongside existing Maps/In Progress/Completed.
- [ ] Add "New Maps" horizontal strip (last 7 days, hidden if empty).
- [ ] Add search + status filter chips to My Maps; group rows by month.
- [ ] Convert map cards to flat hairline-separated list rows with a status dot.
- [ ] Standardize all icons to one outline set; remove colored icon-chip variety.
- [ ] Apply material/blur treatment to top bar (desktop + mobile) and bottom tab bar (mobile).
- [ ] Landing page: unify CTA color, feature-icon style, and section spacing to the same tokens.
- [ ] Verify 4.5:1 text contrast and 44×44px minimum tap targets across both breakpoints.

## 9. Quick do / don't reference

| Do | Don't |
|---|---|
| One accent color for every actionable element | A different accent per card/tile |
| Flat cards + hairline separators | Colored left-border cards + drop shadow on every card |
| Group "My Maps" by month with search/filter | One continuous 40+ item list |
| Sidebar (desktop) / tab bar (mobile) for navigation | Single long scrolling page for all sections |
| Status color (orange/green/red) only on small badges | Status color as a large tile/card background |
| Outline icons, one stroke weight, tinted only when active | Mixed emoji-style, filled, and outline icons together |
