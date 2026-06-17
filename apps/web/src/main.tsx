import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/App";
import { isDesktop } from "./platform";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-500.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-800.css";
import "@fontsource/poppins/latin-900.css";
import "./styles.css";

// The UI is dark-only; activate shadcn's `dark:` variants deterministically.
document.documentElement.classList.add("dark");

// When running inside the Electron shell, go transparent so the native
// liquid-glass window shows through behind the UI.
if (isDesktop()) {
  document.documentElement.classList.add("desktop");
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
