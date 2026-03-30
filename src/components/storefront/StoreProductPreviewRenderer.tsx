import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Instagram, Youtube, Twitter, Link2, ImageIcon } from "lucide-react";
import type { StorefrontThemeTokens } from "@/hooks/useStorefrontTheme";
import type { StorefrontProfile } from "@/hooks/useStorefrontProfile";

// TikTok icon
const TikTokIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
  </svg>
);

interface ProductData {
  name: string;
  shortDescription?: string;
  ctaText: string;
  thumbnailUrl?: string;
  cardStyle: "button" | "callout" | "preview";
  price?: number;
  compareAtPrice?: number;
  isFree?: boolean;
  checkoutImage?: string;
  description?: string;
}

interface StoreProductPreviewRendererProps {
  product: ProductData;
  theme: StorefrontThemeTokens;
  profile: StorefrontProfile;
  mode: "thumbnail" | "checkout";
  showContext?: boolean; // Show storefront header/profile
}

function SocialIcon({ platform }: { platform: string }) {
  const icons: Record<string, React.ElementType> = {
    instagram: Instagram,
    twitter: Twitter,
    youtube: Youtube,
    tiktok: TikTokIcon,
  };
  const Icon = icons[platform.toLowerCase()] ?? Link2;
  return <Icon className="h-4 w-4" />;
}

