import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { resolveTokens, SPACING, TYPOGRAPHY, STATE_CLASSES, type StorefrontDesignTokens } from "@/lib/storefront-tokens";
import { getDisplayPrice } from "@/lib/formatPrice";
import { resolveProductDisplay } from "@/lib/productDisplayRules";
import {
  getPreset,
  blockGap,
  cardPadding,
  mediaHeight,
  cardStyleCSS,
  ctaStyleCSS,
  headerClasses,
  socialAlignment,
} from "@/lib/storefront-layout-presets";
import { 
  Instagram, 
  Youtube, 
  Twitter,
  Play,
  MessageCircle,
  ImageIcon,
} from "lucide-react";
import type { StorefrontData, StorefrontTheme, StorefrontBlock } from "@/pages/StorefrontEditor";

const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

interface StorefrontPreviewProps {
  storefront: StorefrontData;
  theme: StorefrontTheme | null | undefined;
  blocks: StorefrontBlock[];
  products?: any[];
}

// ─── Social Link Button ──────────────────────────────────────────────────────
function SocialLink({ href, icon: Icon, tokens }: { href: string; icon: React.ElementType; tokens: StorefrontDesignTokens }) {
  const url = href.startsWith('http') ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn("p-2 rounded-full transition-colors", STATE_CLASSES.hover)}
      style={{ backgroundColor: tokens.surfaceColor, color: tokens.textColor }}
      aria-label="Social link"
    >
      <Icon className="h-4 w-4" />
    </a>
  );
}

function SocialIcons({ links, tokens, className }: { links: Record<string, string>; tokens: StorefrontDesignTokens; className?: string }) {
  const platforms: { key: string; icon: React.ElementType }[] = [
    { key: 'instagram', icon: Instagram },
    { key: 'tiktok', icon: TikTokIcon },
    { key: 'youtube', icon: Youtube },
    { key: 'twitter', icon: Twitter },
  ];
  const visible = platforms.filter(p => links[p.key]);
  if (visible.length === 0) return null;
  return (
    <div className={cn("flex gap-2.5", className)}>
      {visible.map(p => (
        <SocialLink key={p.key} href={links[p.key]} icon={p.icon} tokens={tokens} />
      ))}
    </div>
  );
}

