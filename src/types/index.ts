export interface Coordinate { lat: number; lng: number; }

export type SymbolType =
  | 'pucca_house' | 'kutcha_house' | 'apartment' | 'non_residential'
  | 'mosque' | 'temple' | 'church' | 'school' | 'hospital'
  | 'well' | 'post_office' | 'police_station' | 'pond' | 'farmland';

export interface PlacedSymbol {
  id: string; symbol_type: SymbolType; lat: number; lng: number;
  number: number | null; placed_at: string; auto_detected?: boolean;
  unit_count?: number; label?: string; is_manual?: boolean;
  /** Census layout-map: false = wholly non-residential (shape is hatched). Default true. */
  is_residential?: boolean;
  /** Number of census houses within this building (for N(1)..N(k) sub-numbering). */
  census_house_count?: number;
  // ===== SCHEDULE 1 =====
  col_4_use_type?: number;
  col_5_occupation?: string;
  col_6_wall_material?: number;
  col_7_roof_material?: number;
  col_8_condition?: number;
  col_9_family_count?: number;
  col_10_head_name?: string;
  /** Alias kept in sync with col_10_head_name by the data form. */
  head_of_household?: string;
  col_11_total_rooms?: number;
  col_12_ownership?: number;

  // ===== SCHEDULE A =====
  col_18_water_source?: number;
  col_18a_water_location?: number;
  col_19_electricity?: boolean;
  col_20_latrine?: number;       // Col 20: access to latrine
  col_21_latrine_type?: number;  // Col 21: type of latrine
  col_22_bathroom?: number;
  col_24_kitchen?: number;       // Col 24: kitchen availability
  col_25_cooking_fuel?: number;  // Col 25: main cooking fuel
  
  // Assets
  asset_radio?: boolean;
  asset_tv?: boolean;
  asset_computer_internet?: boolean;
  asset_laptop?: boolean;
  asset_telephone?: boolean;
  asset_mobile?: boolean;
  asset_bicycle?: boolean;
  asset_scooter_motorcycle?: boolean;
  asset_car_jeep_van?: boolean;
  
  col_34_mobile_number?: string;
  
  // ===== OFFICIAL 34 COLUMNS (HLO 2027) =====
  col_1_line_no?: number;
  col_2_building_no?: number;
  col_3_house_no?: string;
  col_4_floor?: number;
  col_5_wall?: number;
  col_6_roof?: number;
  col_7_use?: number;
  // col_8_condition is already defined above
  col_9_household_no?: number;
  col_10_persons?: number;
  col_11_head_name?: string;
  col_12_sex?: number;
  col_13_caste?: number;
  col_14_ownership?: number;
  col_15_rooms?: number;
  col_16_couples?: number;
  col_17_water_source?: number;
  col_18_water_location?: number;
  col_19_lighting?: number;
  // col_20_latrine is already defined above
  // col_21_latrine_type is already defined above
  col_22_drainage?: number;
  col_23_bathing?: number;
  // col_24_kitchen is already defined above
  col_25_fuel?: number;
  col_26_radio?: number;
  col_27_tv?: number;
  col_28_internet?: number;
  col_29_computer?: number;
  col_30_phone?: number;
  col_31_vehicle_2w?: number;
  col_32_car?: number;
  col_33_cereal?: number;
  col_34_mobile?: string;

  schedule1_complete?: boolean;
  schedule_a_complete?: boolean;
  form_fill_percentage?: number;
  /** Bata sub-number: "1" renders as 4/1, "A" renders as 4A. Assigned manually after initial numbering. */
  subNumber?: string | null;
}

export interface RoadFeature {
  id: string; coords: Coordinate[]; highway: string; name?: string;
  confirmed: boolean; source: 'osm' | 'user'; osm_id?: number;
}

export interface Block {
  id: string; label: string;
  south: number; north: number; west: number; east: number;
  points?: Coordinate[];
  // ─── Canvas Block Mapping mode (optional, backward-compatible) ───
  /** Layout used when auto-placing houses in this block. */
  layoutMode?: 'rows' | 'grid' | 'serpentine';
  /** Number of houses the user asked to auto-place. */
  houseCount?: number;
  /** House symbol type used for auto-placement. */
  houseType?: SymbolType;
  /** True if produced by road-intersection detection (vs hand-edited/merged/split). */
  autoDetected?: boolean;
  /** Sizing multiplier for symbols in this block. */
  symbolSizeMultiplier?: number;
}

export interface FarmlandBlock {
  id: string; label: string;
  points: Coordinate[];
}

export interface WaterBody {
  id: string; name: string; type: 'pond' | 'river' | 'stream' | 'canal' | 'drain';
  coords: Coordinate[];
  center: Coordinate;
}

export interface ForestArea {
  id: string; name: string;
  points: Coordinate[];
}

export interface LanduseArea {
  id: string; type: string; points: Coordinate[];
}

export interface Landmark {
  id: string; name: string; type: string; lat: number; lng: number;
  selectedForPdf?: boolean;
}

export interface AreaStats {
  buildings: number; houses: number; apartments: number; nonResidential: number;
  roads: number; farmlandCount: number; farmlandArea: number;
  waterBodies: number; forests: number; landmarks: number;
  totalArea: number; density: number;
}

