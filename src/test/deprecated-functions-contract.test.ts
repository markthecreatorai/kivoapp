import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Regressão QA Onda 0 (IF-020 / IF-021).
 * - create-asaas-account está depreciada: precisa responder 410 antes de
 *   qualquer chamada ao Asaas (kill-switch), pois o deploy segue acessível.
 * - test-asaas em modo diagnóstico exige sessão autenticada.
 */
describe("funções depreciadas e de diagnóstico", () => {
  it("create-asaas-account responde 410 antes de tocar o Asaas", () => {
    const src = readFileSync("supabase/functions/create-asaas-account/index.ts", "utf-8");
    const killAt = src.indexOf("status: 410");
    const asaasAt = src.indexOf("fetch(");
    expect(killAt).toBeGreaterThan(0);
    expect(asaasAt === -1 || killAt < asaasAt).toBe(true);
    expect(src).toContain("deprecated");
  });

  it("test-asaas exige Authorization no modo diagnóstico", () => {
    const src = readFileSync("supabase/functions/test-asaas/index.ts", "utf-8");
    expect(src).toMatch(/Bearer /);
    expect(src).toMatch(/401/);
  });
});
