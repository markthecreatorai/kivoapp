// =============================================================
// Lead Magnet — versionamento, migração e validação de integridade
//
// Cobre, com fixtures realistas:
//   1) produto LEGADO da Kivo (v0 implícito) sobe para v2 corretamente
//   2) produto v1 (com cover_source mas sem sentinela) sobe para v2
//   3) produto v2 (atual com campos avançados) é no-op idempotente
//   4) round-trip API → UI → API preserva metadata desconhecida
//      e nunca regride a versão
//   5) validação de integridade bloqueia publish quando inválido
//   6) validação aceita estado completo
// =============================================================

import { describe, expect, it } from "vitest";
import {
  LEAD_MAGNET_CONFIG_VERSION,
  mapApiToEditorState,
  mapEditorStateToApi,
  migrateApiRowToCurrent,
  readConfigVersion,
  validateLeadMagnetIntegrity,
} from "@/features/product-editor";
import type {
  ApiProductRow,
  ProductEditorState,
} from "@/features/product-editor/types";

// ── Fixtures ─────────────────────────────────────────────────

/** Produto antigo: sem metadata estruturada, thumbnail externa,
 *  delivery_mode ausente. Representa registros pré-2025. */
const LEGACY_ROW: ApiProductRow = {
  id: "prod-legacy-1",
  workspace_id: "ws-1",
  type: "LEAD_MAGNET",
  status: "DRAFT",
  name: "Ebook gratuito",
  short_description: "Capture leads com este ebook",
  thumbnail_url: "https://cdn.exterior.com/legacy.png",
  listing_button_text: "Quero o ebook",
  delivery_mode: null,
  delivery_url: null,
  confirmation_email_subject: null,
  confirmation_email_body: null,
  metadata: null,
};

/** Produto v1: já tem cover_source separado, mas sem sentinela. */
const V1_ROW: ApiProductRow = {
  id: "prod-v1",
  workspace_id: "ws-1",
  type: "LEAD_MAGNET",
  status: "PUBLISHED",
  name: "Mini-curso",
  short_description: "Aulas iniciantes",
  thumbnail_url: "https://x.supabase.co/storage/v1/object/public/p/img.png",
  listing_button_text: "Inscrever-se",
  delivery_mode: "url",
  delivery_url: "https://exemplo.com/obrigado",
  confirmation_email_subject: "Bem-vindo",
  confirmation_email_body: "Olá {{nome_cliente}}",
  metadata: {
    format_id: "collect_emails",
    cover_source: "upload",
    thumbnail_upload_url:
      "https://x.supabase.co/storage/v1/object/public/p/img.png",
    thumbnail_external_url: "",
    // chave desconhecida que devemos preservar
    legacy_extra: { campaign: "abc" },
  },
};

/** Produto v2 atual: sentinela explícita + campos avançados. */
const V2_ROW: ApiProductRow = {
  id: "prod-v2",
  workspace_id: "ws-1",
  type: "LEAD_MAGNET",
  status: "PUBLISHED",
  name: "Lead magnet completo",
  short_description: "Tudo configurado",
  thumbnail_url: "https://x.supabase.co/storage/v1/object/public/p/v2.png",
  listing_button_text: "Quero acesso",
  delivery_mode: "file",
  delivery_url: "https://x.supabase.co/storage/v1/object/public/files/x.pdf",
  confirmation_email_subject: "Aqui está seu material",
  confirmation_email_body: "Conteúdo personalizado",
  metadata: {
    format_id: "collect_emails",
    cover_source: "upload",
    thumbnail_upload_url:
      "https://x.supabase.co/storage/v1/object/public/p/v2.png",
    thumbnail_external_url: "",
    leadMagnetConfigVersion: 2,
    formFieldsSnapshot: [],
    // chaves futuras simuladas
    experiments: { variant: "B" },
  },
};

// ── 1) Detecção de versão ────────────────────────────────────
describe("readConfigVersion", () => {
  it("retorna 0 para metadata vazia/null (legado)", () => {
    expect(readConfigVersion(null)).toBe(0);
    expect(readConfigVersion({})).toBe(0);
  });

  it("retorna 1 quando há cover_source mas sem sentinela", () => {
    expect(readConfigVersion({ cover_source: "upload" })).toBe(1);
  });

  it("respeita sentinela explícita", () => {
    expect(readConfigVersion({ leadMagnetConfigVersion: 2 })).toBe(2);
    expect(readConfigVersion({ leadMagnetConfigVersion: 1 })).toBe(1);
    expect(readConfigVersion({ leadMagnetConfigVersion: 0 })).toBe(0);
  });
});

