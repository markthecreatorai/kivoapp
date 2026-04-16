/**
 * Layout Contract v2 — Flexible Presets
 *
 * Each template declares a preset that controls presentation *within*
 * the fixed semantic block order (Header → Highlight → Products → Footer).
 *
 * Allowed axes of variation:
 *   - headerAlignment: 'center' | 'left'
 *   - contentDensity:  'compact' | 'medium' | 'comfortable'
 *   - cardStyle:       'flat' | 'outlined' | 'elevated'
 *   - mediaEmphasis:   'high' | 'balanced' | 'minimal'
 *   - ctaStyle:        'solid' | 'subtle' | 'outline'
 *
 * Fixed (NEVER varies):
 *   - Semantic order: name → description → price/grátis → CTA
 *   - Min contrast: WCAG AA (4.5:1)
 *   - Min touch target: 44px
 *   - Price logic: paid = BRL, free/lead = "Grátis"
 */

export type HeaderAlignment = 'center' | 'left';
export type ContentDensity = 'compact' | 'medium' | 'comfortable';
export type CardStyle = 'flat' | 'outlined' | 'elevated';
export type MediaEmphasis = 'high' | 'balanced' | 'minimal';
export type CtaStyle = 'solid' | 'subtle' | 'outline';

export interface LayoutPreset {
  headerAlignment: HeaderAlignment;
  contentDensity: ContentDensity;
  cardStyle: CardStyle;
  mediaEmphasis: MediaEmphasis;
  ctaStyle: CtaStyle;
}

// ─── Preset Map (keyed by template_key) ──────────────────────────────────────
export const TEMPLATE_PRESETS: Record<string, LayoutPreset> = {
  noir:      { headerAlignment: 'center', contentDensity: 'medium',      cardStyle: 'elevated',  mediaEmphasis: 'balanced', ctaStyle: 'solid'   },
  terra:     { headerAlignment: 'left',   contentDensity: 'comfortable', cardStyle: 'flat',      mediaEmphasis: 'high',     ctaStyle: 'subtle'  },
  petala:    { headerAlignment: 'center', contentDensity: 'comfortable', cardStyle: 'outlined',  mediaEmphasis: 'high',     ctaStyle: 'solid'   },
  moderno:   { headerAlignment: 'center', contentDensity: 'medium',      cardStyle: 'outlined',  mediaEmphasis: 'balanced', ctaStyle: 'solid'   },
  classic:   { headerAlignment: 'center', contentDensity: 'medium',      cardStyle: 'elevated',  mediaEmphasis: 'balanced', ctaStyle: 'solid'   },
  coaching:  { headerAlignment: 'left',   contentDensity: 'comfortable', cardStyle: 'elevated',  mediaEmphasis: 'high',     ctaStyle: 'solid'   },
  eclipse:   { headerAlignment: 'center', contentDensity: 'compact',     cardStyle: 'flat',      mediaEmphasis: 'minimal',  ctaStyle: 'outline' },
  spotlight: { headerAlignment: 'center', contentDensity: 'compact',     cardStyle: 'flat',      mediaEmphasis: 'minimal',  ctaStyle: 'subtle'  },
  material:  { headerAlignment: 'center', contentDensity: 'medium',      cardStyle: 'elevated',  mediaEmphasis: 'balanced', ctaStyle: 'solid'   },
  nightview: { headerAlignment: 'left',   contentDensity: 'compact',     cardStyle: 'outlined',  mediaEmphasis: 'minimal',  ctaStyle: 'outline' },
  minima:    { headerAlignment: 'center', contentDensity: 'medium',      cardStyle: 'outlined',  mediaEmphasis: 'balanced', ctaStyle: 'solid'   },
};

const DEFAULT_PRESET: LayoutPreset = {
  headerAlignment: 'center',
  contentDensity: 'medium',
  cardStyle: 'outlined',
  mediaEmphasis: 'balanced',
  ctaStyle: 'solid',
};

export function getPreset(templateKey?: string | null): LayoutPreset {
  return TEMPLATE_PRESETS[templateKey || ''] || DEFAULT_PRESET;
}

// ─── Derived Style Helpers ───────────────────────────────────────────────────

/** Gap between blocks based on density */
export function blockGap(density: ContentDensity): string {
  switch (density) {
    case 'compact':     return '0.625rem'; // 10px
    case 'comfortable': return '1.125rem'; // 18px
    default:            return '0.875rem'; // 14px
  }
}

