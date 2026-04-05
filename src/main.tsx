import { createRoot } from "react-dom/client";
import { installGlobalErrorHandlers } from "./lib/globalErrorHandlers";
import App from "./App.tsx";
import "./index.css";

// Install global error handlers BEFORE anything else
installGlobalErrorHandlers();

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found");

  createRoot(rootEl).render(<App />);
} catch (err) {
  console.error("App boot error:", err);
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,sans-serif;background:#fafafa;color:#111">
      <div style="max-width:420px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h1 style="font-size:20px;font-weight:600;margin-bottom:8px">Erro ao iniciar o aplicativo</h1>
        <p style="font-size:14px;color:#666;margin-bottom:24px">Atualize a página (Ctrl+F5).</p>
        <button onclick="window.location.reload()" style="padding:10px 24px;border-radius:8px;border:none;background:#111;color:#fff;font-weight:500;font-size:14px;cursor:pointer">Recarregar</button>
      </div>
    </div>`;
  }
}
