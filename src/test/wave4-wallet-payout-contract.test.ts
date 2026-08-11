import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Onda 4 — Carteira, saques, reservas e chargebacks.
 *
 * Cada bloco cita o defeito observado no HEAD auditado; o teste falha se a
 * correção regredir (foi exatamente assim que a regra canônica de saldo voltou
 * a ser quebrada por uma migration posterior de hardening de RPC).
 */

const MIGRATION = "supabase/migrations/20260811090000_wave4_wallet_payout_hardening.sql";
const read = (p: string) => readFileSync(p, "utf-8");

describe("P0-WA-01 — regra canônica de saldo restaurada", () => {
  const sql = read(MIGRATION);

  it("subtrai débitos ('withdrawal','fee','refund','chargeback') na leitura", () => {
    expect(sql).toMatch(/get_wallet_balance/);
    expect(sql).toMatch(/WHEN wl\.type IN \('withdrawal', 'fee', 'refund', 'chargeback'\) THEN -abs\(wl\.amount\)/);
  });

  it("não conta 'settled' no disponível (evita dupla contagem)", () => {
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.get_wallet_balance"));
    const body = fn.slice(0, fn.indexOf("calculate_payout_risk"));
    expect(body).toMatch(/status IN \('pending', 'available'\)/);
    expect(body).not.toMatch(/'settled'/);
  });

  it("promove pending vencido (available_at <= now) para disponível", () => {
    expect(sql).toMatch(/status = 'pending' AND available_at IS NOT NULL AND available_at <= now\(\)/);
  });

  it("mantém a validação de membership do workspace", () => {
    expect(sql).toMatch(/NOT public\.is_workspace_member\(p_workspace_id\)/);
  });
});

describe("P0-WA-02 — convenção única de sinal no wallet_ledger", () => {
  const sql = read(MIGRATION);

  it("normaliza débitos para valor absoluto por trigger", () => {
    expect(sql).toMatch(/fn_wallet_ledger_normalize_sign/);
    expect(sql).toMatch(/NEW\.amount := abs\(NEW\.amount\)/);
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF amount, type ON public\.wallet_ledger/);
  });

  it("a regra TS compartilhada segue a mesma convenção de débito", () => {
    const ts = read("supabase/functions/_shared/wallet-balance.ts");
    expect(ts).toMatch(/DEBIT_TYPES = \["withdrawal", "fee", "refund", "chargeback"\]/);
    expect(ts).toMatch(/return -Math\.abs\(raw\)/);
  });
});

