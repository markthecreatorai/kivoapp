import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  handleRefundCompleted,
  handleRefundInProgress,
  parseRefundItems,
} from "../../supabase/functions/_shared/refunds.ts";

const webhook = readFileSync(
  resolve(process.cwd(), "supabase/functions/webhook-asaas/index.ts"),
  "utf-8",
);
const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260811074500_process_refund_increment_atomic.sql"),
  "utf-8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Fake Supabase: registra TODAS as escritas para provar ausência de efeito
// colateral, e simula a RPC atômica (acumulando refunds como o banco faria).
// ─────────────────────────────────────────────────────────────────────────────
type Persisted = { gateway_refund_id: string; cents: number };

function makeClient(opts: {
  persisted?: Persisted[];
  chargeCents: number;
  failOnRefundId?: string;
  loadError?: string;
}) {
  const persisted: Persisted[] = [...(opts.persisted ?? [])];
  const writes: { table: string; op: string }[] = [];
  const rpcCalls: any[] = [];

  const client: any = {
    from(table: string) {
      const chain: any = {
        select: () => chain,
        insert: (v: unknown) => {
          writes.push({ table, op: "insert" });
          return chain;
        },
        update: (v: unknown) => {
          writes.push({ table, op: "update" });
          return chain;
        },
        eq: () => chain,
        in: () => chain,
        maybeSingle: async () => ({ data: null, error: null }),
        then: (res: any) =>
          res(
            table === "refunds"
              ? opts.loadError
                ? { data: null, error: { message: opts.loadError } }
                : { data: persisted.map((p) => ({ gateway_refund_id: p.gateway_refund_id })), error: null }
              : { data: [], error: null },
          ),
      };
      return chain;
    },
    async rpc(name: string, args: any) {
      rpcCalls.push({ name, ...args });
      // QA-4A-V5: o handler também recalcula a reserva canônica após cada
      // incremento (public.reverse_reserve_entry). Não é escrita direta em
      // tabela financeira: é a mesma transação SQL, por isso é aceita aqui.
      if (name === "reverse_reserve_entry") {
        return { data: { outcome: "REDUCED", reserve_id: "res-1" }, error: null };
      }
      if (name !== "process_refund_increment") return { data: null, error: { message: "unknown rpc" } };
      if (opts.failOnRefundId && args.p_gateway_refund_id === opts.failOnRefundId) {
        return { data: null, error: { message: "ledger write failed" } };
      }
      if (persisted.some((p) => p.gateway_refund_id === args.p_gateway_refund_id)) {
        const acc = persisted.reduce((s, p) => s + p.cents, 0);
        return {
          data: {
            outcome: "duplicate",
            refund_total: acc >= args.p_charge_cents - 1,
            accumulated_cents: acc,
          },
          error: null,
        };
      }
      persisted.push({ gateway_refund_id: args.p_gateway_refund_id, cents: args.p_amount_cents });
      const acc = persisted.reduce((s, p) => s + p.cents, 0);
      if (acc > args.p_charge_cents + 1) {
        persisted.pop(); // rollback da transação
        return { data: null, error: { message: "over-refund" } };
      }
      return {
        data: {
          outcome: "applied",
          refund_total: acc >= args.p_charge_cents - 1,
          accumulated_cents: acc,
          charge_cents: args.p_charge_cents,
        },
        error: null,
      };
    },
  };

  // rpcCalls expõe SOMENTE os incrementos de reembolso.
  const incrementCalls = new Proxy([] as any[], {
    get(_t, prop) {
      const list = rpcCalls.filter((c) => c.name === "process_refund_increment");
      const value = (list as any)[prop];
      return typeof value === "function" ? value.bind(list) : value;
    },
  });
  const reserveCalls = () => rpcCalls.filter((c) => c.name === "reverse_reserve_entry");
  return { client, writes, rpcCalls: incrementCalls, reserveCalls, allRpcCalls: rpcCalls, persisted };
}

const paymentRecord = {
  id: "pay-1",
  order_id: "order-1",
  workspace_id: "ws-1",
  gateway_payment_id: "asaas-1",
};

const payload = (refunds: any[] | null, value = 199.9, extra: Record<string, unknown> = {}) => ({
  id: "asaas-1",
  value,
  ...(refunds ? { refunds } : {}),
  ...extra,
});

const done = (id: string, value: number) => ({ id, value, status: "DONE" });

