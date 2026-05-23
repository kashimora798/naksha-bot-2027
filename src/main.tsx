import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import TermsScreen from "./screens/TermsScreen";
import RefundScreen from "./screens/RefundScreen";
import ContactScreen from "./screens/ContactScreen";

const path = window.location.pathname;

let ComponentToRender = App;
if (path === '/terms' || path === '/terms.html') {
  ComponentToRender = TermsScreen;
} else if (path === '/refunds' || path === '/refunds.html') {
  ComponentToRender = RefundScreen;
} else if (path === '/contact' || path === '/contact.html') {
  ComponentToRender = ContactScreen;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ComponentToRender />
  </StrictMode>
);
