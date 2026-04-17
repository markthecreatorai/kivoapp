// =============================================================
// Suíte QA — lead_magnet_parity_sprint1
//
// Compara o comportamento ALVO (Stan Store, Lead Magnet/Email
// Capture) com o estado ATUAL da Kivo após sprint 1.
//
// Cada caso é um cenário fechado (Arrange / Act / Assert) que
// roda sobre as MESMAS funções consumidas pela UI (mappers,
// reducer, store, contentSchema, formFieldsSchema, migrations,
// publishValidation, productDraftService). Isso garante que o
// "verde" aqui significa o mesmo verde no produto.
//
// Saída acessível ao QA humano:
//   • cada `it` imprime um payload JSON resumido em console.log
//     que é capturado pelo runner (evidência reutilizável em PR).
//   • um teste-âncora final calcula o **% de paridade** somando
//     os cenários passados via PARITY_LEDGER e expõe `gaps`
//     remanescentes para o sprint 2.
//
// Casos obrigatórios cobertos:
//   1) Criar lead magnet desde /store
//   2) Editar Visual (url + upload + fallback)
//   3) Validar limites título / subtítulo / botão
//   4) Adicionar / remover campo adicional
//   5) Required toggle em campo adicional
//   6) Alternar entrega pós-captura (url ↔ file)
//   7) Salvar rascunho, recarregar e manter estado (round-trip)
//   8) Confirmar preview sincronizado em cada tab
// =============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  __resetDraftServiceLocks,
  addField,
  buildSystemFields,
  CONTENT_LIMITS,
  CONTENT_MESSAGES,
  clearDraftRecovery,
  createProductDraft,
  LEAD_MAGNET_CONFIG_VERSION,
  mapApiToEditorState,
  mapEditorStateToApi,
  PreviewSurface,
  removeField,
  setRequired,
  validateContentTab,
  validateLeadMagnetIntegrity,
  type ApiProductRow,
  type CreateDraftInput,
  type ProductEditorState,
} from "@/features/product-editor";

// ── Mock do supabase usado por createProductDraft ───────────
vi.mock("@/integrations/supabase/client", () => {
  const insertMock = vi.fn(async () => ({
    data: { id: `prod-${Math.random().toString(36).slice(2, 8)}` },
    error: null,
  }));
  return {
    supabase: {
      from: () => ({
        insert: () => ({
          select: () => ({ single: insertMock }),
        }),
      }),
    },
    __mocks: { insertMock },
  };
});

// ── Ledger de paridade ─────────────────────────────────────
type ParityCase = {
  id: string;
  title: string;
  status: "pass" | "fail";
  evidence?: Record<string, unknown>;
};
const PARITY_LEDGER: ParityCase[] = [];

function record(c: ParityCase) {
  PARITY_LEDGER.push(c);
  // Evidência estruturada — o runner captura no log do CI
  // eslint-disable-next-line no-console
  console.log(
    `[parity:${c.id}] ${c.status.toUpperCase()} — ${c.title}\n` +
      JSON.stringify(c.evidence ?? {}, null, 2),
  );
}

// ── Fixture base reutilizada ───────────────────────────────
function fixtureRow(overrides: Partial<ApiProductRow> = {}): ApiProductRow {
  return {
    id: "prod-fixture",
    workspace_id: "ws-1",
    type: "LEAD_MAGNET",
    status: "DRAFT",
    name: "Ebook Gratuito",
    short_description: "Capture leads agora",
    thumbnail_url: "https://x.supabase.co/storage/v1/object/public/p/cover.png",
    listing_button_text: "Inscrever",
    delivery_mode: "url",
    delivery_url: "https://exemplo.com/obrigado",
    confirmation_email_subject: "Bem-vindo!",
    confirmation_email_body: "Olá {{nome_cliente}}",
    metadata: {
      format_id: "collect_emails",
      cover_source: "upload",
      thumbnail_upload_url:
        "https://x.supabase.co/storage/v1/object/public/p/cover.png",
      thumbnail_external_url: "",
      leadMagnetConfigVersion: 2,
    },
    ...overrides,
  };
}

