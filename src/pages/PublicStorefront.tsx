import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { getDisplayPrice } from "@/lib/formatPrice";
import { resolveProductDisplay } from "@/lib/productDisplayRules";
import { resolveTokens, SPACING, TYPOGRAPHY, STATE_CLASSES } from "@/lib/storefront-tokens";
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
  Loader2,
} from "lucide-react";
import kivoReferralLogo from "@/assets/kivo-referral-logo.png";

// TikTok icon
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
  </svg>
);

interface StorefrontRow {
  id: string;
  slug: string;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  social_links: Record<string, string> | null;
  workspace_id: string;
}

interface ThemeRow {
  primary_color: string | null;
  secondary_color: string | null;
  background_color: string | null;
  text_color: string | null;
  font_body: string | null;
  font_heading: string | null;
  button_style: string | null;
  template_key: string | null;
}

interface BlockRow {
  id: string;
  type: string;
  position: number;
  is_visible: boolean;
  config: Record<string, unknown>;
}

interface ProductInfo {
  id: string;
  name: string;
  slug: string;
  thumbnail_url: string | null;
  short_description: string | null;
  thumbnail_style: string | null;
  listing_button_text: string | null;
  delivery_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface PriceInfo {
  product_id: string;
  amount: number;
  currency: string | null;
}

// ─── Countdown with live ticking ───
function CountdownBlock({
  targetDate,
  label,
  primaryColor,
  textColor,
}: {
  targetDate: string;
  label: string;
  primaryColor: string;
  textColor: string;
}) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = Math.max(0, new Date(targetDate).getTime() - now);
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  return (
    <div className="w-full p-4 rounded-xl text-center" style={{ backgroundColor: primaryColor + "15" }}>
      <p className="text-sm mb-2" style={{ color: textColor }}>
        {label}
      </p>
      <div className="flex justify-center gap-3">
        {[
          { v: days, l: "dias" },
          { v: hours, l: "horas" },
          { v: minutes, l: "min" },
          { v: seconds, l: "seg" },
        ].map((item, i) => (
          <div key={i} className="text-center">
            <span className="text-2xl font-bold" style={{ color: primaryColor }}>
              {String(item.v).padStart(2, "0")}
            </span>
            <p className="text-[10px]" style={{ color: textColor }}>
              {item.l}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Lead Form Block ───
function LeadFormBlock({
  config,
  workspaceId,
  storefrontId,
  primaryColor,
  textColor,
  ctaText,
  buttonRadius,
  ctaCSS,
  cardCSS,
}: {
  config: Record<string, unknown>;
  workspaceId: string;
  storefrontId: string;
  primaryColor: string;
  textColor: string;
  ctaText: string;
  buttonRadius: string;
  ctaCSS: React.CSSProperties;
  cardCSS: React.CSSProperties;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const fields = (config.fields as string[]) || ["email"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await supabase.from("leads").insert({
        workspace_id: workspaceId,
        email,
        name: name || null,
        source: "storefront",
        product_id: (config.product_id as string) || null,
        metadata: { storefront_id: storefrontId } as any,
      });
      setSubmitted(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="w-full p-4 rounded-xl text-center" style={{ borderColor: primaryColor + "40", border: "1px solid" }}>
        <p className="font-medium" style={{ color: primaryColor }}>
          ✅ Cadastro realizado!
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="w-full p-4" style={{ borderRadius: buttonRadius, ...cardCSS }}>
      <p className="font-medium mb-3" style={{ color: textColor }}>
        {(config.title as string) || "Inscreva-se"}
      </p>
      {fields.includes("name") && (
        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mb-2 text-sm min-h-[44px]"
          style={{ borderColor: textColor + "30" }}
        />
      )}
      <input
        type="email"
        required
        placeholder="Seu melhor email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg mb-2 text-sm min-h-[44px]"
        style={{ borderColor: textColor + "30" }}
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 text-sm font-medium min-h-[44px]"
        style={{ borderRadius: buttonRadius, ...ctaCSS }}
      >
        {loading ? "Enviando..." : (config.button_text as string) || "Enviar"}
      </button>
    </form>
  );
}

// ─── Social Link Component ───
function SocialIcon({ href, icon: Icon, tokens }: { href: string; icon: React.ElementType; tokens: ReturnType<typeof resolveTokens> }) {
  const url = href.startsWith("http") ? href : `https://${href}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="p-2 rounded-full transition-opacity hover:opacity-70"
      style={{ backgroundColor: tokens.surfaceColor }}
    >
      <Icon className="h-4 w-4" style={{ color: tokens.textColor }} />
    </a>
  );
}

// ─── Main Page ───
export default function PublicStorefront() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  useAffiliateTracking();

  const [storefront, setStorefront] = useState<StorefrontRow | null>(null);
  const [theme, setTheme] = useState<ThemeRow | null>(null);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [products, setProducts] = useState<ProductInfo[]>([]);
  const [prices, setPrices] = useState<PriceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Resolve design tokens from theme (single source of truth)
  const tokens = useMemo(() => resolveTokens({
    primary_color: theme?.primary_color,
    background_color: theme?.background_color,
    text_color: theme?.text_color,
    font_body: theme?.font_body,
    button_style: theme?.button_style,
  }), [theme]);

  const preset = useMemo(() => getPreset(theme?.template_key), [theme?.template_key]);
  const gap = blockGap(preset.contentDensity);
  const pad = cardPadding(preset.contentDensity);
  const imgH = mediaHeight(preset.mediaEmphasis);
  const cardCSS = cardStyleCSS(preset.cardStyle, tokens.borderColor, tokens.surfaceColor);
  const ctaCSS = ctaStyleCSS(preset.ctaStyle, tokens.primaryColor, tokens.ctaTextColor, tokens.backgroundColor);

  // ─── Fetch data ───
  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);

      const { data: sf, error: sfErr } = await supabase
        .from("storefronts")
        .select("id, slug, title, bio, avatar_url, social_links, workspace_id")
        .ilike("slug", slug)
        .limit(1)
        .maybeSingle();

      if (sfErr || !sf) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const storefrontData = {
        ...sf,
        social_links: (sf.social_links as Record<string, string>) || {},
      } as StorefrontRow;
      setStorefront(storefrontData);

      const [themeRes, blocksRes] = await Promise.all([
        supabase
          .from("storefront_themes")
          .select("primary_color, secondary_color, background_color, text_color, font_body, font_heading, button_style, template_key")
          .eq("storefront_id", sf.id)
          .single(),
        supabase
          .from("storefront_blocks")
          .select("id, type, position, is_visible, config")
          .eq("storefront_id", sf.id)
          .order("position", { ascending: true }),
      ]);

      if (themeRes.data) setTheme(themeRes.data as ThemeRow);

      const visibleBlocks = ((blocksRes.data || []) as any[])
        .filter((b: any) => b.is_visible)
        .map((b: any) => ({ ...b, config: b.config || {} })) as BlockRow[];
      setBlocks(visibleBlocks);

      const [allProdRes, allPriceRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, name, slug, thumbnail_url, short_description, thumbnail_style, listing_button_text, delivery_url, metadata, storefront_order")
          .eq("workspace_id", sf.workspace_id)
          .eq("status", "PUBLISHED")
          .is("deleted_at", null)
          .order("storefront_order", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("prices")
          .select("product_id, amount, currency")
          .eq("is_default", true)
          .eq("is_active", true),
      ]);

      const allProducts = (allProdRes.data || []) as ProductInfo[];
      const allPrices = (allPriceRes.data || []).filter((p: any) =>
        allProducts.some((prod) => prod.id === p.product_id)
      ) as PriceInfo[];

      setProducts(allProducts);
      setPrices(allPrices);
      setLoading(false);

      // Track page view
      const utmSource = searchParams.get("utm_source");
      const utmMedium = searchParams.get("utm_medium");
      const utmCampaign = searchParams.get("utm_campaign");
      const utmContent = searchParams.get("utm_content");
      const ref = searchParams.get("ref");

      if (ref) sessionStorage.setItem("kivo_ref", ref);

      supabase.from("analytics_events").insert({
        workspace_id: sf.workspace_id,
        event_type: "PAGE_VIEW",
        storefront_id: sf.id,
        page_path: `/${slug}`,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        metadata: { utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign, utm_content: utmContent, ref } as any,
      });
    })();
  }, [slug, searchParams]);

  // ─── Track click events ───
  const trackEvent = useCallback(
    (eventType: string, productId?: string) => {
      if (!storefront) return;
      supabase.from("analytics_events").insert({
        workspace_id: storefront.workspace_id,
        event_type: eventType,
        storefront_id: storefront.id,
        product_id: productId || null,
        page_path: `/${slug}`,
        user_agent: navigator.userAgent,
        metadata: {} as any,
      });
    },
    [storefront, slug]
  );

  // ─── Loading ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin" style={{ color: "#F9423A" }} />
      </div>
    );
  }

  // ─── 404 ───
  if (notFound || !storefront) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center bg-white">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "#1a1a1a" }}>
          Página não encontrada
        </h1>
        <p className="mb-6" style={{ color: "#666" }}>
          Esse link não existe ou ainda não foi publicado.
        </p>
        <div className="flex flex-col gap-3 items-center">
          <a
            href="https://kivohub.com.br"
            className="px-6 py-3 rounded-full text-white font-medium"
            style={{ backgroundColor: "#F9423A" }}
          >
            Crie sua própria loja na Kivo
          </a>
          <a href="/" className="text-sm text-muted-foreground hover:underline">
            ← Voltar para Home
          </a>
        </div>
      </div>
    );
  }

  const socialLinks: Record<string, string> = (typeof storefront.social_links === 'object' && storefront.social_links !== null) ? storefront.social_links : {};
  const socialPlatforms: { key: string; icon: React.ElementType }[] = [
    { key: 'instagram', icon: Instagram },
    { key: 'tiktok', icon: TikTokIcon },
    { key: 'youtube', icon: Youtube },
    { key: 'twitter', icon: Twitter },
  ];
  const visibleSocials = socialPlatforms.filter(p => socialLinks[p.key]);

  // ─── Product card renderer (shared for blocks + extra) ───
  const renderProductCard = (product: ProductInfo, display: ReturnType<typeof resolveProductDisplay>) => {
    const ctaLabel = display.ctaText;
    const linkTarget = product.delivery_url || `/checkout/${product.slug}`;
    const isExternal = product.delivery_url?.startsWith("http");
    const isCalloutStyle = product.thumbnail_style === "callout";
    const isButtonStyle = product.thumbnail_style === "button";

    // Callout/button style (compact icon layout)
    if (isCalloutStyle || isButtonStyle) {
      return (
        <a
          href={linkTarget}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
          className="w-full overflow-hidden block transition-all active:scale-[0.98]"
          style={{ borderRadius: tokens.cardRadius, ...cardCSS }}
        >
          <div style={{ padding: pad }}>
            <div className="flex items-center gap-3">
              <img
                src={product.thumbnail_url || kivoReferralLogo}
                alt={product.name}
                className="w-12 h-12 rounded-2xl object-cover shrink-0"
                loading="lazy"
              />
              <p className="font-semibold" style={{ color: tokens.textColor }}>
                {product.name}
              </p>
            </div>
            {!isButtonStyle && (
              <div
                className="mt-4 py-3 text-sm font-medium text-center min-h-[44px]"
                style={{ borderRadius: tokens.buttonRadius, ...ctaCSS }}
              >
                {ctaLabel}
              </div>
            )}
          </div>
        </a>
      );
    }

    // Default card (large image or minimal)
    return (
      <a
        href={linkTarget}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
        onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
        className="w-full overflow-hidden block transition-all active:scale-[0.98]"
        style={{ borderRadius: tokens.cardRadius, ...cardCSS }}
      >
        {preset.mediaEmphasis !== 'minimal' ? (
          product.thumbnail_url ? (
            <img src={product.thumbnail_url} alt={product.name} className="w-full object-cover" style={{ height: imgH }} loading="lazy" />
          ) : (
            <div className="w-full flex items-center justify-center" style={{ height: imgH, backgroundColor: tokens.surfaceColor }}>
              <ImageIcon className="h-8 w-8" style={{ color: tokens.textSecondaryColor }} />
            </div>
          )
        ) : (
          product.thumbnail_url ? (
            <div style={{ padding: `${pad} ${pad} 0` }}>
              <img src={product.thumbnail_url} alt={product.name} className="w-12 h-12 rounded-lg object-cover" loading="lazy" />
            </div>
          ) : null
        )}
        <div style={{ padding: pad }}>
          <p className="font-semibold" style={{ color: tokens.textColor }}>
            {product.name}
          </p>
          {display.rules.showDescription && product.short_description && (
            <p className="text-sm mt-1 opacity-70" style={{ color: tokens.textColor }}>
              {product.short_description}
            </p>
          )}
          <div className="flex items-center justify-between mt-3">
            {display.price.label && (
              <span className={`font-bold ${display.price.isFree ? 'text-sm' : 'text-lg'}`} style={{ color: tokens.priceLabelColor }}>
                {display.price.label}
              </span>
            )}
            <span
              className="px-4 py-2 text-sm font-medium min-h-[44px] flex items-center"
              style={{ borderRadius: tokens.buttonRadius, ...ctaCSS }}
            >
              {ctaLabel}
            </span>
          </div>
        </div>
      </a>
    );
  };

  // ─── Block Renderer ───
  const renderBlock = (block: BlockRow) => {
    const config = block.config as Record<string, unknown>;

    switch (block.type) {
      case "link": {
        const linkUrl = (config.url as string) || "";
        if (!linkUrl) return null;
        return (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("LINK_CLICKED")}
            className="w-full py-3.5 px-4 text-center font-medium block transition-all active:scale-[0.98] min-h-[44px]"
            style={{
              borderRadius: tokens.buttonRadius,
              color: tokens.textColor,
              ...ctaStyleCSS('outline', tokens.primaryColor, tokens.ctaTextColor, tokens.backgroundColor),
            }}
          >
            {(config.title as string) || "Link"}
          </a>
        );
      }

      case "product": {
        const product = products.find((p) => p.id === config.product_id);
        if (!product) return null;
        const price = prices.find((p) => p.product_id === product.id);
        const display = resolveProductDisplay({
          amount: price?.amount,
          currency: price?.currency,
          formatId: (product.metadata as any)?.format_id,
        });
        return renderProductCard(product, display);
      }

      case "lead_form":
        return (
          <LeadFormBlock
            config={config}
            workspaceId={storefront.workspace_id}
            storefrontId={storefront.id}
            primaryColor={tokens.primaryColor}
            textColor={tokens.textColor}
            ctaText={tokens.ctaTextColor}
            buttonRadius={tokens.buttonRadius}
            ctaCSS={ctaCSS}
            cardCSS={cardCSS}
          />
        );

      case "video": {
        const videoUrl = config.url as string;
        let embedSrc = "";
        if (videoUrl?.includes("youtube.com") || videoUrl?.includes("youtu.be")) {
          const id = videoUrl.includes("youtu.be")
            ? videoUrl.split("/").pop()?.split("?")[0]
            : videoUrl.split("v=")[1]?.split("&")[0];
          if (id) embedSrc = `https://www.youtube.com/embed/${id}`;
        } else if (videoUrl?.includes("vimeo.com")) {
          const id = videoUrl.split("/").pop();
          if (id) embedSrc = `https://player.vimeo.com/video/${id}`;
        }

        return embedSrc ? (
          <div className="w-full aspect-video overflow-hidden" style={{ borderRadius: tokens.cardRadius }}>
            <iframe src={embedSrc} className="w-full h-full" allowFullScreen loading="lazy" title="Video" />
          </div>
        ) : (
          <div className="w-full aspect-video flex items-center justify-center" style={{ backgroundColor: tokens.surfaceColor, borderRadius: tokens.cardRadius }}>
            <Play className="h-8 w-8" style={{ color: tokens.primaryColor }} />
          </div>
        );
      }

      case "text": {
        const isHeading = config.variant === "heading";
        return (
          <p
            className={`w-full ${preset.headerAlignment === 'left' ? 'text-left' : 'text-center'} ${isHeading ? "text-xl font-bold" : "text-sm opacity-80"}`}
            style={{ color: tokens.textColor }}
          >
            {(config.content as string) || ""}
          </p>
        );
      }

      case "whatsapp": {
        const phone = config.phone as string;
        const message = encodeURIComponent((config.message as string) || "");
        return (
          <a
            href={`https://wa.me/${phone}?text=${message}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("LINK_CLICKED")}
            className="w-full py-3.5 px-4 flex items-center justify-center gap-2 font-medium text-white active:scale-[0.98] transition-all min-h-[44px]"
            style={{ backgroundColor: "#25D366", borderRadius: tokens.buttonRadius }}
          >
            <MessageCircle className="h-5 w-5" />
            {(config.label as string) || "Chamar no WhatsApp"}
          </a>
        );
      }

      case "divider":
        return <div className="w-full h-px my-1" style={{ backgroundColor: tokens.borderColor }} />;

      case "countdown":
        return (
          <CountdownBlock
            targetDate={(config.target_date as string) || new Date().toISOString()}
            label={(config.label as string) || "Termina em"}
            primaryColor={tokens.primaryColor}
            textColor={tokens.textColor}
          />
        );

      default:
        return null;
    }
  };

  // ─── Visibility flags ───
  const showAvatar = !!storefront.avatar_url;
  const showBio = !!storefront.bio?.trim();
  const initials = storefront.title?.charAt(0)?.toUpperCase() || "K";

  return (
    <>
      {/* Load Google Font */}
      {tokens.fontFamily.includes("Inter") ? null : (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${(theme?.font_body || "Inter").replace(/ /g, "+")}:wght@400;500;600;700&display=swap`}
        />
      )}
      <div
        className="min-h-screen"
        style={{ backgroundColor: tokens.backgroundColor, fontFamily: tokens.fontFamily }}
      >
        <div className="max-w-[480px] mx-auto px-5 py-8 pb-16">
          {/* ─── Profile Header (alignment from preset) ─── */}
          <div className={`${headerClasses(preset.headerAlignment)} mb-8`}>
            {showAvatar ? (
              <img
                src={storefront.avatar_url!}
                alt={storefront.title || "Avatar"}
                className="w-20 h-20 rounded-full object-cover mb-3 ring-4 ring-white/80 shadow-lg"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full mb-3 flex items-center justify-center text-xl font-bold shadow-md"
                style={{ backgroundColor: tokens.primaryColor, color: tokens.ctaTextColor }}
              >
                {initials}
              </div>
            )}
            <h1 style={{ color: tokens.textColor, fontSize: TYPOGRAPHY.size.xl, fontWeight: TYPOGRAPHY.weight.bold, lineHeight: TYPOGRAPHY.lineHeight.tight }}>
              {storefront.title || ""}
            </h1>
            {showBio && (
              <p className="mt-1.5 max-w-[320px] leading-relaxed" style={{ color: tokens.textSecondaryColor, fontSize: TYPOGRAPHY.size.sm }}>
                {storefront.bio}
              </p>
            )}

            {visibleSocials.length > 0 && (
              <div className={`flex gap-2.5 mt-3 ${socialAlignment(preset.headerAlignment)}`}>
                {visibleSocials.map(p => (
                  <SocialIcon key={p.key} href={socialLinks[p.key]} icon={p.icon} tokens={tokens} />
                ))}
              </div>
            )}
          </div>

          {/* ─── Blocks ─── */}
          <div className="flex flex-col" style={{ gap }}>
            {blocks.map((block) => (
              <div key={block.id}>{renderBlock(block)}</div>
            ))}
          </div>

          {/* ─── Extra products not in blocks ─── */}
          {(() => {
            const blockProductIds = blocks
              .filter((b) => b.type === "product")
              .map((b) => (b.config as any).product_id)
              .filter(Boolean) as string[];
            const extraProducts = products.filter(
              (p) => !blockProductIds.includes(p.id)
            );
            if (extraProducts.length === 0) return null;
            return (
              <div className="flex flex-col mt-3" style={{ gap }}>
                {extraProducts.map((product) => {
                  const price = prices.find((p) => p.product_id === product.id);
                  const display = resolveProductDisplay({
                    amount: price?.amount,
                    currency: price?.currency,
                    formatId: (product.metadata as any)?.format_id,
                    customCTA: product.listing_button_text,
                  });
                  return <div key={product.id}>{renderProductCard(product, display)}</div>;
                })}
              </div>
            );
          })()}

          {/* ─── Footer ─── */}
          <div className={`mt-12 ${preset.headerAlignment === 'left' ? 'text-left' : 'text-center'}`}>
            <a
              href="https://kivohub.com.br"
              className="text-xs opacity-40 hover:opacity-60 transition-opacity"
              style={{ color: tokens.textColor }}
            >
              Feito com 💜 na Kivo
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
