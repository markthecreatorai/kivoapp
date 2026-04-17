// =============================================================
// productDraftService — testes unitários
//
// Cobre:
//   • lock in-memory: cliques concorrentes compartilham promise
//   • recovery key: reaproveita id após "falha" entre create+navegação
//   • limpeza de recovery stale (TTL expirado)
//   • limpeza de recovery quando o id não existe mais no DB
//   • metadata, slug e price default são gerados corretamente
// =============================================================

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock do supabase client ──────────────────────────────────
type Row = { id: string };
const insertMock = vi.fn();
const selectAfterInsertMock = vi.fn();
const singleAfterInsertMock = vi.fn();

const productsSelectEqMaybeMock = vi.fn();

const fromMock = vi.fn((table: string) => {
  if (table === "products") {
    return {
      // path do recovery: select(id).eq(id, x).maybeSingle()
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          maybeSingle: productsSelectEqMaybeMock,
        }),
      }),
      // path do create: insert(...).select("id").single()
      insert: (payload: Record<string, unknown>) => {
        insertMock(payload);
        return {
          select: (cols: string) => {
            selectAfterInsertMock(cols);
            return { single: singleAfterInsertMock };
          },
        };
      },
    };
  }
  if (table === "prices") {
    return {
      insert: (p: Record<string, unknown>) => {
        pricesInsertMock(p);
        return Promise.resolve({ error: null });
      },
    };
  }
  throw new Error(`Mock from(${table}) não definido`);
});

const pricesInsertMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (t: string) => fromMock(t) },
}));

// ── Imports SOMENTE depois dos mocks ─────────────────────────
import {
  __resetDraftServiceLocks,
  clearDraftRecovery,
  createProductDraft,
  type CreateDraftInput,
} from "@/features/product-editor/productDraftService";

const baseInput: CreateDraftInput = {
  workspaceId: "ws-1",
  format: { id: "collect_emails", dbType: "LEAD_MAGNET" },
};

beforeEach(() => {
  insertMock.mockReset();
  selectAfterInsertMock.mockReset();
  singleAfterInsertMock.mockReset();
  productsSelectEqMaybeMock.mockReset();
  pricesInsertMock.mockReset();
  fromMock.mockClear();
  __resetDraftServiceLocks();
  globalThis.sessionStorage?.clear();
});

afterEach(() => {
  clearDraftRecovery(baseInput);
});

describe("productDraftService — caminho feliz", () => {
  it("cria draft, retorna id e persiste recovery key", async () => {
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });
    singleAfterInsertMock.mockResolvedValue({
      data: { id: "p-new" } as Row,
      error: null,
    });

    const res = await createProductDraft(baseInput);

    expect(res).toEqual({ productId: "p-new", reused: false });

    // payload correto
    expect(insertMock).toHaveBeenCalledTimes(1);
    const payload = insertMock.mock.calls[0][0] as any;
    expect(payload.workspace_id).toBe("ws-1");
    expect(payload.type).toBe("LEAD_MAGNET");
    expect(payload.status).toBe("DRAFT");
    expect(payload.metadata.format_id).toBe("collect_emails");
    expect(payload.slug).toMatch(/^novo-produto-/);

    // preço default
    expect(pricesInsertMock).toHaveBeenCalledTimes(1);

    // recovery key escrita
    const raw = sessionStorage.getItem(
      "kivo:draft-recovery:ws-1:collect_emails",
    );
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).productId).toBe("p-new");
  });

  it("status = PUBLISHED quando publishImmediately", async () => {
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });
    singleAfterInsertMock.mockResolvedValue({
      data: { id: "p-aff" },
      error: null,
    });

    await createProductDraft({
      workspaceId: "ws-1",
      format: {
        id: "affiliate",
        dbType: "DIGITAL",
        publishImmediately: true,
        defaultName: "Link de Afiliado Kivo",
        extraMetadata: { referral_link: "https://x/?ref=abc" },
      },
    });

    const payload = insertMock.mock.calls[0][0] as any;
    expect(payload.status).toBe("PUBLISHED");
    expect(payload.name).toBe("Link de Afiliado Kivo");
    expect(payload.metadata.referral_link).toBe("https://x/?ref=abc");
  });
});

