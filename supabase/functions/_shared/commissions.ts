// Pure, dependency-free commission logic shared by the payment edge functions.
// Kept free of Deno/Supabase imports so it can be unit tested with vitest.
//
// UNITS: orders.total_amount and commissions.amount are BRL (numeric).
//        split_entries.* and wallet_ledger.amount are CENTS (integer).

export type AffiliateRejectionReason =
  | "no_affiliate_link"
  | "link_not_found"
  | "affiliate_not_approved"
  | "cross_workspace"
  | "program_disabled"
  | "product_mismatch"
  | "no_attribution_session"
  | "attribution_invalid_or_expired";

export interface AffiliateLinkLike {
  id: string;
  affiliate_id: string;
  product_id: string | null;
}

export interface AffiliateLike {
  id: string;
  workspace_id: string | null;
  status: string | null;
}

export interface AffiliateProgramLike {
  is_enabled: boolean | null;
  default_commission_percent: number | null;
  hold_days: number | null;
}

export interface AttributionLike {
  id: string;
  affiliate_link_id: string;
  session_id: string | null;
  expires_at: string | null;
  converted_at?: string | null;
}

export interface CommissionRuleLike {
  percent: number | null;
  fixed_amount: number | null;
  is_active?: boolean | null;
}

export interface ValidateAffiliateInput {
  affiliateLinkId: string | null | undefined;
  affiliateSessionId: string | null | undefined;
  orderWorkspaceId: string;
  orderProductId: string | null;
  link: AffiliateLinkLike | null;
  affiliate: AffiliateLike | null;
  program: AffiliateProgramLike | null;
  attribution: AttributionLike | null;
  productRule?: CommissionRuleLike | null;
  now?: Date;
}

export type ValidateAffiliateResult =
  | {
      ok: true;
      affiliateLinkId: string;
      affiliateId: string;
      attributionId: string;
      commissionPercent: number;
      fixedAmount: number | null;
      holdDays: number;
    }
  | { ok: false; reason: AffiliateRejectionReason };

/** Server-side validation: the client is never trusted with the affiliate link. */
export function validateAffiliateContext(input: ValidateAffiliateInput): ValidateAffiliateResult {
  const now = input.now ?? new Date();

  if (!input.affiliateLinkId) return { ok: false, reason: "no_affiliate_link" };
  if (!input.link || input.link.id !== input.affiliateLinkId) {
    return { ok: false, reason: "link_not_found" };
  }
  if (!input.affiliate || String(input.affiliate.status || "").toUpperCase() !== "APPROVED") {
    return { ok: false, reason: "affiliate_not_approved" };
  }
  if (input.affiliate.workspace_id !== input.orderWorkspaceId) {
    return { ok: false, reason: "cross_workspace" };
  }
  if (!input.program || input.program.is_enabled !== true) {
    return { ok: false, reason: "program_disabled" };
  }
  if (
    input.link.product_id &&
    input.orderProductId &&
    input.link.product_id !== input.orderProductId
  ) {
    return { ok: false, reason: "product_mismatch" };
  }
  if (!input.affiliateSessionId) return { ok: false, reason: "no_attribution_session" };

  const attr = input.attribution;
  const attrValid =
    !!attr &&
    attr.affiliate_link_id === input.affiliateLinkId &&
    attr.session_id === input.affiliateSessionId &&
    (!attr.expires_at || new Date(attr.expires_at).getTime() > now.getTime());

  if (!attrValid) return { ok: false, reason: "attribution_invalid_or_expired" };

  const rule = input.productRule && input.productRule.is_active !== false ? input.productRule : null;
  const fixedAmount = rule?.fixed_amount ?? null;
  let percent = fixedAmount !== null
    ? 0
    : Number(rule?.percent ?? input.program.default_commission_percent ?? 0);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) percent = 0;

  return {
    ok: true,
    affiliateLinkId: input.affiliateLinkId,
    affiliateId: input.affiliate.id,
    attributionId: attr!.id,
    commissionPercent: percent,
    fixedAmount,
    holdDays: Number(input.program.hold_days ?? 14),
  };
}

/**
 * Commission base. orders.total_amount is ALREADY net of coupon and PIX discounts,
 * so discount_amount must never be subtracted again.
 */
export function commissionBase(order: { total_amount: number | string | null }): number {
  return round2(Math.max(Number(order.total_amount ?? 0), 0));
}

/** Affiliate commission in BRL. */
export function computeCommissionBrl(
  baseBrl: number,
  percent: number,
  fixedAmount: number | null = null,
): number {
  if (fixedAmount !== null) return Math.max(round2(fixedAmount), 0);
  return Math.max(round2(baseBrl * (percent || 0) / 100), 0);
}

export interface SplitCents {
  grossCents: number;
  gatewayFeeCents: number;
  platformFeeCents: number;
  affiliateFeeCents: number;
  creatorNetCents: number;
}

/** Split in cents. affiliateFeeCents always mirrors commissions.amount. */
export function computeSplitCents(args: {
  grossCents: number;
  gatewayFeeCents: number;
  platformPercent: number;
  commissionBrl: number;
}): SplitCents {
  const grossCents = Math.max(Math.round(args.grossCents), 0);
  const gatewayFeeCents = Math.max(Math.round(args.gatewayFeeCents), 0);
  const netCents = Math.max(grossCents - gatewayFeeCents, 0);
  const platformFeeCents = Math.round(netCents * (args.platformPercent || 0) / 100);
  let affiliateFeeCents = Math.max(Math.round(args.commissionBrl * 100), 0);
  let creatorNetCents = netCents - platformFeeCents - affiliateFeeCents;

  if (creatorNetCents < 0) {
    affiliateFeeCents = Math.max(netCents - platformFeeCents, 0);
    creatorNetCents = netCents - platformFeeCents - affiliateFeeCents;
  }

  return { grossCents, gatewayFeeCents, platformFeeCents, affiliateFeeCents, creatorNetCents };
}

export function round2(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
