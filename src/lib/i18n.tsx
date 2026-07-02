import React, { createContext, useContext, useState } from 'react';

export type Language = 'en' | 'hi' | 'mr' | 'gu' | 'kn' | 'ta' | 'te' | 'ml';

export interface TranslationDict {
  // Navigation & General
  brand: string;
  subBrand: string;
  myMaps: string;
  sharedMaps: string;
  liveDrafts: string;
  newMap: string;
  searchPlaceholder: string;
  helpGroup: string;
  support: string;
  profile: string;
  signOut: string;
  back: string;
  next: string;
  cancel: string;
  saveExit: string;
  loading: string;
  error: string;
  submit: string;

  // Landing Page / Marketing
  landingTitle: string;
  landingSubtitle: string;
  startCreating: string;

  // Dashboard Page
  welcome: string;
  projectLimitWarning: string;
  paymentStatus: string;
  paid: string;
  unpaid: string;
  noProjects: string;
  createNewMapTitle: string;
  enterHlbNumber: string;
  hlbPlaceholder: string;

  // Workspace Page
  step1Title: string;
  step2Title: string;
  step3Title: string;
  step4Title: string;
  step5Title: string;
  step1Desc: string;
  step2Desc: string;
  step3Desc: string;
  step4Desc: string;
  step5Desc: string;
  
  // Landmark/Tools Panel
  addLandmark: string;
  selectLandmarkType: string;
  deleteSelected: string;
  drawFarmland: string;
  drawWater: string;
  drawForest: string;
  drawBlock: string;
  drawRoad: string;
  drawBoundary: string;
  generateRoute: string;
  clearAll: string;
  
  // Preview / Export
  previewTitle: string;
  exportPdf: string;
  sheetSize: string;
  orientation: string;
  rotation: string;
  inkMode: string;
  hideRoadNames: string;
  hideHouseNumbers: string;
  watermark: string;
  downloading: string;
}

