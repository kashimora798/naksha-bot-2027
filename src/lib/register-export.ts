// Official HLO register export — all 34 columns, from a live survey session.
// PDF (A3 landscape, jspdf-autotable) for the formal printed register, and a true
// .xlsx (SheetJS) with a data sheet + a codes legend for digital submission.
// Both are driven by HLO_SCHEDULE so they always match the data-entry form.
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { SurveySession, SurveySymbol } from './idb';
import { isBuildingSymbol } from '../types';
import { HLO_SCHEDULE, headerLabel } from './hlo-schedule';

// One register row per census house, in numbering order. line_no is positional.
export function buildRegisterRows(symbols: SurveySymbol[]): Record<string, any>[] {
  return symbols
    .filter(s => isBuildingSymbol(s.symbol_type as any))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9))
    .map((s, i) => {
      const rec: Record<string, any> = { ...s, line_no: i + 1 };
      if (rec.building_no == null) rec.building_no = s.number ?? '';
      return rec;
    });
}

const rawCell = (key: string, rec: Record<string, any>, i: number) =>
  key === 'line_no' ? String(i + 1) : (rec[key] ?? '') === '' ? '' : String(rec[key]);

// ── PDF (A3 landscape) ──────────────────────────────────────────────────────
export function buildRegisterPdf(session: SurveySession, symbols: SurveySymbol[]): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
  doc.text(`CENSUS 2027 — HLO REGISTER · HLB ${session.hlb_number || '—'}`, 14, 12);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
  doc.text(`${session.location_name || ''}   |   ${new Date(session.created_at).toLocaleDateString('en-IN')}`, 14, 18);

  const rows = buildRegisterRows(symbols);
  autoTable(doc, {
    startY: 22,
    head: [HLO_SCHEDULE.map(headerLabel)],
    body: rows.map((r, i) => HLO_SCHEDULE.map(f => rawCell(f.key, r, i))),
    theme: 'grid',
    styles: { fontSize: 4.5, cellPadding: 0.4, overflow: 'linebreak', valign: 'middle' },
    headStyles: { fontSize: 4.2, fillColor: [40, 40, 40], textColor: 255, halign: 'center' },
    // line_no narrow; the rest share the remaining width.
    columnStyles: { 0: { cellWidth: 8 } },
    margin: { left: 6, right: 6 },
  });

  // Codes legend (new page) so the numeric register is decodable.
  doc.addPage('a3', 'landscape');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
  doc.text('CODE LEGEND', 14, 12);
  const legend: string[][] = [];
  for (const f of HLO_SCHEDULE) for (const op of (f.options || [])) legend.push([String(f.col), f.en, String(op.code), op.en]);
  autoTable(doc, {
    startY: 16,
    head: [['Col', 'Field', 'Code', 'Meaning']],
    body: legend,
    theme: 'striped',
    styles: { fontSize: 6, cellPadding: 0.6 },
    headStyles: { fillColor: [40, 40, 40], textColor: 255 },
    columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 48 }, 2: { cellWidth: 14 } },
    margin: { left: 6, right: 6 },
  });
  return doc;
}

// ── XLSX (data sheet + codes legend) ────────────────────────────────────────
export function buildRegisterWorkbook(session: SurveySession, symbols: SurveySymbol[]): XLSX.WorkBook {
  const rows = buildRegisterRows(symbols);
  const header = HLO_SCHEDULE.map(f => `${f.en} (${f.col})`);
  const data = rows.map((r, i) => HLO_SCHEDULE.map(f => rawCell(f.key, r, i)));
  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);

  const legend: (string | number)[][] = [['Col', 'Field', 'Code', 'Meaning']];
  for (const f of HLO_SCHEDULE) for (const op of (f.options || [])) legend.push([f.col, f.en, op.code, op.en]);
  const wsLegend = XLSX.utils.aoa_to_sheet(legend);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Register');
  XLSX.utils.book_append_sheet(wb, wsLegend, 'Codes');
  return wb;
}

// ── Browser download wrappers ───────────────────────────────────────────────
export function downloadRegisterPdf(session: SurveySession, symbols: SurveySymbol[]) {
  buildRegisterPdf(session, symbols).save(`HLO_Register_HLB_${session.hlb_number || '0000'}.pdf`);
}
export function downloadRegisterXlsx(session: SurveySession, symbols: SurveySymbol[]) {
  XLSX.writeFile(buildRegisterWorkbook(session, symbols), `HLO_Register_HLB_${session.hlb_number || '0000'}.xlsx`);
}
