export interface Coordinate { lat: number; lng: number; }

export type SymbolType =
  | 'pucca_house' | 'kutcha_house' | 'apartment' | 'non_residential'
  | 'mosque' | 'temple' | 'church' | 'school' | 'hospital'
  | 'well' | 'post_office' | 'pond' | 'farmland';

export interface PlacedSymbol {
  id: string; symbol_type: SymbolType; lat: number; lng: number;
  number: number | null; placed_at: string; auto_detected?: boolean;
  unit_count?: number; label?: string;
}

export interface RoadFeature {
  id: string; coords: Coordinate[]; highway: string;
  confirmed: boolean; source: 'osm' | 'user'; osm_id?: number;
}

export interface Block {
  id: string; label: string;
  south: number; north: number; west: number; east: number;
  points?: Coordinate[];
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

export interface Landmark {
  id: string; name: string; type: string; lat: number; lng: number;
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
  landmarks: Landmark[];
  areaStats: AreaStats | null;
  surveyMapUrl?: string;
  surveyMapBase64?: string;
  projectId?: string;
  paymentStatus?: string;
  exportCount?: number;
  autoExport?: boolean;
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
  { type: 'pond', label: 'Pond', labelHi: 'तालाब', isHouse: false },
  { type: 'farmland', label: 'Farmland', labelHi: 'खेत', isHouse: false },
];

export function isHouseType(t: SymbolType): boolean { return SYMBOL_DEFS.find(d => d.type === t)?.isHouse ?? false; }
export function isPakkaRoad(h: string): boolean { return ['motorway','trunk','primary','secondary'].includes(h); }
export function getUnitCount(s: PlacedSymbol): number {
  if (s.symbol_type === 'apartment' && s.unit_count && s.unit_count > 1) return s.unit_count;
  return 1;
}
export function polyCenter(pts: Coordinate[]): Coordinate {
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length };
}