describe("productDraftService — idempotência (concorrência)", () => {
  it("cliques concorrentes compartilham a mesma promise (1 INSERT)", async () => {
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });

    let resolveInsert!: (v: unknown) => void;
    singleAfterInsertMock.mockReturnValue(
      new Promise((r) => {
        resolveInsert = r;
      }),
    );

    const p1 = createProductDraft(baseInput);
    const p2 = createProductDraft(baseInput);
    const p3 = createProductDraft(baseInput);

    expect(insertMock).toHaveBeenCalledTimes(1);

    resolveInsert({ data: { id: "p-shared" }, error: null });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.productId).toBe("p-shared");
    expect(r2.productId).toBe("p-shared");
    expect(r3.productId).toBe("p-shared");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("workspaces ou formats diferentes NÃO compartilham lock", async () => {
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });
    singleAfterInsertMock
      .mockResolvedValueOnce({ data: { id: "a" }, error: null })
      .mockResolvedValueOnce({ data: { id: "b" }, error: null });

    const r1 = await createProductDraft(baseInput);
    const r2 = await createProductDraft({
      ...baseInput,
      format: { id: "course", dbType: "COURSE" },
    });

    expect(r1.productId).toBe("a");
    expect(r2.productId).toBe("b");
    expect(insertMock).toHaveBeenCalledTimes(2);
  });
});

describe("productDraftService — recovery key", () => {
  it("reaproveita id existente quando recovery está fresco e produto existe", async () => {
    sessionStorage.setItem(
      "kivo:draft-recovery:ws-1:collect_emails",
      JSON.stringify({ productId: "p-recovered", ts: Date.now() }),
    );
    productsSelectEqMaybeMock.mockResolvedValue({
      data: { id: "p-recovered" },
      error: null,
    });

    const res = await createProductDraft(baseInput);

    expect(res).toEqual({ productId: "p-recovered", reused: true });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("ignora recovery quando o produto não existe mais no DB", async () => {
    sessionStorage.setItem(
      "kivo:draft-recovery:ws-1:collect_emails",
      JSON.stringify({ productId: "p-gone", ts: Date.now() }),
    );
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });
    singleAfterInsertMock.mockResolvedValue({
      data: { id: "p-fresh" },
      error: null,
    });

    const res = await createProductDraft(baseInput);

    expect(res).toEqual({ productId: "p-fresh", reused: false });
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("ignora recovery expirado (TTL > 30s)", async () => {
    sessionStorage.setItem(
      "kivo:draft-recovery:ws-1:collect_emails",
      JSON.stringify({ productId: "p-old", ts: Date.now() - 60_000 }),
    );
    singleAfterInsertMock.mockResolvedValue({
      data: { id: "p-fresh" },
      error: null,
    });

    const res = await createProductDraft(baseInput);

    expect(res).toEqual({ productId: "p-fresh", reused: false });
    // recovery NÃO foi consultado no DB porque já expirou no client
    expect(productsSelectEqMaybeMock).not.toHaveBeenCalled();
  });
});

describe("productDraftService — erros", () => {
  it("propaga erro de insert e libera o lock para retry", async () => {
    productsSelectEqMaybeMock.mockResolvedValue({ data: null, error: null });
    singleAfterInsertMock
      .mockResolvedValueOnce({ data: null, error: new Error("DB down") })
      .mockResolvedValueOnce({ data: { id: "p-after-retry" }, error: null });

    await expect(createProductDraft(baseInput)).rejects.toThrow("DB down");

    // novo clique deve funcionar (lock foi liberado no finally)
    const res = await createProductDraft(baseInput);
    expect(res.productId).toBe("p-after-retry");
  });
});
