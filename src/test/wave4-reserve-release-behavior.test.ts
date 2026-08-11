import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Onda 4 / bloco QA-4A-V3 — comportamento da liberação de reserva de segurança
 * e da resolução de chargeback.
 *
 * Testes de regex provam apenas a forma do SQL. Aqui modelamos a semântica das
 * RPCs `release_security_reserve` e `resolve_chargeback_case` e a leitura de
 * saldo centavo a centavo, para provar que:
 *   - sem PROVA ESTRUTURADA de segregação a liberação não credita nada;
 *   - a liberação nunca antecipa liquidez (crédito herda o estágio do débito);
 *   - refund/chargeback antes da liberação não devolvem a reserva;
 *   - replay e dois workers concorrentes não duplicam crédito;
 *   - chargeback perdido → ganho converge ao saldo original UMA vez.
 *
 * O que só o banco real prova (advisory/row lock efetivo, atomicidade do
 * commit, índices únicos sob concorrência real) está marcado como NEEDS_E2E no
 * checklist §31.
 */

const MIGRATION = "supabase/migrations/20260811090000_wave4_wallet_payout_hardening.sql";
const read = (p: string) => readFileSync(p, "utf-8");

// ─── Modelo mínimo do ledger (espelha _shared/wallet-balance.ts) ───
type Status = "pending" | "available" | "settled" | "canceled";
type LedgerType = "sale" | "fee" | "refund" | "withdrawal" | "adjustment" | "chargeback";
const DEBIT_TYPES: LedgerType[] = ["withdrawal", "fee", "refund", "chargeback"];

interface Entry {
  id: string;
  type: LedgerType;
  amount: number; // débitos: valor absoluto (trigger normaliza); adjustment mantém sinal
  status: Status;
  available_at: number | null;
  order_id?: string | null;
  workspace_id?: string;
  currency?: string;
  security_reserve_id?: string;
  reserve_role?: "segregation_debit" | "release_credit";
}

const signed = (e: Entry) => (DEBIT_TYPES.includes(e.type) ? -Math.abs(e.amount) : e.amount);

function balance(entries: Entry[], now = 0) {
  let available = 0;
  let pending = 0;
  for (const e of entries) {
    if (e.status === "canceled" || e.status === "settled") continue;
    const v = signed(e);
    const matured =
      e.status === "available" || (e.status === "pending" && e.available_at !== null && e.available_at <= now);
    if (matured) available += v;
    else pending += v;
  }
  return { available, pending, total: available + pending };
}

// ─── Modelo da RPC release_security_reserve ───
interface Reserve {
  id: string;
  workspace_id: string;
  amount: number;
  status: "held" | "released" | "forfeited";
  release_at: number;
  ledger_debit_id: string | null;
  order_id?: string | null;
  order_status?: string;
  active_chargeback?: boolean;
}

interface World {
  ledger: Entry[];
  reserve: Reserve;
}

const WS = "ws-1";

