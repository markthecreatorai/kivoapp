// =============================================================
// Unit: mappers (API ⇄ EditorState)
// =============================================================

import { describe, it, expect } from "vitest";
import {
  mapApiToEditorState,
  mapEditorStateToApi,
  __defaults,
} from "@/features/product-editor/mappers";
import type { ApiProductRow, ProductEditorState } from "@/features/product-editor/types";

const baseRow: ApiProductRow = {
  id: "p1",
  workspace_id: "w1",
  type: "LEAD_MAGNET",
  status: "DRAFT",
  name: "Guia",
  short_description: "desc",
  thumbnail_url: "https://x/t.png",
  listing_button_text: "Quero!",
  delivery_mode: "url",
  delivery_url: "https://x/r",
  confirmation_email_subject: "Sub",
  confirmation_email_body: "Body",
  metadata: { format_id: "collect_emails" },
};

describe("mapApiToEditorState", () => {
  it("aplica todos os campos vindos da API", () => {
    const s = mapApiToEditorState(baseRow);
    expect(s.id).toBe("p1");
    expect(s.workspaceId).toBe("w1");
    expect(s.formatId).toBe("collect_emails");
    expect(s.status).toBe("DRAFT");
    expect(s.thumbnailUrl).toBe("https://x/t.png");
    expect(s.name).toBe("Guia");
    expect(s.shortDescription).toBe("desc");
    expect(s.ctaText).toBe("Quero!");
    expect(s.deliveryType).toBe("url");
    expect(s.deliveryUrl).toBe("https://x/r");
    expect(s.deliveryFileUrl).toBe("");
    expect(s.confirmationSubject).toBe("Sub");
    expect(s.confirmationBody).toBe("Body");
    expect(s.meta.isDirty).toBe(false);
    expect(s.meta.saveStatus).toBe("idle");
  });

  it("aplica defaults quando campos faltam", () => {
    const s = mapApiToEditorState({
      id: "p2",
      workspace_id: "w1",
      type: "LEAD_MAGNET",
    });
    expect(s.name).toBe("");
    expect(s.shortDescription).toBe("");
    expect(s.thumbnailUrl).toBe("");
    expect(s.ctaText).toBe(__defaults.DEFAULT_CTA);
    expect(s.confirmationSubject).toBe(__defaults.DEFAULT_SUBJECT);
    expect(s.confirmationBody).toBe(__defaults.DEFAULT_BODY);
    expect(s.deliveryType).toBe("url");
    expect(s.status).toBe("DRAFT");
  });

  it("resolve formatId via metadata.format_id e cai pro type lower", () => {
    expect(mapApiToEditorState({ ...baseRow, metadata: null }).formatId).toBe("lead_magnet");
    expect(
      mapApiToEditorState({ ...baseRow, metadata: { format_id: "digital_product" } }).formatId,
    ).toBe("digital_product");
  });

  it("isola deliveryUrl por modo (url vs file)", () => {
    const sFile = mapApiToEditorState({ ...baseRow, delivery_mode: "file", delivery_url: "https://files/x" });
    expect(sFile.deliveryType).toBe("file");
    expect(sFile.deliveryFileUrl).toBe("https://files/x");
    expect(sFile.deliveryUrl).toBe("");
  });
});

describe("mapEditorStateToApi", () => {
  const base: ProductEditorState = mapApiToEditorState(baseRow);

  it("monta payload completo com campos editáveis", () => {
    const p = mapEditorStateToApi(base);
    expect(p.name).toBe("Guia");
    expect(p.short_description).toBe("desc");
    expect(p.thumbnail_url).toBe("https://x/t.png");
    expect(p.listing_button_text).toBe("Quero!");
    expect(p.delivery_mode).toBe("url");
    expect(p.delivery_url).toBe("https://x/r");
    expect(p.confirmation_email_subject).toBe("Sub");
    expect(p.confirmation_email_body).toBe("Body");
    expect(p.status).toBeUndefined();
  });

  it("inclui status quando passado", () => {
    expect(mapEditorStateToApi(base, { status: "PUBLISHED" }).status).toBe("PUBLISHED");
    expect(mapEditorStateToApi(base, { status: "DRAFT" }).status).toBe("DRAFT");
  });

  it("escolhe deliveryUrl correto conforme deliveryType", () => {
    const fileState: ProductEditorState = {
      ...base,
      deliveryType: "file",
      deliveryUrl: "https://url-ignored",
      deliveryFileUrl: "https://files/keep",
    };
    expect(mapEditorStateToApi(fileState).delivery_url).toBe("https://files/keep");
  });

  it("aplica defaults se campos textuais ficarem vazios", () => {
    const empty: ProductEditorState = {
      ...base,
      ctaText: "",
      confirmationSubject: "",
      confirmationBody: "",
    };
    const p = mapEditorStateToApi(empty);
    expect(p.listing_button_text).toBe(__defaults.DEFAULT_CTA);
    expect(p.confirmation_email_subject).toBe(__defaults.DEFAULT_SUBJECT);
    expect(p.confirmation_email_body).toBe(__defaults.DEFAULT_BODY);
  });

  it("roundtrip API → State → API preserva campos", () => {
    const state = mapApiToEditorState(baseRow);
    const payload = mapEditorStateToApi(state);
    expect(payload.name).toBe(baseRow.name);
    expect(payload.delivery_mode).toBe(baseRow.delivery_mode);
    expect(payload.delivery_url).toBe(baseRow.delivery_url);
  });
});
