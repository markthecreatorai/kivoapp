/**
 * QA Onda 1 — Fundamentos: rotas, autenticação e onboarding.
 * Contratos de regressão (RT / AU / ON). Nenhum efeito externo: só código-fonte
 * e funções puras. Não cria usuário, não envia e-mail, não toca no banco.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { sanitizeReturnTarget } from "@/lib/authVerification";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("RT-OPENREDIRECT — destino de retorno sempre sanitizado", () => {
  const hostileTargets = [
    "//evil.com",
    "///evil.com",
    "https://evil.com",
    "http://evil.com/login",
    "javascript:alert(1)",
    "/\\evil.com",
    "\\\\evil.com",
    "evil.com",
    "mailto:a@b.com",
  ];

  hostileTargets.forEach((target) => {
    it(`rejeita destino externo: ${target}`, () => {
      expect(sanitizeReturnTarget(target)).toBeNull();
    });
  });

  it("aceita caminhos internos", () => {
    expect(sanitizeReturnTarget("/dashboard")).toBe("/dashboard");
    expect(sanitizeReturnTarget("/circles/abc/feed?x=1")).toBe("/circles/abc/feed?x=1");
  });

  it("rejeita nulo/vazio e caminhos absurdamente longos", () => {
    expect(sanitizeReturnTarget(null)).toBeNull();
    expect(sanitizeReturnTarget("")).toBeNull();
    expect(sanitizeReturnTarget("/" + "a".repeat(600))).toBeNull();
  });

  const authPages = [
    "src/pages/Login.tsx",
    "src/pages/MemberLogin.tsx",
    "src/pages/AuthCallback.tsx",
    "src/pages/VerifyEmail.tsx",
  ];

  authPages.forEach((page) => {
    it(`${page} não usa o parâmetro redirect sem sanitizar`, () => {
      const src = read(page);
      const raws = src.match(/searchParams\.get\("redirect"\)/g) ?? [];
      const sanitized = src.match(/sanitizeReturnTarget\(\s*searchParams\.get\("redirect"\)\s*\)/g) ?? [];
      expect(sanitized.length).toBe(raws.length);
      expect(raws.length).toBeGreaterThan(0);
    });
  });
});

describe("RT-GUARDS — rotas de criador protegidas e 404 registrado", () => {
  const app = read("src/App.tsx");

  it("registra rota catch-all para 404", () => {
    expect(app).toMatch(/path="\*"/);
  });

  it("rotas de criador ficam sob ProtectedRoute", () => {
    ["/store/editor", "/products/:id/course-builder", "/billing/upgrade-flow"].forEach((p) => {
      const line = app.split("\n").find((l) => l.includes(`path="${p}"`));
      expect(line, `rota ${p} ausente`).toBeTruthy();
      expect(line).toContain("ProtectedRoute");
    });
  });

  it("área administrativa exige ProtectedRoute + AdminRoute", () => {
    expect(app).toContain("<AdminRoute>");
    const adminBlock = app.slice(app.indexOf("<AdminRoute>") - 400, app.indexOf("<AdminRoute>"));
    expect(adminBlock).toContain("<ProtectedRoute>");
  });

  it("/login é pública (sem guard) e /onboarding não exige workspace", () => {
    const loginLine = app.split("\n").find((l) => l.includes('path="/login"'))!;
    expect(loginLine).not.toContain("ProtectedRoute");
    expect(app).toContain("requireWorkspace={false}");
  });
});

describe("AU-GUARD — ProtectedRoute mantém a ordem segura de decisão", () => {
  const guard = read("src/components/ProtectedRoute.tsx");

  it("sem sessão vai para /login preservando a origem", () => {
    expect(guard).toMatch(/if \(!user\)/);
    expect(guard).toContain('to="/login"');
    expect(guard).toContain("state={{ from: location }}");
  });

  it("e-mail não confirmado vai para /verify-email", () => {
    expect(guard).toContain('to="/verify-email"');
    expect(guard).toContain("email_confirmed_at");
  });

  it("não redireciona para onboarding enquanto carrega ou em erro de fetch", () => {
    expect(guard).toContain("!workspaceLoading && !fetchError && !currentWorkspace");
  });

  it("consumidor (MEMBER) recebe upgrade prompt, nunca o onboarding de criador", () => {
    expect(guard).toContain("consumerCheck.isConsumer");
    expect(guard).toContain("<ProducerUpgradePrompt />");
  });
});

describe("AU-SESSION — AuthProvider não força navegação em rotas donas do fluxo", () => {
  const provider = read("src/contexts/AuthProvider.tsx");

  it("SIGNED_OUT devolve o usuário ao login", () => {
    expect(provider).toContain('_event === "SIGNED_OUT"');
    expect(provider).toContain('navigate("/login")');
  });

  it("respeita as rotas que controlam o próprio pós-login", () => {
    ["/join", "/member/login", "/auth/callback"].forEach((p) => {
      expect(provider).toContain(`"${p}"`);
    });
  });

  it("limpa a inscrição do listener no unmount (sem leak de sessão)", () => {
    expect(provider).toContain("subscription.unsubscribe()");
  });
});

describe("AU-OTP — verificação inicial só por código próprio de 4 dígitos", () => {
  const authPages = ["src/pages/Login.tsx", "src/pages/MemberLogin.tsx", "src/pages/Signup.tsx"];

  authPages.forEach((page) => {
    it(`${page} não usa magic link nem OTP do Supabase`, () => {
      const src = read(page);
      expect(src).not.toContain("signInWithOtp");
      expect(src).not.toContain("magiclink");
      expect(src).not.toContain("magic_link");
    });
  });

  it("ResetPassword exige contexto de recuperação e usa updateUser", () => {
    const src = read("src/pages/ResetPassword.tsx");
    expect(src).toContain("recovery");
    expect(src).toContain("supabase.auth.updateUser");
  });

  it("ForgotPassword aponta o retorno para a própria rota /reset-password", () => {
    const src = read("src/pages/ForgotPassword.tsx");
    expect(src).toContain("resetPasswordForEmail");
    expect(src).toMatch(/window\.location\.origin\}\/reset-password/);
  });
});

describe("ON-ROLES — separação produtor vs membro no destino inicial", () => {
  const smart = read("src/lib/smartRedirect.ts");

  it("MEMBER nunca é levado ao dashboard de criador", () => {
    const memberBlock = smart.slice(
      smart.indexOf('accountType === "MEMBER"'),
      smart.indexOf('accountType === "PRODUCER"')
    );
    expect(memberBlock).not.toContain("/dashboard");
    expect(memberBlock).toContain("/circles");
  });

  it("conta híbrida (com workspace) não é tratada como consumidora", () => {
    const consumerBlock = smart.slice(smart.indexOf("export async function isConsumerOnly"));
    expect(consumerBlock).toMatch(/workspace_members[\s\S]*return false/);
  });

  it("Onboarding sai de cena assim que existe workspace", () => {
    const onboarding = read("src/pages/Onboarding.tsx");
    expect(onboarding).toContain('navigate("/dashboard", { replace: true })');
  });
});
