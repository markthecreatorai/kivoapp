/**
 * Product Display Rules — Single Source of Truth
 *
 * Declarative matrix controlling how each product type renders across
 * ALL surfaces: admin cards, preview, public storefront, checkout entry.
 *
 * Consumers call `getProductDisplayRules()` and render accordingly.
 * Combined with `getDisplayPrice()` for the final price label.
 */

import { getDisplayPrice, type PriceDisplayResult } from './formatPrice';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PriceLabelMode = 'money' | 'free' | 'hidden';
export type MediaPriority = 'high' | 'balanced' | 'minimal';

export interface ProductDisplayRules {
  /** Whether to show the price label at all */
  showPrice: boolean;
  /** How the price label should render */
  priceLabelMode: PriceLabelMode;
  /** Default CTA text (used when product has no custom listing_button_text) */
  defaultCTA: string;
  /** Whether the creator can override the CTA text */
  allowCustomCTA: boolean;
  /** Whether to show the short_description */
  showDescription: boolean;
  /** How prominent media should be */
  mediaPriority: MediaPriority;
}

// ─── Static Matrix ───────────────────────────────────────────────────────────

const RULES: Record<string, ProductDisplayRules> = {
  LEAD_MAGNET: {
    showPrice: true,
    priceLabelMode: 'free',
    defaultCTA: 'Baixar grátis',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'balanced',
  },
  DIGITAL: {
    showPrice: true,
    priceLabelMode: 'money',
    defaultCTA: 'Comprar',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'high',
  },
  COURSE: {
    showPrice: true,
    priceLabelMode: 'money',
    defaultCTA: 'Acessar curso',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'high',
  },
  SUBSCRIPTION: {
    showPrice: true,
    priceLabelMode: 'money',
    defaultCTA: 'Assinar',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'balanced',
  },
  COACHING: {
    showPrice: true,
    priceLabelMode: 'money',
    defaultCTA: 'Agendar',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'balanced',
  },
  WEBINAR: {
    showPrice: true,
    priceLabelMode: 'money',
    defaultCTA: 'Participar',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'balanced',
  },
  AFFILIATE: {
    showPrice: false,
    priceLabelMode: 'hidden',
    defaultCTA: 'Ver oferta',
    allowCustomCTA: true,
    showDescription: true,
    mediaPriority: 'minimal',
  },
};

const DEFAULT_RULES: ProductDisplayRules = {
  showPrice: true,
  priceLabelMode: 'money',
  defaultCTA: 'Ver produto',
  allowCustomCTA: true,
  showDescription: true,
  mediaPriority: 'balanced',
};

// ─── Resolver ────────────────────────────────────────────────────────────────

/**
 * Returns the display rules for a product type.
 * Falls back to DEFAULT_RULES for unknown types.
 */
export function getProductDisplayRules(
  productType?: string | null,
  formatId?: string | null,
): ProductDisplayRules {
  // Affiliate is determined by formatId (metadata.format_id)
  if (formatId === 'affiliate') {
    return RULES.AFFILIATE;
  }
  return RULES[productType || ''] || DEFAULT_RULES;
}

// ─── Resolved Display (convenience) ─────────────────────────────────────────

export interface ResolvedProductDisplay {
  /** The rules for this product type */
  rules: ProductDisplayRules;
  /** Price display result (label + isFree) */
  price: PriceDisplayResult;
  /** The final CTA text to render */
  ctaText: string;
}

/**
 * One-call resolver: returns rules + price + CTA for a product.
 * Use this in components to avoid scattered logic.
 */
export function resolveProductDisplay(input: {
  productType?: string | null;
  formatId?: string | null;
  amount?: number | null;
  currency?: string | null;
  customCTA?: string | null;
}): ResolvedProductDisplay {
  const rules = getProductDisplayRules(input.productType, input.formatId);

  // Override priceLabelMode based on actual amount for paid types
  // (handles edge case: paid type but amount is 0/null → treat as free)
  const priceDisplay = getDisplayPrice({
    amount: input.amount,
    currency: input.currency,
    productType: input.productType,
    formatId: input.formatId,
  });

  // If rules say hidden, always hide
  const finalPrice: PriceDisplayResult = rules.priceLabelMode === 'hidden'
    ? { isFree: false, label: null }
    : priceDisplay;

  // CTA: use custom if allowed and provided, else default
  const ctaText = (rules.allowCustomCTA && input.customCTA?.trim())
    ? input.customCTA.trim()
    : (priceDisplay.isFree && rules.priceLabelMode !== 'hidden')
      ? rules.defaultCTA  // free products get the type-specific free CTA
      : rules.defaultCTA;

  return { rules, price: finalPrice, ctaText };
}
