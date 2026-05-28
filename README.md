# 🗺️ NakshaBot: Census Map Maker 2027

<div align="center">
  <h3><strong>The Ultimate HLB & Nazari Naksha Generator for the 2027 Indian Census</strong></h3>
  <p><strong>Developed by: KRATAGYA SINGH</strong></p>
</div>

---

## 📖 Table of Contents
1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [Technical Stack](#-technical-stack)
4. [Architecture & Implementation Details](#-architecture--implementation-details)
    - [Live Survey Engine](#1-live-survey-engine)
    - [AI Map Generation](#2-ai-map-generation)
    - [Smart Solar Grid & House Numbering](#3-smart-solar-grid--house-numbering)
    - [High-Fidelity PDF Export](#4-high-fidelity-pdf-export)
    - [SEO & Prerendering](#5-seo--prerendering)
5. [Setup & Installation](#-setup--installation)

---

## 🌟 Overview

**NakshaBot** is a highly specialized, cutting-edge web application designed to completely automate and revolutionize the creation of **House Listing Block (HLB)** maps and **Nazari Nakshas** (Layout Maps) for the upcoming **2027 Indian Census**. 

Traditionally, census enumerators map territories manually—a tedious, error-prone, and time-consuming process. NakshaBot solves this by offering a blazing-fast digital interface, intelligent GPS live-survey tools, and a state-of-the-art AI-powered satellite trace engine. 

---

## ✨ Key Features

- **Live Survey Engine with GPS Glitch Prevention**: Enables field workers to physically walk their census blocks. Features real-time GPS tracking, path beautification (Chaikin's algorithm + Ramer-Douglas-Peucker curve simplification), and automatic snapping to OpenStreetMap (OSM) roads.
- **AI-Powered "Survey of India" Map Generation**: Sends tightly cropped satellite tiles of the target block to a Vision AI, returning a perfectly drawn, official-looking map trace devoid of noisy UI elements.
- **Smart Adaptive Solar Grid System**: Intelligently renders houses into scalable grids within drawn block polygons. Prevents overlap and cluster mesh in high-density urban areas by dynamically sizing symbols based on total area.
- **Overpass API Integration**: Automatically fetches real-world Points of Interest (POIs), landmarks, temples, schools, and hospitals to seamlessly insert them into the generated Nazari Naksha for unmatched geographical context.
- **Premium PDF Printing**: High-fidelity, print-ready PDF exports (A4 Landscape and Portrait) using Canvas composite rendering, optimized for extreme clarity.
- **Cashfree/Instamojo Payments Integration**: Fully integrated payment gateway workflows for premium map exports.
- **Massive SEO Architecture**: 42 dynamic state-specific landing pages pre-rendered to rank for exact-match commercial intent keywords (e.g., "HLB map maker UP", "Nazari Naksha generator Bihar").

---

## 🛠 Technical Stack

### Frontend & UI
- **Framework**: React 18 with TypeScript 
- **Build Tool**: Vite (with custom Puppeteer prerendering for SEO)
- **Styling**: Tailwind CSS for responsive, sleek, and animated glassmorphism UI
- **Icons**: Lucide React / Custom SVG

### Mapping & Geolocation
- **Map Render**: Mapbox GL JS (`mapbox-gl`)
- **Drawing Tools**: `@mapbox/mapbox-gl-draw`
- **Geospatial Math**: Turf.js (`@turf/turf`)
- **External Geo APIs**: Overpass API (OSM POIs)

### Backend, Auth, & Storage
- **BaaS**: Supabase
- **Authentication**: Supabase Google OAuth
- **Database**: PostgreSQL (via Supabase) with RLS policies

### Algorithms & Compute
- **Path Smoothing**: Ramer-Douglas-Peucker (RDP) & Chaikin algorithms
- **Rendering**: Canvas 2D API, `html2canvas`, `jspdf`
- **AI Integration**: Custom Vercel Serverless endpoints for Vision AI models

---

## 🧠 Architecture & Implementation Details

### 1. Live Survey Engine (`src/lib/LiveSurveyEngine.ts`)
The `LiveSurveyEngine` acts as a state machine for physical block tracing. It captures the user's geolocation via `navigator.geolocation.watchPosition()`. 
- **Glitch Prevention**: Drops impossible GPS jumps (speed > 10m/s).
- **Road Snapping**: Queries OSM to pull nearest road vectors, seamlessly snapping the user's path to physical roads using a `closestPointOnLine` turf function.
- **Path Beautification**: The recorded path is jagged due to GPS noise. The engine runs it through the RDP algorithm to reduce vertices, and then applies Chaikin's smoothing algorithm to create visually pleasing, sweeping curves for the roads.

### 2. AI Map Generation (`src/lib/survey-api.ts`)
The platform allows one-click generation of AI maps:
- The system calculates the exact `BoundingBox` of the user's drawn polygon.
- It uses the Canvas API to create a deeply zoomed, tight-crop of Mapbox satellite tiles corresponding *exactly* to the drawn block.
- It overlays a bold red stroke for context and prevents UI clutter.
- The base64 output is intelligently compressed under 3.5MB and streamed to the AI layer, which returns an official-looking trace layout.

### 3. Smart Solar Grid & House Numbering (`src/lib/pdf-export.ts`)
To emulate the rigid structure of Indian Census numbering, houses are placed inside geometric sub-blocks. 
- The system divides the internal area into a grid using an adaptive `solar grid snapping` mechanism.
- Based on density (area vs house count), it dynamically scales the house symbols ($square$ and $triangle$) so they never overlap or create "mesh" artifacts, preserving print clarity.

### 4. High-Fidelity PDF Export (`src/lib/pdf-export.ts`)
Because browsers natively struggle with precise print scaling, NakshaBot writes its own Canvas renderer:
- Maps are projected locally via Spherical Mercator Math (`lng2tile`, `lat2tile`) directly onto an off-screen HTML5 Canvas.
- POIs, Houses, Roads, and UI Elements are composited layer by layer.
- Exported securely via `jspdf` directly to the client's file system, triggered upon successful payment webhooks.

### 5. SEO & Prerendering (`prerender.js`)
To dominate Google search for Census 2027:
- Created an extensive SEO matrix (`src/data/seoContent.ts`) with regional keywords (e.g., "नजरी नक्शा").
- Custom Node.js script using `Puppeteer` physically boots the Vite dev server, navigates through the React Router tree to all 40+ dynamic routes, waits for DOM settlement, and writes static `index.html` files to the `dist` folder.
- Results in ultra-fast First Contentful Paint (FCP) and flawless crawler indexing.

---

## 🚀 Setup & Installation

**Prerequisites:**
- Node.js (v18+)
- Mapbox API Token
- Supabase Account

1. **Clone the Repository:**
   ```bash
   git clone <repository-url>
   cd nakshabot-census-map-maker
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create a `.env` file in the root directory:
   ```env
   VITE_MAPBOX_TOKEN=your_mapbox_token_here
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   VITE_PAYMENT_ENV=sandbox
   ```

4. **Run Development Server:**
   ```bash
   npm run dev
   ```

5. **Production Build & Prerender:**
   ```bash
   npm run build
   ```

---

<div align="center">
  <p>Built with ❤️ and precision for the 2027 Indian Census.</p>
  <p><strong>© 2026 NakshaBot | Developed by Kratagya Singh</strong></p>
</div>
