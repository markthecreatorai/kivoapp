import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeBalances } from "../../supabase/functions/_shared/wallet-balance.ts";

/**
 * QA-4A-V4-RESERVE-ORIGIN — modelo contábil da reserva de segurança.
 *
 * Evidência lida em banco real (queries read-only, 2026-08-11):
 * - fee_config: creator 10%/30d, creator_pro 10%/15d (fonte canônica do %).
 * - order 52d06af2: wallet_ledger sale = +4850 (pending, available_at D+14),
 *   fee = -140 (settled) e reserve_entries.amount = 437 (held) — SEM nenhum
 *   lançamento de débito de segregação no ledger.
 * - security_reserves NÃO possui a coluna order_id no schema aplicado e tem 0
 *   linhas: o insert do webhook/create-payment falha hoje.
 *
 * Consequência: a origem credita creator_net INTEGRAL. Creditar a liberação da
 * reserva (comportamento antigo de release-holds) inventava dinheiro.
 */

type Row = Parameters<typeof computeBalances>[0][number];

const SALE_NET = 4850; // centavos creditados pela origem
const RESERVE = 437; // centavos retidos em reserve_entries
const DUE = "2026-08-01T00:00:00.000Z";
const NOT_DUE = "2099-01-01T00:00:00.000Z";

const sale = (status: string, availableAt: string): Row => ({
  amount: SALE_NET,
  status,
  type: "sale",
  available_at: availableAt,
});

describe("QA-4A-V4 — reserva não pode criar nem destruir centavos", () => {
  it("origem credita creator_net integral (sem débito de segregação)", () => {
    const b = computeBalances([sale("pending", DUE)]);
    expect(b.available).toBe(SALE_NET);
    expect(b.pending).toBe(0);
  });

  it("crédito de liberação sem débito prévio inflaria o saldo em 10%", () => {
    const inflated = computeBalances([
      sale("pending", DUE),
      { amount: RESERVE, status: "available", type: "adjustment", available_at: DUE },
    ]);
    expect(inflated.total).toBe(SALE_NET + RESERVE);
    expect(inflated.total).toBeGreaterThan(SALE_NET); // por isso o fail-closed
  });

  it("fail-closed: reserva vencida permanece held e o saldo continua creator_net", () => {
    const b = computeBalances([sale("pending", DUE)]);
    expect(b.total).toBe(SALE_NET);
  });

  it("modelo correto (após decisão de produto) fecha em creator_net - reserva", () => {
    const withSegregation = computeBalances([
      sale("pending", DUE),
      { amount: -RESERVE, status: "available", type: "adjustment", available_at: DUE },
    ]);
    expect(withSegregation.total).toBe(SALE_NET - RESERVE);

    const afterRelease = computeBalances([
      sale("pending", DUE),
      { amount: -RESERVE, status: "available", type: "adjustment", available_at: DUE },
      { amount: RESERVE, status: "available", type: "adjustment", available_at: DUE },
    ]);
    expect(afterRelease.total).toBe(SALE_NET);
  });

  it("venda ainda em hold: liberação não pode antecipar liquidez", () => {
    const b = computeBalances([sale("pending", NOT_DUE)]);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(SALE_NET);
  });

  it("replay do mesmo ciclo/worker não muda o saldo (nenhum crédito é emitido)", () => {
    const rows = [sale("pending", DUE)];
    const first = computeBalances(rows);
    const second = computeBalances(rows);
    expect(second).toEqual(first);
  });
});

// NOTA QA-4A-V5: o fail-closed abaixo foi SUPERADO pela decisão de produto —
// o settlement passou a segregar a reserva na origem (settle_order_reserve), o
// que torna o crédito de liberação legítimo. O job segue sem inserir crédito
// diretamente (isso vive na RPC) e reservas LEGADAS sem débito continuam
// retidas com NEEDS_PRODUCT_DECISION, então estas asserções continuam válidas.
describe("QA-4A-V4 — contrato do job release-holds", () => {
  const src = readFileSync("supabase/functions/release-holds/index.ts", "utf-8");

  it("não insere mais crédito de reserva no wallet_ledger", () => {
    expect(src).not.toMatch(/Liberação de reserva de segurança/);
    expect(src).not.toMatch(/type: "adjustment"/);
  });

  it("mantém a reserva retida e reporta NEEDS_PRODUCT_DECISION", () => {
    expect(src).toMatch(/NEEDS_PRODUCT_DECISION/);
    expect(src).toMatch(/reserves_needs_product_decision/);
  });

  it("preserva a prorrogação por chargeback ativo (agora dentro da RPC)", () => {
    // QA-4A-V5: chargeback ativo é avaliado na mesma transação do crédito, em
    // public.release_reserve_entry (outcome HELD_CHARGEBACK), e o job apenas
    // contabiliza o resultado.
    expect(src).toMatch(/reservesHeldByChargeback\+\+/);
    expect(src).toMatch(/held_chargeback/);
    const sql = readFileSync(
      "supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(sql).toMatch(/chargeback_cases/);
    expect(sql).toMatch(/HELD_CHARGEBACK/);
  });

  it("continua liberando wallet_ledger pending vencido (hold normal)", () => {
    expect(src).toMatch(/\.update\(\{ status: "available" \}\)/);
  });
});
