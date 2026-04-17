// =============================================================
// Feature flags client-side do Lead Magnet Editor v2.
//
// Hierarquia:
//   • lead_magnet_editor_v2 (master kill-switch)
//   • lm_v2_state           (B1 — store unificada + mappers)
//   • lm_v2_content_validation (B2)
//   • lm_v2_delivery_file   (B3)
//   • lm_v2_cover_dual_bucket (B4)
//
// Resolução (precedência):
//   1) localStorage  → "flag:<name>" = "true"|"false"   (override dev)
//   2) env var       → VITE_<NAME_UPPER>                (build-time)
//   3) default       → DEV=true, PROD=false (master);
//                      sub-flags herdam master por padrão
//
// SSR-safe: nunca toca window sem guard.
// Sub-flags só ficam ON se o master estiver ON.
// =============================================================

export const LM_FLAGS = {
  master: "lead_magnet_editor_v2",
  state: "lm_v2_state",
  contentValidation: "lm_v2_content_validation",
  deliveryFile: "lm_v2_delivery_file",
  coverDualBucket: "lm_v2_cover_dual_bucket",
} as const;

export type LmFlagName = (typeof LM_FLAGS)[keyof typeof LM_FLAGS];

function readLocalStorage(name: string): boolean | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const v = window.localStorage?.getItem(`flag:${name}`);
    if (v === "true") return true;
    if (v === "false") return false;
  } catch {
    // localStorage pode lançar em modos privados ou SSR
  }
  return undefined;
}

function readEnv(name: string): boolean | undefined {
  try {
    const env = (import.meta as any).env ?? {};
    const v = env[`VITE_${name.toUpperCase()}`];
    if (v === "true" || v === true) return true;
    if (v === "false" || v === false) return false;
  } catch {
    // Acessos a import.meta podem falhar em runners exóticos
  }
  return undefined;
}

function readFlag(name: string, fallback: boolean): boolean {
  const ls = readLocalStorage(name);
  if (ls !== undefined) return ls;
  const env = readEnv(name);
  if (env !== undefined) return env;
  return fallback;
}

function isDev(): boolean {
  try {
    return Boolean((import.meta as any).env?.DEV);
  } catch {
    return false;
  }
}

/** Master kill-switch. Default: ON em dev, OFF em prod. */
export function isLmMasterEnabled(): boolean {
  return readFlag(LM_FLAGS.master, isDev());
}

/** B1 — store unificada + mappers + migration. Sub-flag herda master. */
export function isLmV2StateEnabled(): boolean {
  if (!isLmMasterEnabled()) return false;
  return readFlag(LM_FLAGS.state, true);
}

/** B2 — validações de conteúdo via Zod. Sub-flag herda master. */
export function isLmV2ContentValidationEnabled(): boolean {
  if (!isLmMasterEnabled()) return false;
  return readFlag(LM_FLAGS.contentValidation, true);
}

/** B3 — modo de entrega por arquivo. Sub-flag herda master. */
export function isLmV2DeliveryFileEnabled(): boolean {
  if (!isLmMasterEnabled()) return false;
  return readFlag(LM_FLAGS.deliveryFile, true);
}

/** B4 — dois buckets de capa (upload + url). Sub-flag herda master. */
export function isLmV2CoverDualBucketEnabled(): boolean {
  if (!isLmMasterEnabled()) return false;
  return readFlag(LM_FLAGS.coverDualBucket, true);
}

/**
 * Snapshot síncrono útil para telemetria/testes.
 * NÃO usar como fonte reativa em components — chame as funções
 * individuais para garantir leitura fresh a cada render.
 */
export function snapshotLmFlags(): Record<LmFlagName, boolean> {
  return {
    [LM_FLAGS.master]: isLmMasterEnabled(),
    [LM_FLAGS.state]: isLmV2StateEnabled(),
    [LM_FLAGS.contentValidation]: isLmV2ContentValidationEnabled(),
    [LM_FLAGS.deliveryFile]: isLmV2DeliveryFileEnabled(),
    [LM_FLAGS.coverDualBucket]: isLmV2CoverDualBucketEnabled(),
  };
}

/**
 * Helper de teste/dev — define flag em localStorage e devolve
 * função de cleanup. Não usar em produção.
 */
export function __setFlagForTest(name: LmFlagName, value: boolean | null): () => void {
  if (typeof window === "undefined") return () => {};
  const key = `flag:${name}`;
  const prev = window.localStorage?.getItem(key);
  if (value === null) {
    window.localStorage?.removeItem(key);
  } else {
    window.localStorage?.setItem(key, value ? "true" : "false");
  }
  return () => {
    if (prev === null || prev === undefined) {
      window.localStorage?.removeItem(key);
    } else {
      window.localStorage?.setItem(key, prev);
    }
  };
}
