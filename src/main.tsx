import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AuthGate } from "./auth/AuthGate";
import { AuthProvider } from "./auth/AuthProvider";
import { isDesktopApp } from "./lib/desktop";
import "./styles.css";
import "./features/shot-iq/shotiq.css";

if ("serviceWorker" in navigator && !isDesktopApp()) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <App />
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>
);
