import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAffiliateTracking } from "@/hooks/useAffiliateTracking";
import { formatCurrency } from "@/lib/utils";
import { getDisplayPrice } from "@/lib/formatPrice";
import { resolveTokens, SPACING, TYPOGRAPHY, STATE_CLASSES, ctaTextColor as getCTATextColor, getButtonRadius, getCardRadius } from "@/lib/storefront-tokens";
import {
  Instagram,
  Youtube,
  Twitter,
  Play,
  MessageCircle,
  ExternalLink,
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
  buttonClass,
}: {
  config: Record<string, unknown>;
  workspaceId: string;
  storefrontId: string;
  primaryColor: string;
  textColor: string;
  buttonClass: string;
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
    <form onSubmit={handleSubmit} className="w-full p-4 rounded-xl" style={{ borderColor: primaryColor + "40", border: "1px solid" }}>
      <p className="font-medium mb-3" style={{ color: textColor }}>
        {(config.title as string) || "Inscreva-se"}
      </p>
      {fields.includes("name") && (
        <input
          type="text"
          placeholder="Seu nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg mb-2 text-sm"
          style={{ borderColor: textColor + "30" }}
        />
      )}
      <input
        type="email"
        required
        placeholder="Seu melhor email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full px-3 py-2 border rounded-lg mb-2 text-sm"
        style={{ borderColor: textColor + "30" }}
      />
      <button
        type="submit"
        disabled={loading}
        className={`w-full py-2.5 text-sm font-medium min-h-[44px] ${buttonClass}`}
        style={{ backgroundColor: primaryColor, color: tokens.ctaTextColor }}
      >
        {loading ? "Enviando..." : (config.button_text as string) || "Enviar"}
      </button>
    </form>
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

  // Legacy shorthand for backward compat in block renderers
  const t = {
    primary: tokens.primaryColor,
    bg: tokens.backgroundColor,
    text: tokens.textColor,
    font: theme?.font_body || "Inter",
    btn: theme?.button_style || "rounded",
  };

  const buttonClass =
    t.btn === "pill" ? "rounded-full" : t.btn === "square" ? "rounded-none" : "rounded-xl";

  const cardClass =
    t.btn === "pill" ? "rounded-2xl" : t.btn === "square" ? "rounded-none" : "rounded-xl";

  // ─── Fetch data ───
  useEffect(() => {
    if (!slug) return;

    (async () => {
      setLoading(true);

      // 1. Fetch storefront by slug
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

      // 2. Parallel fetches: theme, blocks
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

      // 3. Fetch ALL published products for the workspace (aligns with preview)
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

      // 4. Track page view
      const utmSource = searchParams.get("utm_source");
      const utmMedium = searchParams.get("utm_medium");
      const utmCampaign = searchParams.get("utm_campaign");
      const utmContent = searchParams.get("utm_content");
      const ref = searchParams.get("ref");

      if (ref) {
        sessionStorage.setItem("kivo_ref", ref);
      }

      supabase.from("analytics_events").insert({
        workspace_id: sf.workspace_id,
        event_type: "PAGE_VIEW",
        storefront_id: sf.id,
        page_path: `/${slug}`,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
        metadata: {
          utm_source: utmSource,
          utm_medium: utmMedium,
          utm_campaign: utmCampaign,
          utm_content: utmContent,
          ref,
        } as any,
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

  // ─── Block Renderer ───
  const renderBlock = (block: BlockRow) => {
    const config = block.config as Record<string, unknown>;

    switch (block.type) {
      case "link": {
        const linkUrl = (config.url as string) || "";
        if (!linkUrl) return null; // Don't render empty links
        return (
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackEvent("LINK_CLICKED")}
            className={`w-full py-3.5 px-4 border text-center font-medium block transition-all active:scale-[0.98] ${buttonClass}`}
            style={{ borderColor: t.primary, color: t.text }}
          >
            {(config.title as string) || "Link"}
          </a>
        );
      }

      case "product": {
        const product = products.find((p) => p.id === config.product_id);
        if (!product) return null;
        const price = prices.find((p) => p.product_id === product.id);
        const priceDisplay = getDisplayPrice({
          amount: price?.amount,
          currency: price?.currency,
          productType: undefined,
          formatId: (product.metadata as any)?.format_id,
        });
        const isCalloutStyle = product.thumbnail_style === "callout";
        const isButtonStyle = product.thumbnail_style === "button";
        const ctaLabel = product.listing_button_text || (priceDisplay.isFree ? "Baixar grátis" : "Comprar");
        const linkTarget = product.delivery_url || `/checkout/${product.slug}`;
        const isExternal = product.delivery_url?.startsWith("http");

        // Callout with icon layout (Stan Store style)
        if (isCalloutStyle || isButtonStyle) {
          return (
            <a
              href={linkTarget}
              target={isExternal ? "_blank" : undefined}
              rel={isExternal ? "noopener noreferrer" : undefined}
              onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
              className={`w-full overflow-hidden border block transition-all active:scale-[0.98] ${cardClass}`}
              style={{ borderColor: t.primary + "40" }}
            >
              <div className="p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={product.thumbnail_url || kivoReferralLogo}
                    alt={product.name}
                    className="w-12 h-12 rounded-2xl object-cover shrink-0"
                    loading="lazy"
                  />
                  <p className="font-semibold" style={{ color: t.text }}>
                    {product.name}
                  </p>
                </div>
                {!isButtonStyle && (
                  <div
                    className={`mt-4 py-3 text-sm font-medium text-center text-white ${buttonClass}`}
                    style={{ backgroundColor: t.primary }}
                  >
                    {ctaLabel}
                  </div>
                )}
              </div>
            </a>
          );
        }

        // Default product card (large image)
        return (
          <a
            href={linkTarget}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
            className={`w-full overflow-hidden border block transition-all active:scale-[0.98] ${cardClass}`}
            style={{ borderColor: t.primary + "40" }}
          >
            {product.thumbnail_url && (
              <img
                src={product.thumbnail_url}
                alt={product.name}
                className="w-full h-40 object-cover"
                loading="lazy"
              />
            )}
            <div className="p-4">
              <p className="font-semibold" style={{ color: t.text }}>
                {product.name}
              </p>
              {product.short_description && (
                <p className="text-sm mt-1 opacity-70" style={{ color: t.text }}>
                  {product.short_description}
                </p>
              )}
              <div className="flex items-center justify-between mt-3">
                {priceDisplay.label && (
                  <span className={`font-bold ${priceDisplay.isFree ? 'text-sm' : 'text-lg'}`} style={{ color: t.primary }}>
                    {priceDisplay.label}
                  </span>
                )}
                <span
                  className={`px-4 py-2 text-sm font-medium text-white ${buttonClass}`}
                  style={{ backgroundColor: t.primary }}
                >
                  {ctaLabel}
                </span>
              </div>
            </div>
          </a>
        );
      }

      case "lead_form":
        return (
          <LeadFormBlock
            config={config}
            workspaceId={storefront.workspace_id}
            storefrontId={storefront.id}
            primaryColor={t.primary}
            textColor={t.text}
            buttonClass={buttonClass}
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
          <div className="w-full aspect-video rounded-xl overflow-hidden">
            <iframe
              src={embedSrc}
              className="w-full h-full"
              allowFullScreen
              loading="lazy"
              title="Video"
            />
          </div>
        ) : (
          <div
            className="w-full aspect-video rounded-xl flex items-center justify-center"
            style={{ backgroundColor: t.text + "10" }}
          >
            <Play className="h-8 w-8" style={{ color: t.primary }} />
          </div>
        );
      }

      case "text": {
        const isHeading = config.variant === "heading";
        return (
          <p
            className={`w-full text-center ${isHeading ? "text-xl font-bold" : "text-sm opacity-80"}`}
            style={{ color: t.text }}
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
            className={`w-full py-3.5 px-4 flex items-center justify-center gap-2 font-medium text-white active:scale-[0.98] transition-all ${buttonClass}`}
            style={{ backgroundColor: "#25D366" }}
          >
            <MessageCircle className="h-5 w-5" />
            {(config.label as string) || "Chamar no WhatsApp"}
          </a>
        );
      }

      case "divider":
        return <div className="w-full h-px my-1" style={{ backgroundColor: t.text + "20" }} />;

      case "countdown":
        return (
          <CountdownBlock
            targetDate={(config.target_date as string) || new Date().toISOString()}
            label={(config.label as string) || "Termina em"}
            primaryColor={t.primary}
            textColor={t.text}
          />
        );

      default:
        return null;
    }
  };

  return (
    <>
      {/* Load Google Font */}
      {t.font !== "Inter" && (
        <link
          rel="stylesheet"
          href={`https://fonts.googleapis.com/css2?family=${t.font.replace(/ /g, "+")}:wght@400;500;600;700&display=swap`}
        />
      )}
      <div
        className="min-h-screen"
        style={{ backgroundColor: t.bg, fontFamily: `'${t.font}', sans-serif` }}
      >
        <div className="max-w-[480px] mx-auto px-5 py-8 pb-16">
          {/* Profile Header */}
          <div className="flex flex-col items-center text-center mb-8">
            {storefront.avatar_url ? (
              <img
                src={storefront.avatar_url}
                alt={storefront.title || "Avatar"}
                className="w-24 h-24 rounded-full object-cover mb-4 ring-4 shadow-lg"
                style={{ boxShadow: `0 0 0 4px ${t.primary}30` }}
              />
            ) : (
              <div
                className="w-24 h-24 rounded-full mb-4 flex items-center justify-center text-3xl font-bold text-white shadow-lg"
                style={{ backgroundColor: t.primary }}
              >
                {storefront.title?.charAt(0)?.toUpperCase() || "K"}
              </div>
            )}
            <h1 className="text-2xl font-bold" style={{ color: t.text }}>
              {storefront.title || ""}
            </h1>
            {storefront.bio && (
              <p className="text-sm mt-2 opacity-80 max-w-[320px]" style={{ color: t.text }}>
                {storefront.bio}
              </p>
            )}

            {/* Social Links */}
            {Object.values(socialLinks).some(Boolean) && (
              <div className="flex gap-3 mt-4">
                {socialLinks.instagram && (
                  <a
                    href={socialLinks.instagram.startsWith("http") ? socialLinks.instagram : `https://${socialLinks.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-full transition-opacity hover:opacity-70"
                    style={{ backgroundColor: t.text + "10" }}
                  >
                    <Instagram className="h-5 w-5" style={{ color: t.text }} />
                  </a>
                )}
                {socialLinks.tiktok && (
                  <a
                    href={socialLinks.tiktok.startsWith("http") ? socialLinks.tiktok : `https://${socialLinks.tiktok}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-full transition-opacity hover:opacity-70"
                    style={{ backgroundColor: t.text + "10" }}
                  >
                    <TikTokIcon className="h-5 w-5" />
                  </a>
                )}
                {socialLinks.youtube && (
                  <a
                    href={socialLinks.youtube.startsWith("http") ? socialLinks.youtube : `https://${socialLinks.youtube}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-full transition-opacity hover:opacity-70"
                    style={{ backgroundColor: t.text + "10" }}
                  >
                    <Youtube className="h-5 w-5" style={{ color: t.text }} />
                  </a>
                )}
                {socialLinks.twitter && (
                  <a
                    href={socialLinks.twitter.startsWith("http") ? socialLinks.twitter : `https://${socialLinks.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-full transition-opacity hover:opacity-70"
                    style={{ backgroundColor: t.text + "10" }}
                  >
                    <Twitter className="h-5 w-5" style={{ color: t.text }} />
                  </a>
                )}
              </div>
            )}
          </div>

          {/* Blocks */}
          <div className="space-y-3">
            {blocks.map((block) => (
              <div key={block.id}>{renderBlock(block)}</div>
            ))}
          </div>

          {/* Extra products not in blocks — mirrors preview behavior */}
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
              <div className="space-y-3 mt-3">
                {extraProducts.map((product) => {
                  const price = prices.find((p) => p.product_id === product.id);
                  const priceDisplay = getDisplayPrice({
                    amount: price?.amount,
                    currency: price?.currency,
                    formatId: (product.metadata as any)?.format_id,
                  });
                  const ctaLabel = product.listing_button_text || (priceDisplay.isFree ? "Baixar grátis" : "Comprar");
                  const linkTarget = product.delivery_url || `/checkout/${product.slug}`;
                  const isExternal = product.delivery_url?.startsWith("http");
                  const isCalloutStyle = product.thumbnail_style === "callout";
                  const isButtonStyle = product.thumbnail_style === "button";

                  if (isCalloutStyle || isButtonStyle) {
                    return (
                      <a
                        key={product.id}
                        href={linkTarget}
                        target={isExternal ? "_blank" : undefined}
                        rel={isExternal ? "noopener noreferrer" : undefined}
                        onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
                        className={`w-full overflow-hidden border block transition-all active:scale-[0.98] ${cardClass}`}
                        style={{ borderColor: t.primary + "40" }}
                      >
                        <div className="p-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={product.thumbnail_url || kivoReferralLogo}
                              alt={product.name}
                              className="w-12 h-12 rounded-2xl object-cover shrink-0"
                              loading="lazy"
                            />
                            <p className="font-semibold" style={{ color: t.text }}>
                              {product.name}
                            </p>
                          </div>
                          {!isButtonStyle && (
                            <div
                              className={`mt-4 py-3 text-sm font-medium text-center text-white ${buttonClass}`}
                              style={{ backgroundColor: t.primary }}
                            >
                              {ctaLabel}
                            </div>
                          )}
                        </div>
                      </a>
                    );
                  }

                  return (
                    <a
                      key={product.id}
                      href={linkTarget}
                      target={isExternal ? "_blank" : undefined}
                      rel={isExternal ? "noopener noreferrer" : undefined}
                      onClick={() => trackEvent("PRODUCT_VIEW", product.id)}
                      className={`w-full overflow-hidden border block transition-all active:scale-[0.98] ${cardClass}`}
                      style={{ borderColor: t.primary + "40" }}
                    >
                      {product.thumbnail_url && (
                        <img
                          src={product.thumbnail_url}
                          alt={product.name}
                          className="w-full h-40 object-cover"
                          loading="lazy"
                        />
                      )}
                      <div className="p-4">
                        <p className="font-semibold" style={{ color: t.text }}>
                          {product.name}
                        </p>
                        {product.short_description && (
                          <p className="text-sm mt-1 opacity-70" style={{ color: t.text }}>
                            {product.short_description}
                          </p>
                        )}
                        <div className="flex items-center justify-between mt-3">
                          {priceDisplay.label && (
                            <span className={`font-bold ${priceDisplay.isFree ? 'text-sm' : 'text-lg'}`} style={{ color: t.primary }}>
                              {priceDisplay.label}
                            </span>
                          )}
                          <span
                            className={`px-4 py-2 text-sm font-medium text-white ${buttonClass}`}
                            style={{ backgroundColor: t.primary }}
                          >
                            {ctaLabel}
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            );
          })()}

          {/* Footer — Free plan */}
          <div className="mt-12 text-center">
            <a
              href="https://kivohub.com.br"
              className="text-xs opacity-40 hover:opacity-60 transition-opacity"
              style={{ color: t.text }}
            >
              Feito com 💜 na Kivo
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
