import React from 'react';

export interface SeoArticle {
  id: string;
  url: string;
  title: string;
  metaDescription: string;
  h1: string;
  schema?: string;
  content: string; // HTML string for innerHTML to keep this file manageable
}

export const seoArticles: SeoArticle[] = [
  {
    id: 'nazri-naksha-kaise-banaye',
    url: '/nazri-naksha-kaise-banaye',
    title: 'Nazri Naksha Kaise Banaye — Census 2027 Complete Guide Hindi',
    metaDescription: 'Nazri naksha banane ka tarika step by step. HLB map kaise banaye census 2027 ke liye. Online tool se 15 minute mein ready. Free guide Hindi mein.',
    h1: 'Nazri Naksha Kaise Banaye — पूरी जानकारी हिंदी में',
    schema: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Nazri Naksha kya hota hai?",
          "acceptedAnswer": { "@type": "Answer", "text": "Nazri Naksha ek notional sketch map hai jo Census mein block ki boundary, roads, aur buildings ko darshata hai." }
        },
        {
          "@type": "Question",
          "name": "HLB map kaise banaye census 2027 ke liye?",
          "acceptedAnswer": { "@type": "Answer", "text": "Aap NakshaBot tool ka use karke apna HLB map 15 minute mein online bana sakte hain." }
        }
      ]
    }),
    content: `
      <p class="lead">Census 2027 में प्रत्येक प्रगणक को अपने HLB (Houselisting Block) का एक nazri naksha बनाना होता है। यह एक notional sketch map है जिसमें block की boundary, सड़कें, मकान और अन्य geographical features दर्शाए जाते हैं।</p>
      <h2>Nazri Naksha क्या होता है?</h2>
      <div class="definition-box bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl my-8 shadow-sm">
        <p class="m-0 font-medium text-slate-800">
          <strong>Nazri Naksha (नजरी नक्शा)</strong> एक notional sketch map है जो Census 2027 में प्रत्येक प्रगणक को अपने Houselisting Block (HLB) का बनाना होता है। इसमें block की boundary, सड़कें, मकान के symbols, पानी के स्रोत, और अन्य geographical features दिखाए जाते हैं। यह A4 size के कागज पर hand-drawn या digitally generated होता है।
        </p>
      </div>
      <h2>Nazri Naksha बनाने के नियम — Census Guidelines</h2>
      <h3>क्या दिखाना जरूरी है</h3>
      <ul>
        <li><strong>Boundaries:</strong> HLB की स्पष्ट सीमाएं (North, South, East, West)</li>
        <li><strong>Landmarks:</strong> मंदिर, मस्जिद, स्कूल, पंचायत भवन आदि</li>
        <li><strong>Roads & Streets:</strong> पक्की और कच्ची सड़कें</li>
        <li><strong>Buildings:</strong> सभी residential और non-residential मकान, उनके house numbers के साथ</li>
      </ul>
      <h3>क्या नहीं दिखाना चाहिए</h3>
      <ul>
        <li>अस्थायी संरचनाएं जो जनगणना के समय तक नहीं रहेंगी</li>
        <li>अत्यधिक बारीक details जो नक्शे को पढ़ने में मुश्किल बना दें</li>
      </ul>
      <h3>Format और Size requirements</h3>
      <p>नजरी नक्शा हमेशा <strong>A4 size</strong> के कागज पर होना चाहिए। इसे साफ और स्पष्ट होना चाहिए ताकि HLO app में upload करते समय या अधिकारियों द्वारा verify करते समय कोई परेशानी न हो।</p>
      <h2>पुराना तरीका vs नया तरीका</h2>
      <div class="overflow-x-auto my-8">
        <table class="min-w-full bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <thead class="bg-slate-100">
            <tr>
              <th class="py-3 px-4 text-left font-semibold text-slate-700">Feature</th>
              <th class="py-3 px-4 text-left font-semibold text-slate-700">Hand Drawing (पुराना)</th>
              <th class="py-3 px-4 text-left font-semibold text-orange-600">NakshaBot (नया)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr><td class="py-3 px-4">समय</td><td class="py-3 px-4">1-2 दिन</td><td class="py-3 px-4 font-medium text-emerald-600">15 मिनट</td></tr>
            <tr><td class="py-3 px-4">Accuracy</td><td class="py-3 px-4">कम (अंदाज पर आधारित)</td><td class="py-3 px-4 font-medium text-emerald-600">100% (Satellite Data)</td></tr>
            <tr><td class="py-3 px-4">Formatting</td><td class="py-3 px-4">कागज गंदा होने का डर</td><td class="py-3 px-4 font-medium text-emerald-600">Clean A4 PDF</td></tr>
          </tbody>
        </table>
      </div>
      <h2>NakshaBot से Nazri Naksha Kaise Banaye — Step by Step</h2>
      <h3>Step 1: Census SMS paste करें</h3>
      <p>अपना आधिकारिक HLO assignment SMS copy करें और NakshaBot में paste करें। यह अपने आप आपके HLB की location detect कर लेगा।</p>
      <h3>Step 2: Satellite map पर boundary बनाएं</h3>
      <p>Satellite view का उपयोग करके अपने block की boundary को accurately mark करें।</p>
      <h3>Step 3: Roads और Houses verify करें</h3>
      <p>AI द्वारा detect की गई सड़कों और मकानों को verify करें। आप manually भी house symbols add कर सकते हैं।</p>
      <h3>Step 4: ₹20 pay करें और PDF download करें</h3>
      <p>अपनी पूरी मेहनत बचाने के लिए सिर्फ ₹20 का payment करें और अपना official, ready-to-print A4 PDF download करें।</p>
      <h2>Nazri Naksha Sample — कैसा दिखता है?</h2>
      <figure class="my-8">
        <img src="/logo.png" alt="hlb map sample census 2027 kanpur" class="w-full h-auto rounded-2xl shadow-md border border-slate-200 bg-slate-100" style="min-height: 200px; object-fit: contain;" />
        <figcaption class="text-center text-sm text-slate-500 mt-3">Sample Nazri Naksha generated using NakshaBot</figcaption>
      </figure>
    `
  },
  {
    id: 'hlb-full-form',
    url: '/hlb-full-form',
    title: 'HLB Full Form in Census — Houselisting Block क्या है?',
    metaDescription: 'HLB full form in census in hindi — Houselisting Block. जानें HLB kya hota hai, HLB number kaise milta hai, और HLB map kaise banaye census 2027 mein.',
    h1: 'HLB Full Form in Census — पूरी जानकारी',
    schema: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "HLB full form in census in hindi",
          "acceptedAnswer": { "@type": "Answer", "text": "HLB ka full form Houselisting Block hota hai." }
        },
        {
          "@type": "Question",
          "name": "HLB number kya hota hai?",
          "acceptedAnswer": { "@type": "Answer", "text": "HLB number ek unique identifier hai jo ek specific enumeration block ko diya jata hai." }
        }
      ]
    }),
    content: `
      <div class="definition-box bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl my-8 shadow-sm">
        <h2 class="text-xl font-bold mt-0 mb-2">HLB Full Form: Houselisting Block</h2>
        <p class="m-0 text-slate-800">
          Census 2027 में <strong>HLB (Houselisting Block)</strong> वह क्षेत्र है जो एक प्रगणक (enumerator) को house listing के लिए assign किया जाता है। एक HLB में सामान्यतः 150-180 घर होते हैं।
        </p>
      </div>
      <h2>HLB का Full Form क्या है?</h2>
      <p>HLB का full form <strong>Houselisting Block</strong> है।</p>
      <h2>Census में HLB क्या होता है?</h2>
      <p>भारतीय जनगणना (Census of India) एक बहुत बड़ी प्रक्रिया है। इसे सुचारू रूप से चलाने के लिए, पूरे देश को छोटे-छोटे भौगोलिक क्षेत्रों में बांटा जाता है जिन्हें Houselisting Block (HLB) कहा जाता है। प्रत्येक HLB की स्पष्ट सीमाएं (natural boundaries) होती हैं जैसे सड़कें, नदियां, या दीवारें।</p>
      <h2>HLB Number कैसे मिलता है?</h2>
      <p>प्रगणकों को उनका HLB Number उनके Charge Officer (CO) द्वारा SMS के माध्यम से प्राप्त होता है। इस SMS में राज्य, जिला, तहसील, और HLB का code होता है।</p>
      <h2>HLB Map क्या होता है?</h2>
      <p>HLB Map (या <a href="/nazri-naksha-kaise-banaye">नजरी नक्शा</a>) एक हाथ से बना या डिजिटल नक्शा होता है जो HLB की सीमाओं और उसके अंदर स्थित सभी मकानों को दर्शाता है।</p>
      <h2>HLB और HLO में क्या अंतर है?</h2>
      <p>HLB एक भौगोलिक क्षेत्र (Houselisting Block) है, जबकि HLO उस क्षेत्र में की जाने वाली प्रक्रिया (<a href="/hlo-full-form">House Listing Operation</a>) है।</p>
      <h2>HLB Full Form Related Questions:</h2>
      <ul>
        <li>HLB full form in census in hindi</li>
        <li>HLB number kya hota hai</li>
        <li>HLB assignment kaise hota hai</li>
        <li>HLB map kaise banate hain</li>
      </ul>
    `
  },
  {
    id: 'hlo-full-form',
    url: '/hlo-full-form',
    title: 'HLO Full Form in Census — HLO Meaning in Hindi | Census 2027',
    metaDescription: 'HLO full form: House Listing Operation. HLO meaning in hindi, HLO matlab kya hai, HLO app census 2027 guide. Complete information for enumerators.',
    h1: 'HLO Full Form in Census — HLO Meaning in Hindi',
    content: `
      <div class="definition-box bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl my-8 shadow-sm">
        <h2 class="text-xl font-bold mt-0 mb-2">HLO Full Form: House Listing Operation</h2>
        <p class="font-medium text-slate-800 mb-2">HLO Meaning: मकानसूचीकरण क्रियाकलाप</p>
        <p class="m-0 text-slate-800">
          Census 2027 का पहला चरण जिसमें प्रगणक अपने HLB में जाकर सभी मकानों की सूची बनाते हैं और nazri naksha तैयार करते हैं।
        </p>
      </div>
      <h2>HLO Matlab Kya Hai?</h2>
      <p>HLO का मतलब House Listing Operation है। यह जनगणना का वह प्रारंभिक चरण है जिसमें घरों की गिनती, उनके प्रकार (कच्चा/पक्का), और वहां रहने वाले परिवारों की बुनियादी जानकारी दर्ज की जाती है।</p>
      <h2>HLO Kaise Karte Hain — Step by Step</h2>
      <p>प्रगणक अपने आवंटित HLB में जाते हैं, एक <a href="/nazri-naksha-kaise-banaye">नजरी नक्शा (Nazri Naksha)</a> तैयार करते हैं, घरों पर नंबर डालते हैं, और HLO App में डेटा फीड करते हैं।</p>
      <h2>HLO App Download Kaise Karein</h2>
      <p>HLO App आधिकारिक Census portal से डाउनलोड किया जा सकता है। आपको अपने supervisor द्वारा दिए गए credentials से login करना होगा।</p>
      <h2>HLO App Not Installing Incompatible</h2>
      <p>अगर आपको "hlo app census app not installing incompatible" error आ रहा है, तो:</p>
      <ol>
        <li>Check करें कि आपका Android version 8.0 या उससे ऊपर है।</li>
        <li>Phone की storage clear करें (कम से कम 2GB free space चाहिए)।</li>
        <li>'Install from Unknown Sources' permission ON करें।</li>
      </ol>
      <h2>HLO House Numbering Rules</h2>
      <p>HLO में मकानों को नंबर देने के लिए Serpentine method का उपयोग किया जाता है। <a href="/hlo-house-numbering">HLO House Numbering Rules के बारे में विस्तार से पढ़ें</a>।</p>
    `
  },
  {
    id: 'hlb-map-download',
    url: '/hlb-map-download',
    title: 'HLB Map Download — Nazri Naksha PDF Free Sample | Census 2027',
    metaDescription: 'HLB map PDF download karo census 2027 ke liye. Apna HLB number enter karo aur ready-to-print nazri naksha A4 PDF milega. ₹20 mein poora bundle.',
    h1: 'HLB Map Download — अपना Nazri Naksha PDF पाएं',
    content: `
      <p class="lead">Census 2027 के लिए एकदम सही फॉर्मेट में अपना HLB Map / Nazri Naksha डाउनलोड करें। नीचे दिए गए फ्री सैंपल्स देखें。</p>
      <h2>Free Sample Maps Gallery</h2>
      <div class="grid md:grid-cols-2 gap-6 my-8">
        <figure>
          <img src="/images/nazri-naksha-sample-urban-kanpur.jpg" alt="hlb map sample census 2027 kanpur" class="w-full h-48 object-contain rounded-xl bg-slate-100 border border-slate-200" />
          <figcaption class="text-sm text-center text-slate-500 mt-2">HLB Map Sample — Kanpur, UP</figcaption>
        </figure>
        <figure>
          <img src="/images/nazri-naksha-rural-up.jpg" alt="nazri naksha image UP census" class="w-full h-48 object-contain rounded-xl bg-slate-100 border border-slate-200" />
          <figcaption class="text-sm text-center text-slate-500 mt-2">Nazri Naksha Image — Rural UP</figcaption>
        </figure>
      </div>
      <h2>How to download your HLB map</h2>
      <ol>
        <li><strong>Enter SMS:</strong> NakshaBot homepage पर जाएं और अपना HLO assignment SMS paste करें।</li>
        <li><strong>Draw Boundary:</strong> Satellite map पर अपने block की boundary बनाएं।</li>
        <li><strong>Generate:</strong> AI को मकान detect करने दें और map generate करें।</li>
        <li><strong>Download:</strong> ₹20 का payment करें और अपना High-Resolution A4 PDF download करें।</li>
      </ol>
      <h2>What's included in the download</h2>
      <ul>
        <li>Overview map (full HLB)</li>
        <li>Sector-wise detailed maps</li>
        <li>Satellite reference map</li>
        <li>AI Survey Map overlay</li>
        <li>Official register format layout</li>
      </ul>
    `
  },
  {
    id: 'hlo-house-numbering',
    url: '/hlo-house-numbering',
    title: 'HLO House Numbering Rules — Census 2027 Serpentine Method Hindi',
    metaDescription: 'Census 2027 mein HLO house numbering kaise hoti hai. Serpentine method rules, North-West se start kaise karein, NakshaBot automatic numbering feature.',
    h1: 'HLO House Numbering — Census 2027 के नियम',
    content: `
      <p class="lead">HLO House Numbering (मकानों को नंबर देना) जनगणना का एक बहुत महत्वपूर्ण हिस्सा है। इसके लिए एक विशेष नियम का पालन किया जाता है जिसे Serpentine (सर्पीला) Method कहते हैं।</p>
      <h2>Census 2027 में घरों को नंबर कैसे दें?</h2>
      <p>घरों को नंबर देना हमेशा ब्लॉक के <strong>North-West (उत्तर-पश्चिम)</strong> कोने से शुरू होना चाहिए।</p>
      <h2>Serpentine (सर्पीले) Method क्या है?</h2>
      <div class="bg-slate-800 text-white p-6 rounded-xl my-6 font-mono text-sm leading-relaxed whitespace-pre overflow-x-auto">
North-West → East (Row 1)
                ↓
East → West (Row 2)
                ↓
West → East (Row 3)
      </div>
      <p>यह एक सांप के चलने (zigzag) जैसा pattern होता है।</p>
      <h2>House Numbering के नियम</h2>
      <ul>
        <li>North-West corner से शुरू करें।</li>
        <li>पहले Row में West से East जाएं।</li>
        <li>रास्ते के अंत में पहुंचकर, नीचे मुड़ें और वापसी में East से West जाएं।</li>
        <li>रास्ते के दोनों ओर के घरों को एक साथ नंबर न दें, बल्कि एक line में चलें।</li>
      </ul>
      <h2>NakshaBot में Automatic Numbering</h2>
      <p>NakshaBot का AI engine आपके द्वारा map पर drop किए गए घरों को automatically <strong>Serpentine algorithm</strong> का उपयोग करके नंबर दे देता है। आपको खुद से नंबर सोचने या type करने की जरूरत नहीं है। यह 100% census rules के अनुसार काम करता है।</p>
      <h2>Numbering Mistakes से कैसे बचें?</h2>
      <p>हमेशा पक्का करें कि कोई भी घर छूट न जाए। अगर कोई घर बाद में मिलता है, तो official guidelines के अनुसार उसे alphanumeric number (जैसे 45/1 या 45A) दिया जाना चाहिए।</p>
    `
  },
  {
    id: 'nazri-naksha-kya-hota-hai',
    url: '/nazri-naksha-kya-hota-hai',
    title: 'Nazri Naksha Kya Hota Hai — Census 2027 Details in Hindi',
    metaDescription: 'Nazri naksha kya hota hai, kaun banata hai, aur census mein iska kya use hai. All your questions about nazri naksha answered in Hindi for Census 2027.',
    h1: 'Nazri Naksha क्या होता है? — Census 2027 के लिए',
    content: `
      <div class="definition-box bg-blue-50 border-l-4 border-blue-500 p-6 rounded-r-xl my-8 shadow-sm">
        <h2 class="text-xl font-bold mt-0 mb-2">Nazri Naksha Kya Hota Hai?</h2>
        <p class="m-0 text-slate-800">
          <strong>Nazri Naksha (नजरी नक्शा)</strong> एक notional sketch map है जो Census 2027 में प्रत्येक प्रगणक को अपने Houselisting Block (HLB) का बनाना होता है। इसमें block की boundary, सड़कें, मकान के symbols, पानी के स्रोत, और अन्य geographical features दिखाए जाते हैं। यह A4 size के कागज पर hand-drawn या digitally generated होता है।
        </p>
      </div>
      <h2>Nazri Naksha Kaun Banata Hai?</h2>
      <p>नजरी नक्शा <strong>प्रगणक (Enumerator)</strong> द्वारा बनाया जाता है जिसे वह विशेष Houselisting Block (HLB) assign किया गया है।</p>
      <h2>Nazri Naksha in English</h2>
      <p>In English, Nazri Naksha is commonly referred to as a <strong>Layout Map</strong> or a <strong>Notional Map</strong> of the Enumeration Block.</p>
      <h2>क्यों जरूरी है?</h2>
      <p>यह नक्शा सुनिश्चित करता है कि प्रगणक ने अपने पूरे क्षेत्र को कवर कर लिया है और कोई भी घर या बस्ती गिनती से छूट नहीं गई है। यह भविष्य में verification के लिए भी काम आता है।</p>
      <h2>डिजिटल नजरी नक्शा</h2>
      <p>अब आप NakshaBot जैसे tool का उपयोग करके मात्र 15 मिनट में अपना डिजिटल नजरी नक्शा तैयार कर सकते हैं, जो हाथ से बने नक्शे से कहीं अधिक सटीक और साफ होता है।</p>
    `
  },
  {
    id: 'hlb-map-sample',
    url: '/hlb-map-sample',
    title: 'HLB Map Sample — Nazri Naksha Images & Layout Examples',
    metaDescription: 'View high-quality HLB map samples and nazri naksha images for Census 2027. See correct formats for urban and rural Houselisting Blocks.',
    h1: 'HLB Map Sample & Nazri Naksha Examples',
    content: `
      <p class="lead">Here are official-style samples of HLB Maps and Nazri Nakshas generated for Census 2027.</p>
      <div class="grid md:grid-cols-2 gap-8 my-8">
        <figure>
          <img src="/images/hlb-map-census-2027-example.jpg" alt="hlb map layout urban census" class="w-full h-64 object-contain rounded-xl bg-slate-100 border border-slate-200" />
          <figcaption class="text-center mt-2 font-medium">Urban HLB Map Layout</figcaption>
        </figure>
        <figure>
          <img src="/images/hlo-map-pdf-sample.jpg" alt="nazri naksha image rural census" class="w-full h-64 object-contain rounded-xl bg-slate-100 border border-slate-200" />
          <figcaption class="text-center mt-2 font-medium">Rural Nazri Naksha Image</figcaption>
        </figure>
      </div>
      <h2>Features of a Good HLB Map</h2>
      <ul>
        <li>Clear, distinct boundary lines</li>
        <li>Correctly numbered houses using Serpentine Method</li>
        <li>Accurate road layouts (Pucca and Kutcha roads)</li>
        <li>Clear landmarks (Schools, Temples, Hospitals)</li>
      </ul>
      <p>Generate your own perfectly formatted map using <a href="/">NakshaBot's HLB Map Maker</a> today.</p>
    `
  },
  {
    id: 'hlo-app-census-guide',
    url: '/hlo-app-census-guide',
    title: 'HLO App Census Guide — Download, Training & Troubleshooting',
    metaDescription: 'Complete guide for the HLO App for Census 2027. Learn how to download the training app, use it for house numbering, and fix "app not installing" issues.',
    h1: 'HLO App Census Complete Guide',
    content: `
      <p class="lead">The HLO (House Listing Operations) App is the official mobile application used by enumerators during Census 2027.</p>
      <h2>HLO App Download and Installation</h2>
      <p>The app will be provided by your local charge officer or via a secure official link. Do not download the HLO app from unverified third-party websites.</p>
      <h2>HLO Training App</h2>
      <p>Before the actual census begins, enumerators are given access to the <strong>HLO Training App</strong>. This allows you to practice data entry and understand the app's interface without affecting the real census database.</p>
      <h2>Troubleshooting: HLO App Not Installing Incompatible</h2>
      <p>Many enumerators face the issue where the app says "Not Installing" or "Incompatible". Here is how to fix it:</p>
      <ol>
        <li><strong>Android Version:</strong> The app requires Android 8.0 or higher. Check your phone's settings.</li>
        <li><strong>Storage Space:</strong> Ensure you have at least 2GB of free storage space.</li>
        <li><strong>Unknown Sources:</strong> Go to Settings > Security > Enable "Install from Unknown Sources" since the app might be provided as an APK file.</li>
        <li><strong>Play Protect:</strong> Temporarily disable Google Play Protect if it is blocking the official APK.</li>
      </ol>
      <h2>Integrating with NakshaBot</h2>
      <p>Once your data is in the HLO app, you will still need a physical or PDF <strong>Nazri Naksha</strong>. You can use NakshaBot to generate this map, and ensure the house numbers in NakshaBot perfectly match the data you enter into the HLO app.</p>
    `
  },
  {
    id: 'nazri-naksha-census-2027',
    url: '/nazri-naksha-census-2027',
    title: 'Nazri Naksha Census 2027 — Official Guidelines & Rules',
    metaDescription: 'Official rules and guidelines for creating the Nazri Naksha (janganana map) for Census 2027. Step-by-step instructions for all enumerators.',
    h1: 'Nazri Naksha Census 2027 Guidelines',
    content: `
      <p class="lead">Census 2027 introduces new guidelines for mapping and data collection. The Nazri Naksha remains a critical component of the House Listing Operation (HLO).</p>
      <h2>Census 2027 Updates</h2>
      <p>For Census 2027, the focus is on digital data collection via the HLO App. However, the physical layout map is still required for spatial verification.</p>
      <h2>Nazri Naksha Janganana Rules</h2>
      <ul>
        <li><strong>Scale:</strong> The map does not need to be perfectly to scale (it is "notional"), but the relative positions of houses must be accurate.</li>
        <li><strong>Orientation:</strong> North must always point upwards.</li>
        <li><strong>Clarity:</strong> It must be drawn cleanly. Using a digital tool like NakshaBot is highly recommended to avoid messy corrections.</li>
      </ul>
      <h2>Important Symbols</h2>
      <p>Census guidelines dictate specific symbols for different types of buildings:</p>
      <ul>
        <li><strong>Square:</strong> Pucca House</li>
        <li><strong>Triangle:</strong> Kutcha House</li>
        <li><strong>Shaded:</strong> Non-residential</li>
      </ul>
      <p>NakshaBot automatically applies these correct official symbols when you generate your map.</p>
    `
  }
];
