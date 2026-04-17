// =============================================================
// Unit: reducer / actions
// =============================================================

import { describe, it, expect } from "vitest";
import { editorReducer } from "@/features/product-editor/reducer";
import { mapApiToEditorState } from "@/features/product-editor/mappers";
import type { ProductEditorState } from "@/features/product-editor/types";

function makeState(): ProductEditorState {
  return mapApiToEditorState({
    id: "p1",
    workspace_id: "w1",
    type: "LEAD_MAGNET",
    name: "Guia",
  });
}

describe("editorReducer", () => {
  it("HYDRATE substitui o estado completo", () => {
    const s1 = makeState();
    const s2: ProductEditorState = { ...s1, name: "novo" };
    expect(editorReducer(s1, { type: "HYDRATE", payload: s2 }).name).toBe("novo");
  });

  it("PATCH_FIELDS atualiza apenas o que mudou e marca dirty", () => {
    const s = makeState();
    const next = editorReducer(s, { type: "PATCH_FIELDS", payload: { name: "outro" } });
    expect(next.name).toBe("outro");
    expect(next.meta.isDirty).toBe(true);
    expect(next.meta.saveStatus).toBe("idle");
    expect(next.meta.lastError).toBeNull();
  });

  it("PATCH_FIELDS noop não altera referência se nada mudou", () => {
    const s = makeState();
    const next = editorReducer(s, { type: "PATCH_FIELDS", payload: { name: s.name } });
    expect(next).toBe(s);
    expect(next.meta.isDirty).toBe(false);
  });

  it("SET_SAVE_STATUS reflete saving/error/saved", () => {
    const s = makeState();
    const saving = editorReducer(s, {
      type: "SET_SAVE_STATUS",
      payload: { status: "saving" },
    });
    expect(saving.meta.saveStatus).toBe("saving");
    const errored = editorReducer(saving, {
      type: "SET_SAVE_STATUS",
      payload: { status: "error", error: "boom" },
    });
    expect(errored.meta.saveStatus).toBe("error");
    expect(errored.meta.lastError).toBe("boom");
  });

  it("MARK_SAVED limpa dirty, seta saved e timestamp", () => {
    const dirty = editorReducer(makeState(), {
      type: "PATCH_FIELDS",
      payload: { name: "x" },
    });
    expect(dirty.meta.isDirty).toBe(true);
    const saved = editorReducer(dirty, { type: "MARK_SAVED", payload: { at: 123 } });
    expect(saved.meta.isDirty).toBe(false);
    expect(saved.meta.saveStatus).toBe("saved");
    expect(saved.meta.lastSavedAt).toBe(123);
  });

  it("SET_STATUS atualiza status do produto", () => {
    const s = makeState();
    const pub = editorReducer(s, { type: "SET_STATUS", payload: "PUBLISHED" });
    expect(pub.status).toBe("PUBLISHED");
  });

  it("RESET_DIRTY apenas zera dirty", () => {
    const dirty = editorReducer(makeState(), {
      type: "PATCH_FIELDS",
      payload: { name: "y" },
    });
    expect(editorReducer(dirty, { type: "RESET_DIRTY" }).meta.isDirty).toBe(false);
  });
});
