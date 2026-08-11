import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const SQL = readFileSync(
  "supabase/migrations/20260811050000_ensure_producer_workspace_advisory_lock.sql",
  "utf-8",
);

describe("contrato da migration ensure_producer_workspace_for", () => {
  it("adquire advisory lock determinístico por p_user_id antes do SELECT/INSERT", () => {
    expect(SQL).toMatch(/pg_advisory_xact_lock\(\s*hashtext\('ensure_producer_workspace_for'\)\s*,\s*hashtext\(p_user_id::text\)\s*\)/);
    const lockAt = SQL.indexOf("pg_advisory_xact_lock");
    const selectAt = SQL.indexOf("FROM public.workspace_members");
    const insertAt = SQL.indexOf("INSERT INTO public.workspaces");
    expect(lockAt).toBeGreaterThan(0);
    expect(lockAt).toBeLessThan(selectAt);
    expect(lockAt).toBeLessThan(insertAt);
  });

  it("preserva SECURITY DEFINER, search_path e grants restritos a service_role", () => {
    expect(SQL).toContain("SECURITY DEFINER");
    expect(SQL).toContain("SET search_path TO 'public'");
    expect(SQL).toContain("GRANT EXECUTE ON FUNCTION public.ensure_producer_workspace_for(uuid) TO service_role;");
    expect(SQL).toContain("FROM anon");
    expect(SQL).toContain("FROM authenticated");
  });

  it("é idempotente (CREATE OR REPLACE) e não duplica membro da workspace", () => {
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.ensure_producer_workspace_for");
    expect(SQL).toMatch(/INSERT INTO public\.workspace_members[\s\S]*ON CONFLICT \(user_id, workspace_id\) DO NOTHING/);
  });

  it("mantém a exigência de e-mail confirmado antes de criar workspace", () => {
    expect(SQL).toContain("email not confirmed");
  });
});
