"""
OSM Enrichment for NakshaBot HLB Extraction
=============================================
Extends hlb_extractor.py's output with real road, water-body, and named-place
geometry from OpenStreetMap, clipped to the extracted HLB polygon. Produces a
single enriched GeoJSON FeatureCollection: boundary + roads + water + places.

IMPORTANT — untested against live servers
------------------------------------------
This file was written and reasoned through carefully, but the sandbox this
was built in only allows network access to package registries (pypi, npm,
etc.) — not to overpass-api.de or nominatim.openstreetmap.org. So unlike
hlb_extractor.py (which was run end-to-end on your real PDF and verified),
the Overpass/Nominatim calls below have NOT been executed against the live
APIs. Structure and query syntax are correct to the best of my knowledge,
but test this against a real HLB before trusting it in production, and
watch for: Overpass query timeouts on large/dense polygons, occasional
malformed `geometry` in relations (multipolygons with multiple outer rings
aren't fully handled below — see fetch_osm_features docstring), and rate
limiting under concurrent enumerator load.

Key design decision: OCR'd landmark labels are geolocated using the SAME
free pixel->lat/lon transform from hlb_extractor.py, NOT by network-geocoding
their text through Nominatim. We already know exactly where each label sits
in the image (that's how OCR found it) — converting that pixel position
directly is more accurate than a fuzzy text search (which can return a
same-named place in the wrong town, or miss hyper-local names OSM doesn't
have at all), and costs zero network calls. Nominatim search is kept as an
optional fallback for names you want placed but that OCR couldn't locate
directly on this particular image.

Usage policy notes (read before deploying at scale)
------------------------------------------------------
* Overpass public instance (overpass-api.de): fair-use only, no guaranteed
  rate limit but heavy concurrent load gets throttled/blocked. Fine for
  prototyping and low-volume use; for a national rollout with many
  enumerators submitting maps in parallel, either queue/rate-limit your own
  requests, use a different public mirror (e.g. overpass.kumi.systems) as
  fallback, or self-host Overpass against an India OSM extract.
* Nominatim public instance: hard cap of 1 request/second, requires a
  descriptive User-Agent (enforced below) — do not remove the sleep().
  Same scaling advice applies: self-host for volume.
"""

from __future__ import annotations

import time
import requests

from hlb_extractor import (
    GeoTransform, read_geo_metadata, extract_map_raster,
    extract_hlb_boundary,
)
import numpy as np
import cv2
import pytesseract
from PIL import Image

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim requires a real identifying User-Agent per their usage policy —
# replace with your actual app name / contact before deploying.
USER_AGENT = "NakshaBot/0.1 (contact: youremail@example.com)"


# ---------------------------------------------------------------------------
# Road / water / named-node geometry from Overpass, clipped to the polygon
# ---------------------------------------------------------------------------

def _ring_to_overpass_poly(lonlat_ring: list) -> str:
    """Overpass's `poly:` filter wants space-separated 'lat lon lat lon ...'."""
    return " ".join(f"{lat} {lon}" for lon, lat in lonlat_ring)


def fetch_osm_features(lonlat_ring: list, timeout: int = 60) -> list[dict]:
    """
    Queries Overpass for roads, waterways/water bodies, and named nodes
    clipped to the given polygon ring (list of [lon, lat] pairs, matching
    the GeoJSON coordinate order used elsewhere in this pipeline).

    Note on multipolygon water bodies: large lakes/reservoirs mapped as OSM
    relations can have multiple outer/inner rings. This function takes only
    the first geometry block per element for simplicity — adequate for
    small streams/ponds typical inside one HLB, but a large lake spanning
    a relation with several outer rings will only show partially. Flag for
    a follow-up if your enumerators cover such areas.
    """
    poly = _ring_to_overpass_poly(lonlat_ring)
    query = f"""
    [out:json][timeout:{timeout}];
    (
      way["highway"](poly:"{poly}");
      way["waterway"](poly:"{poly}");
      way["natural"="water"](poly:"{poly}");
      way["natural"="coastline"](poly:"{poly}");
      way["landuse"="reservoir"](poly:"{poly}");
      relation["natural"="water"](poly:"{poly}");
      node["name"](poly:"{poly}");
    );
    out geom;
    """
    resp = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": USER_AGENT},
        timeout=timeout + 15,
    )
    resp.raise_for_status()
    return resp.json().get("elements", [])


