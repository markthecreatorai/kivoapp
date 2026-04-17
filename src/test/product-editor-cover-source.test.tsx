// =============================================================
// Regressão: Aba Visual (CoverSourceField) — modos upload/url,
// validações, preview reativo e persistência no draft.
// =============================================================

import { describe, it, expect, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  CoverSourceField,
  ProductEditorProvider,
  selectPreview,
  selectVisualTab,
  useProductEditor,
  validateImageFile,
  validateImageUrl,
  type ApiProductRow,
  type SaveAdapter,
  type UploadAdapter,
} from "@/features/product-editor";

const baseRow: ApiProductRow = {
  id: "p1",
  workspace_id: "w1",
  type: "LEAD_MAGNET",
  status: "DRAFT",
  thumbnail_url: "",
  delivery_mode: "url",
};

function makeSaveAdapter(): SaveAdapter {
  return { save: vi.fn(async () => {}) };
}

function makeUploadAdapter(url = "https://cdn.test/img.png"): UploadAdapter {
  return { uploadImage: vi.fn(async () => ({ url })) };
}

function Probe({
  uploadAdapter,
  onReady,
}: {
  uploadAdapter: UploadAdapter;
  onReady: (api: ReturnType<typeof useProductEditor>) => void;
}) {
  const api = useProductEditor();
  onReady(api);
  const v = selectVisualTab(api.state);
  const p = selectPreview(api.state);
  return (
    <div>
      <span data-testid="mode">{v.coverSource}</span>
      <span data-testid="upload-url">{v.thumbnailUploadUrl}</span>
      <span data-testid="external-url">{v.thumbnailExternalUrl}</span>
      <span data-testid="preview-thumb">{p.thumbnailUrl}</span>
      <span data-testid="dirty">{String(api.state.meta.isDirty)}</span>
      <CoverSourceField uploadAdapter={uploadAdapter} folder="t" />
    </div>
  );
}

function renderWith(
  rowOverrides: Partial<ApiProductRow> = {},
  uploadAdapter = makeUploadAdapter(),
) {
  let api!: ReturnType<typeof useProductEditor>;
  const utils = render(
    <ProductEditorProvider
      initialRow={{ ...baseRow, ...rowOverrides }}
      adapter={makeSaveAdapter()}
    >
      <Probe uploadAdapter={uploadAdapter} onReady={(a) => (api = a)} />
    </ProductEditorProvider>,
  );
  return { ...utils, getApi: () => api, uploadAdapter };
}

// ─── validators ─────────────────────────────────────────────
describe("validateImageUrl", () => {
  it.each([
    ["", false],
    ["   ", false],
    ["not a url", false],
    ["ftp://x/y.png", false],
    ["https://x.com/a.png", true],
    ["http://x/a.jpg", true],
    ["data:image/png;base64,AAAA", true],
  ])("%s → ok=%s", (input, expected) => {
    expect(validateImageUrl(input).ok).toBe(expected);
  });
});

describe("validateImageFile", () => {
  it("aceita PNG até 5MB", () => {
    const f = new File(["x"], "a.png", { type: "image/png" });
    expect(validateImageFile(f).ok).toBe(true);
  });
  it("rejeita formato não suportado", () => {
    const f = new File(["x"], "a.bmp", { type: "image/bmp" });
    const r = validateImageFile(f);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/Formato/i);
  });
  it("rejeita arquivo >5MB", () => {
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "a.png", { type: "image/png" });
    const r = validateImageFile(big);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toMatch(/5MB/);
  });
});

// ─── componente ─────────────────────────────────────────────
describe("CoverSourceField — estado inicial", () => {
  it("default coverSource=upload quando metadata ausente", () => {
    renderWith();
    expect(screen.getByTestId("mode").textContent).toBe("upload");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("");
  });

  it("hidrata coverSource e URLs a partir de metadata", () => {
    renderWith({
      thumbnail_url: "https://x/u.png",
      metadata: {
        cover_source: "url",
        thumbnail_upload_url: "https://x/old-upload.png",
        thumbnail_external_url: "https://x/u.png",
      },
    });
    expect(screen.getByTestId("mode").textContent).toBe("url");
    expect(screen.getByTestId("external-url").textContent).toBe("https://x/u.png");
    expect(screen.getByTestId("upload-url").textContent).toBe("https://x/old-upload.png");
  });
});

describe("CoverSourceField — switch entre upload/url", () => {
  it("alternar para URL preserva valor de upload e vice-versa", () => {
    const { getApi } = renderWith({
      metadata: {
        cover_source: "upload",
        thumbnail_upload_url: "https://x/up.png",
        thumbnail_external_url: "https://x/ext.png",
      },
      thumbnail_url: "https://x/up.png",
    });

    expect(screen.getByTestId("mode").textContent).toBe("upload");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://x/up.png");

    fireEvent.click(screen.getByRole("tab", { name: /URL/i }));
    expect(screen.getByTestId("mode").textContent).toBe("url");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://x/ext.png");
    expect(screen.getByTestId("upload-url").textContent).toBe("https://x/up.png");

    fireEvent.click(screen.getByRole("tab", { name: /Upload/i }));
    expect(screen.getByTestId("mode").textContent).toBe("upload");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://x/up.png");
    expect(getApi().state.meta.isDirty).toBe(true);
  });
});