const translations: Record<Language, TranslationDict> = {
  en: {
    brand: "NakshaBot",
    subBrand: "Census 2027 Mapping",
    myMaps: "My Maps",
    sharedMaps: "Shared Maps",
    liveDrafts: "Live Survey Drafts",
    newMap: "+ New Map",
    searchPlaceholder: "Search maps...",
    helpGroup: "Help Group",
    support: "Support",
    profile: "Profile",
    signOut: "Sign Out",
    back: "Back",
    next: "Next",
    cancel: "Cancel",
    saveExit: "Save & Exit",
    loading: "Loading...",
    error: "Error",
    submit: "Submit",
    landingTitle: "Census 2027 HLB Map Maker Online",
    landingSubtitle: "Generate your official Nazri Naksha layout maps instantly with AI.",
    startCreating: "Start Creating Map",
    welcome: "Welcome",
    projectLimitWarning: "Maximum project limit reached",
    paymentStatus: "Payment",
    paid: "Paid",
    unpaid: "Unpaid / Free",
    noProjects: "No maps created yet. Click '+ New Map' to begin!",
    createNewMapTitle: "Create New Map",
    enterHlbNumber: "Enter HLB (House Listing Block) Number",
    hlbPlaceholder: "e.g., HLB 123",
    step1Title: "Boundary",
    step2Title: "Roads",
    step3Title: "Houses",
    step4Title: "Blocks",
    step5Title: "Numbering",
    step1Desc: "Mark the boundary of your enumeration block.",
    step2Desc: "Draw main roads, streets, and lanes.",
    step3Desc: "Place residential (pucca/kutcha) and commercial buildings.",
    step4Desc: "Define layout blocks and agricultural fields.",
    step5Desc: "Assign sequential house numbers and verify layout flow.",
    addLandmark: "Add Landmark",
    selectLandmarkType: "Select Landmark Type",
    deleteSelected: "Delete Selected",
    drawFarmland: "Draw Farm/Field",
    drawWater: "Draw Water Body",
    drawForest: "Draw Forest/Trees",
    drawBlock: "Draw Block Area",
    drawRoad: "Draw Road",
    drawBoundary: "Draw Boundary",
    generateRoute: "Generate Serpentine Route",
    clearAll: "Clear All",
    previewTitle: "Print Preview & Layout",
    exportPdf: "Export PDF",
    sheetSize: "Sheet Size",
    orientation: "Orientation",
    rotation: "Map Rotation",
    inkMode: "Color Mode",
    hideRoadNames: "Hide road names",
    hideHouseNumbers: "Hide house numbers",
    watermark: "Watermark",
    downloading: "Preparing your download..."
  },
  hi: {
    brand: "नक्शाबॉट",
    subBrand: "जनगणना 2027 मैपिंग",
    myMaps: "मेरे नक़्शे",
    sharedMaps: "साझा नक़्शे",
    liveDrafts: "लाइव सर्वे ड्राफ्ट",
    newMap: "+ नया नक्शा",
    searchPlaceholder: "नक्शा खोजें...",
    helpGroup: "सहायता समूह",
    support: "सहयोग",
    profile: "प्रोफ़ाइल",
    signOut: "लॉग आउट",
    back: "पीछे",
    next: "आगे",
    cancel: "रद्द करें",
    saveExit: "सहेजें और बाहर निकलें",
    loading: "लोड हो रहा है...",
    error: "त्रुटि",
    submit: "जमा करें",
    landingTitle: "जनगणना 2027 HLB नक्शा निर्माता ऑनलाइन",
    landingSubtitle: "एआई के साथ तुरंत अपने आधिकारिक नजरी नक्शा लेआउट नक्शे बनाएं।",
    startCreating: "नक्शा बनाना शुरू करें",
    welcome: "स्वागत है",
    projectLimitWarning: "अधिकतम परियोजना सीमा समाप्त",
    paymentStatus: "भुगतान",
    paid: "भुगतान किया",
    unpaid: "अवैतनिक / मुफ़्त",
    noProjects: "अभी तक कोई नक्शा नहीं बनाया गया है। शुरू करने के लिए '+ नया नक्शा' पर क्लिक करें!",
    createNewMapTitle: "नया नक्शा बनाएं",
    enterHlbNumber: "HLB (हाउस लिस्टिंग ब्लॉक) नंबर दर्ज करें",
    hlbPlaceholder: "जैसे, HLB 123",
    step1Title: "सीमा",
    step2Title: "सड़कें",
    step3Title: "मकान",
    step4Title: "ब्लॉक",
    step5Title: "नंबरिंग",
    step1Desc: "अपने ब्लॉक की बाहरी सीमा चिह्नित करें।",
    step2Desc: "मुख्य सड़कें, गलियां और मार्ग बनाएं।",
    step3Desc: "आवासीय (पक्का/कच्चा) और व्यावसायिक घर रखें।",
    step4Desc: "लेआउट ब्लॉक और कृषि क्षेत्र/खेत चिह्नित करें।",
    step5Desc: "क्रमवार मकान नंबर असाइन करें और लेआउट प्रवाह सत्यापित करें।",
    addLandmark: "लैंडमार्क जोड़ें",
    selectLandmarkType: "लैंडमार्क प्रकार चुनें",
    deleteSelected: "चयनित हटाएं",
    drawFarmland: "खेत/मैदान बनाएं",
    drawWater: "जलाशय बनाएं",
    drawForest: "जंगल/वृक्ष बनाएं",
    drawBlock: "ब्लॉक क्षेत्र बनाएं",
    drawRoad: "सड़क बनाएं",
    drawBoundary: "सीमा बनाएं",
    generateRoute: "सर्पाकार मार्ग बनाएं",
    clearAll: "सभी साफ़ करें",
    previewTitle: "प्रिंट पूर्वावलोकन और लेआउट",
    exportPdf: "पीडीएफ निर्यात करें",
    sheetSize: "शीट का आकार",
    orientation: "दिशा (अभिमुखता)",
    rotation: "नक्शा घुमाव",
    inkMode: "रंग मोड",
    hideRoadNames: "सड़कों के नाम छिपाएं",
    hideHouseNumbers: "मकान नंबर छिपाएं",
    watermark: "वॉटरमार्क",
    downloading: "डाउनलोड तैयार किया जा रहा है..."
  },
  mr: {
    brand: "नकाशाबॉट",
    subBrand: "जनगणना 2027 मॅपिंग",
    myMaps: "माझे नकाशे",
    sharedMaps: "सामायिक नकाशे",
    liveDrafts: "लाइव सर्व्हे ड्राफ्ट",
    newMap: "+ नवीन नकाशा",
    searchPlaceholder: "नकाशा शोधा...",
    helpGroup: "मदत गट",
    support: "सहकार्य",
    profile: "प्रोफाइल",
    signOut: "लॉग आउट",
    back: "मागे",
    next: "पुढे",
    cancel: "रद्द करा",
    saveExit: "जतन करा आणि बाहेर पडा",
    loading: "लोड होत आहे...",
    error: "त्रुटी",
    submit: "सबमिट करा",
    landingTitle: "जनगणना 2027 HLB नकाशा निर्माता ऑनलाइन",
    landingSubtitle: "AI च्या सहाय्याने तुमचे अधिकृत नझरी नकाशा लेआउट नकाशे त्वरित तयार करा.",
    startCreating: "नकाशा तयार करण्यास प्रारंभ करा",
    welcome: "स्वागत आहे",
    projectLimitWarning: "कमाल प्रकल्प मर्यादा गाठली",
    paymentStatus: "पेमेंट",
    paid: "पेड",
    unpaid: "अनपेड / मोफत",
    noProjects: "अद्याप कोणतेही नकाशे तयार केलेले नाहीत. प्रारंभ करण्यासाठी '+ नवीन नकाशा' वर क्लिक करा!",
    createNewMapTitle: "नवीन नकाशा तयार करा",
    enterHlbNumber: "HLB (हाऊस लिस्टिंग ब्लॉक) क्रमांक प्रविष्ट करा",
    hlbPlaceholder: "उदा., HLB 123",
    step1Title: "सीमा",
    step2Title: "रस्ते",
    step3Title: "घरे",
    step4Title: "ब्लॉक",
    step5Title: "नंबरिंग",
    step1Desc: "तुमच्या ब्लॉकची बाह्य सीमा चिन्हांकित करा.",
    step2Desc: "मुख्य रस्ते, गल्ल्या आणि मार्ग काढा.",
    step3Desc: "निवासी (पक्के/कच्चे) आणि व्यावसायिक इमारती ठेवा.",
    step4Desc: "लेआउट ब्लॉक आणि शेती क्षेत्र चिन्हांकित करा.",
    step5Desc: "क्रमाने घर क्रमांक द्या आणि प्रवाह तपासा.",
    addLandmark: "लँडमार्क जोडा",
    selectLandmarkType: "लँडमार्क प्रकार निवडा",
    deleteSelected: "निवडलेले हटवा",
    drawFarmland: "शेत/मैदान काढा",
    drawWater: "जलाशय काढा",
    drawForest: "जंगल/झाडे काढा",
    drawBlock: "ब्लॉक क्षेत्र काढा",
    drawRoad: "रस्ता काढा",
    drawBoundary: "सीमा काढा",
    generateRoute: "सर्पाकार मार्ग तयार करा",
    clearAll: "सर्व साफ करा",
    previewTitle: "प्रिंट पूर्वावलोकन आणि लेआउट",
    exportPdf: "पीडीएफ निर्यात करा",
    sheetSize: "शीटचा आकार",
    orientation: "अभिमुखता (दिशा)",
    rotation: "नकाशा फिरवा",
    inkMode: "रंग मोड",
    hideRoadNames: "रस्त्यांची नावे लपवा",
    hideHouseNumbers: "घर क्रमांक लपवा",
    watermark: "वॉटरमार्क",
    downloading: "डाउनलोड तयार करत आहे..."
  },
  gu: {
    brand: "નકશાબોટ",
    subBrand: "જનગણના 2027 મેપિંગ",
    myMaps: "મારા નકશાઓ",
    sharedMaps: "શેર કરેલ નકશાઓ",
    liveDrafts: "લાઇવ સર્વે ડ્રાફ્ટ",
    newMap: "+ નવો નકશો",
    searchPlaceholder: "નકશો શોધો...",
    helpGroup: "મદદ જૂથ",
    support: "સપોર્ટ",
    profile: "પ્રોફાઇલ",
    signOut: "લોગ આઉટ",
    back: "પાછળ",
    next: "આગળ",
    cancel: "રદ કરો",
    saveExit: "સાચવો અને બહાર નીકળો",
    loading: "લોડ થઈ રહ્યું છે...",
    error: "ભૂલ",
    submit: "સબમિટ કરો",
    landingTitle: "જનગણના 2027 HLB નકશા નિર્માતા ઓનલાઇન",
    landingSubtitle: "AI સાથે તમારા સત્તાવાર નઝરી નકશા લેઆઉટ નકશાઓ તરત જ બનાવો.",
    startCreating: "નકશો બનાવવાનું શરૂ કરો",
    welcome: "સ્વાગત છે",
    projectLimitWarning: "મહત્તમ પ્રોજેક્ટ મર્યાదా સમાપ્ત",
    paymentStatus: "ચુકવણી",
    paid: "ચૂકવેલ",
    unpaid: "નહીં ચૂકવેલ / મફత",
    noProjects: "હજી સુધી કોઈ નकશા બનાવવામાં આવ્યા નથી. શરૂ કરવા માટે '+ નવો નકશો' પર ક્લિક કરો!",
    createNewMapTitle: "નવો નકશો બનાવો",
    enterHlbNumber: "HLB (હાઉસ લિસ્ટિંગ બ્લોક) નંબર દાખल કરો",
    hlbPlaceholder: "દા.ત., HLB 123",
    step1Title: "સીમા",
    step2Title: "રસ્તાઓ",
    step3Title: "મકાનો",
    step4Title: "બ્લોક",
    step5Title: "નંબરિંગ",
    step1Desc: "તમારા બ્લોકની બહારની સીમા રેખાંકિત કરો.",
    step2Desc: "મુખ્ય રસ્તાઓ, શેરીઓ અને ગલીઓ બનાવો.",
    step3Desc: "રહેણાંક (પાકા/કાચા) અને વ્યવસાયિક ઘરો મૂકો.",
    step4Desc: "લેઆઉટ બ્લોક અને ખેતર/મેદાન રેખાંકિત કરો.",
    step5Desc: "ક્રમવાર ઘર નંબર આપો અને પ્રવાહ તપાસો.",
    addLandmark: "લેન્ડમાર્ક ઉમેરો",
    selectLandmarkType: "લેન્ડમાર્ક પ્રકાર પસંદ કરો",
    deleteSelected: "પસંદ કરેલું કાઢી નાખો",
    drawFarmland: "ખેતર/મેદાન બનાવો",
    drawWater: "જળાશય બનાવો",
    drawForest: "જંગલ/વૃક્ષો બનાવો",
    drawBlock: "બ્લોક વિસ્તાર બનાવો",
    drawRoad: "રસ્તો બનાવો",
    drawBoundary: "સીમા બનાવો",
    generateRoute: "સર્પાકાર માર્ગ બનાવો",
    clearAll: "બધું સાફ કરો",
    previewTitle: "પ્રિન્ટ પૂર્વાવલોકન અને લેઆઉટ",
    exportPdf: "પીડીએફ નિકાસ કરો",
    sheetSize: "શીટ સાઈઝ",
    orientation: "દિશા (અભિમુખતા)",
    rotation: "નકશો ફેરવો",
    inkMode: "રંગ મોડ",
    hideRoadNames: "રસ્તાના નામ છુપાવો",
    hideHouseNumbers: "ઘર નંબર છુપાવો",
    watermark: "વોટરમાર્ક",
    downloading: "ડાઉનલોડ તૈયાર થઈ રહ્યું છે..."
  },
  kn: {
    brand: "ನಕ್ಷಾಬಾಟ್",
    subBrand: "ಜನಗಣತಿ 2027 ಮ್ಯಾಪಿಂಗ್",
    myMaps: "ನನ್ನ ನಕ್ಷೆಗಳು",
    sharedMaps: "ಹಂಚಿಕೊಳ್ಳಲಾದ ನಕ್ಷೆಗಳು",
    liveDrafts: "ಲೈವ್ ಸಮೀಕ್ಷೆ ಕರಡುಗಳು",
    newMap: "+ ಹೊಸ ನಕ್ಷೆ",
    searchPlaceholder: "ನಕ್ಷೆಗಳನ್ನು ಹುಡುಕಿ...",
    helpGroup: "ಸಹಾಯ ಗುಂಪು",
    support: "ಬೆಂಬಲ",
    profile: "ಪ್ರೊಫೈಲ್",
    signOut: "ಸೈನ್ ಔಟ್",
    back: "ಹಿಂದೆ",
    next: "ಮುಂದೆ",
    cancel: "ರದ್ದುಮಾಡಿ",
    saveExit: "ಉಳಿಸಿ ಮತ್ತು ನಿರ್ಗಮಿಸಿ",
    loading: "ಲೋಡ್ ಆಗುತ್ತಿದೆ...",
    error: "ದೋಷ",
    submit: "ಸಲ್ಲಿಸು",
    landingTitle: "ಜನಗಣತಿ 2027 HLB ನಕ್ಷೆ ತಯಾರಕ ಆನ್‌ಲೈನ್",
    landingSubtitle: "AI ನೊಂದಿಗೆ ನಿಮ್ಮ ಅಧಿಕೃತ ನಜ್ರಿ ನಕ್ಷೆ ಲೇಔಟ್ ನಕ್ಷೆಗಳನ್ನು ತಕ್ಷಣವೇ ರಚಿಸಿ.",
    startCreating: "ನಕ್ಷೆ ರಚಿಸಲು ಪ್ರಾರಂಭಿಸಿ",
    welcome: "ಸ್ವಾಗತ",
    projectLimitWarning: "ಗರಿಷ್ಠ ಯೋಜನಾ ಮಿತಿ ತಲುಪಿದೆ",
    paymentStatus: "ಪಾವತಿ",
    paid: "ಪಾವತಿಸಲಾಗಿದೆ",
    unpaid: "ಪಾವತಿಸದ / ಉಚಿತ",
    noProjects: "ಇನ್ನೂ ಯಾವುದೇ ನಕ್ಷೆಗಳನ್ನು ರಚಿಸಲಾಗಿಲ್ಲ. ಪ್ರಾರಂಭಿಸಲು '+ ಹೊಸ ನಕ್ಷೆ' ಕ್ಲಿಕ್ ಮಾಡಿ!",
    createNewMapTitle: "ಹೊಸ ನಕ್ಷೆ ರಚಿಸಿ",
    enterHlbNumber: "HLB ಸಂಖ್ಯೆಯನ್ನು ನಮೂದಿಸಿ",
    hlbPlaceholder: "ಉದಾ., HLB 123",
    step1Title: "ಗಡಿ",
    step2Title: "ರಸ್ತೆಗಳು",
    step3Title: "ಮನೆಗಳು",
    step4Title: "ಬ್ಲಾಕ್‌ಗಳು",
    step5Title: "ನಂಬರಿಂಗ್",
    step1Desc: "ನಿಮ್ಮ ಬ್ಲಾಕ್ ಗಡಿಯನ್ನು ಗುರುತಿಸಿ.",
    step2Desc: "ಮುಖ್ಯ ರಸ್ತೆಗಳು ಮತ್ತು ಗಲ್ಲಿಗಳನ್ನು ಎಳೆಯಿರಿ.",
    step3Desc: "ವಸತಿ ಮತ್ತು ವಾಣಿಜ್ಯ ಮನೆಗಳನ್ನು ಇರಿಸಿ.",
    step4Desc: "ಲೇಔಟ್ ಬ್ಲಾಕ್‌ಗಳು ಮತ್ತು ಕೃಷಿ ಕ್ಷೇತ್ರಗಳನ್ನು ಗುರುತಿಸಿ.",
    step5Desc: "ಕ್ರಮವಾಗಿ ಮನೆ ಸಂಖ್ಯೆಗಳನ್ನು ನೀಡಿ ಮತ್ತು ಪರಿಶೀಲಿಸಿ.",
    addLandmark: "ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಸೇರಿಸಿ",
    selectLandmarkType: "ಲ್ಯಾಂಡ್‌ಮಾರ್ಕ್ ಪ್ರಕಾರವನ್ನು ಆರಿಸಿ",
    deleteSelected: "ಆಯ್ಕೆಮಾಡಿದ್ದನ್ನು ಅಳಿಸಿ",
    drawFarmland: "ಹೊಲ/ಮೈದಾನ ಎಳೆಯಿರಿ",
    drawWater: "ಜಲಮೂಲ ಎಳೆಯಿರಿ",
    drawForest: "ಅರಣ್ಯ/ಮರಗಳು ಎಳೆಯಿರಿ",
    drawBlock: "ಬ್ಲಾಕ್ ಪ್ರದೇಶ ಎಳೆಯಿರಿ",
    drawRoad: "ರಸ್ತೆ ಎಳೆಯಿರಿ",
    drawBoundary: "ಗಡಿ ಎಳೆಯಿರಿ",
    generateRoute: "ಸರ್ಪಾಕಾರದ ಮಾರ್ಗ ರಚಿಸಿ",
    clearAll: "ಎಲ್ಲವನ್ನೂ ತೆರವುಗೊಳಿಸಿ",
    previewTitle: "ಮುದ್ರಣ ಮುನ್ನೋಟ ಮತ್ತು ವಿನ್ಯಾಸ",
    exportPdf: "ಪಿಡಿಎಫ್ ರಫ್ತು ಮಾಡಿ",
    sheetSize: "ಹಾಳೆಯ ಗಾತ್ರ",
    orientation: "ದೃಷ್ಟಿಕోನ",
    rotation: "ನಕ್ಷೆ ತಿರುಗುವಿಕೆ",
    inkMode: "ಬಣ್ಣದ ಮೋಡ್",
    hideRoadNames: "ರಸ್ತೆಯ ಹೆಸರುಗಳನ್ನು ಮರೆಮಾಡಿ",
    hideHouseNumbers: "ಮನೆ ಸಂಖ್ಯೆಗಳನ್ನು ಮರೆಮಾಡಿ",
    watermark: "ವಾಟರ್‌ಮಾರ್ಕ್",
    downloading: "ನಿಮ್ಮ ಡೌನ್‌ಲೋಡ್ ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ..."
  },
  ta: {
    brand: "நக்ஷாபாட்",
    subBrand: "மக்கள் தொகை கணக்கெடுப்பு 2027 வரைபடம்",
    myMaps: "எனது வரைபடங்கள்",
    sharedMaps: "பகிரப்பட்ட வரைபடங்கள்",
    liveDrafts: "நேരடி கணக்கெடுப்பு வரைவுகள்",
    newMap: "+ புதிய வரைபடம்",
    searchPlaceholder: "வரைபடங்களைத் தேடுங்கள்...",
    helpGroup: "உதவிக் குழு",
    support: "ஆதரவு",
    profile: "சுயவிவரம்",
    signOut: "வெளியேறு",
    back: "பின்னால்",
    next: "அடுத்து",
    cancel: "ரத்து செய்",
    saveExit: "சேமித்து வெளியேறு",
    loading: "ஏற்றப்படுகிறது...",
    error: "பிழை",
    submit: "சமர்ப்பி",
    landingTitle: "மக்கள் தொகை கணக்கெடுப்பு 2027 HLB வரைபட தயாரிப்பாளர் ஆன்லைன்",
    landingSubtitle: "AI மூலம் உங்கள் அதிகாரப்பூர்வ நஸ்ரி நக்ஷா தள வரைபடங்களை உடனடியாக உருவாக்குங்கள்.",
    startCreating: "வரைபடம் உருவாக்கத் தொடங்குங்கள்",
    welcome: "வரவேற்கிறோம்",
    projectLimitWarning: "அதிகபட்ச திட்ட வரம்பு எటப்பட்டது",
    paymentStatus: "கட்டணம்",
    paid: "செலுத்தப்பட்டது",
    unpaid: "செலுத்தப்படாதது / இலவசம்",
    noProjects: "இன்னும் வரைபடங்கள் எதுவும் உருவாக்கப்படவில்லை. தொடங்க '+ புதிய வரைபடம்' என்பதைக் கிளிக் செய்யவும்!",
    createNewMapTitle: "புதிய வரைபடம் உருவாக்கு",
    enterHlbNumber: "HLB எண்ணை உள்ளிடவும்",
    hlbPlaceholder: "உதாரணமாக, HLB 123",
    step1Title: "எல்லை",
    step2Title: "சாலைகள்",
    step3Title: "வீடுகள்",
    step4Title: "தொகுதிகள்",
    step5Title: "எண் இடுதல்",
    step1Desc: "உங்கள் தொகுதியின் எல்லையைக் குறிக்கவும்.",
    step2Desc: "முக்கிய சாலைகள் மற்றும் தெരുக்களை வரையவும்.",
    step3Desc: "குடியிருப்பு மற்றும் வணிக கட்டிடങ്ങളെ வைக்கவும்.",
    step4Desc: "தள தொகுதிகள் மற்றும் விவசாய நிலங்களைக் குறிக்கவும்.",
    step5Desc: "வரிசையாக வீட்டு எண்களை வழங்கி சரிபார்க்கவும்.",
    addLandmark: "அடையாளக் குறியைச் சேர்",
    selectLandmarkType: "அடையாளக் குறியின் வகையைத் தேர்ந்தெடு",
    deleteSelected: "தேர்ந்தெடுத்ததை நீக்கு",
    drawFarmland: "விவசாய நிலத்தை வரை",
    drawWater: "நீர்நிலையை வரை",
    drawForest: "காடு/மரങ്ങളെ வரை",
    drawBlock: "தொகுதி பகுதியை வரை",
    drawRoad: "சாலையை வரை",
    drawBoundary: "எல்லையை வரை",
    generateRoute: "வளைவு பாதையை உருவாக்கு",
    clearAll: "அனைத்தையும் அழி",
    previewTitle: "அச்சு முன்னோட்டம் & தளம்",
    exportPdf: "PDF ஏற்றுமதி செய்",
    sheetSize: "താൾ அளவு",
    orientation: "அமைப்பு",
    rotation: "வரைபட சுழற்சி",
    inkMode: "வண்ண முறைமை",
    hideRoadNames: "சாலைப் பெயர்களை மறை",
    hideHouseNumbers: "வீட்டு எண்களை மறை",
    watermark: "நீர் முத்திரை",
    downloading: "பதிവிறക്കം തയ്യാറാകുന്നു..."
  },
  te: {
    brand: "నక్షాబాట్",
    subBrand: "జనగణన 2027 మ్యాపింగ్",
    myMaps: "నా మ్యాప్‌లు",
    sharedMaps: "భాగస్వామ్య మ్యాప్‌లు",
    liveDrafts: "లైవ్ సర్వే డ్రాఫ్ట్‌లు",
    newMap: "+ కొత్త మ్యాప్",
    searchPlaceholder: "మ్యాప్‌లను వెతకండి...",
    helpGroup: "సహాయక బృందం",
    support: "మద్దతు",
    profile: "ప్రొఫైల్",
    signOut: "సైన్ అవుట్",
    back: "వెనుకకు",
    next: "ముందుకు",
    cancel: "రద్దు చేయి",
    saveExit: "సేవ్ చేసి నిష్క్రమించు",
    loading: "లోడ్ అవుతోంది...",
    error: "లోపం",
    submit: "సమర్పించు",
    landingTitle: "జనగణన 2027 HLB మ్యాప్ మేకర్ ఆన్‌లైన్",
    landingSubtitle: "AI సహాయంతో మీ అధికారిక నజ్రీ నక్ష లేఅవుట్ మ్యాప్‌లను తక్షణమే సృష్టించండి.",
    startCreating: "మ్యాప్ సృష్టించడం ప్రారంభించండి",
    welcome: "స్వాగతం",
    projectLimitWarning: "గరిష్ట ప్రాజెక్ట్ పరిమితి ముగిసింది",
    paymentStatus: "చెల్లింపు",
    paid: "చెల్లించబడింది",
    unpaid: "చెల్లించని / ఉచితం",
    noProjects: "ఇంకా ఎటువంటి మ్యాప్‌లు సృష్టించబడలేదు. ప్రారంభించడానికి '+ కొత్త మ్యాప్' క్లిక్ చేయండి!",
    createNewMapTitle: "కొత్త మ్యాప్ సృష్టించండి",
    enterHlbNumber: "HLB సంఖ్యను నమోదు చేయండి",
    hlbPlaceholder: "ఉదా., HLB 123",
    step1Title: "సరిహద్దు",
    step2Title: "రోడ్లు",
    step3Title: "ఇళ్ళు",
    step4Title: "బ్లాక్‌లు",
    step5Title: "నంబరింగ్",
    step1Desc: "మీ బ్లాక్ సరిహద్దును గుర్తించండి.",
    step2Desc: "ప్రధాన రోడ్లు మరియు వీధులను గీయండి.",
    step3Desc: "నివాస మరియు వాణిజ్య భవనాలను ఉంచండి.",
    step4Desc: "లేఅవుట్ బ్లాక్‌లు మరియు వ్యవసాయ పొలాలను గుర్తించండి.",
    step5Desc: "వరుసగా ఇంటి నంబర్లను కేటాయించి సరిచూసుకోండి.",
    addLandmark: "ల్యాండ్‌మార్క్ జోడించు",
    selectLandmarkType: "ల్యాండ్‌మార్క్ రకాన్ని ఎంచుకోండి",
    deleteSelected: "ఎంపిక చేసినవి తొలగించు",
    drawFarmland: "పొలం/మైదానం గీయండి",
    drawWater: "జలాశయం గీయండి",
    drawForest: "అడవి/చెట్లు గీయండి",
    drawBlock: "బ్లాక్ ప్రాంతం గీయండి",
    drawRoad: "రోడ్డు గీయండి",
    drawBoundary: "సరిహద్దు గీయండి",
    generateRoute: "సర్ప మార్గం సృష్టించు",
    clearAll: "అన్నీ క్లియర్ చేయి",
    previewTitle: "ప్రింట్ ప్రివ్యూ & లేఅవుట్",
    exportPdf: "PDF ఎగుమతి చేయి",
    sheetSize: "షీట్ సైజు",
    orientation: "దిశ",
    rotation: "మ్యాప్ భ్రమణం",
    inkMode: "రంగు మోడ్",
    hideRoadNames: "రోడ్డు పేర్లను దాచు",
    hideHouseNumbers: "ఇంటి నంబర్లను దాచు",
    watermark: "వాటర్ మార్క్",
    downloading: "డౌన్‌లోడ్ సిద్ధమవుతోంది..."
  },
  ml: {
    brand: "നക്ഷാബോട്ട്",
    subBrand: "ജനസംഖ്യ കണക്കെടുപ്പ് 2027 മാപ്പിംഗ്",
    myMaps: "എന്റെ മാപ്പുകൾ",
    sharedMaps: "പങ്കിട്ട മാപ്പുകൾ",
    liveDrafts: "ലൈവ് സർവേ ഡ്രാഫ്റ്റുകൾ",
    newMap: "+ പുതിയ മാപ്പ്",
    searchPlaceholder: "മാപ്പുകൾ തിരയുക...",
    helpGroup: "സഹായ ഗ്രൂപ്പ്",
    support: "പിന്തുണ",
    profile: "പ്രൊഫൈൽ",
    signOut: "സൈൻ ഔട്ട്",
    back: "പിന്നിലേക്ക്",
    next: "മുന്നോട്ട്",
    cancel: "റദ്ദാക്കുക",
    saveExit: "സേവ് ചെയ്ത് പുറത്തുകടക്കുക",
    loading: "ലോഡുചെയ്യുന്നു...",
    error: "പിശക്",
    submit: "സമർപ്പിക്കുക",
    landingTitle: "ജനസംഖ്യ കണക്കെടുപ്പ് 2027 HLB മാപ്പ് മേക്കർ ഓൺലൈൻ",
    landingSubtitle: "AI സഹായത്തോടെ നിങ്ങളുടെ ഔദ്യോഗിക നസ്രി നക്ഷ ലേഔട്ട് മാപ്പുകൾ ഉടൻ നിർമ്മിക്കുക.",
    startCreating: "മാപ്പ് നിർമ്മിക്കാൻ ആരംഭിക്കുക",
    welcome: "സ്വാഗതം",
    projectLimitWarning: "പരമാവധി പ്രോജക്റ്റ് പരിധി കഴിഞ്ഞു",
    paymentStatus: "പേയ്‌മെന്റ്",
    paid: "പണമടച്ചു",
    unpaid: "പണമടയ്ക്കാത്തത് / സൗജന്യമായി",
    noProjects: "മാപ്പുകളൊന്നും നിർമ്മിച്ചിട്ടില്ല. ആരംഭിക്കാൻ '+ പുതിയ മാപ്പ്' ക്ലിക്ക് ചെയ്യുക!",
    createNewMapTitle: "പുതിയ മാപ്പ് നിർമ്മിക്കുക",
    enterHlbNumber: "HLB നമ്പർ നൽകുക",
    hlbPlaceholder: "ഉദാ., HLB 123",
    step1Title: "അതിർത്തി",
    step2Title: "റോഡുകൾ",
    step3Title: "വീടുകൾ",
    step4Title: "ബ്ലോക്കുകൾ",
    step5Title: "നമ്പറിംഗ്",
    step1Desc: "നിങ്ങളുടെ അതിർത്തി അടയാളപ്പെടുത്തുക.",
    step2Desc: "പ്രധാന റോഡുകളും ഇടവഴികളും വരയ്ക്കുക.",
    step3Desc: "താമസസ്ഥലങ്ങളും വ്യാപാര കെട്ടിടങ്ങളും സ്ഥാപിക്കുക.",
    step4Desc: "ലേഔട്ട് ബ്ലോക്കുകളും കൃഷിയിടങ്ങളും അടയാളപ്പെടുത്തുക.",
    step5Desc: "ക്രമമായി വീട്ടു നമ്പറുകൾ നൽകി പരിശോധിക്കുക.",
    addLandmark: "അടയാളം ചേർക്കുക",
    selectLandmarkType: "അടയാളത്തിന്റെ തരം തിരഞ്ഞെടുക്കുക",
    deleteSelected: "തിരഞ്ഞെടുത്തവ ഇല്ലാതാക്കുക",
    drawFarmland: "കൃഷിയിടം/വയൽ വരയ്ക്കുക",
    drawWater: "ജലാശയം വരയ്ക്കുക",
    drawForest: "കാട്/മരങ്ങൾ വരയ്ക്കുക",
    drawBlock: "ബ്ലോക്ക് പ്രദേശം വരയ്ക്കുക",
    drawRoad: "റോഡ് വരയ്ക്കുക",
    drawBoundary: "അതിർത്തി വരയ്ക്കുക",
    generateRoute: "വളഞ്ഞ പാത നിർമ്മിക്കുക",
    clearAll: "എല്ലാം മായ്ക്കുക",
    previewTitle: "പ്രിന്റ് പ്രിവ്യൂ & ലേഔട്ട്",
    exportPdf: "PDF കയറ്റുമതി ചെയ്യുക",
    sheetSize: "ഷീറ്റ് സൈസ്",
    orientation: "അഭിമുഖീകരണം",
    rotation: "മാപ്പ് തിരിക്കൽ",
    inkMode: "കളർ മോഡ്",
    hideRoadNames: "റോഡ് പേരുകൾ മറയ്ക്കുക",
    hideHouseNumbers: "വീട്ടു നമ്പറുകൾ മറയ്ക്കുക",
    watermark: "വാട്ടർമാർക്ക്",
    downloading: "ഡൗൺലോഡ് തയ്യാറാകുന്നു..."
  }
};

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof TranslationDict) => string;
}

