import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadRuntimeConfig } from "./net/config";
import { startConnection } from "./net/connect";
import "./styles.css";

const config = loadRuntimeConfig();
startConnection(config);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("index.html is missing #root");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
