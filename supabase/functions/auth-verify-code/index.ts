// Valida o código de 4 dígitos e confirma o e-mail via Admin API (idempotente).
// Nunca cria sessão aqui: o cliente faz signInWithPassword com a senha em memória.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersFor } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import {
  VERIFICATION_PURPOSE,
  hashCode,
  isValidCodeFormat,
  normalizeEmail,
  safeEqual,
} from "../_shared/auth-code.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HMAC_SECRET = Deno.env.get("AUTH_CODE_HMAC_SECRET")!;

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = await req.json().catch(() => null);
    const email = normalizeEmail((payload as any)?.email);
    const code = (payload as any)?.code;
    if (!email || !isValidCodeFormat(code)) return json({ ok: false, reason: "invalid" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ip = getClientIp(req);

    const ipLimit = await checkRateLimit(supabase, "auth-verify-code:ip", ip, 30, 900);
    if (!ipLimit.allowed) return json({ ok: false, reason: "rate_limited" }, 429);
    const emailLimit = await checkRateLimit(supabase, "auth-verify-code:email", email, 15, 900);
    if (!emailLimit.allowed) return json({ ok: false, reason: "rate_limited" }, 429);

    const { data: record } = await supabase
      .from("auth_verification_codes")
      .select("id, user_id, email, code_hash, attempts, max_attempts, expires_at, return_target, flow_origin")
      .eq("email", email)
      .eq("purpose", VERIFICATION_PURPOSE)
      .is("consumed_at", null)
      .is("invalidated_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!record) return json({ ok: false, reason: "expired" }, 400);

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      await supabase
        .from("auth_verification_codes")
        .update({ invalidated_at: new Date().toISOString() })
        .eq("id", record.id);
      return json({ ok: false, reason: "expired" }, 400);
    }

    const candidate = await hashCode(HMAC_SECRET, {
      code,
      email,
      purpose: VERIFICATION_PURPOSE,
      userId: record.user_id,
    });

    if (!safeEqual(candidate, record.code_hash)) {
      const attempts = (record.attempts ?? 0) + 1;
      const blocked = attempts >= (record.max_attempts ?? 5);
      await supabase
        .from("auth_verification_codes")
        .update({
          attempts,
          ...(blocked ? { invalidated_at: new Date().toISOString() } : {}),
        })
        .eq("id", record.id);
      return json({
        ok: false,
        reason: blocked ? "blocked" : "invalid",
        attempts_left: blocked ? 0 : (record.max_attempts ?? 5) - attempts,
      }, 400);
    }

    // Uso único (proteção contra corrida: só consome se ainda estava livre).
    const { data: consumed } = await supabase
      .from("auth_verification_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", record.id)
      .is("consumed_at", null)
      .select("id")
      .maybeSingle();
    if (!consumed) return json({ ok: false, reason: "expired" }, 400);

    // Confirma o e-mail — idempotente.
    const { error: updErr } = await supabase.auth.admin.updateUserById(record.user_id, {
      email_confirm: true,
    });
    if (updErr) {
      console.error("[auth-verify-code] confirm failed:", updErr.message);
      return json({ ok: false, reason: "internal_error" }, 500);
    }

    // Tipo de conta é lido do banco (nunca de metadado enviado pelo cliente).
    const { data: accountRow } = await supabase
      .from("user_account_types")
      .select("account_type")
      .eq("user_id", record.user_id)
      .maybeSingle();

    const accountType = accountRow?.account_type ?? "MEMBER";

    if (accountType === "PRODUCER") {
      const { error: wsErr } = await supabase.rpc("ensure_producer_workspace_for", {
        p_user_id: record.user_id,
      });
      if (wsErr) console.error("[auth-verify-code] workspace failed:", wsErr.message);
    }

    return json({
      ok: true,
      account_type: accountType,
      flow_origin: record.flow_origin ?? "producer",
      next: record.return_target ?? null,
    });
  } catch (err) {
    console.error("[auth-verify-code] unexpected:", (err as Error).message);
    return json({ ok: false, reason: "internal_error" }, 500);
  }
});
