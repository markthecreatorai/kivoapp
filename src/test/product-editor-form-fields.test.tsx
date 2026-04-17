// =============================================================
// Form Fields (aba Configuração) — CRUD puro + binding preview.
// =============================================================

import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  ADDITIONAL_FIELD_TYPES,
  REQUIRES_OPTIONS,
  SYSTEM_FIELD_KEYS,
  addField,
  buildSystemFields,
  ensureSystemFields,
  removeField,
  setRequired,
  slugifyKey,
  updateField,
  validateDeliveryUrl,
  validateFieldDraft,
  type FormField,
} from "@/features/product-editor";

// ── 1. Modelo + helpers ───────────────────────────────────
describe("buildSystemFields / ensureSystemFields", () => {
  it("retorna sempre Nome+Email travados, na ordem 0/1, required, is_system", () => {
    const sys = buildSystemFields();
    expect(sys).toHaveLength(2);
    expect(sys[0].field_key).toBe(SYSTEM_FIELD_KEYS.name);
    expect(sys[1].field_key).toBe(SYSTEM_FIELD_KEYS.email);
    expect(sys.every((f) => f.is_system && f.is_required)).toBe(true);
    expect(sys[0].order).toBe(0);
    expect(sys[1].order).toBe(1);
  });

  it("ensureSystemFields nunca duplica system fields, mesmo se vierem misturados", () => {
    const customs: FormField[] = [
      {
        id: "c1",
        field_key: "phone",
        field_type: "phone",
        label: "Telefone",
        is_required: false,
        is_system: false,
        order: 99,
      },
    ];
    const out = ensureSystemFields([...buildSystemFields(), ...customs]);
    expect(out).toHaveLength(3);
    expect(out.filter((f) => f.is_system)).toHaveLength(2);
    expect(out[2].order).toBe(2);
  });
});

// ── 2. CRUD: addField ────────────────────────────────────
describe("addField", () => {
  it("adiciona campo phone com required + slug correto", () => {
    const next = addField(buildSystemFields(), {
      label: "WhatsApp",
      field_type: "phone",
      is_required: true,
    });
    expect(next).toHaveLength(3);
    const added = next[2];
    expect(added.field_type).toBe("phone");
    expect(added.is_required).toBe(true);
    expect(added.field_key).toBe("whatsapp");
    expect(added.is_system).toBe(false);
  });

  it("força options=[] em multiple_choice/dropdown/checkboxes", () => {
    REQUIRES_OPTIONS.forEach((t) => {
      const next = addField(buildSystemFields(), {
        label: `Campo ${t}`,
        field_type: t,
        is_required: false,
      });
      expect(next[2].options).toEqual([]);
    });
  });

  it("não popula options para text/phone", () => {
    const next = addField(buildSystemFields(), {
      label: "Empresa",
      field_type: "text",
      is_required: false,
    });
    expect(next[2].options).toBeUndefined();
  });
});

// ── 3. CRUD: updateField ─────────────────────────────────
describe("updateField", () => {
  const base = addField(buildSystemFields(), {
    label: "Telefone",
    field_type: "phone",
    is_required: false,
  });
  const customId = base[2].id;

  it("edita label preservando id e is_system=false", () => {
    const next = updateField(base, customId, { label: "WhatsApp" });
    expect(next[2].label).toBe("WhatsApp");
    expect(next[2].id).toBe(customId);
    expect(next[2].is_system).toBe(false);
  });

  it("ao trocar tipo p/ dropdown inicializa options", () => {
    const next = updateField(base, customId, { field_type: "dropdown" });
    expect(next[2].options).toEqual([]);
  });

  it("ao voltar tipo p/ text limpa options", () => {
    const withOpts = updateField(base, customId, {
      field_type: "checkboxes",
      options: ["A", "B"],
    });
    const back = updateField(withOpts, customId, { field_type: "text" });
    expect(back[2].options).toBeUndefined();
  });

  it("ignora updates em system fields (Nome/Email não editáveis)", () => {
    const next = updateField(base, base[0].id, { label: "Hackeado" });
    expect(next[0].label).toBe("Nome");
  });
});

// ── 4. CRUD: removeField ─────────────────────────────────
describe("removeField", () => {
  it("remove campo custom e reindexa order", () => {
    const fs = addField(
      addField(buildSystemFields(), {
        label: "Telefone",
        field_type: "phone",
        is_required: false,
      }),
      { label: "Empresa", field_type: "text", is_required: false },
    );
    expect(fs).toHaveLength(4);
    const next = removeField(fs, fs[2].id);
    expect(next).toHaveLength(3);
    expect(next.map((f) => f.order)).toEqual([0, 1, 2]);
  });

  it("não remove system field", () => {
    const sys = buildSystemFields();
    const next = removeField(sys, sys[0].id);
    expect(next).toHaveLength(2);
  });
});

// ── 5. setRequired ───────────────────────────────────────
describe("setRequired", () => {
  it("alterna required em campo custom; ignora system", () => {
    const fs = addField(buildSystemFields(), {
      label: "Empresa",
      field_type: "text",
      is_required: false,
    });
    const r1 = setRequired(fs, fs[2].id, true);
    expect(r1[2].is_required).toBe(true);
    // system não muda
    const r2 = setRequired(r1, r1[0].id, false);
    expect(r2[0].is_required).toBe(true);
  });
});

