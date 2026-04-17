// =============================================================
// E2E do fluxo: /store?tab=loja → "Novo produto" → "Coletar
// Emails" → cria draft → navega para /products/:id/edit.
//
// Cobre:
//   • clique único cria 1 rascunho e navega para /edit
//   • duplo clique no MESMO formato dispara 1 INSERT (idempotência)
//   • erro no insert exibe alerta inline com botão "Tentar novamente"
//     e o retry leva à criação bem-sucedida + navigate
//   • breadcrumb "Voltar à Loja" leva para /store?tab=loja
// =============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// ── Mocks de contextos ───────────────────────────────────────
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "u-1", email: "x@x.com" } }),
}));
vi.mock("@/contexts/WorkspaceProvider", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "ws-1" } }),
}));
vi.mock("@/hooks/usePlanLimits", () => ({
  usePlanLimits: () => ({
    canCreateProduct: true,
    canCreateCourse: true,
    plan: "FREE",
  }),
}));
vi.mock("@/lib/tracking", () => ({
  trackEvent: vi.fn(),
}));
vi.mock("@/components/UpgradeModal", () => ({
  UpgradeModal: () => null,
}));
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// ── Mock controlado do service de criação ────────────────────
const createDraftMock = vi.fn();
vi.mock("@/features/product-editor", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    createProductDraft: (...a: unknown[]) => createDraftMock(...a),
  };
});

// ── Mock do supabase (para o caminho de afiliado, não usado aqui) ─
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
      }),
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

import NewProduct from "@/pages/NewProduct";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/products/new"]}>
      <Routes>
        <Route path="/products/new" element={<NewProduct />} />
        <Route
          path="/products/:id/edit"
          element={<div data-testid="editor-route" />}
        />
        <Route path="/store" element={<div data-testid="store-route" />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  createDraftMock.mockReset();
});

describe("Fluxo: Novo produto → Coletar Emails → Editor", () => {
  it("clique único cria 1 rascunho e navega para /products/:id/edit", async () => {
    createDraftMock.mockResolvedValueOnce({
      productId: "p-1",
      reused: false,
    });

    renderApp();

    const card = screen.getByTestId("np-format-collect_emails");
    fireEvent.click(card);

    await waitFor(() =>
      expect(screen.getByTestId("editor-route")).toBeInTheDocument(),
    );
    expect(createDraftMock).toHaveBeenCalledTimes(1);
    expect(createDraftMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      format: expect.objectContaining({
        id: "collect_emails",
        dbType: "LEAD_MAGNET",
        publishImmediately: false,
      }),
    });
  });

  it("duplo clique no mesmo card dispara apenas 1 chamada (idempotência UX)", async () => {
    let resolveCreate!: (v: unknown) => void;
    createDraftMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveCreate = r;
        }),
    );

    renderApp();

    const card = screen.getByTestId("np-format-collect_emails");
    fireEvent.click(card);
    fireEvent.click(card); // duplo
    fireEvent.click(card); // triplo

    expect(createDraftMock).toHaveBeenCalledTimes(1);

    // estado loading visível
    expect(
      screen.getByTestId("np-loading-collect_emails"),
    ).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-busy", "true");

    resolveCreate({ productId: "p-x", reused: false });

    await waitFor(() =>
      expect(screen.getByTestId("editor-route")).toBeInTheDocument(),
    );
  });

  it("erro mostra alerta com Tentar novamente; retry cria e navega", async () => {
    createDraftMock
      .mockRejectedValueOnce(new Error("rede caiu"))
      .mockResolvedValueOnce({ productId: "p-retry", reused: false });

    renderApp();

    const card = screen.getByTestId("np-format-collect_emails");
    fireEvent.click(card);

    const errorBox = await screen.findByTestId("np-error-collect_emails");
    expect(errorBox).toHaveTextContent(/rede caiu/);

    const retryBtn = screen.getByTestId("np-retry-collect_emails");
    fireEvent.click(retryBtn);

    await waitFor(() =>
      expect(screen.getByTestId("editor-route")).toBeInTheDocument(),
    );
    expect(createDraftMock).toHaveBeenCalledTimes(2);
  });

  it("breadcrumb 'Voltar à Loja' navega para /store?tab=loja", async () => {
    renderApp();
    const back = screen.getByTestId("np-breadcrumb-back");
    fireEvent.click(back);
    await waitFor(() =>
      expect(screen.getByTestId("store-route")).toBeInTheDocument(),
    );
  });
});
