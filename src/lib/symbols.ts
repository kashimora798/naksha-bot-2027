import type { SymbolType, PlacedSymbol } from '../types';
import { buildingShape, isNonResidential, isBuildingSymbol, getUnitCount } from '../types';

export function getSymbolSVG(type: SymbolType): string {
  const s = 32;
  switch (type) {
    case 'pucca_house':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="9" width="24" height="16" stroke="black" stroke-width="2" fill="none"/></svg>`;
    case 'kutcha_house':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="13" width="24" height="12" stroke="black" stroke-width="2" fill="none"/><polyline points="4,13 16,4 28,13" stroke="black" stroke-width="2" fill="none"/></svg>`;
    case 'apartment':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="6" y="4" width="20" height="24" stroke="black" stroke-width="2" fill="none"/><line x1="6" y1="12" x2="26" y2="12" stroke="black" stroke-width="1"/><line x1="6" y1="20" x2="26" y2="20" stroke="black" stroke-width="1"/><line x1="16" y1="4" x2="16" y2="28" stroke="black" stroke-width="1"/></svg>`;
    case 'farmland':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="3" y="5" width="26" height="22" stroke="black" stroke-width="2" fill="none"/><line x1="3" y1="11" x2="29" y2="11" stroke="black" stroke-width="1" stroke-dasharray="3,2"/><line x1="3" y1="17" x2="29" y2="17" stroke="black" stroke-width="1" stroke-dasharray="3,2"/><line x1="3" y1="23" x2="29" y2="23" stroke="black" stroke-width="1" stroke-dasharray="3,2"/></svg>`;
    case 'non_residential':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="9" width="24" height="16" stroke="black" stroke-width="2" fill="none"/><line x1="4" y1="15" x2="28" y2="15" stroke="black" stroke-width="1"/><line x1="4" y1="20" x2="28" y2="20" stroke="black" stroke-width="1"/><line x1="12" y1="9" x2="12" y2="25" stroke="black" stroke-width="1"/><line x1="20" y1="9" x2="20" y2="25" stroke="black" stroke-width="1"/></svg>`;
    case 'mosque':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="6" y="16" width="20" height="10" stroke="black" stroke-width="2" fill="none"/><path d="M6,16 Q6,6 16,4 Q26,6 26,16" stroke="black" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="black" stroke-width="2"/><circle cx="16" cy="2" r="1.5" fill="black"/></svg>`;
    case 'temple':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="6" y="16" width="20" height="10" stroke="black" stroke-width="2" fill="none"/><polyline points="6,16 16,6 26,16" stroke="black" stroke-width="2" fill="none"/><line x1="16" y1="2" x2="16" y2="6" stroke="black" stroke-width="2"/></svg>`;
    case 'church':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="6" y="14" width="20" height="12" stroke="black" stroke-width="2" fill="none"/><polyline points="6,14 16,5 26,14" stroke="black" stroke-width="2" fill="none"/><line x1="16" y1="1" x2="16" y2="9" stroke="black" stroke-width="2"/><line x1="13" y1="4" x2="19" y2="4" stroke="black" stroke-width="2"/></svg>`;
    case 'school':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="8" width="24" height="18" stroke="black" stroke-width="2" fill="none"/><text x="16" y="22" text-anchor="middle" font-size="13" font-weight="bold" font-family="sans-serif" fill="black">S</text></svg>`;
    case 'hospital':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="8" width="24" height="18" stroke="black" stroke-width="2" fill="none"/><text x="16" y="22" text-anchor="middle" font-size="13" font-weight="bold" font-family="sans-serif" fill="black">H</text></svg>`;
    case 'well':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><circle cx="16" cy="16" r="11" stroke="black" stroke-width="2" fill="none"/><circle cx="16" cy="16" r="3" fill="black"/></svg>`;
    case 'post_office':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="9" width="24" height="16" stroke="black" stroke-width="2" fill="none"/><text x="16" y="22" text-anchor="middle" font-size="10" font-weight="bold" font-family="sans-serif" fill="black">PO</text></svg>`;
    case 'police_station':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><rect x="4" y="8" width="24" height="18" stroke="black" stroke-width="2" fill="none"/><text x="16" y="22" text-anchor="middle" font-size="10" font-weight="bold" font-family="sans-serif" fill="black">PS</text></svg>`;
    case 'pond':
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><ellipse cx="16" cy="18" rx="13" ry="9" stroke="black" stroke-width="2" fill="none"/><path d="M6,15 Q10,12 16,15 Q22,18 26,15" stroke="black" stroke-width="1.2" fill="none"/><path d="M6,19 Q10,16 16,19 Q22,22 26,19" stroke="black" stroke-width="1.2" fill="none"/></svg>`;
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" fill="none"><circle cx="16" cy="16" r="8" stroke="black" stroke-width="2"/></svg>`;
  }
}

