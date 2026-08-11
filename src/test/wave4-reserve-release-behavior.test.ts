import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Onda 4 / bloco QA-4A-V2 — comportamento da liberação de reserva de segurança.
 *
 * Testes de regex provam apenas a forma do SQL. Aqui modelamos a semântica da
 * RPC `release_security_reserve` e da leitura de saldo centavo a centavo, para
 * provar que:
 *   - sem débito de segregação na origem, a liberação NÃO credita nem libera;
 *   - com segregação, o saldo antes/durante/depois fecha exatamente;
 *   - refund/chargeback antes da liberação não devolvem a reserva;
 *   - replay e dois workers concorrentes não duplicam crédito;
 *   - falha do crédito não deixa reserva liberada sem dinheiro.
 *
 * O que só o banco real prova (advisory/row lock efetivo, atomicidade do
 * commit) está marcado como NEEDS_E2E no checklist §31.
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
  amount: number; // sempre positivo (trigger normaliza)
  status: Status;
  available_at: number | null;
  security_reserve_id?: string;
}

const signed = (e: Entry) => (DEBIT_TYPES.includes(e.type) ? -Math.abs(e.amount) : Math.abs(e.amount));

function balance(entries: Entry[], now = 0) {
  let available = 0;
  let pending = 0;
  for (const e of entries) {
    if (e.status === "canceled" || e.status === "settled") continue;
    const v = signed(e);
    const matured = e.status === "available" || (e.status === "pending" && e.available_at !== null && e.available_at <= now);
    if (matured) available += v;
    else pending += v;
  }
  return { available, pending, total: available + pending };
}

// ─── Modelo da RPC release_security_reserve ───
interface Reserve {
  id: string;
  amount: number;
  status: "held" | "released" | "forfeited";
  release_at: number;
  ledger_debit_id: string | null;
  order_status?: string;
  active_chargeback?: boolean;
}

interface World {
  ledger: Entry[];
  reserve: Reserve;
  locked?: boolean;
}

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
  const debit = w.ledger.find((e) => e.id === r.ledger_debit_id);
  if (!r.ledger_debit_id || !debit || debit.status === "canceled") {
    return { outcome: "NEEDS_PRODUCT_DECISION" as const };
  }
  const already = w.ledger.some((e) => e.security_reserve_id === r.id && e.status !== "canceled");
  if (already) {
    r.status = "released";
    return { outcome: "RELEASED" as const, credit_replayed: true };
  }
  // Mesma transação: se o crédito falha, NADA é aplicado (rollback).
  if (opts.failCredit) return { outcome: "ERROR" as const };
  w.ledger.push({
    id: `credit_${r.id}`,
    type: "adjustment",
    amount: r.amount,
    status: "available",
    available_at: now,
    security_reserve_id: r.id,
  });
  r.status = "released";
  return { outcome: "RELEASED" as const, credit_replayed: false };
}

// Venda de R$100 com reserva de 10% (centavos).
const SALE = 10_000;
const RESERVE = 1_000;

function worldSegregated(): World {
  return {
    ledger: [
      { id: "sale", type: "sale", amount: SALE, status: "available", available_at: 0 },
      { id: "resdebit", type: "adjustment", amount: RESERVE, status: "canceled", available_at: 0 }, // placeholder
    ],
    reserve: { id: "r1", amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: "resdebit" },
  };
}

// Segregação real: o débito de 10% precisa reduzir o disponível.
function worldSegregatedProper(): World {
  return {
    ledger: [
      { id: "sale", type: "sale", amount: SALE, status: "available", available_at: 0 },
      { id: "resdebit", type: "fee", amount: RESERVE, status: "available", available_at: 0 },
    ],
    reserve: { id: "r1", amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: "resdebit" },
  };
}

function worldShadowHold(): World {
  // Estado ATUAL de produção: settlement credita o líquido integral e a reserva
  // é apenas visual — não existe débito vinculado.
  return {
    ledger: [{ id: "sale", type: "sale", amount: SALE, status: "available", available_at: 0 }],
    reserve: { id: "r1", amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: null },
  };
}

describe("QA-4A-V2 — reserva sem segregação não pode ser creditada", () => {
  it("venda 100 / reserva 10 sem débito: liberação devolve NEEDS_PRODUCT_DECISION e mantém held", () => {
    const w = worldShadowHold();
    expect(balance(w.ledger, 20).available).toBe(SALE); // o 'retido' já está no disponível
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(w.reserve.status).toBe("held");
    expect(balance(w.ledger, 20).available).toBe(SALE); // nenhum centavo inventado
    expect(w.ledger.some((e) => e.security_reserve_id)).toBe(false);
  });

  it("débito vinculado mas cancelado também é fail-closed", () => {
    const w = worldSegregated(); // débito com status 'canceled'
    expect(releaseReserve(w, 20).outcome).toBe("NEEDS_PRODUCT_DECISION");
    expect(w.reserve.status).toBe("held");
  });
});

