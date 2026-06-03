import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { PlacedSymbol } from '../types';
import { HLO_SCHEDULE, migrateLegacySymbolData, getFieldByCol } from './hlo-schedule';

/**
 * Formats a value for display in the table/sheet.
 * Census registers typically display numeric codes to fit within columns.
 */
function getDisplayVal(key: string, val: any): string {
  if (val === undefined || val === null || val === '') return '';
  return String(val);
}

/**
 * Builds the data rows for export.
 * Groups symbols and maps them sequentially.
 */
function buildRegisterRows(symbols: PlacedSymbol[]): any[][] {
  const buildingSymbols = symbols.filter(s =>
    ['pucca_house', 'kutcha_house', 'apartment', 'non_residential'].includes(s.symbol_type)
  );

  // Sort by building number (or chronologically if not numbered)
  buildingSymbols.sort((a, b) => (a.number || 0) - (b.number || 0));

  const rows: any[][] = [];
  let lineNo = 1;

  buildingSymbols.forEach(sym => {
    const data = migrateLegacySymbolData(sym);
    
    // Auto-fill building no. and house no. if not set
    const bldNo = data.col_2_building_no || sym.number || '';
    const houseNo = data.col_3_house_no || (sym.number ? String(sym.number) : '');
    
    const row = [
      lineNo++,                                      // Col 1: Line number
      bldNo,                                         // Col 2: Building number
      houseNo,                                       // Col 3: Census house number
      getDisplayVal('col_4_floor', data.col_4_floor), // Col 4: Floor material
      getDisplayVal('col_5_wall', data.col_5_wall),   // Col 5: Wall material
      getDisplayVal('col_6_roof', data.col_6_roof),   // Col 6: Roof material
      getDisplayVal('col_7_use', data.col_7_use),     // Col 7: Use of house
      getDisplayVal('col_8_condition', data.col_8_condition), // Col 8: Condition
      getDisplayVal('col_9_household_no', data.col_9_household_no), // Col 9: Household number
      getDisplayVal('col_10_persons', data.col_10_persons),   // Col 10: Total persons
      getDisplayVal('col_11_head_name', data.col_11_head_name), // Col 11: Head name
      getDisplayVal('col_12_sex', data.col_12_sex),           // Col 12: Sex
      getDisplayVal('col_13_caste', data.col_13_caste),       // Col 13: Caste SC/ST
      getDisplayVal('col_14_ownership', data.col_14_ownership), // Col 14: Ownership
      getDisplayVal('col_15_rooms', data.col_15_rooms),       // Col 15: Dwelling rooms
      getDisplayVal('col_16_couples', data.col_16_couples),   // Col 16: Married couples
      getDisplayVal('col_17_water_source', data.col_17_water_source), // Col 17: Drinking water source
      getDisplayVal('col_18_water_location', data.col_18_water_location), // Col 18: Water location
      getDisplayVal('col_19_lighting', data.col_19_lighting), // Col 19: Lighting source
      getDisplayVal('col_20_latrine', data.col_20_latrine),   // Col 20: Latrine access
      getDisplayVal('col_21_latrine_type', data.col_21_latrine_type), // Col 21: Latrine type
      getDisplayVal('col_22_drainage', data.col_22_drainage), // Col 22: Drainage connection
      getDisplayVal('col_23_bathing', data.col_23_bathing),   // Col 23: Bathing facility
      getDisplayVal('col_24_kitchen', data.col_24_kitchen),   // Col 24: Kitchen availability
      getDisplayVal('col_25_fuel', data.col_25_fuel),         // Col 25: Cooking fuel
      getDisplayVal('col_26_radio', data.col_26_radio),       // Col 26: Radio/transistor
      getDisplayVal('col_27_tv', data.col_27_tv),             // Col 27: Television
      getDisplayVal('col_28_internet', data.col_28_internet), // Col 28: Internet access
      getDisplayVal('col_29_computer', data.col_29_computer), // Col 29: Laptop/computer
      getDisplayVal('col_30_phone', data.col_30_phone),       // Col 30: Phone availability
      getDisplayVal('col_31_vehicle_2w', data.col_31_vehicle_2w), // Col 31: 2-wheeler
      getDisplayVal('col_32_car', data.col_32_car),           // Col 32: Car/jeep/van
      getDisplayVal('col_33_cereal', data.col_33_cereal),     // Col 33: Cereal consumed
      getDisplayVal('col_34_mobile', data.col_34_mobile),     // Col 34: Mobile number
    ];

    rows.push(row);
  });

  return rows;
}