// ── 2) Migration layer ───────────────────────────────────────
describe("migrateApiRowToCurrent", () => {
  it("v0 (legado) → v2 com classificação correta de cover_source", () => {
    const { row, fromVersion, toVersion, steps } =
      migrateApiRowToCurrent(LEGACY_ROW);

    expect(fromVersion).toBe(0);
    expect(toVersion).toBe(LEAD_MAGNET_CONFIG_VERSION);
    // URL externa (não bucket Kivo) → cover_source = "url"
    expect(row.metadata?.cover_source).toBe("url");
    expect(row.metadata?.thumbnail_external_url).toBe(
      "https://cdn.exterior.com/legacy.png",
    );
    expect(row.metadata?.thumbnail_upload_url).toBe("");
    expect(row.metadata?.format_id).toBe("lead_magnet");
    expect(row.delivery_mode).toBe("url");
    expect(row.metadata?.leadMagnetConfigVersion).toBe(2);
    expect(steps).toEqual(
      expect.arrayContaining([
        "v0->v1:format_id-derived",
        "v0->v1:cover_source-classified",
        "v0->v1:delivery_mode-defaulted",
        "v1->v2:version-stamped",
        "v1->v2:formFieldsSnapshot-initialized",
      ]),
    );
  });

  it("v1 → v2 preserva chaves desconhecidas e carimba versão", () => {
    const { row, fromVersion, toVersion } = migrateApiRowToCurrent(V1_ROW);
    expect(fromVersion).toBe(1);
    expect(toVersion).toBe(2);
    expect(row.metadata?.leadMagnetConfigVersion).toBe(2);
    expect(row.metadata?.legacy_extra).toEqual({ campaign: "abc" });
    expect(row.metadata?.cover_source).toBe("upload");
  });

  it("v2 é idempotente — re-rodar não altera nada relevante", () => {
    const first = migrateApiRowToCurrent(V2_ROW);
    const second = migrateApiRowToCurrent(first.row);
    expect(first.fromVersion).toBe(2);
    expect(second.fromVersion).toBe(2);
    expect(second.steps).toEqual([]);
    expect(second.row.metadata?.experiments).toEqual({ variant: "B" });
  });

  it("classifica thumbnail de bucket Kivo como upload", () => {
    const row: ApiProductRow = {
      ...LEGACY_ROW,
      thumbnail_url:
        "https://x.supabase.co/storage/v1/object/public/products/abc.png",
    };
    const { row: out } = migrateApiRowToCurrent(row);
    expect(out.metadata?.cover_source).toBe("upload");
    expect(out.metadata?.thumbnail_upload_url).toContain("abc.png");
  });
});

// ── 3) Round-trip API → UI → API ─────────────────────────────
describe("Round-trip API → UI → API", () => {
  it("legado: estado hidratado e re-emitido carimba v2 sem perder thumb externa", () => {
    const state = mapApiToEditorState(LEGACY_ROW);

    // Migration aplicou: cover_source = "url", external_url preenchido
    expect(state.coverSource).toBe("url");
    expect(state.thumbnailExternalUrl).toBe(
      "https://cdn.exterior.com/legacy.png",
    );
    expect(state.deliveryType).toBe("url");

    // Round-trip preserva metadata previamente conhecida
    const payload = mapEditorStateToApi(state, {
      prevMetadata: { format_id: "collect_emails", legacy_extra: { x: 1 } },
    });
    expect(payload.metadata?.leadMagnetConfigVersion).toBe(2);
    expect(payload.metadata?.format_id).toBe("collect_emails");
    expect(payload.metadata?.legacy_extra).toEqual({ x: 1 });
    expect(payload.metadata?.cover_source).toBe("url");
    expect(payload.thumbnail_url).toBe("https://cdn.exterior.com/legacy.png");
  });

  it("v2 com avançados: round-trip sem perda de chaves desconhecidas", () => {
    const state = mapApiToEditorState(V2_ROW);
    const payload = mapEditorStateToApi(state, {
      prevMetadata: V2_ROW.metadata!,
    });

    expect(payload.metadata?.experiments).toEqual({ variant: "B" });
    expect(payload.metadata?.leadMagnetConfigVersion).toBe(2);
    expect(payload.delivery_mode).toBe("file");
    expect(payload.delivery_url).toBe(
      "https://x.supabase.co/storage/v1/object/public/files/x.pdf",
    );
  });

  it("escrita NUNCA regride versão — input com v=1 sai com v=2", () => {
    const state = mapApiToEditorState(V1_ROW);
    const payload = mapEditorStateToApi(state, {
      prevMetadata: { ...V1_ROW.metadata, leadMagnetConfigVersion: 1 },
    });
    expect(payload.metadata?.leadMagnetConfigVersion).toBe(2);
  });
});

// ── 4) Validação de integridade pré-publish ──────────────────
describe("validateLeadMagnetIntegrity", () => {
  const valid: ProductEditorState = mapApiToEditorState(V2_ROW);

  it("aceita estado v2 completo", () => {
    const r = validateLeadMagnetIntegrity(valid);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("bloqueia: nome vazio + cta vazio + delivery url inválida", () => {
    const broken: ProductEditorState = {
      ...valid,
      name: "  ",
      ctaText: "",
      deliveryType: "url",
      deliveryUrl: "javascript:alert(1)",
    };
    const r = validateLeadMagnetIntegrity(broken);
    expect(r.ok).toBe(false);
    const codes = r.errors.map((e) => e.code).sort();
    expect(codes).toEqual(
      expect.arrayContaining([
        "ctaText.required",
        "deliveryUrl.invalid",
        "name.required",
      ]),
    );
  });

  it("bloqueia: file delivery sem arquivo", () => {
    const broken: ProductEditorState = {
      ...valid,
      deliveryType: "file",
      deliveryFileUrl: "",
    };
    const r = validateLeadMagnetIntegrity(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "deliveryFileUrl.required")).toBe(
      true,
    );
  });

  it("bloqueia: limites de tamanho excedidos", () => {
    const broken: ProductEditorState = {
      ...valid,
      name: "a".repeat(60),
      ctaText: "b".repeat(40),
      shortDescription: "c".repeat(120),
    };
    const r = validateLeadMagnetIntegrity(broken);
    expect(r.ok).toBe(false);
    const codes = r.errors.map((e) => e.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        "name.tooLong",
        "ctaText.tooLong",
        "shortDescription.tooLong",
      ]),
    );
  });

  it("warning (não bloqueia) quando capa ausente", () => {
    const noCover: ProductEditorState = {
      ...valid,
      thumbnailUploadUrl: "",
      thumbnailExternalUrl: "",
      thumbnailUrl: "",
    };
    const r = validateLeadMagnetIntegrity(noCover);
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.code === "thumbnail.missing")).toBe(true);
  });
});
