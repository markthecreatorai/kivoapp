// Emite (ou reemite) o código de 4 dígitos de confirmação de cadastro.
// Nunca envia magic link. Respostas uniformes para não permitir enumeração de e-mails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeadersFor } from "../_shared/cors.ts";
import { checkRateLimit, getClientIp } from "../_shared/rate-limit.ts";
import {
  CODE_TTL_SECONDS,
  MAX_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
  VERIFICATION_PURPOSE,
  existingAccountEmailHtml,
  generateCode,
  hashCode,
  hashIp,
  normalizeEmail,
  sanitizeFlowOrigin,
  sanitizeReturnTarget,
  sendCodeEmail,
  verificationEmailHtml,
} from "../_shared/auth-code.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HMAC_SECRET = Deno.env.get("AUTH_CODE_HMAC_SECRET")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM = Deno.env.get("EMAIL_FROM_AUTH") || "Kivo <auth@mail.kivohub.com.br>";

type AuthUser = { id: string; email?: string; email_confirmed_at?: string | null };

async function findUserByEmail(email: string): Promise<AuthUser | null> {
  const url = `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=20`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`admin_list_failed [${res.status}]: ${await res.text()}`);
  const body = await res.json();
  const users: AuthUser[] = body?.users ?? [];
  return users.find((u) => (u.email || "").toLowerCase() === email) ?? null;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = await req.json().catch(() => null);
    if (!payload || typeof payload !== "object") return json({ error: "invalid_payload" }, 400);

    const email = normalizeEmail((payload as any).email);
    if (!email) return json({ error: "invalid_email" }, 400);

    const mode = (payload as any).mode === "resend" ? "resend" : "signup";
    const password = typeof (payload as any).password === "string" ? (payload as any).password : "";
    const fullName = typeof (payload as any).full_name === "string"
      ? (payload as any).full_name.trim().slice(0, 120)
      : "";
    const isCreator = String((payload as any).account_type || "").toUpperCase() === "CREATOR";
    const flowOrigin = sanitizeFlowOrigin((payload as any).flow_origin);
    const returnTarget = sanitizeReturnTarget((payload as any).return_target);

    if (mode === "signup" && password.length < 8) return json({ error: "weak_password" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const ip = getClientIp(req);

    // Limites: por IP e por e-mail (fail-open apenas em erro de infraestrutura).
    const ipLimit = await checkRateLimit(supabase, "auth-request-code:ip", ip, 20, 3600);
    if (!ipLimit.allowed) return json({ error: "rate_limited" }, 429);
    const emailLimit = await checkRateLimit(supabase, "auth-request-code:email", email, 6, 3600);
    if (!emailLimit.allowed) return json({ error: "rate_limited" }, 429);

    // Cooldown de 60s desde o último código emitido para este e-mail.
    const { data: lastCode } = await supabase
      .from("auth_verification_codes")
      .select("created_at")
      .eq("email", email)
      .eq("purpose", VERIFICATION_PURPOSE)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastCode?.created_at) {
      const elapsed = (Date.now() - new Date(lastCode.created_at).getTime()) / 1000;
      if (elapsed < RESEND_COOLDOWN_SECONDS) {
        return json({
          status: "cooldown",
          retry_after_seconds: Math.ceil(RESEND_COOLDOWN_SECONDS - elapsed),
        }, 429);
      }
    }

    const uniform = {
      status: "code_sent",
      cooldown_seconds: RESEND_COOLDOWN_SECONDS,
      expires_in_seconds: CODE_TTL_SECONDS,
    };

    let user = await findUserByEmail(email);

    if (user?.email_confirmed_at) {
      // Conta já ativa: resposta idêntica, sem código, com aviso por e-mail.
      try {
        await sendCodeEmail({
          to: email,
          subject: "Sua conta Kivo já existe",
          html: existingAccountEmailHtml(),
          apiKey: RESEND_API_KEY,
          from: FROM,
        });
      } catch (err) {
        console.error("[auth-request-code] existing-account email failed:", (err as Error).message);
      }
      return json(uniform);
    }

    if (!user) {
      if (mode === "resend") return json(uniform); // não revela ausência de conta
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        user_metadata: {
          full_name: fullName || email.split("@")[0],
          display_name: fullName || email.split("@")[0],
          account_type: isCreator ? "CREATOR" : "MEMBER",
          is_creator: isCreator,
          signup_flow_origin: flowOrigin,
        },
      });
      if (createErr || !created?.user) {
        console.error("[auth-request-code] createUser failed:", createErr?.message);
        return json(uniform); // sem enumeração
      }
      user = created.user as AuthUser;
    } else if (mode === "signup") {
      // Cadastro pendente (conta existe e NUNCA foi confirmada): o usuário está
      // recomeçando o cadastro, possivelmente com outra senha/papel. Sincronizamos
      // senha, metadados E a fonte autorizada (public.user_account_types) para que
      // o signInWithPassword e a confirmação posteriores funcionem corretamente.
      // Nunca ocorre em mode=resend nem em conta já confirmada (tratada acima).
      const { error: syncErr } = await supabase.auth.admin.updateUserById(user.id, {
        password,
        user_metadata: {
          full_name: fullName || email.split("@")[0],
          display_name: fullName || email.split("@")[0],
          account_type: isCreator ? "CREATOR" : "MEMBER",
          is_creator: isCreator,
          signup_flow_origin: flowOrigin,
        },
      });
      if (syncErr) {
        console.error("[auth-request-code] pending signup sync failed:", syncErr.message);
        return json({ error: "internal_error" }, 500);
      }

      const { error: accountTypeErr } = await supabase
        .from("user_account_types")
        .upsert(
          { user_id: user.id, account_type: isCreator ? "PRODUCER" : "MEMBER" },
          { onConflict: "user_id" },
        );
      if (accountTypeErr) {
        console.error("[auth-request-code] account type sync failed:", accountTypeErr.message);
        return json({ error: "internal_error" }, 500);
      }
    }

    // Invalida códigos anteriores ainda ativos.
    await supabase
      .from("auth_verification_codes")
      .update({ invalidated_at: new Date().toISOString() })
      .eq("email", email)
      .eq("purpose", VERIFICATION_PURPOSE)
      .is("consumed_at", null)
      .is("invalidated_at", null);

    const code = generateCode();
    const codeHash = await hashCode(HMAC_SECRET, {
      code,
      email,
      purpose: VERIFICATION_PURPOSE,
      userId: user.id,
    });

    const { error: insertErr } = await supabase.from("auth_verification_codes").insert({
      user_id: user.id,
      email,
      purpose: VERIFICATION_PURPOSE,
      code_hash: codeHash,
      max_attempts: MAX_ATTEMPTS,
      flow_origin: flowOrigin,
      return_target: returnTarget,
      ip_hash: await hashIp(HMAC_SECRET, ip),
      expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
    });
    if (insertErr) {
      console.error("[auth-request-code] insert failed:", insertErr.message);
      return json({ error: "internal_error" }, 500);
    }

    await sendCodeEmail({
      to: email,
      subject: `${code} é o seu código de confirmação Kivo`,
      html: verificationEmailHtml(code),
      apiKey: RESEND_API_KEY,
      from: FROM,
    });

    return json(uniform);
  } catch (err) {
    console.error("[auth-request-code] unexpected:", (err as Error).message);
    return json({ error: "internal_error" }, 500);
  }
});
