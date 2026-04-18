export const EMAIL_FROM_DOMAIN_UNVERIFIED = "EMAIL_FROM_DOMAIN_UNVERIFIED";

const VERIFIED_FROM_DOMAINS = new Set(["mail.kivohub.com.br"]);

export const DEFAULT_FROM = "Kivo <auth@mail.kivohub.com.br>";

export function resolveDefaultFrom(env: Record<string, string | undefined>) {
  return env.EMAIL_FROM_DEFAULT || env.EMAIL_FROM_AUTH || env.EMAIL_FROM_NOTIFY || env.EMAIL_FROM || DEFAULT_FROM;
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
  return address.split("@")[1] || "";
}

export function assertVerifiedFromDomain(from: string) {
  const domain = extractFromDomain(from);
  if (!VERIFIED_FROM_DOMAINS.has(domain)) {
    const error: Error & { code?: string; status?: number; domain?: string } = new Error(`Domain not verified: ${domain || "unknown"}`);
    error.code = EMAIL_FROM_DOMAIN_UNVERIFIED;
    error.status = 422;
    error.domain = domain;
    throw error;
  }
  return domain;
}