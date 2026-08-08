// get-wallet-balance — saldos do produtor (disponível, pendente por data, reserva).
// Requer JWT (verify_jwt = true) e valida a associação ao workspace via workspace_members.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const FN = "get-wallet-balance";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ─── 1. Autenticação ───
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const anon = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await anon.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ error: "Unauthorized" }, 401);

    // ─── 2. Input ───
    let workspaceId = "";
    if (req.method === "GET") {
      workspaceId = new URL(req.url).searchParams.get("workspace_id") || "";
    } else {
      const body = await req.json().catch(() => ({}));
      workspaceId = String((body as Record<string, unknown>)?.workspace_id ?? "");
    }
    if (!UUID_RE.test(workspaceId)) {
      return json({ error: "workspace_id inválido" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ─── 3. Autorização: membro do workspace (nunca confiar no body) ───
    const { data: membership, error: memberErr } = await admin
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    if (memberErr) throw memberErr;
    if (!membership) {
      console.warn(`[${FN}] acesso negado: user=${userId} workspace=${workspaceId}`);
      return json({ error: "Forbidden" }, 403);
    }

    // ─── 4. Wallet ledger ───
    const { data: ledger, error: ledgerErr } = await admin
      .from("wallet_ledger")
      .select("amount, status, type, available_at, description, created_at")
      .eq("workspace_id", workspaceId)
      .neq("status", "canceled");
    if (ledgerErr) throw ledgerErr;

    const rows = (ledger || []) as LedgerRow[];

    // Regra canônica compartilhada (espelha public.get_wallet_balance):
    // 'settled' é informativo e não afeta saldo; saques sempre subtraem.
    const { available: availableBalance, pending: pendingBalance } = computeBalances(rows);

    // Pendentes (ainda em hold), agrupados por available_at
    const pendingRows = rows.filter((r) => isPending(r));

    const grouped = new Map<string, { available_at: string | null; amount: number; count: number }>();
    for (const r of pendingRows) {
      const key = r.available_at ? new Date(r.available_at).toISOString() : "unscheduled";
      const current = grouped.get(key) || { available_at: r.available_at ?? null, amount: 0, count: 0 };
      current.amount += Number(r.amount || 0);
      current.count += 1;
      grouped.set(key, current);
    }
    const pendingSchedule = [...grouped.values()].sort((a, b) =>
      (a.available_at || "9999").localeCompare(b.available_at || "9999")
    );

    // ─── 5. Reservas ainda retidas ───
    const { data: reserves, error: resErr } = await admin
      .from("reserve_entries")
      .select("amount, release_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "held");
    if (resErr) throw resErr;

    const reserveBalance = (reserves || []).reduce((s, r) => s + Number(r.amount || 0), 0);

    return json({
      workspace_id: workspaceId,
      currency: "BRL",
      // Todos os valores em CENTAVOS
      available_balance_cents: availableBalance,
      pending_balance_cents: pendingBalance,
      reserve_balance_cents: reserveBalance,
      total_balance_cents: availableBalance + pendingBalance + reserveBalance,
      pending_schedule: pendingSchedule.map((g) => ({
        available_at: g.available_at,
        amount_cents: g.amount,
        entries: g.count,
      })),
      reserves: (reserves || [])
        .map((r) => ({ amount_cents: Number(r.amount || 0), release_at: r.release_at }))
        .sort((a, b) => String(a.release_at).localeCompare(String(b.release_at))),
    });
  } catch (err) {
    console.error(`[${FN}] erro:`, (err as Error).message);
    return json({ error: "Erro ao calcular saldo" }, 500);
  }
});
