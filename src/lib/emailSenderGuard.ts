export const EMAIL_FROM_DOMAIN_UNVERIFIED = "EMAIL_FROM_DOMAIN_UNVERIFIED";

const VERIFIED_FROM_DOMAINS = ["mail.kivohub.com.br"] as const;

const EMAIL_FROM_FALLBACK = "Kivo <auth@mail.kivohub.com.br>";

export interface EmailFromValidationResult {
  ok: boolean;
  from: string;
  domain?: string;
  code?: string;
  error?: string;
}

export function getDefaultVerifiedFrom() {
  return EMAIL_FROM_FALLBACK;
}

export function maskEmailAddress(email: string) {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return "invalid";
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - visible.length, 1))}@${domain}`;
}

export function extractFromDomain(from: string) {
  const match = from.match(/<([^>]+)>/);
  const address = (match?.[1] || from).trim().toLowerCase();
  const domain = address.split("@")[1] || "";
  return { address, domain };
}

export function validateEmailFromDomain(rawFrom?: string | null): EmailFromValidationResult {
  const from = (rawFrom || "").trim() || EMAIL_FROM_FALLBACK;
  const { domain } = extractFromDomain(from);
  if (VERIFIED_FROM_DOMAINS.includes(domain as (typeof VERIFIED_FROM_DOMAINS)[number])) {
    return { ok: true, from, domain };
  }
  return {
    ok: false,
    from,
    domain,
    code: EMAIL_FROM_DOMAIN_UNVERIFIED,
    error: `Domínio do remetente não verificado: ${domain || "desconhecido"}`,
  };
}