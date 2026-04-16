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

/** Card border + shadow style based on cardStyle */
export function cardStyleCSS(
  style: CardStyle,
  borderColor: string,
  surfaceColor: string,
): React.CSSProperties {
  switch (style) {
    case 'flat':
      return { border: 'none', backgroundColor: surfaceColor, boxShadow: 'none' };
    case 'elevated':
      return { border: 'none', boxShadow: '0 4px 16px -4px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)' };
    case 'outlined':
    default:
      return { border: `1px solid ${borderColor}`, boxShadow: 'none' };
  }
}

/** CTA button style */
export function ctaStyleCSS(
  style: CtaStyle,
  primaryColor: string,
  ctaTextColor: string,
): React.CSSProperties {
  switch (style) {
    case 'subtle':
      return { backgroundColor: primaryColor + '18', color: primaryColor, border: 'none' };
    case 'outline':
      return { backgroundColor: 'transparent', color: primaryColor, border: `2px solid ${primaryColor}` };
    case 'solid':
    default:
      return { backgroundColor: primaryColor, color: ctaTextColor, border: 'none' };
  }
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