// ─────────────────────────────────────────────────────────────────────────────
describe("Onda 3 / FI-REFUND — roteamento por evento (não por payment.status)", () => {
  it("PAYMENT_REFUNDED e PAYMENT_PARTIALLY_REFUNDED vão para o handler de concluído", () => {
    expect(webhook).toContain(
      'eventType === "PAYMENT_REFUNDED" || eventType === "PAYMENT_PARTIALLY_REFUNDED"',
    );
    expect(webhook).toContain("handleRefundCompleted(supabase, paymentRecord, paymentData, eventType)");
  });

  it("PAYMENT_REFUND_IN_PROGRESS tem handler próprio, sem efeito financeiro", () => {
    expect(webhook).toContain('eventType === "PAYMENT_REFUND_IN_PROGRESS"');
    expect(webhook).toContain("handleRefundInProgress(supabase, paymentRecord, paymentData)");
  });

  it("o handler antigo (handleRefunded) não existe mais", () => {
    expect(webhook).not.toContain("handleRefunded");
  });

  it("o tipo do reembolso não é derivado de paymentData.status", () => {
    const refunds = readFileSync(
      resolve(process.cwd(), "supabase/functions/_shared/refunds.ts"),
      "utf-8",
    );
    expect(refunds).not.toContain("paymentData?.status");
    expect(refunds).not.toContain('"PARTIALLY_REFUNDED" ===');
  });
});

describe("Onda 3 / FI-REFUND — IN_PROGRESS não toca em nada", () => {
  it("não escreve em nenhuma tabela nem chama RPC", async () => {
    const { client, writes, rpcCalls } = makeClient({ chargeCents: 19990 });
    const out = await handleRefundInProgress(client, paymentRecord, payload([done("rf1", 50)]));
    expect(out).toBe("REFUND_IN_PROGRESS");
    expect(writes).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("sem paymentRecord devolve NOT_FOUND sem escrever", async () => {
    const { client, writes } = makeClient({ chargeCents: 19990 });
    expect(await handleRefundInProgress(client, null, payload(null))).toBe("NOT_FOUND");
    expect(writes).toEqual([]);
  });
});

describe("Onda 3 / FI-REFUND — parciais incrementais por ID de gateway", () => {
  it("primeiro parcial aplica exatamente um incremento com o próprio valor", async () => {
    const { client, rpcCalls } = makeClient({ chargeCents: 19990 });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 50)]),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("PARTIALLY_REFUNDED");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0]).toMatchObject({
      p_gateway_refund_id: "rf1",
      p_amount_cents: 5000,
      p_charge_cents: 19990,
      p_order_id: "order-1",
      p_payment_id: "pay-1",
    });
  });

  it("segundo parcial com array cumulativo envia replay e ID novo ao Postgres", async () => {
    const { client, rpcCalls } = makeClient({
      chargeCents: 19990,
      persisted: [{ gateway_refund_id: "rf1", cents: 5000 }],
    });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 50), done("rf2", 30)]),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("PARTIALLY_REFUNDED");
    expect(rpcCalls.map((c) => c.p_gateway_refund_id)).toEqual(["rf1", "rf2"]);
    expect(rpcCalls[1].p_amount_cents).toBe(3000);
  });

  it("nunca usa o primeiro ID como representante do array inteiro", async () => {
    const { client, rpcCalls } = makeClient({ chargeCents: 19990 });
    await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 50), done("rf2", 30)]),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(rpcCalls.map((c) => [c.p_gateway_refund_id, c.p_amount_cents])).toEqual([
      ["rf1", 5000],
      ["rf2", 3000],
    ]);
    // e jamais um único débito com a soma do array
    expect(rpcCalls.some((c) => c.p_amount_cents === 8000)).toBe(false);
  });

  it("dois IDs novos no mesmo payload viram dois incrementos independentes", async () => {
    const { client, rpcCalls, persisted } = makeClient({ chargeCents: 10000 });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 40), done("rf2", 25)], 100),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("PARTIALLY_REFUNDED");
    expect(rpcCalls).toHaveLength(2);
    expect(persisted.reduce((s, p) => s + p.cents, 0)).toBe(6500);
  });

  it("replay-only do mesmo evento ainda chama a RPC para convergir", async () => {
    const { client, rpcCalls } = makeClient({
      chargeCents: 19990,
      persisted: [{ gateway_refund_id: "rf1", cents: 5000 }],
    });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 50)]),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("REFUND_REPLAY");
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].p_gateway_refund_id).toBe("rf1");
  });

  it("parcial → total: o último incremento fecha o pedido como REFUNDED", async () => {
    const { client, rpcCalls } = makeClient({
      chargeCents: 10000,
      persisted: [{ gateway_refund_id: "rf1", cents: 4000 }],
    });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 40), done("rf2", 60)], 100),
      "PAYMENT_REFUNDED",
    );
    expect(out).toBe("REFUNDED");
    expect(rpcCalls.map((c) => c.p_gateway_refund_id)).toEqual(["rf1", "rf2"]);
  });

  it("evento fora de ordem (total chegando antes do parcial já persistido) não duplica", async () => {
    const { client, rpcCalls } = makeClient({
      chargeCents: 10000,
      persisted: [
        { gateway_refund_id: "rf1", cents: 4000 },
        { gateway_refund_id: "rf2", cents: 6000 },
      ],
    });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 40)], 100),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("REFUND_REPLAY");
    expect(rpcCalls.map((c) => c.p_gateway_refund_id)).toEqual(["rf1"]);
  });

  it("soma final fecha centavo a centavo com a cobrança", async () => {
    const { client, persisted } = makeClient({ chargeCents: 19990 });
    await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 99.95), done("rf2", 99.95)]),
      "PAYMENT_REFUNDED",
    );
    expect(persisted.reduce((s, p) => s + p.cents, 0)).toBe(19990);
  });
});