/**
 * Exports the HLO Register as an A3 Landscape PDF.
 */
export function exportRegisterPDF(sessionName: string, hlbNumber: string, symbols: PlacedSymbol[]): void {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a3', // A3 gives enough width for 34 columns
  });

  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  // Draw border
  doc.setDrawColor(26, 18, 8); // Dark brown borders
  doc.setLineWidth(1);
  doc.rect(5, 5, width - 10, height - 10);
  doc.rect(5.8, 5.8, width - 11.6, height - 11.6);

  // Title Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(26, 18, 8);
  doc.text('मकानसूचीकरण एवं मकान गणना अनुसूची — CENSUS OF INDIA 2027', width / 2, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`HLB Code: ${hlbNumber}  |  Area Name: ${sessionName}  |  Export Date: ${new Date().toLocaleDateString()}`, width / 2, 20, { align: 'center' });

  // Columns definition (abbreviated headers for fitting A3 width)
  const headers = [
    ['Ln\n(1)', 'Bld\n(2)', 'Hse\n(3)', 'Flr\n(4)', 'Wal\n(5)', 'Ruf\n(6)', 'Use\n(7)', 'Cnd\n(8)', 'HH\n(9)', 'Per\n(10)', 'Head of Household Name\n(11)', 'Sex\n(12)', 'Cat\n(13)', 'Own\n(14)', 'Rom\n(15)', 'Cpl\n(16)', 'Wtr\n(17)', 'Loc\n(18)', 'Lig\n(19)', 'Lat\n(20)', 'Lty\n(21)', 'Drn\n(22)', 'Bth\n(23)', 'Ktc\n(24)', 'Fue\n(25)', 'Rad\n(26)', 'TV\n(27)', 'Net\n(28)', 'PC\n(29)', 'Phn\n(30)', 'Veh\n(31)', 'Car\n(32)', 'Crl\n(33)', 'Mobile Number\n(34)']
  ];

  const data = buildRegisterRows(symbols);

  (doc as any).autoTable({
    startY: 25,
    head: headers,
    body: data,
    margin: { left: 8, right: 8, bottom: 25 },
    theme: 'grid',
    headStyles: {
      fillColor: [26, 82, 40], // Dark Green matching Indian flag green
      textColor: [255, 255, 255],
      fontSize: 6.5,
      halign: 'center',
      valign: 'middle',
      fontStyle: 'bold',
      lineWidth: 0.2,
      lineColor: [200, 200, 200],
    },
    bodyStyles: {
      fontSize: 6,
      textColor: [30, 30, 30],
      halign: 'center',
      valign: 'middle',
      fontStyle: 'bold',
      lineWidth: 0.2,
      lineColor: [220, 220, 220],
    },
    columnStyles: {
      10: { halign: 'left', fontStyle: 'bold', fontSize: 6.5 }, // Head name left-aligned
      33: { halign: 'left', fontStyle: 'normal' } // Mobile number left-aligned
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    styles: {
      overflow: 'ellipsize',
      cellPadding: 1,
    }
  });

  // Footer Particulars / Signature Block
  const finalY = (doc as any).lastAutoTable.finalY || 200;
  const footerY = Math.max(finalY + 10, height - 22);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 18, 8);
  doc.text('प्रगणक के हस्ताक्षर (Signature of Enumerator)', 25, footerY);
  doc.text('पर्यवेक्षक के हस्ताक्षर (Signature of Supervisor)', width - 110, footerY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text('* Codes Glossary: See XLSX Legend sheet for full lookup mapping of columns 4-33.', 25, footerY + 5);
  doc.text('Census of India 2027 — Census Map Maker & HLO Register. All Rights Reserved.', width / 2, height - 8, { align: 'center' });

  // Save the PDF
  doc.save(`HLO_Register_${hlbNumber}_2027.pdf`);
}

