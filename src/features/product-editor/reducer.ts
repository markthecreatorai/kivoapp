// =============================================================
// Reducer puro do ProductEditor.
// Centraliza todas as transições de estado.
// =============================================================

import type { EditorAction, ProductEditorState } from "./types";

export function editorReducer(
  state: ProductEditorState,
  action: EditorAction,
): ProductEditorState {
  switch (action.type) {
    case "HYDRATE":
      return action.payload;

    case "PATCH_FIELDS": {
      // Só marca dirty se algum valor realmente mudou.
      let changed = false;
      const next = { ...state };
      for (const k of Object.keys(action.payload) as Array<keyof typeof action.payload>) {
        const v = action.payload[k];
        if (v !== undefined && (state as any)[k] !== v) {
          (next as any)[k] = v;
          changed = true;
        }
      }
      if (!changed) return state;
      return {
        ...next,
        meta: { ...state.meta, isDirty: true, saveStatus: "idle", lastError: null },
      };
    }

    case "SET_SAVE_STATUS":
      return {
        ...state,
        meta: {
          ...state.meta,
          saveStatus: action.payload.status,
          lastError: action.payload.error ?? null,
        },
      };

    case "MARK_SAVED":
      return {
        ...state,
        meta: {
          ...state.meta,
          isDirty: false,
          saveStatus: "saved",
          lastSavedAt: action.payload.at,
          lastError: null,
        },
      };

    case "SET_STATUS":
      return { ...state, status: action.payload };

    case "RESET_DIRTY":
      return { ...state, meta: { ...state.meta, isDirty: false } };

    default:
      return state;
  }
}
