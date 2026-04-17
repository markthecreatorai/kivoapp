// =============================================================
// Binding Matrix — teste de paridade entre estado editável e
// preview. Falha quando:
//   • um statePath listado deixa de existir no estado canônico
//   • um previewTestId estático não aparece em nenhuma surface
//   • uma mutação de estado NÃO altera o preview correspondente
//   • a coleção de fields não reflete CRUD (add/update/remove)
//   • a etiqueta 'Grátis' some no Lead Magnet
// =============================================================

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import {
  BINDING_MATRIX,
  EDITABLE_STATE_PATHS_WITH_PREVIEW,
  PreviewSurface,
  addField,
  buildSystemFields,
  removeField,
  updateField,
  type FormField,
  type ProductEditorState,
} from "@/features/product-editor";

// ── Estado-base mínimo usado pelos testes ──────────────────
const baseState = {
  thumbnailUrl: "",
  name: "",
  shortDescription: "",
  ctaText: "",
} as Pick<
  ProductEditorState,
  "thumbnailUrl" | "name" | "shortDescription" | "ctaText"
>;

const renderSurface = (
  surface: "visual" | "conteudo" | "config",
  overrides: Partial<typeof baseState> = {},
  formFields: FormField[] = buildSystemFields(),
) =>
  render(
    <PreviewSurface
      surface={surface}
      thumbnailUrl={overrides.thumbnailUrl ?? baseState.thumbnailUrl}
      name={overrides.name ?? baseState.name}
      shortDescription={
        overrides.shortDescription ?? baseState.shortDescription
      }
      ctaText={overrides.ctaText ?? baseState.ctaText}
      formFields={formFields}
      isLeadMagnet
    />,
  );

// =============================================================
// 1) Sanidade da matriz
// =============================================================
describe("BINDING_MATRIX — integridade do contrato", () => {
  it("não tem ids duplicados", () => {
    const ids = BINDING_MATRIX.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declara pelo menos uma entrada por path editável conhecido", () => {
    for (const path of EDITABLE_STATE_PATHS_WITH_PREVIEW) {
      const found = BINDING_MATRIX.some((b) => b.statePath === path);
      expect(found, `Sem binding declarado para "${path}"`).toBe(true);
    }
  });

  it("todas as entradas declaram pelo menos uma surface", () => {
    for (const b of BINDING_MATRIX) {
      expect(b.appliesOn.length, `${b.id} sem surface`).toBeGreaterThan(0);
    }
  });
});

