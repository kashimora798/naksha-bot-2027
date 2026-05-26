import type { SymbolType } from '../types';

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
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" stroke="${color}" stroke-width="1.8" fill="none"/>${drawNum(13)}</svg>`;
    case 'kutcha_house':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="8" stroke="${color}" stroke-width="1.8" fill="none"/><polyline points="3,11 12,3 21,11" stroke="${color}" stroke-width="1.8" fill="none"/>${drawNum(15)}</svg>`;
    case 'apartment':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="4" y="2" width="16" height="20" stroke="${color}" stroke-width="1.8" fill="none"/><line x1="4" y1="9" x2="20" y2="9" stroke="${color}" stroke-width="1"/><line x1="4" y1="16" x2="20" y2="16" stroke="${color}" stroke-width="1"/><line x1="12" y1="2" x2="12" y2="22" stroke="${color}" stroke-width="1"/>${drawNum(12)}</svg>`;
    case 'farmland':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="2" y="4" width="20" height="16" stroke="${color}" stroke-width="1.8" fill="none"/><line x1="2" y1="9" x2="22" y2="9" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/><line x1="2" y1="14" x2="22" y2="14" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/><line x1="2" y1="19" x2="22" y2="19" stroke="${color}" stroke-width="1" stroke-dasharray="3,2"/></svg>`;
    case 'non_residential':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><rect x="3" y="7" width="18" height="12" stroke="${color}" stroke-width="1.8" fill="none"/><line x1="3" y1="11" x2="21" y2="11" stroke="${color}" stroke-width="1"/><line x1="3" y1="15" x2="21" y2="15" stroke="${color}" stroke-width="1"/>${drawNum(13)}</svg>`;
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
    case 'pond':
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="14" rx="10" ry="7" stroke="${color}" stroke-width="1.8" fill="none"/></svg>`;
    default:
      return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="6" stroke="${color}" stroke-width="1.8"/></svg>`;
  }
}

export function drawSymbolOnCanvas(
  ctx: CanvasRenderingContext2D, type: SymbolType, x: number, y: number, size: number,
  num?: number | null, unitCount: number = 1
) {
  ctx.strokeStyle = '#000000'; ctx.lineWidth = 1.5; ctx.fillStyle = '#000000';
  const w = size, h = size * 0.7;

  // Render number inside house
  const drawNum = (nx: number, ny: number) => {
    if (num !== null && num !== undefined) {
      const lbl = unitCount > 1 ? `${num}-${num + unitCount - 1}` : String(num);
      ctx.fillStyle = '#000000';
      ctx.font = `bold ${Math.max(6, size * 0.4)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(lbl, nx, ny);
      ctx.fillStyle = '#000000'; // restore
    }
  };

  switch (type) {
    case 'pucca_house':
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      drawNum(x, y);
      break;
    case 'kutcha_house':
      ctx.strokeRect(x - w / 2, y - h / 6, w, h * 0.7);
      ctx.beginPath(); ctx.moveTo(x - w / 2, y - h / 6); ctx.lineTo(x, y - h / 2); ctx.lineTo(x + w / 2, y - h / 6); ctx.stroke();
      drawNum(x, y + h * 0.18);
      break;
    case 'apartment': {
      const ah = size * 1.1, aw = size * 0.8;
      ctx.strokeRect(x - aw / 2, y - ah / 2, aw, ah);
      // Floor lines
      const floors = 3;
      for (let i = 1; i < floors; i++) {
        const fy = y - ah / 2 + (ah * i) / floors;
        ctx.beginPath(); ctx.moveTo(x - aw / 2, fy); ctx.lineTo(x + aw / 2, fy); ctx.stroke();
      }
      // Vertical divider
      ctx.beginPath(); ctx.moveTo(x, y - ah / 2); ctx.lineTo(x, y + ah / 2); ctx.stroke();
      drawNum(x, y);
      break;
    }
    case 'farmland': {
      const fw = size * 1.2, fh = size * 0.9;
      ctx.strokeRect(x - fw / 2, y - fh / 2, fw, fh);
      // Crop row lines
      ctx.setLineDash([3, 2]);
      for (let i = 1; i <= 3; i++) {
        const ly = y - fh / 2 + (fh * i) / 4;
        ctx.beginPath(); ctx.moveTo(x - fw / 2 + 1, ly); ctx.lineTo(x + fw / 2 - 1, ly); ctx.stroke();
      }
      ctx.setLineDash([]);
      break;
    }
    case 'non_residential':
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      for (let i = 1; i <= 3; i++) {
        const ly = y - h / 2 + (h * i) / 4;
        ctx.beginPath(); ctx.moveTo(x - w / 2, ly); ctx.lineTo(x + w / 2, ly); ctx.stroke();
      }
      drawNum(x, y);
      break;
    case 'mosque':
      ctx.strokeRect(x - w / 2.5, y, w / 1.25, h * 0.6);
      ctx.beginPath(); ctx.arc(x, y, w / 3, Math.PI, 0); ctx.stroke();
      break;
    case 'temple':
      ctx.strokeRect(x - w / 2.5, y, w / 1.25, h * 0.6);
      ctx.beginPath(); ctx.moveTo(x - w / 2.5, y); ctx.lineTo(x, y - h * 0.5); ctx.lineTo(x + w / 2.5, y); ctx.stroke();
      break;
    case 'church':
      ctx.strokeRect(x - w / 2.5, y - h * 0.1, w / 1.25, h * 0.7);
      ctx.beginPath(); ctx.moveTo(x - w / 2.5, y - h * 0.1); ctx.lineTo(x, y - h * 0.6); ctx.lineTo(x + w / 2.5, y - h * 0.1); ctx.stroke();
      break;
    case 'school':
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.font = `bold ${size * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('S', x, y);
      break;
    case 'hospital':
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.font = `bold ${size * 0.45}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('H', x, y);
      break;
    case 'well':
      ctx.beginPath(); ctx.arc(x, y, w / 3, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'post_office':
      ctx.strokeRect(x - w / 2, y - h / 2, w, h);
      ctx.font = `bold ${size * 0.35}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('PO', x, y);
      break;
    case 'pond':
      ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 3, 0, 0, Math.PI * 2); ctx.stroke();
      break;
  }
  ctx.setLineDash([]); ctx.textAlign = 'left';
}
