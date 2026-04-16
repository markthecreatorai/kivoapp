/**
 * Storefront Design System — Single Source of Truth
 *
 * All storefront surfaces (admin preview, public storefront, checkout entry)
 * MUST use these tokens. No hardcoded values in components.
 */

// ─── Spacing Scale (4/8 base) ────────────────────────────────────────────────
export const SPACING = {
  xs: '0.25rem',   // 4px
  sm: '0.5rem',    // 8px
  md: '1rem',      // 16px
  lg: '1.5rem',    // 24px
  xl: '2rem',      // 32px
  '2xl': '3rem',   // 48px
  '3xl': '4rem',   // 64px
} as const;

// ─── Typography ──────────────────────────────────────────────────────────────
export const TYPOGRAPHY = {
  fontFamily: {
    fallback: "'Inter', system-ui, sans-serif",
  },
  size: {
    xs: '0.75rem',    // 12px
    sm: '0.8125rem',  // 13px
    base: '0.875rem', // 14px
    md: '1rem',       // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
  },
  weight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
  lineHeight: {
    tight: '1.25',
    normal: '1.5',
    relaxed: '1.625',
  },
} as const;

// ─── Border Radius ───────────────────────────────────────────────────────────
export function getButtonRadius(style?: string | null): string {
  switch (style) {
    case 'pill': return '9999px';
    case 'square': return '0px';
    default: return '0.75rem';
  }
}

export function getCardRadius(style?: string | null): string {
  switch (style) {
    case 'pill': return '1.25rem';
    case 'square': return '0.25rem';
    default: return '0.75rem';
  }
}

// ─── Shadows ─────────────────────────────────────────────────────────────────
export const SHADOWS = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
  lg: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  card: '0 1px 3px 0 rgb(0 0 0 / 0.08)',
} as const;

// ─── Focus Ring ──────────────────────────────────────────────────────────────
export const FOCUS_RING =
  'outline-none ring-2 ring-offset-2 ring-offset-transparent';

export function focusRingStyle(primaryColor: string) {
  return {
    outline: 'none',
    boxShadow: `0 0 0 2px ${primaryColor}40`,
  };
}

// ─── Interaction States ──────────────────────────────────────────────────────
export const STATE_CLASSES = {
  hover: 'hover:opacity-90 transition-all',
  active: 'active:scale-[0.98] transition-transform',
  disabled: 'opacity-50 cursor-not-allowed pointer-events-none',
  loading: 'opacity-70 cursor-wait',
} as const;

// ─── Contrast Helpers (WCAG AA) ──────────────────────────────────────────────

/** Parse hex to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return [r, g, b];
}

/** Relative luminance per WCAG 2.1 */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** Contrast ratio between two hex colors */
export function contrastRatio(hex1: string, hex2: string): number {
  try {
    const l1 = luminance(...hexToRgb(hex1));
    const l2 = luminance(...hexToRgb(hex2));
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return 1;
  }
}

/**
 * Returns a text color that guarantees WCAG AA contrast (4.5:1) against bg.
 * If the provided textColor already passes, returns it unchanged.
 * Otherwise returns #ffffff or #111111 as fallback.
 */
export function ensureContrast(
  textColor: string,
  bgColor: string,
  minRatio = 4.5
): string {
  if (contrastRatio(textColor, bgColor) >= minRatio) return textColor;
  // Pick whichever (white or near-black) has better contrast
  const whiteRatio = contrastRatio('#ffffff', bgColor);
  const blackRatio = contrastRatio('#111111', bgColor);
  return whiteRatio > blackRatio ? '#ffffff' : '#111111';
}

/**
 * Ensures CTA button text has good contrast against button bg.
 * Returns 'white' or 'dark' text color.
 */
export function ctaTextColor(buttonBg: string): string {
  return contrastRatio('#ffffff', buttonBg) >= 3 ? '#ffffff' : '#111111';
}

// ─── Theme Token Resolution ──────────────────────────────────────────────────

export interface StorefrontDesignTokens {
  // Colors
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  textSecondaryColor: string;
  borderColor: string;
  surfaceColor: string;
  ctaTextColor: string;
  /** Contrast-safe color for price labels on background */
  priceLabelColor: string;
  // Typography
  fontFamily: string;
  // Radius
  buttonRadius: string;
  cardRadius: string;
  // Spacing
  blockGap: string;
  contentPadding: string;
  // Shadows
  cardShadow: string;
  // Button style key
  buttonStyle: string;
}

/**
 * Resolves raw theme data into normalized design tokens.
 * Applies contrast fallbacks automatically.
 */
export function resolveTokens(raw: {
  primary_color?: string | null;
  background_color?: string | null;
  text_color?: string | null;
  font_body?: string | null;
  button_style?: string | null;
}): StorefrontDesignTokens {
  const bg = raw.background_color || '#ffffff';
  const primary = raw.primary_color || '#F9423A';
  const text = ensureContrast(raw.text_color || '#1a1a1a', bg);
  const font = raw.font_body || 'Inter';
  const btnStyle = raw.button_style || 'rounded';

  // Detect dark theme: bg luminance < 0.2
  const bgLum = relativeLuminanceHex(bg);
  const isDark = bgLum < 0.2;

  // Price label: primary on bg, ensure AA (4.5:1)
  const priceLbl = ensureContrast(primary, bg, 4.5);

  // Secondary text: for dark themes use higher opacity (85%), light uses 70%
  const secondaryAlpha = isDark ? 'D9' : 'B3';
  // Border: dark themes need more visible borders (20% vs 10%)
  const borderAlpha = isDark ? '33' : '1A';
  // Surface: dark themes need stronger card differentiation (8% vs 3%)
  const surfaceAlpha = isDark ? '14' : '08';

  return {
    primaryColor: primary,
    backgroundColor: bg,
    textColor: text,
    textSecondaryColor: text + secondaryAlpha,
    borderColor: text + borderAlpha,
    surfaceColor: text + surfaceAlpha,
    ctaTextColor: ctaTextColor(primary),
    priceLabelColor: priceLbl,
    fontFamily: `'${font}', ${TYPOGRAPHY.fontFamily.fallback}`,
    buttonRadius: getButtonRadius(btnStyle),
    cardRadius: getCardRadius(btnStyle),
    blockGap: SPACING.md,
    contentPadding: SPACING.lg,
    cardShadow: SHADOWS.card,
    buttonStyle: btnStyle,
  };
}

/** Relative luminance from hex */
function relativeLuminanceHex(hex: string): number {
  const h = hex.replace('#', '');
  const vals = [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ].map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2];
}
