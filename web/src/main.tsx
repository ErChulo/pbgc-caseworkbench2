import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { BootstrapApp } from "./app/BootstrapApp";
import { installProductionSecurityBoundary } from "./app/security-boundary";
import "./styles/index.css";

if (import.meta.env.PROD) {
  installProductionSecurityBoundary(globalThis);
}

const root = document.querySelector<HTMLElement>("#root");

if (!root) {
  throw new Error("PBGC Case Workbench bootstrap root is missing.");
}

createRoot(root).render(
  <StrictMode>
    <BootstrapApp />
  </StrictMode>,
);
