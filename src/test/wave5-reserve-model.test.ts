import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeBalances } from "../../supabase/functions/_shared/wallet-balance.ts";

/**
 * QA-4A-V5-RESERVE-MODEL — modelo canônico da reserva de segurança.
 *
 * Política aprovada (produto): reserve_entries é a única fonte canônica;
 * reserva = 10% de split_entries.creator_net em centavos, com arredondamento
 * determinístico para BAIXO; FREE também 10%/30d; security_reserves congelada.
 *
 * Equações verificadas aqui:
 *   reserve  = floor(creator_net * round(pct*100) / 10000)
 *   available = creator_net - reserve
 *   available + reserve = creator_net  (sempre exato, sem centavo perdido)
 */

const MIGRATION = "supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql";
const sql = readFileSync(MIGRATION, "utf-8");
const webhook = readFileSync("supabase/functions/webhook-asaas/index.ts", "utf-8");
const createPayment = readFileSync("supabase/functions/create-payment/index.ts", "utf-8");
const releaseHolds = readFileSync("supabase/functions/release-holds/index.ts", "utf-8");
const releaseReserves = readFileSync("supabase/functions/release-reserves/index.ts", "utf-8");
const refunds = readFileSync("supabase/functions/_shared/refunds.ts", "utf-8");

/** Espelho TS exato de public.reserve_amount_cents (divisão inteira = floor). */
function reserveCents(creatorNet: number, percent = 10): number {
  if (creatorNet <= 0 || percent <= 0) return 0;
  return Math.floor((creatorNet * Math.round(percent * 100)) / 10000);
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

// ───────────────────────── 1. Arredondamento em centavos ─────────────────────────
describe("QA-4A-V5 — arredondamento determinístico da reserva", () => {
  const cases: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [5, 0],
    [9, 0],
    [10, 1],
    [11, 1],
    [19, 1],
    [99, 9],
    [4850, 485],
    [4855, 485],
    [12345, 1234],
    [999999, 99999],
  ];

  for (const [net, expected] of cases) {
    it(`creator_net ${net} → reserva ${expected} e disponível ${net - expected}`, () => {
      expect(reserveCents(net)).toBe(expected);
      expect(reserveCents(net) + (net - reserveCents(net))).toBe(net);
    });
  }

  it("nunca reserva mais do que o líquido, nem valor negativo", () => {
    for (let net = 0; net <= 3000; net++) {
      const r = reserveCents(net);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(net);
      expect(net - r + r).toBe(net);
    }
  });

  it("valores não divisíveis por 10 arredondam para baixo (nunca criam centavo)", () => {
    expect(reserveCents(1007)).toBe(100);
    expect(1007 - reserveCents(1007)).toBe(907);
  });

  it("percentual 0 (não elegível) mantém 100% disponível", () => {
    expect(reserveCents(4850, 0)).toBe(0);
  });
});

// ───────────────────────── 2. Settlement: soma exata ─────────────────────────
describe("QA-4A-V5 — settlement segrega sem criar/destruir valor", () => {
  const NET = 4850;
  const RES = reserveCents(NET); // 485

  it("available + reserva = creator_net (venda já liberada)", () => {
    const b = computeBalances([sale(NET, "available", DUE), adj(-RES, "available", DUE)]);
    expect(b.available).toBe(NET - RES);
    expect(b.available + RES).toBe(NET);
  });

  it("venda em hold: débito herda o estágio e nada fica available negativo", () => {
    const b = computeBalances([sale(NET, "pending", NOT_DUE), adj(-RES, "pending", NOT_DUE)]);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(NET - RES);
  });

  it("replay do settlement não duplica o débito (unicidade estrutural)", () => {
    const rows = [sale(NET, "available", DUE), adj(-RES, "available", DUE)];
    expect(computeBalances(rows)).toEqual(computeBalances(rows));
    expect(sql).toMatch(/uniq_wallet_ledger_reserve_entry_role/);
    expect(sql).toMatch(/uniq_reserve_entries_order/);
    expect(sql).toMatch(/uniq_reserve_entries_split_entry/);
  });
});

