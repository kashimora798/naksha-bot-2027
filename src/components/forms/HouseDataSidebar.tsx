import React, { useState, useEffect } from 'react';
import { SurveySymbol } from '../../lib/idb';
import { HLO_SCHEDULE, migrateLegacySymbolData, HLOFieldDefinition } from '../../lib/hlo-schedule';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';

interface HouseDataSidebarProps {
  house: SurveySymbol;
  onClose: () => void;
  onSave: (details: Partial<SurveySymbol>) => void;
}

export const HouseDataSidebar: React.FC<HouseDataSidebarProps> = ({ house, onClose, onSave }) => {
  const isLargeDesktop = useMediaQuery('(min-width: 1024px)');

  // Pre-migrate legacy data to new HLO 2027 schema
  const migratedHouse = migrateLegacySymbolData(house);
  
  const [formData, setFormData] = useState<Partial<SurveySymbol>>({ ...migratedHouse });
  
  // Calculate if the house has existing data to determine VIEW vs EDIT mode
  const hasExistingData = HLO_SCHEDULE.some(field => {
    if (field.visibleWhen && !field.visibleWhen(migratedHouse)) return false;
    const val = migratedHouse[field.key as keyof SurveySymbol];
    return val !== undefined && val !== '' && val !== null;
  });

  const [mode, setMode] = useState<'VIEW' | 'EDIT'>(hasExistingData ? 'VIEW' : 'EDIT');
  const [activeTab, setActiveTab] = useState<'SCH1' | 'SCHA'>('SCH1');

  useEffect(() => {
    const updated = migrateLegacySymbolData(house);
    setFormData({ ...updated });
  }, [house]);

  const updateField = (key: string, value: any) => {
    setFormData(prev => {
      const updated = { ...prev, [key]: value };
      
      if (key === 'col_2_building_no' && !updated.col_3_house_no) {
        updated.col_3_house_no = String(value);
      }

      HLO_SCHEDULE.forEach(field => {
        if (field.visibleWhen && !field.visibleWhen(updated)) {
          delete updated[field.key as keyof SurveySymbol];
        }
      });

      return updated;
    });
  };

  const handleSave = () => {
    const isResidential = formData.col_7_use === 1 || formData.col_7_use === 2;
    if (isResidential) {
      if (!formData.col_11_head_name) {
        alert('Please enter the Name of the Head of Household (कॉलम 11).');
        return;
      }
      if (!formData.col_10_persons || formData.col_10_persons <= 0) {
        alert('Please enter the Total Persons (कॉलम 10).');
        return;
      }
    }

    let totalVisible = 0;
    let filledVisible = 0;
    
    HLO_SCHEDULE.forEach(field => {
      const isVisible = field.visibleWhen ? field.visibleWhen(formData) : true;
      if (isVisible) {
        totalVisible++;
        const val = formData[field.key as keyof SurveySymbol];
        if (val !== undefined && val !== '' && val !== null) {
          filledVisible++;
        }
      }
    });

    const form_fill_percentage = Math.round((filledVisible / totalVisible) * 100);
    const sch1Complete = !!(formData.col_4_floor && formData.col_5_wall && formData.col_6_roof && formData.col_7_use);
    const schAComplete = isResidential
      ? !!(formData.col_17_water_source && formData.col_19_lighting && formData.col_20_latrine && formData.col_24_kitchen)
      : true;

    const cleanedData = { ...formData };
    Object.keys(cleanedData).forEach(k => {
      if (cleanedData[k as keyof SurveySymbol] === '') {
        delete cleanedData[k as keyof SurveySymbol];
      }
    });

    onSave({
      ...cleanedData,
      schedule1_complete: sch1Complete,
      schedule_a_complete: schAComplete,
      form_fill_percentage
    });
  };

  const isResidential = formData.col_7_use === 1 || formData.col_7_use === 2;
  const isNormalHousehold = formData.col_9_household_no !== 999;
  
  const sch1Fields = HLO_SCHEDULE.filter(f => f.col <= 13);
  const schAFields = HLO_SCHEDULE.filter(f => f.col > 13);

  const getOptionLabel = (field: HLOFieldDefinition, val: any): string => {
    if (val === undefined || val === null) return '-';
    if (field.options) {
      const opt = field.options.find(o => o.value === val);
      return opt ? `${opt.labelEn} (${opt.value}) / ${opt.labelHi}` : String(val);
    }
    return String(val);
  };

  const renderField = (field: HLOFieldDefinition) => {
    const isVisible = field.visibleWhen ? field.visibleWhen(formData) : true;
    if (!isVisible) return null;

    const value = formData[field.key as keyof SurveySymbol];

    return (
      <div key={field.key} className="mb-4 bg-[var(--color-surface-2)] p-4 rounded-[var(--radius-lg)] border border-[var(--color-hairline)]">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-bold text-[var(--color-ink-tertiary)] bg-[var(--color-surface)] px-2 py-0.5 rounded-full uppercase tracking-wider border border-[var(--color-hairline)]">
            Col {field.col}
          </span>
          {field.required && (
            <span className="text-[10px] font-bold text-[var(--color-danger)] bg-rose-50 px-2 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
        
        <label className="block text-sm font-bold text-[var(--color-ink)] font-public-sans leading-snug">
          {field.labelEn}
        </label>
        <label className="block text-xs text-[var(--color-ink-secondary)] font-medium mb-3">
          {field.labelHi}
        </label>

        {field.type === 'select' && field.options && (
          <div className="grid grid-cols-2 gap-2">
            {field.options.map(opt => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateField(field.key, opt.value)}
                  className={`flex items-center gap-2 p-3 rounded-[var(--radius-md)] border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--color-accent-tint)] border-[var(--color-accent)] text-[var(--color-accent)] shadow-sm'
                      : 'bg-[var(--color-surface)] border-[var(--color-hairline)] text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-2)]'
                  }`}
                >
                  {opt.icon && <span className="text-lg shrink-0">{opt.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate leading-tight font-public-sans">{opt.labelEn}</p>
                    <p className="text-[10px] font-medium text-[var(--color-ink-tertiary)] truncate mt-0.5 leading-none">{opt.labelHi}</p>
                  </div>
                  <span className="text-[10px] font-jetbrains-mono opacity-50">({opt.value})</span>
                </button>
              );
            })}
          </div>
        )}

        {(field.type === 'text' || field.type === 'number') && (
          <input
            type={field.type === 'number' ? 'number' : 'text'}
            value={(value !== undefined && value !== null) ? (typeof value === 'boolean' ? String(value) : value) : ''}
            onChange={(e) => {
              const v = field.type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value;
              updateField(field.key, v);
            }}
            placeholder={`Enter Col ${field.col}...`}
            className="w-full p-3.5 bg-[var(--color-surface)] border border-[var(--color-hairline)] rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] font-bold text-sm text-[var(--color-ink)]"
          />
        )}
      </div>
    );
  };

  const formBodyContent = (
    <div className="space-y-4 pb-20">
      {mode === 'VIEW' ? (
        <div className="space-y-5">
          <div className="bg-[var(--color-accent-tint)] border border-[var(--color-accent)]/20 rounded-[var(--radius-xl)] p-4 relative overflow-hidden shadow-sm">
            <h3 className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-widest mb-1">
              Census House #{migratedHouse.col_3_house_no || house.number || '?'}
            </h3>
            
            {isResidential ? (
              <>
                <p className="text-xl font-bold text-[var(--color-ink)] font-public-sans leading-snug">
                  {migratedHouse.col_11_head_name || 'No Head Name'}
                </p>
                <div className="flex items-center gap-6 mt-3">
                  <div>
                    <p className="text-[9px] text-[var(--color-accent)] font-bold uppercase tracking-wider">Persons (10)</p>
                    <p className="font-bold text-base text-[var(--color-ink)] font-jetbrains-mono">{migratedHouse.col_10_persons || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--color-accent)] font-bold uppercase tracking-wider">Rooms (15)</p>
                    <p className="font-bold text-base text-[var(--color-ink)] font-jetbrains-mono">{migratedHouse.col_15_rooms || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-[var(--color-accent)] font-bold uppercase tracking-wider">Household No. (9)</p>
                    <p className="font-bold text-base text-[var(--color-ink)] font-jetbrains-mono">{migratedHouse.col_9_household_no === 999 ? 'Inst.' : (migratedHouse.col_9_household_no || '-')}</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-[var(--color-ink)] font-public-sans leading-snug">Non-Residential Block</p>
                <p className="text-xs text-[var(--color-ink-secondary)] font-medium mt-1">
                  Use: {getOptionLabel(HLO_SCHEDULE[6], migratedHouse.col_7_use)}
                </p>
              </>
            )}
          </div>

          <div>
            <h4 className="font-bold text-xs text-[var(--color-ink-tertiary)] uppercase tracking-wider mb-2 pb-1 border-b border-[var(--color-hairline)]">
              Completed Data Columns
            </h4>
            <div className="space-y-2">
              {HLO_SCHEDULE.map(field => {
                const isVisible = field.visibleWhen ? field.visibleWhen(migratedHouse) : true;
                if (!isVisible) return null;
                const val = migratedHouse[field.key as keyof SurveySymbol];
                return (
                  <div key={field.key} className="flex justify-between items-center gap-3 text-xs border-b border-[var(--color-hairline)] pb-1.5">
                    <span className="text-[var(--color-ink-tertiary)] font-bold">Col {field.col}: {field.labelEn}</span>
                    <span className="font-medium text-[var(--color-ink)] text-right max-w-[200px] truncate">
                      {field.type === 'select' ? getOptionLabel(field, val) : (val !== undefined && val !== null ? String(val) : '-')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <Button 
            onClick={() => setMode('EDIT')} 
            variant="filled" 
            fullWidth 
            size="lg"
          >
            ✏️ Edit Census Fields
          </Button>
        </div>
      ) : (
        <div>
          {/* Tabs */}
          <div className="flex gap-2 mb-4 p-1 bg-[var(--color-surface-2)] rounded-[var(--radius-md)] shrink-0">
            <button 
              type="button" 
              onClick={() => setActiveTab('SCH1')} 
              className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                activeTab === 'SCH1' 
                  ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm' 
                  : 'text-[var(--color-ink-secondary)]'
              }`}
            >
              Schedule 1 (General)
            </button>
            {isResidential && isNormalHousehold && (
              <button 
                type="button" 
                onClick={() => setActiveTab('SCHA')} 
                className={`flex-1 py-2 text-xs font-bold rounded-[var(--radius-sm)] transition-all cursor-pointer ${
                  activeTab === 'SCHA' 
                    ? 'bg-[var(--color-surface)] text-[var(--color-ink)] shadow-sm' 
                    : 'text-[var(--color-ink-secondary)]'
                }`}
              >
                Schedule A (Amenities)
              </button>
            )}
          </div>

          {/* Schema Fields */}
          <div className="space-y-2">
            {activeTab === 'SCH1' 
              ? sch1Fields.map(f => renderField(f))
              : schAFields.map(f => renderField(f))
            }
          </div>
        </div>
      )}
    </div>
  );

  const headerTitle = (
    <div className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center text-xs font-bold font-jetbrains-mono">
        {house.number || '?'}
      </span>
      <div>
        <h2 className="text-base font-bold text-[var(--color-ink)] font-public-sans tracking-tight">
          HLO Survey Register
        </h2>
        <p className="text-[10px] text-[var(--color-ink-secondary)] font-medium">Official 2027 Schedule (34 Columns)</p>
      </div>
    </div>
  );

  // Desktop >=1024px: Persistent sidebar panel on right
  if (isLargeDesktop) {
    return (
      <>
        <div className="fixed inset-0 bg-black/20 backdrop-blur-xs z-[2999]" onClick={onClose} />
        <div className="fixed top-0 right-0 bottom-0 w-[420px] bg-[var(--color-surface)] z-[3000] shadow-[var(--shadow-lg)] border-l border-[var(--color-hairline)] flex flex-col overflow-hidden animate-slide-left">
          <div className="flex items-center justify-between p-4 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] shrink-0">
            {headerTitle}
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-ink-secondary)] hover:bg-[var(--color-surface-2)] transition-colors cursor-pointer">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 scrollbar-thin">
            {formBodyContent}
          </div>

          {mode === 'EDIT' && (
            <div className="p-4 bg-[var(--color-surface)] border-t border-[var(--color-hairline)] shadow-[var(--shadow-md)] shrink-0">
              {isResidential && isNormalHousehold && activeTab === 'SCH1' ? (
                <Button 
                  type="button" 
                  onClick={() => {
                    if (!formData.col_11_head_name) {
                      alert('Please enter the Name of the Head of Household (कॉलम 11).');
                      return;
                    }
                    if (!formData.col_10_persons || formData.col_10_persons <= 0) {
                      alert('Please enter the Total Persons (कॉलम 10).');
                      return;
                    }
                    setActiveTab('SCHA');
                  }} 
                  variant="filled"
                  fullWidth
                  size="lg"
                >
                  Next: Amenities Details →
                </Button>
              ) : (
                <Button 
                  onClick={handleSave} 
                  variant="filled"
                  fullWidth
                  size="lg"
                >
                  ✓ Save Register Details
                </Button>
              )}
            </div>
          )}
        </div>
      </>
    );
  }

  // Mobile / Tablet <1024px: Responsive Sheet bottom sheet
  return (
    <Sheet open={true} onClose={onClose} title={headerTitle} maxWidth="lg">
      {formBodyContent}
      {mode === 'EDIT' && (
        <div className="pt-3 border-t border-[var(--color-hairline)] mt-3">
          {isResidential && isNormalHousehold && activeTab === 'SCH1' ? (
            <Button 
              type="button" 
              onClick={() => {
                if (!formData.col_11_head_name) {
                  alert('Please enter the Name of the Head of Household (कॉलम 11).');
                  return;
                }
                if (!formData.col_10_persons || formData.col_10_persons <= 0) {
                  alert('Please enter the Total Persons (कॉलम 10).');
                  return;
                }
                setActiveTab('SCHA');
              }} 
              variant="filled"
              fullWidth
              size="lg"
            >
              Next: Amenities Details →
            </Button>
          ) : (
            <Button 
              onClick={handleSave} 
              variant="filled"
              fullWidth
              size="lg"
            >
              ✓ Save Register Details
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
};
