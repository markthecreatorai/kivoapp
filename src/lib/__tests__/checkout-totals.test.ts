import { describe, expect, it } from "vitest";
import {
  computeCheckoutTotals,
  computeCouponDiscount,
  computePixDiscount,
} from "@/lib/checkout-totals";

describe("computeCouponDiscount", () => {
  it("applies a percentage over the base", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: 10 }, 200)).toBe(20);
  });

  it("applies a fixed amount", () => {
    expect(computeCouponDiscount({ type: "FIXED", value: 30 }, 200)).toBe(30);
  });

  it("never exceeds the base amount", () => {
    expect(computeCouponDiscount({ type: "FIXED", value: 500 }, 200)).toBe(200);
  });

  it("rounds to cents", () => {
    expect(computeCouponDiscount({ type: "PERCENT", value: 33 }, 99.9)).toBe(32.97);
  });
});

describe("computePixDiscount", () => {
  it("returns 0 when there is no pix percentage", () => {
    expect(computePixDiscount(100, null)).toBe(0);
    expect(computePixDiscount(100, 0)).toBe(0);
  });

  it("applies the percentage over the amount already discounted by the coupon", () => {
    expect(computePixDiscount(90, 10)).toBe(9);
  });
});

describe("computeCheckoutTotals", () => {
  it("sums order bumps into the subtotal", () => {
    const t = computeCheckoutTotals({ priceAmount: 100, bumpAmount: 47 });
    expect(t.subtotal).toBe(147);
    expect(t.couponDiscount).toBe(0);
    expect(t.pixDiscount).toBeNull();
    expect(t.cardTotal).toBe(147);
    expect(t.pixTotal).toBeNull();
  });

  it("applies the coupon over the subtotal including bumps", () => {
    const t = computeCheckoutTotals({
      priceAmount: 100,
      bumpAmount: 100,
      coupon: { type: "PERCENT", value: 50 },
    });
    expect(t.couponDiscount).toBe(100);
    expect(t.cardTotal).toBe(100);
  });

  it("applies coupon first, then the pix percentage over the result", () => {
    const t = computeCheckoutTotals({
      priceAmount: 200,
      bumpAmount: 0,
      coupon: { type: "PERCENT", value: 50 }, // -100 => 100
      pixDiscountPercent: 10, // 10% of 100 => 10
    });
    expect(t.couponDiscount).toBe(100);
    expect(t.pixDiscount).toBe(10);
    expect(t.pixTotal).toBe(90);
    expect(t.cardTotal).toBe(100);
  });

  it("does not apply the pix percentage over the full subtotal", () => {
    const t = computeCheckoutTotals({
      priceAmount: 100,
      bumpAmount: 0,
      coupon: { type: "FIXED", value: 50 },
      pixDiscountPercent: 10,
    });
    // wrong order would give 10 (10% of 100) and a total of 40
    expect(t.pixDiscount).toBe(5);
    expect(t.pixTotal).toBe(45);
  });

  it("never goes below zero", () => {
    const t = computeCheckoutTotals({
      priceAmount: 50,
      bumpAmount: 0,
      coupon: { type: "FIXED", value: 999 },
      pixDiscountPercent: 10,
    });
    expect(t.cardTotal).toBe(0);
    expect(t.pixDiscount).toBe(0);
    expect(t.pixTotal).toBe(0);
  });
});