function releaseReserve(w: World, now: number, opts: { failCredit?: boolean } = {}) {
  const r = w.reserve;
  // Row lock: quem não consegue o lock espera; modelado como execução serial.
  if (r.status !== "held") return { outcome: "ALREADY_PROCESSED" as const };
  if (r.release_at > now) return { outcome: "NOT_DUE" as const };
  if (r.active_chargeback) {
    r.release_at = now + 30 * 86400_000;
    return { outcome: "HELD_CHARGEBACK" as const };
  }
  if (r.order_status && ["REFUNDED", "CANCELED", "CHARGEBACK"].includes(r.order_status)) {
    r.status = "forfeited";
    return { outcome: "FORFEITED" as const };
  }
  if (!r.ledger_debit_id) return { outcome: "NEEDS_PRODUCT_DECISION" as const };

  const d = w.ledger.find((e) => e.id === r.ledger_debit_id);
  // Prova estruturada: mesma reserva, papel de débito de segregação, mesmo
  // workspace, valor exato, moeda BRL, pedido compatível, não cancelado.
  const proven =
    !!d &&
    d.workspace_id === r.workspace_id &&
    d.security_reserve_id === r.id &&
    d.reserve_role === "segregation_debit" &&
    d.status !== "canceled" &&
    d.status !== "settled" &&
    (d.type === "fee" || (d.type === "adjustment" && d.amount < 0)) &&
    Math.abs(d.amount) === r.amount &&
    (d.currency ?? "BRL") === "BRL" &&
    (!r.order_id || !d.order_id || d.order_id === r.order_id);
  if (!proven || !d) return { outcome: "NEEDS_PRODUCT_DECISION" as const };

  // Sem antecipação de liquidez: crédito herda o estágio econômico do débito.
  let creditStatus: Status;
  let creditAvailableAt: number;
  const matured = d.status === "available" || (d.status === "pending" && d.available_at !== null && d.available_at <= now);
  if (matured) {
    creditStatus = "available";
    creditAvailableAt = now;
  } else if (d.status === "pending" && d.available_at !== null) {
    creditStatus = "pending";
    creditAvailableAt = d.available_at;
  } else {
    return { outcome: "ORIGIN_NOT_LIQUID" as const };
  }

  const already = w.ledger.some(
    (e) => e.security_reserve_id === r.id && e.reserve_role === "release_credit" && e.status !== "canceled",
  );
  if (already) {
    r.status = "released";
    return { outcome: "RELEASED" as const, credit_replayed: true, credit_status: creditStatus };
  }
  // Mesma transação: se o crédito falha, NADA é aplicado (rollback).
  if (opts.failCredit) return { outcome: "ERROR" as const };
  w.ledger.push({
    id: `credit_${r.id}`,
    type: "adjustment",
    amount: r.amount,
    status: creditStatus,
    available_at: creditAvailableAt,
    order_id: null, // ux_wallet_ledger_order_type UNIQUE (order_id, type)
    workspace_id: r.workspace_id,
    currency: "BRL",
    security_reserve_id: r.id,
    reserve_role: "release_credit",
  });
  r.status = "released";
  return { outcome: "RELEASED" as const, credit_replayed: false, credit_status: creditStatus };
}

// Venda de R$100 com reserva de 10% (centavos).
const SALE = 10_000;
const RESERVE = 1_000;

/** Segregação REAL e provável: débito 'fee' vinculado à reserva. */
function worldSegregatedProper(): World {
  return {
    ledger: [
      { id: "sale", type: "sale", amount: SALE, status: "available", available_at: 0, workspace_id: WS, currency: "BRL", order_id: "o1" },
      {
        id: "resdebit", type: "fee", amount: RESERVE, status: "available", available_at: 0,
        workspace_id: WS, currency: "BRL", order_id: null,
        security_reserve_id: "r1", reserve_role: "segregation_debit",
      },
    ],
    reserve: { id: "r1", workspace_id: WS, amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: "resdebit", order_id: "o1" },
  };
}

/** Estado ATUAL de produção: settlement credita o líquido integral; reserva só visual. */
function worldShadowHold(): World {
  return {
    ledger: [{ id: "sale", type: "sale", amount: SALE, status: "available", available_at: 0, workspace_id: WS, currency: "BRL" }],
    reserve: { id: "r1", workspace_id: WS, amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: null },
  };
}

