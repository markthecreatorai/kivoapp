import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computeBalances } from "../../supabase/functions/_shared/wallet-balance.ts";

/**
 * QA-4A-V6.1 — atomicidade de refund e chargeback.
 *
 * P0-1: refund + reversão da reserva no MESMO commit (uma RPC), com replay
 *       convergente (o caminho 'duplicate' repara reserva desalinhada).
 * P0-2: chargeback deixa de ser multi-write; núcleo financeiro em uma RPC
 *       idempotente por gateway_dispute_id, debitando apenas creator_net.
 */

const V61 = "supabase/migrations/20260811120000_wave61_refund_chargeback_atomic.sql";
const sql = readFileSync(V61, "utf-8");
const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
const refunds = readFileSync("supabase/functions/_shared/refunds.ts", "utf-8");
const webhook = readFileSync("supabase/functions/webhook-asaas/index.ts", "utf-8");

// ───────────── 1. Refund: uma única transação ─────────────
describe("QA-4A-V6.1 — refund atômico", () => {
  it("a reversão da reserva acontece dentro de process_refund_increment", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.process_refund_increment/);
    expect(code).toMatch(/v_reserve := public\.reverse_reserve_entry\(/);
    expect(code).toMatch(/'reserve_adjustment', v_reserve/);
  });

  it("desfecho inesperado da reserva aborta o incremento inteiro", () => {
    expect(code).toMatch(/RAISE EXCEPTION 'REFUND_RESERVE: desfecho inesperado/);
    expect(code).toMatch(/NOT IN \('NO_RESERVE', 'REDUCED', 'REVERSED',/);
  });

  it("Edge Function não faz mais uma segunda chamada de reserva", () => {
    expect(refunds).toContain("process_refund_increment");
    expect(refunds).not.toContain("reverse_reserve_entry");
    expect(refunds).not.toMatch(/from\("split_entries"\)/);
  });

  it("replay repara em vez de retornar cego", () => {
    expect(code).toMatch(/'outcome', 'duplicate'/);
    expect(code).toMatch(/refund_partial_replay/);
    expect(code).toMatch(/refund_total_replay/);
  });

  it("replay-only passa pela RPC no Edge e não depende de leitura de refunds", () => {
    expect(refunds).not.toMatch(/\.from\("refunds"\)/);
    expect(refunds).not.toMatch(/pending\.length\s*===\s*0/);
    expect(refunds).toMatch(/for \(const item of items\)[\s\S]*rpc\("process_refund_increment"/);
    expect(refunds).toContain('outcome === "duplicate"');
    expect(refunds).toContain('"REFUND_REPAIRED"');
    expect(refunds).toContain('"REFUND_REPLAY"');
  });

  it("teto do reembolso vem do banco, nunca do payload", () => {
    expect(code).toMatch(/cobranca divergente: payload=% banco=%/);
    expect(code).toMatch(/over-refund no pedido/);
  });
});

// ───────────── 2. Chargeback: núcleo atômico e idempotente ─────────────
describe("QA-4A-V6.1 — chargeback atômico", () => {
  it("RPC única com advisory lock por pedido", () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_chargeback_financials/);
    expect(code).toMatch(/pg_advisory_xact_lock\(\s*\n?\s*hashtextextended\('resolve_chargeback_financials:/);
  });

  it("idempotência estrutural por gateway_dispute_id", () => {
    expect(code).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS ux_chargeback_cases_gateway_dispute_id/);
    expect(code).toMatch(/ON CONFLICT \(gateway_dispute_id\)/);
    expect(code).toMatch(/'ALREADY_PROCESSED'/);
    expect(code).toMatch(/gateway_dispute_id obrigatorio para idempotencia/);
  });

  it("aborta a aplicação se houver duplicidade pré-existente", () => {
    expect(code).toMatch(/ABORTADO: public\.chargeback_cases possui gateway_dispute_id duplicado/);
  });

  it("debita apenas creator_net: linha de chargeback é auditoria canceled", () => {
    expect(code).toMatch(/'chargeback', -p_amount_cents,[\s\S]{0,80}'canceled'/);
    expect(code).not.toMatch(/'chargeback'[\s\S]{0,120}'settled'/);
    expect(code).toMatch(/'creator_net_cents', v_creator_net/);
    expect(code).toMatch(/'ledger_effect', 'sale_canceled'/);
  });

  it("ownership validado dentro da transação", () => {
    expect(code).toMatch(/OWNERSHIP_MISMATCH pedido % \/ pagamento %/);
    expect(code).toMatch(/OWNERSHIP_MISMATCH split do pedido/);
  });

  it("webhook delega o núcleo e falha fechado", () => {
    expect(webhook).toMatch(/rpc\("resolve_chargeback_financials"/);
    expect(webhook).toMatch(/throw new Error\(`resolve_chargeback_financials falhou/);
    expect(webhook).toMatch(/não confirmou o núcleo/);
    expect(webhook).toMatch(/chargeback sem id de disputa do gateway/);
  });

  it("webhook não escreve mais nada financeiro do chargeback", () => {
    const cb = webhook.slice(
      webhook.indexOf("async function handleChargeback"),
      webhook.indexOf("async function handleCanceled"),
    );
    expect(cb).not.toMatch(/from\("chargeback_cases"\)/);
    expect(cb).not.toMatch(/from\("wallet_ledger"\)/);
    expect(cb).not.toMatch(/from\("split_entries"\)/);
    expect(cb).not.toMatch(/from\("orders"\)/);
    expect(cb).not.toMatch(/from\("transactions"\)/);
    expect(cb).not.toMatch(/from\("commissions"\)/);
  });
});

// ───────────── 3. Invariantes de saldo (sem débito dobrado) ─────────────
type Row = Parameters<typeof computeBalances>[0][number];
const DUE = "2026-07-01T00:00:00.000Z";
const row = (type: Row["type"], amount: number, status: string): Row =>
  ({ type, amount, status, available_at: DUE } as Row);

describe("QA-4A-V6.1 — chargeback não dobra o débito", () => {
  it("venda cancelada + trilha canceled do bruto ⇒ saldo zero", () => {
    const NET = 9000;
    const RES = 1000; // 10% de 10000
    const b = computeBalances([
      row("sale", NET + RES, "canceled"),
      row("adjustment", -RES, "canceled"),
      row("adjustment", RES, "canceled"),
      row("chargeback", -12000, "canceled"), // bruto contestado, só auditoria
    ]);
    expect(b.total).toBe(0);
    expect(b.available).toBe(0);
    expect(b.pending).toBe(0);
  });

  it("a linha de chargeback nunca entra em status que afeta saldo", () => {
    // Correção de premissa: 'settled' já era neutro em computeBalances, portanto
    // o débito dobrado do modelo antigo NÃO aparecia aqui — ele aparecia em
    // qualquer leitura que contasse a linha como ativa. O contrato agora é
    // explícito: a trilha é 'canceled'. Se algum dia virasse 'available',
    // o débito seria contado duas vezes (venda cancelada + linha ativa):
    const wrong = computeBalances([
      row("sale", 10000, "canceled"),
      row("chargeback", -12000, "available"),
    ]);
    expect(wrong.total).toBe(-12000); // duplicidade que o status canceled evita
    expect(code).toMatch(/'chargeback', -p_amount_cents,[\s\S]{0,80}'canceled'/);
    expect(code).toMatch(/status\s*= 'canceled',/);
  });


  it("refund parcial anterior ao chargeback também é cancelado", () => {
    const b = computeBalances([
      row("sale", 10000, "canceled"),
      row("refund", -3000, "canceled"),
      row("chargeback", -10000, "canceled"),
    ]);
    expect(b.total).toBe(0);
  });
});

// ───────────── 4. Privilégios e search_path ─────────────
describe("QA-4A-V6.1 — privilégios", () => {
  const FNS = [
    "process_refund_increment(uuid, uuid, text, integer, integer)",
    "resolve_chargeback_financials(uuid, uuid, text, integer, text, integer)",
  ];
  for (const fn of FNS) {
    it(`${fn}: REVOKE de PUBLIC/anon/authenticated e GRANT só service_role`, () => {
      const esc = fn.replace(/[()]/g, (c) => `\\${c}`);
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${esc} FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${esc} TO service_role;`));
    });
  }

  it("search_path vazio com relações qualificadas por schema", () => {
    const count = (sql.match(/SET search_path TO ''/g) || []).length;
    expect(count).toBe(FNS.length);
    expect(code).not.toMatch(/\sFROM (orders|payments|split_entries|wallet_ledger)\b/);
  });

  it("não reintroduz security_reserves como fonte concorrente", () => {
    expect(code).not.toMatch(/INSERT INTO public\.security_reserves/);
  });
});
