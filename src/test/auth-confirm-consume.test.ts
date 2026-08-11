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
      if (consumed) return "already_consumed" as const;
      consumed = true;
      return "consumed" as const;
    }),
    getAccountType: vi.fn(async () => ({ ok: true as const, accountType: "PRODUCER" as const })),
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

  it("todas as pré-condições rodam ANTES do consumo (ordem das operações)", async () => {
    const calls: string[] = [];
    const deps = makeDeps({
      confirmUser: vi.fn(async () => {
        calls.push("confirm");
        return { error: null };
      }),
      getAccountType: vi.fn(async () => {
        calls.push("account-type");
        return { ok: true as const, accountType: "PRODUCER" as const };
      }),
      ensureProducerWorkspace: vi.fn(async () => {
        calls.push("workspace");
        return { error: null };
      }),
      consumeCode: vi.fn(async () => {
        calls.push("consume");
        return "consumed" as const;
      }),
    });
    await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(calls).toEqual(["confirm", "account-type", "workspace", "consume"]);
  });

  it("erro no consumo retorna 503 retry e nunca sucesso", async () => {
    const deps = makeDeps({ consumeCode: vi.fn(async () => "error" as const) });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toEqual({ ok: false, status: 503, reason: "temporarily_unavailable" });
  });

  it("replay (already_consumed) responde 200 sem duplicar efeitos", async () => {
    const deps = makeDeps({ consumeCode: vi.fn(async () => "already_consumed" as const) });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toMatchObject({ ok: true, consumed: false, accountType: "PRODUCER" });
  });

  it("erro ao ler account type => retry, sem consumo e sem downgrade para MEMBER", async () => {
    const deps = makeDeps({
      getAccountType: vi.fn(async () => ({ ok: false as const, reason: "error" as const })),
    });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toEqual({ ok: false, status: 503, reason: "temporarily_unavailable" });
    expect(deps.consumeCode).not.toHaveBeenCalled();
    expect(deps.ensureProducerWorkspace).not.toHaveBeenCalled();
  });

  it("linha de account type ausente => retry, nunca MEMBER silencioso", async () => {
    const deps = makeDeps({
      getAccountType: vi.fn(async () => ({ ok: false as const, reason: "missing" as const })),
    });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toEqual({ ok: false, status: 503, reason: "temporarily_unavailable" });
    expect(deps.consumeCode).not.toHaveBeenCalled();
  });

  it("falha ao garantir workspace => 503 e código AINDA utilizável", async () => {
    let fail = true;
    const deps = makeDeps({
      ensureProducerWorkspace: vi.fn(async () => (fail ? { error: { message: "deadlock" } } : { error: null })),
    });
    const first = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(first).toEqual({ ok: false, status: 503, reason: "temporarily_unavailable" });
    expect(deps.consumeCode).not.toHaveBeenCalled();

    fail = false;
    const retry = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(retry).toMatchObject({ ok: true, consumed: true, workspaceEnsured: true });
    expect(deps.consumeCode).toHaveBeenCalledTimes(1);
  });

  it("replay/concorrência não duplica o consumo", async () => {
    const deps = makeDeps();
    const [a, b] = await Promise.all([
      confirmAndConsume(deps, { codeId: "c1", userId: "u1" }),
      confirmAndConsume(deps, { codeId: "c1", userId: "u1" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const consumedFlags = [a, b].map((r) => (r.ok ? r.consumed : null));
    expect(consumedFlags.filter(Boolean)).toHaveLength(1);
    // Ambas as respostas são idênticas para o cliente (idempotência).
    expect(a.ok && a.accountType).toBe("PRODUCER");
    expect(b.ok && b.accountType).toBe("PRODUCER");
  });

  it("membro do Circles nunca gera workspace", async () => {
    const deps = makeDeps({
      getAccountType: vi.fn(async () => ({ ok: true as const, accountType: "MEMBER" as const })),
    });
    const out = await confirmAndConsume(deps, { codeId: "c1", userId: "u1" });
    expect(out).toMatchObject({ ok: true, accountType: "MEMBER", workspaceEnsured: false });
    expect(deps.ensureProducerWorkspace).not.toHaveBeenCalled();
  });
});
