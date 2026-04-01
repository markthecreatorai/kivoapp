import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found");

  createRoot(rootEl).render(<App />);
} catch (err) {
  console.error("App boot error:", err);
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = `<div style=\"padding:24px;font-family:Inter,sans-serif;color:#111\">Erro ao carregar o app. Atualize a página (Ctrl+F5).</div>`;
  }
}
