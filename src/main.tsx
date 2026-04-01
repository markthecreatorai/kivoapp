import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

declare global {
  interface Window {
    twemoji: {
      parse: (node: HTMLElement, options?: Record<string, unknown>) => void;
    };
  }
}

try {
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error("Root element not found");

  createRoot(rootEl).render(<App />);

  // Parse emojis globally with Twemoji after every DOM update
  const observer = new MutationObserver(() => {
    if (window.twemoji) {
      window.twemoji.parse(document.body, {
        folder: "svg",
        ext: ".svg",
      });
    }
  });

  // Start observing after initial render
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Initial parse
  if (window.twemoji) {
    window.twemoji.parse(document.body, {
      folder: "svg",
      ext: ".svg",
    });
  }
} catch (err) {
  console.error("App boot error:", err);
  const rootEl = document.getElementById("root");
  if (rootEl) {
    rootEl.innerHTML = `<div style=\"padding:24px;font-family:Inter,sans-serif;color:#111\">Erro ao carregar o app. Atualize a página (Ctrl+F5).</div>`;
  }
}