// ── 6. Validation: field draft ───────────────────────────
describe("validateFieldDraft", () => {
  it("rejeita label vazio", () => {
    const r = validateFieldDraft({
      label: "",
      field_type: "text",
      is_required: false,
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.label).toMatch(/obrigatório/);
  });

  it("rejeita dropdown sem opções", () => {
    const r = validateFieldDraft({
      label: "Estado",
      field_type: "dropdown",
      is_required: true,
      options: [],
    });
    expect(r.isValid).toBe(false);
    expect(r.errors.options).toMatch(/uma opção/);
  });

  it("aceita dropdown com 1+ opções", () => {
    const r = validateFieldDraft({
      label: "Estado",
      field_type: "dropdown",
      is_required: true,
      options: ["SP", "RJ"],
    });
    expect(r.isValid).toBe(true);
  });

  it("aceita campo phone sem options", () => {
    const r = validateFieldDraft({
      label: "WhatsApp",
      field_type: "phone",
      is_required: true,
    });
    expect(r.isValid).toBe(true);
  });
});

// ── 7. Validation: delivery URL ──────────────────────────
describe("validateDeliveryUrl", () => {
  it.each([
    ["", "Informe a URL"],
    ["   ", "Informe a URL"],
    ["not-a-url", "URL inválida"],
    ["ftp://x.com", "http"],
    ["javascript:alert(1)", "http"],
  ])("rejeita %s", (input, contains) => {
    const r = validateDeliveryUrl(input);
    expect(r.isValid).toBe(false);
    expect(r.error).toMatch(new RegExp(contains, "i"));
  });

  it.each(["https://example.com", "http://localhost:3000/x?y=1"])(
    "aceita %s",
    (input) => {
      const r = validateDeliveryUrl(input);
      expect(r.isValid).toBe(true);
    },
  );
});

// ── 8. slugifyKey ────────────────────────────────────────
describe("slugifyKey", () => {
  it("normaliza acentos e símbolos", () => {
    expect(slugifyKey("Endereço Comercial")).toBe("endereco_comercial");
    expect(slugifyKey("CPF/CNPJ?")).toBe("cpf_cnpj");
  });

  it("fallback timestamp quando vazio", () => {
    const k = slugifyKey("???");
    expect(k.startsWith("field_")).toBe(true);
  });
});

// ── 9. Constantes / contrato ─────────────────────────────
describe("contrato de tipos", () => {
  it("ADDITIONAL_FIELD_TYPES não expõe email (reservado a system)", () => {
    expect(ADDITIONAL_FIELD_TYPES).not.toContain("email");
    expect(new Set(ADDITIONAL_FIELD_TYPES)).toEqual(
      new Set(["text", "phone", "multiple_choice", "dropdown", "checkboxes"]),
    );
  });
});

// ── 10. Integração: binding com preview (componente leve) ─
function PreviewProbe({ fields }: { fields: FormField[] }) {
  return (
    <ul>
      {fields.map((f) => (
        <li key={f.id} data-testid={`pv-${f.field_key}`}>
          {f.label}
          {f.is_required ? " *" : ""}
          {f.options ? ` [${f.options.join(",")}]` : ""}
        </li>
      ))}
    </ul>
  );
}

describe("binding preview <-> CRUD", () => {
  it("preview reflete adição, edição e remoção", () => {
    let fs = buildSystemFields();
    const { rerender } = render(<PreviewProbe fields={fs} />);
    expect(screen.getByTestId("pv-name")).toHaveTextContent("Nome *");
    expect(screen.getByTestId("pv-email")).toHaveTextContent("Email *");

    // add
    act(() => {
      fs = addField(fs, {
        label: "WhatsApp",
        field_type: "phone",
        is_required: true,
      });
    });
    rerender(<PreviewProbe fields={fs} />);
    expect(screen.getByTestId("pv-whatsapp")).toHaveTextContent("WhatsApp *");

    // edit
    act(() => {
      const id = fs[2].id;
      fs = updateField(fs, id, { label: "Celular", field_type: "text" });
    });
    rerender(<PreviewProbe fields={fs} />);
    expect(screen.queryByTestId("pv-whatsapp")).toBeTruthy(); // key não muda no update
    expect(screen.getByTestId("pv-whatsapp")).toHaveTextContent("Celular");

    // remove
    act(() => {
      fs = removeField(fs, fs[2].id);
    });
    rerender(<PreviewProbe fields={fs} />);
    expect(screen.queryByTestId("pv-whatsapp")).toBeNull();
    // sistema permanece
    expect(screen.getByTestId("pv-name")).toBeTruthy();
    expect(screen.getByTestId("pv-email")).toBeTruthy();
  });

  it("preview renderiza opções de dropdown/checkboxes", () => {
    let fs = buildSystemFields();
    fs = addField(fs, {
      label: "Estado",
      field_type: "dropdown",
      is_required: false,
      options: ["SP", "RJ"],
    });
    render(<PreviewProbe fields={fs} />);
    expect(screen.getByTestId("pv-estado")).toHaveTextContent("[SP,RJ]");
  });
});
