import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Onda 3 / P0 FI-REFUND-V2 — SALDOS
//
// A migration pendente é a especificação. Este arquivo faz duas coisas:
//   1. Assertions diretas no SQL (guardas de aplicação, unidades, estágio
//      espelhado, cancelamento conjunto sale+refund).
//   2. Um simulador em TS que replica a semântica da RPC e de
//      public.get_wallet_balance, para provar centavo a centavo os cenários de
//      saldo exigidos — inclusive o defeito antigo (venda 100, parcial 30,
//      total 70 deixava -30 residual).
//
// Unidades: wallet_ledger/split_entries em CENTAVOS; refunds/payments em REAIS.
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION_PATH =
  "supabase/migrations-pending/20260811074500_process_refund_increment_atomic.sql";
const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), "utf-8");

// ═══ 1. Especificação no SQL ════════════════════════════════════════════════

describe("FI-REFUND-V2 / migration — fonte única e guardas de aplicação", () => {
  it("é a única fonte versionada; docs/pending-migrations não existe mais", () => {
    let removed = false;
    try {
      readFileSync(
        resolve(
          process.cwd(),
          "docs/pending-migrations/20260811064500_process_refund_increment_atomic.sql",
        ),
      );
    } catch {
      removed = true;
    }
    expect(removed).toBe(true);
  });

  it("timestamp canônico posterior ao último commit aplicado (20260811070000)", () => {
    const ts = MIGRATION_PATH.match(/(\d{14})/)?.[1];
    expect(ts).toBeDefined();
    expect(Number(ts)).toBeGreaterThan(20260811070000);
  });

  it("aborta em duplicados pré-existentes de (order_id, gateway_refund_id)", () => {
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("nao escolhe um registro");
  });

  it("assertions de unidade: refunds/payments numeric, ledger/split integer", () => {
    expect(migration).toContain("refunds.amount deveria ser numeric (REAIS)");
    expect(migration).toContain("payments.amount deveria ser numeric (REAIS)");
    expect(migration).toContain("wallet_ledger.amount deveria ser integer (CENTAVOS)");
    expect(migration).toContain("split_entries.creator_net deveria ser integer (CENTAVOS)");
  });

  it("exige o índice parcial que o UPSERT do ledger infere", () => {
    expect(migration).toContain("indice ux_wallet_ledger_order_type ausente");
    expect(migration).toContain("ON CONFLICT (order_id, type) WHERE order_id IS NOT NULL");
  });

  it("converte explicitamente entre reais e centavos nas duas direções", () => {
    expect(migration).toContain("p_amount_cents::numeric / 100"); // grava refunds em reais
    expect(migration).toContain("round(amount * 100)"); // lê refunds em centavos
    expect(migration).toContain("round(v_payment.amount * 100)::int"); // teto do banco
  });
});

describe("FI-REFUND-V2 / migration — estágio espelhado e fechamento", () => {
  it("o débito herda status e available_at da linha de venda", () => {
    expect(migration).toContain(
      "CASE WHEN v_sale.status = 'pending' THEN 'pending' ELSE 'available' END",
    );
    expect(migration).toContain("v_ledger_available_at := v_sale.available_at");
  });

  it("no total, sale E refund são cancelados juntos (líquido 0, sem resíduo)", () => {
    expect(migration).toContain(
      "UPDATE public.wallet_ledger SET status = 'canceled'\n    WHERE order_id = p_order_id AND type IN ('sale', 'refund')",
    );
  });

  it("venda já cancelada no ledger falha fechado em vez de dobrar a perda", () => {
    expect(migration).toContain("ja cancelada no ledger; reembolso exige reconciliacao");
  });

  it("não alega reverter a taxa do gateway: declara onde o registro real fica", () => {
    expect(migration).toContain("'recorded_in'");
    expect(migration).toContain("split_entries.columns_reduced");
    expect(migration).toContain("split_entries.status=refunded");
    expect(migration).toContain("none:no_split_entry");
    // A linha wallet_ledger type='fee' é deliberadamente intocada.
    expect(migration).toContain("nao a devolve");
  });

  it("documenta a atomicidade POR INCREMENTO (não por payload)", () => {
    expect(migration).toContain("atomicidade POR INCREMENTO");
  });

  it("registra a ordem de rollout migration → deploy", () => {
    expect(migration).toContain("migration ANTES do deploy do webhook-asaas");
  });
});

