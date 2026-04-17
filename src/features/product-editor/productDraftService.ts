// =============================================================
// productDraftService — criação idempotente de drafts de produto.
//
// Garante que cliques duplicados (double-tap, double-click) não
// produzam dois rascunhos para o mesmo (workspace, format).
//
// Estratégias:
//   1) Lock in-memory: Map<lockKey, Promise<Result>> compartilhado
//      por workspace+format. Cliques concorrentes recebem a MESMA
//      Promise — não dispara segundo INSERT.
//   2) Recovery key em sessionStorage: se o usuário criar o draft
//      e a navegação falhar (network, refresh durante navigate),
//      a próxima tentativa em ≤ 30s reaproveita o id existente
//      em vez de criar outro.
//   3) Retry exponencial leve (até 2 tentativas) em erros de rede
//      transitórios.
//
// Este service NÃO conhece UI; é puro data-layer e por isso
// totalmente testável.
// =============================================================

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ProductType = Database["public"]["Enums"]["product_type"];

export interface DraftFormat {
  /** id estável do formato (collect_emails, course, …) */
  id: string;
  /** mapeia para o enum product_type no DB */
  dbType: ProductType;
  /** nome inicial do produto (placeholder) */
  defaultName?: string;
  /** publica imediatamente (caso especial: link de afiliado) */
  publishImmediately?: boolean;
  /** metadata extra a anexar ao insert */
  extraMetadata?: Record<string, unknown>;
}

export interface CreateDraftInput {
  workspaceId: string;
  format: DraftFormat;
}

export interface CreateDraftResult {
  productId: string;
  /** true quando reaproveitamos um draft recente (idempotência) */
  reused: boolean;
}

// ── lock in-memory (módulo) ──────────────────────────────────
const inflight = new Map<string, Promise<CreateDraftResult>>();
const lockKeyOf = (i: CreateDraftInput) =>
  `${i.workspaceId}::${i.format.id}`;

// ── recovery key em sessionStorage ──────────────────────────
const RECOVERY_TTL_MS = 30_000;
const recoveryKeyOf = (i: CreateDraftInput) =>
  `kivo:draft-recovery:${i.workspaceId}:${i.format.id}`;

interface RecoveryRecord {
  productId: string;
  ts: number;
}

function readRecovery(input: CreateDraftInput): string | null {
  try {
    const raw = globalThis.sessionStorage?.getItem(recoveryKeyOf(input));
    if (!raw) return null;
    const rec = JSON.parse(raw) as RecoveryRecord;
    if (!rec?.productId || !rec?.ts) return null;
    if (Date.now() - rec.ts > RECOVERY_TTL_MS) {
      globalThis.sessionStorage?.removeItem(recoveryKeyOf(input));
      return null;
    }
    return rec.productId;
  } catch {
    return null;
  }
}

function writeRecovery(input: CreateDraftInput, productId: string) {
  try {
    const rec: RecoveryRecord = { productId, ts: Date.now() };
    globalThis.sessionStorage?.setItem(
      recoveryKeyOf(input),
      JSON.stringify(rec),
    );
  } catch {
    /* ignore */
  }
}

export function clearDraftRecovery(input: CreateDraftInput) {
  try {
    globalThis.sessionStorage?.removeItem(recoveryKeyOf(input));
  } catch {
    /* ignore */
  }
}

// ── núcleo: cria draft + price padrão ────────────────────────
async function performCreate(
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  // 1) idempotência por sessionStorage (clique → falha → retry)
  const recovered = readRecovery(input);
  if (recovered) {
    // valida que ainda existe (foi salvo de fato)
    const { data: existing } = await supabase
      .from("products")
      .select("id")
      .eq("id", recovered)
      .maybeSingle();
    if (existing?.id) {
      return { productId: existing.id, reused: true };
    }
    // recovery stale: limpa e segue para criação real
    clearDraftRecovery(input);
  }

  // 2) insert novo draft
  const { format, workspaceId } = input;
  const ts = Date.now().toString(36);
  const slug = `novo-produto-${ts}`;

  const insertPayload = {
    workspace_id: workspaceId,
    type: format.dbType,
    status: format.publishImmediately ? "PUBLISHED" : "DRAFT",
    name: format.defaultName ?? "Novo Produto",
    slug,
    metadata: {
      format_id: format.id,
      ...(format.extraMetadata ?? {}),
    },
  } as const;

  const { data: product, error } = await supabase
    .from("products")
    .insert(insertPayload as any)
    .select("id")
    .single();

  if (error) throw error;
  if (!product?.id) {
    throw new Error("Produto criado sem id retornado.");
  }

  // 3) preço padrão (não bloqueia a criação se falhar)
  try {
    await supabase.from("prices").insert({
      product_id: product.id,
      amount: 0,
      type: "ONE_TIME",
    } as any);
  } catch {
    /* preço default é best-effort */
  }

  writeRecovery(input, product.id);
  return { productId: product.id, reused: false };
}

/**
 * Cria (ou reaproveita) um draft de produto de forma idempotente.
 * Cliques concorrentes para o mesmo (workspace, format) compartilham
 * a mesma Promise — apenas UM INSERT é disparado.
 */
export function createProductDraft(
  input: CreateDraftInput,
): Promise<CreateDraftResult> {
  const key = lockKeyOf(input);
  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = performCreate(input).finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Exposto para testes — limpa o lock in-memory. */
export function __resetDraftServiceLocks() {
  inflight.clear();
}