const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('nakshabot_language');
    if (saved === 'en' || saved === 'hi' || saved === 'mr' || saved === 'gu' || saved === 'kn' || saved === 'ta' || saved === 'te' || saved === 'ml') {
      return saved as Language;
    }
    const browserLang = navigator.language.slice(0, 2);
    if (browserLang === 'hi') return 'hi';
    if (browserLang === 'mr') return 'mr';
    if (browserLang === 'gu') return 'gu';
    if (browserLang === 'kn') return 'kn';
    if (browserLang === 'ta') return 'ta';
    if (browserLang === 'te') return 'te';
    if (browserLang === 'ml') return 'ml';
    return 'en';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('nakshabot_language', lang);
  };

  const t = (key: keyof TranslationDict): string => {
    return translations[language][key] || translations['en'][key] || String(key);
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useTranslation must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageSelector: React.FC = () => {
  const { language, setLanguage } = useTranslation();

  return (
    <div className="relative inline-block text-left">
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as Language)}
        className="block w-full bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-orange-500 focus:border-orange-500 cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <option value="en">English (EN)</option>
        <option value="hi">हिंदी (HI)</option>
        <option value="mr">मराठी (MR)</option>
        <option value="gu">ગુજરાતી (GU)</option>
        <option value="kn">ಕನ್ನಡ (KN)</option>
        <option value="ta">தமிழ் (TA)</option>
        <option value="te">తెలుగు (TE)</option>
        <option value="ml">മലയാളം (ML)</option>
      </select>
    </div>
  );
};