def osm_elements_to_features(elements: list[dict]) -> list[dict]:
    """Converts raw Overpass elements (with `out geom;` inline geometry) into GeoJSON Features."""
    features = []
    for el in elements:
        tags = el.get("tags", {})

        if el["type"] == "node":
            if "name" not in tags:
                continue
            features.append({
                "type": "Feature",
                "properties": {"name": tags["name"], "source": "osm", **tags},
                "geometry": {"type": "Point", "coordinates": [el["lon"], el["lat"]]},
            })
            continue

        geom = el.get("geometry")
        if not geom:
            continue
        coords = [[pt["lon"], pt["lat"]] for pt in geom]
        is_closed = len(coords) > 2 and coords[0] == coords[-1]

        if "highway" in tags or "waterway" in tags:
            # Roads and rivers/streams are linear features regardless of closure.
            geometry = {"type": "LineString", "coordinates": coords}
            kind = "waterway" if "waterway" in tags else "road"
        elif tags.get("natural") in ("water", "coastline") or tags.get("landuse") == "reservoir":
            if is_closed:
                geometry = {"type": "Polygon", "coordinates": [coords]}
            else:
                # Coastlines in particular are often open ways at this scale.
                geometry = {"type": "LineString", "coordinates": coords}
            kind = "water_body"
        else:
            geometry = {"type": "Polygon", "coordinates": [coords]} if is_closed else {"type": "LineString", "coordinates": coords}
            kind = "other"

        features.append({
            "type": "Feature",
            "properties": {"kind": kind, "source": "osm", **tags},
            "geometry": geometry,
        })
    return features


# ---------------------------------------------------------------------------
# General OCR pass for landmark/place labels (broader than the HLB-number
# seed search in hlb_extractor.py), placed via the direct pixel->geo transform
# ---------------------------------------------------------------------------

def ocr_all_labels(map_img: np.ndarray, brightness_thresh: int = 210) -> list[dict]:
    """
    Returns [{"text": ..., "col": ..., "row": ...}] for bold white text
    labels found anywhere on the map (landmark names, road names) — not
    just the numeric HLB codes locate_label() in hlb_extractor.py looks for.

    Approach: merge nearby glyphs into whole-word/line blobs, then crop each
    blob individually (with padding), upscale 4x, and OCR that crop alone —
    this measurably outperforms running OCR on the whole map mask at once,
    which I tested and got almost entirely garbage back.

    HONEST QUALITY CAVEAT, tested against the sample map: HLB numbers
    (large bold digits, e.g. "0542") come through cleanly. Landmark/place
    names in the smaller font consistently come through PARTIALLY garbled
    at the character level (e.g. "Faaz mahal" -> "Saas cpahal", "Sadiq
    house" -> "Sadie nous?") due to small font size + busy satellite
    background + nearby icon glyphs. Generic Tesseract is genuinely not
    strong enough here to trust unreviewed.

    If landmark-name accuracy matters for your use case, this is actually
    the one place in this whole pipeline where handing the image to a
    vision-capable LLM (Claude, GPT-4V, etc.) instead of classical OCR
    would likely help — vision-LLMs tend to be considerably more robust
    at reading small/cluttered scene text than Tesseract. It's the wrong
    tool for tracing pixel-precise boundary geometry, but plausibly the
    right tool for "what does this label say." Consider it a targeted
    fallback for labels below a confidence threshold, not a wholesale
    replacement of the CV pipeline.

    Given that caveat, also consider leaning on fetch_osm_features()'s
    node["name"] results as your primary source of named places (many
    real-world POIs are already tagged in OSM) and treating this function's
    output as a supplementary, best-effort layer for names OSM is missing —
    rather than the primary source of truth.
    """
    bright = np.all(map_img > brightness_thresh, axis=2).astype(np.uint8) * 255
    # Merge nearby glyphs into whole-word/line blobs before cropping.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (18, 5))
    merged = cv2.dilate(bright, kernel, iterations=1)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)

    results = []
    h_img, w_img = map_img.shape[:2]
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        if w < 25 or h < 8 or w > 400 or h > 60:
            continue  # too small to be text, or too big (likely a merged line/road)
        pad = 6
        x0, y0 = max(0, x - pad), max(0, y - pad)
        x1, y1 = min(w_img, x + w + pad), min(h_img, y + h + pad)
        crop = map_img[y0:y1, x0:x1]

        crop_big = cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
        gray = cv2.cvtColor(crop_big, cv2.COLOR_RGB2GRAY)
        _, bw = cv2.threshold(gray, 190, 255, cv2.THRESH_BINARY)

        text = pytesseract.image_to_string(bw, config="--psm 7").strip()
        if len(text) >= 3:
            results.append({"text": text, "col": int(x + w / 2), "row": int(y + h / 2)})
    return results