describe("Onda 3 / FI-REFUND — fail-closed em payload ambíguo", () => {
  it("parcial sem refunds[] aborta (nunca usa o valor da cobrança)", async () => {
    const { client, rpcCalls } = makeClient({ chargeCents: 19990 });
    await expect(
      handleRefundCompleted(client, paymentRecord, payload(null), "PAYMENT_PARTIALLY_REFUNDED"),
    ).rejects.toThrow(/sem refunds\[\] utilizável/);
    expect(rpcCalls).toEqual([]);
  });

  it("total sem refunds[] também aborta — sem fallback ao valor total", async () => {
    const { client, rpcCalls } = makeClient({ chargeCents: 19990 });
    await expect(
      handleRefundCompleted(client, paymentRecord, payload(null), "PAYMENT_REFUNDED"),
    ).rejects.toThrow(/sem refunds\[\] utilizável/);
    expect(rpcCalls).toEqual([]);
  });

  it("item sem id ou sem valor aborta antes de qualquer escrita", () => {
    expect(() => parseRefundItems({ refunds: [{ value: 50 }] }, "PAYMENT_REFUNDED")).toThrow(
      /sem id\/valor/,
    );
    expect(() => parseRefundItems({ refunds: [{ id: "rf1" }] }, "PAYMENT_REFUNDED")).toThrow(
      /sem id\/valor/,
    );
    expect(() => parseRefundItems({ refunds: [{ id: "rf1", value: 0 }] }, "PAYMENT_REFUNDED")).toThrow(
      /sem id\/valor/,
    );
  });

  it("itens ainda não efetivados dentro do array são ignorados", () => {
    const items = parseRefundItems(
      { refunds: [{ id: "rf1", value: 10, status: "PENDING" }, done("rf2", 20)] },
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(items).toEqual([{ id: "rf2", cents: 2000 }]);
  });

  it("cobrança sem valor aborta", async () => {
    const { client } = makeClient({ chargeCents: 0 });
    await expect(
      handleRefundCompleted(client, paymentRecord, payload([done("rf1", 10)], 0), "PAYMENT_REFUNDED"),
    ).rejects.toThrow(/valor de cobrança ausente/);
  });

  it("não lê refunds no Edge para decidir idempotência", async () => {
    const { client, rpcCalls } = makeClient({ chargeCents: 19990, loadError: "boom" });
    await handleRefundCompleted(client, paymentRecord, payload([done("rf1", 50)]), "PAYMENT_REFUNDED");
    expect(rpcCalls).toHaveLength(1);
  });
});

describe("Onda 3 / FI-REFUND — over-refund e falha intermediária", () => {
  it("over-refund propaga erro e não persiste o excedente", async () => {
    const { client, persisted } = makeClient({
      chargeCents: 10000,
      persisted: [{ gateway_refund_id: "rf1", cents: 9000 }],
    });
    await expect(
      handleRefundCompleted(
        client,
        paymentRecord,
        payload([done("rf1", 90), done("rf2", 90)], 100),
        "PAYMENT_PARTIALLY_REFUNDED",
      ),
    ).rejects.toThrow(/over-refund/);
    expect(persisted.reduce((s, p) => s + p.cents, 0)).toBe(9000);
  });

  it("falha no segundo incremento propaga (webhook responde 500 e não marca PROCESSED)", async () => {
    const { client, persisted, rpcCalls } = makeClient({
      chargeCents: 20000,
      failOnRefundId: "rf2",
    });
    await expect(
      handleRefundCompleted(
        client,
        paymentRecord,
        payload([done("rf1", 40), done("rf2", 60)], 200),
        "PAYMENT_PARTIALLY_REFUNDED",
      ),
    ).rejects.toThrow(/process_refund_increment falhou \(rf2\)/);
    // o primeiro incremento é uma transação própria e permanece; o segundo não entrou
    expect(persisted.map((p) => p.gateway_refund_id)).toEqual(["rf1"]);
    expect(rpcCalls).toHaveLength(2);
  });

  it("reentrega após falha reconhece o já aplicado e só refaz o que faltou", async () => {
    const { client, rpcCalls, persisted } = makeClient({
      chargeCents: 20000,
      persisted: [{ gateway_refund_id: "rf1", cents: 4000 }],
    });
    const out = await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 40), done("rf2", 60)], 200),
      "PAYMENT_PARTIALLY_REFUNDED",
    );
    expect(out).toBe("PARTIALLY_REFUNDED");
    expect(rpcCalls.map((c) => c.p_gateway_refund_id)).toEqual(["rf1", "rf2"]);
    expect(persisted.reduce((s, p) => s + p.cents, 0)).toBe(10000);
  });

  it("o handler não faz nenhuma escrita direta em tabela financeira (só a RPC)", async () => {
    const { client, writes } = makeClient({ chargeCents: 10000 });
    await handleRefundCompleted(
      client,
      paymentRecord,
      payload([done("rf1", 100)], 100),
      "PAYMENT_REFUNDED",
    );
    expect(writes).toEqual([]);
  });
});

