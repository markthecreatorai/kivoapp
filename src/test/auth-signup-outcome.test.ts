import { describe, it, expect } from "vitest";
import { resolveAuthSignupOutcome } from "@/lib/authSignupOutcome";

describe("resolveAuthSignupOutcome", () => {
  it("a) novo usuário pendente de verificação → success_pending_verification", () => {
    const r = resolveAuthSignupOutcome({
      data: {
        user: {
          id: "u1",
          email: "novo@gmail.com",
          identities: [{ id: "id1" }],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    });
    expect(r.kind).toBe("success_pending_verification");
    expect(r.userId).toBe("u1");
  });

  it("b) email já cadastrado e CONFIRMADO (anti-enumeração: identities=[]) → already_registered_confirmed", () => {
    const r = resolveAuthSignupOutcome({
      data: {
        user: {
          id: "u-existing",
          email: "markthecreatorai@gmail.com",
          identities: [],
          email_confirmed_at: "2025-01-01T00:00:00Z",
        },
        session: null,
      },
      error: null,
    });
    expect(r.kind).toBe("already_registered_confirmed");
    expect(r.message).toMatch(/já está cadastrado/i);
  });

  it("c) email já cadastrado NÃO confirmado → already_registered_unconfirmed", () => {
    const r = resolveAuthSignupOutcome({
      data: {
        user: {
          id: "u-pending",
          email: "pendente@gmail.com",
          identities: [],
          email_confirmed_at: null,
        },
        session: null,
      },
      error: null,
    });
    expect(r.kind).toBe("already_registered_unconfirmed");
    expect(r.message).toMatch(/reenv/i);
  });

  it("d) erro explícito 'User already registered' → already_registered_confirmed", () => {
    const r = resolveAuthSignupOutcome({
      data: null,
      error: { message: "User already registered" },
    });
    expect(r.kind).toBe("already_registered_confirmed");
  });

  it("e) erro 'Invalid email' → invalid_email", () => {
    const r = resolveAuthSignupOutcome({
      data: null,
      error: { message: "Unable to validate email address: invalid format" },
    });
    expect(r.kind).toBe("invalid_email");
  });

  it("f) erro genérico → generic_error", () => {
    const r = resolveAuthSignupOutcome({
      data: null,
      error: { message: "Network failure" },
    });
    expect(r.kind).toBe("generic_error");
  });

  it("g) sucesso com sessão imediata (sem confirmação) → success_active", () => {
    const r = resolveAuthSignupOutcome({
      data: {
        user: {
          id: "u2",
          email: "x@dominio.com",
          identities: [{ id: "id2" }],
          email_confirmed_at: "2025-01-01T00:00:00Z",
        },
        session: { access_token: "tok" },
      },
      error: null,
    });
    expect(r.kind).toBe("success_active");
  });

  it("h) sem user e sem error → generic_error", () => {
    const r = resolveAuthSignupOutcome({ data: { user: null, session: null }, error: null });
    expect(r.kind).toBe("generic_error");
  });
});