export function getSmallSymbolSVG(type: SymbolType, highlight?: boolean, num?: string): string {
  const color = highlight ? '#0066FF' : 'black';
  const s = 16;
  
  const drawNum = (yOffset: number = 13) => {
    if (!num) return '';
    return `<text x="12" y="${yOffset}" text-anchor="middle" dominant-baseline="middle" font-size="7" font-weight="bold" fill="${color}" font-family="sans-serif">${num}</text>`;
  };

  switch (type) {
    case 'pucca_house':
      // Spec: Pucca = square
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" stroke="${color}" stroke-width="1.8" fill="none"/>${drawNum(13)}</svg>`;
    case 'kutcha_house':
      // Spec: Kutcha = triangle (closed path strokes reliably across renderers)
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><path d="M12 3 L21 20 L3 20 Z" stroke="${color}" stroke-width="1.8" fill="none" stroke-linejoin="round"/>${drawNum(16)}</svg>`;
    case 'apartment':
      // Apartment is pucca → square, with floor lines to distinguish in the palette
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" stroke="${color}" stroke-width="1.8" fill="none"/><line x1="4" y1="9" x2="20" y2="9" stroke="${color}" stroke-width="1"/><line x1="4" y1="16" x2="20" y2="16" stroke="${color}" stroke-width="1"/><line x1="12" y1="2" x2="12" y2="22" stroke="${color}" stroke-width="1"/>${drawNum(12)}</svg>`;
    case 'farmland':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" stroke="${color}" stroke-width="1.8" fill="none"/><line x1="2" y1="9" x2="22" y2="9" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/><line x1="2" y1="14" x2="22" y2="14" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/><line x1="2" y1="19" x2="22" y2="19" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/></svg>`;
    case 'non_residential':
      // Spec: wholly non-residential pucca = hatched square. Explicit diagonal lines
      // (clipped to the square) are more robust across webviews than an SVG <pattern>.
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><defs><clipPath id="cp${highlight?'b':'k'}"><rect x="4" y="4" width="16" height="16"/></clipPath></defs><g clip-path="url(#cp${highlight?'b':'k'})"><line x1="4" y1="12" x2="12" y2="4" stroke="${color}" stroke-width="0.9"/><line x1="4" y1="20" x2="20" y2="4" stroke="${color}" stroke-width="0.9"/><line x1="8" y1="20" x2="20" y2="8" stroke="${color}" stroke-width="0.9"/><line x1="16" y1="20" x2="20" y2="16" stroke="${color}" stroke-width="0.9"/></g><rect x="4" y="4" width="16" height="16" stroke="${color}" stroke-width="1.8" fill="none"/>${drawNum(13)}</svg>`;
    case 'mosque':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="5" y="14" width="14" height="7" stroke="${color}" stroke-width="1.8" fill="none"/><path d="M5,14 Q5,5 12,3 Q19,5 19,14" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    case 'temple':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="5" y="14" width="14" height="7" stroke="${color}" stroke-width="1.8" fill="none"/><polyline points="5,14 12,5 19,14" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    case 'church':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="5" y="12" width="14" height="9" stroke="${color}" stroke-width="1.8" fill="none"/><polyline points="5,12 12,4 19,12" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    case 'school':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" stroke="${color}" stroke-width="1.8" fill="none"/><text x="12" y="17" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">S</text></svg>`;
    case 'hospital':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="6" width="18" height="14" stroke="${color}" stroke-width="1.8" fill="none"/><text x="12" y="17" text-anchor="middle" font-size="10" font-weight="bold" fill="${color}">H</text></svg>`;
    case 'well':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    case 'post_office':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" stroke="${color}" stroke-width="1.8" fill="none"/><text x="12" y="17" text-anchor="middle" font-size="8" font-weight="bold" fill="${color}">PO</text></svg>`;
    case 'police_station':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" stroke="${color}" stroke-width="1.8" fill="none"/><text x="12" y="17" text-anchor="middle" font-size="8" font-weight="bold" fill="${color}">PS</text></svg>`;
    case 'pond':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="10" ry="7" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" stroke="${color}" stroke-width="1.8"/></svg>`;
  }
}

