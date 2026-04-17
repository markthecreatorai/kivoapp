// =============================================================
// Form Fields canônicos para Lead Magnet (aba Configuração).
// Modelo único usado por: builder, preview, payload e testes.
// =============================================================

import { z } from "zod";

// ── Tipos ──────────────────────────────────────────────────
/**
 * Tipos de campos suportados na sprint 1 (paridade Stan).
 * Os 2 primeiros (`text`/`email`) são reservados aos campos
 * base travados (Nome/Email) — nunca expostos como adicionais.
 */
export type FormFieldType =
  | "text"
  | "phone"
  | "multiple_choice"
  | "dropdown"
  | "checkboxes"
  | "email";

export interface FormField {
  /** UUID quando persistido; client-temp string quando novo */
  id: string;
  /** Identificador estável usado em payloads/leads (slug do label ou system) */
  field_key: string;
  field_type: FormFieldType;
  label: string;
  placeholder?: string;
  is_required: boolean;
  /** Marca campos base (Nome/Email) — não removíveis nem editáveis */
  is_system: boolean;
  /** Apenas para multiple_choice / dropdown / checkboxes */
  options?: string[];
  /** Ordem 0-based; system fields ficam sempre antes dos custom */
  order: number;
}

// ── Constantes ─────────────────────────────────────────────
export const ADDITIONAL_FIELD_TYPES: FormFieldType[] = [
  "phone",
  "text",
  "multiple_choice",
  "dropdown",
  "checkboxes",
];

export const REQUIRES_OPTIONS: FormFieldType[] = [
  "multiple_choice",
  "dropdown",
  "checkboxes",
];

export const FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  text: "Texto",
  email: "E-mail",
  phone: "Telefone / WhatsApp",
  multiple_choice: "Múltipla escolha (radio)",
  dropdown: "Lista (dropdown)",
  checkboxes: "Caixas de seleção",
};

export const SYSTEM_FIELD_KEYS = {
  name: "name",
  email: "email",
} as const;

// ── Helpers ────────────────────────────────────────────────
/** Constrói os 2 campos base travados que sempre existem. */
export function buildSystemFields(): FormField[] {
  return [
    {
      id: "system-name",
      field_key: SYSTEM_FIELD_KEYS.name,
      field_type: "text",
      label: "Nome",
      is_required: true,
      is_system: true,
      order: 0,
    },
    {
      id: "system-email",
      field_key: SYSTEM_FIELD_KEYS.email,
      field_type: "email",
      label: "Email",
      is_required: true,
      is_system: true,
      order: 1,
    },
  ];
}

/** Garante que name/email estejam presentes no início e não duplicados. */
export function ensureSystemFields(fields: FormField[]): FormField[] {
  const customs = fields.filter((f) => !f.is_system);
  const systems = buildSystemFields();
  return [
    ...systems,
    ...customs.map((f, i) => ({ ...f, order: systems.length + i })),
  ];
}

/** Slug seguro para field_key a partir de um label livre. */
export function slugifyKey(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || `field_${Date.now().toString(36)}`
  );
}

/** Gera um id client-side temporário. */
export function tempFieldId(): string {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`;
}

// ── CRUD operations puros (testáveis) ──────────────────────
export function addField(
  fields: FormField[],
  draft: Omit<FormField, "id" | "order" | "is_system" | "field_key"> & {
    field_key?: string;
  },
): FormField[] {
  const customs = fields.filter((f) => !f.is_system);
  const systems = fields.filter((f) => f.is_system);
  const next: FormField = {
    id: tempFieldId(),
    field_key: draft.field_key || slugifyKey(draft.label),
    field_type: draft.field_type,
    label: draft.label,
    placeholder: draft.placeholder,
    is_required: draft.is_required,
    is_system: false,
    options: REQUIRES_OPTIONS.includes(draft.field_type)
      ? draft.options ?? []
      : undefined,
    order: systems.length + customs.length,
  };
  return ensureSystemFields([...customs, next]);
}

export function updateField(
  fields: FormField[],
  id: string,
  patch: Partial<Omit<FormField, "id" | "is_system" | "order">>,
): FormField[] {
  return fields.map((f) => {
    if (f.id !== id || f.is_system) return f;
    const merged: FormField = { ...f, ...patch };
    // se mudou o tipo para um sem options, limpamos options;
    // se mudou para um com options e não veio array, mantém o que existia.
    if (!REQUIRES_OPTIONS.includes(merged.field_type)) {
      merged.options = undefined;
    } else if (!merged.options) {
      merged.options = [];
    }
    return merged;
  });
}

export function removeField(fields: FormField[], id: string): FormField[] {
  const target = fields.find((f) => f.id === id);
  if (!target || target.is_system) return fields;
  const customs = fields.filter((f) => !f.is_system && f.id !== id);
  return ensureSystemFields(customs);
}

export function setRequired(
  fields: FormField[],
  id: string,
  required: boolean,
): FormField[] {
  return fields.map((f) =>
    f.id === id && !f.is_system ? { ...f, is_required: required } : f,
  );
}

// ── Validação Zod por campo individual ─────────────────────
export const fieldDraftSchema = z
  .object({
    label: z
      .string()
      .trim()
      .min(1, { message: "O nome do campo é obrigatório." })
      .max(60, { message: "O nome deve ter até 60 caracteres." }),
    field_type: z.enum([
      "text",
      "phone",
      "multiple_choice",
      "dropdown",
      "checkboxes",
    ]),
    placeholder: z
      .string()
      .max(80, { message: "Placeholder com até 80 caracteres." })
      .optional(),
    is_required: z.boolean(),
    options: z.array(z.string().trim().min(1)).optional(),
  })
  .superRefine((val, ctx) => {
    if (
      REQUIRES_OPTIONS.includes(val.field_type) &&
      (!val.options || val.options.length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["options"],
        message: "Adicione pelo menos uma opção.",
      });
    }
  });

export type FieldDraftInput = z.input<typeof fieldDraftSchema>;

export function validateFieldDraft(input: FieldDraftInput): {
  isValid: boolean;
  errors: Partial<Record<"label" | "options" | "placeholder", string>>;
} {
  const r = fieldDraftSchema.safeParse(input);
  if (r.success) return { isValid: true, errors: {} };
  const errors: Partial<Record<"label" | "options" | "placeholder", string>> = {};
  for (const issue of r.error.issues) {
    const k = issue.path[0] as "label" | "options" | "placeholder" | undefined;
    if (k && !errors[k]) errors[k] = issue.message;
  }
  return { isValid: false, errors };
}

// ── Validação de URL de delivery ───────────────────────────
export function validateDeliveryUrl(raw: string): {
  isValid: boolean;
  error?: string;
} {
  const v = raw.trim();
  if (!v) return { isValid: false, error: "Informe a URL de redirecionamento." };
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { isValid: false, error: "A URL deve usar http:// ou https://." };
    }
    return { isValid: true };
  } catch {
    return { isValid: false, error: "URL inválida." };
  }
}
