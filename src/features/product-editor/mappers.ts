// =============================================================
// Mappers: API ⇄ ProductEditorState
// Conversão pura, sem efeitos colaterais.
// =============================================================

import type {
  ApiProductRow,
  ApiProductUpdatePayload,
  DeliveryType,
  ProductEditorState,
  ProductStatus,
} from "./types";

const DEFAULT_CTA = "Inscrever-se";
const DEFAULT_SUBJECT = "Confirmação de Inscrição";
const DEFAULT_BODY =
  "Olá {{nome_cliente}},\n\nObrigado por se inscrever em {{nome_produto}}.\nAqui está seu acesso:\n\n{{link_recurso}}\n\n— {{meu_nome}}";

function normalizeDeliveryType(value: unknown): DeliveryType {
  return value === "file" ? "file" : "url";
}

function normalizeStatus(value: unknown): ProductStatus {
  if (value === "PUBLISHED" || value === "ARCHIVED") return value;
  return "DRAFT";
}

function resolveFormatId(row: ApiProductRow): string {
  const metaFormat = row.metadata?.format_id;
  if (typeof metaFormat === "string" && metaFormat.length > 0) return metaFormat;
  return (row.type || "digital").toLowerCase();
}

/**
 * API → EditorState. Aplica defaults seguros e nunca lança.
 * Resultado é sempre renderizável.
 */
export function mapApiToEditorState(row: ApiProductRow): ProductEditorState {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    formatId: resolveFormatId(row),
    status: normalizeStatus(row.status),

    thumbnailUrl: row.thumbnail_url ?? "",
    name: row.name ?? "",
    shortDescription: row.short_description ?? "",
    ctaText: row.listing_button_text ?? DEFAULT_CTA,

    deliveryType: normalizeDeliveryType(row.delivery_mode),
    deliveryUrl: row.delivery_mode === "url" ? (row.delivery_url ?? "") : "",
    deliveryFileUrl: row.delivery_mode === "file" ? (row.delivery_url ?? "") : "",

    confirmationSubject: row.confirmation_email_subject ?? DEFAULT_SUBJECT,
    confirmationBody: row.confirmation_email_body ?? DEFAULT_BODY,

    meta: {
      isDirty: false,
      saveStatus: "idle",
      lastSavedAt: null,
      lastError: null,
    },
  };
}

/**
 * EditorState → API payload. Inclui apenas campos editáveis.
 * O delivery_url é resolvido a partir do deliveryType ativo.
 */
export function mapEditorStateToApi(
  state: ProductEditorState,
  opts: { status?: ProductStatus } = {},
): ApiProductUpdatePayload {
  const deliveryUrl =
    state.deliveryType === "file" ? state.deliveryFileUrl : state.deliveryUrl;

  return {
    name: state.name,
    short_description: state.shortDescription,
    thumbnail_url: state.thumbnailUrl,
    listing_button_text: state.ctaText || DEFAULT_CTA,
    delivery_mode: state.deliveryType,
    delivery_url: deliveryUrl,
    confirmation_email_subject: state.confirmationSubject || DEFAULT_SUBJECT,
    confirmation_email_body: state.confirmationBody || DEFAULT_BODY,
    ...(opts.status ? { status: opts.status } : {}),
  };
}

export const __defaults = {
  DEFAULT_CTA,
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
};
