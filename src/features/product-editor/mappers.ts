// =============================================================
// Mappers: API ⇄ ProductEditorState
// Conversão pura, sem efeitos colaterais.
//
// Compatibilidade:
//   • Leitura roda `migrateApiRowToCurrent` ANTES de hidratar,
//     promovendo produtos antigos (v0/v1) para v2 em memória.
//   • Escrita SEMPRE carimba `metadata.leadMagnetConfigVersion`
//     com a versão atual — nunca regride.
// =============================================================

import { migrateApiRowToCurrent } from "./migrations";
import { LEAD_MAGNET_CONFIG_VERSION } from "./schemaVersion";
import type {
  ApiProductRow,
  ApiProductUpdatePayload,
  CoverSource,
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

function normalizeCoverSource(value: unknown): CoverSource {
  return value === "url" ? "url" : "upload";
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
 * API → EditorState. Aplica migração + defaults seguros.
 * Nunca lança; o resultado é sempre renderizável.
 */
export function mapApiToEditorState(row: ApiProductRow): ProductEditorState {
  const { row: migrated } = migrateApiRowToCurrent(row);
  const meta = migrated.metadata ?? {};
  const coverSource = normalizeCoverSource(meta.cover_source);
  const persistedThumb = migrated.thumbnail_url ?? "";
  // Mantém os "buckets" upload e url separados para preservar valores ao alternar
  const thumbnailUploadUrl =
    typeof meta.thumbnail_upload_url === "string"
      ? meta.thumbnail_upload_url
      : coverSource === "upload"
        ? persistedThumb
        : "";
  const thumbnailExternalUrl =
    typeof meta.thumbnail_external_url === "string"
      ? meta.thumbnail_external_url
      : coverSource === "url"
        ? persistedThumb
        : "";

  return {
    id: migrated.id,
    workspaceId: migrated.workspace_id,
    formatId: resolveFormatId(migrated),
    status: normalizeStatus(migrated.status),

    thumbnailUrl: persistedThumb,
    coverSource,
    thumbnailUploadUrl,
    thumbnailExternalUrl,
    name: migrated.name ?? "",
    shortDescription: migrated.short_description ?? "",
    ctaText: migrated.listing_button_text ?? DEFAULT_CTA,

    deliveryType: normalizeDeliveryType(migrated.delivery_mode),
    deliveryUrl:
      migrated.delivery_mode === "url" ? (migrated.delivery_url ?? "") : "",
    deliveryFileUrl:
      migrated.delivery_mode === "file" ? (migrated.delivery_url ?? "") : "",

    confirmationSubject: migrated.confirmation_email_subject ?? DEFAULT_SUBJECT,
    confirmationBody: migrated.confirmation_email_body ?? DEFAULT_BODY,

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

  // Resolve a thumbnail efetiva a partir do modo ativo
  const effectiveThumb =
    state.coverSource === "upload" ? state.thumbnailUploadUrl : state.thumbnailExternalUrl;

  return {
    name: state.name,
    short_description: state.shortDescription,
    thumbnail_url: effectiveThumb || state.thumbnailUrl || "",
    listing_button_text: state.ctaText || DEFAULT_CTA,
    delivery_mode: state.deliveryType,
    delivery_url: deliveryUrl,
    confirmation_email_subject: state.confirmationSubject || DEFAULT_SUBJECT,
    confirmation_email_body: state.confirmationBody || DEFAULT_BODY,
    metadata: {
      cover_source: state.coverSource,
      thumbnail_upload_url: state.thumbnailUploadUrl,
      thumbnail_external_url: state.thumbnailExternalUrl,
    },
    ...(opts.status ? { status: opts.status } : {}),
  };
}

export const __defaults = {
  DEFAULT_CTA,
  DEFAULT_SUBJECT,
  DEFAULT_BODY,
};
