import React, { useState, useEffect } from 'react';
import { SurveySymbol } from '../../lib/idb';

interface HouseDataSidebarProps {
  house: SurveySymbol;
  onClose: () => void;
  onSave: (details: Partial<SurveySymbol>) => void;
}

export const HouseDataSidebar: React.FC<HouseDataSidebarProps> = ({ house, onClose, onSave }) => {
  // If the house already has significant data, start in VIEW mode
  const hasData = house.col_4_use_type !== undefined || house.head_of_household !== undefined || house.col_10_head_name !== undefined;
  
  const [mode, setMode] = useState<'VIEW' | 'EDIT'>(hasData ? 'VIEW' : 'EDIT');
  const [step, setStep] = useState<1 | 2>(1); // 1 = Schedule 1, 2 = Schedule A
  
  // Local state for all fields
  const [formData, setFormData] = useState<Partial<SurveySymbol>>({ ...house });

  useEffect(() => {
    setFormData({ ...house });
  }, [house]);

  const handleSave = () => {
    // Calculate completeness
    let filledFields = 0;
    const totalFields = 17; // Approximate key fields to track
    
    const sch1Complete = !!(formData.col_4_use_type && formData.col_6_wall_material && formData.col_7_roof_material && formData.col_8_condition && formData.col_9_family_count);
    const schAComplete = !!(formData.col_18_water_source && formData.col_19_electricity !== undefined && formData.col_20_latrine && formData.col_25_cooking_fuel);
    
    // Just a basic heuristic
    if (formData.col_4_use_type) filledFields++;
    if (formData.col_6_wall_material) filledFields++;
    if (formData.col_7_roof_material) filledFields++;
    if (formData.col_8_condition) filledFields++;
    if (formData.col_9_family_count) filledFields++;
    if (formData.col_10_head_name) filledFields++;
    if (formData.col_11_total_rooms) filledFields++;
    if (formData.col_12_ownership) filledFields++;
    
    if (formData.col_18_water_source) filledFields++;
    if (formData.col_19_electricity !== undefined) filledFields++;
    if (formData.col_20_latrine) filledFields++;
    if (formData.col_21_latrine_type) filledFields++;
    if (formData.col_22_bathroom) filledFields++;
    if (formData.col_25_cooking_fuel) filledFields++;
    if (formData.col_24_kitchen) filledFields++;
    if (formData.col_34_mobile_number) filledFields++;
    if (formData.asset_mobile || formData.asset_tv || formData.asset_bicycle) filledFields++;

    const form_fill_percentage = Math.round((filledFields / totalFields) * 100);

    onSave({
      ...formData,
      schedule1_complete: sch1Complete,
      schedule_a_complete: schAComplete,
      form_fill_percentage
    });
  };

  const updateField = (key: keyof SurveySymbol, value: any) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  // ---------------- UI COMPONENTS ---------------- //
  const renderIconGrid = (fieldId: keyof SurveySymbol, label: string, options: {value: number|string, label: string, icon: string}[]) => (
    <div className="mb-6">
      <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
      <div className="grid grid-cols-3 gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => updateField(fieldId, opt.value)}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${formData[fieldId] === opt.value ? 'bg-orange-50 border-[var(--color-saffron)] text-[var(--color-saffron)] shadow-sm' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'}`}
          >
            <span className="text-2xl mb-1">{opt.icon}</span>
            <span className="text-xs font-semibold text-center">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderPills = (fieldId: keyof SurveySymbol, label: string, options: {value: number, label: string}[]) => (
    <div className="mb-6">
      <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => updateField(fieldId, opt.value)}
            className={`px-4 py-2 rounded-full border text-sm font-semibold transition-all ${formData[fieldId] === opt.value ? 'bg-[var(--color-saffron)] border-[var(--color-saffron)] text-white shadow-md' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  const renderScrollCards = (fieldId: keyof SurveySymbol, label: string, options: {value: number, label: string, icon: string}[]) => (
    <div className="mb-6">
      <label className="block text-sm font-bold text-gray-700 mb-2">{label}</label>
      <div className="flex overflow-x-auto gap-3 pb-2 snap-x hide-scrollbar">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => updateField(fieldId, opt.value)}
            className={`flex-shrink-0 w-24 flex flex-col items-center justify-center p-3 rounded-xl border snap-start transition-all ${formData[fieldId] === opt.value ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-sm' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <span className="text-2xl mb-1">{opt.icon}</span>
            <span className="text-xs font-semibold text-center leading-tight">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const renderStepper = (fieldId: keyof SurveySymbol, label: string, min: number = 1, max: number = 20) => {
    const val = (formData[fieldId] as number) || min;
    return (
      <div className="mb-6 flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-200">
        <label className="text-sm font-bold text-gray-700">{label}</label>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => updateField(fieldId, Math.max(min, val - 1))} className="w-10 h-10 rounded-full bg-white border border-gray-300 flex items-center justify-center text-xl font-bold text-gray-600 shadow-sm">-</button>
          <span className="text-xl font-black w-6 text-center">{val}</span>
          <button type="button" onClick={() => updateField(fieldId, Math.min(max, val + 1))} className="w-10 h-10 rounded-full bg-[var(--color-saffron)] text-white flex items-center justify-center text-xl font-bold shadow-md">+</button>
        </div>
      </div>
    );
  };

  const renderAssetsGrid = () => {
    const assets = [
      { id: 'asset_radio', label: 'Radio', icon: '📻' },
      { id: 'asset_tv', label: 'TV', icon: '📺' },
      { id: 'asset_computer_internet', label: 'Computer', icon: '💻' },
      { id: 'asset_mobile', label: 'Mobile', icon: '📱' },
      { id: 'asset_bicycle', label: 'Bicycle', icon: '🚲' },
      { id: 'asset_scooter_motorcycle', label: 'Scooter', icon: '🛵' },
      { id: 'asset_car_jeep_van', label: 'Car/Jeep', icon: '🚗' }
    ] as const;

    return (
      <div className="mb-6">
        <label className="block text-sm font-bold text-gray-700 mb-2">Household Assets (Select all that apply)</label>
        <div className="flex flex-wrap gap-2">
          {assets.map(asset => (
            <button
              key={asset.id}
              type="button"
              onClick={() => updateField(asset.id, !formData[asset.id as keyof SurveySymbol])}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${formData[asset.id as keyof SurveySymbol] ? 'bg-green-50 border-green-500 text-green-700 shadow-sm' : 'bg-white border-gray-200 text-gray-600'}`}
            >
              <span>{asset.icon}</span>
              <span className="font-medium">{asset.label}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // ---------------- RENDER ---------------- //
  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[2999] transition-opacity" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 w-[85%] max-w-[400px] bg-white z-[3000] shadow-[-10px_0_40px_rgba(0,0,0,0.2)] flex flex-col transition-transform duration-300" style={{ animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)' }}>
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/80 backdrop-blur-sm">
          <div>
            <h2 className="text-xl font-black text-gray-800 flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-[var(--color-saffron)] text-white flex items-center justify-center text-sm shadow-md">{house.number || '?'}</span>
              House Details
            </h2>
            <p className="text-xs text-gray-500 mt-1 font-medium ml-10">Schedule 1 & A Data</p>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm text-gray-500">×</button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto p-5 pb-24">
          
          {mode === 'VIEW' ? (
            <div className="space-y-6">
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-3 opacity-10 text-6xl">🏠</div>
                <h3 className="text-sm font-bold text-orange-800 mb-1">Head of Household</h3>
                <p className="text-2xl font-black text-gray-900">{house.col_10_head_name || house.head_of_household || 'Not provided'}</p>
                <div className="flex items-center gap-4 mt-4">
                  <div>
                    <p className="text-xs text-orange-600 font-bold">FAMILIES</p>
                    <p className="font-black text-lg">{house.col_9_family_count || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-orange-600 font-bold">ROOMS</p>
                    <p className="font-black text-lg">{house.col_11_total_rooms || '-'}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-bold text-gray-700 mb-3 border-b pb-2">Quick Overview</h4>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Use Type</span>
                    <span className="font-semibold text-sm">{house.col_4_use_type === 1 ? 'Residence' : house.col_4_use_type ? 'Other' : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Ownership</span>
                    <span className="font-semibold text-sm">{house.col_12_ownership === 1 ? 'Owned' : house.col_12_ownership === 2 ? 'Rented' : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Drinking Water</span>
                    <span className="font-semibold text-sm">{house.col_18_water_source ? 'Recorded' : '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500 text-sm">Mobile</span>
                    <span className="font-semibold text-sm">{house.col_34_mobile_number || '-'}</span>
                  </div>
                </div>
              </div>

              <button onClick={() => setMode('EDIT')} className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold shadow-lg shadow-gray-300">
                ✏️ Edit Full Details
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Tabs */}
              <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
                <button type="button" onClick={() => setStep(1)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${step === 1 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Schedule 1</button>
                {formData.col_4_use_type === 1 || formData.col_4_use_type === 2 ? (
                  formData.col_9_family_count !== 999 ? (
                    <button type="button" onClick={() => setStep(2)} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${step === 2 ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>Schedule A</button>
                  ) : null
                ) : null}
              </div>

              {step === 1 && (
                <div className="animate-fadeIn">
                  {renderIconGrid('col_4_use_type', 'Type of Use', [
                    { value: 1, label: 'Residence', icon: '🏠' },
                    { value: 2, label: 'Res+Shop', icon: '🏪' },
                    { value: 3, label: 'Shop/Office', icon: '🏢' },
                    { value: 4, label: 'School', icon: '🏫' },
                    { value: 6, label: 'Worship', icon: '🛕' },
                    { value: 9, label: 'Vacant', icon: '🔒' },
                    { value: 0, label: 'Other Non-Res', icon: '📦' }
                  ])}

                  {renderScrollCards('col_6_wall_material', 'Wall Material', [
                    { value: 3, label: 'Mud/Unburnt', icon: '🟫' },
                    { value: 6, label: 'Burnt Brick', icon: '🧱' },
                    { value: 9, label: 'Concrete', icon: '🏗️' },
                    { value: 5, label: 'GI Sheet', icon: '🔩' },
                    { value: 4, label: 'Wood', icon: '🪵' }
                  ])}

                  {renderScrollCards('col_7_roof_material', 'Roof Material', [
                    { value: 8, label: 'Concrete', icon: '🏗️' },
                    { value: 7, label: 'GI Sheet', icon: '🔩' },
                    { value: 4, label: 'Machine Tile', icon: '🔷' },
                    { value: 1, label: 'Grass/Mud', icon: '🌿' }
                  ])}

                  {/* Phase 2 Conditional Logic: Residential Only */}
                  {(formData.col_4_use_type === 1 || formData.col_4_use_type === 2) && (
                    <div className="mt-8 border-t border-gray-200 pt-6">
                      <h4 className="font-bold text-orange-600 mb-4">Residential Details</h4>
                      
                      {renderPills('col_8_condition', 'Condition', [
                        { value: 1, label: 'Good' },
                        { value: 2, label: 'Liveable' },
                        { value: 3, label: 'Dilapidated' }
                      ])}

                      {formData.col_9_family_count !== 999 && renderStepper('col_9_family_count', 'Number of Households (Families)')}
                      
                      <div className="flex items-center gap-2 mb-6 ml-2">
                        <input type="checkbox" id="inst_hh" className="w-5 h-5 accent-orange-500" checked={formData.col_9_family_count === 999} onChange={(e) => updateField('col_9_family_count', e.target.checked ? 999 : 1)} />
                        <label htmlFor="inst_hh" className="text-sm font-semibold text-gray-700">Institutional Household (Code 999)</label>
                      </div>

                      <div className="mb-6">
                        <label className="block text-sm font-bold text-gray-700 mb-2">Head of Household Name</label>
                        <input 
                          type="text" 
                          value={formData.col_10_head_name || formData.head_of_household || ''} 
                          onChange={(e) => { updateField('col_10_head_name', e.target.value); updateField('head_of_household', e.target.value); }}
                          className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[var(--color-saffron)] focus:ring-2 focus:ring-orange-100 font-semibold"
                          placeholder="e.g. Ramesh Kumar"
                        />
                      </div>

                      {renderStepper('col_11_total_rooms', 'Total Rooms')}

                      {renderPills('col_12_ownership', 'Ownership', [
                        { value: 1, label: 'Owned' },
                        { value: 2, label: 'Rented' },
                        { value: 3, label: 'Other' }
                      ])}
                      
                      {formData.col_9_family_count !== 999 && (
                        <button type="button" onClick={() => setStep(2)} className="w-full py-4 mt-4 bg-[var(--color-saffron)] text-white rounded-xl font-bold shadow-lg shadow-orange-200">
                          Next: Schedule A Details →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 2 && (
                <div className="animate-fadeIn">
                  {renderIconGrid('col_18_water_source', 'Drinking Water Source', [
                    { value: 1, label: 'Tap (Treated)', icon: '🚰' },
                    { value: 2, label: 'Tap (Untreated)', icon: '🚱' },
                    { value: 5, label: 'Handpump', icon: '⛽' },
                    { value: 3, label: 'Covered Well', icon: '🪣' }
                  ])}

                  {/* Phase 4: Latrine Logic */}
                  {renderPills('col_20_latrine', 'Access to Latrine (Col 20)', [
                    { value: 1, label: 'Exclusive' },
                    { value: 2, label: 'Shared' },
                    { value: 3, label: 'Public' },
                    { value: 4, label: 'Open' }
                  ])}

                  {(formData.col_20_latrine === 1 || formData.col_20_latrine === 2) && (
                    <div className="ml-4 pl-4 border-l-2 border-orange-200">
                      {renderIconGrid('col_21_latrine_type', 'Type of Latrine (Col 21)', [
                        { value: 1, label: 'Flush/Pour', icon: '🚽' },
                        { value: 2, label: 'Pit Latrine', icon: '🕳️' },
                        { value: 3, label: 'Other', icon: '🛖' }
                      ])}
                    </div>
                  )}

                  {/* Phase 4: Cooking Fuel Logic */}
                  {renderIconGrid('col_24_kitchen', 'Kitchen Availability (Col 24)', [
                    { value: 1, label: 'Inside, exclusive', icon: '🍳' },
                    { value: 2, label: 'Inside, shared', icon: '🍳' },
                    { value: 3, label: 'Outside, exclusive', icon: '⛺' },
                    { value: 4, label: 'Outside, shared', icon: '⛺' },
                    { value: 5, label: 'Open space', icon: '🔥' },
                    { value: 6, label: 'Other', icon: '🥘' },
                    { value: 7, label: 'No Cooking', icon: '🚫' }
                  ])}

                  {(formData.col_24_kitchen && formData.col_24_kitchen <= 6) && (
                    <div className="ml-4 pl-4 border-l-2 border-orange-200">
                      {renderIconGrid('col_25_cooking_fuel', 'Main Fuel Used (Col 25)', [
                        { value: 6, label: 'LPG/PNG', icon: '🔵' },
                        { value: 1, label: 'Firewood', icon: '🪵' },
                        { value: 3, label: 'Cowdung', icon: '🐄' },
                        { value: 7, label: 'Electricity', icon: '⚡' }
                      ])}
                    </div>
                  )}

                  {renderAssetsGrid()}

                  <div className="mb-6">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Mobile Number</label>
                    <input 
                      type="tel" 
                      value={formData.col_34_mobile_number || ''} 
                      onChange={(e) => updateField('col_34_mobile_number', e.target.value)}
                      className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-[var(--color-saffron)] font-semibold"
                      placeholder="e.g. 9876543210"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* BOTTOM FIXED BAR */}
        {mode === 'EDIT' && (
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
            <button onClick={handleSave} className="w-full py-4 bg-[var(--color-india-green)] text-white rounded-xl font-bold shadow-lg shadow-green-200 flex items-center justify-center gap-2 text-lg">
              <span>✓</span> Save Details
            </button>
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