describe("P0-WA-03 — `withdrawals` legada é somente leitura", () => {
  it("a migration remove a política de INSERT e os grants de escrita", () => {
    const sql = read(MIGRATION);
    expect(sql).toMatch(/DROP POLICY IF EXISTS withdrawals_insert_own_workspace ON public\.withdrawals/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.withdrawals FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.withdrawals TO authenticated/);
  });

  it("o CashOutModal não escreve mais em withdrawals nem no wallet_ledger", () => {
    const src = read("src/components/income/CashOutModal.tsx");
    expect(src).not.toMatch(/from\("withdrawals"\)/);
    expect(src).not.toMatch(/from\("wallet_ledger"\)/);
    expect(src).toMatch(/functions\.invoke\("create-payout-request"/);
  });
});

describe("P0-WA-04 — criação de saque atômica", () => {
  const sql = read(MIGRATION);
  const fn = read("supabase/functions/create-payout-request/index.ts");

  it("a RPC serializa por workspace com advisory lock", () => {
    expect(sql).toMatch(/create_payout_request_atomic/);
    expect(sql).toMatch(/pg_advisory_xact_lock\(hashtextextended\('payout:'/);
  });

  it("a RPC recalcula o saldo dentro do lock e trava saques abertos", () => {
    expect(sql).toMatch(/FROM public\.get_wallet_balance\(p_workspace_id\)/);
    expect(sql).toMatch(/status IN \('pending','in_review','approved','processing'\)/);
    expect(sql).toMatch(/'outcome', 'INSUFFICIENT_BALANCE'/);
  });

  it("a RPC valida a posse da conta bancária (fail-closed)", () => {
    expect(sql).toMatch(/BANK_ACCOUNT_MISMATCH/);
    expect(sql).toMatch(/FROM public\.bank_accounts[\s\S]{0,120}workspace_id = p_workspace_id/);
  });

  it("debita o ledger no mesmo commit do saque aprovado", () => {
    const rpc = sql.slice(sql.indexOf("create_payout_request_atomic"));
    expect(rpc).toMatch(/IF p_auto_approve THEN[\s\S]{0,400}INSERT INTO public\.wallet_ledger/);
  });

  it("a Edge Function delega a criação para a RPC e não insere direto", () => {
    expect(fn).toMatch(/rpc\("create_payout_request_atomic"/);
    expect(fn).not.toMatch(/from\("payout_requests"\)\s*\n?\s*\.insert/);
    expect(fn).toMatch(/outcome === "DUPLICATE"/);
  });

  it("o débito de saque tem índice único por (workspace, description)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_ledger_withdrawal_description/);
  });
});

describe("P1-WA-05 — revisão de saque server-side", () => {
  const sql = read(MIGRATION);
  const page = read("src/pages/AdminRiskReview.tsx");

  it("a RPC exige admin e recusa autoaprovação", () => {
    expect(sql).toMatch(/review_payout_request/);
    expect(sql).toMatch(/NOT public\.is_admin_user\(\)/);
    expect(sql).toMatch(/SELF_REVIEW_FORBIDDEN/);
  });

  it("a RPC só aceita transições a partir de pending/in_review", () => {
    expect(sql).toMatch(/v_req\.status NOT IN \('pending', 'in_review'\)/);
    expect(sql).toMatch(/INVALID_TRANSITION/);
  });

  it("aprovação debita e rejeição cancela o débito do ledger", () => {
    const rpc = sql.slice(sql.indexOf("review_payout_request"));
    expect(rpc).toMatch(/INSERT INTO public\.wallet_ledger/);
    expect(rpc).toMatch(/SET status = 'canceled'/);
  });

  it("a tela de risco usa a RPC e não faz UPDATE direto (que a RLS bloqueava)", () => {
    expect(page).toMatch(/review_payout_request/);
    expect(page).not.toMatch(/from\("payout_requests"\)[\s\S]{0,80}\.update\(/);
  });
});

describe("P1-WA-06 — risco de saque usa os status reais", () => {
  it("calculate_payout_risk não filtra por status inexistentes", () => {
    const sql = read(MIGRATION);
    const fn = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION public.calculate_payout_risk"));
    const body = fn.slice(0, fn.indexOf("uniq_wallet_ledger_withdrawal_description"));
    expect(body).not.toMatch(/'requested'/);
    expect(body).toMatch(/status IN \('pending','in_review','approved','processing','completed'\)/);
  });

});

describe("P0-WA-08 — liberação de reservas credita a carteira", () => {
  const job = read("supabase/functions/release-reserves/index.ts");
  const holds = read("supabase/functions/release-holds/index.ts");

  it("release-reserves credita o wallet_ledger ao liberar a reserva", () => {
    expect(job).toMatch(/from\("wallet_ledger"\)\.insert\(/);
    expect(job).toMatch(/security_reserve:/);
  });

  it("o crédito é idempotente por reserva", () => {
    expect(job).toMatch(/existingCredit/);
    expect(job).toMatch(/creditsSkipped/);
  });

  it("release-reserves não disputa mais reserve_entries com release-holds", () => {
    expect(job).not.toMatch(/from\("reserve_entries"\)/);
    expect(holds).toMatch(/from\("reserve_entries"\)/);
  });

  it("usa o guard de cron timing-safe e CORS restrito", () => {
    expect(job).toMatch(/requireCronSecret\(req, FN\)/);
    expect(job).toMatch(/from "\.\.\/_shared\/cors\.ts"/);
    expect(job).not.toMatch(/"Access-Control-Allow-Origin": "\*"/);
  });

  it("mantém a auditoria em cron_runs (sucesso e falha)", () => {
    expect(job).toMatch(/startCronRun\(/);
    expect(job).toMatch(/finish\(\s*"SUCCESS"/);
    expect(job).toMatch(/finish\(\s*"FAILED"/);
  });
});

describe("P1-WA-07 — grants financeiros sem escrita para anon", () => {
  it("revoga DML de anon/authenticated nas tabelas de dinheiro", () => {
    const sql = read(MIGRATION);
    for (const table of ["refunds", "chargeback_cases", "payout_items", "withdrawals"]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM anon, authenticated`));
      expect(sql).toMatch(new RegExp(`GRANT ALL ON TABLE public\\.${table} TO service_role`));
    }
  });
});