// ═══ 2. Simulador da semântica da RPC ═══════════════════════════════════════

type LedgerRow = {
  type: "sale" | "refund" | "fee";
  amount: number; // centavos, assinado
  status: "pending" | "available" | "settled" | "canceled";
  available_at: string | null;
};
type Split = {
  gross_amount: number;
  gateway_fee: number;
  platform_fee: number;
  affiliate_fee: number;
  creator_net: number;
  status: string;
};
type World = {
  chargeCents: number;
  refunds: { id: string; cents: number }[];
  ledger: LedgerRow[];
  split: Split | null;
  commissionStatus?: "PENDING" | "PAID";
  commissionAmount?: number; // reais
  reserveHeld?: number; // centavos
  orderStatus: string;
  entitlementRevoked: boolean;
};

/** Espelha public.get_wallet_balance. 'canceled' é excluído de tudo. */
function balance(w: World) {
  const sum = (f: (r: LedgerRow) => boolean) =>
    w.ledger.filter(f).reduce((s, r) => s + r.amount, 0);
  const available = sum((r) => r.status === "available" || r.status === "settled");
  const pending = sum((r) => r.status === "pending");
  return { available, pending, total: available + pending };
}

/** Espelha o job release-holds: pending vencido → available, SEM filtrar type. */
function releaseHolds(w: World) {
  for (const r of w.ledger) if (r.status === "pending") r.status = "available";
}

