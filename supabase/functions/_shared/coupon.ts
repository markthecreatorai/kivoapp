/**
 * Shared coupon logic — single source of truth for validate-coupon and create-payment.
 *
 * Money is stored in BRL (reais, numeric), so every amount here is in reais.
 *
 * DISCOUNT ORDER (must match the frontend in src/lib/checkout-totals.ts):
 *   1. subtotal   = price + order bumps
 *   2. coupon     applied over the subtotal
 *   3. PIX        percentage applied over (subtotal - coupon discount)
 */

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CouponRecord {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  max_uses_per_customer: number;
  current_uses: number;
  applies_to_product_ids: string[] | null;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
}

export interface CouponResolution {
  valid: boolean;
  error?: string;
  coupon?: CouponRecord;
  discount: number;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Discount for a coupon over a given base amount, never exceeding the base. */
export function computeCouponDiscount(
  coupon: Pick<CouponRecord, "type" | "value">,
  base: number,
): number {
  const amount = coupon.type === "PERCENT"
    ? round2(base * (Number(coupon.value) / 100))
    : round2(Number(coupon.value));
  return Math.max(0, Math.min(amount, round2(base)));
}

/** PIX percentage applied AFTER the coupon. */
export function computePixDiscount(
  amountAfterCoupon: number,
  pixDiscountPercent: number | null | undefined,
): number {
  if (!pixDiscountPercent) return 0;
  return round2(Math.max(0, amountAfterCoupon) * (Number(pixDiscountPercent) / 100));
}

/**
 * Validates a coupon code against the database and returns the discount.
 * Used by validate-coupon (preview) and create-payment (authoritative re-check).
 */
export async function resolveCoupon(
  supabase: any,
  params: {
    code: string;
    workspaceId: string;
    orderAmount: number;
    customerEmail?: string | null;
    /** Product being purchased — required to honour product-restricted coupons. */
    productId?: string | null;
  },
): Promise<CouponResolution> {
  const code = String(params.code || "").trim().toUpperCase();
  if (!code || !params.workspaceId) {
    return { valid: false, error: "Código e workspace são obrigatórios", discount: 0 };
  }

  const { data: coupon } = await supabase
    .from("coupons")
    .select(
      "id, code, type, value, min_order_amount, max_uses, max_uses_per_customer, current_uses, valid_from, valid_until, is_active, applies_to_product_ids",
    )
    .eq("workspace_id", params.workspaceId)
    .eq("code", code)
    .maybeSingle();

  // Scoped by workspace_id above: a coupon from another workspace simply is not found.
  if (!coupon) return { valid: false, error: "Cupom inválido", discount: 0 };
  if (!coupon.is_active) return { valid: false, error: "Cupom inativo", discount: 0 };

  const now = new Date();
  if (new Date(coupon.valid_from) > now) {
    return { valid: false, error: "Cupom ainda não está válido", discount: 0 };
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return { valid: false, error: "Cupom expirado", discount: 0 };
  }
  if (coupon.max_uses !== null) {
    // Trust the real usage rows, not only the denormalized counter.
    const { count: globalUses } = await supabase
      .from("coupon_usages")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id);
    const used = Math.max(Number(coupon.current_uses || 0), globalUses ?? 0);
    if (used >= coupon.max_uses) {
      return { valid: false, error: "Cupom atingiu o limite de usos", discount: 0 };
    }
  }

  // Product-restricted coupons: empty/NULL list = valid for every product.
  const restricted = coupon.applies_to_product_ids;
  if (restricted && restricted.length > 0) {
    if (!params.productId || !restricted.includes(params.productId)) {
      return { valid: false, error: "Cupom não válido para este produto", discount: 0 };
    }
  }

  if (params.customerEmail) {
    const { count } = await supabase
      .from("coupon_usages")
      .select("id", { count: "exact", head: true })
      .eq("coupon_id", coupon.id)
      .eq("customer_email", params.customerEmail.toLowerCase());
    if ((count ?? 0) >= coupon.max_uses_per_customer) {
      return { valid: false, error: "Você já usou este cupom", discount: 0 };
    }
  }

  const orderAmount = Number(params.orderAmount || 0);
  if (coupon.min_order_amount && orderAmount < Number(coupon.min_order_amount)) {
    return {
      valid: false,
      error: `Pedido mínimo de ${brl(Number(coupon.min_order_amount))}`,
      discount: 0,
    };
  }

  return { valid: true, coupon, discount: computeCouponDiscount(coupon, orderAmount) };
}
