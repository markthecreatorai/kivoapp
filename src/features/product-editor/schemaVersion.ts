// =============================================================
// Lead Magnet — versionamento de schema do payload do editor.
//
// Cada produto persiste em `metadata.leadMagnetConfigVersion`
// a versão do contrato com que foi escrito pela última vez.
//
// Histórico:
//   • v0 (implícito)  — produtos legados sem metadata estruturada.
//                       Não havia cover_source, formFields tinham
//                       shape antigo (apenas array de labels), e
//                       confirmação de email vivia em campos soltos.
//   • v1 (implícito)  — introduziu `metadata.format_id` +
//                       `cover_source`/`thumbnail_*_url` separados,
//                       mas sem sentinela explícita de versão.
//   • v2 (atual)      — formaliza a versão (sentinela explícita),
//                       valida integridade no publish e introduz
//                       `metadata.leadMagnetConfigVersion = 2`.
//
// Regras de compatibilidade:
//   • Leitura: SEMPRE roda o pipeline de migração antes de
//     hidratar o EditorState (qualquer versão antiga vira v2 em
//     memória).
//   • Escrita: o adapter NUNCA grava versão menor que a atual.
//     Ao salvar, força `leadMagnetConfigVersion = CURRENT_VERSION`.
//   • Publish: bloqueia se integridade falhar (ver
//     `publishValidation.ts`).
// =============================================================

export const LEAD_MAGNET_CONFIG_VERSION = 2 as const;

export type LeadMagnetConfigVersion = 0 | 1 | 2;

/**
 * Lê a versão da metadata do produto. Produtos sem sentinela
 * são considerados v0 (mais antigo possível) e o pipeline decide
 * para qual versão promover.
 */
export function readConfigVersion(
  metadata: Record<string, unknown> | null | undefined,
): LeadMagnetConfigVersion {
  const raw = metadata?.leadMagnetConfigVersion;
  if (raw === 2) return 2;
  if (raw === 1) return 1;
  if (raw === 0) return 0;
  // Heurística para produtos pré-sentinela:
  // se já existe `cover_source` na metadata, eles são v1.
  if (metadata && typeof metadata.cover_source === "string") return 1;
  return 0;
}
