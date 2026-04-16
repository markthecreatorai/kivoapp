/**
 * Unified price display logic — Single Source of Truth
 *
 * Rules:
 * - Free products (null/undefined/zero amount, or LEAD_MAGNET type) → "Grátis" or hidden
 * - Paid products → BRL formatted value
 * - Same function used in admin cards, preview, public storefront, checkout
 */

export interface PriceDisplayInput {
  amount?: number | null;
  currency?: string | null;
  productType?: string | null;
  formatId?: string | null; // from metadata.format_id
}

export interface PriceDisplayResult {
  isFree: boolean;
  label: string | null; // null means hide entirely
}

/**
 * Returns the display label for a product price.
 * - Affiliates: always hidden (null)
 * - Free/Lead Magnet: "Grátis"
 * - Paid: formatted BRL string
 */
export function getDisplayPrice(input: PriceDisplayInput): PriceDisplayResult {
  // Affiliate products never show price
  if (input.formatId === 'affiliate') {
    return { isFree: false, label: null };
  }

  const isFree =
    !input.amount ||
    input.amount <= 0 ||
    input.productType === 'LEAD_MAGNET';

  if (isFree) {
    return { isFree: true, label: 'Grátis' };
  }

  const label = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: input.currency || 'BRL',
  }).format(input.amount!);

  return { isFree: false, label };
}
