// =============================================================
// Integração: persistência entre tabs
// Garante que edições feitas em uma aba aparecem em selectors
// de outra aba e que o save consome o estado canônico unificado.
// =============================================================

import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  ProductEditorProvider,
  selectContentTab,
  selectConfigTab,
  selectPreview,
  useProductEditor,
} from "@/features/product-editor";
import type {
  ApiProductRow,
  ApiProductUpdatePayload,
  SaveAdapter,
} from "@/features/product-editor";

const initialRow: ApiProductRow = {
  id: "p1",
  workspace_id: "w1",
  type: "LEAD_MAGNET",
  status: "DRAFT",
  name: "Inicial",
  thumbnail_url: "",
  delivery_mode: "url",
  delivery_url: "",
};

function makeAdapter() {
  const calls: { id: string; payload: ApiProductUpdatePayload }[] = [];
  const adapter: SaveAdapter = {
    save: vi.fn(async (id, payload) => {
      calls.push({ id, payload });
    }),
  };
  return { adapter, calls };
}

/** Componente sonda que expõe o store + 3 abas independentes lendo via selectors. */
function Probe({ onReady }: { onReady: (api: ReturnType<typeof useProductEditor>) => void }) {
  const api = useProductEditor();
  // expõe o último valor para o teste manipular
  onReady(api);
  const content = selectContentTab(api.state);
  const config = selectConfigTab(api.state);
  const preview = selectPreview(api.state);
  return (
    <div>
      <span data-testid="content-name">{content.name}</span>
      <span data-testid="config-delivery">{config.deliveryType}</span>
      <span data-testid="preview-name">{preview.name}</span>
      <span data-testid="preview-thumb">{preview.thumbnailUrl}</span>
      <span data-testid="dirty">{String(api.state.meta.isDirty)}</span>
      <span data-testid="status">{api.state.meta.saveStatus}</span>
    </div>
  );
}

describe("ProductEditor — persistência entre tabs", () => {
  it("uma edição na aba Conteúdo aparece imediatamente nos selectors da aba Visual/preview", () => {
    const { adapter } = makeAdapter();
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={initialRow} adapter={adapter}>
        <Probe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    expect(screen.getByTestId("preview-name").textContent).toBe("Inicial");
    expect(screen.getByTestId("dirty").textContent).toBe("false");

    act(() => {
      api.patch({ name: "Editado" });
    });

    expect(screen.getByTestId("content-name").textContent).toBe("Editado");
    expect(screen.getByTestId("preview-name").textContent).toBe("Editado");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
  });

  it("edições em abas diferentes coexistem no mesmo estado canônico (sem duplicação)", () => {
    const { adapter } = makeAdapter();
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={initialRow} adapter={adapter}>
        <Probe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    act(() => {
      api.patch({ name: "Aba Conteúdo" });
    });
    act(() => {
      api.patch({ thumbnailUrl: "https://x/img.png" });
    });
    act(() => {
      api.patch({ deliveryType: "file", deliveryFileUrl: "https://files/x" });
    });

    expect(screen.getByTestId("content-name").textContent).toBe("Aba Conteúdo");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://x/img.png");
    expect(screen.getByTestId("config-delivery").textContent).toBe("file");
  });

  it("saveDraft envia payload consolidado de todas as abas e zera dirty", async () => {
    const { adapter, calls } = makeAdapter();
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={initialRow} adapter={adapter}>
        <Probe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    act(() => {
      api.patch({ name: "Final" });
    });
    act(() => {
      api.patch({ deliveryType: "file", deliveryFileUrl: "https://files/y" });
    });

    await act(async () => {
      await api.saveDraft();
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe("p1");
    expect(calls[0].payload.name).toBe("Final");
    expect(calls[0].payload.delivery_mode).toBe("file");
    expect(calls[0].payload.delivery_url).toBe("https://files/y");
    expect(calls[0].payload.status).toBe("DRAFT");
    expect(screen.getByTestId("dirty").textContent).toBe("false");
    expect(screen.getByTestId("status").textContent).toBe("saved");
  });

  it("publish envia status PUBLISHED e atualiza state.status", async () => {
    const { adapter, calls } = makeAdapter();
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={initialRow} adapter={adapter}>
        <Probe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    await act(async () => {
      await api.publish();
    });

    expect(calls[0].payload.status).toBe("PUBLISHED");
    expect(api.state.status).toBe("PUBLISHED");
  });

  it("falha do adapter marca status=error e mantém dirty", async () => {
    const adapter: SaveAdapter = { save: vi.fn(async () => { throw new Error("offline"); }) };
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={initialRow} adapter={adapter}>
        <Probe onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    act(() => {
      api.patch({ name: "X" });
    });

    await act(async () => {
      await api.saveDraft().catch(() => {});
    });

    expect(screen.getByTestId("status").textContent).toBe("error");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
    expect(api.state.meta.lastError).toBe("offline");
  });
});
