import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  SERVER_ONLY_FUNCTIONS,
  SERVICE_ONLY_FUNCTIONS,
  TRIGGER_ONLY_FUNCTIONS,
  AUTHENTICATED_ONLY_FUNCTIONS,
  INTENTIONAL_ANON_FUNCTIONS,
  RLS_PREDICATE_FUNCTIONS,
} from "@/lib/security/rpcExposurePolicy";

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx)$/.test(entry) && !full.includes("integrations/supabase/types")) acc.push(full);
  }
  return acc;
}

const FRONTEND_FILES = walk("src").filter((f) => !f.includes(`src${"/"}test`));
const FRONTEND_SOURCE = FRONTEND_FILES.map((f) => readFileSync(f, "utf-8")).join("\n");

describe("exposição das RPCs SECURITY DEFINER", () => {
  it("nenhuma função server-only é chamada pelo frontend", () => {
    const violations = SERVER_ONLY_FUNCTIONS.filter((fn) =>
      new RegExp(`rpc\\(\\s*["'\`]${fn}["'\`]`).test(FRONTEND_SOURCE),
    );
    expect(violations).toEqual([]);
  });

  it("cron_secret é tratada como server-only (nunca alcançável pelo browser)", () => {
    expect(SERVICE_ONLY_FUNCTIONS).toContain("cron_secret");
    expect(FRONTEND_SOURCE).not.toMatch(/rpc\(\s*["'`]cron_secret["'`]/);
  });

  it("cada função classificada aparece em exatamente uma categoria", () => {
    const all = [
      ...TRIGGER_ONLY_FUNCTIONS,
      ...SERVICE_ONLY_FUNCTIONS,
      ...AUTHENTICATED_ONLY_FUNCTIONS,
      ...INTENTIONAL_ANON_FUNCTIONS,
      ...RLS_PREDICATE_FUNCTIONS,
    ];
    const duplicated = all.filter((fn, i) => all.indexOf(fn) !== i);
    expect(duplicated).toEqual([]);
  });

  it("as RPCs de fluxo anônimo permanecem disponíveis ao checkout público", () => {
    for (const fn of ["complete_checkout_session", "get_checkout_session_public"]) {
      expect(INTENTIONAL_ANON_FUNCTIONS as readonly string[]).toContain(fn);
    }
    expect(FRONTEND_SOURCE).toMatch(/rpc\(\s*["'`]complete_checkout_session["'`]/);
  });
});