/**
 * Exports the HLO Register as a SheetJS XLSX file.
 * Includes Sheet 1 (Register data) and Sheet 2 (Codes glossary).
 */
export function exportRegisterXLSX(sessionName: string, hlbNumber: string, symbols: PlacedSymbol[]): void {
  // --- SHEET 1: HLO REGISTER DATA ---
  const headers = HLO_SCHEDULE.map(f => `Col ${f.col}: ${f.labelEn} (${f.labelHi})`);
  const dataRows = buildRegisterRows(symbols);
  
  // Format sheet content
  const wsData = [
    [`CENSUS OF INDIA 2027 — HOUSELISTING REGISTER (मकानसूचीकरण अनुसूची)`],
    [`HLB Code: ${hlbNumber}  |  Area Name: ${sessionName}  |  Export Date: ${new Date().toLocaleDateString()}`],
    [],
    headers,
    ...dataRows
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Styling Sheet 1
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 33 } }, // Merge title
    { s: { r: 1, c: 0 }, e: { r: 1, c: 33 } }  // Merge metadata
  ];

  // Adjust column widths
  ws['!cols'] = [
    { wch: 8 },  // Col 1: Line no.
    { wch: 10 }, // Col 2: Bld no.
    { wch: 12 }, // Col 3: Hse no.
    ...Array(5).fill({ wch: 8 }), // Floor, wall, roof, use, condition
    { wch: 8 },  // Col 9: HH No.
    { wch: 8 },  // Col 10: Persons
    { wch: 28 }, // Col 11: Head name
    ...Array(22).fill({ wch: 10 }), // 12-33
    { wch: 16 }  // Col 34: Mobile
  ];

  // --- SHEET 2: CODES GLOSSARY ---
  const glossaryRows: any[][] = [
    ['CENSUS OF INDIA 2027 — HLO CODES GLOSSARY (कोड निर्देशिका)'],
    [],
    ['Column Number', 'Column Name (English)', 'Column Name (Hindi)', 'Numeric Code', 'Description (English)', 'Description (Hindi)']
  ];

  HLO_SCHEDULE.forEach(field => {
    if (field.options && field.options.length > 0) {
      field.options.forEach((opt, idx) => {
        glossaryRows.push([
          idx === 0 ? `Col ${field.col}` : '',
          idx === 0 ? field.labelEn : '',
          idx === 0 ? field.labelHi : '',
          opt.value,
          opt.labelEn,
          opt.labelHi
        ]);
      });
      glossaryRows.push([]); // blank row separator
    }
  });

  const wsLegend = XLSX.utils.aoa_to_sheet(glossaryRows);
  
  // Style Sheet 2
  wsLegend['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }
  ];
  wsLegend['!cols'] = [
    { wch: 12 }, // Col no
    { wch: 25 }, // Col Name En
    { wch: 25 }, // Col Name Hi
    { wch: 12 }, // Numeric Code
    { wch: 30 }, // Description En
    { wch: 30 }  // Description Hi
  ];

  // Create workbook and append sheets
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'HLO Register');
  XLSX.utils.book_append_sheet(wb, wsLegend, 'Codes Legend');

  // Save the XLSX file
  XLSX.writeFile(wb, `HLO_Register_${hlbNumber}_2027.xlsx`);
}