def geocode_labels_fallback(labels: list[str], bbox: tuple, delay: float = 1.1) -> list[dict]:
    """
    OPTIONAL fallback: network-geocodes a list of place names via Nominatim,
    bounded to `bbox` = (min_lon, min_lat, max_lon, max_lat). Only use this
    for names you want placed but that ocr_all_labels() couldn't locate
    directly on the image — for anything OCR already found, the direct
    pixel transform (see build_enriched_map) is more accurate and free.

    Respects Nominatim's 1 req/sec policy via `delay`. Do not lower it.
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    features = []
    for label in labels:
        params = {
            "q": label, "format": "json", "limit": 1, "bounded": 1,
            "viewbox": f"{min_lon},{max_lat},{max_lon},{min_lat}",
        }
        resp = requests.get(NOMINATIM_URL, params=params, headers={"User-Agent": USER_AGENT}, timeout=10)
        time.sleep(delay)
        if resp.status_code != 200:
            continue
        hits = resp.json()
        if not hits:
            continue
        hit = hits[0]
        features.append({
            "type": "Feature",
            "properties": {"name": label, "source": "nominatim_geocode"},
            "geometry": {"type": "Point", "coordinates": [float(hit["lon"]), float(hit["lat"])]},
        })
    return features


# ---------------------------------------------------------------------------
# End-to-end: boundary + roads + water + named places
# ---------------------------------------------------------------------------

def build_enriched_map(pdf_path: str, hlb_number: str) -> dict:
    """
    Runs the full extraction + enrichment pipeline and returns a single
    GeoJSON FeatureCollection: the HLB boundary polygon, plus roads, water
    bodies, and named places clipped to it.
    """
    boundary_feature = extract_hlb_boundary(pdf_path, hlb_number)
    ring = boundary_feature["geometry"]["coordinates"][0]

    osm_elements = fetch_osm_features(ring)
    features = [boundary_feature] + osm_elements_to_features(osm_elements)

    # Place OCR-found landmark labels using the exact same transform used
    # for the boundary itself — no network round-trip needed for these.
    geo_meta = read_geo_metadata(pdf_path)
    map_img = extract_map_raster(pdf_path, geo_meta)
    h, w = map_img.shape[:2]
    transform = GeoTransform(
        crop_w=w, crop_h=h,
        lat_at_y0=geo_meta["lat_at_y0"], lat_at_y1=geo_meta["lat_at_y1"],
        lon_at_x0=geo_meta["lon_at_x0"], lon_at_x1=geo_meta["lon_at_x1"],
    )
    for label in ocr_all_labels(map_img):
        lon, lat = transform.to_lonlat(label["col"], label["row"])
        features.append({
            "type": "Feature",
            "properties": {"name": label["text"], "source": "ocr_label_direct"},
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        })

    return {"type": "FeatureCollection", "features": features}


if __name__ == "__main__":
    import argparse, json

    parser = argparse.ArgumentParser(description="Build an OSM-enriched GeoJSON map for one HLB.")
    parser.add_argument("pdf_path")
    parser.add_argument("--hlb", required=True)
    parser.add_argument("--out", default="enriched_map.geojson")
    args = parser.parse_args()

    fc = build_enriched_map(args.pdf_path, args.hlb)
    with open(args.out, "w") as f:
        json.dump(fc, f, indent=2)
    print(f"Wrote {len(fc['features'])} features -> {args.out}")
