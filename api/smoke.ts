// Phase 0 smoke test — Vercel Node serverless function.
// Visit /api/_smoke on a preview deploy. Proves the LINUX @napi-rs/canvas binary
// loads on Vercel, fonts render (Hindi must; emoji ideally), and a PDF streams back.
// Throwaway — delete after P0 passes. Does NOT touch auth/payment/db.
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
import { join } from 'node:path';

let fontsReady = false;
function ensureFonts() {
  if (fontsReady) return;
  const dir = join(process.cwd(), 'public', 'fonts');
  // Latin under "sans-serif" (the family the real renderer hard-codes) + Devanagari
  // + monochrome emoji for automatic glyph fallback. On Linux there are no system
  // fonts, so these are the only candidates.
  GlobalFonts.registerFromPath(join(dir, 'NotoSans-Regular.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSans-Bold.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSansDevanagari-Regular.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoSansDevanagari-Bold.ttf'), 'sans-serif');
  GlobalFonts.registerFromPath(join(dir, 'NotoEmoji-Regular.ttf'), 'sans-serif');
  fontsReady = true;
}

export default function handler(_req: any, res: any) {
  try {
    const t0 = Date.now();
    ensureFonts();

    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 800, 400);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeRect(60, 120, 120, 120);
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText('123', 120, 180);
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('नक्शा बॉट', 480, 90);
    ctx.font = '48px sans-serif';
    ctx.fillText('🌾 खेत  💧 तालाब  🌳 बाग', 460, 200);
    ctx.font = '28px sans-serif';
    ctx.fillText('CENSUS 2027 — LAYOUT MAP', 460, 300);

    const jpeg = canvas.toDataURL('image/jpeg', 0.9);
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    doc.addImage(jpeg, 'JPEG', 0, 0, 297, 148.5);
    const pdf = Buffer.from(doc.output('arraybuffer'));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="smoke.pdf"');
    res.setHeader('X-Render-Ms', String(Date.now() - t0));
    res.status(200).send(pdf);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.stack || err) });
  }
}