beforeEach(() => {
  __resetDraftServiceLocks();
  // limpa sessionStorage entre testes para isolar recovery
  try {
    sessionStorage.clear();
  } catch {
    /* noop em ambientes sem sessionStorage */
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

// =============================================================
// Caso 1 — Criar lead magnet desde /store
// =============================================================
describe("[parity:1] Criar lead magnet desde /store", () => {
  it("idempotente: cliques duplicados produzem o mesmo productId", async () => {
    const input: CreateDraftInput = {
      workspaceId: "ws-1",
      format: {
        id: "collect_emails",
        dbType: "LEAD_MAGNET",
        defaultName: "Novo Lead Magnet",
      },
    };

    const [a, b] = await Promise.all([
      createProductDraft(input),
      createProductDraft(input),
    ]);

    expect(a.productId).toBe(b.productId);
    // Ao menos uma resposta indica reaproveitamento ou ambas têm mesmo id
    expect([a.reused, b.reused].some((x) => x === true) || a.productId === b.productId).toBe(true);

    record({
      id: "1",
      title: "Criação idempotente desde /store → /products/:id/edit",
      status: "pass",
      evidence: {
        workspaceId: input.workspaceId,
        formatId: input.format.id,
        firstClick: a,
        secondClick: b,
        sameId: a.productId === b.productId,
      },
    });

    clearDraftRecovery(input);
  });
});

// =============================================================
// Caso 2 — Editar Visual (url + upload/fallback)
// =============================================================
describe("[parity:2] Editar Visual (url + upload + fallback)", () => {
  it("preserva os dois buckets (upload/url) e respeita modo ativo", () => {
    const row = fixtureRow({
      thumbnail_url: "https://cdn.exterior.com/external.png",
      metadata: {
        format_id: "collect_emails",
        cover_source: "url",
        thumbnail_external_url: "https://cdn.exterior.com/external.png",
        thumbnail_upload_url:
          "https://x.supabase.co/storage/v1/object/public/p/old-upload.png",
        leadMagnetConfigVersion: 2,
      },
    });
    const state = mapApiToEditorState(row);

    // A leitura preserva o último valor dos DOIS modos
    expect(state.coverSource).toBe("url");
    expect(state.thumbnailExternalUrl).toBe("https://cdn.exterior.com/external.png");
    expect(state.thumbnailUploadUrl).toBe(
      "https://x.supabase.co/storage/v1/object/public/p/old-upload.png",
    );

    // Trocar para upload na escrita usa o thumbnailUploadUrl como efetivo
    const switched: ProductEditorState = { ...state, coverSource: "upload" };
    const payload = mapEditorStateToApi(switched, { prevMetadata: row.metadata! });
    expect(payload.thumbnail_url).toBe(
      "https://x.supabase.co/storage/v1/object/public/p/old-upload.png",
    );
    expect(payload.metadata?.cover_source).toBe("upload");

    // Fallback visual: capa vazia em ambos os modos publica sem thumb
    const empty: ProductEditorState = {
      ...state,
      thumbnailUrl: "",
      thumbnailExternalUrl: "",
      thumbnailUploadUrl: "",
    };
    const emptyReport = validateLeadMagnetIntegrity(empty);
    expect(emptyReport.ok).toBe(true);
    expect(emptyReport.warnings.some((w) => w.code === "thumbnail.missing")).toBe(true);

    record({
      id: "2",
      title: "Visual: ambos modos preservados + fallback de capa",
      status: "pass",
      evidence: {
        afterRead: {
          coverSource: state.coverSource,
          uploadBucket: state.thumbnailUploadUrl,
          urlBucket: state.thumbnailExternalUrl,
        },
        afterSwitch: { effective: payload.thumbnail_url, mode: payload.metadata?.cover_source },
        emptyFallback: {
          warnings: emptyReport.warnings.map((w) => w.code),
        },
      },
    });
  });
});

// =============================================================
// Caso 3 — Validar limites título / subtítulo / botão
// =============================================================
describe("[parity:3] Limites de conteúdo (Title 50 / Subtitle 100 / CTA 30)", () => {
  it("aceita no limite e rejeita quando excede", () => {
    const ok = validateContentTab({
      name: "a".repeat(CONTENT_LIMITS.name),
      shortDescription: "b".repeat(CONTENT_LIMITS.shortDescription),
      ctaText: "c".repeat(CONTENT_LIMITS.ctaText),
    });
    expect(ok.isValid).toBe(true);

    const fail = validateContentTab({
      name: "a".repeat(CONTENT_LIMITS.name + 1),
      shortDescription: "b".repeat(CONTENT_LIMITS.shortDescription + 1),
      ctaText: "c".repeat(CONTENT_LIMITS.ctaText + 1),
    });
    expect(fail.isValid).toBe(false);
    expect(fail.errors.name).toBe(CONTENT_MESSAGES.name.max);
    expect(fail.errors.shortDescription).toBe(CONTENT_MESSAGES.shortDescription.max);
    expect(fail.errors.ctaText).toBe(CONTENT_MESSAGES.ctaText.max);

    const required = validateContentTab({ name: "  ", shortDescription: "", ctaText: "" });
    expect(required.errors.name).toBe(CONTENT_MESSAGES.name.required);
    expect(required.errors.ctaText).toBe(CONTENT_MESSAGES.ctaText.required);

    record({
      id: "3",
      title: "Limites de conteúdo + required messages pt-BR",
      status: "pass",
      evidence: {
        limits: CONTENT_LIMITS,
        boundaryAccepted: ok.isValid,
        overflowErrors: fail.errors,
        requiredErrors: required.errors,
      },
    });
  });
});

// =============================================================
// Caso 4 — Adicionar / remover campo adicional
// =============================================================
describe("[parity:4] CRUD de campos adicionais", () => {
  it("adiciona, atualiza e remove sem perder Nome/Email travados", () => {
    let fields = buildSystemFields();
    expect(fields.map((f) => f.field_key)).toEqual(["name", "email"]);

    fields = addField(fields, {
      field_type: "phone",
      label: "WhatsApp",
      is_required: false,
    });
    expect(fields).toHaveLength(3);
    expect(fields.at(-1)?.field_type).toBe("phone");
    expect(fields.at(-1)?.is_system).toBe(false);

    const phoneId = fields.at(-1)!.id;
    fields = removeField(fields, phoneId);
    expect(fields).toHaveLength(2);
    // Tentar remover system field é no-op
    fields = removeField(fields, "system-name");
    expect(fields.find((f) => f.field_key === "name")).toBeTruthy();

    record({
      id: "4",
      title: "CRUD de campos adicionais respeita system fields",
      status: "pass",
      evidence: {
        afterAdd: 3,
        afterRemove: 2,
        systemPreserved: ["name", "email"],
      },
    });
  });
});

// =============================================================
// Caso 5 — Required toggle em campo adicional
// =============================================================
describe("[parity:5] Required toggle em campo adicional", () => {
  it("alterna required apenas em campos custom", () => {
    let fields = addField(buildSystemFields(), {
      field_type: "text",
      label: "Empresa",
      is_required: false,
    });
    const customId = fields.at(-1)!.id;

    fields = setRequired(fields, customId, true);
    expect(fields.find((f) => f.id === customId)?.is_required).toBe(true);

    fields = setRequired(fields, customId, false);
    expect(fields.find((f) => f.id === customId)?.is_required).toBe(false);

    // Setar required em system NÃO altera (Nome/Email permanecem true)
    fields = setRequired(fields, "system-email", false);
    expect(fields.find((f) => f.field_key === "email")?.is_required).toBe(true);

    record({
      id: "5",
      title: "Required toggle respeita system lock",
      status: "pass",
      evidence: { customToggled: true, systemLocked: true },
    });
  });
});

// =============================================================
// Caso 6 — Alternar entrega pós-captura
// =============================================================
describe("[parity:6] Entrega pós-captura: url ↔ file", () => {
  it("preserva valores de cada bucket ao alternar e valida URL", () => {
    const state = mapApiToEditorState(fixtureRow());

    // url → file mantém a URL salva quando voltar
    const asFile: ProductEditorState = {
      ...state,
      deliveryType: "file",
      deliveryFileUrl: "https://x.supabase.co/storage/v1/object/public/files/x.pdf",
    };
    const payloadFile = mapEditorStateToApi(asFile, { prevMetadata: fixtureRow().metadata! });
    expect(payloadFile.delivery_mode).toBe("file");
    expect(payloadFile.delivery_url).toContain("x.pdf");

    // Voltar para url usa o bucket de URL preservado
    const asUrl: ProductEditorState = { ...asFile, deliveryType: "url" };
    const payloadUrl = mapEditorStateToApi(asUrl, { prevMetadata: fixtureRow().metadata! });
    expect(payloadUrl.delivery_mode).toBe("url");
    expect(payloadUrl.delivery_url).toBe("https://exemplo.com/obrigado");

    // Validação de URL inválida bloqueia publish
    const broken: ProductEditorState = { ...state, deliveryType: "url", deliveryUrl: "ftp://x" };
    const r = validateLeadMagnetIntegrity(broken);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.code === "deliveryUrl.invalid")).toBe(true);

    record({
      id: "6",
      title: "Alternância url↔file preserva buckets + validação P0",
      status: "pass",
      evidence: {
        roundTrip: { file: payloadFile.delivery_url, url: payloadUrl.delivery_url },
        invalidProtocolBlocked: true,
      },
    });
  });
});

// =============================================================
// Caso 7 — Salvar rascunho, recarregar e manter estado
// =============================================================
describe("[parity:7] Round-trip API → UI → API sem perda", () => {
  it("re-emissão é estruturalmente equivalente ao original carimbado em v2", () => {
    const original = fixtureRow();
    const state = mapApiToEditorState(original);
    const payload = mapEditorStateToApi(state, { prevMetadata: original.metadata! });

    // Reconstruímos uma "row simulada após save" para reidratar
    const reloaded = fixtureRow({
      name: payload.name,
      short_description: payload.short_description,
      thumbnail_url: payload.thumbnail_url,
      listing_button_text: payload.listing_button_text,
      delivery_mode: payload.delivery_mode,
      delivery_url: payload.delivery_url,
      confirmation_email_subject: payload.confirmation_email_subject,
      confirmation_email_body: payload.confirmation_email_body,
      metadata: payload.metadata!,
    });
    const state2 = mapApiToEditorState(reloaded);

    // Comparação ignora apenas meta (timestamps)
    const stripMeta = (s: ProductEditorState) => {
      const { meta, ...rest } = s;
      return rest;
    };
    expect(stripMeta(state2)).toEqual(stripMeta(state));
    expect(payload.metadata?.leadMagnetConfigVersion).toBe(LEAD_MAGNET_CONFIG_VERSION);

    record({
      id: "7",
      title: "Save → reload → state idêntico (sem perda) + versão v2 estável",
      status: "pass",
      evidence: {
        version: payload.metadata?.leadMagnetConfigVersion,
        deltaKeys: [],
        preservedFields: Object.keys(stripMeta(state)),
      },
    });
  });
});

// =============================================================
// Caso 8 — Preview sincronizado em cada tab
// =============================================================
describe("[parity:8] Preview reflete o estado em cada aba", () => {
  it("renderiza thumb/título/subtítulo/CTA + Grátis no preview do Lead Magnet", () => {
    const fields = buildSystemFields();
    const baseProps = {
      thumbnailUrl: "https://x.supabase.co/storage/v1/object/public/p/cover.png",
      name: "Meu Ebook",
      shortDescription: "Curto e prático",
      ctaText: "Quero acesso",
      formFields: fields,
      isLeadMagnet: true as const,
    };

    // Surface "visual"
    const v = render(<PreviewSurface surface="visual" {...baseProps} />);
    expect(v.queryByTestId("preview-thumb")).toBeInTheDocument();
    expect(v.queryByTestId("preview-title")?.textContent).toContain("Meu Ebook");
    expect(v.queryByTestId("preview-cta")?.textContent).toContain("Quero acesso");
    v.unmount();

    // Surface "conteudo"
    const c = render(<PreviewSurface surface="conteudo" {...baseProps} />);
    expect(c.queryByTestId("preview-subtitle")?.textContent).toContain("Curto e prático");
    c.unmount();

    // Surface "config" — campos base + badge "Grátis" aparecem
    const cfg = render(<PreviewSurface surface="config" {...baseProps} />);
    expect(cfg.queryByTestId("preview-name")).toBeInTheDocument();
    expect(cfg.queryByTestId("preview-email")).toBeInTheDocument();
    expect(cfg.queryByTestId("preview-free-badge")?.textContent).toContain(
      "Grátis",
    );
    cfg.unmount();

    record({
      id: "8",
      title: "Preview sincronizado nas 3 abas (visual/conteudo/config)",
      status: "pass",
      evidence: {
        surfaces: ["visual", "conteudo", "config"],
        rendered: [
          "preview-thumb",
          "preview-title",
          "preview-subtitle",
          "preview-cta",
          "preview-name",
          "preview-email",
          "preview-free-badge",
        ],
      },
    });
  });
});

// =============================================================
// Âncora final — Relatório de paridade + gaps sprint 2
// =============================================================
describe("[parity:report] Relatório de paridade Stan ↔ Kivo", () => {
  /** Cenários do roteiro QA — ordem importa para o relatório. */
  const REQUIRED_CASES = [
    "1", // Criar lead magnet desde /store
    "2", // Editar Visual (url + upload + fallback)
    "3", // Limites título/subtítulo/botão
    "4", // Add/remove campo adicional
    "5", // Required toggle
    "6", // Alternar entrega pós-captura
    "7", // Save + reload mantém estado
    "8", // Preview sincronizado em cada tab
  ];

  /** Gaps deliberadamente NÃO cobertos no sprint 1. */
  const SPRINT2_GAPS = [
    "Engine completa de drip (sequências, agendamento, condições)",
    "Automação externa de email flow Pro (provider integrations)",
    "Rich text editor avançado para corpo do email de confirmação",
    "Builder de opções (multi-choice/dropdown/checkbox) com reordenação por drag",
    "Pré-visualização do email de confirmação dentro do editor",
    "A/B test de CTA / copy do lead magnet",
    "Reviews (UI parcial; sem persistência)",
  ];

  it("imprime % de paridade e lista gaps de sprint 2", () => {
    const passed = PARITY_LEDGER.filter((c) => c.status === "pass").map((c) => c.id);
    const missing = REQUIRED_CASES.filter((id) => !passed.includes(id));
    const parityPct = Math.round((passed.length / REQUIRED_CASES.length) * 100);

    // Snapshot legível para PR/CI:
    // eslint-disable-next-line no-console
    console.log(
      "\n=========== LEAD MAGNET PARITY — SPRINT 1 ===========\n" +
        `Casos cobertos: ${passed.length}/${REQUIRED_CASES.length}\n` +
        `Paridade: ${parityPct}%\n` +
        `Faltando neste sprint: ${missing.length === 0 ? "—" : missing.join(", ")}\n` +
        `Gaps planejados para sprint 2:\n  • ${SPRINT2_GAPS.join("\n  • ")}\n` +
        "====================================================\n",
    );

    expect(missing).toEqual([]);
    expect(parityPct).toBe(100);
  });
});
