/**
 * authEmailGuard — Validação unificada de email para todos os fluxos de auth.
 *
 * Feature flag: auth_email_guard_v1
 *
 * Regras:
 *  - trim + lower-case
 *  - formato RFC básico
 *  - bloqueia múltiplos @, espaços, ponto final no domínio, TLD curto inválido
 *  - bloqueia typos comuns de domínio (gmai.com, gmial.com, hotnail.com, etc.)
 *  - sugere correção quando typo é conhecido
 *
 * Uso:
 *   const result = validateAuthEmail(rawInput);
 *   if (!result.ok) { showError(result.error, result.suggestion); return; }
 *   const safeEmail = result.email; // normalizado
 */
import { z } from "zod";

export const AUTH_EMAIL_GUARD_FLAG = "auth_email_guard_v1";
export const AUTH_EMAIL_INVALID_CODE = "AUTH_EMAIL_INVALID";

/** Domínios obviamente errados (typos) → sugestão correta. */
const TYPO_DOMAIN_MAP: Record<string, string> = {
  // gmail
  "gmai.com": "gmail.com",
  "gmial.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmali.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmail.cm": "gmail.com",
  "gmail.con": "gmail.com",
  "gmail.om": "gmail.com",
  "gnail.com": "gmail.com",
  "gemail.com": "gmail.com",
  "gimail.com": "gmail.com",
  "g-mail.com": "gmail.com",
  // hotmail
  "hotnail.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmial.com": "hotmail.com",
  "hotmaill.com": "hotmail.com",
  "hotmail.co": "hotmail.com",
  "hotmail.cm": "hotmail.com",
  "hotmail.con": "hotmail.com",
  "hotmail.om": "hotmail.com",
  // yahoo
  "yaho.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "yahoo.cm": "yahoo.com",
  "yahoo.con": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yhoo.com": "yahoo.com",
  // outlook
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
  "outlook.cm": "outlook.com",
  "outloook.com": "outlook.com",
  "outllook.com": "outlook.com",
  // icloud
  "iclod.com": "icloud.com",
  "icould.com": "icloud.com",
  "iclould.com": "icloud.com",
  "icloud.co": "icloud.com",
  "icloud.cm": "icloud.com",
  // live / uol / bol (PT-BR)
  "live.co": "live.com",
  "uol.co": "uol.com.br",
  "bol.co": "bol.com.br",
};

/** TLDs curtos válidos que aceitamos mesmo com 2 letras. */
const VALID_SHORT_TLDS = new Set([
  "br", "us", "uk", "io", "ai", "co", "me", "tv", "cc", "ca", "de", "es",
  "fr", "it", "jp", "ru", "pt", "nl", "se", "no", "fi", "pl", "be", "ch",
  "at", "dk", "ie", "in", "mx", "ar", "cl", "pe", "uy", "py", "bo", "ec",
  "ve", "cn", "kr", "tw", "hk", "sg", "au", "nz", "za", "il", "ae",
]);

/** RFC-básico: usuário simplificado + domínio com pelo menos 1 ponto. */
const BASIC_EMAIL_REGEX =
  /^[a-z0-9](?:[a-z0-9._%+\-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?)+$/;

export interface AuthEmailValidationResult {
  ok: boolean;
  /** Email normalizado (trim + lower) — só preenchido se válido. */
  email: string;
  /** Mensagem de erro PT-BR amigável. */
  error?: string;
  /** Sugestão "Você quis dizer X?" quando aplicável. */
  suggestion?: string;
  /** Código semântico para API. */
  code?: string;
}

const FRIENDLY_ERROR =
  "Parece que esse email está com erro de digitação. Verifique antes de continuar.";
const EMPTY_ERROR = "Digite seu email.";

/** Pré-validação rápida (estrutura) antes do Zod. */
function structuralChecks(raw: string): { ok: boolean; error?: string } {
  if (!raw) return { ok: false, error: EMPTY_ERROR };
  if (/\s/.test(raw)) return { ok: false, error: FRIENDLY_ERROR };
  const atCount = (raw.match(/@/g) || []).length;
  if (atCount !== 1) return { ok: false, error: FRIENDLY_ERROR };
  if (raw.endsWith(".")) return { ok: false, error: FRIENDLY_ERROR };
  if (raw.includes("..")) return { ok: false, error: FRIENDLY_ERROR };
  if (raw.length > 254) return { ok: false, error: FRIENDLY_ERROR };
  return { ok: true };
}

function checkTld(domain: string): { ok: boolean; error?: string } {
  const parts = domain.split(".");
  const tld = parts[parts.length - 1];
  if (!tld || tld.length < 2) return { ok: false, error: FRIENDLY_ERROR };
  // TLDs de 2 letras só são aceitos se conhecidos
  if (tld.length === 2 && !VALID_SHORT_TLDS.has(tld)) {
    return { ok: false, error: FRIENDLY_ERROR };
  }
  // TLD precisa ser alfabético
  if (!/^[a-z]{2,}$/.test(tld)) return { ok: false, error: FRIENDLY_ERROR };
  return { ok: true };
}

/**
 * Schema Zod compartilhado entre client e server.
 * Reflete o mesmo conjunto de regras do `validateAuthEmail`.
 */
export const authEmailSchema = z
  .string({ required_error: EMPTY_ERROR })
  .trim()
  .min(1, EMPTY_ERROR)
  .max(254, FRIENDLY_ERROR)
  .transform((v) => v.toLowerCase())
  .superRefine((value, ctx) => {
    const struct = structuralChecks(value);
    if (!struct.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: struct.error || FRIENDLY_ERROR });
      return;
    }
    if (!BASIC_EMAIL_REGEX.test(value)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: FRIENDLY_ERROR });
      return;
    }
    const domain = value.split("@")[1] || "";
    if (TYPO_DOMAIN_MAP[domain]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: FRIENDLY_ERROR });
      return;
    }
    const tld = checkTld(domain);
    if (!tld.ok) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: tld.error || FRIENDLY_ERROR });
    }
  });

/**
 * API principal usada pelos forms. Retorna sugestão quando há typo conhecido.
 */
export function validateAuthEmail(raw: unknown): AuthEmailValidationResult {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";

  const struct = structuralChecks(value);
  if (!struct.ok) {
    return {
      ok: false,
      email: "",
      error: struct.error,
      code: AUTH_EMAIL_INVALID_CODE,
    };
  }

  if (!BASIC_EMAIL_REGEX.test(value)) {
    return { ok: false, email: "", error: FRIENDLY_ERROR, code: AUTH_EMAIL_INVALID_CODE };
  }

  const domain = value.split("@")[1] || "";
  const local = value.split("@")[0] || "";
  const corrected = TYPO_DOMAIN_MAP[domain];
  if (corrected) {
    return {
      ok: false,
      email: "",
      error: FRIENDLY_ERROR,
      suggestion: `${local}@${corrected}`,
      code: AUTH_EMAIL_INVALID_CODE,
    };
  }

  const tld = checkTld(domain);
  if (!tld.ok) {
    return { ok: false, email: "", error: tld.error, code: AUTH_EMAIL_INVALID_CODE };
  }

  return { ok: true, email: value };
}

/** Helper para edge functions / APIs. */
export function assertValidAuthEmail(raw: unknown): string {
  const r = validateAuthEmail(raw);
  if (!r.ok) {
    const err: any = new Error(r.error || FRIENDLY_ERROR);
    err.code = AUTH_EMAIL_INVALID_CODE;
    err.suggestion = r.suggestion;
    err.status = 422;
    throw err;
  }
  return r.email;
}