export function drawSymbolOnCanvas(
  ctx: CanvasRenderingContext2D,
  sym: Pick<PlacedSymbol, 'symbol_type'> & Partial<PlacedSymbol>,
  x: number, y: number, size: number,
  angle: number = 0,
  inkMode: 'color' | 'black' | 'blue' = 'color',
  numberingSystem?: 'serpentine' | 'census_u_loop'
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  const type = sym.symbol_type;
  const themeColor = inkMode === 'blue' ? '#002fbe' : '#000000';
  ctx.strokeStyle = themeColor; ctx.lineWidth = 1.5; ctx.fillStyle = themeColor;
  const w = size, h = size * 0.7;

  // Building number written INSIDE the box (spec). For an apartment we still show
  // the unit range; census-house sub-numbers (N(1)..N(k)) are drawn BELOW the box.
  const drawNum = (nx: number, ny: number) => {
    const num = sym.number;
    if (num === null || num === undefined) return;
    const units = getUnitCount(sym as PlacedSymbol);
    const lbl = numberingSystem === 'census_u_loop'
      ? (units > 1 ? `${num}(${units})` : String(num))
      : (units > 1 ? `${num}-${num + units - 1}` : String(num));
    ctx.font = `bold ${Math.max(11, size * 0.6)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // White halo for readability over roads
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.strokeText(lbl, nx, ny);
    ctx.fillStyle = themeColor; ctx.fillText(lbl, nx, ny);
    ctx.strokeStyle = themeColor; ctx.lineWidth = 1.5;
  };

  // Census-house sub-numbers below the box, e.g. "5(1)-5(4)" (spec Annexure-4 §xii).
  const drawCensusHouses = (cy: number) => {
    const n = sym.census_house_count ?? 0;
    const num = sym.number;
    if (n > 1 && num !== null && num !== undefined) {
      const lbl = `${num}(1)-${num}(${n})`;
      ctx.font = `${Math.max(7, size * 0.34)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = themeColor;
      ctx.fillText(lbl, 0, cy);
    }
  };

  // ─── BUILDINGS: spec-compliant square (pucca) / triangle (kutcha), hatched if non-residential ───
  if (isBuildingSymbol(type)) {
    const shape = buildingShape(sym as PlacedSymbol);
    const hatched = isNonResidential(sym as PlacedSymbol);

    // Build the path for the shape, then optionally hatch-fill it.
    const buildPath = () => {
      ctx.beginPath();
      if (shape === 'triangle') {
        // Equilateral-ish triangle centered on (0,0)
        ctx.moveTo(0, -size / 2);
        ctx.lineTo(size / 2, size / 2);
        ctx.lineTo(-size / 2, size / 2);
        ctx.closePath();
      } else {
        // True square
        ctx.rect(-size / 2, -size / 2, size, size);
      }
    };

    // Hatching: diagonal lines clipped to the shape.
    if (hatched) {
      ctx.save();
      buildPath();
      ctx.clip();
      ctx.strokeStyle = themeColor;
      ctx.lineWidth = 0.8;
      const step = Math.max(2.5, size / 5);
      for (let d = -size; d <= size; d += step) {
        ctx.beginPath();
        ctx.moveTo(-size / 2 + d, -size / 2);
        ctx.lineTo(-size / 2 + d + size, size / 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Outline
    ctx.strokeStyle = themeColor; ctx.lineWidth = 1.5;
    buildPath();
    ctx.stroke();

    // Number inside (nudge down a touch for a triangle so it sits in the body)
    drawNum(0, shape === 'triangle' ? size * 0.12 : 0);
    // Census-house sub-numbers below the box
    drawCensusHouses(size / 2 + 2);
    ctx.setLineDash([]); ctx.textAlign = 'left';
    ctx.restore();
    return;
  }

  // ─── LANDMARKS & FEATURES (unchanged icons) ───
  switch (type) {
    case 'farmland': {
      const fw = size * 1.2, fh = size * 0.9;
      ctx.strokeRect(-fw / 2, -fh / 2, fw, fh);
      ctx.setLineDash([3, 2]);
      for (let i = 1; i <= 3; i++) {
        const ly = -fh / 2 + (fh * i) / 4;
        ctx.beginPath(); ctx.moveTo(-fw / 2 + 1, ly); ctx.lineTo(fw / 2 - 1, ly); ctx.stroke();
      }
      break;
    }
    case 'mosque':
      ctx.strokeRect(-w / 2.5, 0, w / 1.25, h * 0.6);
      ctx.beginPath(); ctx.arc(0, 0, w / 3, Math.PI, 0); ctx.stroke();
      break;
    case 'temple':
      ctx.strokeRect(-w / 2.5, 0, w / 1.25, h * 0.6);
      ctx.beginPath(); ctx.moveTo(-w / 2.5, 0); ctx.lineTo(0, -h * 0.5); ctx.lineTo(w / 2.5, 0); ctx.stroke();
      break;
    case 'church':
      ctx.strokeRect(-w / 2.5, -h * 0.1, w / 1.25, h * 0.7);
      ctx.beginPath(); ctx.moveTo(-w / 2.5, -h * 0.1); ctx.lineTo(0, -h * 0.6); ctx.lineTo(w / 2.5, -h * 0.1); ctx.stroke();
      break;
    case 'school':
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.font = `bold ${size * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', 0, 0);
      break;
    case 'hospital':
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.font = `bold ${size * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', 0, 0);
      break;
    case 'well':
      ctx.beginPath(); ctx.arc(0, 0, w / 3, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'post_office':
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.font = `bold ${size * 0.35}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PO', 0, 0);
      break;
    case 'police_station':
      ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.font = `bold ${size * 0.35}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PS', 0, 0);
      break;
    case 'pond':
      ctx.beginPath(); ctx.ellipse(0, 0, w / 2, h / 3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
  }
  
  // Draw building/landmark number for non-building symbols below the icon
  if (sym.number !== null && sym.number !== undefined) {
    const lbl = String(sym.number);
    ctx.font = `bold ${Math.max(9, size * 0.5)}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.strokeText(lbl, 0, size / 2 + 1);
    ctx.fillStyle = themeColor;
    ctx.fillText(lbl, 0, size / 2 + 1);
  }
  
  ctx.setLineDash([]); ctx.textAlign = 'left';
  ctx.restore();
}
