// =============================================================
// Publish-time validation — bloqueia publicação de Lead Magnet
// inconsistente. Roda DEPOIS da migração e ANTES do save.
//
// Regras P0 (bloqueiam):
//   • name não vazio (≤ 50)
//   • ctaText não vazio (≤ 30)
//   • shortDescription ≤ 100
//   • coverSource definido + valor coerente quando upload
//   • deliveryType obrigatório; se "url", deliveryUrl http(s) válido
//
// Regras P1 (warning, não bloqueiam):
//   • thumbnail vazio (publica sem capa, mas avisa)
//   • subject/body de confirmação vazios
// =============================================================

import { CONTENT_LIMITS } from "./contentSchema";
import type { ProductEditorState } from "./types";
import { validateDeliveryUrl } from "./formFieldsSchema";

export interface IntegrityIssue {
  /** path do campo problemático no EditorState. */
  path: string;
  severity: "error" | "warning";
  /** Código curto, estável para i18n/telemetria. */
  code: string;
  /** Mensagem pt-BR pronta para UI. */
  message: string;
}

export interface IntegrityReport {
  ok: boolean;
  errors: IntegrityIssue[];
  warnings: IntegrityIssue[];
}

const E = (path: string, code: string, message: string): IntegrityIssue => ({
  path,
  code,
  message,
  severity: "error",
});
const W = (path: string, code: string, message: string): IntegrityIssue => ({
  path,
  code,
  message,
  severity: "warning",
});

export function validateLeadMagnetIntegrity(
  state: ProductEditorState,
): IntegrityReport {
  const errors: IntegrityIssue[] = [];
  const warnings: IntegrityIssue[] = [];

  // ── Conteúdo ─────────────────────────────────────────
  const name = state.name?.trim() ?? "";
  if (!name) {
    errors.push(E("name", "name.required", "Título é obrigatório."));
  } else if (name.length > CONTENT_LIMITS.name) {
    errors.push(
      E(
        "name",
        "name.tooLong",
        `Título deve ter no máximo ${CONTENT_LIMITS.name} caracteres.`,
      ),
    );
  }

  if ((state.shortDescription ?? "").length > CONTENT_LIMITS.shortDescription) {
    errors.push(
      E(
        "shortDescription",
        "shortDescription.tooLong",
        `Subtítulo deve ter no máximo ${CONTENT_LIMITS.shortDescription} caracteres.`,
      ),
    );
  }

  const cta = state.ctaText?.trim() ?? "";
  if (!cta) {
    errors.push(E("ctaText", "ctaText.required", "Texto do botão é obrigatório."));
  } else if (cta.length > CONTENT_LIMITS.ctaText) {
    errors.push(
      E(
        "ctaText",
        "ctaText.tooLong",
        `Texto do botão deve ter no máximo ${CONTENT_LIMITS.ctaText} caracteres.`,
      ),
    );
  }

  // ── Visual ───────────────────────────────────────────
  if (state.coverSource !== "upload" && state.coverSource !== "url") {
    errors.push(
      E("coverSource", "coverSource.invalid", "Origem da capa inválida."),
    );
  }
  const effectiveThumb =
    state.coverSource === "upload"
      ? state.thumbnailUploadUrl
      : state.thumbnailExternalUrl;
  if (!effectiveThumb) {
    warnings.push(
      W(
        "thumbnailUrl",
        "thumbnail.missing",
        "Sem imagem de capa: o produto será publicado sem thumbnail.",
      ),
    );
  }

  // ── Configuração / entrega ───────────────────────────
  if (state.deliveryType !== "url" && state.deliveryType !== "file") {
    errors.push(
      E(
        "deliveryType",
        "deliveryType.invalid",
        "Modo de entrega pós-captura inválido.",
      ),
    );
  }
  if (state.deliveryType === "url") {
    const v = validateDeliveryUrl(state.deliveryUrl);
    if (!v.valid) {
      errors.push(
        E(
          "deliveryUrl",
          "deliveryUrl.invalid",
          v.error ?? "URL de redirecionamento inválida.",
        ),
      );
    }
  } else if (state.deliveryType === "file" && !state.deliveryFileUrl) {
    errors.push(
      E(
        "deliveryFileUrl",
        "deliveryFileUrl.required",
        "Selecione o arquivo a ser entregue após a captura.",
      ),
    );
  }

  if (!state.confirmationSubject?.trim()) {
    warnings.push(
      W(
        "confirmationSubject",
        "confirmationSubject.empty",
        "Assunto do email de confirmação está vazio.",
      ),
    );
  }
  if (!state.confirmationBody?.trim()) {
    warnings.push(
      W(
        "confirmationBody",
        "confirmationBody.empty",
        "Corpo do email de confirmação está vazio.",
      ),
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}