// =============================================================
// 2) Bindings estáticos: cada statePath altera o testId do preview
// =============================================================
describe("BINDING_MATRIX — bindings estáticos refletem no preview", () => {
  const STATIC_CASES = BINDING_MATRIX.filter((b) => !b.dynamic);

  it.each(STATIC_CASES.map((b) => [b.id, b]))(
    "[%s] muda no preview quando o estado muda",
    (_id, entry) => {
      // Para cada surface aplicável, renderiza vazio + populado e
      // verifica diferença textual / DOM.
      for (const surface of entry.appliesOn) {
        // Render vazio (deve mostrar fallback OU não renderizar)
        const empty = renderSurface(surface);
        const emptyEl = empty.queryByTestId(entry.previewTestId);
        empty.unmount();

        // Caso especial: free-badge não tem statePath real
        if (entry.id === "free-badge") {
          expect(
            emptyEl,
            `Free badge ausente em ${surface}`,
          ).not.toBeNull();
          expect(emptyEl!.textContent).toMatch(/Grátis/);
          continue;
        }

        // Render populado
        const sampleByPath: Record<string, Partial<typeof baseState>> = {
          thumbnailUrl: { thumbnailUrl: "https://cdn.x/img.png" },
          name: { name: `Título ${entry.id}` },
          shortDescription: { shortDescription: `Descrição ${entry.id}` },
          ctaText: { ctaText: `CTA ${entry.id}` },
        };
        const populated = renderSurface(
          surface,
          sampleByPath[entry.statePath] ?? {},
        );
        const populatedEl = populated.queryByTestId(entry.previewTestId);
        expect(
          populatedEl,
          `previewTestId "${entry.previewTestId}" ausente na surface "${surface}" (binding ${entry.id})`,
        ).not.toBeNull();

        // Verifica que o conteúdo mudou em relação ao estado vazio
        const emptyContent = emptyEl?.textContent ?? "";
        const populatedContent = populatedEl!.textContent ?? "";

        if (entry.statePath === "thumbnailUrl") {
          // Thumb: imagem aparece quando populado, ícone quando vazio
          expect(
            populated.container.querySelector(
              `[data-testid="${entry.previewTestId}"] img`,
            ),
            `Imagem real não renderizada para thumbnail populado em ${surface}`,
          ).not.toBeNull();
        } else {
          expect(
            populatedContent,
            `Preview "${entry.previewTestId}" não mudou ao alterar "${entry.statePath}" em ${surface}`,
          ).not.toBe(emptyContent);
        }
        populated.unmount();
      }
    },
  );

  it("fallback é exibido quando estado vazio (entries com fallback)", () => {
    for (const entry of STATIC_CASES) {
      if (!entry.fallback) continue;
      for (const surface of entry.appliesOn) {
        const view = renderSurface(surface);
        const el = view.queryByTestId(entry.previewTestId);
        expect(
          el,
          `Esperava elemento ${entry.previewTestId} na surface ${surface}`,
        ).not.toBeNull();
        const text = el!.textContent ?? "";
        const html = el!.innerHTML;
        const matches =
          typeof entry.fallback === "string"
            ? text.includes(entry.fallback)
            : entry.fallback.test(text) || entry.fallback.test(html);
        expect(
          matches,
          `Fallback "${entry.fallback}" ausente em ${entry.id} (${surface}). texto="${text}"`,
        ).toBe(true);
        view.unmount();
      }
    }
  });
});

// =============================================================
// 3) Bindings dinâmicos: campos do formulário (CRUD)
// =============================================================
describe("BINDING_MATRIX — campos base e dinâmicos refletem no preview", () => {
  it("Nome e Email (system) sempre aparecem na config", () => {
    renderSurface("config");
    expect(screen.getByTestId("preview-name")).toBeInTheDocument();
    expect(screen.getByTestId("preview-email")).toBeInTheDocument();
  });

  it.each([
    ["text", "Empresa", { is_required: false }],
    ["phone", "WhatsApp", { is_required: true }],
    [
      "multiple_choice",
      "Plano",
      { is_required: false, options: ["Básico", "Pro"] },
    ],
    [
      "dropdown",
      "Estado",
      { is_required: false, options: ["SP", "RJ", "MG"] },
    ],
    [
      "checkboxes",
      "Interesses",
      { is_required: false, options: ["Marketing", "Vendas"] },
    ],
  ] as const)(
    "campo do tipo %s adicionado aparece no preview",
    (type, label, extras) => {
      const fs = addField(buildSystemFields(), {
        label,
        field_type: type as any,
        ...extras,
        options: (extras as any).options ?? [],
      } as any);
      renderSurface("config", {}, fs);
      const node = screen.queryByTestId(`preview-${label.toLowerCase()}`);
      expect(
        node,
        `Campo "${label}" do tipo ${type} não aparece no preview`,
      ).not.toBeNull();
      expect(node!.getAttribute("data-field-type")).toBe(type);

      // Verifica options renderizadas para tipos com opções
      if (type === "dropdown") {
        expect(
          within(node!).getByTestId(
            `preview-${label.toLowerCase()}-dropdown`,
          ).textContent,
        ).toBe((extras as any).options[0]);
      }
      if (type === "multiple_choice" || type === "checkboxes") {
        const list = within(node!).getByTestId(
          `preview-${label.toLowerCase()}-options`,
        );
        expect(list.children.length).toBe((extras as any).options.length);
      }
    },
  );

  it("update de label propaga no preview (key estável, texto novo)", () => {
    let fs = addField(buildSystemFields(), {
      label: "Telefone",
      field_type: "phone",
      is_required: false,
    });
    const id = fs[2].id;
    fs = updateField(fs, id, { label: "Celular" });
    // field_key permanece "telefone" (estável); o label muda
    expect(screen.queryByTestId).toBeDefined();
    renderSurface("config", {}, fs);
    expect(screen.getByTestId("preview-telefone")).toHaveTextContent("Celular");
  });

  it("remoção de campo some do preview", () => {
    let fs = addField(buildSystemFields(), {
      label: "Empresa",
      field_type: "text",
      is_required: false,
    });
    const id = fs[2].id;
    fs = removeField(fs, id);
    renderSurface("config", {}, fs);
    expect(screen.queryByTestId("preview-empresa")).toBeNull();
    // sistema permanece
    expect(screen.getByTestId("preview-name")).toBeInTheDocument();
    expect(screen.getByTestId("preview-email")).toBeInTheDocument();
  });

  it("required = true marca atributo data-required no preview", () => {
    const fs = addField(buildSystemFields(), {
      label: "WhatsApp",
      field_type: "phone",
      is_required: true,
    });
    renderSurface("config", {}, fs);
    expect(
      screen.getByTestId("preview-whatsapp").getAttribute("data-required"),
    ).toBe("true");
  });
});

