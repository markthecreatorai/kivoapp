import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

/**
 * Bloco A — contrato da migration que corrige o P0 CB-REORDER-IDOR.
 *
 * A migration NÃO é aplicada nesta rodada, então o contrato é verificado
 * estaticamente sobre o SQL versionado: cada garantia exigida (autenticação,
 * validação de estrutura, autorização total, ausência de update parcial,
 * SECURITY DEFINER, search_path e grants por assinatura exata) tem um caso.
 */

const MIGRATION =
  "supabase/migrations/20260811070000_batch_reorder_fail_closed_ownership_guard.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf-8");

/** Recorta o corpo de uma das duas funções para asserções isoladas. */
function functionBody(name: "batch_reorder_lessons" | "batch_reorder_modules"): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(items jsonb)`);
  expect(start, `função ${name} ausente`).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$function$;", start);
  expect(end).toBeGreaterThan(start);
  return sql.slice(start, end);
}

const FUNCTIONS = ["batch_reorder_lessons", "batch_reorder_modules"] as const;

describe("Bloco A — versionamento da correção", () => {
  it("a migration existe com timestamp posterior ao HEAD da Onda 2", () => {
    expect(existsSync(resolve(process.cwd(), MIGRATION))).toBe(true);
    // O último arquivo anterior é 20260811052931; este precisa vir depois.
    expect(Number("20260811070000")).toBeGreaterThan(Number("20260811052931"));
  });

  it("o SQL solto em docs/pending-sql foi eliminado", () => {
    expect(existsSync(resolve(process.cwd(), "docs/pending-sql"))).toBe(false);
    expect(
      existsSync(
        resolve(process.cwd(), "docs/pending-sql/onda2-batch-reorder-ownership-guard.sql"),
      ),
    ).toBe(false);
  });

  it("não há DROP FUNCTION (troca in-place via CREATE OR REPLACE)", () => {
    expect(sql).not.toMatch(/DROP FUNCTION/i);
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g)?.length).toBe(2);
  });
});

describe.each(FUNCTIONS)("Bloco A — %s: fail-closed e atômica", (name) => {
  const body = functionBody(name);
  const entity = name === "batch_reorder_lessons" ? "lesson" : "module";
  const table = name === "batch_reorder_lessons" ? "course_lessons" : "course_modules";

  it("preserva SECURITY DEFINER e search_path seguro", () => {
    expect(body).toMatch(/SECURITY DEFINER/);
    expect(body).toMatch(/SET search_path TO 'public'/);
  });

  it("exige sessão autenticada antes de tudo", () => {
    expect(body).toMatch(/IF auth\.uid\(\) IS NULL THEN[\s\S]*?28000/);
    const authIdx = body.indexOf("auth.uid() IS NULL");
    const updateIdx = body.indexOf("UPDATE ");
    expect(authIdx).toBeGreaterThan(-1);
    expect(authIdx).toBeLessThan(updateIdx);
  });

  it("valida o tipo do payload e a estrutura de cada item", () => {
    expect(body).toMatch(/jsonb_typeof\(items\) <> 'array'/);
    expect(body).toMatch(/jsonb_typeof\(item\) <> 'object'/);
    expect(body).toMatch(/NOT \(item \? 'id'\)/);
    expect(body).toMatch(/NOT \(item \? 'position'\)/);
  });

  it("faz cast estrito de uuid e int (payload malformado aborta)", () => {
    expect(body).toMatch(/\(item->>'id'\)::uuid/);
    expect(body).toMatch(/\(item->>'position'\)::int/);
  });

  it("rejeita array vazio, ids duplicados e position negativa", () => {
    expect(body).toMatch(/items must not be empty/);
    expect(body).toMatch(new RegExp(`duplicate ${entity} id in payload`));
    expect(body).toMatch(/position must be >= 0/);
    expect(body).toMatch(/count\(DISTINCT p\.id\)/);
    expect(body).toMatch(/FILTER \(WHERE p\.position < 0\)/);
  });

  it("autoriza pelo predicado real já vigente (is_workspace_member)", () => {
    expect(body).toMatch(/public\.is_workspace_member\(c\.workspace_id\)/);
    // Nenhum papel/predicado inventado.
    expect(body).not.toMatch(/is_admin_user|has_role\(/);
  });

  it("payload misto aborta: a contagem autorizada tem de igualar o total", () => {
    expect(body).toMatch(/IF v_allowed <> v_total THEN/);
    expect(body).toMatch(new RegExp(`unauthorized or unknown ${entity} in payload`));
    expect(body).toMatch(/42501/);
  });

  it("nunca aplica subconjunto: o UPDATE vem depois da checagem, sem filtro de dono", () => {
    const guardIdx = body.indexOf("v_allowed <> v_total");
    const updateIdx = body.indexOf(`UPDATE ${table}`);
    expect(guardIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(guardIdx);
    // Um único UPDATE — não há passo intermediário que grave parte do payload.
    expect(body.match(/UPDATE /g)?.length).toBe(1);
  });

  it("não usa tabela temporária (reentrante na mesma transação)", () => {
    expect(body).not.toMatch(/CREATE TEMP TABLE/i);
  });

  it("não silencia exceções", () => {
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
  });
});

describe("Bloco A — grants mínimos por assinatura exata", () => {
  for (const name of FUNCTIONS) {
    it(`${name}(jsonb): PUBLIC e anon sem EXECUTE`, () => {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(jsonb) FROM PUBLIC;`);
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${name}(jsonb) FROM anon;`);
    });

    it(`${name}(jsonb): EXECUTE apenas para authenticated e service_role`, () => {
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(jsonb) TO authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${name}(jsonb) TO service_role;`);
    });
  }

  it("nenhum grant sem assinatura ou para anon", () => {
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.batch_reorder_\w+\s+TO/);
    expect(sql).not.toMatch(/GRANT EXECUTE[^\n]*TO[^\n]*\banon\b/);
    expect(sql).not.toMatch(/GRANT ALL/);
  });
});
