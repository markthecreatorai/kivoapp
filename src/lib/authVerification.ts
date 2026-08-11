import { supabase } from "@/integrations/supabase/client";

const FUNCTIONS_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const PENDING_KEY = "kivo_pending_verification";

export type AccountTypeInput = "CREATOR" | "MEMBER";

/**
 * Contexto do cadastro pendente. NUNCA guarda senha nem código —
 * apenas dados suficientes para reabrir o modal após um refresh.
 */
export type PendingVerification = {
  email: string;
  accountType: AccountTypeInput;
  flowOrigin: "producer" | "circles";
  returnTarget: string | null;
  createdAt: number;
};

/** Só aceita destinos internos, evitando open redirect. */
export function sanitizeReturnTarget(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.includes("\\")) return null;
  if (value.length > 512) return null;
  return value;
}

export function savePendingVerification(p: Omit<PendingVerification, "createdAt">) {
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify({ ...p, createdAt: Date.now() }));
  } catch {}
}

export function getPendingVerification(): PendingVerification | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingVerification;
    // Contexto expira junto com o código (10 min).
    if (!parsed?.email || Date.now() - (parsed.createdAt || 0) > 10 * 60 * 1000) {
      sessionStorage.removeItem(PENDING_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingVerification() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {}
}

async function callFunction(name: string, body: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

export type RequestCodeResult =
  | { kind: "code_sent"; cooldownSeconds: number }
  | { kind: "cooldown"; retryAfterSeconds: number }
  | { kind: "rate_limited" }
  | { kind: "invalid_email" }
  | { kind: "weak_password" }
  | { kind: "error"; message: string };

export async function requestVerificationCode(input: {
  email: string;
  password?: string;
  fullName?: string;
  accountType: AccountTypeInput;
  flowOrigin: "producer" | "circles";
  returnTarget?: string | null;
  mode?: "signup" | "resend";
}): Promise<RequestCodeResult> {
  try {
    const { status, data } = await callFunction("auth-request-code", {
      email: input.email,
      password: input.password,
      full_name: input.fullName,
      account_type: input.accountType,
      flow_origin: input.flowOrigin,
      return_target: sanitizeReturnTarget(input.returnTarget ?? null),
      mode: input.mode ?? "signup",
    });

    if (status === 200 && data?.status === "code_sent") {
      return { kind: "code_sent", cooldownSeconds: data.cooldown_seconds ?? 60 };
    }
    if (data?.status === "cooldown") {
      return { kind: "cooldown", retryAfterSeconds: data.retry_after_seconds ?? 60 };
    }
    if (data?.error === "rate_limited") return { kind: "rate_limited" };
    if (data?.error === "invalid_email") return { kind: "invalid_email" };
    if (data?.error === "weak_password") return { kind: "weak_password" };
    return { kind: "error", message: "Não foi possível enviar o código agora. Tente novamente." };
  } catch {
    return { kind: "error", message: "Falha de conexão ao enviar o código." };
  }
}

export type VerifyCodeResult =
  | { kind: "verified"; accountType: "PRODUCER" | "MEMBER"; next: string | null }
  | { kind: "invalid"; attemptsLeft: number }
  | { kind: "expired" }
  | { kind: "blocked" }
  | { kind: "rate_limited" }
  | { kind: "error" };

export async function verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  try {
    const { data } = await callFunction("auth-verify-code", { email, code });
    if (data?.ok === true) {
      return {
        kind: "verified",
        accountType: data.account_type === "PRODUCER" ? "PRODUCER" : "MEMBER",
        next: sanitizeReturnTarget(data.next),
      };
    }
    switch (data?.reason) {
      case "invalid":
        return { kind: "invalid", attemptsLeft: Number(data.attempts_left ?? 0) };
      case "expired":
        return { kind: "expired" };
      case "blocked":
        return { kind: "blocked" };
      case "rate_limited":
        return { kind: "rate_limited" };
      default:
        return { kind: "error" };
    }
  } catch {
    return { kind: "error" };
  }
}

/**
 * Após a confirmação: cria a sessão com a senha que o cliente manteve apenas
 * em memória. Se a senha não estiver mais disponível (ex: refresh da página),
 * o usuário é direcionado ao login normal.
 */
export async function signInAfterVerification(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email, password });
}
