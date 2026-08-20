import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  computeCheckoutTotals,
  computeCouponDiscount as feCouponDiscount,
  computePixDiscount as fePixDiscount,
} from "@/lib/checkout-totals";

const fn = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/${name}/index.ts`), "utf-8");
const shared = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/functions/_shared/${name}`), "utf-8");

const createPayment = fn("create-payment");
const tokenizeCard = fn("tokenize-card");
const simulateInstallments = fn("simulate-installments");
const checkPaymentStatus = fn("check-payment-status");
const testAsaas = fn("test-asaas");
const webhookAsaas = fn("webhook-asaas");
const refundsModule = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/refunds.ts"),
  "utf-8",
);

const payoutRequest = fn("create-payout-request");
const config = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf-8");

// ─────────────────────────────────────────────────────────────────────────────
// CO — Checkout público / endpoints de pagamento
// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / CO — CORS restrito nos endpoints financeiros de browser", () => {
  const browserFacing: [string, string][] = [
    ["create-payment", createPayment],
    ["tokenize-card", tokenizeCard],
    ["simulate-installments", simulateInstallments],
    ["check-payment-status", checkPaymentStatus],
    ["test-asaas", testAsaas],
  ];

  for (const [name, src] of browserFacing) {
    it(`${name} não usa Access-Control-Allow-Origin "*"`, () => {
      expect(src).not.toContain('"Access-Control-Allow-Origin": "*"');
    });

    it(`${name} deriva CORS de _shared/cors.ts por requisição`, () => {
      expect(src).toContain('from "../_shared/cors.ts"');
      expect(src).toContain("corsHeadersFor(req)");
    });
  }

  it("webhook-asaas permanece server-to-server (não usa o helper de CORS de browser)", () => {
    expect(webhookAsaas).not.toContain('from "../_shared/cors.ts"');
    expect(webhookAsaas).toContain("asaas-access-token");
  });
});

describe("Onda 3 / CO — rate limit nos endpoints públicos que gastam dinheiro/quota", () => {
  const limited: [string, string][] = [
    ["create-payment", createPayment],
    ["tokenize-card", tokenizeCard],
    ["simulate-installments", simulateInstallments],
  ];

  for (const [name, src] of limited) {
    it(`${name} aplica checkRateLimit por IP`, () => {
      expect(src).toContain('from "../_shared/rate-limit.ts"');
      expect(src).toContain("checkRateLimit(");
      expect(src).toContain("getClientIp(req)");
      expect(src).toContain("429");
    });
  }

  it("create-payment aplica o rate limit antes de criar cliente/pedido/cobrança", () => {
    const rateIdx = createPayment.indexOf("checkRateLimit(");
    const orderIdx = createPayment.indexOf('.from("orders")');
    const customerIdx = createPayment.indexOf('.from("customers")');
    expect(rateIdx).toBeGreaterThan(0);
    expect(rateIdx).toBeLessThan(orderIdx);
    expect(rateIdx).toBeLessThan(customerIdx);
  });

  it("tokenize-card usa teto agressivo (anti card testing)", () => {
    const max = Number(/RATE_LIMIT_MAX = (\d+)/.exec(tokenizeCard)?.[1]);
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(10);
  });
});

