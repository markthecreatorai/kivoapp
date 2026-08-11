import { describe, it, expect, vi } from "vitest";
import {
  confirmAndConsume,
  type ConfirmDeps,
} from "../../supabase/functions/_shared/auth-confirm";

function makeDeps(overrides: Partial<ConfirmDeps> = {}) {
  let consumed = false;
  const deps: ConfirmDeps = {
    confirmUser: vi.fn(async () => ({ error: null })),
    consumeCode: vi.fn(async () => {
      if (consumed) return false;
      consumed = true;
      return true;
    }),
    getAccountType: vi.fn(async () => "PRODUCER" as const),
    ensureProducerWorkspace: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
  return deps;
}

describe("confirmAndConsume — confirmação recuperável e idempotente", () => {
  it("não consome o código quando a Admin API falha (falha transitória)", async () => {
    const deps = makeDeps({
      confirmUser: vi.fn(async () => ({ error: { message: "500 upstream" } })),
    });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toEqual({ ok: false, status: 503, reason: "temporarily_unavailable" });
    expect(deps.consumeCode).not.toHaveBeenCalled();
    expect(deps.ensureProducerWorkspace).not.toHaveBeenCalled();
  });

  it("retry após falha transitória conclui com o MESMO código", async () => {
    let fail = true;
    const deps = makeDeps({
      confirmUser: vi.fn(async () => (fail ? { error: { message: "timeout" } } : { error: null })),
    });
    const first = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(first.ok).toBe(false);
    fail = false;
    const second = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(second).toMatchObject({ ok: true, consumed: true, accountType: "PRODUCER" });
    expect(deps.ensureProducerWorkspace).toHaveBeenCalledTimes(1);
  });

  it("confirma antes de consumir (ordem das operações)", async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      confirmUser: vi.fn(async () => {
        calls.push("confirm");
        return { error: null };
      }),
      consumeCode: vi.fn(async () => {
        calls.push("consume");
        return true;
      }),
    });
    await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(calls).toEqual(["confirm", "consume"]);
  });

  it("replay/concorrência não duplica efeitos colaterais", async () => {
    const deps = makeDeps();
    const [a, b] = await Promise.all([
      confirmAndConsume(deps, { codeId: "c1", userId: "u1" }),
      confirmAndConsume(deps, { codeId: "c1", userId: "u1" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const consumedFlags = [a, b].map((r) => (r.ok ? r.consumed : null));
    expect(consumedFlags.filter(Boolean)).toHaveLength(1);
    expect(deps.ensureProducerWorkspace).toHaveBeenCalledTimes(1);
    // Ambas as respostas são idênticas para o cliente (idempotência).
    expect(a.ok && a.accountType).toBe("PRODUCER");
    expect(b.ok && b.accountType).toBe("PRODUCER");
  });

  it("membro do Circles nunca gera workspace", async () => {
    const deps = makeDeps({ getAccountType: vi.fn(async () => "MEMBER" as const) });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toMatchObject({ ok: true, accountType: "MEMBER", workspaceEnsured: false });
    expect(deps.ensureProducerWorkspace).not.toHaveBeenCalled();
  });
});