// =============================================================
// 4) Garantia anti-divergência silenciosa: campos editáveis SEM
//    binding declarado falham aqui.
// =============================================================
describe("Anti-divergência: todo path editável tem binding", () => {
  it("nenhum path editável conhecido fica órfão", () => {
    const orphans = EDITABLE_STATE_PATHS_WITH_PREVIEW.filter(
      (path) => !BINDING_MATRIX.some((b) => b.statePath === path),
    );
    expect(
      orphans,
      `Paths editáveis sem binding no preview: ${orphans.join(", ")}`,
    ).toEqual([]);
  });

  it("nenhum previewTestId estático declarado é fantasma", () => {
    for (const entry of BINDING_MATRIX.filter((b) => !b.dynamic)) {
      // Cada entrada deve aparecer em pelo menos uma surface declarada
      const exists = entry.appliesOn.some((surface) => {
        const view = renderSurface(surface);
        const found = !!view.queryByTestId(entry.previewTestId);
        view.unmount();
        return found;
      });
      expect(
        exists,
        `Binding ${entry.id} declara testId "${entry.previewTestId}" mas ele não existe em nenhuma surface`,
      ).toBe(true);
    }
  });
});

// =============================================================
// 5) Lead Magnet: etiqueta 'Grátis' obrigatória
// =============================================================
describe("Lead Magnet — preço/free badge", () => {
  it("exibe 'Grátis' na surface config", () => {
    renderSurface("config", { name: "Lead", ctaText: "Baixar" });
    expect(screen.getByTestId("preview-free-badge")).toHaveTextContent(
      /Grátis/,
    );
  });

  it("não exibe 'Grátis' em surfaces visual/conteúdo (não é local da etiqueta)", () => {
    renderSurface("visual");
    expect(screen.queryByTestId("preview-free-badge")).toBeNull();
    renderSurface("conteudo");
    expect(screen.queryByTestId("preview-free-badge")).toBeNull();
  });

  it("se isLeadMagnet=false a etiqueta não aparece nem na config", () => {
    render(
      <PreviewSurface
        surface="config"
        thumbnailUrl=""
        name=""
        shortDescription=""
        ctaText=""
        formFields={buildSystemFields()}
        isLeadMagnet={false}
      />,
    );
    expect(screen.queryByTestId("preview-free-badge")).toBeNull();
  });
});
