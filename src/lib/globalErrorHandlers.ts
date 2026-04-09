import { reportAppError } from "./reportAppError";

let fallbackShown = false;

function showCriticalFallback() {
  if (fallbackShown) return;
  fallbackShown = true;

  const existing = document.getElementById("global-error-fallback");
  if (existing) return;

  const div = document.createElement("div");
  div.id = "global-error-fallback";
  div.innerHTML = `
    <div style="position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:#fafafa;font-family:Inter,system-ui,sans-serif;padding:24px">
      <div style="max-width:420px;text-align:center">
        <div style="font-size:48px;margin-bottom:16px">⚠️</div>
        <h1 style="font-size:20px;font-weight:600;margin-bottom:8px;color:#111">Erro ao carregar o aplicativo</h1>
        <p style="font-size:14px;color:#666;margin-bottom:24px;line-height:1.5">Algo deu errado. Tente recarregar a página.</p>
        <button onclick="window.location.reload()" style="padding:10px 24px;border-radius:8px;border:none;background:#111;color:#fff;font-weight:500;font-size:14px;cursor:pointer">Recarregar</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function isChunkError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("failed to fetch dynamically imported module") ||
    lower.includes("loading chunk") ||
    lower.includes("loading css chunk") ||
    lower.includes("unable to preload") ||
    lower.includes("error loading dynamically imported module")
  );
}

export function installGlobalErrorHandlers(): void {
  // Standard window.onerror
  window.onerror = (message, source, lineno, colno, error) => {
    const msg = typeof message === "string" ? message : "Unknown error";
    reportAppError({
      message: msg,
      stack: error?.stack,
      context: "window.onerror",
    });

    if (isChunkError(msg)) {
      showCriticalFallback();
    }
  };

  // Unhandled promise rejections
  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    const error = event.reason;
    const msg = error instanceof Error ? error.message : String(error);
    reportAppError({
      message: msg,
      stack: error instanceof Error ? error.stack : undefined,
      context: "unhandledrejection",
    });

    if (isChunkError(msg)) {
      showCriticalFallback();
    }
  };

  // Vite-specific preload error handler
  window.addEventListener("vite:preloadError", (event: Event) => {
    const customEvent = event as CustomEvent;
    const error = customEvent?.detail?.error;
    const msg = error instanceof Error ? error.message : "vite:preloadError";

    reportAppError({
      message: msg,
      stack: error instanceof Error ? error.stack : undefined,
      context: "vite:preloadError",
    });

    // Prevent default Vite error handling — our lazyWithRetry handles recovery
    event.preventDefault();
  });
}
