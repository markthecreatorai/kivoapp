// =============================================================
// Aba Conteúdo — schema central + sincronização com preview
// e bloqueio de avanço/publicação.
// =============================================================

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CONTENT_LIMITS,
  CONTENT_MESSAGES,
  ProductEditorProvider,
  selectContentTab,
  selectPreview,
  useProductEditor,
  validateContentTab,
  type ApiProductRow,
  type SaveAdapter,
} from "@/features/product-editor";

// ── unit: schema central ───────────────────────────────────
describe("validateContentTab — schema central", () => {
  it("rejeita título vazio com mensagem pt-BR", () => {
    const r = validateContentTab({ name: "", shortDescription: "", ctaText: "Comprar" });
    expect(r.isValid).toBe(false);
    expect(r.errors.name).toBe(CONTENT_MESSAGES.name.required);
  });

  it("rejeita título só com espaços (trim)", () => {
    const r = validateContentTab({ name: "   ", shortDescription: "", ctaText: "ok" });
    expect(r.isValid).toBe(false);
    expect(r.errors.name).toBe(CONTENT_MESSAGES.name.required);
  });

  it("rejeita título acima de 50 chars", () => {
    const r = validateContentTab({
      name: "x".repeat(CONTENT_LIMITS.name + 1),
      shortDescription: "",
      ctaText: "ok",
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.name).toBe(CONTENT_MESSAGES.name.max);
  });

  it("aceita título exatamente em 50 chars", () => {
    const r = validateContentTab({
      name: "x".repeat(CONTENT_LIMITS.name),
      shortDescription: "",
      ctaText: "ok",
    });
    expect(r.isValid).toBe(true);
  });

  it("subtítulo é opcional (vazio OK)", () => {
    const r = validateContentTab({ name: "ok", shortDescription: "", ctaText: "ok" });
    expect(r.isValid).toBe(true);
  });

  it("rejeita subtítulo acima de 100 chars", () => {
    const r = validateContentTab({
      name: "ok",
      shortDescription: "y".repeat(CONTENT_LIMITS.shortDescription + 1),
      ctaText: "ok",
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.shortDescription).toBe(CONTENT_MESSAGES.shortDescription.max);
  });

  it("CTA vazio é inválido", () => {
    const r = validateContentTab({ name: "ok", shortDescription: "", ctaText: "" });
    expect(r.isValid).toBe(false);
    expect(r.errors.ctaText).toBe(CONTENT_MESSAGES.ctaText.required);
  });

  it("CTA acima de 30 chars é inválido", () => {
    const r = validateContentTab({
      name: "ok",
      shortDescription: "",
      ctaText: "z".repeat(CONTENT_LIMITS.ctaText + 1),
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.ctaText).toBe(CONTENT_MESSAGES.ctaText.max);
  });

  it("agrega múltiplos erros de uma vez", () => {
    const r = validateContentTab({ name: "", shortDescription: "", ctaText: "" });
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.ctaText).toBeTruthy();
  });
});

// ── integração: sincronização com preview ──────────────────
const baseRow: ApiProductRow = {
  id: "p1",
  workspace_id: "w1",
  type: "LEAD_MAGNET",
  status: "DRAFT",
  name: "Título inicial",
  short_description: "Sub inicial",
  listing_button_text: "Quero acessar",
  delivery_mode: "url",
  delivery_url: "https://x",
};

function makeSaveAdapter(): SaveAdapter {
  return { save: vi.fn(async () => {}) };
}

function PreviewProbe({
  onReady,
}: {
  onReady: (api: ReturnType<typeof useProductEditor>) => void;
}) {
  const api = useProductEditor();
  onReady(api);
  const c = selectContentTab(api.state);
  const p = selectPreview(api.state);
  return (
    <div>
      <span data-testid="c-name">{c.name}</span>
      <span data-testid="c-cta">{c.ctaText}</span>
      <span data-testid="c-sub">{c.shortDescription}</span>
      <span data-testid="p-name">{p.name}</span>
      <span data-testid="p-cta">{p.ctaText}</span>
      <span data-testid="p-sub">{p.shortDescription}</span>
    </div>
  );
}

describe("Sincronização aba Conteúdo ↔ Preview", () => {
  it("editar título atualiza imediatamente o preview", () => {
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={baseRow} adapter={makeSaveAdapter()}>
        <PreviewProbe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );
    expect(screen.getByTestId("p-name").textContent).toBe("Título inicial");
    act(() => api.patch({ name: "Novo Título" }));
    expect(screen.getByTestId("c-name").textContent).toBe("Novo Título");
    expect(screen.getByTestId("p-name").textContent).toBe("Novo Título");
  });

  it("editar CTA propaga para preview", () => {
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={baseRow} adapter={makeSaveAdapter()}>
        <PreviewProbe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );
    act(() => api.patch({ ctaText: "Baixar agora" }));
    expect(screen.getByTestId("p-cta").textContent).toBe("Baixar agora");
  });

  it("editar subtítulo propaga para preview", () => {
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={baseRow} adapter={makeSaveAdapter()}>
        <PreviewProbe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );
    act(() => api.patch({ shortDescription: "Novo sub" }));
    expect(screen.getByTestId("p-sub").textContent).toBe("Novo sub");
  });
});