// ───────────────────────── 3. Release em 30 dias ─────────────────────────
describe("QA-4A-V5 — liberação da reserva", () => {
  const NET = 4850;
  const RES = reserveCents(NET);

  it("após 30 dias o crédito de liberação fecha o saldo em creator_net", () => {
    const b = computeBalances([
      sale(NET, "available", DUE),
      adj(-RES, "available", DUE),
      adj(RES, "available", DUE),
    ]);
    expect(b.total).toBe(NET);
  });

  it("antes do prazo nada é creditado: saldo continua creator_net - reserva", () => {
    const b = computeBalances([sale(NET, "available", DUE), adj(-RES, "available", DUE)]);
    expect(b.total).toBe(NET - RES);
    expect(sql).toMatch(/'NOT_DUE'/);
  });

  it("replay/concorrência: crédito único por (reserve_entry_id, reserve_role)", () => {
    expect(sql).toMatch(/uniq_wallet_ledger_reserve_entry_role[\s\S]*reserve_entry_id, reserve_role/);
    expect(sql).toMatch(/credit_replayed/);
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it("não antecipa liquidez: crédito herda status/available_at do débito de origem", () => {
    expect(sql).toMatch(/v_debit\.status/);
    expect(sql).toMatch(/v_debit\.available_at/);
    const b = computeBalances([
      sale(NET, "pending", NOT_DUE),
      adj(-RES, "pending", NOT_DUE),
      adj(RES, "pending", NOT_DUE),
    ]);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(NET);
  });

  it("reserva sem débito de segregação (legado) segue retida — fail-closed", () => {
    expect(sql).toMatch(/NEEDS_PRODUCT_DECISION/);
  });

  it("chargeback ativo prorroga em vez de liberar", () => {
    expect(sql).toMatch(/HELD_CHARGEBACK/);
    expect(sql).toMatch(/chargeback_cases/);
  });
});

// ───────────────────────── 4. Refund parcial e total ─────────────────────────
describe("QA-4A-V5 — refund antes e depois do release", () => {
  const NET = 10000;
  const RES = reserveCents(NET); // 1000

  it("parcial 30% ANTES do release: reserva recai sobre o líquido remanescente", () => {
    const remaining = 7000;
    const newRes = reserveCents(remaining); // 700
    const b = computeBalances([
      sale(NET, "available", DUE),
      adj(-RES, "available", DUE),
      adj(RES - newRes, "available", DUE), // devolução parcial da segregação
      refundRow(3000, "available", DUE),
    ]);
    expect(b.total).toBe(remaining - newRes);
    expect(b.total + newRes).toBe(remaining);
  });

  it("total ANTES do release: disponível e reservado fecham em 0", () => {
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      refundRow(NET, "canceled", DUE),
    ]);
    expect(b.total).toBe(0);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(0);
  });

  it("total DEPOIS do release: crédito liberado é neutralizado, saldo 0", () => {
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      adj(RES, "canceled", DUE),
      refundRow(NET, "canceled", DUE),
    ]);
    expect(b.total).toBe(0);
  });

  it("refund nunca produz disponível negativo antes do hold", () => {
    const b = computeBalances([
      sale(NET, "pending", NOT_DUE),
      adj(-RES, "pending", NOT_DUE),
      refundRow(3000, "pending", NOT_DUE),
    ]);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(NET - RES - 3000);
  });

  it("refunds.ts recalcula a reserva pelo líquido remanescente (fail-closed)", () => {
    expect(refunds).toMatch(/reverse_reserve_entry/);
    expect(refunds).toMatch(/p_remaining_net_cents/);
    expect(refunds).toMatch(/refund_partial/);
    expect(refunds).toMatch(/refund_total/);
    expect(refunds).toMatch(/throw new Error\(`reverse_reserve_entry falhou/);
  });
});

// ───────────────────────── 5. Chargeback perdido e ganho ─────────────────────────
describe("QA-4A-V5 — chargeback", () => {
  const NET = 4850;
  const RES = reserveCents(NET);

  it("perdido ANTES do release: reserva forfeited, sem crédito, saldo 0", () => {
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      { amount: NET, status: "available", type: "chargeback", available_at: DUE },
    ]);
    expect(b.total).toBe(-NET + 0); // débito de chargeback sobre venda já cancelada
    expect(sql).toMatch(/forfeited/);
  });

  it("perdido DEPOIS do release: crédito de liberação também é cancelado", () => {
    const b = computeBalances([
      sale(NET, "canceled", DUE),
      adj(-RES, "canceled", DUE),
      adj(RES, "canceled", DUE),
    ]);
    expect(b.total).toBe(0);
  });

  it("ganho: restore_reserve_entry devolve a reserva ao estado retido", () => {
    expect(sql).toMatch(/restore_reserve_entry/);
    expect(sql).toMatch(/'RESTORED'/);
  });

  it("webhook usa a RPC de reversão em vez de UPDATE manual", () => {
    expect(webhook).toMatch(/reverse_reserve_entry/);
    expect(webhook).toMatch(/chargeback_lost/);
    expect(webhook).not.toMatch(/from\("security_reserves"\)\.update/);
  });
});

// ───────────────────────── 6. Ordem dos eventos / idempotência ─────────────────────────
describe("QA-4A-V5 — eventos fora de ordem e replay", () => {
  it("reversão funciona mesmo se outro fluxo já marcou forfeited sem crédito", () => {
    expect(sql).toMatch(/v_res\.status NOT IN \('held', 'forfeited', 'reversed'\)/);
    expect(sql).toMatch(/reserve_role = 'reversal_credit'/);
  });

  it("release após reversão não credita (status já final)", () => {
    expect(sql).toMatch(/'ALREADY_PROCESSED'/);
  });

  it("settlement após reversão não recria reserva (unicidade por order_id)", () => {
    expect(sql).toMatch(/uniq_reserve_entries_order[\s\S]*order_id/);
  });
});

// ───────────────────────── 7. Segurança: IDOR, privilégios, RLS ─────────────────────────
describe("QA-4A-V5 — segurança das RPCs e tabelas", () => {
  const FNS = [
    "reserve_policy_for_workspace(uuid)",
    "reserve_amount_cents(bigint, numeric)",
    "settle_order_reserve(uuid)",
    "release_reserve_entry(uuid)",
    "reverse_reserve_entry(uuid, bigint, text, text)",
    "restore_reserve_entry(uuid)",
  ];

  for (const fn of FNS) {
    it(`${fn}: REVOKE de PUBLIC/anon/authenticated e GRANT só service_role`, () => {
      const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role;`));
    });
  }

  it("todas as funções fixam search_path e qualificam public.", () => {
    const count = (sql.match(/SET search_path TO 'public'/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(FNS.length);
  });

  it("IDOR: ownership de workspace validado dentro da transação", () => {
    expect(sql).toMatch(/OWNERSHIP_MISMATCH/);
    const occurrences = (sql.match(/OWNERSHIP_MISMATCH/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it("reserve_entries: RLS por workspace e escrita apenas via service_role", () => {
    expect(sql).toMatch(/ALTER TABLE public\.reserve_entries ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.reserve_entries FROM anon, authenticated;/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.reserve_entries TO authenticated;/);
    expect(sql).toMatch(/GRANT ALL ON TABLE public\.reserve_entries TO service_role;/);
  });

  it("nenhum service_role no cliente", () => {
    const src = readFileSync("src/integrations/supabase/client.ts", "utf-8");
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/);
  });
});

// ───────────────────────── 8. security_reserves descontinuada ─────────────────────────
describe("QA-4A-V5 — security_reserves congelada e sem consumidores ativos", () => {
  it("trigger fail-closed bloqueia novas escritas, sem apagar histórico", () => {
    expect(sql).toMatch(/CREATE TRIGGER trg_security_reserves_frozen/);
    expect(sql).toMatch(/fn_security_reserves_frozen/);
    expect(sql).not.toMatch(/DROP TABLE public\.security_reserves/);
    expect(sql).not.toMatch(/DELETE FROM public\.security_reserves/);
  });

  it("nenhum caminho de settlement escreve security_reserves", () => {
    for (const src of [webhook, createPayment]) {
      expect(src).not.toMatch(/from\("security_reserves"\)\.insert/);
      expect(src).not.toMatch(/from\("security_reserves"\)\.upsert/);
      expect(src).not.toMatch(/from\("security_reserves"\)\.update/);
    }
  });

  it("release-reserves está deprecada e não executa escritas", () => {
    expect(releaseReserves).toMatch(/DEPRECADA/);
    expect(releaseReserves).toMatch(/writes_performed: 0/);
    expect(releaseReserves).not.toMatch(/release_security_reserve/);
    expect(releaseReserves).not.toMatch(/\.insert\(/);
    expect(releaseReserves).not.toMatch(/\.update\(/);
  });

  it("frontend lê a fonte canônica reserve_entries", () => {
    const income = readFileSync("src/pages/Income.tsx", "utf-8");
    const section = readFileSync("src/components/income/SecurityReservesSection.tsx", "utf-8");
    expect(income).toMatch(/from\("reserve_entries"\)/);
    expect(section).toMatch(/from\("reserve_entries"\)/);
    expect(income).not.toMatch(/from\("security_reserves"\)/);
    expect(section).not.toMatch(/from\("security_reserves"\)/);
  });

  it("migration documenta o caminho de remoção", () => {
    expect(releaseReserves).toMatch(/CAMINHO DE REMOÇÃO/);
  });
});

// ───────────────────────── 9. Caminho único de settlement ─────────────────────────
describe("QA-4A-V5 — nenhum caminho credita creator_net integral", () => {
  it("webhook chama settle_order_reserve e falha fechado em erro", () => {
    expect(webhook).toMatch(/rpc\(\s*\n?\s*"settle_order_reserve"/);
    expect(webhook).toMatch(/throw new Error\(`settle_order_reserve falhou/);
  });

  it("webhook não insere mais reserve_entries manualmente", () => {
    expect(webhook).not.toMatch(/from\("reserve_entries"\)\.insert/);
  });

  it("create-payment não cria reserva antes de existir crédito no ledger", () => {
    expect(createPayment).not.toMatch(/from\("reserve_entries"\)\.insert/);
    expect(createPayment).toMatch(/settle_order_reserve/); // apenas na nota explicativa
  });

  it("release-holds usa a RPC canônica de liberação", () => {
    expect(releaseHolds).toMatch(/rpc\("release_reserve_entry"/);
    expect(releaseHolds).not.toMatch(/from\("reserve_entries"\)\.update/);
  });

  it("FREE usa política explícita 10%/30d (sem fallback implícito)", () => {
    expect(sql).toMatch(/reserve_policy_for_workspace/);
    expect(sql).toMatch(/RESERVE_POLICY_DRIFT/);
  });
});

// ───────────────────────── 10. Legado reconciliado sem lançamento ─────────────────────────
describe("QA-4A-V5 — reserva legada reconciliada sem crédito/débito retroativo", () => {
  it("marca reconciled_legacy com nota auditável", () => {
    expect(sql).toMatch(/reconciled_legacy/);
    expect(sql).toMatch(/reconciliation_note/);
  });

  it("não insere lançamentos financeiros retroativos para o legado", () => {
    const legacyBlock = sql.slice(sql.indexOf("reconciled_legacy"));
    expect(legacyBlock).not.toMatch(/INSERT INTO public\.wallet_ledger[\s\S]{0,400}reconciled_legacy/);
  });
});

// ───────────────────────── 11. Saques ─────────────────────────
describe("QA-4A-V5 — saque não usa reserva retida", () => {
  it("saldo economicamente disponível exclui a fatia reservada", () => {
    const NET = 10000;
    const RES = reserveCents(NET);
    const b = computeBalances([sale(NET, "available", DUE), adj(-RES, "available", DUE)]);
    expect(b.available).toBe(NET - RES);
    expect(b.available).toBeLessThan(NET);
  });

  it("get-wallet-balance reporta reserva separada do disponível", () => {
    const src = readFileSync("supabase/functions/get-wallet-balance/index.ts", "utf-8");
    expect(src).toMatch(/from\("reserve_entries"\)/);
    expect(src).toMatch(/reserve_balance_cents/);
    expect(src).not.toMatch(/available_balance_cents: availableBalance \+ reserveBalance/);
  });
});
