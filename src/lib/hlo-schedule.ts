// Official Census 2027 Houselisting & Housing (HLO) schedule — the single source
// of truth for BOTH the data-entry form and the register export.
//
// Source: HLO_SE_Questions_Hindi_English.md (cols 1–34).
//
// NOTE on storage keys: per project decision we do NOT renumber the existing
// stored fields (which used a different, non-official numbering). Instead each
// official column maps to a storage `key` chosen by SEMANTICS — reusing an
// existing PlacedSymbol field where one already captures that meaning (even if its
// name has a misleading number), and a new key where the column was never captured.
// Form reads/writes record[key]; the register reads the same key. One source, no drift.

export type HloInputType = 'auto' | 'text' | 'number' | 'code';

export interface HloOption { code: number | string; en: string; hi: string }

export interface HloField {
  col: number;            // official column number (1–34)
  key: string;            // storage key on the symbol record
  en: string;             // short English label
  hi: string;             // short Hindi label
  type: HloInputType;
  options?: HloOption[];  // for type 'code'
  group?: string;         // section heading
  /** Shown in the form only when this returns true (skip logic). */
  visibleWhen?: (r: Record<string, any>) => boolean;
}

const o = (arr: [number | string, string, string][]): HloOption[] =>
  arr.map(([code, en, hi]) => ({ code, en, hi }));

// ── Skip-logic helpers (official rules) ─────────────────────────────────────
// Col 7 (use) is stored in the existing `col_4_use_type` field.
export const useCode = (r: Record<string, any>): number | undefined => r.col_4_use_type;
export const isResidential = (r: Record<string, any>) => useCode(r) === 1 || useCode(r) === 2;
// Institutional household → household number 999 (cols 12,13 and 14–34 skipped).
export const isInstitutional = (r: Record<string, any>) => Number(r.household_no) === 999;
export const isNormalHousehold = (r: Record<string, any>) => isResidential(r) && !isInstitutional(r);
// Col 20 access ∈ {1,2} unlocks col 21 (latrine type). Stored in col_20_latrine.
export const hasOwnLatrine = (r: Record<string, any>) => r.col_20_latrine === 1 || r.col_20_latrine === 2;

