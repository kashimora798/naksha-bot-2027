
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./index.css";

// Polyfill for crypto.randomUUID (fixes crashes on mobile/HTTP local networks)
if (!window.crypto) {
  (window as any).crypto = {};
}
if (!window.crypto.randomUUID) {
  window.crypto.randomUUID = function () {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}
// Fix for default marker icons in Leaflet with Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});
import App from "./App";
import TermsScreen from "./screens/TermsScreen";
import RefundScreen from "./screens/RefundScreen";
import ContactScreen from "./screens/ContactScreen";
import SignInScreen from "./screens/SignInScreen";
import SignUpScreen from "./screens/SignUpScreen";
import LandingScreen from "./screens/LandingScreen";
import SessionsDashboard from "./screens/SessionsDashboard";
import SessionDetailScreen from "./screens/SessionDetailScreen";
import LiveSurveyPrep from "./screens/LiveSurveyPrep";
import LiveSurveyScreen from "./screens/LiveSurveyScreen";
// New pages to be created:
import HowItWorksPage from "./screens/HowItWorksPage";
import FaqPage from "./screens/FaqPage";
import StateLandingPage from "./screens/StateLandingPage";
import BlogSchedulePage from "./screens/BlogSchedulePage";
import BlogRulesPage from "./screens/BlogRulesPage";
import SeoArticlePage from "./screens/SeoArticlePage";
import { seoArticles } from "./data/seoContent";
import AdminLayout from "./screens/admin/AdminLayout";
import AdminDashboard from "./screens/admin/AdminDashboard";
import AdminUsersScreen from "./screens/admin/AdminUsersScreen";
import AdminUserDetail from "./screens/admin/AdminUserDetail";
import AdminProjectsScreen from "./screens/admin/AdminProjectsScreen";
import AdminSessionsScreen from "./screens/admin/AdminSessionsScreen";
import AdminFeedbackScreen from "./screens/admin/AdminFeedbackScreen";
import AdminDonationsScreen from "./screens/admin/AdminDonationsScreen";
import AdminAnnouncementsScreen from "./screens/admin/AdminAnnouncementsScreen";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingScreen />} />
          <Route path="/app" element={<App />} />
          
          <Route path="/live-dashboard" element={<SessionsDashboard />} />
          <Route path="/live-session/:id" element={<SessionDetailScreen />} />
          <Route path="/live-prep" element={<LiveSurveyPrep />} />
          <Route path="/live-survey" element={<LiveSurveyScreen onExit={() => {}} />} />
          
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/faq" element={<FaqPage />} />
          
          <Route path="/schedule" element={<BlogSchedulePage />} />
          <Route path="/rules" element={<BlogRulesPage />} />
          
          {/* SEO Pages */}
          {seoArticles.map((article) => (
            <Route key={article.id} path={article.url} element={<SeoArticlePage articleId={article.id} />} />
          ))}
          
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
          <Route path="/uttarakhand-census-map" element={<StateLandingPage stateKey="UK" />} />
          <Route path="/jharkhand-census-map" element={<StateLandingPage stateKey="JH" />} />
          <Route path="/odisha-census-map" element={<StateLandingPage stateKey="OD" />} />
          <Route path="/assam-census-map" element={<StateLandingPage stateKey="AS" />} />
          <Route path="/chhattisgarh-census-map" element={<StateLandingPage stateKey="CG" />} />
          <Route path="/telangana-census-map" element={<StateLandingPage stateKey="TS" />} />
          <Route path="/andhra-pradesh-census-map" element={<StateLandingPage stateKey="AP" />} />
          <Route path="/jk-census-map" element={<StateLandingPage stateKey="JK" />} />
          <Route path="/delhi-census-map" element={<StateLandingPage stateKey="DL" />} />
          <Route path="/goa-census-map" element={<StateLandingPage stateKey="GA" />} />
          <Route path="/tripura-census-map" element={<StateLandingPage stateKey="TR" />} />
          <Route path="/meghalaya-census-map" element={<StateLandingPage stateKey="ML" />} />
          <Route path="/manipur-census-map" element={<StateLandingPage stateKey="MN" />} />
          <Route path="/nagaland-census-map" element={<StateLandingPage stateKey="NL" />} />
          <Route path="/mizoram-census-map" element={<StateLandingPage stateKey="MZ" />} />
          <Route path="/sikkim-census-map" element={<StateLandingPage stateKey="SK" />} />
          
          {/* Legacy Routes */}
          <Route path="/terms" element={<TermsScreen />} />
          <Route path="/terms.html" element={<TermsScreen />} />
          <Route path="/refunds" element={<RefundScreen />} />
          <Route path="/refunds.html" element={<RefundScreen />} />
          <Route path="/contact" element={<ContactScreen />} />
          <Route path="/contact.html" element={<ContactScreen />} />
          <Route path="/sign-in" element={<SignInScreen />} />
          <Route path="/sign-up" element={<SignUpScreen />} />

          {/* Admin — invisible, route only */}
          <Route path="/kratagya" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsersScreen />} />
            <Route path="users/:id" element={<AdminUserDetail />} />
            <Route path="projects" element={<AdminProjectsScreen />} />
            <Route path="sessions" element={<AdminSessionsScreen />} />
            <Route path="feedback" element={<AdminFeedbackScreen />} />
            <Route path="donations" element={<AdminDonationsScreen />} />
            <Route path="announcements" element={<AdminAnnouncementsScreen />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>
);
