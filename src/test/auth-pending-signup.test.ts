import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { requestVerificationCode, verifyEmailCode } from "@/lib/authVerification";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

const okJson = (body: unknown, status = 200) =>
  Promise.resolve({ status, json: () => Promise.resolve(body) } as unknown as Response);

describe("requestVerificationCode — retomada de cadastro pendente", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => okJson({ status: "code_sent", cooldown_seconds: 60 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("envia a senha nova em mode=signup para sincronizar o cadastro pendente", async () => {
    const res = await requestVerificationCode({
      email: "Novo@Kivo.dev",
      password: "senha-nova-123",
      fullName: "Teste",
      accountType: "CREATOR",
      flowOrigin: "producer",
      returnTarget: "/onboarding",
      mode: "signup",
    });
    expect(res).toEqual({ kind: "code_sent", cooldownSeconds: 60 });
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.mode).toBe("signup");
    expect(body.password).toBe("senha-nova-123");
    expect(body.account_type).toBe("CREATOR");
    expect(body.return_target).toBe("/onboarding");
  });

  it("não envia senha em mode=resend", async () => {
    await requestVerificationCode({
      email: "novo@kivo.dev",
      accountType: "MEMBER",
      flowOrigin: "circles",
      mode: "resend",
    });
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.mode).toBe("resend");
    expect(body.password).toBeUndefined();
  });

  it("bloqueia return_target externo (open redirect)", async () => {
    await requestVerificationCode({
      email: "novo@kivo.dev",
      password: "senha-nova-123",
      accountType: "MEMBER",
      flowOrigin: "circles",
      returnTarget: "https://evil.com",
    });
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.return_target).toBeNull();
  });
});

describe("verifyEmailCode — falha transitória é recuperável", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mapeia temporarily_unavailable para kind retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => okJson({ ok: false, reason: "temporarily_unavailable" }, 503)),
    );
    expect(await verifyEmailCode("novo@kivo.dev", "1234")).toEqual({ kind: "retry" });
  });

  it("mapeia sucesso preservando account_type e next validado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => okJson({ ok: true, account_type: "PRODUCER", next: "//evil.com" })),
    );
    expect(await verifyEmailCode("novo@kivo.dev", "1234")).toEqual({
      kind: "verified",
      accountType: "PRODUCER",
      next: null,
    });
  });
});

describe("superfícies de cadastro — sem magic link / OTP nativo", () => {
  const files = [
    "src/pages/Signup.tsx",
    "src/pages/MemberLogin.tsx",
    "src/pages/VerifyEmail.tsx",
    "src/hooks/useJoinCommunity.ts",
    "src/lib/authVerification.ts",
    "src/components/auth/EmailCodeVerificationModal.tsx",
  ];

  it.each(files)("%s não usa signInWithOtp nem resend nativo", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/signInWithOtp/);
    expect(src).not.toMatch(/auth\.resend\s*\(/);
    expect(src).not.toMatch(/emailRedirectTo/);
  });

  it("preserva apenas o link de recuperação de senha", () => {
    const forgot = readFileSync("src/pages/ForgotPassword.tsx", "utf8");
    expect(forgot).toMatch(/resetPasswordForEmail/);
  });
});
