import { lazy, type ComponentType } from "react";
import { reportAppError } from "./reportAppError";

const RELOAD_KEY = "kivo_chunk_reload";

function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unable to preload") ||
    msg.includes("error loading dynamically imported module")
  );
}

/**
 * If a chunk fails to load (stale deploy), do a single controlled reload.
 * Uses sessionStorage to prevent infinite loops.
 */
function attemptSingleReload(): void {
  const already = sessionStorage.getItem(RELOAD_KEY);
  if (already) {
    // Already tried once this session — don't loop
    return;
  }
  sessionStorage.setItem(RELOAD_KEY, Date.now().toString());
  window.location.reload();
}

/** Clear the reload flag on successful app boot (called from main.tsx or App mount) */
export function clearChunkReloadFlag(): void {
  sessionStorage.removeItem(RELOAD_KEY);
}

/**
 * Wrapper around React.lazy that:
 * 1. Retries the import once with a short delay
 * 2. If still failing with a chunk error, triggers a single page reload
 * 3. Never loops — max 1 reload per session
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      if (isChunkError(err)) {
        reportAppError({
          message: `Chunk load failed, retrying once`,
          stack: err instanceof Error ? err.stack : undefined,
          context: "lazyWithRetry",
        });

        // Wait briefly then retry
        await new Promise((r) => setTimeout(r, 1500));

        try {
          return await factory();
        } catch (retryErr) {
          reportAppError({
            message: `Chunk load failed after retry — attempting reload`,
            stack: retryErr instanceof Error ? retryErr.stack : undefined,
            context: "lazyWithRetry",
          });

          // Single controlled reload
          attemptSingleReload();

          // If we reach here, reload was already attempted — throw
          throw retryErr;
        }
      }

      // Non-chunk error — report and throw immediately
      reportAppError({
        message: err instanceof Error ? err.message : "Unknown lazy load error",
        stack: err instanceof Error ? err.stack : undefined,
        context: "lazyWithRetry",
      });
      throw err;
    }
  });
}
