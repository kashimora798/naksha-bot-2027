export interface HLOFieldOption {
  value: number | string;
  labelEn: string;
  labelHi: string;
  icon?: string;
}

export interface HLOFieldDefinition {
  col: number;
  key: string;
  labelEn: string;
  labelHi: string;
  type: 'select' | 'text' | 'number' | 'boolean';
  options?: HLOFieldOption[];
  visibleWhen?: (formData: any) => boolean;
  defaultValue?: any;
  required?: boolean | ((formData: any) => boolean);
}

export const HLO_SCHEDULE: HLOFieldDefinition[] = [
  {
    col: 1,
    key: 'col_1_line_no',
    labelEn: 'Line Number',
    labelHi: 'लाइन संख्या',
    type: 'number',
    defaultValue: 1
  },
  {
    col: 2,
    key: 'col_2_building_no',
    labelEn: 'Building Number',
    labelHi: 'भवन संख्या',
    type: 'number',
    required: true
  },
  {
    col: 3,
    key: 'col_3_house_no',
    labelEn: 'Census House Number',
    labelHi: 'जनगणना मकान संख्या',
    type: 'text',
    required: true
  },
  {
    col: 4,
    key: 'col_4_floor',
    labelEn: 'Floor Material',
    labelHi: 'फर्श की सामग्री',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Mud', labelHi: 'मिट्टी', icon: '🟫' },
      { value: 2, labelEn: 'Wood/Bamboo', labelHi: 'लकड़ी/बांस', icon: '🪵' },
      { value: 3, labelEn: 'Burnt Brick', labelHi: 'पक्की ईंट', icon: '🧱' },
      { value: 4, labelEn: 'Stone', labelHi: 'पत्थर', icon: '🪨' },
      { value: 5, labelEn: 'Cement', labelHi: 'सीमेंट', icon: '🔘' },
      { value: 6, labelEn: 'Mosaic/Tiles', labelHi: 'मोजैक/टाइल्स', icon: '⬜' },
      { value: 7, labelEn: 'Any Other', labelHi: 'अन्य कोई', icon: '📦' }
    ],
    required: true
  },
  {
    col: 5,
    key: 'col_5_wall',
    labelEn: 'Wall Material',
    labelHi: 'दीवार की सामग्री',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Grass/Thatch/Bamboo', labelHi: 'घांस/फूस/बांस', icon: '🌿' },
      { value: 2, labelEn: 'Plastic/Polythene', labelHi: 'प्लास्टिक/पॉलीथिन', icon: '🛍️' },
      { value: 3, labelEn: 'Mud/Unburnt Brick', labelHi: 'मिट्टी/कच्ची ईंट', icon: '🟫' },
      { value: 4, labelEn: 'Wood', labelHi: 'लकड़ी', icon: '🪵' },
      { value: 5, labelEn: 'Stone (No Mortar)', labelHi: 'पत्थर (मसाला रहित)', icon: '🪨' },
      { value: 6, labelEn: 'Stone (With Mortar)', labelHi: 'पत्थर (मसाला युक्त)', icon: '🧱' },
      { value: 7, labelEn: 'GI/Metal Sheets', labelHi: 'जी.आई./धातु चादरें', icon: '🔩' },
      { value: 8, labelEn: 'Burnt Brick', labelHi: 'पक्की ईंट', icon: '🧱' },
      { value: 9, labelEn: 'Concrete', labelHi: 'कंक्रीट', icon: '🏗️' },
      { value: 0, labelEn: 'Any Other', labelHi: 'अन्य कोई', icon: '📦' }
    ],
    required: true
  },
  {
    col: 6,
    key: 'col_6_roof',
    labelEn: 'Roof Material',
    labelHi: 'छत की सामग्री',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Grass/Thatch/Wood', labelHi: 'घांस/फूस/लकड़ी', icon: '🌿' },
      { value: 2, labelEn: 'Plastic/Polythene', labelHi: 'प्लास्टिक/पॉलीथिन', icon: '🛍️' },
      { value: 3, labelEn: 'Handmade Tiles', labelHi: 'हस्त निर्मित टाइल्स', icon: '🔷' },
      { value: 4, labelEn: 'Machine Made Tiles', labelHi: 'मशीन निर्मित टाइल्स', icon: '🟦' },
      { value: 5, labelEn: 'Burnt Brick', labelHi: 'पक्की ईंट', icon: '🧱' },
      { value: 6, labelEn: 'Stone', labelHi: 'पत्थर', icon: '🪨' },
      { value: 7, labelEn: 'Slate', labelHi: 'स्लेट', icon: '📐' },
      { value: 8, labelEn: 'GI/Metal Sheets', labelHi: 'जी.आई./धातु चादरें', icon: '🔩' },
      { value: 9, labelEn: 'Concrete', labelHi: 'कंक्रीट', icon: '🏗️' },
      { value: 0, labelEn: 'Any Other', labelHi: 'अन्य कोई', icon: '📦' }
    ],
    required: true
  },
  {
    col: 7,
    key: 'col_7_use',
    labelEn: 'Use of Census House',
    labelHi: 'जनगणना मकान का उपयोग',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Residence', labelHi: 'आवास', icon: '🏠' },
      { value: 2, labelEn: 'Residence-cum-other', labelHi: 'आवास-सह-अन्य', icon: '🏪' },
      { value: 3, labelEn: 'Shop/Office', labelHi: 'दुकान/कार्यालय', icon: '🏢' },
      { value: 4, labelEn: 'School/College', labelHi: 'स्कूल/कॉलेज', icon: '🏫' },
      { value: 5, labelEn: 'Hotel/Lodge', labelHi: 'होटल/लॉज', icon: '🏨' },
      { value: 6, labelEn: 'Hospital/Dispensary', labelHi: 'अस्पताल/डिस्पेंसरी', icon: '🏥' },
      { value: 7, labelEn: 'Factory/Workshop', labelHi: 'फैक्टरी/वर्कशॉप', icon: '🏭' },
      { value: 8, labelEn: 'Place of Worship', labelHi: 'पूजा स्थल', icon: '🛕' },
      { value: 9, labelEn: 'Other Non-Residential', labelHi: 'अन्य गैर-आवासीय', icon: '📦' },
      { value: 0, labelEn: 'Vacant', labelHi: 'खाली', icon: '🔒' }
    ],
    required: true
  },
  {
    col: 8,
    key: 'col_8_condition',
    labelEn: 'Condition of House',
    labelHi: 'जनगणना मकान की स्थिति',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Good', labelHi: 'अच्छी' },
      { value: 2, labelEn: 'Livable', labelHi: 'रहने योग्य' },
      { value: 3, labelEn: 'Dilapidated', labelHi: 'जीर्ण-शीर्ण' }
    ],
    visibleWhen: (f) => f.col_7_use === 1 || f.col_7_use === 2,
    required: (f) => f.col_7_use === 1 || f.col_7_use === 2
  },
  {
    col: 9,
    key: 'col_9_household_no',
    labelEn: 'Household Number',
    labelHi: 'परिवार क्रमांक',
    type: 'number',
    defaultValue: 1,
    visibleWhen: (f) => f.col_7_use === 1 || f.col_7_use === 2,
    required: (f) => f.col_7_use === 1 || f.col_7_use === 2
  },
  {
    col: 10,
    key: 'col_10_persons',
    labelEn: 'Total Persons in Household',
    labelHi: 'परिवार में व्यक्तियों की कुल संख्या',
    type: 'number',
    defaultValue: 1,
    visibleWhen: (f) => f.col_7_use === 1 || f.col_7_use === 2,
    required: (f) => f.col_7_use === 1 || f.col_7_use === 2
  },
  {
    col: 11,
    key: 'col_11_head_name',
    labelEn: 'Name of the Head of Household',
    labelHi: 'परिवार के मुखिया का नाम',
    type: 'text',
    visibleWhen: (f) => f.col_7_use === 1 || f.col_7_use === 2,
    required: (f) => f.col_7_use === 1 || f.col_7_use === 2
  },
  {
    col: 12,
    key: 'col_12_sex',
    labelEn: 'Sex of Head',
    labelHi: 'मुखिया का लिंग',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Male', labelHi: 'पुरुष' },
      { value: 2, labelEn: 'Female', labelHi: 'स्त्री' },
      { value: 3, labelEn: 'Transgender', labelHi: 'ट्रांसजेंडर' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 13,
    key: 'col_13_caste',
    labelEn: 'Caste Category (SC/ST/Other)',
    labelHi: 'जाति वर्ग (अ.जा./अ.ज.जा./अन्य)',
    type: 'select',
    options: [
      { value: 1, labelEn: 'SC', labelHi: 'अ.जा. (Scheduled Caste)' },
      { value: 2, labelEn: 'ST', labelHi: 'अ.ज.जा. (Scheduled Tribe)' },
      { value: 3, labelEn: 'Other', labelHi: 'अन्य' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 14,
    key: 'col_14_ownership',
    labelEn: 'Ownership Status of House',
    labelHi: 'मकान के स्वामित्व की स्थिति',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Owned', labelHi: 'अपना' },
      { value: 2, labelEn: 'Rented (Own house elsewhere)', labelHi: 'किराए पर (परन्तु अन्यत्र अपना मकान)' },
      { value: 3, labelEn: 'Rented (No other house)', labelHi: 'किराए का (एवं अपना कोई मकान नहीं)' },
      { value: 4, labelEn: 'Any Other', labelHi: 'अन्य' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 15,
    key: 'col_15_rooms',
    labelEn: 'Dwelling Rooms in Possession',
    labelHi: 'उपलब्ध कमरों की संख्या',
    type: 'number',
    defaultValue: 1,
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 16,
    key: 'col_16_couples',
    labelEn: 'Married Couples in Household',
    labelHi: 'विवाहित दंपत्तियों की संख्या',
    type: 'number',
    defaultValue: 0,
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 17,
    key: 'col_17_water_source',
    labelEn: 'Main Source of Drinking Water',
    labelHi: 'पेयजल का मुख्य स्रोत',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Tap Water (Treated)', labelHi: 'नल का पानी (उपचारित)', icon: '🚰' },
      { value: 2, labelEn: 'Tap Water (Untreated)', labelHi: 'नल का पानी (अनउपचारित)', icon: '🚱' },
      { value: 3, labelEn: 'Well', labelHi: 'कुआं', icon: '🪣' },
      { value: 4, labelEn: 'Hand Pump', labelHi: 'हैण्डपंप', icon: '⛽' },
      { value: 5, labelEn: 'Tubewell/Borehole', labelHi: 'ट्यूबवेल/बोरहोल', icon: '🌀' },
      { value: 6, labelEn: 'Spring', labelHi: 'झरना', icon: '⛲' },
      { value: 7, labelEn: 'River/Canal', labelHi: 'नदी/नहर', icon: '🏞️' },
      { value: 8, labelEn: 'Tank/Pond/Lake', labelHi: 'टैंक/तालाब/झील', icon: '💧' },
      { value: 9, labelEn: 'Packaged/Bottled Water', labelHi: 'सीलबंद पैकेट/बोतल का पानी', icon: '🧴' },
      { value: 0, labelEn: 'Other Source', labelHi: 'अन्य स्रोत', icon: '📦' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 18,
    key: 'col_18_water_location',
    labelEn: 'Availability of Drinking Water Source',
    labelHi: 'पेयजल स्रोत की उपलब्धता',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Within Premises', labelHi: 'परिसर के अंदर' },
      { value: 2, labelEn: 'Near Premises', labelHi: 'परिसर के निकट' },
      { value: 3, labelEn: 'Away', labelHi: 'दूर' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && f.col_17_water_source !== undefined,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && f.col_17_water_source !== undefined
  },
  {
    col: 19,
    key: 'col_19_lighting',
    labelEn: 'Main Source of Lighting',
    labelHi: 'प्रकाश का मुख्य स्रोत',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Electricity', labelHi: 'बिजली', icon: '⚡' },
      { value: 2, labelEn: 'Kerosene', labelHi: 'मिट्टी का तेल', icon: '🪔' },
      { value: 3, labelEn: 'Solar Energy', labelHi: 'सौर ऊर्जा', icon: '☀️' },
      { value: 4, labelEn: 'Other Oil', labelHi: 'अन्य तेल', icon: '💧' },
      { value: 5, labelEn: 'Any Other', labelHi: 'अन्य', icon: '📦' },
      { value: 6, labelEn: 'No Lighting', labelHi: 'प्रकाश रहित', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 20,
    key: 'col_20_latrine',
    labelEn: 'Access to Latrine',
    labelHi: 'शौचालय की सुलभता',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Exclusive for Household', labelHi: 'केवल परिवार के लिए', icon: '🚽' },
      { value: 2, labelEn: 'Shared with other Household', labelHi: 'अन्य परिवार के साथ साझे में', icon: '🚻' },
      { value: 3, labelEn: 'Public Latrine', labelHi: 'सार्वजनिक शौचालय', icon: '🚹' },
      { value: 4, labelEn: 'No: Open Defecation', labelHi: 'नहीं: खुले में', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 21,
    key: 'col_21_latrine_type',
    labelEn: 'Type of Latrine',
    labelHi: 'शौचालय का प्रकार',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Flush to Sewer', labelHi: 'फ्लश: सीवर से', icon: '🚽' },
      { value: 2, labelEn: 'Flush to Septic Tank', labelHi: 'फ्लश: सेप्टिक टैंक से', icon: '🚽' },
      { value: 3, labelEn: 'Flush to Twin Pit', labelHi: 'फ्लश: ट्विन पिट से', icon: '🚽' },
      { value: 4, labelEn: 'Flush to Single Pit', labelHi: 'फ्लश: सिंगल पिट से', icon: '🚽' },
      { value: 5, labelEn: 'Flush to Other', labelHi: 'फ्लश: अन्य', icon: '🚽' },
      { value: 6, labelEn: 'Pit Latrine with Slab', labelHi: 'पिट शौचालय (स्लैब सहित)', icon: '🕳️' },
      { value: 7, labelEn: 'Pit Latrine without Slab', labelHi: 'पिट शौचालय (बिना स्लैब)', icon: '🕳️' },
      { value: 8, labelEn: 'Service Latrine', labelHi: 'सर्विस शौचालय', icon: '🛖' },
      { value: 9, labelEn: 'Other Latrine', labelHi: 'अन्य शौचालय', icon: '🛖' },
      { value: 0, labelEn: 'No Latrine / Not Connected', labelHi: 'कोई नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && (f.col_20_latrine === 1 || f.col_20_latrine === 2),
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && (f.col_20_latrine === 1 || f.col_20_latrine === 2)
  },
  {
    col: 22,
    key: 'col_22_drainage',
    labelEn: 'Waste Water Outlet Connected to',
    labelHi: 'गंदे पानी की निकासी किससे जुड़ी है',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Closed Drainage', labelHi: 'ढकी नाली से', icon: '➖' },
      { value: 2, labelEn: 'Open Drainage', labelHi: 'खुली नाली से', icon: '🥛' },
      { value: 3, labelEn: 'No Drainage', labelHi: 'किसी भी नाली से नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 23,
    key: 'col_23_bathing',
    labelEn: 'Bathing Facility Within Premises',
    labelHi: 'परिसर के अन्दर स्नान सुविधा',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Yes: Bathroom', labelHi: 'स्नानगृह', icon: '🚿' },
      { value: 2, labelEn: 'Yes: Enclosure without Roof', labelHi: 'छत के बिना अहाता', icon: '🧼' },
      { value: 3, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 24,
    key: 'col_24_kitchen',
    labelEn: 'Availability of Kitchen / LPG Connection',
    labelHi: 'रसोई घर और एलपीजी/पीएनजी गैस',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Kitchen with LPG/PNG', labelHi: 'रसोई घर (एलपीजी/पीएनजी सहित)', icon: '🍳' },
      { value: 2, labelEn: 'Kitchen without LPG/PNG', labelHi: 'रसोई घर (एलपीजी/पीएनजी रहित)', icon: '🍳' },
      { value: 3, labelEn: 'No Separate Kitchen with LPG/PNG', labelHi: 'अलग रसोई घर नहीं (एलपीजी/पीएनजी सहित)', icon: '🥘' },
      { value: 4, labelEn: 'No Separate Kitchen without LPG/PNG', labelHi: 'अलग रसोई घर नहीं (एलपीजी/पीएनजी रहित)', icon: '🥘' },
      { value: 5, labelEn: 'Cooking in Open with LPG/PNG', labelHi: 'खुले में खाना पकाना (एलपीजी/पीएनजी सहित)', icon: '⛺' },
      { value: 6, labelEn: 'Cooking in Open without LPG/PNG', labelHi: 'खुले में खाना पकाना (एलपीजी/पीएनजी रहित)', icon: '⛺' },
      { value: 7, labelEn: 'No Cooking Done', labelHi: 'कोई खाना नहीं पकाया जाता', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 25,
    key: 'col_25_fuel',
    labelEn: 'Main Fuel Used for Cooking',
    labelHi: 'खाना पकाने के लिए मुख्य ईंधन',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Firewood', labelHi: 'जलाऊ लकड़ी', icon: '🪵' },
      { value: 2, labelEn: 'Crop Residue', labelHi: 'फसल का अवशेष', icon: '🌾' },
      { value: 3, labelEn: 'Cowdung Cake', labelHi: 'उपला', icon: '🐄' },
      { value: 4, labelEn: 'Coal/Lignite/Charcoal', labelHi: 'पक्का कोयला', icon: '⬛' },
      { value: 5, labelEn: 'Kerosene', labelHi: 'मिट्टी का तेल', icon: '🪔' },
      { value: 6, labelEn: 'LPG/PNG', labelHi: 'एलपीजी/पीएनजी', icon: '🔵' },
      { value: 7, labelEn: 'Electricity', labelHi: 'बिजली', icon: '⚡' },
      { value: 8, labelEn: 'Bio-gas/Gobar Gas', labelHi: 'गोबर गैस', icon: '🍃' },
      { value: 9, labelEn: 'Solar Energy', labelHi: 'सौर ऊर्जा', icon: '☀️' },
      { value: 0, labelEn: 'Any Other', labelHi: 'अन्य', icon: '📦' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && f.col_24_kitchen !== 7,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999 && f.col_24_kitchen !== 7
  },
  {
    col: 26,
    key: 'col_26_radio',
    labelEn: 'Radio / Transistor',
    labelHi: 'रेडियो/ट्रांजिस्टर',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Traditional Radio Set', labelHi: 'परंपरागत रेडियो सेट', icon: '📻' },
      { value: 2, labelEn: 'On Mobile/Smartphone', labelHi: 'मोबाइल/स्मार्टफोन पर', icon: '📱' },
      { value: 3, labelEn: 'On other device', labelHi: 'अन्य उपकरण', icon: '💻' },
      { value: 4, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 27,
    key: 'col_27_tv',
    labelEn: 'Television',
    labelHi: 'टेलीविजन',
    type: 'select',
    options: [
      { value: 1, labelEn: 'DD Free Dish', labelHi: 'दूरदर्शन मुफ्त डिश', icon: '📡' },
      { value: 2, labelEn: 'Other DTH/Dish', labelHi: 'अन्य डीटीएच/डिश', icon: '📡' },
      { value: 3, labelEn: 'Cable Connection', labelHi: 'केबल कनेक्शन', icon: '🔌' },
      { value: 4, labelEn: 'Other', labelHi: 'अन्य', icon: '📺' },
      { value: 5, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 28,
    key: 'col_28_internet',
    labelEn: 'Internet Facility',
    labelHi: 'इंटरनेट सुविधा',
    type: 'select',
    options: [
      { value: 1, labelEn: 'On Laptop/Computer', labelHi: 'लैपटॉप/कंप्यूटर में', icon: '💻' },
      { value: 2, labelEn: 'On Mobile/Smartphone', labelHi: 'मोबाइल/स्मार्टफोन में', icon: '📱' },
      { value: 3, labelEn: 'On other device', labelHi: 'अन्य', icon: '📺' },
      { value: 4, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 29,
    key: 'col_29_computer',
    labelEn: 'Laptop / Computer',
    labelHi: 'लैपटॉप/कंप्यूटर',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Yes', labelHi: 'हां', icon: '💻' },
      { value: 2, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 30,
    key: 'col_30_phone',
    labelEn: 'Telephone / Mobile Phone',
    labelHi: 'टेलीफोन और मोबाइल फोन',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Landline only', labelHi: 'केवल लैंडलाइन', icon: '☎️' },
      { value: 2, labelEn: 'Mobile Smartphone only', labelHi: 'केवल मोबाइल स्मार्टफोन', icon: '📱' },
      { value: 3, labelEn: 'Other basic mobile', labelHi: 'अन्य बुनियादी मोबाइल', icon: '📟' },
      { value: 4, labelEn: 'Both', labelHi: 'दोनों', icon: '🔌' },
      { value: 5, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 31,
    key: 'col_31_vehicle_2w',
    labelEn: 'Bicycle / Scooter / Motorcycle',
    labelHi: 'साइकिल और स्कूटर/मोटरसाइकिल',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Bicycle', labelHi: 'साइकिल', icon: '🚲' },
      { value: 2, labelEn: 'Scooter/Motorcycle/Moped', labelHi: 'स्कूटर/मोटरसाइकिल/मोपेड', icon: '🛵' },
      { value: 3, labelEn: 'Both', labelHi: 'दोनों', icon: '🔌' },
      { value: 4, labelEn: 'None', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 32,
    key: 'col_32_car',
    labelEn: 'Car / Jeep / Van',
    labelHi: 'कार/जीप/वैन',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Yes', labelHi: 'हां', icon: '🚗' },
      { value: 2, labelEn: 'No', labelHi: 'नहीं', icon: '🚫' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 33,
    key: 'col_33_cereal',
    labelEn: 'Main Cereal Consumed',
    labelHi: 'मुख्य अनाज/खाद्यान्न',
    type: 'select',
    options: [
      { value: 1, labelEn: 'Rice', labelHi: 'चावल', icon: '🍚' },
      { value: 2, labelEn: 'Wheat', labelHi: 'गेहूं', icon: '🌾' },
      { value: 3, labelEn: 'Jowar', labelHi: 'ज्वार', icon: '🌾' },
      { value: 4, labelEn: 'Bajra', labelHi: 'बाजरा', icon: '🌾' },
      { value: 5, labelEn: 'Maize', labelHi: 'मक्का', icon: '🌽' },
      { value: 6, labelEn: 'Any Other', labelHi: 'अन्य', icon: '📦' }
    ],
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999,
    required: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  },
  {
    col: 34,
    key: 'col_34_mobile',
    labelEn: 'Mobile Number (for contact)',
    labelHi: 'मोबाइल नंबर (केवल संपर्क के लिए)',
    type: 'text',
    visibleWhen: (f) => (f.col_7_use === 1 || f.col_7_use === 2) && f.col_9_household_no !== 999
  }
];

export function getFieldByKey(key: string): HLOFieldDefinition | undefined {
  return HLO_SCHEDULE.find(f => f.key === key);
}

export function getFieldByCol(col: number): HLOFieldDefinition | undefined {
  return HLO_SCHEDULE.find(f => f.col === col);
}

/** Legacy mapping helper for backwards compatibility. */
export function migrateLegacySymbolData(legacyData: any): any {
  const data = { ...legacyData };
  
  // Floor, wall, roof mapping
  if (data.col_6_wall_material !== undefined && data.col_5_wall === undefined) {
    data.col_5_wall = data.col_6_wall_material;
  }
  if (data.col_7_roof_material !== undefined && data.col_6_roof === undefined) {
    data.col_6_roof = data.col_7_roof_material;
  }
  
  // Use mapping: legacy col_4_use_type is now col_7_use
  if (data.col_4_use_type !== undefined && data.col_7_use === undefined) {
    data.col_7_use = data.col_4_use_type;
  }
  
  // Families mapping: legacy col_9_family_count maps to col_9_household_no (seq) 
  // and col_10_persons (persons count is new, default 1).
  if (data.col_9_family_count !== undefined) {
    if (data.col_9_household_no === undefined) data.col_9_household_no = 1;
    if (data.col_10_persons === undefined) data.col_10_persons = data.col_9_family_count;
  }

  // Head name mapping: col_10_head_name / head_of_household → col_11_head_name
  if (data.col_10_head_name !== undefined && data.col_11_head_name === undefined) {
    data.col_11_head_name = data.col_10_head_name;
  } else if (data.head_of_household !== undefined && data.col_11_head_name === undefined) {
    data.col_11_head_name = data.head_of_household;
  }

  // Dwelling rooms: col_11_total_rooms → col_15_rooms
  if (data.col_11_total_rooms !== undefined && data.col_15_rooms === undefined) {
    data.col_15_rooms = data.col_11_total_rooms;
  }

  // Ownership: col_12_ownership → col_14_ownership
  if (data.col_12_ownership !== undefined && data.col_14_ownership === undefined) {
    data.col_14_ownership = data.col_12_ownership;
  }

  // Water source: col_18_water_source → col_17_water_source
  if (data.col_18_water_source !== undefined && data.col_17_water_source === undefined) {
    data.col_17_water_source = data.col_18_water_source;
  }
  if (data.col_18a_water_location !== undefined && data.col_18_water_location === undefined) {
    data.col_18_water_location = data.col_18a_water_location;
  }

  // Electricity
  if (data.col_19_electricity !== undefined && data.col_19_lighting === undefined) {
    data.col_19_lighting = data.col_19_electricity ? 1 : 6;
  }

  // Bathroom: col_22_bathroom → col_23_bathing
  if (data.col_22_bathroom !== undefined && data.col_23_bathing === undefined) {
    data.col_23_bathing = data.col_22_bathroom;
  }

  // Assets mapping
  if (data.asset_radio !== undefined && data.col_26_radio === undefined) {
    data.col_26_radio = data.asset_radio ? 1 : 4;
  }
  if (data.asset_tv !== undefined && data.col_27_tv === undefined) {
    data.col_27_tv = data.asset_tv ? 3 : 5; // Default to cable or no
  }
  if (data.asset_computer_internet !== undefined && data.col_28_internet === undefined) {
    data.col_28_internet = data.asset_computer_internet ? 1 : 4;
  }
  if (data.asset_laptop !== undefined && data.col_29_computer === undefined) {
    data.col_29_computer = data.asset_laptop ? 1 : 2;
  }
  if (data.asset_mobile !== undefined && data.col_30_phone === undefined) {
    data.col_30_phone = data.asset_mobile ? 2 : 5;
  }
  if (data.asset_bicycle !== undefined && data.col_31_vehicle_2w === undefined) {
    data.col_31_vehicle_2w = data.asset_bicycle ? 1 : 4;
  }
  if (data.asset_scooter_motorcycle !== undefined && data.col_31_vehicle_2w === undefined) {
    data.col_31_vehicle_2w = data.asset_scooter_motorcycle ? 2 : 4;
  }
  if (data.asset_car_jeep_van !== undefined && data.col_32_car === undefined) {
    data.col_32_car = data.asset_car_jeep_van ? 1 : 2;
  }
  if (data.col_34_mobile_number !== undefined && data.col_34_mobile === undefined) {
    data.col_34_mobile = data.col_34_mobile_number;
  }

  return data;
}
