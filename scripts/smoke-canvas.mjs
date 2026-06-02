// Phase 0 smoke test — run locally:  node scripts/smoke-canvas.mjs
// Proves: @napi-rs/canvas binary loads, Devanagari + emoji render via registered
// fonts, and jsPDF can embed the canvas. Writes scripts/smoke-out.pdf + .png.
// NOTE: this validates the CODE + FONTS on THIS OS. The Vercel deploy (api/_smoke.ts)
// is what proves the LINUX binary loads — napi ships a different binary per platform.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { jsPDF } from 'jspdf';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const F = (f) => join(root, 'public', 'fonts', f);

// Register Latin under "sans-serif" (the family the real renderer hard-codes),
// then Devanagari + emoji so napi's automatic glyph fallback covers Hindi/🌾.
GlobalFonts.registerFromPath(F('NotoSans-Regular.ttf'), 'sans-serif');
GlobalFonts.registerFromPath(F('NotoSans-Bold.ttf'), 'sans-serif');
GlobalFonts.registerFromPath(F('NotoSansDevanagari-Regular.ttf'), 'sans-serif');
GlobalFonts.registerFromPath(F('NotoSansDevanagari-Bold.ttf'), 'sans-serif');
GlobalFonts.registerFromPath(F('NotoEmoji-Regular.ttf'), 'sans-serif');
console.log('Registered families:', GlobalFonts.families.map((x) => x.family).join(', '));

const canvas = createCanvas(800, 400);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#FFFFFF';
ctx.fillRect(0, 0, 800, 400);

// A square like a pucca-house symbol + Hindi + emoji + a number.
ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
ctx.strokeRect(60, 120, 120, 120);
ctx.fillStyle = '#000';
ctx.font = 'bold 48px sans-serif';
ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
ctx.fillText('123', 120, 180);

ctx.font = 'bold 56px sans-serif';
ctx.fillText('नक्शा बॉट', 480, 90);          // Devanagari (Hindi)
ctx.font = '48px sans-serif';
ctx.fillText('🌾 खेत  💧 तालाब  🌳 बाग', 460, 200); // emoji + Hindi labels
ctx.font = '28px sans-serif';
ctx.fillText('CENSUS 2027 — LAYOUT MAP', 460, 300); // Latin

// PNG for eyeball check
writeFileSync(join(root, 'scripts', 'smoke-out.png'), canvas.toBuffer('image/png'));

// Embed in a 1-page PDF, exactly like the real exporter does.
const jpeg = canvas.toDataURL('image/jpeg', 0.9);
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
doc.addImage(jpeg, 'JPEG', 0, 0, 297, 148.5);
const pdfBuf = Buffer.from(doc.output('arraybuffer'));
writeFileSync(join(root, 'scripts', 'smoke-out.pdf'), pdfBuf);

console.log('OK — wrote scripts/smoke-out.png and scripts/smoke-out.pdf (' + pdfBuf.length + ' bytes)');
