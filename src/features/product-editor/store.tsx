// =============================================================
// Store React do ProductEditor — Context + useReducer.
// Expõe state, dispatch e ações de alto nível (patch, save).
// =============================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { editorReducer } from "./reducer";
import { mapApiToEditorState, mapEditorStateToApi } from "./mappers";
import type {
  ApiProductRow,
  ApiProductUpdatePayload,
  ProductEditorState,
  ProductStatus,
} from "./types";

export interface SaveAdapter {
  /**
   * Persiste o payload. Implementação injetável para
   * permitir testes e desacoplar de Supabase.
   */
  save: (productId: string, payload: ApiProductUpdatePayload) => Promise<void>;
}

interface StoreValue {
  state: ProductEditorState;
  patch: (
    fields: Partial<
      Omit<ProductEditorState, "id" | "workspaceId" | "formatId" | "meta">
    >,
  ) => void;
  saveDraft: () => Promise<void>;
  publish: () => Promise<void>;
  /** força flush imediato de qualquer alteração pendente (ex: blur global) */
  flush: () => Promise<void>;
}

const Ctx = createContext<StoreValue | null>(null);

export function ProductEditorProvider({
  initialRow,
  adapter,
  children,
}: {
  initialRow: ApiProductRow;
  adapter: SaveAdapter;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    editorReducer,
    initialRow,
    mapApiToEditorState,
  );

  // Ref que sempre reflete o último estado — usado pelo
  // pipeline assíncrono de save para evitar stale closure.
  const stateRef = useRef(state);
  stateRef.current = state;

  const persist = useCallback(
    async (status?: ProductStatus) => {
      const current = stateRef.current;
      const payload = mapEditorStateToApi(current, { status });
      dispatch({ type: "SET_SAVE_STATUS", payload: { status: "saving" } });
      try {
        await adapter.save(current.id, payload);
        if (status) dispatch({ type: "SET_STATUS", payload: status });
        dispatch({ type: "MARK_SAVED", payload: { at: Date.now() } });
      } catch (err) {
        dispatch({
          type: "SET_SAVE_STATUS",
          payload: { status: "error", error: (err as Error).message },
        });
        throw err;
      }
    },
    [adapter],
  );

  const patch = useCallback<StoreValue["patch"]>((fields) => {
    dispatch({ type: "PATCH_FIELDS", payload: fields });
  }, []);

  const saveDraft = useCallback(() => persist("DRAFT"), [persist]);
  const publish = useCallback(() => persist("PUBLISHED"), [persist]);
  const flush = useCallback(() => persist(), [persist]);

  const value = useMemo<StoreValue>(
    () => ({ state, patch, saveDraft, publish, flush }),
    [state, patch, saveDraft, publish, flush],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProductEditor(): StoreValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProductEditor must be used within ProductEditorProvider");
  return v;
}