describe("Onda 3 / CO — adulteração de payload no checkout", () => {
  it("workspace_id é derivado do produto, nunca do corpo", () => {
    expect(createPayment).toContain("const workspace_id = product.workspace_id as string");
    expect(createPayment).not.toMatch(/const\s*{[^}]*workspace_id[^}]*}\s*=\s*body/);
  });

  it("price precisa pertencer ao product_id enviado", () => {
    expect(createPayment).toMatch(/\.eq\("id", price_id\)\s*\n\s*\.eq\("product_id", product_id\)/);
  });

  it("produto precisa estar PUBLISHED e não deletado", () => {
    expect(createPayment).toContain('product.deleted_at || product.status !== "PUBLISHED"');
  });

  it("order bump só é aceito se configurado e ativo para o produto principal", () => {
    expect(createPayment).toContain('.from("order_bumps")');
    expect(createPayment).toContain('.eq("main_product_id", product.id)');
    expect(createPayment).toContain('.eq("is_active", true)');
    expect(createPayment).toContain("allowedIds.has(bumpId)");
  });

  it("valor e desconto nunca vêm do cliente (apenas price/coupon do banco)", () => {
    expect(createPayment).not.toMatch(/body\.(total_amount|amount|discount)/);
    expect(createPayment).toContain("resolveCoupon(");
  });

  it("parcelas são validadas contra prices.max_installments", () => {
    expect(createPayment).toContain("price.max_installments");
    expect(createPayment).toContain("requestedInstallments > maxInstallments");
  });

  it("pedido zerado por desconto é bloqueado", () => {
    expect(createPayment).toContain("if (totalAmount <= 0)");
  });

  it("idempotency_key reaproveita o pedido existente", () => {
    expect(createPayment).toContain('.eq("idempotency_key", idempotency_key)');
    expect(createPayment).toContain("Pedido já existente");
  });

  it("falha de gateway responde 502 e marca o pedido FAILED liberando o cupom", () => {
    expect(createPayment).toContain("status: 502");
    expect(createPayment).toContain('.update({ status: "FAILED" })');
    expect(createPayment).toContain("release_coupon");
  });

  it("cartão só entra com token do gateway (PAN/CVV nunca chegam aqui)", () => {
    expect(createPayment).toContain('method === "credit_card" && !card_token');
    expect(createPayment).not.toMatch(/\bbody\.(card_number|cvv)\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FI — Função de diagnóstico / superfície morta
// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / FI — test-asaas deixa de ser proxy de credenciais", () => {
  it("não aceita api_key nem environment do corpo da requisição", () => {
    expect(testAsaas).not.toContain("body.api_key");
    expect(testAsaas).not.toContain("body.environment");
  });

  it("exige JWT e is_admin_user antes de qualquer chamada ao gateway", () => {
    const adminIdx = testAsaas.indexOf("is_admin_user");
    const fetchIdx = testAsaas.indexOf("finance/balance");
    expect(adminIdx).toBeGreaterThan(0);
    expect(adminIdx).toBeLessThan(fetchIdx);
    expect(testAsaas).toContain("Acesso restrito a administradores");
  });

  it("usa apenas ASAAS_API_KEY do ambiente e não ecoa o corpo do gateway", () => {
    expect(testAsaas).toContain('Deno.env.get("ASAAS_API_KEY")');
    expect(testAsaas).not.toContain("errorBody");
    expect(testAsaas).not.toContain("detail:");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FI — Webhook Asaas
// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / FI — webhook Asaas: autenticidade, idempotência e retry", () => {
  it("falha fechado sem ASAAS_WEBHOOK_TOKEN", () => {
    expect(webhookAsaas).toContain("refusing to process webhook");
    expect(webhookAsaas).toContain("status: 500");
  });

  it("compara o token em tempo constante e devolve 401 quando divergir", () => {
    expect(webhookAsaas).toContain("timingSafeEqualStr(headerToken, webhookToken)");
    expect(webhookAsaas).toContain('"Unauthorized", { status: 401');
  });

  it("chave de idempotência inclui o tipo do evento", () => {
    expect(webhookAsaas).toContain("const externalEventId = `${rawEventId}:${eventType}`");
  });

  it("evento já PROCESSED devolve duplicate sem reprocessar", () => {
    expect(webhookAsaas).toContain('existingEvent?.status === "PROCESSED"');
    expect(webhookAsaas).toContain("duplicate: true");
  });

  it("cobrança do evento precisa pertencer ao pedido correlacionado", () => {
    expect(webhookAsaas).toContain("PAYMENT_MISMATCH");
  });

  it("pedido já COMPLETED e pedido TEST não repetem efeitos", () => {
    expect(webhookAsaas).toContain("ALREADY_COMPLETED");
    expect(webhookAsaas).toContain("TEST_IGNORED");
  });

  it("status desconhecido é registrado sem efeito financeiro", () => {
    expect(webhookAsaas).toContain("Unhandled Asaas event");
  });

  it("falha de processamento vira FAILED/DEAD_LETTER com backoff e 500 para retry", () => {
    expect(webhookAsaas).toContain("MAX_ATTEMPTS");
    expect(webhookAsaas).toContain("RETRY_DELAYS");
    expect(webhookAsaas).toContain('isDeadLetter ? "DEAD_LETTER" : "FAILED"');
    expect(webhookAsaas).toContain("processing_failed");
  });

  it("comissão de afiliado é liquidada só pelo RPC atômico", () => {
    expect(webhookAsaas).toContain("process_order_commission");
  });

  it("refund e chargeback cancelam comissões e confiscam reserva", () => {
    // QA-4A-V6.1: comissões e confisco da reserva passaram para dentro das RPCs
    // atômicas (process_refund_increment / resolve_chargeback_financials).
    expect(webhookAsaas).toContain("resolve_chargeback_financials");
    expect(webhookAsaas).toContain("cancel_referral_commissions_for_payment");
    expect(webhookAsaas).not.toContain('status: "forfeited"');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// FI — Invariantes financeiros (centavo a centavo, módulos puros)
// ─────────────────────────────────────────────────────────────────────────────
type LedgerRow = {
  amount: number;
  status: string;
  type: string;
  available_at?: string | null;
};

const DEBIT_TYPES = ["withdrawal", "fee", "refund", "chargeback"];
const BALANCE_STATUSES = ["pending", "available"];

// Espelho exato de supabase/functions/_shared/wallet-balance.ts (módulo Deno,
// reimplementado aqui para o vitest sem importar código com Deno APIs).
function signedAmount(row: LedgerRow) {
  const raw = Number(row.amount || 0);
  return DEBIT_TYPES.includes(row.type) ? -Math.abs(raw) : raw;
}
function computeBalances(rows: LedgerRow[], now = Date.now()) {
  let available = 0;
  let pending = 0;
  for (const r of rows) {
    if (!BALANCE_STATUSES.includes(r.status)) continue;
    const due = !!r.available_at && new Date(r.available_at).getTime() <= now;
    const value = signedAmount(r);
    if (r.status === "available" || (r.status === "pending" && due)) available += value;
    else if (r.status === "pending" && !due) pending += value;
  }
  return { available, pending, total: available + pending };
}

function computeSplitCents(args: {
  grossCents: number;
  gatewayFeeCents: number;
  platformPercent: number;
  commissionBrl: number;
}) {
  const grossCents = Math.max(Math.round(args.grossCents), 0);
  const gatewayFeeCents = Math.max(Math.round(args.gatewayFeeCents), 0);
  const netCents = Math.max(grossCents - gatewayFeeCents, 0);
  const platformFeeCents = Math.round(netCents * (args.platformPercent || 0) / 100);
  let affiliateFeeCents = Math.max(Math.round(args.commissionBrl * 100), 0);
  let creatorNetCents = netCents - platformFeeCents - affiliateFeeCents;
  if (creatorNetCents < 0) {
    affiliateFeeCents = Math.max(netCents - platformFeeCents, 0);
    creatorNetCents = netCents - platformFeeCents - affiliateFeeCents;
  }
  return { grossCents, gatewayFeeCents, platformFeeCents, affiliateFeeCents, creatorNetCents };
}

describe("Onda 3 / FI — invariante de soma do split", () => {
  const cases = [
    { gross: 9990, gwPct: 4.99, platform: 8, commission: 0 },
    { gross: 9990, gwPct: 0.99, platform: 8, commission: 15.98 },
    { gross: 1, gwPct: 4.99, platform: 8, commission: 0 },
    { gross: 12345, gwPct: 4.99, platform: 10, commission: 24.69 },
    { gross: 100000, gwPct: 0.99, platform: 8, commission: 200 },
  ];

  for (const c of cases) {
    it(`gross ${c.gross} fecha exatamente em gateway+plataforma+afiliado+produtor`, () => {
      const gatewayFeeCents = Math.round(c.gross * c.gwPct / 100);
      const s = computeSplitCents({
        grossCents: c.gross,
        gatewayFeeCents,
        platformPercent: c.platform,
        commissionBrl: c.commission,
      });
      expect(
        s.gatewayFeeCents + s.platformFeeCents + s.affiliateFeeCents + s.creatorNetCents,
      ).toBe(s.grossCents);
      expect(Number.isInteger(s.creatorNetCents)).toBe(true);
      expect(s.creatorNetCents).toBeGreaterThanOrEqual(0);
    });
  }

  it("comissão maior que o líquido nunca gera creator_net negativo", () => {
    const s = computeSplitCents({
      grossCents: 1000,
      gatewayFeeCents: 50,
      platformPercent: 8,
      commissionBrl: 999,
    });
    expect(s.creatorNetCents).toBe(0);
    expect(s.gatewayFeeCents + s.platformFeeCents + s.affiliateFeeCents).toBe(1000);
  });
});

describe("Onda 3 / FI — carteira: available x pending, holds e ausência de débito duplo", () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString();
  const past = new Date(Date.now() - 86400000).toISOString();

  it("venda em hold conta como pending, não como disponível", () => {
    const b = computeBalances([{ amount: 10000, status: "pending", type: "sale", available_at: future }]);
    expect(b).toEqual({ available: 0, pending: 10000, total: 10000 });
  });

  it("hold vencido migra para disponível sem alterar o total", () => {
    const b = computeBalances([{ amount: 10000, status: "pending", type: "sale", available_at: past }]);
    expect(b).toEqual({ available: 10000, pending: 0, total: 10000 });
  });

  it("reembolso não debita duas vezes: venda canceled + refund settled = 0", () => {
    const b = computeBalances([
      { amount: 10000, status: "canceled", type: "sale", available_at: past },
      { amount: -10000, status: "settled", type: "refund" },
    ]);
    expect(b.total).toBe(0);
  });

  it("saque sempre subtrai, mesmo com amount positivo", () => {
    const b = computeBalances([
      { amount: 10000, status: "available", type: "sale" },
      { amount: 3000, status: "available", type: "withdrawal" },
    ]);
    expect(b.available).toBe(7000);
  });

  it("chargeback debita o valor absoluto", () => {
    const b = computeBalances([
      { amount: 10000, status: "available", type: "sale" },
      { amount: 10000, status: "available", type: "chargeback" },
    ]);
    expect(b.available).toBe(0);
  });

  it("lançamentos settled e canceled não movem saldo", () => {
    const b = computeBalances([
      { amount: 500, status: "settled", type: "fee" },
      { amount: 9999, status: "canceled", type: "sale" },
    ]);
    expect(b).toEqual({ available: 0, pending: 0, total: 0 });
  });
});

describe("Onda 3 / FI — paridade de desconto frontend x backend", () => {
  const backendCoupon = shared("coupon.ts");

  it("a ordem documentada é cupom sobre o subtotal e PIX sobre o resultado", () => {
    expect(backendCoupon).toContain("PIX percentage applied AFTER the coupon");
    expect(createPayment).toContain("computePixDiscount(amountAfterCoupon");
  });

  it("frontend e backend produzem o mesmo total (cupom 10% + PIX 5% sobre 199,90)", () => {
    const subtotal = 199.9;
    const couponDiscount = feCouponDiscount({ type: "PERCENT", value: 10 }, subtotal);
    const afterCoupon = Math.round((subtotal - couponDiscount) * 100) / 100;
    const pix = fePixDiscount(afterCoupon, 5);
    const totals = computeCheckoutTotals({
      priceAmount: 199.9,
      bumpAmount: 0,
      coupon: { type: "PERCENT", value: 10 },
      pixDiscountPercent: 5,
    });
    expect(totals.couponDiscount).toBe(couponDiscount);
    expect(totals.pixDiscount).toBe(pix);
    expect(totals.pixTotal).toBe(Math.round((afterCoupon - pix) * 100) / 100);
  });

  it("PIX nunca incide sobre o subtotal cheio quando há cupom", () => {
    const t = computeCheckoutTotals({
      priceAmount: 100,
      bumpAmount: 0,
      coupon: { type: "FIXED", value: 50 },
      pixDiscountPercent: 10,
    });
    expect(t.pixDiscount).toBe(5);
    expect(t.pixTotal).toBe(45);
  });

  it("order bump entra no subtotal antes do cupom", () => {
    const t = computeCheckoutTotals({
      priceAmount: 100,
      bumpAmount: 50,
      coupon: { type: "PERCENT", value: 10 },
      pixDiscountPercent: null,
    });
    expect(t.subtotal).toBe(150);
    expect(t.couponDiscount).toBe(15);
    expect(t.cardTotal).toBe(135);
  });
});

describe("Onda 3 / FI — taxas e reserva conforme regra de negócio", () => {
  it("boleto usa taxa fixa em centavos, não percentual", () => {
    expect(createPayment).toContain("boleto_fixed_cents");
    expect(createPayment).toContain("boleto is a FIXED fee in centavos");
  });

  it("reserva de segurança só existe em cartão", () => {
    // QA-4A-V5: create-payment não cria mais reserva (nem em cartão). A
    // elegibilidade por método vive na RPC canônica settle_order_reserve,
    // chamada no settlement, onde já existe crédito no wallet_ledger.
    expect(createPayment).not.toContain('from("security_reserves")\n');
    const reserveSql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260811100000_wave5_reserve_model_canonical.sql"),
      "utf-8",
    );
    expect(reserveSql).toContain("NOT_APPLICABLE");
    expect(reserveSql).toContain("'pix'");
    // A elegibilidade por método passou para a RPC canônica: PIX/boleto
    // devolvem NOT_APPLICABLE e nenhuma reserva é criada.
    expect(webhookAsaas).toContain("settle_order_reserve");
    expect(reserveSql).toMatch(/v_method IN \('pix', 'boleto'\)[\s\S]{0,200}NOT_APPLICABLE/);
  });

  it("nada é gravado em wallet_ledger no create-payment (só na confirmação)", () => {
    expect(createPayment).not.toContain('.from("wallet_ledger")');
    expect(createPayment).toContain('status: "pending"');
  });

  it("split_entries nasce pending com available_at nulo", () => {
    expect(createPayment).toContain("available_at: null");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FI — Saque
// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / FI — saque: autorização, saldo e idempotência", () => {
  it("exige JWT e verify_jwt = true no config", () => {
    expect(payoutRequest).toContain('if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401)');
    expect(config).toMatch(/\[functions\.create-payout-request\]\s*\nverify_jwt = true/);
  });

  it("workspace vem da associação do usuário, nunca do corpo", () => {
    expect(payoutRequest).toContain('.from("workspace_members")');
    expect(payoutRequest).not.toMatch(/body\.workspace_id/);
  });

  it("apenas OWNER/ADMIN podem sacar e a conta bancária precisa ser do workspace", () => {
    expect(payoutRequest).toContain('["OWNER", "ADMIN"].includes(String(m.role))');
    expect(payoutRequest).toContain("conta de outro workspace");
  });

  it("saldo é recalculado no servidor dentro da transação (Onda 4: RPC atômica)", () => {
    // A regra canônica saiu do TS e passou a rodar em public.get_wallet_balance,
    // chamada por create_payout_request_atomic sob advisory lock por workspace.
    expect(payoutRequest).toContain('rpc("create_payout_request_atomic"');
    expect(payoutRequest).toContain("INSUFFICIENT_BALANCE");
  });


  it("respeita saque mínimo do fee_config e aceita chave de idempotência", () => {
    expect(payoutRequest).toContain("min_withdrawal_cents");
    expect(payoutRequest).toContain("idempotency_key");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FI — Reembolso total x parcial (P0 corrigido nesta onda)
// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / FI — reembolso parcial não dobra o débito", () => {
  // A lógica de reembolso vive em supabase/functions/_shared/refunds.ts e a
  // reversão financeira é atômica dentro da RPC process_refund_increment.
  // Comportamento detalhado: src/test/wave3-refund-increment-behavior.test.ts.
  it("o webhook delega reembolso ao módulo compartilhado, sem handler local", () => {
    expect(webhookAsaas).toContain('from "../_shared/refunds.ts"');
    expect(webhookAsaas).not.toContain("handleRefunded");
  });

  it("eventos concluídos e em processamento são roteados separadamente", () => {
    expect(webhookAsaas).toContain('eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED"');
    expect(webhookAsaas).toContain('eventType === "PAYMENT_REFUND_IN_PROGRESS"');
  });

  it("nenhuma escrita financeira de reembolso acontece fora da RPC atômica", () => {
    expect(refundsModule).toContain("process_refund_increment");
    expect(refundsModule).not.toContain('from("wallet_ledger")');
    expect(refundsModule).not.toContain('from("entitlements")');
    // Leitura de split_entries é permitida (necessária para recalcular a
    // reserva canônica pelo creator_net remanescente); ESCRITA continua proibida.
    expect(refundsModule).not.toMatch(/from\("split_entries"\)[\s\S]{0,120}\.(update|insert|upsert|delete)\(/);
    expect(refundsModule).toContain("reverse_reserve_entry");
  });

  it("valor devolvido vem sempre de refunds[], nunca do valor da cobrança", () => {
    expect(refundsModule).toContain("Array.isArray(paymentData?.refunds)");
    expect(refundsModule).toContain("sem refunds[] utilizável");
    expect(refundsModule).not.toContain("refundedFromList > 0 ? refundedFromList : chargeAmount");
  });


  it("saldo: venda 100 + reembolso parcial de 30 resulta em 70", () => {
    const b = computeBalances([
      { amount: 10000, status: "available", type: "sale" },
      { amount: -3000, status: "available", type: "refund" },
    ]);
    expect(b.available).toBe(7000);
  });

  it("saldo: reembolso total não debita além do cancelamento da venda", () => {
    const b = computeBalances([
      { amount: 10000, status: "canceled", type: "sale" },
      { amount: -10000, status: "settled", type: "refund" },
    ]);
    expect(b.available).toBe(0);
    expect(b.total).toBe(0);
  });
});
