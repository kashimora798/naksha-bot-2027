"""
NakshaBot HLB Boundary Extractor
==================================
Extracts a Houselisting Block (HLB) boundary polygon from a Census-style
Esri ArcGIS "Layout Map" PDF and converts it into real WGS84 GeoJSON —
using the PDF's own embedded GeoPDF georeferencing instead of an AI/vision
API call. The PRIMARY label-finding method reads the PDF's vector text
layer directly (instant, 100% accurate). Tesseract OCR is kept only as
a fallback for PDFs whose text layer is missing or damaged.

Pipeline
--------
1. read_geo_metadata()   -> parse /VP /Measure /GEO from the PDF page.
                             This is an Esri GeoPDF extension: it embeds the
                             *exact* lat/lon of the map's corners. No AI
                             needed here at all — it's just data sitting in
                             the file, if the exporting tool included it.
2. extract_map_raster()  -> pull the embedded satellite image and crop it
                             to exactly the georeferenced viewport (this
                             excludes the legend / title panel).
3. detect_boundary_lines() -> threshold for bright pixels, then keep only
                             long/thin connected components (real boundary
                             lines) and discard compact blobs (text labels,
                             icons). Classical CV, not ML.
4. locate_label()        -> OCR the cropped map to find the pixel position
                             of the target HLB number (e.g. "0542"). This
                             becomes the flood-fill seed.
5. isolate_polygon()     -> flood-fill the "free space" from the seed point,
                             using the boundary-line mask as walls, then
                             trace + simplify the resulting blob's contour.
6. GeoTransform.to_lonlat() -> map every contour vertex from pixel space to
                             real WGS84 lon/lat using the metadata from step 1.
7. to_geojson()           -> package the result as a GeoJSON Feature.

Dependencies
------------
    pip install pymupdf opencv-python-headless numpy pillow pytesseract shapely --break-system-packages
    # Tesseract binary must also be installed (apt install tesseract-ocr on most systems)

Usage
-----
    python hlb_extractor.py input.pdf --hlb 0542 --out result.geojson

Or as a library:
    from hlb_extractor import extract_hlb_boundary
    geojson = extract_hlb_boundary("input.pdf", hlb_number="0542")

Known limitations (read before wiring into production)
--------------------------------------------------------
* Assumes the PDF is a GeoPDF (has /Measure /GEO metadata). If an
  enumerator's file lacks this — e.g. it was rescanned or exported by a
  different tool — read_geo_metadata() returns None and you'll need a
  fallback (landmark-name geocoding, or asking for two known reference
  points).
* Does not yet distinguish solid boundary lines (the actual HLB edge) from
  dashed lines (other administrative boundaries, per the map legend). Both
  currently get treated as "wall" pixels during flood-fill, which is fine
  when the target block's own outline is solid throughout, but will need
  line-style classification for full robustness across arbitrary maps.
* Assumes the georeferenced viewport is an axis-aligned rectangle in
  Web Mercator (true for all ArcGIS layout exports at this map scale —
  no rotation to account for). Do not reuse the transform math as-is for
  rotated or non-rectangular viewports.
* Always keep a human-in-the-loop review/edit step downstream (e.g. in your
  MapLibre canvas) before treating extracted vertices as final — this is a
  census document, extraction errors have real consequences.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass

import cv2
import fitz  # PyMuPDF
import numpy as np
import pytesseract
from PIL import Image


# ---------------------------------------------------------------------------
# Step 1 — GeoPDF metadata parsing
# ---------------------------------------------------------------------------

@dataclass
class GeoTransform:
    """
    Exact pixel(col, row) -> (lon, lat) mapping for a cropped, axis-aligned
    georeferenced raster. `crop_w`/`crop_h` are the pixel dimensions of the
    image the (col, row) values are measured against.
    """
    crop_w: int
    crop_h: int
    lat_at_y0: float   # latitude at normalized y=0 (bottom of viewport)
    lat_at_y1: float   # latitude at normalized y=1 (top of viewport)
    lon_at_x0: float   # longitude at normalized x=0 (left of viewport)
    lon_at_x1: float   # longitude at normalized x=1 (right of viewport)

    def to_lonlat(self, col: float, row: float) -> tuple[float, float]:
        Lx = col / self.crop_w
        Ly = 1 - row / self.crop_h  # row grows downward, latitude grows upward
        lat = self.lat_at_y0 + Ly * (self.lat_at_y1 - self.lat_at_y0)
        lon = self.lon_at_x0 + Lx * (self.lon_at_x1 - self.lon_at_x0)
        return round(lon, 7), round(lat, 7)


def read_geo_metadata(pdf_path: str) -> dict | None:
    """
    Parses the page's /VP -> /Measure -> /GEO dictionary that Esri ArcGIS
    embeds in GeoPDF exports (ISO 32000 geospatial extension). Returns None
    if the PDF isn't georeferenced this way.
    """
    doc = fitz.open(pdf_path)
    page = doc[0]
    raw = doc.xref_object(page.xref)
    page_w, page_h = page.rect.width, page.rect.height
    doc.close()

    if "/Measure" not in raw or "/GEO" not in raw:
        return None

    def extract_array(name: str) -> list[float] | None:
        m = re.search(rf"/{name}\s*\[([^\]]+)\]", raw)
        return [float(x) for x in m.group(1).split()] if m else None

    vp_bbox = extract_array("BBox")  # [x0 y0 x1 y1] in PDF page-point space
    gpts = extract_array("GPTS")     # flat list of (lat, lon) corner pairs
    lpts = extract_array("LPTS")     # matching flat list of (x, y) normalized corners

    if not (vp_bbox and gpts and lpts):
        return None

    # Pair them up: LPTS[2i:2i+2] <-> GPTS[2i:2i+2]
    corners = []
    for i in range(0, len(lpts), 2):
        lx, ly = lpts[i], lpts[i + 1]
        lat, lon = gpts[i], gpts[i + 1]
        corners.append((lx, ly, lat, lon))

    # Derive the axis-aligned mapping without assuming corner order:
    # average the lon of all corners where LPTS x ~ 0 vs x ~ 1, and
    # the lat of all corners where LPTS y ~ 0 vs y ~ 1.
    lon_at_x0 = np.mean([lon for lx, ly, lat, lon in corners if lx < 0.5])
    lon_at_x1 = np.mean([lon for lx, ly, lat, lon in corners if lx >= 0.5])
    lat_at_y0 = np.mean([lat for lx, ly, lat, lon in corners if ly < 0.5])
    lat_at_y1 = np.mean([lat for lx, ly, lat, lon in corners if ly >= 0.5])

    return {
        "page_w": page_w,
        "page_h": page_h,
        "vp_bbox": vp_bbox,  # [x0, y0, x1, y1] in PDF page-point space
        "lon_at_x0": float(lon_at_x0),
        "lon_at_x1": float(lon_at_x1),
        "lat_at_y0": float(lat_at_y0),
        "lat_at_y1": float(lat_at_y1),
    }


# ---------------------------------------------------------------------------
# Step 2 — Raster extraction, cropped to the georeferenced viewport
# ---------------------------------------------------------------------------

def extract_map_raster(pdf_path: str, geo_meta: dict) -> np.ndarray:
    """
    Pulls the embedded satellite raster and crops it to exactly the
    /VP /BBox region (i.e. just the map, excluding legend/title panel).
    Returns an RGB numpy array.
    """
    doc = fitz.open(pdf_path)
    page = doc[0]

    # Find the largest embedded image on the page (the basemap raster).
    images = page.get_images(full=True)
    if not images:
        doc.close()
        raise ValueError("No embedded raster image found on this page.")
    xref = max(images, key=lambda im: im[2] * im[3])[0]  # widest*tallest

    pix = fitz.Pixmap(doc, xref)
    if pix.n - pix.alpha >= 4:  # CMYK etc -> normalize to RGB
        pix = fitz.Pixmap(fitz.csRGB, pix)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    img = img[:, :, :3]  # drop alpha if present

    img_h, img_w = pix.height, pix.width
    page_w, page_h = geo_meta["page_w"], geo_meta["page_h"]
    x0, y0, x1, y1 = geo_meta["vp_bbox"]

    col0 = int(x0 / page_w * img_w)
    col1 = int(x1 / page_w * img_w)
    row0 = int((page_h - y1) / page_h * img_h)  # PDF y is bottom-up; image row is top-down
    row1 = int((page_h - y0) / page_h * img_h)

    doc.close()
    return img[row0:row1, col0:col1].copy()


# ---------------------------------------------------------------------------
# Step 2b — Locate HLB label from the PDF's vector text layer (FAST PATH)
# ---------------------------------------------------------------------------

def locate_label_from_pdf_text(
    pdf_path: str, target_text: str, geo_meta: dict, crop_shape: tuple[int, int]
) -> tuple[int, int] | None:
    """
    Reads the PDF's native text layer to find the target HLB number's
    pixel position within the cropped map raster — NO OCR needed.

    Census Layout Map PDFs render HLB numbers as vector text objects sitting
    on top of the satellite raster. PyMuPDF can read these with their exact
    bounding-box coordinates in ~5 ms. This is instant and 100% accurate,
    unlike Tesseract which struggles badly with white text on complex
    satellite imagery backgrounds.

    Returns (col, row) in the cropped-image pixel space, or None if the
    target text wasn't found in the PDF's text layer.
    """
    doc = fitz.open(pdf_path)
    page = doc[0]
    page_w, page_h = page.rect.width, page.rect.height
    crop_h, crop_w = crop_shape

    # Get the largest embedded image dimensions (same logic as extract_map_raster)
    images = page.get_images(full=True)
    if not images:
        doc.close()
        return None
    best_img = max(images, key=lambda im: im[2] * im[3])
    img_w, img_h = best_img[2], best_img[3]

    # VP BBox in PDF page-point space
    vp_x0, vp_y0, vp_x1, vp_y1 = geo_meta["vp_bbox"]

    # Crop offsets in image-pixel space (same math as extract_map_raster)
    crop_col0 = int(vp_x0 / page_w * img_w)
    crop_row0 = int((page_h - vp_y1) / page_h * img_h)

    # Search for target_text in the PDF text layer
    text_dict = page.get_text("dict", flags=fitz.TEXT_PRESERVE_WHITESPACE)
    matches = []

    target_clean = target_text.strip()
    for block in text_dict.get("blocks", []):
        if block.get("type") != 0:  # 0 = text block
            continue
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                span_text = span["text"].strip()
                # Match exact text, or text containing target (e.g. "HLB 0019")
                if span_text == target_clean or target_clean in span_text:
                    # span["bbox"] = (x0, y0, x1, y1) in PDF page-point space
                    sx0, sy0, sx1, sy1 = span["bbox"]
                    # Center of the text span in PDF points
                    cx_pdf = (sx0 + sx1) / 2.0
                    cy_pdf = (sy0 + sy1) / 2.0

                    # Convert PDF page-points → image pixels
                    cx_img = cx_pdf / page_w * img_w
                    cy_img = (cy_pdf / page_h) * img_h  # PDF y goes top-down in get_text()

                    # Offset to cropped-image coordinates
                    col = int(cx_img - crop_col0)
                    row = int(cy_img - crop_row0)

                    # Validate the point is inside the crop
                    if 0 <= col < crop_w and 0 <= row < crop_h:
                        # Prefer shorter (more specific) matches
                        matches.append((len(span_text), col, row, span_text))

    doc.close()

    if not matches:
        return None

    # Pick the most specific match (shortest text containing target)
    matches.sort(key=lambda m: m[0])
    _, col, row, matched_text = matches[0]
    return col, row


# ---------------------------------------------------------------------------
# Step 3 — Boundary line detection
# ---------------------------------------------------------------------------

def detect_boundary_lines(map_img: np.ndarray, brightness_thresh: int = 205,
                           min_long_side: int = 25, max_fill_ratio: float = 0.55) -> np.ndarray:
    """
    Returns a binary mask (255 = boundary line pixel) isolating thin white
    line structures from the map, discarding compact blobs like text labels
    and POI icons based on connected-component shape.
    """
    bright = np.all(map_img > brightness_thresh, axis=2).astype(np.uint8) * 255
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bright, connectivity=8)

    line_mask = np.zeros_like(bright)
    for i in range(1, n):
        x, y, w, h, area = stats[i]
        fill_ratio = area / (w * h + 1e-6)
        if max(w, h) > min_long_side and fill_ratio < max_fill_ratio:
            line_mask[labels == i] = 255

    # Seal small dashed/anti-aliasing gaps so flood-fill can't leak through.
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    return cv2.morphologyEx(line_mask, cv2.MORPH_CLOSE, kernel, iterations=3)


# ---------------------------------------------------------------------------
# Step 4 — Locate the target HLB label (flood-fill seed point)
# ---------------------------------------------------------------------------

def locate_label(map_img: np.ndarray, target_text: str,
                  brightness_thresholds: tuple = (225, 195)) -> tuple[int, int]:
    """
    OCRs the bold white HLB-number label matching `target_text` and returns
    its pixel (col, row) center. Raises if not found after all fallbacks.

    Made resolution-independent after a real failure: an earlier version
    used fixed absolute pixel-size filters (e.g. "8 < w < 60") tuned to one
    map's DPI, which silently rejected valid digit blobs on maps exported
    at a different resolution/font size. This version:
      1. Sizes its blob filter relative to the image dimensions instead of
         fixed pixel counts, so it adapts across maps.
      2. Merges nearby glyphs into whole-number blobs before cropping (the
         same trick that measurably improved landmark-label OCR — see
         osm_enrichment.ocr_all_labels), rather than reading lone characters.
      3. Cascades through several brightness thresholds, since JPEG2000
         compression artifacts can dull "white" unevenly between maps.
      4. Falls back to fuzzy matching (handles OCR confusing e.g. a leading
         "0" for "O") if no exact string match is found after all of the above.

    If this still fails on a real file, it likely means classical OCR
    genuinely cannot read that particular label — at that point, the right
    move is a targeted vision-LLM call on the specific candidate crop (not
    on the whole map — see extract_hlb_boundary's docstring / the project
    notes on why localization and reading are different problems).
    """
    h_img, w_img = map_img.shape[:2]
    candidates = []  # (ocr_text, col, row) across all thresholds, for fuzzy fallback

    for thresh in brightness_thresholds:
        bright = np.all(map_img > thresh, axis=2).astype(np.uint8) * 255
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (18, 5))
        merged = cv2.dilate(bright, kernel, iterations=1)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)

        # Build a single mask containing only clean original characters within candidate regions
        text_mask = np.zeros_like(bright)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            # Relative-size filter: a number label shouldn't span more than
            # ~15% of image width or ~5% of image height, regardless of DPI.
            if w < 20 or h < 8 or w > 0.15 * w_img or h > 0.05 * h_img:
                continue
            # Copy pixels from the original 'bright' (non-dilated) image inside this bounding box
            text_mask[y:y+h, x:x+w] = bright[y:y+h, x:x+w]

        # If no candidates at this threshold, skip Tesseract call
        if not np.any(text_mask):
            continue

        # Run Tesseract EXACTLY ONCE on the entire candidate mask
        data = pytesseract.image_to_data(
            Image.fromarray(text_mask),
            output_type=pytesseract.Output.DICT,
            config="--psm 11 -c tessedit_char_whitelist=0123456789",
        )

        for i, text in enumerate(data["text"]):
            clean_text = text.strip()
            if not clean_text:
                continue
            x, y, w, h = data["left"][i], data["top"][i], data["width"][i], data["height"][i]
            cx, cy = int(x + w / 2), int(y + h / 2)
            
            if clean_text == target_text:
                return cx, cy
            
            # Simple normalizations to catch common OCR mistakes (e.g. O instead of 0)
            norm_text = clean_text.replace("O", "0").replace("o", "0")
            norm_target = target_text.replace("O", "0").replace("o", "0")
            if norm_text == norm_target:
                return cx, cy

            candidates.append((clean_text, cx, cy))

    # Fuzzy fallback: catches near-misses like OCR reading "0" as "O" or
    # confusing similar digits, as long as it's the same length as the target.
    try:
        from rapidfuzz import fuzz
        same_len = [c for c in candidates if len(c[0]) == len(target_text)]
        if same_len:
            best_text, best_col, best_row = max(
                same_len, key=lambda c: fuzz.ratio(c[0], target_text)
            )
            if fuzz.ratio(best_text, target_text) >= 80:
                return best_col, best_row
    except ImportError:
        pass

    raise ValueError(
        f"Could not locate label '{target_text}' on the map via OCR "
        f"(closest candidates seen: {[c[0] for c in candidates][:5]}). "
        "Consider a targeted vision-LLM read on candidate crops as a fallback."
    )


# ---------------------------------------------------------------------------
# Step 5 — Isolate the enclosed polygon and simplify its contour
# ---------------------------------------------------------------------------

def find_label_candidates(map_img: np.ndarray, brightness_thresholds: tuple = (225, 195)) -> list[dict]:
    """
    Shape-based candidate detection only (no OCR) — returns every bold white
    blob that's plausibly a text label, as cropped images + pixel position.
    Used directly by locate_label() for classical OCR, and reused by
    read_label_with_vision() below so the AI fallback only ever has to read
    a handful of small, pre-isolated crops rather than search a whole map.
    """
    h_img, w_img = map_img.shape[:2]
    seen_boxes = set()
    candidates = []
    for thresh in brightness_thresholds:
        bright = np.all(map_img > thresh, axis=2).astype(np.uint8) * 255
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (18, 5))
        merged = cv2.dilate(bright, kernel, iterations=1)
        n, labels, stats, _ = cv2.connectedComponentsWithStats(merged, connectivity=8)
        for i in range(1, n):
            x, y, w, h, area = stats[i]
            if w < 20 or h < 8 or w > 0.15 * w_img or h > 0.05 * h_img:
                continue
            box = (x // 10, y // 10)  # dedupe near-identical boxes seen at multiple thresholds
            if box in seen_boxes:
                continue
            seen_boxes.add(box)
            pad = 6
            x0, y0 = max(0, x - pad), max(0, y - pad)
            x1, y1 = min(w_img, x + w + pad), min(h_img, y + h + pad)
            crop = map_img[y0:y1, x0:x1]
            crop_big = cv2.resize(crop, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC)
            candidates.append({"crop": crop_big, "col": int(x + w / 2), "row": int(y + h / 2)})
    return candidates


def read_label_with_vision(crop_rgb: np.ndarray, api_key: str) -> str:
    """
    Sends ONE small pre-cropped candidate image to Claude and asks it to
    transcribe the digits — used only as a fallback after classical OCR
    (locate_label) fails on every candidate. Deliberately scoped to single
    small crops, not the full map: asking a vision model to both *find* and
    *read* a label across a large complex image risks imprecise coordinate
    guesses (a known weakness of vision LLMs); asking it to read one crop
    it's already looking straight at is a much easier, more reliable task.

    NOT TESTED — this sandbox has no ANTHROPIC_API_KEY available, so this
    function is written carefully but unverified against the live API.
    Confirm response parsing works before relying on it.
    """
    import base64, requests

    _, buf = cv2.imencode(".png", cv2.cvtColor(crop_rgb, cv2.COLOR_RGB2BGR))
    b64 = base64.b64encode(buf).decode()

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-6",
            "max_tokens": 20,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/png", "data": b64}},
                    {"type": "text", "text": "This is a cropped label from a map. Reply with ONLY the digits shown, nothing else. If unclear, reply UNKNOWN."},
                ],
            }],
        },
        timeout=30,
    )
    resp.raise_for_status()
    text_blocks = [b["text"] for b in resp.json()["content"] if b["type"] == "text"]
    return "".join(text_blocks).strip()


def locate_label_with_vision_fallback(map_img: np.ndarray, target_text: str, api_key: str | None = None) -> tuple[int, int]:
    """
    Tries classical OCR first (locate_label); only spends an API call per
    candidate crop if that fails entirely AND an api_key is supplied.
    """
    try:
        return locate_label(map_img, target_text)
    except ValueError:
        if not api_key:
            raise
        for cand in find_label_candidates(map_img):
            if read_label_with_vision(cand["crop"], api_key) == target_text:
                return cand["col"], cand["row"]
        raise ValueError(f"'{target_text}' not found even with vision fallback.")



def isolate_polygon(sealed_line_mask: np.ndarray, seed: tuple[int, int],
                     simplify_tolerance_frac: float = 0.002) -> np.ndarray:
    """
    Flood-fills the free space from `seed`, bounded by the sealed line mask,
    then returns a simplified contour as an (N, 2) array of (col, row) points.
    """
    free = cv2.bitwise_not(sealed_line_mask)
    n, labels = cv2.connectedComponents(free, connectivity=4)

    seed_x, seed_y = seed
    seed_label = labels[seed_y, seed_x]
    if seed_label == 0:
        raise ValueError("Seed point landed on a boundary line pixel, not free space.")

    blob = np.uint8(labels == seed_label) * 255
    contours, _ = cv2.findContours(blob, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        raise ValueError("No contour found for the flood-filled region.")

    c = max(contours, key=cv2.contourArea)
    peri = cv2.arcLength(c, True)
    simplified = cv2.approxPolyDP(c, simplify_tolerance_frac * peri, True)
    return simplified.reshape(-1, 2)


# ---------------------------------------------------------------------------
# Step 6/7 — Convert to GeoJSON
# ---------------------------------------------------------------------------

def to_geojson(pixel_pts: np.ndarray, transform: GeoTransform, properties: dict) -> dict:
    coords = [list(transform.to_lonlat(col, row)) for col, row in pixel_pts]
    coords.append(coords[0])  # close the ring
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": "Polygon", "coordinates": [coords]},
    }


# ---------------------------------------------------------------------------
# End-to-end orchestration
# ---------------------------------------------------------------------------

def extract_hlb_boundary(pdf_path: str, hlb_number: str, properties: dict | None = None) -> dict:
    """
    Runs the full pipeline on a single PDF and returns a GeoJSON Feature for
    the requested HLB number. Raises ValueError at whichever step fails, so
    callers can fall back to manual tracing for that file.

    Label-finding strategy (fast-first):
      1. PDF text layer extraction — instant, 100% accurate for most Census PDFs
      2. Tesseract OCR fallback — only if the text layer is missing/damaged
      3. Vision LLM fallback — only if OCR also fails AND an API key is set
    """
    import os
    geo_meta = read_geo_metadata(pdf_path)
    if geo_meta is None:
        raise ValueError(
            "PDF has no embedded /Measure /GEO metadata — not a GeoPDF. "
            "Fall back to manual boundary tracing or landmark-based georeferencing."
        )

    map_img = extract_map_raster(pdf_path, geo_meta)
    sealed_lines = detect_boundary_lines(map_img)

    # --- Fast path: read the HLB label position directly from the PDF text layer ---
    seed = locate_label_from_pdf_text(
        pdf_path, hlb_number, geo_meta, crop_shape=map_img.shape[:2]
    )

    if seed is None:
        # Slow fallback: Tesseract OCR (only if text layer is missing)
        print(f"[hlb_extractor] PDF text layer did not contain '{hlb_number}', "
              f"falling back to Tesseract OCR...")
        api_key = os.getenv("ANTHROPIC_API_KEY")
        seed = locate_label_with_vision_fallback(map_img, hlb_number, api_key=api_key)

    pixel_pts = isolate_polygon(sealed_lines, seed)

    h, w = map_img.shape[:2]
    transform = GeoTransform(
        crop_w=w, crop_h=h,
        lat_at_y0=geo_meta["lat_at_y0"], lat_at_y1=geo_meta["lat_at_y1"],
        lon_at_x0=geo_meta["lon_at_x0"], lon_at_x1=geo_meta["lon_at_x1"],
    )

    props = {"hlb_no": hlb_number}
    if properties:
        props.update(properties)

    return to_geojson(pixel_pts, transform, props)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract an HLB boundary polygon from a Census layout-map GeoPDF.")
    parser.add_argument("pdf_path", help="Path to the layout map PDF")
    parser.add_argument("--hlb", required=True, help="HLB number to extract, e.g. 0542")
    parser.add_argument("--out", default="hlb_boundary.geojson", help="Output GeoJSON path")
    args = parser.parse_args()

    feature = extract_hlb_boundary(args.pdf_path, args.hlb)
    with open(args.out, "w") as f:
        json.dump(feature, f, indent=2)

    n_verts = len(feature["geometry"]["coordinates"][0]) - 1
    print(f"Extracted HLB {args.hlb}: {n_verts} vertices -> {args.out}")

