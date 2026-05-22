# NakshaBot — Census 2027 Nazari Naksha Maker

A digital tool for Census 2027 enumerators to create nazari naksha (layout maps) of HLB areas.

## Features
- SMS Parsing for HLB assignment
- Interactive boundary drawing on Leaflet
- Automatic Overpass OSM road and building detection
- Customizable symbol placing and serpentine auto-numbering
- Single-file HTML export and PDF block-by-block export

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```
The build produces a single HTML file via `vite-plugin-singlefile` for easy distribution.
