
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import App from "./App";
import TermsScreen from "./screens/TermsScreen";
import RefundScreen from "./screens/RefundScreen";
import ContactScreen from "./screens/ContactScreen";
import SignInScreen from "./screens/SignInScreen";
import SignUpScreen from "./screens/SignUpScreen";
import LandingScreen from "./screens/LandingScreen";
// New pages to be created:
import HowItWorksPage from "./screens/HowItWorksPage";
import FaqPage from "./screens/FaqPage";
import StateLandingPage from "./screens/StateLandingPage";
import BlogSchedulePage from "./screens/BlogSchedulePage";
import BlogRulesPage from "./screens/BlogRulesPage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/app" element={<App />} />
          
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/faq" element={<FaqPage />} />
          
          <Route path="/schedule" element={<BlogSchedulePage />} />
          <Route path="/rules" element={<BlogRulesPage />} />
          
          {/* State Pages */}
          <Route path="/up-census-map" element={<StateLandingPage stateKey="UP" />} />
          <Route path="/maharashtra-census-map" element={<StateLandingPage stateKey="MH" />} />
          <Route path="/bihar-census-map" element={<StateLandingPage stateKey="BR" />} />
          <Route path="/mp-census-map" element={<StateLandingPage stateKey="MP" />} />
          <Route path="/rajasthan-census-map" element={<StateLandingPage stateKey="RJ" />} />
          <Route path="/hp-census-map" element={<StateLandingPage stateKey="HP" />} />
          <Route path="/kerala-census-map" element={<StateLandingPage stateKey="KL" />} />
          <Route path="/west-bengal-census-map" element={<StateLandingPage stateKey="WB" />} />
          <Route path="/tamil-nadu-census-map" element={<StateLandingPage stateKey="TN" />} />
          <Route path="/karnataka-census-map" element={<StateLandingPage stateKey="KA" />} />
          <Route path="/gujarat-census-map" element={<StateLandingPage stateKey="GJ" />} />
          <Route path="/punjab-haryana-census-map" element={<StateLandingPage stateKey="PBHR" />} />
          
          {/* Legacy Routes */}
          <Route path="/terms" element={<TermsScreen />} />
          <Route path="/terms.html" element={<TermsScreen />} />
          <Route path="/refunds" element={<RefundScreen />} />
          <Route path="/refunds.html" element={<RefundScreen />} />
          <Route path="/contact" element={<ContactScreen />} />
          <Route path="/contact.html" element={<ContactScreen />} />
          <Route path="/sign-in" element={<SignInScreen />} />
          <Route path="/sign-up" element={<SignUpScreen />} />
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
