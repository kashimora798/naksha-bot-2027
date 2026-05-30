import { describe, it, expect } from 'vitest';
import { getUnitCount, isHouseType, buildingShape, isNonResidential, isBuildingSymbol } from '../../types';
import type { PlacedSymbol } from '../../types';

function mk(partial: Partial<PlacedSymbol>): PlacedSymbol {
  return {
    id: 'x', symbol_type: 'pucca_house', lat: 0, lng: 0,
    number: null, placed_at: '2026-01-01T00:00:00Z', ...partial,
  };
}

describe('getUnitCount', () => {
  it('returns 1 for a normal house', () => {
    expect(getUnitCount(mk({ symbol_type: 'pucca_house' }))).toBe(1);
  });

  it('returns 1 for an apartment with no unit_count', () => {
    expect(getUnitCount(mk({ symbol_type: 'apartment' }))).toBe(1);
  });

  it('returns 1 for an apartment with unit_count of 1', () => {
    expect(getUnitCount(mk({ symbol_type: 'apartment', unit_count: 1 }))).toBe(1);
  });

  it('returns the unit_count for a multi-unit apartment', () => {
    expect(getUnitCount(mk({ symbol_type: 'apartment', unit_count: 8 }))).toBe(8);
  });
});

describe('isHouseType', () => {
  it('classifies pucca_house as a house', () => {
    expect(isHouseType('pucca_house')).toBe(true);
  });

  it('does not classify a well as a house', () => {
    expect(isHouseType('well')).toBe(false);
  });
});

describe('census layout-map symbology (ORGI Annexure-4 §viii)', () => {
  it('pucca house → square', () => {
    expect(buildingShape(mk({ symbol_type: 'pucca_house' }))).toBe('square');
  });
  it('apartment → square (apartment is pucca)', () => {
    expect(buildingShape(mk({ symbol_type: 'apartment' }))).toBe('square');
  });
  it('kutcha house → triangle', () => {
    expect(buildingShape(mk({ symbol_type: 'kutcha_house' }))).toBe('triangle');
  });

  it('explicit is_residential:false → non-residential (hatched)', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', is_residential: false }))).toBe(true);
  });
  it('explicit is_residential:true → residential (not hatched)', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', is_residential: true }))).toBe(false);
  });
  it('col_4_use_type 1 (Residence) → residential', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', col_4_use_type: 1 }))).toBe(false);
  });
  it('col_4_use_type 2 (Res+Shop) → residential (partly)', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', col_4_use_type: 2 }))).toBe(false);
  });
  it('col_4_use_type 3 (Shop/Office) → non-residential', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', col_4_use_type: 3 }))).toBe(true);
  });
  it('legacy non_residential type with no flags → non-residential', () => {
    expect(isNonResidential(mk({ symbol_type: 'non_residential' }))).toBe(true);
  });
  it('explicit flag overrides col_4_use_type', () => {
    expect(isNonResidential(mk({ symbol_type: 'pucca_house', is_residential: true, col_4_use_type: 3 }))).toBe(false);
  });

  it('buildings are building symbols; landmarks are not', () => {
    expect(isBuildingSymbol('pucca_house')).toBe(true);
    expect(isBuildingSymbol('kutcha_house')).toBe(true);
    expect(isBuildingSymbol('apartment')).toBe(true);
    expect(isBuildingSymbol('non_residential')).toBe(true);
    expect(isBuildingSymbol('temple')).toBe(false);
    expect(isBuildingSymbol('well')).toBe(false);
    expect(isBuildingSymbol('school')).toBe(false);
  });
});

describe('house-numbering arithmetic (regression for string-number bug)', () => {
  // Before the P0 fix, number was `number | string | null`. A string number made
  // `number + unit - 1` concatenate ("12"+1 = "121") instead of adding. With number
  // normalized to `number | null`, the range label math must be correct.
  function rangeLabel(sym: PlacedSymbol): string {
    const u = getUnitCount(sym);
    if (sym.number === null) return '';
    return u > 1 ? `${sym.number}-${sym.number + u - 1}` : String(sym.number);
  }

  it('single house shows just its number', () => {
    expect(rangeLabel(mk({ number: 12 }))).toBe('12');
  });

  it('apartment with 3 units numbered 10 shows 10-12 (not 10-102)', () => {
    expect(rangeLabel(mk({ symbol_type: 'apartment', unit_count: 3, number: 10 }))).toBe('10-12');
  });

  it('apartment with 8 units numbered 100 shows 100-107', () => {
    expect(rangeLabel(mk({ symbol_type: 'apartment', unit_count: 8, number: 100 }))).toBe('100-107');
  });

  it('unnumbered symbol shows empty label', () => {
    expect(rangeLabel(mk({ number: null }))).toBe('');
  });
});