// ── integração: limites e bloqueio publicação no fluxo ─────
import CollectEmailsFlow from "@/pages/editor/CollectEmailsFlow";

vi.mock("@/hooks/useStorefrontTheme", () => ({
  useStorefrontTheme: () => ({
    primary: "#000",
    background: "#fff",
    text: "#111",
    accent: "#444",
  }),
}));

vi.mock("@/components/FormFieldsBuilder", () => ({
  FormFieldsBuilder: () => <div data-testid="ff-builder" />,
}));
vi.mock("@/components/ReviewsBuilder", () => ({
  ReviewsBuilder: () => <div data-testid="rv-builder" />,
}));
vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange }: any) => (
    <textarea data-testid="rich" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";

function renderFlow(initialRow: ApiProductRow = baseRow) {
  const setSaving = vi.fn();
  const qc = new QueryClient();
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ProductEditorProvider initialRow={initialRow} adapter={makeSaveAdapter()}>
          <CollectEmailsFlow
            initialProduct={{ id: initialRow.id, type: "LEAD_MAGNET" }}
            setSaving={setSaving}
          />
        </ProductEditorProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return utils;
}

describe("CollectEmailsFlow — aba Conteúdo (UI + bloqueio)", () => {
  // Radix Tabs em jsdom requer pointerdown para alternar
  const goToTab = (name: RegExp) => {
    const tab = screen.getByRole("tab", { name });
    fireEvent.pointerDown(tab, { button: 0, ctrlKey: false });
    fireEvent.mouseDown(tab);
    fireEvent.click(tab);
  };

  const titleInput = () => document.getElementById("lm-title") as HTMLInputElement;
  const subInput = () => document.getElementById("lm-subtitle") as HTMLTextAreaElement;
  const ctaInput = () => document.getElementById("lm-cta") as HTMLInputElement;

  it("renderiza contadores e mensagens de validação inline ao limpar título", () => {
    renderFlow();
    goToTab(/Conteúdo/i);
    const t = titleInput();
    expect(t).not.toBeNull();
    fireEvent.change(t, { target: { value: "" } });
    expect(screen.getByText(CONTENT_MESSAGES.name.required)).toBeTruthy();
    expect(screen.getByText(`0/${CONTENT_LIMITS.name}`)).toBeTruthy();
  });

  it("CTA vazio mostra erro inline e desabilita Avançar", () => {
    renderFlow();
    goToTab(/Conteúdo/i);
    const c = ctaInput();
    expect(c).not.toBeNull();
    fireEvent.change(c, { target: { value: "" } });
    expect(screen.getByText(CONTENT_MESSAGES.ctaText.required)).toBeTruthy();
    const next = screen.getByRole("button", { name: /Avançar/i });
    expect(next).toBeDisabled();
  });

  it("placeholders da Kivo são preservados quando campos vazios", () => {
    renderFlow({
      ...baseRow,
      name: "",
      short_description: "",
      listing_button_text: "",
    });
    goToTab(/Conteúdo/i);
    expect(titleInput().placeholder).toMatch(/Guia Rápido/i);
    expect(subInput().placeholder).toMatch(/recompensa/i);
    expect(ctaInput().placeholder).toMatch(/Inscrever/i);
  });

  it("publicar é bloqueado quando título inválido (sem chamar adapter)", async () => {
    const adapter: SaveAdapter = { save: vi.fn(async () => {}) };
    const setSaving = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ProductEditorProvider initialRow={{ ...baseRow, name: "" }} adapter={adapter}>
            <CollectEmailsFlow
              initialProduct={{ id: "p1", type: "LEAD_MAGNET" }}
              setSaving={setSaving}
            />
          </ProductEditorProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    goToTab(/Configuração/i);
    const publish = screen.getByRole("button", { name: /Publicar/i });
    expect(publish).toBeDisabled();

    await act(async () => {
      fireEvent.click(publish);
    });
    expect(adapter.save).not.toHaveBeenCalled();
  });

  it("inputs aplicam maxLength via atributo HTML", () => {
    renderFlow();
    goToTab(/Conteúdo/i);
    expect(titleInput().maxLength).toBe(CONTENT_LIMITS.name);
    expect(subInput().maxLength).toBe(CONTENT_LIMITS.shortDescription);
    expect(ctaInput().maxLength).toBe(CONTENT_LIMITS.ctaText);
  });
});