export const HLO_SCHEDULE: HloField[] = [
  { col: 1, key: 'line_no', en: 'Line number', hi: 'लाइन संख्या', type: 'auto', group: 'Identification' },
  { col: 2, key: 'building_no', en: 'Building number', hi: 'भवन संख्या', type: 'text' },
  { col: 3, key: 'census_house_no', en: 'Census house number', hi: 'जनगणना मकान संख्या', type: 'text' },

  { col: 4, key: 'm_floor', en: 'Floor material', hi: 'फर्श सामग्री', type: 'code', group: 'Structure (4–6)', options: o([
    [1, 'Mud', 'मिट्टी'], [2, 'Wood/bamboo', 'लकड़ी/बांस'], [3, 'Burnt brick', 'पक्की ईंट'], [4, 'Stone', 'पत्थर'],
    [5, 'Cement', 'सीमेंट'], [6, 'Mosaic/tiles', 'मोजैक/टाइल'], [7, 'Any other', 'अन्य'] ]) },
  { col: 5, key: 'col_6_wall_material', en: 'Wall material', hi: 'दीवार सामग्री', type: 'code', options: o([
    [1, 'Grass/thatch', 'घांस/फूस'], [2, 'Plastic', 'प्लास्टिक'], [3, 'Mud/unburnt brick', 'मिट्टी/कच्ची ईंट'], [4, 'Wood', 'लकड़ी'],
    [5, 'Stone (no mortar)', 'पत्थर बिना गारा'], [6, 'Stone (mortar)', 'पत्थर गारा सहित'], [7, 'GI/metal/asbestos', 'जी.आई./धातु'],
    [8, 'Burnt brick', 'पक्की ईंट'], [9, 'Concrete', 'कंक्रीट'], [0, 'Any other', 'अन्य'] ]) },
  { col: 6, key: 'col_7_roof_material', en: 'Roof material', hi: 'छत सामग्री', type: 'code', options: o([
    [1, 'Grass/thatch/mud', 'घांस/मिट्टी'], [2, 'Plastic', 'प्लास्टिक'], [3, 'Handmade tiles', 'हस्त टाइल'], [4, 'Machine tiles', 'मशीन टाइल'],
    [5, 'Burnt brick', 'पक्की ईंट'], [6, 'Stone', 'पत्थर'], [7, 'Slate', 'स्लेट'], [8, 'GI/metal/asbestos', 'जी.आई./धातु'],
    [9, 'Concrete', 'कंक्रीट'], [0, 'Any other', 'अन्य'] ]) },

  { col: 7, key: 'col_4_use_type', en: 'Use of census house', hi: 'मकान का उपयोग', type: 'code', group: 'Use', options: o([
    [1, 'Residence', 'आवास'], [2, 'Residence-cum-other', 'आवास-सह-अन्य'], [3, 'Shop/office', 'दुकान/कार्यालय'], [4, 'School/college', 'स्कूल/कॉलेज'],
    [5, 'Hotel/lodge', 'होटल/लॉज'], [6, 'Hospital', 'अस्पताल'], [7, 'Factory/workshop', 'फैक्टरी'], [8, 'Place of worship', 'पूजा स्थल'],
    [9, 'Other non-residential', 'अन्य गैर-आवासीय'], [0, 'Vacant', 'खाली'] ]) },
  { col: 8, key: 'col_8_condition', en: 'Condition', hi: 'मकान की स्थिति', type: 'code', visibleWhen: isResidential, options: o([
    [1, 'Good', 'अच्छा'], [2, 'Livable', 'रहने योग्य'], [3, 'Dilapidated', 'जीर्ण-शीर्ण'] ]) },

  { col: 9, key: 'household_no', en: 'Household number', hi: 'परिवार क्रमांक', type: 'number', group: 'Household (9–13)', visibleWhen: isResidential },
  { col: 10, key: 'col_9_family_count', en: 'Persons in household', hi: 'व्यक्तियों की संख्या', type: 'number', visibleWhen: isResidential },
  { col: 11, key: 'col_10_head_name', en: 'Head of household', hi: 'मुखिया का नाम', type: 'text', visibleWhen: isResidential },
  { col: 12, key: 'm_sex', en: 'Sex of head', hi: 'मुखिया का लिंग', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Male', 'पुरुष'], [2, 'Female', 'स्त्री'], [3, 'Transgender', 'ट्रांसजेंडर'] ]) },
  { col: 13, key: 'm_caste', en: 'SC/ST/Other', hi: 'अ.जा./अ.ज.जा./अन्य', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'SC', 'अ.जा.'], [2, 'ST', 'अ.ज.जा.'], [3, 'Other', 'अन्य'] ]) },

  { col: 14, key: 'col_12_ownership', en: 'Ownership', hi: 'स्वामित्व', type: 'code', group: 'Normal household (14–34)', visibleWhen: isNormalHousehold, options: o([
    [1, 'Owned', 'अपना'], [2, 'Rented, owns elsewhere', 'किराया, अन्यत्र अपना'], [3, "Rented, owns none", 'किराया, अपना नहीं'], [4, 'Any other', 'अन्य'] ]) },
  { col: 15, key: 'col_11_total_rooms', en: 'Dwelling rooms', hi: 'कमरों की संख्या', type: 'number', visibleWhen: isNormalHousehold },
  { col: 16, key: 'm_couples', en: 'Married couples', hi: 'विवाहित दंपत्ति', type: 'number', visibleWhen: isNormalHousehold },

  { col: 17, key: 'col_18_water_source', en: 'Drinking water source', hi: 'पेयजल स्रोत', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Tap (treated)', 'नल (उपचारित)'], [2, 'Tap (untreated)', 'नल (अनुपचारित)'], [3, 'Well', 'कुआं'], [4, 'Hand pump', 'हैण्डपंप'],
    [5, 'Tubewell/borehole', 'ट्यूबवेल'], [6, 'Spring', 'झरना'], [7, 'River/canal', 'नदी/नहर'], [8, 'Tank/pond/lake', 'तालाब/झील'],
    [9, 'Packaged/bottled', 'बोतल'], [0, 'Other', 'अन्य'] ]) },
  { col: 18, key: 'col_18a_water_location', en: 'Water availability', hi: 'पेयजल उपलब्धता', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Within premises', 'परिसर के अंदर'], [2, 'Near premises', 'परिसर के निकट'], [3, 'Away', 'दूर'] ]) },
  { col: 19, key: 'm_lighting', en: 'Lighting source', hi: 'प्रकाश स्रोत', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Electricity', 'बिजली'], [2, 'Kerosene', 'मिट्टी का तेल'], [3, 'Solar', 'सौर'], [4, 'Other oil', 'अन्य तेल'], [5, 'Any other', 'अन्य'], [6, 'No lighting', 'प्रकाश रहित'] ]) },
  { col: 20, key: 'col_20_latrine', en: 'Latrine access', hi: 'शौचालय सुलभता', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Exclusive', 'केवल परिवार'], [2, 'Shared', 'साझा'], [3, 'Public', 'सार्वजनिक'], [4, 'Open (none)', 'खुले में'] ]) },
  { col: 21, key: 'col_21_latrine_type', en: 'Latrine type', hi: 'शौचालय का प्रकार', type: 'code', visibleWhen: (r) => isNormalHousehold(r) && hasOwnLatrine(r), options: o([
    [1, 'Type 1', 'प्रकार 1'], [2, 'Type 2', 'प्रकार 2'], [3, 'Type 3', 'प्रकार 3'], [4, 'Type 4', 'प्रकार 4'], [5, 'Type 5', 'प्रकार 5'],
    [6, 'Type 6', 'प्रकार 6'], [7, 'Type 7', 'प्रकार 7'], [8, 'Type 8', 'प्रकार 8'], [9, 'Type 9', 'प्रकार 9'] ]) },
  { col: 22, key: 'm_wastewater', en: 'Waste water outlet', hi: 'गंदे पानी की निकासी', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Closed drainage', 'ढकी नाली'], [2, 'Open drainage', 'खुली नाली'], [3, 'No drainage', 'कोई नाली नहीं'] ]) },
  { col: 23, key: 'col_22_bathroom', en: 'Bathing facility', hi: 'स्नान सुविधा', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Bathroom', 'स्नानगृह'], [2, 'Enclosure (no roof)', 'बिना छत अहाता'], [3, 'No', 'नहीं'] ]) },
  { col: 24, key: 'col_24_kitchen', en: 'Kitchen + LPG/PNG', hi: 'रसोई व एलपीजी/पीएनजी', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Code 1', 'कोड 1'], [2, 'Code 2', 'कोड 2'], [3, 'Code 3', 'कोड 3'], [4, 'Code 4', 'कोड 4'], [5, 'Code 5', 'कोड 5'], [6, 'Code 6', 'कोड 6'], [7, 'Code 7', 'कोड 7'] ]) },
  { col: 25, key: 'col_25_cooking_fuel', en: 'Cooking fuel', hi: 'खाना पकाने का ईंधन', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Firewood', 'जलाऊ लकड़ी'], [2, 'Crop residue', 'फसल अवशेष'], [3, 'Cowdung', 'उपला'], [4, 'Coal', 'कोयला'], [5, 'Kerosene', 'मिट्टी का तेल'],
    [6, 'LPG/PNG', 'एलपीजी/पीएनजी'], [7, 'Electricity', 'बिजली'], [8, 'Bio-gas', 'गोबर गैस'], [9, 'Solar', 'सौर'], [0, 'Any other', 'अन्य'] ]) },

  { col: 26, key: 'm_radio', en: 'Radio/Transistor', hi: 'रेडियो', type: 'code', group: 'Assets (26–32)', visibleWhen: isNormalHousehold, options: o([
    [1, 'Traditional', 'परंपरागत'], [2, 'On mobile', 'मोबाइल पर'], [3, 'Other device', 'अन्य'], [4, 'No', 'नहीं'] ]) },
  { col: 27, key: 'm_tv', en: 'Television', hi: 'टेलीविजन', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'DD free dish', 'डीडी मुफ्त डिश'], [2, 'Other DTH', 'अन्य डीटीएच'], [3, 'Cable', 'केबल'], [4, 'Any other', 'अन्य'], [5, 'No', 'नहीं'] ]) },
  { col: 28, key: 'm_internet', en: 'Internet access', hi: 'इंटरनेट', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Laptop/computer', 'लैपटॉप'], [2, 'Mobile', 'मोबाइल'], [3, 'Other device', 'अन्य'], [4, 'No', 'नहीं'] ]) },
  { col: 29, key: 'm_laptop', en: 'Laptop/Computer', hi: 'लैपटॉप/कंप्यूटर', type: 'code', visibleWhen: isNormalHousehold, options: o([ [1, 'Yes', 'हां'], [2, 'No', 'नहीं'] ]) },
  { col: 30, key: 'm_phone', en: 'Phone/Mobile', hi: 'टेलीफोन/मोबाइल', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Landline only', 'केवल लैंडलाइन'], [2, 'Smartphone only', 'केवल स्मार्टफोन'], [3, 'Basic mobile', 'बुनियादी मोबाइल'], [4, 'Both', 'दोनों'], [5, 'No', 'नहीं'] ]) },
  { col: 31, key: 'm_vehicle2w', en: 'Cycle/Scooter', hi: 'साइकिल/स्कूटर', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Bicycle', 'साइकिल'], [2, 'Scooter/Motorcycle', 'स्कूटर/मोटरसाइकिल'], [3, 'Both', 'दोनों'], [4, 'None', 'नहीं'] ]) },
  { col: 32, key: 'm_car', en: 'Car/Jeep/Van', hi: 'कार/जीप/वैन', type: 'code', visibleWhen: isNormalHousehold, options: o([ [1, 'Yes', 'हां'], [2, 'No', 'नहीं'] ]) },

  { col: 33, key: 'm_cereal', en: 'Main cereal', hi: 'मुख्य अनाज', type: 'code', visibleWhen: isNormalHousehold, options: o([
    [1, 'Rice', 'चावल'], [2, 'Wheat', 'गेहूं'], [3, 'Jowar', 'ज्वार'], [4, 'Bajra', 'बाजरा'], [5, 'Maize', 'मक्का'], [6, 'Any other', 'अन्य'] ]) },
  { col: 34, key: 'col_34_mobile_number', en: 'Mobile number', hi: 'मोबाइल नंबर', type: 'text', visibleWhen: isResidential },
];

// Short header used in the (very wide) register: "Floor\n(4)".
export const headerLabel = (f: HloField) => `${f.en}\n(${f.col})`;

// Resolve a stored value to a human cell: "code – label" for code fields, else raw.
export function cellValue(f: HloField, r: Record<string, any>): string {
  const v = r[f.key];
  if (v === undefined || v === null || v === '') return '';
  if (f.type === 'code' && f.options) {
    const opt = f.options.find(op => op.code === v);
    return opt ? `${v} ${opt.en}` : String(v);
  }
  return String(v);
}
