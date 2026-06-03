import React, { useState, useEffect } from 'react';
import { SurveySymbol } from '../../lib/idb';
import { HLO_SCHEDULE, migrateLegacySymbolData, HLOFieldDefinition, HLOFieldOption } from '../../lib/hlo-schedule';

interface HouseDataSidebarProps {
  house: SurveySymbol;
  onClose: () => void;
  onSave: (details: Partial<SurveySymbol>) => void;
}

export const HouseDataSidebar: React.FC<HouseDataSidebarProps> = ({ house, onClose, onSave }) => {
  // Pre-migrate legacy data to new HLO 2027 schema
  const migratedHouse = migrateLegacySymbolData(house);
  
  const [formData, setFormData] = useState<Partial<SurveySymbol>>({ ...migratedHouse });
  
  // Calculate if the house has existing data to determine VIEW vs EDIT mode
  const hasExistingData = HLO_SCHEDULE.some(field => {
    // Check if any visible field has a value defined
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
      
      // Auto-set col_3_house_no when col_2_building_no is edited if col_3 is blank
      if (key === 'col_2_building_no' && !updated.col_3_house_no) {
        updated.col_3_house_no = String(value);
      }

      // Skip logic: clear dependent values if parent condition is no longer met
      HLO_SCHEDULE.forEach(field => {
        if (field.visibleWhen && !field.visibleWhen(updated)) {
          delete updated[field.key as keyof SurveySymbol];
        }
      });

      return updated;
    });
  };

  const handleSave = () => {
    // 1. Enforce validation (residential must have head name and persons)
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

    // 2. Calculate fill percentage for visible fields
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

    // Clean up empty strings or nulls to keep DB representation small
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

  // Split fields by Schedule 1 (cols 1-13) and Schedule A (cols 14-34)
  const isResidential = formData.col_7_use === 1 || formData.col_7_use === 2;
  const isNormalHousehold = formData.col_9_household_no !== 999;
  
  const sch1Fields = HLO_SCHEDULE.filter(f => f.col <= 13);
  const schAFields = HLO_SCHEDULE.filter(f => f.col > 13);

  // ---------------- RENDERING HELPERS ---------------- //
  const renderField = (field: HLOFieldDefinition) => {
    const isVisible = field.visibleWhen ? field.visibleWhen(formData) : true;
    if (!isVisible) return null;

    const value = formData[field.key as keyof SurveySymbol];

    return (
      <div key={field.key} className="mb-6 animate-fadeIn bg-slate-50/50 p-4 rounded-2xl border border-slate-100/80">
        <div className="flex justify-between items-start mb-2">
          <span className="text-[10px] font-black text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full uppercase tracking-wider">
            Col {field.col}
          </span>
          {field.required && (
            <span className="text-[10px] font-bold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
              Required
            </span>
          )}
        </div>
        
        <label className="block text-sm font-extrabold text-slate-800 leading-snug">
          {field.labelEn}
        </label>
        <label className="block text-xs text-slate-500 font-medium mb-3">
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
                  className={`flex items-center gap-2 p-3 rounded-xl border text-left transition-all duration-200 active:scale-[0.98] ${
                    isSelected
                      ? 'bg-orange-50/70 border-[var(--color-saffron)] text-[var(--color-saffron)] shadow-sm'
                      : 'bg-white border-slate-200/80 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {opt.icon && <span className="text-xl flex-shrink-0">{opt.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black truncate leading-tight">{opt.labelEn}</p>
                    <p className="text-[10px] font-semibold text-slate-400 truncate mt-0.5 leading-none">{opt.labelHi}</p>
                  </div>
                  <span className="text-[10px] font-mono text-slate-300">({opt.value})</span>
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
            className="w-full p-4 bg-white border border-slate-200/80 rounded-xl focus:outline-none focus:border-[var(--color-saffron)] focus:ring-2 focus:ring-orange-100 font-bold text-sm transition-all"
          />
        )}
      </div>
    );
  };

  const getOptionLabel = (field: HLOFieldDefinition, val: any): string => {
    if (val === undefined || val === null) return '-';
    if (field.options) {
      const opt = field.options.find(o => o.value === val);
      return opt ? `${opt.labelEn} (${opt.value}) / ${opt.labelHi}` : String(val);
    }
    return String(val);
  };

  // ---------------- RENDER ---------------- //
  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[2999] transition-opacity" onClick={onClose} />
      <div 
        className="fixed top-0 right-0 bottom-0 w-[90%] max-w-[420px] bg-white z-[3000] shadow-[-10px_0_40px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-300 overflow-hidden" 
        style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50 backdrop-blur-sm flex-shrink-0">
          <div>
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 font-[Baloo_2]">
              <span className="w-8 h-8 rounded-full bg-[var(--color-saffron)] text-white flex items-center justify-center text-sm shadow-md font-mono">{house.number || '?'}</span>
              HLO Survey Register
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 font-bold ml-10">Official 2027 Schedule (34 Columns)</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm text-slate-500 font-bold hover:bg-slate-50">×</button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 pb-28">
          
          {mode === 'VIEW' ? (
            <div className="space-y-6">
              {/* Summary card */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-100 rounded-3xl p-5 relative overflow-hidden shadow-sm">
                <div className="absolute top-2 right-2 opacity-10 text-7xl">🗺️</div>
                <h3 className="text-[10px] font-black text-orange-700 uppercase tracking-widest mb-1">Census House #{migratedHouse.col_3_house_no || house.number || '?'}</h3>
                
                {isResidential ? (
                  <>
                    <p className="text-2xl font-black text-slate-800 leading-snug">{migratedHouse.col_11_head_name || 'No Head Name'}</p>
                    <div className="flex items-center gap-6 mt-4">
                      <div>
                        <p className="text-[9px] text-orange-600 font-extrabold uppercase tracking-wider">Persons (10)</p>
                        <p className="font-extrabold text-lg text-slate-800 font-mono">{migratedHouse.col_10_persons || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-orange-600 font-extrabold uppercase tracking-wider">Rooms (15)</p>
                        <p className="font-extrabold text-lg text-slate-800 font-mono">{migratedHouse.col_15_rooms || '-'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-orange-600 font-extrabold uppercase tracking-wider">Household No. (9)</p>
                        <p className="font-extrabold text-lg text-slate-800 font-mono">{migratedHouse.col_9_household_no === 999 ? 'Inst.' : (migratedHouse.col_9_household_no || '-')}</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-black text-slate-800 leading-snug">Non-Residential Block</p>
                    <p className="text-xs text-orange-700/80 font-bold mt-1">Use: {getOptionLabel(HLO_SCHEDULE[6], migratedHouse.col_7_use)}</p>
                  </>
                )}
              </div>

              {/* Grid overview */}
              <div>
                <h4 className="font-black text-xs text-slate-400 uppercase tracking-wider mb-3 border-b border-slate-100 pb-2">Completed Data Columns</h4>
                <div className="space-y-3">
                  {HLO_SCHEDULE.map(field => {
                    const isVisible = field.visibleWhen ? field.visibleWhen(migratedHouse) : true;
                    if (!isVisible) return null;
                    const val = migratedHouse[field.key as keyof SurveySymbol];
                    return (
                      <div key={field.key} className="flex justify-between items-center gap-3 text-xs border-b border-slate-50 pb-2">
                        <span className="text-slate-400 font-extrabold">Col {field.col}: {field.labelEn}</span>
                        <span className="font-bold text-slate-700 text-right max-w-[200px] truncate">
                          {field.type === 'select' ? getOptionLabel(field, val) : (val !== undefined && val !== null ? String(val) : '-')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <button onClick={() => setMode('EDIT')} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-all">
                ✏️ Edit Census Fields
              </button>
            </div>
          ) : (
            <div>
              {/* Tabs */}
              <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-2xl flex-shrink-0">
                <button 
                  type="button" 
                  onClick={() => setActiveTab('SCH1')} 
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all duration-200 ${activeTab === 'SCH1' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                  Schedule 1 (General)
                </button>
                {isResidential && isNormalHousehold && (
                  <button 
                    type="button" 
                    onClick={() => setActiveTab('SCHA')} 
                    className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all duration-200 ${activeTab === 'SCHA' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
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

        {/* BOTTOM FIXED BAR */}
        {mode === 'EDIT' && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-[3005]">
            <div className="flex gap-3">
              {isResidential && isNormalHousehold && activeTab === 'SCH1' ? (
                <button 
                  type="button" 
                  onClick={() => {
                    // Quick validation of Sch 1 before moving
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
                  className="flex-1 py-4 bg-[var(--color-saffron)] text-white rounded-2xl font-bold shadow-lg shadow-orange-100 flex items-center justify-center gap-2 text-sm"
                >
                  Next: Amenities Details →
                </button>
              ) : (
                <button 
                  onClick={handleSave} 
                  className="flex-1 py-4 bg-[var(--color-india-green)] text-white rounded-2xl font-bold shadow-lg shadow-green-100 flex items-center justify-center gap-2 text-sm"
                >
                  <span>✓</span> Save Register Details
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </>
  );
};
