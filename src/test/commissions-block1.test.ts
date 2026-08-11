/**
 * Testes estáticos do Bloco 1 (comissões).
 *
 * Não tocam no banco e não movimentam valores: validam o contrato do código —
 * que post-purchase delega TODO o cálculo financeiro ao RPC único
 * `process_order_financials` e que nenhuma lógica duplicada sobrou.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

const postPurchase = read("supabase/functions/post-purchase/index.ts");
const resolveCode = read("supabase/functions/resolve-affiliate-code/index.ts");
const commissionsRelease = read("supabase/functions/commissions-release/index.ts");

describe("post-purchase: fonte única de verdade financeira", () => {
  it("chama process_order_financials", () => {
    expect(postPurchase).toContain('rpc("process_order_financials"');
  });

  it("propaga erro do RPC em vez de logar sucesso", () => {
    expect(postPurchase).toMatch(/finErr[\s\S]{0,400}status:\s*500/);
  });

  it("não recalcula split localmente", () => {
    expect(postPurchase).not.toContain("calculateSplit");
    expect(postPurchase).not.toContain("getSplitRule");
    expect(postPurchase).not.toContain("get_split_rule");
  });

  it("não insere split_entries, wallet_ledger nem commissions diretamente", () => {
    for (const table of ["split_entries", "wallet_ledger", "commissions"]) {
      expect(postPurchase).not.toContain(`.from("${table}").insert`);
      expect(postPurchase).not.toContain(`from("${table}")\n          .insert`);
    }
  });

  it("continua exigindo pedido pago e recusando pedidos de teste", () => {
    expect(postPurchase).toContain('order.status !== "COMPLETED"');
    expect(postPurchase).toContain('order.status === "TEST"');
  });

  it("segue protegida por token interno", () => {
    expect(postPurchase).toContain("x-kivo-internal-token");
  });
});

describe("resolve-affiliate-code: validação e clique no servidor", () => {
  it("delega ao RPC atômico de clique/atribuição", () => {
    expect(resolveCode).toContain('rpc("register_affiliate_click"');
  });

  it("não faz update de click_count no client da function", () => {
    expect(resolveCode).not.toContain("click_count");
  });

  it("não insere attribution manualmente", () => {
    expect(resolveCode).not.toContain("affiliate_attributions");
  });
});

describe("commissions-release: internal-only, sem transferência externa", () => {
  it("exige KIVO_INTERNAL_TOKEN", () => {
    expect(commissionsRelease).toContain("KIVO_INTERNAL_TOKEN");
    expect(commissionsRelease).toContain("x-kivo-internal-token");
  });

  it("usa dry_run = true por padrão", () => {
    expect(commissionsRelease).toContain("dry_run === false ? false : true");
  });

  it("não marca comissão como PAID nem chama gateway", () => {
    expect(commissionsRelease).not.toContain('"PAID"');
    expect(commissionsRelease).not.toContain("asaas");
    expect(commissionsRelease).toContain("external_transfer_enabled: false");
  });
});
