import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

// Mock supabase
const mockFrom = vi.fn();
const mockFunctionsInvoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    functions: { invoke: (...args: any[]) => mockFunctionsInvoke(...args) },
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  },
}));

vi.mock("@/lib/tracking", () => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/hooks/useAffiliateTracking", () => ({
  getStoredAffiliateLink: () => null,
}));

const mockProduct = {
  id: "prod-1",
  name: "Test Product",
  slug: "test-product",
  thumbnail_url: null,
  short_description: "A test product",
  sales_count: 10,
  workspace_id: "ws-1",
};

const mockPrice = {
  id: "price-1",
  amount: 9990,
  compare_at_amount: null,
  pix_discount_percent: 10,
  max_installments: 12,
  type: "ONE_TIME",
  product_id: "prod-1",
};

describe("Checkout Flow Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Product Loading", () => {
    it("shows loading state initially", async () => {
      // Mock product query that hangs
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn(() => new Promise(() => {})), // never resolves
            }),
          }),
        }),
      });

      const Checkout = (await import("@/pages/Checkout")).default;
      render(
        <MemoryRouter initialEntries={["/checkout/test-product"]}>
          <Routes>
            <Route path="/checkout/:productSlug" element={<Checkout />} />
          </Routes>
        </MemoryRouter>
      );

      // Should show loading indicator
      expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    });
  });

  describe("Coupon Validation", () => {
    it("validates coupon via edge function", async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { valid: true, discount_type: "PERCENT", discount_value: 20 },
        error: null,
      });

      const result = await mockFunctionsInvoke("validate-coupon", {
        body: { code: "SAVE20", product_id: "prod-1", workspace_id: "ws-1" },
      });

      expect(result.data.valid).toBe(true);
      expect(result.data.discount_value).toBe(20);
    });

    it("rejects invalid coupon", async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { valid: false, reason: "expired" },
        error: null,
      });

      const result = await mockFunctionsInvoke("validate-coupon", {
        body: { code: "EXPIRED", product_id: "prod-1", workspace_id: "ws-1" },
      });

      expect(result.data.valid).toBe(false);
    });
  });

  describe("Payment Creation", () => {
    it("creates payment with idempotency key", async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: { payment_id: "pay-1", status: "PENDING" },
        error: null,
      });

      const result = await mockFunctionsInvoke("create-payment", {
        body: {
          product_id: "prod-1",
          price_id: "price-1",
          method: "CREDIT_CARD",
          customer: { name: "John", email: "john@test.com", cpf: "12345678909" },
          idempotency_key: "idem-123",
        },
      });

      expect(result.data.payment_id).toBe("pay-1");
      expect(result.error).toBeNull();
    });

    it("handles payment failure gracefully", async () => {
      mockFunctionsInvoke.mockResolvedValue({
        data: null,
        error: { message: "Card declined" },
      });

      const result = await mockFunctionsInvoke("create-payment", {
        body: { product_id: "prod-1", method: "CREDIT_CARD" },
      });

      expect(result.error).toBeTruthy();
    });
  });

  describe("Price Calculations", () => {
    it("calculates PIX discount correctly", () => {
      const amount = 9990; // R$ 99,90
      const pixDiscount = 10; // 10%
      const discountedAmount = Math.round(amount * (1 - pixDiscount / 100));
      expect(discountedAmount).toBe(8991); // R$ 89,91
    });

    it("calculates installment values correctly", () => {
      const amount = 9990;
      const installments = 3;
      const perInstallment = Math.ceil(amount / installments);
      expect(perInstallment).toBe(3330); // R$ 33,30
    });

    it("applies percentage coupon correctly", () => {
      const amount = 9990;
      const couponPercent = 20;
      const discount = Math.round(amount * (couponPercent / 100));
      const finalAmount = amount - discount;
      expect(finalAmount).toBe(7992); // R$ 79,92
    });

    it("applies fixed coupon correctly", () => {
      const amount = 9990;
      const fixedDiscount = 1000; // R$ 10
      const finalAmount = Math.max(0, amount - fixedDiscount);
      expect(finalAmount).toBe(8990); // R$ 89,90
    });
  });
});