export function StoreProductPreviewRenderer({
  product,
  theme,
  profile,
  mode,
  showContext = true,
}: StoreProductPreviewRendererProps) {
  
  const socialEntries = Object.entries(profile.socialLinks).filter(([_, url]) => url);

  return (
    <div 
      className="w-full h-full overflow-y-auto"
      style={{ 
        backgroundColor: theme.backgroundColor,
        fontFamily: theme.fontBody,
      }}
    >
      {/* Storefront Header/Profile Context */}
      {showContext && (
        <div 
          className="px-4 pt-10 pb-4 border-b"
          style={{ 
            borderColor: theme.textColor + '10',
            gap: theme.spacing,
          }}
        >
          <div className="flex flex-col items-center text-center">
            <Avatar className="h-16 w-16 mb-3">
              <AvatarImage src={profile.avatarUrl || undefined} />
              <AvatarFallback style={{ backgroundColor: theme.primaryColor + '20', color: theme.primaryColor }}>
                {profile.title.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <h1 className="font-bold text-lg" style={{ color: theme.textColor }}>
              {profile.title}
            </h1>
            {profile.bio && (
              <p className="text-sm mt-1 line-clamp-2" style={{ color: theme.textColor, opacity: 0.7 }}>
                {profile.bio}
              </p>
            )}
            {socialEntries.length > 0 && (
              <div className="flex gap-3 mt-3">
                {socialEntries.map(([platform, url]) => (
                  <a
                    key={platform}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-full transition-colors"
                    style={{ 
                      backgroundColor: theme.textColor + '10',
                      color: theme.textColor,
                    }}
                  >
                    <SocialIcon platform={platform} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Preview */}
      <div className="p-4" style={{ paddingTop: showContext ? theme.spacing : '2.5rem' }}>
        {mode === "thumbnail" && (
          <>
            {/* Button Style */}
            {product.cardStyle === "button" && (
              <div 
                className="w-full py-4 px-6 border-2 text-center text-sm font-bold shadow-sm truncate"
                style={{ 
                  borderColor: theme.primaryColor, 
                  color: theme.textColor, 
                  backgroundColor: theme.backgroundColor,
                  borderRadius: theme.buttonRadius,
                  boxShadow: theme.cardShadow,
                }}
              >
                {product.name || "Título do Produto"}
              </div>
            )}

            {/* Callout Style */}
            {product.cardStyle === "callout" && (
              <div 
                className="w-full border p-5"
                style={{ 
                  borderColor: theme.primaryColor + '40', 
                  backgroundColor: theme.backgroundColor,
                  borderRadius: theme.cardRadius,
                  boxShadow: theme.cardShadow,
                  gap: theme.spacing,
                }}
              >
                {product.thumbnailUrl && (
                  <div 
                    className="w-full h-40 mb-4 overflow-hidden flex items-center justify-center"
                    style={{ 
                      backgroundColor: theme.textColor + '10',
                      borderRadius: theme.imageRadius,
                    }}
                  >
                    <img src={product.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <p className="font-bold text-lg leading-snug" style={{ color: theme.textColor }}>
                  {product.name || "Título do produto"}
                </p>
                {product.shortDescription && (
                  <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textColor, opacity: 0.7 }}>
                    {product.shortDescription}
                  </p>
                )}
                <div
                  className="mt-5 py-3 text-white text-sm font-medium text-center"
                  style={{ 
                    backgroundColor: theme.primaryColor, 
                    borderRadius: theme.buttonRadius,
                    boxShadow: `0 4px 14px ${theme.primaryColor}40`,
                  }}
                >
                  {product.ctaText || "Comprar"}
                </div>
              </div>
            )}

            {/* Preview Style */}
            {product.cardStyle === "preview" && (
              <div 
                className="w-full overflow-hidden border"
                style={{ 
                  borderColor: theme.primaryColor + '40', 
                  backgroundColor: theme.backgroundColor,
                  borderRadius: theme.cardRadius,
                  boxShadow: theme.cardShadow,
                }}
              >
                <div 
                  className="h-44 flex items-center justify-center overflow-hidden" 
                  style={{ 
                    backgroundColor: theme.textColor + '10',
                    borderRadius: `${theme.cardRadius} ${theme.cardRadius} 0 0`,
                  }}
                >
                  {product.thumbnailUrl ? (
                    <img src={product.thumbnailUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-10 w-10" style={{ color: theme.textColor, opacity: 0.3 }} />
                  )}
                </div>
                <div className="p-5">
                  <p className="font-bold text-lg leading-snug" style={{ color: theme.textColor }}>
                    {product.name || "Título do produto"}
                  </p>
                  {product.shortDescription && (
                    <p className="text-sm mt-2 line-clamp-2" style={{ color: theme.textColor, opacity: 0.7 }}>
                      {product.shortDescription}
                    </p>
                  )}
                  
                  <div className="mt-4 flex items-center justify-between">
                    {product.price !== undefined && (
                      <span className="font-bold" style={{ color: theme.textColor }}>
                        {product.isFree ? "Gratuito" : `R$ ${product.price.toFixed(2).replace(".", ",")}`}
                      </span>
                    )}
                    <div
                      className="py-2.5 px-5 text-white text-sm font-medium"
                      style={{ 
                        backgroundColor: theme.primaryColor, 
                        borderRadius: theme.buttonRadius,
                        boxShadow: `0 4px 14px ${theme.primaryColor}40`,
                      }}
                    >
                      {product.ctaText || "Comprar"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {mode === "checkout" && (
          <div className="min-h-full">
            {product.checkoutImage && (
              <div 
                className="h-48 overflow-hidden -mx-4 -mt-4 mb-4"
                style={{ borderRadius: `0 0 ${theme.imageRadius} ${theme.imageRadius}` }}
              >
                <img src={product.checkoutImage} className="w-full h-full object-cover" alt="" />
              </div>
            )}
            <div className="space-y-4">
              <p className="font-bold text-xl leading-snug" style={{ color: theme.textColor }}>
                {product.name || "Título do Produto"}
              </p>
              
              {product.price !== undefined && (
                <div className="flex items-center gap-2">
                  {!product.isFree && product.price > 0 && (
                    <span className="text-2xl font-bold" style={{ color: theme.primaryColor }}>
                      R$ {product.price.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                  {!product.isFree && product.compareAtPrice && (
                    <span className="text-sm line-through" style={{ color: theme.textColor, opacity: 0.5 }}>
                      R$ {product.compareAtPrice.toFixed(2).replace(".", ",")}
                    </span>
                  )}
                  {product.isFree && (
                    <span className="text-xl font-bold" style={{ color: theme.primaryColor }}>
                      Download Grátis
                    </span>
                  )}
                </div>
              )}

              {product.description && (
                <p className="text-sm line-clamp-5 mt-4" style={{ color: theme.textColor, opacity: 0.8 }}>
                  {product.description}
                </p>
              )}

              <div className="pt-6 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: theme.textColor }}>Nome completo</p>
                  <div 
                    className="h-10 border"
                    style={{ 
                      backgroundColor: theme.textColor + '10', 
                      borderColor: theme.textColor + '30',
                      borderRadius: theme.buttonRadius,
                    }} 
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium" style={{ color: theme.textColor }}>E-mail de acesso</p>
                  <div 
                    className="h-10 border"
                    style={{ 
                      backgroundColor: theme.textColor + '10', 
                      borderColor: theme.textColor + '30',
                      borderRadius: theme.buttonRadius,
                    }} 
                  />
                </div>
                <div className="pt-2">
                  <div
                    className="w-full py-4 text-white font-medium text-center"
                    style={{ 
                      backgroundColor: theme.primaryColor, 
                      borderRadius: theme.buttonRadius, 
                      boxShadow: `0 4px 14px ${theme.primaryColor}40`,
                    }}
                  >
                    {product.ctaText || "Finalizar Compra"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Skeleton blocks below (simulating other products) */}
      {showContext && mode === "thumbnail" && (
        <div className="px-4 pb-4 space-y-3">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="w-full h-20 animate-pulse"
              style={{
                backgroundColor: theme.textColor + '05',
                borderRadius: theme.cardRadius,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