/** Card inner padding */
export function cardPadding(density: ContentDensity): string {
  switch (density) {
    case 'compact':     return '0.75rem';
    case 'comfortable': return '1.25rem';
    default:            return '1rem';
  }
}

/** Product image height inside card */
export function mediaHeight(emphasis: MediaEmphasis): string {
  switch (emphasis) {
    case 'high':    return '10rem'; // 160px
    case 'minimal': return '5rem';  // 80px
    default:        return '8rem';  // 128px — balanced
  }
}

/** Card border + shadow style based on cardStyle + dark awareness */
export function cardStyleCSS(
  style: CardStyle,
  borderColor: string,
  surfaceColor: string,
  bgColor?: string,
): React.CSSProperties {
  // Detect dark theme for better card separation
  const isDark = bgColor ? isDarkBg(bgColor) : false;

  switch (style) {
    case 'flat':
      return {
        backgroundColor: surfaceColor,
        border: isDark ? `1px solid ${borderColor}` : 'none',
        boxShadow: 'none',
      };
    case 'elevated':
      return {
        border: isDark ? `1px solid ${borderColor}` : 'none',
        boxShadow: isDark
          ? '0 4px 16px -4px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)'
          : '0 4px 16px -4px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)',
        backgroundColor: isDark ? surfaceColor : undefined,
      };
    case 'outlined':
    default:
      return { border: `1px solid ${borderColor}`, boxShadow: 'none' };
  }
}

function isDarkBg(hex: string): boolean {
  try {
    const h = hex.replace('#', '');
    const [r, g, b] = [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)]
      .map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 0.2;
  } catch { return false; }
}

/** CTA button style — with contrast-safe text for subtle/outline */
export function ctaStyleCSS(
  style: CtaStyle,
  primaryColor: string,
  ctaTextColor: string,
  bgColor?: string,
): React.CSSProperties {
  switch (style) {
    case 'subtle': {
      const tintBg = primaryColor + '18';
      // For subtle: if primary on bg doesn't have enough contrast, darken text
      const safeColor = bgColor ? ensureContrastForCta(primaryColor, bgColor) : primaryColor;
      return { backgroundColor: tintBg, color: safeColor, border: 'none' };
    }
    case 'outline': {
      const safeColor = bgColor ? ensureContrastForCta(primaryColor, bgColor) : primaryColor;
      return { backgroundColor: 'transparent', color: safeColor, border: `2px solid ${primaryColor}` };
    }
    case 'solid':
    default:
      return { backgroundColor: primaryColor, color: ctaTextColor, border: 'none' };
  }
}

/** Ensure CTA text meets AA for large text (3:1) against bg */
function ensureContrastForCta(color: string, bg: string): string {
  const ratio = contrastRatioSimple(color, bg);
  if (ratio >= 3) return color;
  // Darken or lighten the color
  const bgLum = relativeLuminance(bg);
  return bgLum > 0.5 ? darkenUntilContrast(color, bg, 3) : lightenUntilContrast(color, bg, 3);
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatioSimple(a: string, b: string): number {
  try {
    const la = relativeLuminance(a), lb = relativeLuminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  } catch { return 1; }
}

function darkenUntilContrast(color: string, bg: string, target: number): string {
  let rgb = hexToRgb(color);
  for (let i = 0; i < 40; i++) {
    rgb = rgb.map(c => Math.max(0, c - 6)) as [number, number, number];
    if (contrastRatioSimple(rgbToHex(...rgb), bg) >= target) return rgbToHex(...rgb);
  }
  return rgbToHex(...rgb);
}

function lightenUntilContrast(color: string, bg: string, target: number): string {
  let rgb = hexToRgb(color);
  for (let i = 0; i < 40; i++) {
    rgb = rgb.map(c => Math.min(255, c + 6)) as [number, number, number];
    if (contrastRatioSimple(rgbToHex(...rgb), bg) >= target) return rgbToHex(...rgb);
  }
  return rgbToHex(...rgb);
}

/** Header alignment classes */
export function headerClasses(alignment: HeaderAlignment): string {
  return alignment === 'left'
    ? 'flex flex-col items-start text-left'
    : 'flex flex-col items-center text-center';
}

/** Social icons alignment */
export function socialAlignment(alignment: HeaderAlignment): string {
  return alignment === 'left' ? 'justify-start' : 'justify-center';
}
