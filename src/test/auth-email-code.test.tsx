import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  requestVerificationCode: vi.fn(),
  verifyEmailCode: vi.fn(),
  signInAfterVerification: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
    },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock("@/lib/authVerification", async () => {
  const actual = await vi.importActual<any>("@/lib/authVerification");
  return {
    ...actual,
    requestVerificationCode: mocks.requestVerificationCode,
    verifyEmailCode: mocks.verifyEmailCode,
    signInAfterVerification: mocks.signInAfterVerification,
  };
});

import MemberLogin from "@/pages/MemberLogin";
import EmailCodeVerificationModal from "@/components/auth/EmailCodeVerificationModal";
import { sanitizeReturnTarget } from "@/lib/authVerification";

function typeInto(placeholder: string, value: string) {
  const input = screen.getAllByPlaceholderText(placeholder)[0] as HTMLInputElement;
  fireEvent.change(input, { target: { value } });
}

describe("sanitizeReturnTarget — proteção contra open redirect", () => {
  it("aceita apenas caminhos internos", () => {
    expect(sanitizeReturnTarget("/circles/abc/feed")).toBe("/circles/abc/feed");
  });
  it("rejeita URLs absolutas e protocol-relative", () => {
    expect(sanitizeReturnTarget("https://evil.com")).toBeNull();
    expect(sanitizeReturnTarget("//evil.com")).toBeNull();
    expect(sanitizeReturnTarget("/\\evil.com")).toBeNull();
  });
  it("rejeita vazio", () => {
    expect(sanitizeReturnTarget(null)).toBeNull();
  });
});

describe("MemberLogin — cadastro de membro com código de 4 dígitos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mocks.requestVerificationCode.mockResolvedValue({ kind: "code_sent", cooldownSeconds: 60 });
  });

  it("não oferece nenhum caminho de magic link", () => {
    render(
      <MemoryRouter initialEntries={["/member/login"]}>
        <MemberLogin />
      </MemoryRouter>
    );
    expect(screen.queryByText(/link de acesso|magic link/i)).toBeNull();
    expect(screen.getByRole("tab", { name: /criar conta/i })).toBeTruthy();
  });

  it("pré-preenche o email vindo da query", () => {
    render(
      <MemoryRouter initialEntries={["/member/login?email=alu%40no.com&redirect=/join/abc"]}>
        <MemberLogin />
      </MemoryRouter>
    );
    const inputs = screen.getAllByPlaceholderText("seu@email.com") as HTMLInputElement[];
    expect(inputs[0].value).toBe("alu@no.com");
  });

  it("recusa senha com menos de 8 caracteres antes de chamar o backend", async () => {
    render(
      <MemoryRouter initialEntries={["/member/login"]}>
        <MemberLogin />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("tab", { name: /criar conta/i }));
    typeInto("seu@email.com", "novo@membro.com");
    typeInto("Mínimo 8 caracteres", "123");
    fireEvent.click(screen.getByRole("button", { name: /criar conta de membro/i }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(mocks.requestVerificationCode).not.toHaveBeenCalled();
  });

  it("dispara o código e abre o modal de 4 dígitos", async () => {
    render(
      <MemoryRouter initialEntries={["/member/login?redirect=/circles/abc/feed"]}>
        <MemberLogin />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole("tab", { name: /criar conta/i }));
    typeInto("seu@email.com", "novo@membro.com");
    typeInto("Mínimo 8 caracteres", "senhaforte1");
    fireEvent.click(screen.getByRole("button", { name: /criar conta de membro/i }));

    await waitFor(() => expect(mocks.requestVerificationCode).toHaveBeenCalledTimes(1));
    const args = mocks.requestVerificationCode.mock.calls[0][0];
    expect(args.accountType).toBe("MEMBER");
    expect(args.flowOrigin).toBe("circles");
    expect(args.returnTarget).toBe("/circles/abc/feed");
    // Contexto persistido sem senha nem código
    const pending = JSON.parse(sessionStorage.getItem("kivo_pending_verification") || "{}");
    expect(pending.email).toBe("novo@membro.com");
    expect(pending.password).toBeUndefined();
  });

  it("login existente não confirmado é bloqueado", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { email_confirmed_at: null } }, error: null });
    render(
      <MemoryRouter initialEntries={["/member/login"]}>
        <MemberLogin />
      </MemoryRouter>
    );
    typeInto("seu@email.com", "membro@teste.com");
    typeInto("••••••••", "senhaforte1");
    fireEvent.click(screen.getByRole("button", { name: /^entrar$/i }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/não foi confirmada/i));
    expect(mocks.signOut).toHaveBeenCalled();
  });
});

describe("EmailCodeVerificationModal", () => {
  const baseProps = {
    open: true,
    email: "membro@teste.com",
    accountType: "MEMBER" as const,
    flowOrigin: "circles" as const,
    returnTarget: "/circles/abc/feed",
    onUseAnotherEmail: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const fillCode = (code: string) => {
    const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
    code.split("").forEach((d, i) => fireEvent.change(inputs[i], { target: { value: d } }));
  };

  it("renderiza exatamente 4 campos", () => {
    render(<EmailCodeVerificationModal {...baseProps} onVerified={vi.fn()} />);
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
  });

  it("verifica automaticamente ao completar o código", async () => {
    const onVerified = vi.fn();
    mocks.verifyEmailCode.mockResolvedValue({ kind: "verified", next: "/circles/abc/feed" });
    render(<EmailCodeVerificationModal {...baseProps} onVerified={onVerified} />);
    fillCode("1234");
    await waitFor(() => expect(mocks.verifyEmailCode).toHaveBeenCalled());
    await waitFor(() => expect(onVerified).toHaveBeenCalledWith({ kind: "verified", next: "/circles/abc/feed" }));
  });

  it("mostra erro em código inválido e não confirma", async () => {
    const onVerified = vi.fn();
    mocks.verifyEmailCode.mockResolvedValue({ kind: "invalid_code", attemptsLeft: 4 });
    render(<EmailCodeVerificationModal {...baseProps} onVerified={onVerified} />);
    fillCode("9999");
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(onVerified).not.toHaveBeenCalled();
  });

  it("mostra mensagem específica para código expirado", async () => {
    mocks.verifyEmailCode.mockResolvedValue({ kind: "expired" });
    render(<EmailCodeVerificationModal {...baseProps} onVerified={vi.fn()} />);
    fillCode("1111");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/expir/i));
  });

  it("bloqueia após exceder tentativas", async () => {
    mocks.verifyEmailCode.mockResolvedValue({ kind: "too_many_attempts" });
    render(<EmailCodeVerificationModal {...baseProps} onVerified={vi.fn()} />);
    fillCode("2222");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/tentativas/i));
  });

  it("reenvia o código respeitando o cooldown", async () => {
    mocks.requestVerificationCode.mockResolvedValue({ kind: "code_sent", cooldownSeconds: 60 });
    render(<EmailCodeVerificationModal {...baseProps} onVerified={vi.fn()} initialCooldown={0} />);
    const resend = screen.getByRole("button", { name: /reenviar/i });
    fireEvent.click(resend);
    await waitFor(() => expect(mocks.requestVerificationCode).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((resend as HTMLButtonElement).disabled).toBe(true));
  });
});
