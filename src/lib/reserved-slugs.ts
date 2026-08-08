/**
 * Caminhos do sistema que NÃO podem ser slug de loja.
 * A rota "/:slug" do App.tsx casa com qualquer caminho de um segmento,
 * então esses valores precisam ser reservados no roteamento e na criação de loja.
 */
export const RESERVED_SLUGS = [
  "login",
  "signup",
  "dashboard",
  "checkout",
  "member",
  "admin",
  "api",
  "circles",
  "join",
  "c",
  "book",
  "affiliate",
  "affiliates",
  "order",
  "upsell",
  "pricing",
  "planos",
  "settings",
  "products",
  "store",
  "leads",
  "analytics",
  "clients",
  "coupons",
  "earnings",
  "appointments",
  "email-flows",
  "onboarding",
  "forgot-password",
  "reset-password",
  "verify-email",
] as const;

export type ReservedSlug = (typeof RESERVED_SLUGS)[number];

const RESERVED_SET = new Set<string>(RESERVED_SLUGS);

/** Normaliza um slug para comparação (trim, lowercase, sem barras). */
export function normalizeSlug(slug: string | null | undefined): string {
  return (slug ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

/** true quando o slug colide com uma rota do sistema. */
export function isReservedSlug(slug: string | null | undefined): boolean {
  return RESERVED_SET.has(normalizeSlug(slug));
}
