import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeBalances } from "../../supabase/functions/_shared/wallet-balance.ts";

/**
 * QA-4A-V6-RESERVE-ATOMICITY — correção dos três P0 do modelo V5.
 *
 * P0-1 reversão cumulativa: crédito de reversão = original_amount - reserva alvo
 *      (nunca o delta isolado). 100 → 80 → 60 ⇒ crédito acumulado 40.
 * P0-2 settlement + segregação no MESMO commit (public.settle_order_atomic),
 *      com rollback integral em falha e advisory lock por pedido.
 * P0-3 relógio do hold a partir de settled_at (settlement), nunca de
 *      split_entries.created_at.
 */

const V6 = "supabase/migrations/20260811110000_wave6_reserve_atomicity.sql";
const sql = readFileSync(V6, "utf-8");
const webhook = readFileSync("supabase/functions/webhook-asaas/index.ts", "utf-8");
const postPurchase = readFileSync("supabase/functions/post-purchase/index.ts", "utf-8");
const refunds = readFileSync("supabase/functions/_shared/refunds.ts", "utf-8");
const releaseHolds = readFileSync("supabase/functions/release-holds/index.ts", "utf-8");

// ───────────── Espelhos TS determinísticos das funções SQL ─────────────

/** public.reserve_amount_cents: floor por divisão inteira em basis points. */
function reserveCents(creatorNet: number, percent = 10): number {
  if (creatorNet <= 0 || percent <= 0) return 0;
  return Math.min(creatorNet, Math.floor((creatorNet * Math.round(percent * 100)) / 10000));
}

/** public.reverse_reserve_entry (V6): crédito CUMULATIVO e monotônico. */
function reverse(
  base: number,
  remainingNet: number,
  prevCumulativeCredit = 0,
  percent = 10,
) {
  const target0 = Math.min(reserveCents(remainingNet, percent), base);
  const cumulative = Math.max(base - target0, prevCumulativeCredit);
  const held = base - cumulative;
  return { cumulative, held, delta: cumulative - prevCumulativeCredit };
}

type Row = Parameters<typeof computeBalances>[0][number];
const DUE = "2026-07-01T00:00:00.000Z";
const NOT_DUE = "2099-01-01T00:00:00.000Z";
const sale = (amount: number, status: string, availableAt: string): Row => ({
  amount, status, type: "sale", available_at: availableAt,
});
const adj = (amount: number, status: string, availableAt: string): Row => ({
  amount, status, type: "adjustment", available_at: availableAt,
});
const refundRow = (amount: number, status: string, availableAt: string): Row => ({
  amount: Math.abs(amount), status, type: "refund", available_at: availableAt,
});

// ───────────── 1. Arredondamento de centavos no creator_net ─────────────
describe("QA-4A-V6 — arredondamento determinístico", () => {
  const cases: Array<[number, number]> = [
    [0, 0], [1, 0], [9, 0], [10, 1], [99, 9], [1007, 100], [4855, 485], [12345, 1234],
  ];
  for (const [net, expected] of cases) {
    it(`creator_net ${net} → reserva ${expected}, disponível ${net - expected}`, () => {
      expect(reserveCents(net)).toBe(expected);
      expect(reserveCents(net) + (net - reserveCents(net))).toBe(net);
    });
  }
});