/** Espelha public.process_refund_increment. Lança = transação abortada. */
function rpc(w: World, id: string, cents: number): Record<string, unknown> {
  if (!id || cents <= 0) throw new Error("22023");
  const snapshot = structuredClone(w);
  try {
    if (w.refunds.some((r) => r.id === id)) {
      const acc = w.refunds.reduce((s, r) => s + r.cents, 0);
      return {
        outcome: "duplicate",
        refund_total: acc >= w.chargeCents - 1,
        accumulated_cents: acc,
      };
    }
    w.refunds.push({ id, cents });
    const acc = w.refunds.reduce((s, r) => s + r.cents, 0);
    if (acc > w.chargeCents + 1) throw new Error("23514 over-refund");

    const prev = acc - cents;
    const isTotal = acc >= w.chargeCents - 1;

    let crRemaining = 0;
    const rev = { gateway: 0, platform: 0, affiliate: 0, creator: 0, recorded_in: "none:no_split_entry" };

    if (w.split) {
      // Delta sobre o REMANESCENTE (espelha a RPC): recalcular um "cumulativo"
      // sobre colunas já reduzidas por parciais anteriores produz drift.
      const remCharge = Math.max(w.chargeCents - prev, 1);
      const d = (cur: number) =>
        isTotal ? Math.max(cur, 0) : Math.max(Math.min(Math.round((cur * cents) / remCharge), cur), 0);
      rev.gateway = d(w.split.gateway_fee);
      rev.platform = d(w.split.platform_fee);
      rev.affiliate = d(w.split.affiliate_fee);
      rev.creator = d(w.split.creator_net);
      crRemaining = isTotal ? 0 : Math.max(w.split.creator_net - rev.creator, 0);

      if (rev.affiliate > 0 && w.commissionStatus === "PAID") {
        throw new Error("55000 comissao paga");
      }

      if (isTotal) {
        w.split.status = "refunded";
        rev.recorded_in = "split_entries.status=refunded";
      } else {
        w.split.gross_amount = Math.max(w.split.gross_amount - cents, 0);
        w.split.gateway_fee = Math.max(w.split.gateway_fee - rev.gateway, 0);
        w.split.platform_fee = Math.max(w.split.platform_fee - rev.platform, 0);
        w.split.affiliate_fee = Math.max(w.split.affiliate_fee - rev.affiliate, 0);
        w.split.creator_net = Math.max(w.split.creator_net - rev.creator, 0);
        rev.recorded_in = "split_entries.columns_reduced";
      }

      if (rev.affiliate > 0 && w.commissionStatus !== "PAID" && w.commissionAmount != null) {
        w.commissionAmount = Math.max(w.commissionAmount - rev.affiliate / 100, 0);
      }
    }
    const hasSplit = w.split !== null;

    const sale = w.ledger.find((r) => r.type === "sale");
    let creatorDebit = 0;
    let ledgerStatus: string | null = null;

    if (sale) {
      if (sale.status === "canceled") throw new Error("55000 venda cancelada");
      creatorDebit = hasSplit
        ? Math.max(Math.min(sale.amount - crRemaining, sale.amount), 0)
        : Math.min(acc, sale.amount);
      ledgerStatus = isTotal
        ? "canceled"
        : sale.status === "pending"
          ? "pending"
          : "available";

      if (creatorDebit > 0) {
        const row = w.ledger.find((r) => r.type === "refund");
        if (row) {
          row.amount = -creatorDebit; // UPSERT com o ACUMULADO
          row.status = ledgerStatus as LedgerRow["status"];
          row.available_at = sale.available_at;
        } else {
          w.ledger.push({
            type: "refund",
            amount: -creatorDebit,
            status: ledgerStatus as LedgerRow["status"],
            available_at: sale.available_at,
          });
        }
      }
      if (isTotal) {
        for (const r of w.ledger) if (r.type === "sale" || r.type === "refund") r.status = "canceled";
      }
    } else if (isTotal) {
      for (const r of w.ledger) if (r.type === "sale" || r.type === "refund") r.status = "canceled";
    }

    let forfeited = 0;
    if (isTotal) {
      forfeited = w.reserveHeld ?? 0;
      w.reserveHeld = 0;
      w.orderStatus = "REFUNDED";
      w.entitlementRevoked = true;
      if (w.commissionStatus !== "PAID") w.commissionStatus = undefined;
    }

    return {
      outcome: "applied",
      refund_total: isTotal,
      accumulated_cents: acc,
      creator_debit_cents: creatorDebit,
      ledger_status: ledgerStatus,
      split_reversal: rev,
      reserve_forfeited_cents: forfeited,
    };
  } catch (e) {
    // Rollback da transação: nenhuma escrita parcial sobrevive.
    Object.assign(w, snapshot);
    throw e;
  }
}

/** Venda de 100,00 com split 100% produtor (isola o efeito de saldo). */
function world(saleStatus: LedgerRow["status"] = "available", chargeCents = 10000): World {
  return {
    chargeCents,
    refunds: [],
    ledger: [
      { type: "sale", amount: chargeCents, status: saleStatus, available_at: "2026-08-01T00:00:00Z" },
    ],
    split: {
      gross_amount: chargeCents,
      gateway_fee: 0,
      platform_fee: 0,
      affiliate_fee: 0,
      creator_net: chargeCents,
      status: "pending",
    },
    orderStatus: "COMPLETED",
    entitlementRevoked: false,
  };
}