describe("QA-4A-V2 — saldo centavo a centavo com reserva segregada", () => {
  it("antes / durante / depois da liberação fecha em 100", () => {
    const w = worldSegregatedProper();
    // Antes do vencimento: disponível = 100 - 10 = 90, reserva retida = 10.
    expect(balance(w.ledger, 5).available).toBe(SALE - RESERVE);
    expect(releaseReserve(w, 5).outcome).toBe("NOT_DUE");
    expect(balance(w.ledger, 5).available).toBe(SALE - RESERVE);

    // Depois do vencimento: crédito de liberação devolve os 10.
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("RELEASED");
    expect(w.reserve.status).toBe("released");
    const after = balance(w.ledger, 20);
    expect(after.available).toBe(SALE);
    expect(after.pending).toBe(0);
    expect(after.total).toBe(SALE);
  });

  it("reserva em hold (pending) libera sem criar disponível negativo", () => {
    const w: World = {
      ledger: [
        { id: "sale", type: "sale", amount: SALE, status: "pending", available_at: 30 },
        { id: "resdebit", type: "fee", amount: RESERVE, status: "pending", available_at: 30 },
      ],
      reserve: { id: "r1", amount: RESERVE, status: "held", release_at: 10, ledger_debit_id: "resdebit" },
    };
    const before = balance(w.ledger, 20);
    expect(before.available).toBe(0);
    expect(before.pending).toBe(SALE - RESERVE);
    releaseReserve(w, 20);
    const after = balance(w.ledger, 20);
    expect(after.available).toBe(RESERVE);
    expect(after.pending).toBe(SALE - RESERVE);
    expect(after.total).toBe(SALE);
    expect(after.available).toBeGreaterThanOrEqual(0);
  });
});

describe("QA-4A-V2 — refund e chargeback antes da liberação", () => {
  it("venda reembolsada não devolve a reserva (forfeited)", () => {
    const w = worldSegregatedProper();
    w.reserve.order_status = "REFUNDED";
    const out = releaseReserve(w, 20);
    expect(out.outcome).toBe("FORFEITED");
    expect(w.reserve.status).toBe("forfeited");
    expect(w.ledger.some((e) => e.security_reserve_id)).toBe(false);
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

describe("QA-4A-V2 — replay, concorrência e falha de crédito", () => {
  it("replay do mesmo ciclo não duplica crédito", () => {
    const w = worldSegregatedProper();
    expect(releaseReserve(w, 20).outcome).toBe("RELEASED");
    const second = releaseReserve(w, 20);
    expect(second.outcome).toBe("ALREADY_PROCESSED");
    expect(w.ledger.filter((e) => e.security_reserve_id === "r1")).toHaveLength(1);
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("dois workers concorrentes creditam uma única vez", () => {
    const w = worldSegregatedProper();
    const a = releaseReserve(w, 20);
    const b = releaseReserve(w, 20); // segundo worker após o lock ser liberado
    expect([a.outcome, b.outcome]).toEqual(["RELEASED", "ALREADY_PROCESSED"]);
    expect(w.ledger.filter((e) => e.security_reserve_id === "r1")).toHaveLength(1);
    expect(balance(w.ledger, 20).available).toBe(SALE);
  });

  it("falha no crédito não deixa reserva liberada sem dinheiro", () => {
    const w = worldSegregatedProper();
    const out = releaseReserve(w, 20, { failCredit: true });
    expect(out.outcome).toBe("ERROR");
    expect(w.reserve.status).toBe("held"); // rollback: nada aplicado
    expect(w.ledger.some((e) => e.security_reserve_id)).toBe(false);
    // ciclo seguinte reprocessa normalmente
    expect(releaseReserve(w, 21).outcome).toBe("RELEASED");
    expect(balance(w.ledger, 21).available).toBe(SALE);
  });
});

describe("QA-4A-V2 — contrato da RPC e da Edge Function", () => {
  const sql = read(MIGRATION);
  const ef = read("supabase/functions/release-reserves/index.ts");
  const rpc = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.release_security_reserve"));

  it("trava a reserva FOR UPDATE antes de decidir", () => {
    expect(rpc).toMatch(/FROM public\.security_reserves\s*\n\s*WHERE id = p_reserve_id FOR UPDATE/);
  });

  it("credita e transiciona na mesma função, com chave estruturada", () => {
    expect(rpc).toMatch(/INSERT INTO public\.wallet_ledger[\s\S]{0,400}security_reserve_id/);
    expect(rpc).toMatch(/UPDATE public\.security_reserves[\s\S]{0,120}status = 'released'/);
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_reserve_release/);
  });

  it("é fail-closed quando não há débito de segregação", () => {
    expect(rpc).toMatch(/ledger_debit_id IS NULL[\s\S]{0,200}NEEDS_PRODUCT_DECISION/);
  });

  it("expõe outcomes discriminados", () => {
    for (const o of ["NOT_FOUND", "ALREADY_PROCESSED", "NOT_DUE", "HELD_CHARGEBACK", "FORFEITED", "RELEASED"]) {
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
    expect(sql).toMatch(/PREFLIGHT: % saque\(s\) com débito duplicado ativo/);
  });
});

describe("QA-4A-V2 — saques: aritmética, solicitante e reaprovação", () => {
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

describe("QA-4A-V2 — isolamento de leitura nas tabelas financeiras", () => {
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
