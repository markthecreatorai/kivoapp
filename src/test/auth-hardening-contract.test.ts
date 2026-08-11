import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const REQUEST = readFileSync("supabase/functions/auth-request-code/index.ts", "utf-8");
const VERIFY = readFileSync("supabase/functions/auth-verify-code/index.ts", "utf-8");
const MODAL = readFileSync("src/components/auth/EmailCodeVerificationModal.tsx", "utf-8");

describe("auth-request-code — retomada de cadastro pendente (server-side)", () => {
  it("faz upsert de public.user_account_types na retomada", () => {
    expect(REQUEST).toMatch(/from\("user_account_types"\)[\s\S]*\.upsert\(/);
    expect(REQUEST).toMatch(/account_type: isCreator \? "PRODUCER" : "MEMBER"/);
    expect(REQUEST).toContain('onConflict: "user_id"');
  });

  it("trata erro do upsert ANTES de emitir o código", () => {
    const upsertAt = REQUEST.indexOf('from("user_account_types")');
    const errAt = REQUEST.indexOf("account type sync failed");
    const codeAt = REQUEST.indexOf("const code = generateCode()");
    expect(upsertAt).toBeGreaterThan(0);
    expect(errAt).toBeGreaterThan(upsertAt);
    expect(errAt).toBeLessThan(codeAt);
  });

  it("a sincronização só ocorre no ramo mode === signup de conta não confirmada", () => {
    // O bloco de sync vive dentro do `else if (mode === "signup")`, após o
    // early-return de conta já confirmada.
    const confirmedReturn = REQUEST.indexOf("if (user?.email_confirmed_at)");
    const signupBranch = REQUEST.indexOf('} else if (mode === "signup")');
    const upsertAt = REQUEST.indexOf('from("user_account_types")');
    expect(confirmedReturn).toBeLessThan(signupBranch);
    expect(signupBranch).toBeLessThan(upsertAt);
  });
});

describe("auth-verify-code — consumo e account type explícitos", () => {
  it("distingue consumed / already_consumed / error no consumo", () => {
    expect(VERIFY).toContain('return "error"');
    expect(VERIFY).toContain('return data ? "consumed" : "already_consumed"');
  });

  it("account type ausente ou com erro retorna falha segura", () => {
    expect(VERIFY).toContain('return { ok: false, reason: "error" }');
    expect(VERIFY).toContain('return { ok: false, reason: "missing" }');
  });
});

describe("superfícies de cadastro — ausência de magic link / OTP nativo", () => {
  it("nenhuma edge function de código usa OTP ou resend nativo", () => {
    const stripComments = (src: string) =>
      src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    for (const src of [REQUEST, VERIFY]) {
      expect(stripComments(src)).not.toMatch(/signInWithOtp|generateLink|auth\.resend\(/);
    }
  });

  it("o modal declara explicitamente que não envia links", () => {
    expect(MODAL).toContain("Não enviamos links de acesso por e-mail");
    expect(MODAL).not.toMatch(/signInWithOtp|magic/i);
  });

  it("o modal tem botão acessível de confirmar usado no retry", () => {
    expect(MODAL).toContain("Confirmar código");
    expect(MODAL).toContain("onClick={handleConfirm}");
    expect(MODAL).toContain("disabled={code.length !== CODE_LENGTH || status !== \"idle\"}");
    expect(MODAL).toContain('Toque em "Confirmar código" novamente');
  });
});
