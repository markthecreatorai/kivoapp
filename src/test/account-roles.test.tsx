import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signInWithOtp: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signUp: mocks.signUp,
      signInWithOtp: mocks.signInWithOtp,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  },
}));

import MemberLogin from "@/pages/MemberLogin";
import { resolveSmartRedirect, isConsumerOnly } from "@/lib/smartRedirect";

function mockTables(tables: Record<string, any[]>, accountType?: string | null) {
  mocks.from.mockImplementation((table: string) => {
    if (table === "user_account_types") {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: accountType ? { account_type: accountType } : null,
              error: null,
            }),
          }),
        }),
      };
    }
    const builder: any = {
      select: () => builder,
      limit: () => builder,
      eq: () => builder,
      then: (resolve: any) => resolve({ data: tables[table] ?? [] }),
    };
    return builder;
  });
}

describe("MemberLogin — cadastro de membro", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTables({});
  });

  it("expõe uma aba de criar conta", () => {
    render(
      <MemoryRouter initialEntries={["/member/login"]}>
        <MemberLogin />
      </MemoryRouter>
    );
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
});

describe("smartRedirect — separação de papéis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("MEMBER com comunidade ativa vai para /circles", async () => {
    mockTables({ community_members: [{ id: "1" }] }, "MEMBER");
    expect(await resolveSmartRedirect("u1")).toBe("/circles");
  });

  it("MEMBER sem nada cai em explore, nunca no dashboard", async () => {
    mockTables({}, "MEMBER");
    expect(await resolveSmartRedirect("u1")).toBe("/circles/explore");
  });

  it("PRODUCER com workspace vai para /dashboard", async () => {
    mockTables({ workspace_members: [{ id: "w" }] }, "PRODUCER");
    expect(await resolveSmartRedirect("u1")).toBe("/dashboard");
  });

  it("conta legada sem account_type usa inferência por workspace", async () => {
    mockTables({ workspace_members: [{ id: "w" }] }, null);
    expect(await resolveSmartRedirect("u1")).toBe("/dashboard");
  });

  it("nav intent de comunidade tem prioridade máxima", async () => {
    mockTables({ workspace_members: [{ id: "w" }] }, "PRODUCER");
    sessionStorage.setItem(
      "kivo_nav_intent",
      JSON.stringify({ origin: "community", community_slug: "abc" })
    );
    expect(await resolveSmartRedirect("u1")).toBe("/circles/abc/feed");
  });

  it("MEMBER é consumidor mesmo sem comunidade ainda", async () => {
    mockTables({}, "MEMBER");
    expect(await isConsumerOnly("u1")).toBe(true);
  });

  it("quem tem workspace nunca é tratado como consumidor (papéis coexistem)", async () => {
    mockTables({ workspace_members: [{ id: "w" }], community_members: [{ id: "c" }] }, "PRODUCER");
    expect(await isConsumerOnly("u1")).toBe(false);
  });
});
