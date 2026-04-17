// =============================================================
// Binding Matrix — contrato explícito entre estado do editor e
// componentes do preview (Lead Magnet / Collect Emails).
//
// Cada entrada define:
//   • statePath    → caminho dot-notation no ProductEditorState
//                    OU "formFields[*]" para campos dinâmicos.
//   • previewTestId→ data-testid presente no MobilePreview que
//                    deve refletir a mudança de estado.
//   • fallback     → string/regex exibida quando o estado é vazio
//                    (ou null se NÃO deve aparecer fallback).
//   • appliesOn    → quais abas do preview são afetadas.
//
// Esta matriz é a fonte de verdade do teste de paridade
// (`bindingMatrix.test.tsx`), que falha quando:
//   1. Um campo de edição é declarado mas o preview não muda.
//   2. Um statePath listado deixa de existir no state.
//   3. Um previewTestId listado deixa de ser renderizado.
// =============================================================

export type PreviewSurface = "visual" | "conteudo" | "config";

export interface BindingEntry {
  /** Identificador legível para diagnósticos do teste. */
  id: string;
  /**
   * Caminho dentro do `ProductEditorState` (dot notation).
   * Use literal `"formFields"` para a coleção dinâmica de
   * campos do formulário (renderizada via map).
   */
  statePath: string;
  /**
   * data-testid que o preview expõe.
   * Se for prefix, marque `dynamic: true`.
   */
  previewTestId: string;
  /** Texto/regex exibido quando o valor de estado é vazio. */
  fallback: string | RegExp | null;
  /** Em quais abas o binding é avaliado. */
  appliesOn: PreviewSurface[];
  /** True para entries que fazem parte da coleção dinâmica de fields. */
  dynamic?: boolean;
  /** Descrição textual usada em mensagens de falha. */
  description: string;
}

/**
 * MATRIZ EXPLÍCITA — adicione/remova aqui ao tocar o preview ou
 * o estado canônico. O teste irá te avisar de divergência.
 */
export const BINDING_MATRIX: BindingEntry[] = [
  // ── Imagem de capa ────────────────────────────────────
  {
    id: "thumbnail",
    statePath: "thumbnailUrl",
    previewTestId: "preview-thumb",
    fallback: /icon-fallback/,
    appliesOn: ["visual", "conteudo", "config"],
    description:
      "Imagem de capa (URL ou Upload). Fallback: ícone placeholder quando vazio.",
  },

  // ── Texto: título / subtítulo / CTA ───────────────────
  {
    id: "title",
    statePath: "name",
    previewTestId: "preview-title",
    fallback: "Título aqui",
    appliesOn: ["visual", "conteudo", "config"],
    description: "Título principal do produto. Fallback: 'Título aqui'.",
  },
  {
    id: "subtitle",
    statePath: "shortDescription",
    previewTestId: "preview-subtitle",
    fallback: /Breve descrição/,
    appliesOn: ["visual", "conteudo", "config"],
    description:
      "Subtítulo / descrição curta. Fallback: placeholder de descrição.",
  },
  {
    id: "cta",
    statePath: "ctaText",
    previewTestId: "preview-cta",
    fallback: /Inscrever|Enviar/,
    appliesOn: ["visual", "conteudo", "config"],
    description:
      "Texto do botão (CTA). Fallback: 'Inscrever' (visual/conteúdo) ou 'Enviar' (config).",
  },

  // ── Preço / etiqueta de gratuidade ────────────────────
  {
    id: "free-badge",
    statePath: "__leadMagnet",
    previewTestId: "preview-free-badge",
    fallback: "Grátis",
    appliesOn: ["config"],
    description:
      "Etiqueta 'Grátis' obrigatória em Lead Magnet (preço sempre 0).",
  },

  // ── Campos base (sistema) ─────────────────────────────
  {
    id: "field-name",
    statePath: "formFields",
    previewTestId: "preview-name",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo base Nome (system, sempre presente, obrigatório).",
  },
  {
    id: "field-email",
    statePath: "formFields",
    previewTestId: "preview-email",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo base Email (system, sempre presente, obrigatório).",
  },

  // ── Campos adicionais (por tipo) ──────────────────────
  // Cada tipo é coberto pela mesma rota dinâmica `preview-<field_key>`
  // O teste irá adicionar um campo de cada tipo e verificar binding.
  {
    id: "field-text",
    statePath: "formFields",
    previewTestId: "preview-",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo adicional do tipo TEXT.",
  },
  {
    id: "field-phone",
    statePath: "formFields",
    previewTestId: "preview-",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo adicional do tipo PHONE.",
  },
  {
    id: "field-multiple_choice",
    statePath: "formFields",
    previewTestId: "preview-",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo adicional do tipo MULTIPLE_CHOICE (radio + options).",
  },
  {
    id: "field-dropdown",
    statePath: "formFields",
    previewTestId: "preview-",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo adicional do tipo DROPDOWN (primeira option visível).",
  },
  {
    id: "field-checkboxes",
    statePath: "formFields",
    previewTestId: "preview-",
    fallback: null,
    appliesOn: ["config"],
    dynamic: true,
    description: "Campo adicional do tipo CHECKBOXES (lista com squares).",
  },
];

/**
 * Inverso útil para o teste: lista de previewTestId estáticos
 * (não dinâmicos) que DEVEM existir em pelo menos uma aba.
 */
export const STATIC_PREVIEW_TEST_IDS = BINDING_MATRIX.filter(
  (b) => !b.dynamic,
).map((b) => b.previewTestId);

/**
 * Lista canônica de campos editáveis no editor cuja mudança DEVE
 * impactar o preview. Mantida ao lado da matriz para garantir
 * que toda adição em `ProductEditorState` ganhe um binding.
 */
export const EDITABLE_STATE_PATHS_WITH_PREVIEW = [
  "thumbnailUrl",
  "name",
  "shortDescription",
  "ctaText",
  "formFields",
] as const;