describe("QA-4A-V3 — prova estruturada de segregação (fail-closed)", () => {
  it("venda 100 / reserva 10 sem débito: NEEDS_PRODUCT_DECISION e mantém held", () => {
    const w = worldShadowHold();
    expect(balance(w.ledger, 20).available).toBe(SALE); // o 'retido' já está no disponível
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(w.reserve.status).toBe("held");
    expect(balance(w.ledger, 20).available).toBe(SALE); // nenhum centavo inventado
    expect(w.ledger.some((e) => e.security_reserve_id)).toBe(false);
  });

  it("linha do mesmo workspace SEM reserve_role não serve de prova", () => {
    const w = worldSegregatedProper();
    const debit = w.ledger.find((e) => e.id === "resdebit")!;
    delete debit.reserve_role;
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(w.reserve.status).toBe("held");
  });

  it("débito de OUTRA reserva não serve de prova", () => {
    const w = worldSegregatedProper();
    w.ledger.find((e) => e.id === "resdebit")!.security_reserve_id = "r2";
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(balance(w.ledger, 20).available).toBe(SALE - RESERVE);
  });

  it("valor divergente do amount da reserva é rejeitado", () => {
    const w = worldSegregatedProper();
    w.ledger.find((e) => e.id === "resdebit")!.amount = RESERVE - 1;
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(w.reserve.status).toBe("held");
  });

  it("moeda incompatível é rejeitada", () => {
    const w = worldSegregatedProper();
    w.ledger.find((e) => e.id === "resdebit")!.currency = "USD";
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
  });

  it("workspace diferente é rejeitado", () => {
    const w = worldSegregatedProper();
    w.ledger.find((e) => e.id === "resdebit")!.workspace_id = "ws-2";
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
  });

  it("pedido divergente entre reserva e débito é rejeitado", () => {
    const w = worldSegregatedProper();
    w.ledger.find((e) => e.id === "resdebit")!.order_id = "o2";
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
  });

  it("débito cancelado, settled ou crédito disfarçado são fail-closed", () => {
    for (const mutate of [
      (e: Entry) => (e.status = "canceled"),
      (e: Entry) => (e.status = "settled"),
      (e: Entry) => {
        e.type = "adjustment";
        e.amount = RESERVE; // positivo = crédito, não débito
      },
      (e: Entry) => (e.type = "sale"),
    ]) {
      const w = worldSegregatedProper();
      mutate(w.ledger.find((e) => e.id === "resdebit")!);
      expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
      expect(w.reserve.status).toBe("held");
    }
  });

  it("débito 'adjustment' negativo é prova válida", () => {
    const w = worldSegregatedProper();
    const d = w.ledger.find((e) => e.id === "resdebit")!;
    d.type = "adjustment";
    d.amount = -RESERVE;
    expect(balance(w.ledger, 20).available).toBe(SALE - RESERVE);
    expect(releaseReserve(w, 20).outcome).toBe("RELEASED");
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("o mesmo débito não pode provar duas reservas (índice único)", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_security_reserves_ledger_debit/);
  });
});

describe("QA-4A-V3 — saldo centavo a centavo com reserva segregada", () => {
  it("antes / durante / depois da liberação fecha em 100", () => {
    const w = worldSegregatedProper();
    expect(balance(w.ledger, 5).available).toBe(SALE - RESERVE);
    expect(releaseReserve(w, 5).outcome).toBe("NOT_DUE");
    expect(balance(w.ledger, 5).available).toBe(SALE - RESERVE);

    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("RELEASED");
    expect(w.reserve.status).toBe("released");
    const after = balance(w.ledger, 20);
    expect(after.available).toBe(SALE);
    expect(after.pending).toBe(0);
    expect(after.total).toBe(SALE);
  });

  it("NÃO antecipa liquidez: origem em hold gera crédito pending com o mesmo vencimento", () => {
    const w: World = {
      ledger: [
        { id: "sale", type: "sale", amount: SALE, status: "pending", available_at: 30, workspace_id: WS, currency: "BRL", order_id: "o1" },
        {
          id: "resdebit", type: "fee", amount: RESERVE, status: "pending", available_at: 30,
          workspace_id: WS, currency: "BRL", order_id: null,
          security_reserve_id: "r1", reserve_role: "segregation_debit",
        },
      ],
      reserve: { id: "r1", workspace_id: WS, amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: "resdebit", order_id: "o1" },
    };
    const before = balance(w.ledger, 20);
    expect(before.available).toBe(0);
    expect(before.pending).toBe(SALE - RESERVE);

    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("RELEASED");
    expect(out.credit_status).toBe("pending");

    // t=20: nada virou disponível — a origem só é líquida em t=30.
    const at20 = balance(w.ledger, 20);
    expect(at20.available).toBe(0);
    expect(at20.pending).toBe(SALE);
    expect(at20.total).toBe(SALE);

    // t=30: venda e crédito vencem juntos.
    const at30 = balance(w.ledger, 30);
    expect(at30.available).toBe(SALE);
    expect(at30.pending).toBe(0);
  });

  it("origem pending sem available_at segue retida (ORIGIN_NOT_LIQUID)", () => {
    const w = worldSegregatedProper();
    const d = w.ledger.find((e) => e.id === "resdebit")!;
    d.status = "pending";
    d.available_at = null;
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("ORIGIN_NOT_LIQUID");
    expect(w.reserve.status).toBe("held");
    expect(w.ledger.some((e) => e.reserve_role === "release_credit")).toBe(false);
  });

  it("origem pending já vencida credita disponível de imediato", () => {
    const w = worldSegregatedProper();
    const d = w.ledger.find((e) => e.id === "resdebit")!;
    d.status = "pending";
    d.available_at = 15;
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("RELEASED");
    expect(out.credit_status).toBe("available");
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });
});

