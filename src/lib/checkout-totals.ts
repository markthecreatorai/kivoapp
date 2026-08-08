/**
 * Checkout totals — single source of truth on the frontend.
 *
 * MUST stay in sync with supabase/functions/_shared/coupon.ts, otherwise the
 * value shown to the buyer diverges from the value charged by the gateway.
 *
 * Order of application:
 *   1. subtotal = price + order bumps
 *   2. coupon over the subtotal
 *   3. PIX percentage over (subtotal - coupon discount)
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface AppliedCoupon {
  code: string;
  type: string;
  value: number;
  discount: number;
}

export function computeCouponDiscount(
  coupon: { type: string; value: number },
  base: number,
): number {
  const amount = coupon.type === "PERCENT"
    ? round2(base * (Number(coupon.value) / 100))
    : round2(Number(coupon.value));
  return Math.max(0, Math.min(amount, round2(base)));
}

export function computePixDiscount(
  amountAfterCoupon: number,
  pixDiscountPercent: number | null | undefined,
): number {
  if (!pixDiscountPercent) return 0;
  return round2(Math.max(0, amountAfterCoupon) * (Number(pixDiscountPercent) / 100));
}

export interface CheckoutTotals {
  subtotal: number;
  couponDiscount: number;
  /** null when the price has no PIX discount configured */
  pixDiscount: number | null;
  cardTotal: number;
  pixTotal: number | null;
}

export function computeCheckoutTotals(params: {
  priceAmount: number;
  bumpAmount: number;
  coupon?: { type: string; value: number } | null;
  pixDiscountPercent?: number | null;
}): CheckoutTotals {
  const subtotal = round2((params.priceAmount || 0) + (params.bumpAmount || 0));
  const couponDiscount = params.coupon
    ? computeCouponDiscount(params.coupon, subtotal)
    : 0;
  const afterCoupon = round2(Math.max(0, subtotal - couponDiscount));
  const hasPix = !!params.pixDiscountPercent;
  const pixDiscount = hasPix ? computePixDiscount(afterCoupon, params.pixDiscountPercent) : null;

  return {
    subtotal,
    couponDiscount,
    pixDiscount,
    cardTotal: afterCoupon,
    pixTotal: pixDiscount === null ? null : round2(Math.max(0, afterCoupon - pixDiscount)),
  };
}
