// =============================================================
// Migration layer — promove produtos antigos para o schema atual
// ANTES de hidratar o EditorState. 100% puro.
//
// A função pública `migrateApiRowToCurrent`:
//   • detecta a versão de origem (sentinela ou heurística)
//   • aplica steps incrementais v0→v1→v2
//   • retorna a row "normalizada" para a versão atual + log de
//     transformações aplicadas (útil para telemetria/teste)
//
// Decisões de migração:
//   v0 → v1
//     • garante metadata.format_id (deriva do `type`)
//     • promove `thumbnail_url` para `metadata.thumbnail_upload_url`
//       caso seja URL pública do bucket próprio; senão vai para
//       `thumbnail_external_url` e `cover_source = "url"`.
//     • normaliza `delivery_mode` (default "url" se ausente).
//
//   v1 → v2
//     • carimba `metadata.leadMagnetConfigVersion = 2`.
//     • garante shape de formFields na metadata (system fields
//       implícitos quando ausentes).
//     • normaliza confirmação: defaults só são aplicados em
//       LEITURA (mappers), aqui apenas garantimos que existem
//       chaves estáveis na metadata para futuras evoluções.
// =============================================================

import type { ApiProductRow } from "./types";
import {
  LEAD_MAGNET_CONFIG_VERSION,
  readConfigVersion,
  type LeadMagnetConfigVersion,
} from "./schemaVersion";

export interface MigrationResult {
  row: ApiProductRow;
  fromVersion: LeadMagnetConfigVersion;
  toVersion: LeadMagnetConfigVersion;
  steps: string[];
}

const KIVO_BUCKET_HINTS = [
  "supabase.co/storage/v1/object/public/",
  "supabase.in/storage/v1/object/public/",
];

function looksLikeOwnUpload(url: string | null | undefined): boolean {
  if (!url) return false;
  return KIVO_BUCKET_HINTS.some((h) => url.includes(h));
}

/** v0 → v1 — preenche metadata estruturada. */
function stepV0toV1(row: ApiProductRow, steps: string[]): ApiProductRow {
  const meta: Record<string, unknown> = { ...(row.metadata ?? {}) };

  if (typeof meta.format_id !== "string" || meta.format_id.length === 0) {
    meta.format_id = (row.type || "lead_magnet").toLowerCase();
    steps.push("v0->v1:format_id-derived");
  }

  // cover_source + buckets separados
  if (typeof meta.cover_source !== "string") {
    const thumb = row.thumbnail_url ?? "";
    if (looksLikeOwnUpload(thumb)) {
      meta.cover_source = "upload";
      meta.thumbnail_upload_url = thumb;
      meta.thumbnail_external_url = "";
    } else if (thumb) {
      meta.cover_source = "url";
      meta.thumbnail_external_url = thumb;
      meta.thumbnail_upload_url = "";
    } else {
      meta.cover_source = "upload";
      meta.thumbnail_upload_url = "";
      meta.thumbnail_external_url = "";
    }
    steps.push("v0->v1:cover_source-classified");
  }

  // delivery_mode default
  let delivery_mode = row.delivery_mode;
  if (delivery_mode !== "url" && delivery_mode !== "file") {
    delivery_mode = "url";
    steps.push("v0->v1:delivery_mode-defaulted");
  }

  return { ...row, delivery_mode, metadata: meta };
}

/** v1 → v2 — formaliza versão e shape de form fields. */
function stepV1toV2(row: ApiProductRow, steps: string[]): ApiProductRow {
  const meta: Record<string, unknown> = { ...(row.metadata ?? {}) };

  meta.leadMagnetConfigVersion = LEAD_MAGNET_CONFIG_VERSION;
  steps.push("v1->v2:version-stamped");

  // Form fields: garante chave estável (engine de runtime continua
  // usando a tabela product_form_fields; a metadata armazena apenas
  // marcação para futuros snapshots/exports).
  if (!Array.isArray(meta.formFieldsSnapshot)) {
    meta.formFieldsSnapshot = [];
    steps.push("v1->v2:formFieldsSnapshot-initialized");
  }

  return { ...row, metadata: meta };
}

/**
 * Aplica todos os steps necessários para chegar na versão atual.
 * Idempotente: re-rodar em uma row já v2 é no-op.
 */
export function migrateApiRowToCurrent(row: ApiProductRow): MigrationResult {
  const fromVersion = readConfigVersion(row.metadata);
  const steps: string[] = [];
  let current: ApiProductRow = row;

  if (fromVersion < 1) current = stepV0toV1(current, steps);
  if (fromVersion < 2) current = stepV1toV2(current, steps);

  return {
    row: current,
    fromVersion,
    toVersion: LEAD_MAGNET_CONFIG_VERSION,
    steps,
  };
}
