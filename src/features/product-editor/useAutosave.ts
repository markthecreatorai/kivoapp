// =============================================================
// useAutosave — dispara save com debounce quando isDirty.
// Cancela timer pendente em unmount.
// =============================================================

import { useEffect, useRef } from "react";
import { useProductEditor } from "./store";

export function useAutosave(opts: { delayMs?: number; enabled?: boolean } = {}) {
  const { delayMs = 1500, enabled = true } = opts;
  const { state, flush } = useProductEditor();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!state.meta.isDirty) return;
    if (state.meta.saveStatus === "saving") return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush().catch(() => {
        /* status já marcado em store */
      });
    }, delayMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // depende apenas do dirty flag + ts da última edição
  }, [state.meta.isDirty, state.meta.saveStatus, enabled, delayMs, flush]);
}
