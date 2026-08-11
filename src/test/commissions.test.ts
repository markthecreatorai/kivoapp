import { describe, it, expect } from "vitest";
import {
  validateAffiliateContext,
  commissionBase,
  computeCommissionBrl,
  computeSplitCents,
} from "../../supabase/functions/_shared/commissions";

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

const base = {
  affiliateLinkId: "link-1",
  affiliateSessionId: "sess-1",
  orderWorkspaceId: "ws-1",
  orderProductId: "prod-1",
  link: { id: "link-1", affiliate_id: "aff-1", product_id: null },
  affiliate: { id: "aff-1", workspace_id: "ws-1", status: "APPROVED" },
  program: { is_enabled: true, default_commission_percent: 20, hold_days: 14 },
  attribution: {
    id: "attr-1",
    affiliate_link_id: "link-1",
    session_id: "sess-1",
    expires_at: future,
  },
};

describe("commission base (discount applied only once)", () => {
  it("uses orders.total_amount as-is", () => {
    // subtotal 100, coupon 20 => total_amount 80
    expect(commissionBase({ total_amount: 80 })).toBe(80);
  });

  it("20% of 80 = 16", () => {
    expect(computeCommissionBrl(commissionBase({ total_amount: 80 }), 20)).toBe(16);
  });

  it("never goes negative", () => {
    expect(commissionBase({ total_amount: -5 })).toBe(0);
    expect(computeCommissionBrl(0, 20)).toBe(0);
  });

  it("honours a fixed commission rule", () => {
    expect(computeCommissionBrl(80, 20, 5)).toBe(5);
  });
});

describe("affiliate validation", () => {
  it("accepts a valid context", () => {
    const res = validateAffiliateContext(base);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.commissionPercent).toBe(20);
      expect(res.affiliateId).toBe("aff-1");
    }
  });

  it("rejects a cross-workspace affiliate link", () => {
    const res = validateAffiliateContext({
      ...base,
      affiliate: { id: "aff-1", workspace_id: "ws-OTHER", status: "APPROVED" },
    });
    expect(res).toEqual({ ok: false, reason: "cross_workspace" });
  });

  it("rejects a non-approved affiliate", () => {
    const res = validateAffiliateContext({
      ...base,
      affiliate: { id: "aff-1", workspace_id: "ws-1", status: "PENDING" },
    });
    expect(res).toEqual({ ok: false, reason: "affiliate_not_approved" });
  });

  it("rejects a disabled program", () => {
    const res = validateAffiliateContext({
      ...base,
      program: { is_enabled: false, default_commission_percent: 20, hold_days: 14 },
    });
    expect(res).toEqual({ ok: false, reason: "program_disabled" });
  });

  it("rejects a link bound to another product", () => {
    const res = validateAffiliateContext({
      ...base,
      link: { id: "link-1", affiliate_id: "aff-1", product_id: "prod-OTHER" },
    });
    expect(res).toEqual({ ok: false, reason: "product_mismatch" });
  });

  it("rejects an expired attribution", () => {
    const res = validateAffiliateContext({
      ...base,
      attribution: { ...base.attribution, expires_at: past },
    });
    expect(res).toEqual({ ok: false, reason: "attribution_invalid_or_expired" });
  });

  it("rejects a missing attribution session", () => {
    const res = validateAffiliateContext({ ...base, affiliateSessionId: null });
    expect(res).toEqual({ ok: false, reason: "no_attribution_session" });
  });

  it("rejects an attribution from another session", () => {
    const res = validateAffiliateContext({
      ...base,
      attribution: { ...base.attribution, session_id: "sess-OTHER" },
    });
    expect(res).toEqual({ ok: false, reason: "attribution_invalid_or_expired" });
  });

  it("rejects when no link is provided", () => {
    const res = validateAffiliateContext({ ...base, affiliateLinkId: null });
    expect(res).toEqual({ ok: false, reason: "no_affiliate_link" });
  });
});

describe("split in cents", () => {
  it("affiliate_fee mirrors the commission and creator_net closes the account", () => {
    const split = computeSplitCents({
      grossCents: 8000,
      gatewayFeeCents: 279,
      platformPercent: 8,
      commissionBrl: 16,
    });
    expect(split.affiliateFeeCents).toBe(1600);
    expect(split.platformFeeCents).toBe(Math.round((8000 - 279) * 0.08));
    expect(
      split.gatewayFeeCents + split.platformFeeCents + split.affiliateFeeCents + split.creatorNetCents,
    ).toBe(8000);
  });

  it("never produces a negative creator_net", () => {
    const split = computeSplitCents({
      grossCents: 1000,
      gatewayFeeCents: 100,
      platformPercent: 8,
      commissionBrl: 100,
    });
    expect(split.creatorNetCents).toBeGreaterThanOrEqual(0);
    expect(split.affiliateFeeCents).toBeLessThanOrEqual(900);
  });
});