describe("Onda 3 / FI-REFUND — migration pendente (atomicidade e reversão)", () => {
  it("cria unique real por (order_id, gateway_refund_id)", () => {
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS refunds_order_gateway_refund_id_key");
  });

  it("a RPC é a única fronteira transacional e é SECURITY DEFINER com search_path fixo", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.process_refund_increment");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path TO 'public'");
  });

  it("classifica total por acumulado >= cobrança com tolerância de 1 centavo", () => {
    expect(migration).toContain("v_is_total := v_acc_cents >= p_charge_cents - 1");
  });

  it("rejeita over-refund e cobrança divergente do banco", () => {
    expect(migration).toContain("over-refund no pedido");
    expect(migration).toContain("cobrança divergente");
  });

  it("reverte componentes proporcionalmente e fecha exato no total", () => {
    for (const c of ["gateway_fee", "platform_fee", "affiliate_fee", "creator_net"]) {
      expect(migration).toContain(c);
    }
    expect(migration).toContain("v_gw_d := GREATEST(v_split.gateway_fee, 0);");
  });

  it("debita do produtor apenas a fatia dele, no valor ACUMULADO", () => {
    expect(migration).toContain("Reversao produtor - reembolso acumulado");
    // Valor acumulado (auto-corretivo), nunca o delta: a linha de refund é única.
    expect(migration).toContain("'refund', -v_creator_debit");
    expect(migration).toContain("v_creator_debit := CASE");
    expect(migration).toContain("v_sale.amount - v_cr_remaining");
  });

  it("falha fechado quando a comissão já foi paga (sem improvisar quem absorve)", () => {
    expect(migration).toContain("reversao de comissao ja paga nao suportada");
    expect(migration).toContain("55000");
  });


  it("revoga entitlement/comissão/reserva apenas no total", () => {
    const totalGuard = migration.lastIndexOf("IF v_is_total THEN");
    expect(migration.indexOf("UPDATE public.entitlements SET revoked_at")).toBeGreaterThan(totalGuard);
    expect(migration.indexOf("SET status = 'CANCELLED'")).toBeGreaterThan(totalGuard);
  });

  it("serializa reembolsos concorrentes do mesmo pedido", () => {
    expect(migration).toContain("FROM public.orders WHERE id = p_order_id FOR UPDATE");
  });

  it("grants mínimos: só service_role executa", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.process_refund_increment(uuid, uuid, text, integer, integer) TO service_role");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
  });
});