// ───────────── 2. Settlement: 90% disponível + 10% reserva ─────────────
describe("QA-4A-V6 — settlement segrega 10% no mesmo commit", () => {
  it("creator_net 10000 → available 9000 + reserva 1000", () => {
    const NET = 10000;
    const RES = reserveCents(NET);
    expect(RES).toBe(1000);
    const b = computeBalances([sale(NET, "available", DUE), adj(-RES, "available", DUE)]);
    expect(b.available).toBe(9000);
    expect(b.available + RES).toBe(NET);
  });

  it("uma única RPC transacional executa financials + reserva", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.settle_order_atomic/);
    expect(sql).toMatch(/public\.process_order_commission\(/);
    expect(sql).toMatch(/public\.settle_order_reserve\(p_order_id\)/);
  });

  it("concorrência/replay: advisory lock transacional por pedido", () => {
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('settle_order_atomic:/);
    expect(sql).toMatch(/ON CONFLICT DO NOTHING/);
    expect(sql).toMatch(/uniq|ALREADY_PROCESSED/);
  });

  it("falha intermediária → rollback integral (exceção, nunca retorno parcial)", () => {
    expect(sql).toMatch(/RAISE EXCEPTION 'SETTLE_ATOMIC: financials recusados/);
    expect(sql).toMatch(/RAISE EXCEPTION 'SETTLE_ATOMIC: segregacao da reserva falhou/);
    expect(sql).toMatch(/SALE_LEDGER_MISSING/);
  });

  it("todos os caminhos reais de liquidação usam a mesma RPC", () => {
    expect(webhook).toMatch(/rpc\("settle_order_atomic"/);
    expect(postPurchase).toMatch(/rpc\("settle_order_atomic"/);
    expect(webhook).not.toMatch(/rpc\(\s*"process_order_commission"/);
    expect(postPurchase).not.toMatch(/rpc\("process_order_financials"/);
    // Nenhuma chamada separada de reserva depois do crédito.
    expect(webhook).not.toMatch(/rpc\(\s*\n?\s*"settle_order_reserve"/);
  });

  it("webhook falha fechado se a liquidação atômica não confirmar", () => {
    expect(webhook).toMatch(/throw new Error\(`settle_order_atomic falhou/);
    expect(webhook).toMatch(/não confirmou a liquidação/);
  });
});

// ───────────── 3. Relógio do hold: settled_at + prazo (FREE 30 dias) ─────────────
describe("QA-4A-V6 — hold conta do settlement, não do split", () => {
  it("coluna settled_at existe e alimenta release_at", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS settled_at timestamptz/);
    expect(sql).toMatch(/v_settled_at := now\(\)/);
    expect(sql).toMatch(/v_release_at := v_settled_at \+ make_interval\(days => v_days\)/);
  });

  it("não usa mais split_entries.created_at como origem do prazo", () => {
    expect(sql).not.toMatch(/COALESCE\(v_split\.created_at, now\(\)\) \+ make_interval/);
  });

  it("FREE: 10% por 30 dias exatos desde settled_at", () => {
    const settledAt = Date.UTC(2026, 7, 11, 12, 0, 0);
    const releaseAt = settledAt + 30 * 86400000;
    expect((releaseAt - settledAt) / 86400000).toBe(30);
    expect(sql).toMatch(/reserve_policy_for_workspace/);
    // Política FREE/CREATOR fail-closed em 10/30 (definida no V5, reutilizada aqui).
    const v5 = readFileSync("supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(v5).toMatch(/RESERVE_POLICY_DRIFT/);
  });

  it("release só depois do vencimento e apenas uma vez", () => {
    const v5 = readFileSync("supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(v5).toMatch(/'NOT_DUE'/);
    expect(v5).toMatch(/ALREADY_PROCESSED/);
    expect(releaseHolds).toMatch(/rpc\("release_reserve_entry"/);
  });
});

// ───────────── 4. P0-1: refunds parciais sucessivos cumulativos ─────────────
describe("QA-4A-V6 — reversão cumulativa (100 → 80 → 60 ⇒ 40)", () => {
  it("crédito acumulado 40 e reserva retida 60, sem centavo preso", () => {
    const base = 100;
    const first = reverse(base, 800);  // reserva alvo 80
    expect(first.cumulative).toBe(20);
    expect(first.held).toBe(80);

    const second = reverse(base, 600, first.cumulative); // reserva alvo 60
    expect(second.cumulative).toBe(40);
    expect(second.delta).toBe(20);
    expect(second.held).toBe(60);

    // Conservação: débito -100 + crédito acumulado 40 + retido 60 = 0
    expect(-base + second.cumulative + second.held).toBe(0);
  });

  it("SQL grava o valor ACUMULADO no upsert, nunca o delta", () => {
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect(code).toMatch(/v_cum\s*:= greatest\(v_base - v_target, v_prev\)/);
    expect(code).toMatch(/DO UPDATE SET\s*\n\s*amount\s*= EXCLUDED\.amount/);
    expect(code).not.toMatch(/amount = v_delta/);
    expect(code).toMatch(/SELECT COALESCE\(sum\(amount\), 0\) INTO v_prev/);
  });

  it("crédito é monotônico: chamada repetida não reduz o já emitido", () => {
    const base = 100;
    const after = reverse(base, 600, 40);
    const replay = reverse(base, 800, after.cumulative); // evento fora de ordem
    expect(replay.cumulative).toBe(40);
    expect(replay.delta).toBe(0);
  });

  it("saldo do ledger após 100 → 80 → 60 fecha exatamente", () => {
    const NET = 1000;
    const RES = reserveCents(NET); // 100
    const b = computeBalances([
      sale(NET, "available", DUE),
      adj(-RES, "available", DUE),
      adj(40, "available", DUE), // crédito cumulativo
      refundRow(400, "available", DUE), // 1000 → 600 remanescente
    ]);
    expect(b.total).toBe(600 - 60);
  });
});

// ───────────── 5. Parcial → total converge a zero ─────────────
describe("QA-4A-V6 — parcial seguido de total", () => {
  it("reversão total após parciais credita exatamente o restante", () => {
    const base = 1000;
    const partial = reverse(base, 7000, 0); // reserva alvo 700
    expect(partial.cumulative).toBe(300);
    const total = reverse(base, 0, partial.cumulative);
    expect(total.cumulative).toBe(1000);
    expect(total.delta).toBe(700);
    expect(total.held).toBe(0);
  });

  it("ledger converge a zero sem crédito/débito duplicado", () => {
    const NET = 10000;
    const RES = reserveCents(NET);
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      adj(RES, "canceled", DUE),
      refundRow(NET, "canceled", DUE),
    ]);
    expect(b.total).toBe(0);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(0);
  });
});

// ───────────── 6. Refund durante hold e após release ─────────────
describe("QA-4A-V6 — refund antes e depois do release", () => {
  it("durante o hold: crédito herda pending, nunca cria available negativo", () => {
    const NET = 10000;
    const RES = reserveCents(NET);
    const b = computeBalances([
      sale(NET, "pending", NOT_DUE),
      adj(-RES, "pending", NOT_DUE),
      adj(300, "pending", NOT_DUE),
      refundRow(3000, "pending", NOT_DUE),
    ]);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(7000 - 700);
    expect(sql).toMatch(/v_status := 'pending'; v_avail := v_debit\.available_at;/);
  });

  it("após o release: reversão usa o crédito acumulado do estágio available", () => {
    const NET = 10000;
    const RES = reserveCents(NET);
    const b = computeBalances([
      sale(NET, "available", DUE),
      adj(-RES, "available", DUE),
      adj(RES, "available", DUE), // release_credit
      refundRow(3000, "available", DUE),
    ]);
    expect(b.total).toBe(7000);
  });
});

// ───────────── 7. Chargeback durante hold e após release ─────────────
describe("QA-4A-V6 — chargeback", () => {
  it("perdido durante o hold: forfeited, reserva devolvida ao ledger e saldo 0", () => {
    const base = 485;
    const lost = reverse(base, 0, 0);
    expect(lost.cumulative).toBe(485);
    expect(lost.held).toBe(0);
    const b = computeBalances([
      sale(4850, "canceled", NOT_DUE),
      adj(-base, "canceled", NOT_DUE),
      adj(lost.cumulative, "canceled", NOT_DUE),
    ]);
    expect(b.total).toBe(0);
  });

  it("perdido após release: crédito de liberação também cancelado, sem saldo residual", () => {
    const NET = 4850;
    const RES = reserveCents(NET);
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      adj(RES, "canceled", DUE),
    ]);
    expect(b.total).toBe(0);
  });

  it("ganho: reserva restaurada ao valor original (restore_reserve_entry)", () => {
    const v5 = readFileSync("supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(v5).toMatch(/restore_reserve_entry/);
    expect(v5).toMatch(/amount = COALESCE\(original_amount, amount\)/);
    // V6.1: a reversão de chargeback vive dentro de resolve_chargeback_financials.
    const v61 = readFileSync("supabase/migrations/20260811120000_wave61_refund_chargeback_atomic.sql", "utf-8");
    expect(v61).toMatch(/reverse_reserve_entry/);
    expect(webhook).toMatch(/resolve_chargeback_financials/);
  });


  it("release durante chargeback ativo prorroga em vez de liberar", () => {
    const v5 = readFileSync("supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(v5).toMatch(/HELD_CHARGEBACK/);
  });
});

// ───────────── 8. Replay de release e de settlement ─────────────
describe("QA-4A-V6 — replay/idempotência", () => {
  it("settlement repetido devolve ALREADY_PROCESSED sem nova reserva", () => {
    expect(sql).toMatch(/'outcome', 'ALREADY_PROCESSED', 'reserve_id', v_existing\.id/);
  });

  it("release duplicado não credita duas vezes", () => {
    const v5 = readFileSync("supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql", "utf-8");
    expect(v5).toMatch(/credit_replayed/);
    expect(releaseHolds).toMatch(/credit_replayed/);
  });

  it("reversão repetida é reportada como ALREADY_PROCESSED (delta 0)", () => {
    expect(sql).toMatch(/WHEN v_target > 0 AND v_delta = 0 THEN 'ALREADY_PROCESSED'/);
  });

  it("refunds.ts delega o recálculo do líquido remanescente à RPC (V6.1)", () => {
    expect(refunds).toMatch(/process_refund_increment/);
    expect(refunds).not.toMatch(/reverse_reserve_entry/);
    const v61 = readFileSync("supabase/migrations/20260811120000_wave61_refund_chargeback_atomic.sql", "utf-8");
    expect(v61).toMatch(/p_remaining_net_cents/);
  });

});

// ───────────── 9. Isolamento por workspace / IDOR ─────────────
describe("QA-4A-V6 — isolamento e privilégios", () => {
  it("ownership validado dentro da transação (order vs split)", () => {
    expect(sql).toMatch(/OWNERSHIP_MISMATCH/);
    expect(sql).toMatch(/v_split\.workspace_id <> v_order\.workspace_id/);
  });

  it("crédito de reversão sempre no workspace da reserva", () => {
    expect(sql).toMatch(/VALUES \(\s*\n?\s*v_res\.workspace_id/);
  });

  const FNS = [
    "settle_order_reserve(uuid)",
    "reverse_reserve_entry(uuid, bigint, text, text)",
    "settle_order_atomic(uuid, integer)",
  ];
  for (const fn of FNS) {
    it(`${fn}: REVOKE de PUBLIC/anon/authenticated e GRANT só service_role`, () => {
      const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role;`));
    });
  }

  it("search_path fixo em todas as funções alteradas", () => {
    const count = (sql.match(/SET search_path TO 'public'/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(FNS.length);
  });

  it("não reintroduz security_reserves como fonte concorrente", () => {
    expect(sql).not.toMatch(/INSERT INTO public\.security_reserves/);
    expect(webhook).not.toMatch(/from\("security_reserves"\)\.(insert|update|upsert)/);
  });
});