export interface MapData {
  hlbNumber: string; center: Coordinate; district: string; state: string;
  enumeratorName: string; chargeOfficer: string;
  boundaryPins: Coordinate[]; boundaryClosed: boolean;
  roads: RoadFeature[]; roadsConfirmed: boolean;
  symbols: PlacedSymbol[]; numberingComplete: boolean;
  blocks: Block[]; orientation: 'landscape' | 'portrait';
  farmlandBlocks: FarmlandBlock[];
  waterBodies: WaterBody[];
  forests: ForestArea[];
  landuseAreas?: LanduseArea[];
  landmarks: Landmark[];
  areaStats: AreaStats | null;
  surveyMapUrl?: string;
  surveyMapBase64?: string;
  aiMapChunks?: { label: string; bbox: Coordinate[]; imageBase64: string; features?: any }[];
  projectId?: string;
  isLive?: boolean;
  paymentStatus?: string;
  exportCount?: number;
  autoExport?: boolean;
  locationName?: string;
  gridConfig?: { enabled: boolean; columns: number; rows: number };
  // Census layout-map title-block location particulars (Phase 2)
  tehsil?: string;
  townVillage?: string;
  wardNo?: string;
  ebNo?: string;
  supervisorName?: string;
  sheetSize?: 'a4' | 'a3';
  /** Neighbouring HLB/village names by compass side, drawn outside the boundary. */
  neighbours?: { north?: string; south?: string; east?: string; west?: string };
  /** Project creation mode: 'canvas' = Canvas Block screen, 'desk' (default) = Desk flow */
  mode?: 'canvas' | 'desk';
  numberingSystem?: 'serpentine' | 'census_u_loop' | 'boundary_serpentine';
}

export const SYMBOL_DEFS: { type: SymbolType; label: string; labelHi: string; isHouse: boolean }[] = [
  { type: 'pucca_house', label: 'Pucca House', labelHi: 'पक्का घर', isHouse: true },
  { type: 'kutcha_house', label: 'Kutcha House', labelHi: 'कच्चा घर', isHouse: true },
  { type: 'apartment', label: 'Apartment', labelHi: 'अपार्टमेंट', isHouse: true },
  { type: 'non_residential', label: 'Non-Residential', labelHi: 'गैर-आवासीय', isHouse: false },
  { type: 'mosque', label: 'Mosque', labelHi: 'मस्जिद', isHouse: false },
  { type: 'temple', label: 'Temple', labelHi: 'मंदिर', isHouse: false },
  { type: 'church', label: 'Church', labelHi: 'चर्च', isHouse: false },
  { type: 'school', label: 'School', labelHi: 'विद्यालय', isHouse: false },
  { type: 'hospital', label: 'Hospital', labelHi: 'अस्पताल', isHouse: false },
  { type: 'well', label: 'Well / Handpump', labelHi: 'कुंआ', isHouse: false },
  { type: 'post_office', label: 'Post Office', labelHi: 'डाकघर', isHouse: false },
  { type: 'police_station', label: 'Police Station', labelHi: 'पुलिस स्टेशन', isHouse: false },
  { type: 'pond', label: 'Pond', labelHi: 'तालाब', isHouse: false },
  { type: 'farmland', label: 'Farmland', labelHi: 'खेत', isHouse: false },
];

export function isHouseType(t: SymbolType): boolean { return SYMBOL_DEFS.find(d => d.type === t)?.isHouse ?? false; }
export function isNumberableSymbol(t: SymbolType): boolean {
  return t !== 'well' && t !== 'pond' && t !== 'farmland';
}
export function isPakkaRoad(h: string): boolean { return ['motorway','trunk','primary','secondary'].includes(h); }
export function getUnitCount(s: PlacedSymbol): number {
  if (s.symbol_type === 'apartment' && s.unit_count && s.unit_count > 1) return s.unit_count;
  return 1;
}

// ─── Census layout-map symbology helpers ───────────────────────────────
// Spec (ORGI Annexure-4 §viii): Pucca building = SQUARE, Kutcha = TRIANGLE,
// wholly non-residential = the same shape but HATCHED.
export type BuildingShape = 'square' | 'triangle';

/** Shape per census rule: pucca/apartment → square, kutcha → triangle. */
export function buildingShape(s: PlacedSymbol): BuildingShape {
  if (s.symbol_type === 'kutcha_house') return 'triangle';
  if (s.symbol_type === 'pucca_house' || s.symbol_type === 'apartment') return 'square';
  
  // Fallback: check 34-column HLO 2027 wall and roof materials
  const wall = s.col_5_wall ?? s.col_6_wall_material;
  const roof = s.col_6_roof ?? s.col_7_roof_material;
  if (wall !== undefined && roof !== undefined) {
    const isKutchaWall = [1, 2, 3, 4, 5].includes(wall);
    const isKutchaRoof = [1, 2].includes(roof);
    if (isKutchaWall && isKutchaRoof) return 'triangle';
  }
  return 'square';
}

/**
 * Whether the building is wholly non-residential (→ hatched shape).
 * Precedence: explicit `is_residential` flag, else census col_4_use_type
 * (1=Residence, 2=Res+Shop are residential/partly), else col_7_use (HLO 2027),
 * else the legacy `non_residential` symbol type.
 */
export function isNonResidential(s: PlacedSymbol): boolean {
  if (s.is_residential !== undefined) return s.is_residential === false;
  if (s.col_4_use_type !== undefined) return ![1, 2].includes(s.col_4_use_type);
  if (s.col_7_use !== undefined) return ![1, 2].includes(s.col_7_use);
  return s.symbol_type === 'non_residential';
}

/** True if this symbol type is a building (gets a square/triangle box), not a landmark icon. */
export function isBuildingSymbol(t: SymbolType): boolean {
  return t === 'pucca_house' || t === 'kutcha_house' || t === 'apartment' || t === 'non_residential';
}

export function polyCenter(pts: Coordinate[]): Coordinate {
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}