describe("CoverSourceField — modo URL", () => {
  it("digitar URL atualiza preview em tempo real e marca dirty", () => {
    renderWith({ metadata: { cover_source: "url" } });
    const input = screen.getByPlaceholderText(/minha-capa/i);
    fireEvent.change(input, { target: { value: "https://cdn/x.png" } });
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://cdn/x.png");
    expect(screen.getByTestId("external-url").textContent).toBe("https://cdn/x.png");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
  });

  it("URL inválida exibe erro e não impede atualização do state (preview ainda reflete digitação)", () => {
    renderWith({ metadata: { cover_source: "url" } });
    const input = screen.getByPlaceholderText(/minha-capa/i);
    fireEvent.change(input, { target: { value: "not-a-url" } });
    expect(screen.getByRole("alert").textContent).toMatch(/URL/);
  });

  it("URL vazia limpa erro", () => {
    renderWith({ metadata: { cover_source: "url" } });
    const input = screen.getByPlaceholderText(/minha-capa/i);
    fireEvent.change(input, { target: { value: "bad" } });
    expect(screen.queryByRole("alert")).toBeTruthy();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("CoverSourceField — modo Upload", () => {
  it("upload bem-sucedido atualiza preview e persiste no draft", async () => {
    const adapter = makeUploadAdapter("https://cdn/uploaded.png");
    const { container } = renderWith({}, adapter);

    const file = new File(["data"], "x.png", { type: "image/png" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(adapter.uploadImage).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("upload-url").textContent).toBe("https://cdn/uploaded.png");
    expect(screen.getByTestId("preview-thumb").textContent).toBe("https://cdn/uploaded.png");
    expect(screen.getByTestId("dirty").textContent).toBe("true");
  });

  it("arquivo inválido (formato) exibe erro e NÃO chama adapter", async () => {
    const adapter = makeUploadAdapter();
    const { container } = renderWith({}, adapter);

    const bad = new File(["x"], "a.bmp", { type: "image/bmp" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [bad] } });
    });

    expect(adapter.uploadImage).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/Formato/);
  });

  it("falha do adapter exibe mensagem e mantém estado anterior", async () => {
    const adapter: UploadAdapter = {
      uploadImage: vi.fn(async () => {
        throw new Error("boom-storage");
      }),
    };
    const { container } = renderWith({}, adapter);

    const file = new File(["x"], "x.png", { type: "image/png" });
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    expect(screen.getByRole("alert").textContent).toMatch(/boom-storage/);
    expect(screen.getByTestId("upload-url").textContent).toBe("");
  });
});

describe("CoverSourceField — persistência no save payload", () => {
  it("saveDraft envia thumbnail_url efetivo + metadata.cover_source", async () => {
    const saveAdapter: SaveAdapter = { save: vi.fn(async () => {}) };
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider
        initialRow={{ ...baseRow, metadata: { cover_source: "upload" } }}
        adapter={saveAdapter}
      >
        <Probe uploadAdapter={makeUploadAdapter("https://cdn/up.png")} onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    // simula upload concluído
    act(() => {
      api.patch({
        coverSource: "upload",
        thumbnailUploadUrl: "https://cdn/up.png",
        thumbnailUrl: "https://cdn/up.png",
      });
    });

    await act(async () => {
      await api.saveDraft();
    });

    const call = (saveAdapter.save as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("p1");
    const payload = call[1];
    expect(payload.thumbnail_url).toBe("https://cdn/up.png");
    expect(payload.metadata.cover_source).toBe("upload");
    expect(payload.metadata.thumbnail_upload_url).toBe("https://cdn/up.png");
  });

  it("alternar para URL e salvar persiste o valor da URL como thumbnail efetiva", async () => {
    const saveAdapter: SaveAdapter = { save: vi.fn(async () => {}) };
    let api!: ReturnType<typeof useProductEditor>;
    render(
      <ProductEditorProvider initialRow={baseRow} adapter={saveAdapter}>
        <Probe uploadAdapter={makeUploadAdapter()} onReady={(a) => (api = a)} />
      </ProductEditorProvider>,
    );

    fireEvent.click(screen.getByRole("tab", { name: /URL/i }));
    const input = screen.getByPlaceholderText(/minha-capa/i);
    fireEvent.change(input, { target: { value: "https://cdn/ext.png" } });

    await act(async () => {
      await api.saveDraft();
    });

    const payload = (saveAdapter.save as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(payload.thumbnail_url).toBe("https://cdn/ext.png");
    expect(payload.metadata.cover_source).toBe("url");
    expect(payload.metadata.thumbnail_external_url).toBe("https://cdn/ext.png");
  });
});
