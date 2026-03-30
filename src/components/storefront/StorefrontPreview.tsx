import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Instagram, 
  Youtube, 
  Twitter,
  Link2,
  ShoppingBag,
  MessageCircle,
  Play,
} from "lucide-react";
import type { StorefrontData, StorefrontTheme, StorefrontBlock } from "@/pages/StorefrontEditor";

// TikTok icon
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

interface StorefrontPreviewProps {
  storefront: StorefrontData;
  theme: StorefrontTheme | null | undefined;
  blocks: StorefrontBlock[];
}

export function StorefrontPreview({ storefront, theme, blocks }: StorefrontPreviewProps) {
  const currentTheme = {
    primary_color: theme?.primary_color || '#F9423A',
    secondary_color: theme?.secondary_color || '#1a1a1a',
    background_color: theme?.background_color || '#ffffff',
    text_color: theme?.text_color || '#1a1a1a',
    font_body: theme?.font_body || 'Inter',
    button_style: theme?.button_style || 'rounded',
    template_key: theme?.template_key || 'noir',
  };

  const getLayoutType = (key: string) => {
    switch (key) {
      case 'petala':
      case 'coaching':
        return 'hero';
      case 'spotlight':
      case 'minima':
        return 'banner';
      case 'noir':
      case 'moderno':
      case 'eclipse':
      case 'nightview':
        return 'minimal';
      default:
        return 'classic';
    }
  };

  const layout = getLayoutType(currentTheme.template_key);

  // Fetch products for product cards
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

  const getButtonClass = () => {
    switch (currentTheme.button_style) {
      case 'pill': return 'rounded-full';
      case 'square': return 'rounded-none';
      default: return 'rounded-lg';
    }
  };

  const visibleBlocks = blocks.filter(b => b.is_visible).sort((a, b) => a.position - b.position);

  const renderBlock = (block: StorefrontBlock) => {
    const config = block.config as Record<string, unknown>;

    switch (block.type) {
      case 'link':
        return (
          <a
            href={config.url as string || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "block w-full py-3 px-4 border text-center font-medium transition-all hover:scale-[1.02]",
              getButtonClass()
            )}
            style={{ 
              borderColor: currentTheme.primary_color,
              color: currentTheme.text_color
            }}
          >
            {config.title as string || 'Link'}
          </a>
        );

      case 'product':
        const product = products.find(p => p.id === config.product_id);
        if (!product) return null;
        return (
          <div 
            className="w-full overflow-hidden border rounded-[16px]"
            style={{ borderColor: currentTheme.primary_color + '40' }}
          >
            {product.thumbnail_url && (
              <img 
                src={product.thumbnail_url} 
                alt={product.name}
                className="w-full h-32 object-cover"
              />
            )}
            <div className="p-3">
              <p className="font-medium" style={{ color: currentTheme.text_color }}>
                {product.name}
              </p>
              {product.short_description && (
                <p className="text-sm opacity-70 mt-1" style={{ color: currentTheme.text_color }}>
                  {product.short_description}
                </p>
              )}
              <button
                className={cn("w-full mt-3 py-2 text-sm font-medium text-white transition-all hover:opacity-90", getButtonClass())}
                style={{ backgroundColor: currentTheme.primary_color }}
              >
                {product.listing_button_text || 'Ver produto'}
              </button>
            </div>
          </div>
        );

      case 'lead_form':
        return (
          <div 
            className="w-full p-4 border rounded-[16px]"
            style={{ borderColor: currentTheme.primary_color + '40' }}
          >
            <p className="font-medium mb-3" style={{ color: currentTheme.text_color }}>
              {config.title as string || 'Inscreva-se'}
            </p>
            <input
              type="email"
              placeholder="Seu melhor email"
              className="w-full px-3 py-2 border mb-3 text-sm rounded-lg"
              style={{ borderColor: currentTheme.text_color + '30', backgroundColor: 'transparent', color: currentTheme.text_color }}
            />
            <button
              className={cn("w-full py-2.5 text-sm font-medium text-white transition-all hover:opacity-90", getButtonClass())}
              style={{ backgroundColor: currentTheme.primary_color }}
            >
              {config.button_text as string || 'Enviar'}
            </button>
          </div>
        );

      case 'video':
        const videoUrl = config.url as string;
        const videoId = videoUrl?.includes('youtube') 
          ? videoUrl.split('v=')[1]?.split('&')[0]
          : videoUrl?.includes('vimeo')
          ? videoUrl.split('/').pop()
          : null;

        return (
          <div className="w-full aspect-video overflow-hidden rounded-[16px]">
            {videoId && videoUrl?.includes('youtube') ? (
              <iframe
                src={`https://www.youtube.com/embed/${videoId}`}
                className="w-full h-full"
                allowFullScreen
              />
            ) : (
              <div 
                className="w-full h-full flex items-center justify-center"
                style={{ backgroundColor: currentTheme.text_color + '10' }}
              >
                <Play className="h-8 w-8" style={{ color: currentTheme.primary_color }} />
              </div>
            )}
          </div>
        );

      case 'text':
        const isHeading = config.variant === 'heading';
        return (
          <p 
            className={cn(
              "w-full text-center",
              isHeading ? "text-lg font-bold" : "text-sm opacity-80"
            )}
            style={{ color: currentTheme.text_color }}
          >
            {config.content as string || 'Texto aqui'}
          </p>
        );

      case 'whatsapp':
        const phone = config.phone as string;
        const message = encodeURIComponent(config.message as string || '');
        return (
          <a
            href={`https://wa.me/${phone}?text=${message}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "w-full py-3 px-4 flex items-center justify-center gap-2 font-medium text-white",
              getButtonClass()
            )}
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle className="h-5 w-5" />
            Chamar no WhatsApp
          </a>
        );

      case 'divider':
        return (
          <div 
            className="w-full h-px my-2"
            style={{ backgroundColor: currentTheme.text_color + '20' }}
          />
        );

      case 'countdown':
        const targetDate = new Date(config.target_date as string);
        const now = new Date();
        const diff = targetDate.getTime() - now.getTime();
        const days = Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
        const hours = Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
        const minutes = Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60)));

        return (
          <div 
            className="w-full p-4 text-center rounded-[16px]"
            style={{ backgroundColor: currentTheme.primary_color + '10' }}
          >
            <p className="text-sm mb-2" style={{ color: currentTheme.text_color }}>
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
                    style={{ color: currentTheme.primary_color }}
                  >
                    {String(item.value).padStart(2, '0')}
                  </span>
                  <p className="text-xs" style={{ color: currentTheme.text_color }}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const socialLinks = storefront.social_links || {};

  return (
    <div 
      className="w-full h-full relative"
      style={{ 
        backgroundColor: currentTheme.background_color,
        fontFamily: currentTheme.font_body
      }}
    >
      <div 
        className="w-full h-full overflow-y-auto overflow-x-hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <style dangerouslySetInnerHTML={{ __html: `
          .no-scrollbars::-webkit-scrollbar { display: none; }
        `}} />
        <div className="no-scrollbars w-full h-full relative z-10">

        {/* Dynamic Header */}
        
        {/* LAYOUT: B A N N E R */}
        {layout === 'banner' && (
          <div className="mb-6">
            <div className="relative w-full h-32 md:h-40 shrink-0">
              {storefront.banner_url ? (
                <img src={storefront.banner_url} className="w-full h-full object-cover" alt="Banner" />
              ) : (
                <div className="w-full h-full" style={{ backgroundColor: currentTheme.primary_color }} />
              )}
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              {/* Text over banner */}
              <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4">
                {storefront.avatar_url && (
                  <Avatar className="h-16 w-16 ring-2 ring-white shadow-lg shrink-0">
                    <AvatarImage src={storefront.avatar_url} />
                    <AvatarFallback style={{ backgroundColor: currentTheme.primary_color, color: '#fff' }}>
                      {storefront.title?.charAt(0)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="pb-1">
                  <h1 className="text-xl font-bold text-white leading-tight" style={{ fontFamily: currentTheme.font_body }}>
                    {storefront.title || 'Seu Nome'}
                  </h1>
                </div>
              </div>
            </div>
            {(storefront.bio || Object.keys(socialLinks).some(k => socialLinks[k])) && (
              <div className="px-5 mt-4">
                {storefront.bio && (
                  <p className="text-sm opacity-80" style={{ color: currentTheme.text_color }}>
                    {storefront.bio}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* LAYOUT: H E R O */}
        {layout === 'hero' && (
          <div className="mb-6 relative">
            <div className="absolute top-0 left-0 right-0 h-36 z-0" style={{ background: `linear-gradient(to bottom, ${currentTheme.primary_color}dd, ${currentTheme.background_color})` }} />
            <div className="relative z-10 flex flex-col items-center text-center pt-8 px-5">
              <Avatar className="h-20 w-20 mb-3 ring-4 ring-white shadow-lg relative">
                <AvatarImage src={storefront.avatar_url || ''} />
                <AvatarFallback className="text-2xl" style={{ backgroundColor: currentTheme.primary_color, color: '#fff' }}>
                  {storefront.title?.charAt(0)?.toUpperCase() || 'K'}
                </AvatarFallback>
              </Avatar>
              <h1 className="text-[22px] font-bold" style={{ color: currentTheme.text_color }}>
                {storefront.title || 'Seu Nome'}
              </h1>
              {storefront.bio && (
                <p className="text-[13px] mt-1.5 opacity-80 leading-relaxed max-w-[85%]" style={{ color: currentTheme.text_color }}>
                  {storefront.bio}
                </p>
              )}
            </div>
          </div>
        )}

        {/* LAYOUT: M I N I M A L */}
        {layout === 'minimal' && (
          <div className="mb-6 pt-8 px-5 flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-1 ring-white/10 shadow-sm shrink-0">
              <AvatarImage src={storefront.avatar_url || ''} />
              <AvatarFallback className="text-xl" style={{ backgroundColor: currentTheme.primary_color, color: '#fff' }}>
                {storefront.title?.charAt(0)?.toUpperCase() || 'K'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold truncate" style={{ color: currentTheme.text_color }}>
                {storefront.title || 'Seu Nome'}
              </h1>
              {storefront.bio && (
                <p className="text-[13px] opacity-70 truncate" style={{ color: currentTheme.text_color }}>
                  {storefront.bio}
                </p>
              )}
            </div>
          </div>
        )}

        {/* LAYOUT: C L A S S I C */}
        {layout === 'classic' && (
          <div className="flex flex-col items-center text-center mb-6 pt-8 px-5">
              <Avatar className="h-24 w-24 mb-4 ring-4 ring-white shadow-lg">
                <AvatarImage src={storefront.avatar_url || ''} />
                <AvatarFallback 
                  className="text-2xl"
                  style={{ backgroundColor: currentTheme.primary_color, color: '#fff' }}
                >
                  {storefront.title?.charAt(0)?.toUpperCase() || 'K'}
                </AvatarFallback>
              </Avatar>
              <h1 
                className="text-xl font-bold"
                style={{ color: currentTheme.text_color }}
              >
                {storefront.title || 'Seu Nome'}
              </h1>
              {storefront.bio && (
                <p 
                  className="text-sm mt-1 opacity-80"
                  style={{ color: currentTheme.text_color }}
                >
                  {storefront.bio}
                </p>
              )}

              {/* Social Links (Rendered for Classic, Hero and Minimal layouts inside their scope, but let's put it globally below if not minimal) */}
              {Object.keys(socialLinks).some(k => socialLinks[k]) && (
                <div className="flex justify-center gap-3 mt-4 w-full px-5">
                  {socialLinks.instagram && (
                    <a href={socialLinks.instagram.startsWith('http') ? socialLinks.instagram : `https://${socialLinks.instagram}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full transition-colors hover:opacity-80 backdrop-blur-sm" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                      <Instagram className="h-4 w-4" style={{ color: currentTheme.text_color }} />
                    </a>
                  )}
                  {socialLinks.tiktok && (
                    <a href={socialLinks.tiktok.startsWith('http') ? socialLinks.tiktok : `https://${socialLinks.tiktok}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full transition-colors hover:opacity-80 backdrop-blur-sm" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                      <TikTokIcon className="h-4 w-4 text-current" />
                    </a>
                  )}
                  {socialLinks.youtube && (
                    <a href={socialLinks.youtube.startsWith('http') ? socialLinks.youtube : `https://${socialLinks.youtube}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full transition-colors hover:opacity-80 backdrop-blur-sm" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                      <Youtube className="h-4 w-4" style={{ color: currentTheme.text_color }} />
                    </a>
                  )}
                  {socialLinks.twitter && (
                    <a href={socialLinks.twitter.startsWith('http') ? socialLinks.twitter : `https://${socialLinks.twitter}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-full transition-colors hover:opacity-80 backdrop-blur-sm" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                      <Twitter className="h-4 w-4" style={{ color: currentTheme.text_color }} />
                    </a>
                  )}
                </div>
              )}
            </div>
        )}

        {/* If Minimal, social links aligned left */}
        {Object.keys(socialLinks).some(k => socialLinks[k]) && layout === 'minimal' && (
          <div className="flex gap-2.5 mb-6 px-5 w-full">
            {socialLinks.instagram && (
              <a href={socialLinks.instagram.startsWith('http') ? socialLinks.instagram : `https://${socialLinks.instagram}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full transition-colors hover:opacity-80" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                <Instagram className="h-4 w-4" style={{ color: currentTheme.text_color }} />
              </a>
            )}
            {socialLinks.tiktok && (
              <a href={socialLinks.tiktok.startsWith('http') ? socialLinks.tiktok : `https://${socialLinks.tiktok}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full transition-colors hover:opacity-80" style={{ backgroundColor: currentTheme.text_color + '10' }}>
                <TikTokIcon className="h-4 w-4 text-current" />
              </a>
            )}
            {socialLinks.youtube && (
             <a href={socialLinks.youtube.startsWith('http') ? socialLinks.youtube : `https://${socialLinks.youtube}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full transition-colors hover:opacity-80" style={{ backgroundColor: currentTheme.text_color + '10' }}>
               <Youtube className="h-4 w-4" style={{ color: currentTheme.text_color }} />
             </a>
            )}
            {socialLinks.twitter && (
             <a href={socialLinks.twitter.startsWith('http') ? socialLinks.twitter : `https://${socialLinks.twitter}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-full transition-colors hover:opacity-80" style={{ backgroundColor: currentTheme.text_color + '10' }}>
               <Twitter className="h-4 w-4" style={{ color: currentTheme.text_color }} />
             </a>
            )}
          </div>
        )}

            {/* Blocks */}
            <div className="flex flex-col items-center w-full space-y-3 px-5 relative z-20">
              {visibleBlocks.length === 0 ? (
                <p 
                  className="text-center text-sm py-8 opacity-50"
                  style={{ color: currentTheme.text_color }}
                >
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

        {/* Footer */}
        <div className="mt-8 mb-6 pb-4 text-center">
          <p 
            className="text-xs opacity-40 font-medium"
            style={{ color: currentTheme.text_color }}
          >
            Feito com ❤️ na Kivo
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