describe("QA-4A-V3 — refund e chargeback antes da liberação", () => {
  it("venda reembolsada não devolve a reserva (forfeited)", () => {
    const w = worldSegregatedProper();
    w.reserve.order_status = "REFUNDED";
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("FORFEITED");
    expect(w.reserve.status).toBe("forfeited");
    expect(w.ledger.some((e) => e.reserve_role === "release_credit")).toBe(false);
  });

  it("chargeback ativo prorroga a retenção por 30 dias e não credita", () => {
    const w = worldSegregatedProper();
    w.reserve.active_chargeback = true;
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("HELD_CHARGEBACK");
    expect(w.reserve.status).toBe("held");
    expect(w.reserve.release_at).toBeGreaterThan(20);
    expect(balance(w.ledger, 20).available).toBe(SALE - RESERVE);
  });
});

describe("QA-4A-V3 — replay, concorrência e falha de crédito", () => {
  it("replay do mesmo ciclo não duplica crédito", () => {
    const w = worldSegregatedProper();
    expect(releaseReserve(w, 20).outcome).toBe("RELEASED");
    expect(releaseReserve(w, 20).outcome).toBe("ALREADY_PROCESSED");
    expect(w.ledger.filter((e) => e.reserve_role === "release_credit")).toHaveLength(1);
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("dois workers concorrentes creditam uma única vez", () => {
    const w = worldSegregatedProper();
    const a = releaseReserve(w, 20);
    const b = releaseReserve(w, 20); // segundo worker após o lock ser liberado
    expect([a.outcome, b.outcome]).toEqual(["RELEASED", "ALREADY_PROCESSED"]);
    expect(w.ledger.filter((e) => e.reserve_role === "release_credit")).toHaveLength(1);
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("falha no crédito não deixa reserva liberada sem dinheiro", () => {
    const w = worldSegregatedProper();
    const out = releaseReserve(w, 20, { failCredit: true });
    expect(out.outcome).toBe("ERROR");
    expect(w.reserve.status).toBe("held"); // rollback: nada aplicado
    expect(w.ledger.some((e) => e.reserve_role === "release_credit")).toBe(false);
    expect(releaseReserve(w, 21).outcome).toBe("RELEASED");
    expect(balance(w.ledger, 21).available).toBe(SALE);
  });
});

// ─── Modelo do ciclo de chargeback (espelha webhook-asaas + resolve_chargeback_case) ───
interface CbWorld {
  ledger: Entry[];
  case: { id: string; order_id: string; status: string };
  refundProcessed?: boolean;
}

function cbWorld(saleStatus: Status = "available", saleAvailableAt: number | null = 0): CbWorld {
  return {
    ledger: [
      { id: "sale", type: "sale", amount: SALE, status: saleStatus, available_at: saleAvailableAt, workspace_id: WS, currency: "BRL", order_id: "o1" },
    ],
    case: { id: "c1", order_id: "o1", status: "new" },
  };
}

/** webhook-asaas handleChargeback passo 6: cancela a venda e grava o débito 'settled'. */
function openChargeback(w: CbWorld) {
  for (const e of w.ledger) if (e.order_id === "o1" && e.type === "sale") e.status = "canceled";
  if (!w.ledger.some((e) => e.type === "chargeback" && e.order_id === "o1")) {
    w.ledger.push({
      id: "cb", type: "chargeback", amount: SALE, status: "settled", available_at: null,
      workspace_id: WS, currency: "BRL", order_id: "o1",
    });
  }
}

function resolveChargeback(w: CbWorld, status: "won" | "lost", now = 0) {
  if (["won", "lost"].includes(w.case.status)) return { outcome: "ALREADY_RESOLVED" as const };
  if (w.case.status === status) return { outcome: "NO_CHANGE" as const };
  w.case.status = status;
  if (status !== "won") return { outcome: "UPDATED" as const };
  if (w.refundProcessed) return { outcome: "UPDATED" as const, skipped: true };

  let canceledDebit = 0;
  let restoredSale = 0;
  for (const e of w.ledger) {
    if (e.order_id === "o1" && e.type === "chargeback" && e.status !== "canceled") {
      e.status = "canceled";
      canceledDebit++;
    }
  }
  for (const e of w.ledger) {
    if (e.order_id === "o1" && e.type === "sale" && e.status === "canceled") {
      // Estágio original preservado: available_at nunca é reescrito.
      e.status = e.available_at === null ? "available" : "pending";
      restoredSale++;
    }
  }
  return { outcome: "UPDATED" as const, restoredSale, canceledDebit, now };
}

describe("QA-4A-V3 — equação do chargeback: perda → vitória converge uma vez", () => {
  it("venda 100 available: aberto/perdido = 0, ganho = 100 (nunca 200)", () => {
    const w = cbWorld();
    expect(balance(w.ledger, 20).available).toBe(SALE);

    openChargeback(w);
    // sale canceled (-100) + chargeback settled (0) = 0
    expect(balance(w.ledger, 20).available).toBe(0);
    expect(balance(w.ledger, 20).total).toBe(0);

    resolveChargeback(w, "lost");
    expect(balance(w.ledger, 20).available).toBe(0);

    const w2 = cbWorld();
    openChargeback(w2);
    const out = resolveChargeback(w2, "won");
    expect(out.outcome).toBe("UPDATED");
    const after = balance(w2.ledger, 20);
    expect(after.available).toBe(SALE); // exatamente uma devolução
    expect(after.total).toBe(SALE);
    expect(after.available).not.toBe(SALE * 2);
  });

  it("vitória NÃO antecipa liquidez de venda ainda em hold", () => {
    const w = cbWorld("pending", 30);
    openChargeback(w);
    resolveChargeback(w, "won", 20);
    const at20 = balance(w.ledger, 20);
    expect(at20.available).toBe(0);
    expect(at20.pending).toBe(SALE);
    expect(balance(w.ledger, 30).available).toBe(SALE);
  });

  it("replay da vitória não devolve duas vezes", () => {
    const w = cbWorld();
    openChargeback(w);
    resolveChargeback(w, "won");
    expect(resolveChargeback(w, "won").outcome).toBe("ALREADY_RESOLVED");
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("dois admins concorrentes: só o primeiro aplica o financeiro", () => {
    const w = cbWorld();
    openChargeback(w);
    const a = resolveChargeback(w, "won");
    const b = resolveChargeback(w, "won");
    expect([a.outcome, b.outcome]).toEqual(["UPDATED", "ALREADY_RESOLVED"]);
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("caso já perdido não reabre para ganho (financeiro congelado)", () => {
    const w = cbWorld();
    openChargeback(w);
    resolveChargeback(w, "lost");
    expect(resolveChargeback(w, "won").outcome).toBe("ALREADY_RESOLVED");
    expect(balance(w.ledger, 20).available).toBe(0);
  });

  it("pedido com reembolso processado: vitória não restaura a venda", () => {
    const w = cbWorld();
    openChargeback(w);
    w.refundProcessed = true;
    const out = resolveChargeback(w, "won");
    expect(out.skipped).toBe(true);
    expect(balance(w.ledger, 20).available).toBe(0);
  });

  it("chargeback aberto duas vezes não duplica o débito", () => {
    const w = cbWorld();
    openChargeback(w);
    openChargeback(w);
    expect(w.ledger.filter((e) => e.type === "chargeback")).toHaveLength(1);
    expect(balance(w.ledger, 20).available).toBe(0);
  });
});

describe("QA-4A-V3 — contrato da RPC e da Edge Function", () => {
  const sql = read(MIGRATION);
  const ef = read("supabase/functions/release-reserves/index.ts");
  const rpc = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.release_security_reserve"));

  it("trava a reserva FOR UPDATE antes de decidir", () => {
    expect(rpc).toMatch(/FROM public\.security_reserves\s*\n\s*WHERE id = p_reserve_id FOR UPDATE/);
  });

  it("trava também o débito de segregação antes de validar", () => {
    expect(rpc).toMatch(/WHERE id = v_res\.ledger_debit_id FOR UPDATE/);
  });

  it("credita e transiciona na mesma função, com chave estruturada por papel", () => {
    expect(rpc).toMatch(/INSERT INTO public\.wallet_ledger[\s\S]{0,500}security_reserve_id, reserve_role/);
    expect(rpc).toMatch(/UPDATE public\.security_reserves[\s\S]{0,120}status = 'released'/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_reserve_release/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_reserve_segregation/);
    expect(sql).toMatch(/wallet_ledger_reserve_role_check[\s\S]{0,300}'segregation_debit', 'release_credit'/);
  });

  it("o crédito não grava order_id (ux_wallet_ledger_order_type UNIQUE (order_id, type))", () => {
    expect(sql).toMatch(/ux_wallet_ledger_order_type/);
    expect(rpc).toMatch(/v_res\.workspace_id, NULL, 'adjustment'/);
    expect(rpc).not.toMatch(/\n\s*ON CONFLICT DO NOTHING;/);
  });

  it("é fail-closed quando não há débito de segregação", () => {
    expect(rpc).toMatch(/ledger_debit_id IS NULL[\s\S]{0,200}NEEDS_PRODUCT_DECISION/);
    expect(rpc).toMatch(/reserve_role IS DISTINCT FROM 'segregation_debit'/);
    expect(rpc).toMatch(/abs\(v_debit\.amount\) <> v_res\.amount/);
    expect(rpc).toMatch(/v_debit\.currency IS DISTINCT FROM 'BRL'/);
  });

  it("não antecipa liquidez: herda estágio do débito", () => {
    expect(rpc).toMatch(/v_credit_status := 'pending'/);
    expect(rpc).toMatch(/v_credit_available_at := v_debit\.available_at/);
    expect(rpc).toContain("ORIGIN_NOT_LIQUID");
  });

  it("expõe outcomes discriminados", () => {
    for (const o of ["NOT_FOUND", "ALREADY_PROCESSED", "NOT_DUE", "HELD_CHARGEBACK", "FORFEITED", "RELEASED", "ORIGIN_NOT_LIQUID"]) {
      expect(rpc).toContain(o);
    }
  });

  it("é SECURITY DEFINER com search_path fixo e só service_role executa", () => {
    expect(rpc).toMatch(/SECURITY DEFINER/);
    expect(rpc).toMatch(/SET search_path TO 'public'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.release_security_reserve\(uuid\) FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.release_security_reserve\(uuid\) TO service_role/);
  });

  it("a Edge Function apenas chama a RPC — nada de update+insert sequencial", () => {
    expect(ef).toMatch(/rpc\("release_security_reserve"/);
    expect(ef).not.toMatch(/from\("security_reserves"\)[\s\S]{0,80}\.update\(/);
    expect(ef).not.toMatch(/from\("wallet_ledger"\)[\s\S]{0,80}\.insert\(/);
  });

  it("preflight fail-closed antes dos índices únicos novos", () => {
    expect(sql).toMatch(/PREFLIGHT: % reserva\(s\) com crédito duplicado/);
    expect(sql).toMatch(/PREFLIGHT: % debito\(s\) de segregacao reutilizado/);
    expect(sql).toMatch(/PREFLIGHT: % saque\(s\) com débito duplicado ativo/);
  });
});

describe("QA-4A-V3 — contrato de resolve_chargeback_case", () => {
  const sql = read(MIGRATION);
  const rpc = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.resolve_chargeback_case"));

  it("restaura a venda preservando o estágio, sem reescrever available_at", () => {
    expect(rpc).toMatch(/SET status = CASE WHEN available_at IS NULL THEN 'available' ELSE 'pending' END/);
    expect(rpc).not.toMatch(/SET status = 'available', available_at = now\(\)\s*\n\s*WHERE order_id = v_case\.order_id AND type = 'sale'/);
  });

  it("não restaura venda de pedido com reembolso processado", () => {
    expect(rpc).toMatch(/FROM public\.refunds r[\s\S]{0,120}status = 'PROCESSED'/);
    expect(rpc).toMatch(/financial_reversal_skipped/);
  });

  it("é idempotente por estado e travado por advisory lock", () => {
    expect(rpc).toMatch(/pg_advisory_xact_lock\(hashtextextended\('chargeback:'/);
    expect(rpc).toMatch(/ALREADY_RESOLVED/);
    expect(rpc).toMatch(/WHERE id = p_case_id FOR UPDATE/);
  });

  it("documenta a equação real do webhook (settled não soma)", () => {
    expect(rpc).toMatch(/type='chargeback'\s*→ status 'settled'/);
  });

  it("SECURITY DEFINER com search_path fixo, sem execução por anon", () => {
    expect(rpc).toMatch(/SECURITY DEFINER[\s\S]{0,80}SET search_path TO 'public'/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.resolve_chargeback_case\(uuid, text, text\) FROM PUBLIC, anon/);
  });
});

describe("QA-4A-V3 — saques: aritmética, solicitante e reaprovação", () => {
  const sql = read(MIGRATION);
  const create = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.create_payout_request_atomic"),
    sql.indexOf("CREATE OR REPLACE FUNCTION public.review_payout_request"),
  );
  const review = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.review_payout_request"),
    sql.indexOf("-- 7."),
  );

  it("valida p_fee >= 0 e amount = fee + net", () => {
    expect(create).toMatch(/p_fee IS NULL OR p_fee < 0[\s\S]{0,120}INVALID_FEE/);
    expect(create).toMatch(/p_amount <> p_fee \+ p_net_amount[\s\S]{0,120}AMOUNT_MISMATCH/);
  });

  it("revalida o solicitante como OWNER/ADMIN do workspace", () => {
    expect(create).toMatch(/workspace_members[\s\S]{0,220}role IN \('OWNER', 'ADMIN'\)/);
    expect(create).toMatch(/REQUESTER_NOT_ALLOWED/);
  });

  it("a Edge Function deriva o solicitante do JWT, nunca do body", () => {
    const ef = read("supabase/functions/create-payout-request/index.ts");
    expect(ef).toMatch(/p_requested_by: userId/);
    expect(ef).not.toMatch(/body\.requested_by/);
  });

  it("aprovação usa o MESMO advisory lock da criação e revalida o saldo", () => {
    expect(review).toMatch(/pg_advisory_xact_lock\(hashtextextended\('payout:' \|\| v_req\.workspace_id/);
    expect(review).toMatch(/get_wallet_balance\(v_req\.workspace_id\)/);
    expect(review).toMatch(/INSUFFICIENT_BALANCE/);
  });

  it("aprovação e rejeição gravam audit_logs transacional", () => {
    expect(review).toMatch(/audit_logs[\s\S]{0,200}payout_request\.approved/);
    expect(review).toMatch(/audit_logs[\s\S]{0,200}payout_request\.rejected/);
  });

  it("o índice de idempotência ignora linhas canceladas (permite novo saque)", () => {
    expect(sql).toMatch(/uniq_wallet_ledger_withdrawal_payout_request[\s\S]{0,160}status <> 'canceled'/);
  });
});

describe("QA-4A-V3 — isolamento de leitura nas tabelas financeiras", () => {
  const sql = read(MIGRATION);

  it("payout_items deixa de ter policy FOR ALL para o role public", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Workspace owners can manage payout items" ON public\.payout_items/);
    expect(sql).toMatch(/CREATE POLICY payout_items_select_own_workspace ON public\.payout_items\s*\n\s*FOR SELECT TO authenticated/);
    expect(sql).toMatch(/ALTER TABLE public\.payout_items ENABLE ROW LEVEL SECURITY/);
  });

  it("nenhuma policy nova usa auth.role()", () => {
    expect(sql).not.toMatch(/auth\.role\(\)/);
  });

  it("escrita financeira segue exclusiva de service_role", () => {
    for (const t of ["refunds", "chargeback_cases", "payout_items", "withdrawals"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${t} FROM anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT SELECT ON TABLE public\\.${t} TO authenticated`));
    }
  });
});
