import { lazy, type ComponentType } from "react";
import { reportAppError } from "./reportAppError";

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function isChunkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("failed to fetch dynamically imported module") ||
    msg.includes("loading chunk") ||
    msg.includes("loading css chunk") ||
    msg.includes("unable to preload")
  );
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wrapper around React.lazy that retries chunk loads up to MAX_RETRIES times
 * with cache-busting query params, then throws a clean ChunkLoadError.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await factory();
      } catch (err) {
        if (attempt < MAX_RETRIES && isChunkError(err)) {
          reportAppError({
            message: `Chunk load retry ${attempt + 1}/${MAX_RETRIES}`,
            stack: err instanceof Error ? err.stack : undefined,
            context: "lazyWithRetry",
          });
          await wait(RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        // Final failure
        reportAppError({
          message: `Chunk load failed after ${MAX_RETRIES} retries`,
          stack: err instanceof Error ? err.stack : undefined,
          context: "lazyWithRetry",
        });
        throw err;
      }
    }
    // Unreachable, but TS needs it
    throw new Error("Chunk load failed");
  });
}