describe("FI-REFUND-V2 / saldos — cenários obrigatórios", () => {
  it("venda available 100 → parcial 30 → total 70 = 0 (sem -30 residual)", () => {
    const w = world("available");
    const r1 = rpc(w, "ref_1", 3000);
    expect(r1.refund_total).toBe(false);
    expect(balance(w)).toEqual({ available: 7000, pending: 0, total: 7000 });

    const r2 = rpc(w, "ref_2", 7000);
    expect(r2.refund_total).toBe(true);
    // O defeito antigo deixava -3000 aqui: hoje sale e refund são cancelados juntos.
    expect(balance(w)).toEqual({ available: 0, pending: 0, total: 0 });
    expect(w.ledger.every((r) => r.status === "canceled")).toBe(true);
  });

  it("venda pending/held 100 → parcial 30 antes da liberação → libera 70, nunca available negativo", () => {
    const w = world("pending");
    const r = rpc(w, "ref_1", 3000);
    expect(r.ledger_status).toBe("pending"); // estágio espelhado
    expect(balance(w)).toEqual({ available: 0, pending: 7000, total: 7000 });

    releaseHolds(w); // crédito e reversão saem juntos
    expect(balance(w)).toEqual({ available: 7000, pending: 0, total: 7000 });
    expect(balance(w).available).toBeGreaterThanOrEqual(0);
  });

  it("nunca cria débito available sobre crédito retido (invariante geral)", () => {
    for (const st of ["pending", "available", "settled"] as const) {
      const w = world(st);
      rpc(w, "r", 4000);
      const b = balance(w);
      expect(b.available).toBeGreaterThanOrEqual(0);
      expect(b.total).toBe(6000);
    }
  });

  it("dois parciais cumulativos e replay de cada um", () => {
    const w = world("available");
    rpc(w, "ref_1", 2500);
    rpc(w, "ref_2", 2500);
    expect(balance(w).total).toBe(5000);
    // Uma única linha de refund, com o acumulado (constraint UNIQUE order+type).
    const refundRows = w.ledger.filter((r) => r.type === "refund");
    expect(refundRows).toHaveLength(1);
    expect(refundRows[0].amount).toBe(-5000);

    expect((rpc(w, "ref_1", 2500) as any).outcome).toBe("duplicate");
    expect((rpc(w, "ref_2", 2500) as any).outcome).toBe("duplicate");
    expect(balance(w).total).toBe(5000); // replay não move saldo
  });

  it("total direto em um único evento zera saldo e fecha o pedido", () => {
    const w = world("available");
    const r = rpc(w, "ref_full", 10000);
    expect(r.refund_total).toBe(true);
    expect(balance(w)).toEqual({ available: 0, pending: 0, total: 0 });
    expect(w.orderStatus).toBe("REFUNDED");
    expect(w.entitlementRevoked).toBe(true);
  });

  it("parcial preserva acesso; só o total revoga entitlement", () => {
    const w = world("available");
    rpc(w, "ref_1", 3000);
    expect(w.entitlementRevoked).toBe(false);
    expect(w.orderStatus).toBe("COMPLETED");
    rpc(w, "ref_2", 7000);
    expect(w.entitlementRevoked).toBe(true);
  });

  it("comissão pendente é reduzida proporcionalmente", () => {
    const w = world("available");
    w.split = {
      gross_amount: 10000,
      gateway_fee: 300,
      platform_fee: 700,
      affiliate_fee: 2000,
      creator_net: 7000,
      status: "pending",
    };
    w.ledger[0].amount = 7000; // sale = creator_net
    w.commissionStatus = "PENDING";
    w.commissionAmount = 20; // R$ 20,00

    const r = rpc(w, "ref_1", 5000) as any;
    expect(r.split_reversal).toMatchObject({ gateway: 150, platform: 350, affiliate: 1000, creator: 3500 });
    expect(w.commissionAmount).toBeCloseTo(10, 2);
    expect(w.split!.affiliate_fee).toBe(1000);
    expect(w.split!.creator_net).toBe(3500);
    // Débito do produtor = fatia dele, não a cobrança inteira.
    expect(r.creator_debit_cents).toBe(3500);
    expect(balance(w).total).toBe(3500);
  });

  it("comissão PAID falha fechado, sem qualquer escrita", () => {
    const w = world("available");
    w.split = {
      gross_amount: 10000,
      gateway_fee: 0,
      platform_fee: 0,
      affiliate_fee: 2000,
      creator_net: 8000,
      status: "pending",
    };
    w.ledger[0].amount = 8000;
    w.commissionStatus = "PAID";
    w.commissionAmount = 20;
    const before = structuredClone(w);

    expect(() => rpc(w, "ref_1", 5000)).toThrow(/55000/);
    expect(w).toEqual(before); // nada persistiu: nem auditoria
    expect(w.refunds).toHaveLength(0);
  });

  it("reserva é confiscada só no fechamento total", () => {
    const w = world("available");
    w.reserveHeld = 1000;
    expect((rpc(w, "ref_1", 3000) as any).reserve_forfeited_cents).toBe(0);
    expect(w.reserveHeld).toBe(1000);
    expect((rpc(w, "ref_2", 7000) as any).reserve_forfeited_cents).toBe(1000);
    expect(w.reserveHeld).toBe(0);
  });

  it("split ausente: sem reversão fictícia, mas caixa e fechamento coerentes", () => {
    const w = world("available");
    w.split = null;
    const r = rpc(w, "ref_1", 3000) as any;
    expect(r.split_reversal.recorded_in).toBe("none:no_split_entry");
    expect(balance(w).total).toBe(7000);
    rpc(w, "ref_2", 7000);
    expect(balance(w)).toEqual({ available: 0, pending: 0, total: 0 });
  });

  it("venda já cancelada (chargeback) falha fechado sem dobrar a perda", () => {
    const w = world("canceled");
    const before = structuredClone(w);
    expect(() => rpc(w, "ref_1", 3000)).toThrow(/55000/);
    expect(w).toEqual(before);
  });

  it("over-refund é rejeitado e a auditoria não persiste", () => {
    const w = world("available");
    rpc(w, "ref_1", 9000);
    expect(() => rpc(w, "ref_2", 5000)).toThrow(/23514/);
    expect(w.refunds.map((r) => r.id)).toEqual(["ref_1"]);
    expect(balance(w).total).toBe(1000);
  });

  it("falha no 2º incremento deixa o 1º íntegro e o retry conclui só o 2º", () => {
    const w = world("available");
    rpc(w, "ref_1", 3000);
    expect(balance(w).total).toBe(7000);

    // 2º incremento falha (simula erro de escrita): transação própria.
    const boom = () => {
      const saved = w.commissionStatus;
      w.split!.affiliate_fee = 1000;
      w.commissionStatus = "PAID";
      try {
        rpc(w, "ref_2", 2000);
      } finally {
        w.commissionStatus = saved;
        w.split!.affiliate_fee = 0;
      }
    };
    expect(boom).toThrow(/55000/);
    expect(w.refunds.map((r) => r.id)).toEqual(["ref_1"]); // 1º intacto
    expect(balance(w).total).toBe(7000);

    // Retry do webhook: 1º é duplicate, 2º conclui.
    expect((rpc(w, "ref_1", 3000) as any).outcome).toBe("duplicate");
    expect((rpc(w, "ref_2", 2000) as any).outcome).toBe("applied");
    expect(balance(w).total).toBe(5000);
  });

  it("soma final fecha centavo a centavo com valores não redondos", () => {
    const w = world("available", 19990); // R$ 199,90
    rpc(w, "a", 6663);
    rpc(w, "b", 6663);
    expect(balance(w).total).toBe(19990 - 13326);
    const r = rpc(w, "c", 6664) as any;
    expect(r.refund_total).toBe(true);
    expect(r.accumulated_cents).toBe(19990);
    expect(balance(w)).toEqual({ available: 0, pending: 0, total: 0 });
  });

  it("tolerância de 1 centavo classifica total sem permitir over-refund real", () => {
    const w = world("available", 10000);
    const r = rpc(w, "ref_1", 9999) as any;
    expect(r.refund_total).toBe(true);
    expect(balance(w)).toEqual({ available: 0, pending: 0, total: 0 });
  });
});