// ─── Main Preview Component ──────────────────────────────────────────────────
// Layout Contract v2: same semantic block order, varied presentation via presets.
export function StorefrontPreview({ storefront, theme, blocks, products: externalProducts }: StorefrontPreviewProps) {
  const tokens = resolveTokens({
    primary_color: theme?.primary_color,
    background_color: theme?.background_color,
    text_color: theme?.text_color,
    font_body: theme?.font_body,
    button_style: theme?.button_style,
  });

  const preset = useMemo(() => getPreset(theme?.template_key), [theme?.template_key]);
  const gap = blockGap(preset.contentDensity);
  const pad = cardPadding(preset.contentDensity);
  const imgH = mediaHeight(preset.mediaEmphasis);

  // Fetch products for product blocks
  const productIds = blocks
    .filter(b => b.type === 'product' && b.is_visible)
    .map(b => (b.config as { product_id?: string }).product_id)
    .filter(Boolean) as string[];

  const { data: products = [] } = useQuery({
    queryKey: ['preview-products', productIds],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      const { data } = await supabase
        .from('products')
        .select('id, name, thumbnail_url, short_description, listing_button_text')
        .in('id', productIds);
      return data || [];
    },
    enabled: productIds.length > 0
  });

  const visibleBlocks = blocks.filter(b => b.is_visible).sort((a, b) => a.position - b.position);
  const socialLinks: Record<string, string> = (typeof storefront.social_links === 'object' && storefront.social_links !== null) ? storefront.social_links as Record<string, string> : {};

  // ─── Product Card (reused for blocks + extra products) ───────────────────
  const renderProductCard = (product: any, overrideDisplay?: ReturnType<typeof resolveProductDisplay>) => {
    const display = overrideDisplay || resolveProductDisplay({
      productType: product.type,
      formatId: (product.metadata as any)?.format_id,
      amount: null,
      currency: null,
      customCTA: product.listing_button_text,
    });

    return (
    <div 
      className="w-full overflow-hidden"
      style={{ 
        borderRadius: tokens.cardRadius,
        ...cardStyleCSS(preset.cardStyle, tokens.borderColor, tokens.surfaceColor),
      }}
    >
      {preset.mediaEmphasis !== 'minimal' ? (
        product.thumbnail_url ? (
          <img 
            src={product.thumbnail_url} 
            alt={product.name}
            className="w-full object-cover"
            style={{ height: imgH }}
            loading="lazy"
          />
        ) : (
          <div className="w-full flex items-center justify-center" style={{ height: imgH, backgroundColor: tokens.surfaceColor }}>
            <ImageIcon className="h-8 w-8" style={{ color: tokens.textSecondaryColor }} />
          </div>
        )
      ) : (
        product.thumbnail_url ? (
          <div style={{ padding: `${pad} ${pad} 0` }}>
            <img 
              src={product.thumbnail_url} 
              alt={product.name}
              className="w-12 h-12 rounded-lg object-cover"
              loading="lazy"
            />
          </div>
        ) : null
      )}
      <div style={{ padding: pad }}>
        <p className="font-semibold" style={{ color: tokens.textColor, fontSize: TYPOGRAPHY.size.base }}>
          {product.name || 'Produto'}
        </p>
        {display.rules.showDescription && product.short_description && (
          <p className="mt-1 line-clamp-2" style={{ color: tokens.textSecondaryColor, fontSize: TYPOGRAPHY.size.sm }}>
            {product.short_description}
          </p>
        )}
        {display.price.label && (
          <p className="mt-0.5" style={{ 
            color: display.price.isFree ? tokens.primaryColor : tokens.textSecondaryColor, 
            fontSize: TYPOGRAPHY.size.xs,
            fontWeight: display.price.isFree ? TYPOGRAPHY.weight.semibold : TYPOGRAPHY.weight.normal,
          }}>
            {display.price.label}
          </p>
        )}
        <button
          className={cn(
            "w-full mt-3 py-2.5 font-medium transition-all min-h-[44px]",
            STATE_CLASSES.hover,
            STATE_CLASSES.active,
            "focus-visible:ring-2 focus-visible:ring-offset-2"
          )}
          style={{ 
            borderRadius: tokens.buttonRadius,
            fontSize: TYPOGRAPHY.size.sm,
            ...ctaStyleCSS(preset.ctaStyle, tokens.primaryColor, tokens.ctaTextColor),
          }}
        >
          {display.ctaText}
        </button>
      </div>
    </div>
    );
  };

  // ─── Block Renderer ──────────────────────────────────────────────────────
  const renderBlock = (block: StorefrontBlock) => {
    const config = block.config as Record<string, unknown>;

    switch (block.type) {
      case 'link':
        if (!config.url) return null;
        return (
          <a
            href={config.url as string || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block w-full py-3 px-4 text-center font-medium transition-all",
              STATE_CLASSES.active,
              "focus-visible:ring-2 focus-visible:ring-offset-2"
            )}
            style={{ 
              color: tokens.textColor,
              borderRadius: tokens.buttonRadius,
              fontSize: TYPOGRAPHY.size.sm,
              ...ctaStyleCSS('outline', tokens.primaryColor, tokens.ctaTextColor),
            }}
          >
            {config.title as string || 'Link'}
          </a>
        );

      case 'product': {
        const product = products.find(p => p.id === config.product_id);
        if (!product) return null;
        return renderProductCard(product);
      }

      case 'lead_form':
        return (
          <div 
            className="w-full"
            style={{ 
              borderRadius: tokens.cardRadius,
              padding: pad,
              ...cardStyleCSS(preset.cardStyle, tokens.borderColor, tokens.surfaceColor),
            }}
          >
            <p className="font-semibold mb-3" style={{ color: tokens.textColor, fontSize: TYPOGRAPHY.size.base }}>
              {config.title as string || 'Inscreva-se'}
            </p>
            <label className="sr-only" htmlFor="preview-email">E-mail</label>
            <input
              id="preview-email"
              type="email"
              placeholder="Seu melhor email"
              aria-label="Seu melhor email"
              className="w-full px-3 py-2.5 border mb-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1 min-h-[44px]"
              style={{ 
                borderColor: tokens.borderColor, 
                backgroundColor: 'transparent', 
                color: tokens.textColor,
                borderRadius: tokens.buttonRadius,
              }}
            />
            <button
              className={cn("w-full py-2.5 font-medium transition-all min-h-[44px]", STATE_CLASSES.hover, "focus-visible:ring-2 focus-visible:ring-offset-2")}
              style={{ 
                borderRadius: tokens.buttonRadius,
                fontSize: TYPOGRAPHY.size.sm,
                ...ctaStyleCSS(preset.ctaStyle, tokens.primaryColor, tokens.ctaTextColor),
              }}
            >
              {config.button_text as string || 'Enviar'}
            </button>
          </div>
        );

      case 'video': {
        const videoUrl = config.url as string;
        const videoId = videoUrl?.includes('youtube') 
          ? videoUrl.split('v=')[1]?.split('&')[0]
          : videoUrl?.includes('vimeo')
          ? videoUrl.split('/').pop()
          : null;

        return (
          <div className="w-full aspect-video overflow-hidden" style={{ borderRadius: tokens.cardRadius }}>
            {videoId && videoUrl?.includes('youtube') ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                className="w-full h-full"
                allowFullScreen
                title="Video"
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: tokens.surfaceColor }}
              >
                <Play className="h-8 w-8" style={{ color: tokens.primaryColor }} />
              </div>
            )}
          </div>
        );
      }

      case 'text': {
        const isHeading = config.variant === 'heading';
        return (
          <p 
            className={cn("w-full", preset.headerAlignment === 'left' ? 'text-left' : 'text-center')}
            style={{ 
              color: tokens.textColor,
              fontSize: isHeading ? TYPOGRAPHY.size.lg : TYPOGRAPHY.size.sm,
              fontWeight: isHeading ? TYPOGRAPHY.weight.bold : TYPOGRAPHY.weight.normal,
              lineHeight: TYPOGRAPHY.lineHeight.normal,
              opacity: isHeading ? 1 : 0.8,
            }}
          >
            {config.content as string || 'Texto aqui'}
          </p>
        );
      }

      case 'whatsapp': {
        const phone = config.phone as string;
        const message = encodeURIComponent(config.message as string || '');
        return (
          <a
            href={`https://wa.me/${phone}?text=${message}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full py-3 px-4 flex items-center justify-center gap-2 font-medium text-white min-h-[44px]",
              STATE_CLASSES.active,
              "focus-visible:ring-2 focus-visible:ring-offset-2"
            )}
            style={{ backgroundColor: '#25D366', borderRadius: tokens.buttonRadius }}
          >
            <MessageCircle className="h-5 w-5" />
            Chamar no WhatsApp
          </a>
        );
      }

      case 'divider':
        return (
          <div 
            className="w-full h-px"
            style={{ backgroundColor: tokens.borderColor, margin: `${SPACING.sm} 0` }}
          />
        );

      case 'countdown': {
        const targetDate = new Date(config.target_date as string);
        const now = new Date();
        const diff = targetDate.getTime() - now.getTime();
        const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        const hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
        const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));

        return (
          <div 
            className="w-full p-4 text-center"
            style={{ backgroundColor: tokens.surfaceColor, borderRadius: tokens.cardRadius }}
          >
            <p style={{ color: tokens.textColor, fontSize: TYPOGRAPHY.size.sm, marginBottom: SPACING.sm }}>
              {config.label as string || 'Termina em'}
            </p>
            <div className="flex justify-center gap-3">
              {[
                { value: days, label: 'dias' },
                { value: hours, label: 'horas' },
                { value: minutes, label: 'min' },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <span 
                    className="text-2xl font-bold"
                    style={{ color: tokens.primaryColor }}
                  >
                    {String(item.value).padStart(2, '0')}
                  </span>
                  <p style={{ color: tokens.textColor, fontSize: TYPOGRAPHY.size.xs }}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  // ─── Visibility flags (consistent in preview + public) ───
  const showAvatar = !!storefront.avatar_url;
  const showBio = !!storefront.bio?.trim();
  const initials = storefront.title?.charAt(0)?.toUpperCase() || 'K';

  return (
    <div 
      className="w-full h-full relative"
      style={{ backgroundColor: tokens.backgroundColor, fontFamily: tokens.fontFamily }}
    >
      <div 
        className="w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `.no-scrollbars::-webkit-scrollbar { display: none; }` }} />
        <div className="no-scrollbars w-full h-full relative z-10">

        {/* ─── HEADER (alignment varies per preset) ─── */}
        <div className={headerClasses(preset.headerAlignment)} style={{ padding: `${SPACING.xl} ${SPACING.lg} 0`, marginBottom: gap }}>
          {showAvatar ? (
            <Avatar className="h-20 w-20 mb-3 ring-4 ring-white/80 shadow-lg">
              <AvatarImage src={storefront.avatar_url!} />
              <AvatarFallback className="text-2xl" style={{ backgroundColor: tokens.primaryColor, color: tokens.ctaTextColor }}>
                {initials}
              </AvatarFallback>
            </Avatar>
          ) : (
            <div
              className="h-16 w-16 rounded-full mb-3 flex items-center justify-center text-xl font-bold shadow-md"
              style={{ backgroundColor: tokens.primaryColor, color: tokens.ctaTextColor }}
            >
              {initials}
            </div>
          )}
          <h1 style={{ 
            color: tokens.textColor, 
            fontSize: TYPOGRAPHY.size.xl, 
            fontWeight: TYPOGRAPHY.weight.bold,
            lineHeight: TYPOGRAPHY.lineHeight.tight,
          }}>
            {storefront.title || 'Seu Nome'}
          </h1>
          {showBio && (
            <p className="mt-1.5 leading-relaxed max-w-[85%]" style={{ 
              color: tokens.textSecondaryColor, 
              fontSize: TYPOGRAPHY.size.sm,
              lineHeight: TYPOGRAPHY.lineHeight.relaxed,
            }}>
              {storefront.bio}
            </p>
          )}
          <SocialIcons links={socialLinks} tokens={tokens} className={cn("mt-3", socialAlignment(preset.headerAlignment))} />
        </div>

        {/* ─── Blocks ─── */}
        <div className="flex flex-col w-full relative z-20" style={{ gap, padding: `0 ${SPACING.lg}` }}>
          {visibleBlocks.length === 0 ? (
            <p className={cn("py-8", preset.headerAlignment === 'left' ? 'text-left' : 'text-center')} style={{ color: tokens.textSecondaryColor, fontSize: TYPOGRAPHY.size.sm }}>
              Adicione blocos para personalizar
            </p>
          ) : (
            visibleBlocks.map((block) => (
              <div key={block.id} className="w-full relative">
                {renderBlock(block)}
              </div>
            ))
          )}
        </div>

        {/* ─── Extra Products (not in blocks) ─── */}
        {externalProducts && (() => {
          const blockProductIds = blocks
            .filter(b => b.type === 'product' && b.is_visible)
            .map(b => (b.config as { product_id?: string }).product_id)
            .filter(Boolean);
          const filtered = externalProducts.filter(
            (p: any) => p.status === 'PUBLISHED' && !blockProductIds.includes(p.id)
          );
          return filtered.length > 0 ? (
            <div className="flex flex-col w-full relative z-20" style={{ gap, padding: `${gap} ${SPACING.lg} 0` }}>
              {filtered.map((product: any) => {
                const price = product.prices?.find((p: any) => p.is_default && p.is_active);
                const display = resolveProductDisplay({
                  productType: product.type,
                  formatId: (product.metadata as any)?.format_id,
                  amount: price?.amount,
                  currency: price?.currency,
                  customCTA: product.listing_button_text,
                });
                return (
                  <div key={product.id} className="w-full">
                    {renderProductCard(product, display)}
                  </div>
                );
              })}
            </div>
          ) : null;
        })()}

        {/* ─── Footer ─── */}
        <div className={cn("mt-8 mb-4", preset.headerAlignment === 'left' ? 'text-left pl-6' : 'text-center')}>
          <p style={{ color: tokens.textSecondaryColor, fontSize: TYPOGRAPHY.size.xs, opacity: 0.5, fontWeight: TYPOGRAPHY.weight.medium }}>
            Feito com ❤️ na Kivo
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
