import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { formatCurrency, cn } from "@/lib/utils";
import {
  Store as StoreIcon,
  ExternalLink,
  Copy,
  Package,
  Plus,
  MoreVertical,
  Pencil,
  Archive,
  Trash2,
  Megaphone,
  Calendar,
  GraduationCap,
  Palette,
  LayoutGrid,
  Instagram,
  Twitter,
  Youtube,
  Link2,
  Check,
  Loader2,
  User,
  FileText,
  GripVertical,
  AlertCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProfileSection } from "@/components/storefront/ProfileSection";
import { BlocksSection } from "@/components/storefront/BlocksSection";
import { ThemeSection } from "@/components/storefront/ThemeSection";
import { StorefrontPreview } from "@/components/storefront/StorefrontPreview";
import type { StorefrontData, StorefrontTheme, StorefrontBlock } from "@/pages/StorefrontEditor";

type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type StoreTab = "loja" | "landing-pages" | "design";

const TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  DIGITAL:     { label: "Digital",      icon: Package },
  LEAD_MAGNET: { label: "Lead Magnet",  icon: Megaphone },
  SERVICE:     { label: "Serviço",      icon: Calendar },
  COURSE:      { label: "Curso",        icon: GraduationCap },
  PHYSICAL:    { label: "Físico",       icon: Package },
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Ativo",
  DRAFT:     "Rascunho",
  ARCHIVED:  "Arquivado",
};

function SocialIcon({ platform }: { platform: string }) {
  const icons: Record<string, React.ElementType> = {
    instagram: Instagram,
    twitter: Twitter,
    youtube: Youtube,
  };
  const Icon = icons[platform.toLowerCase()] ?? Link2;
  return <Icon className="h-4 w-4" />;
}

// ─── Store Profile Card (Stan-style horizontal) ──────────────────────────────
function StoreProfileCard({ 
  storefront, 
  storeUrl, 
  onCopy, 
  onOpen 
}: {
  storefront: any;
  storeUrl: string | null;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const socialLinks = (storefront.social_links as Record<string, string>) || {};
  const socialEntries = Object.entries(socialLinks).filter(([, v]) => !!v);

  return (
    <div className="flex items-center gap-6 p-7 rounded-[20px] bg-white border border-[#ececec] shadow-sm">
      {/* Avatar - Increased size */}
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden ring-2 ring-border/30">
        {storefront.avatar_url ? (
          <img src={storefront.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <User className="h-8 w-8 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap mb-1">
          <h2 className="text-[17px] font-bold text-[#111827] truncate leading-tight">
            {storefront.title || "Minha Loja"}
          </h2>
          {storefront.is_published && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[11px] font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Online
            </div>
          )}
        </div>
        {storefront.bio && (
          <p className="text-[13px] text-[#6b7280] line-clamp-1 mb-2">{storefront.bio}</p>
        )}
        <div className="flex items-center gap-3">
          {storeUrl && (
            <p className="text-[13px] text-[#6b7280] font-medium truncate">
              {storeUrl.replace(/https?:\/\//, '')}
            </p>
          )}
          {socialEntries.length > 0 && (
            <>
              <span className="w-1 h-1 rounded-full bg-[#6b7280]/30" />
              <div className="flex items-center gap-2">
                {socialEntries.slice(0, 3).map(([platform]) => (
                  <span key={platform} className="text-[#6b7280]">
                    <SocialIcon platform={platform} />
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {storeUrl && (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full text-[#6b7280] hover:bg-muted hover:text-foreground" 
              onClick={onCopy}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-9 w-9 rounded-full text-[#6b7280] hover:bg-muted hover:text-foreground" 
              onClick={onOpen}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Product List Item (Stan-style compact horizontal) ───────────────────────
function ProductListItem({
  product,
  onEdit,
  onArchive,
  onDelete,
  onDuplicate,
  dragging,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  product: any;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const typeInfo = TYPE_LABELS[product.type] ?? TYPE_LABELS.DIGITAL;
  const TypeIcon = typeInfo.icon;
  const price = product.prices?.find((p: any) => p.is_default && p.is_active);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={cn(
        "flex items-center gap-3 px-3 py-3 rounded-[14px] bg-white transition-all group cursor-pointer select-none",
        dragging
          ? "opacity-50 scale-[0.98] ring-2 ring-primary/40"
          : "border border-[#ececec] hover:bg-[#fafafa] hover:border-[#d4d4d4]"
      )}
      onClick={onEdit}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-[#d4d4d4] group-hover:text-[#9ca3af] transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail */}
      <div className="h-12 w-12 rounded-[10px] overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border/40">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <TypeIcon className="h-5 w-5 text-[#9ca3af]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-[#111827] truncate leading-tight">
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[12px] text-[#6b7280] font-medium">{typeInfo.label}</span>
          {price && (
            <>
              <span className="text-[#d4d4d4] text-[10px]">·</span>
              <span className="text-[12px] font-semibold text-[#6b7280]">
                {formatCurrency(price.amount)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Status & Actions */}
      <div className="flex items-center gap-2.5">
        <Badge 
          variant="outline" 
          className={cn(
            "text-[11px] font-semibold px-2.5 py-0.5 border",
            product.status === "PUBLISHED" 
              ? "bg-green-50 text-green-700 border-green-200" 
              : product.status === "DRAFT"
              ? "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]"
              : "bg-muted/50 text-muted-foreground border-border"
          )}
        >
          {STATUS_LABELS[product.status ?? "DRAFT"]}
        </Badge>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-[#9ca3af] hover:bg-muted hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4 mr-2" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" /> Duplicar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onArchive}>
              <Archive className="h-4 w-4 mr-2" /> Arquivar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onDelete}>
              <Trash2 className="h-4 w-4 mr-2" /> Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// ─── Premium Phone Preview (Stan-style) ──────────────────────────────────────
function PremiumPhonePreview({
  storefront,
  theme,
  blocks,
}: {
  storefront: any;
  theme: StorefrontTheme | null | undefined;
  blocks: StorefrontBlock[];
}) {
  return (
    <div className="w-full flex flex-col items-center">
      {/* Phone Shell — Stan-style: no label, no badge */}
      <div className="relative" style={{ width: 340, height: 680 }}>
        {/* Ambient glow */}
        <div className="absolute inset-0 rounded-[48px] bg-primary/5 blur-3xl scale-110 pointer-events-none" />

        {/* Phone frame */}
        <div className="relative w-full h-full bg-[#0d0d0d] rounded-[46px] border-[9px] border-[#1a1a1a] shadow-[0_50px_100px_-20px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] overflow-hidden flex flex-col">

          {/* Glass reflection */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-10 rounded-t-[38px]" />

          {/* Dynamic Island */}
          <div className="absolute top-0 inset-x-0 h-9 flex justify-center items-start z-20 pt-2">
            <div className="w-[90px] h-[22px] bg-[#0d0d0d] rounded-b-[14px] shadow-xl border-t border-white/5" />
          </div>

          {/* Screen Content */}
          <div className="flex-1 w-full h-full relative pt-9">
            <StorefrontPreview
              storefront={storefront}
              theme={theme ?? undefined}
              blocks={blocks}
            />
          </div>

          {/* Home indicator */}
          <div className="flex-shrink-0 h-8 flex items-center justify-center bg-gradient-to-t from-black/20">
            <div className="w-28 h-1 bg-white/30 rounded-full" />
          </div>
        </div>

        {/* Side buttons — subtle */}
        <div className="absolute right-[-2px] top-28 w-[2px] h-10 bg-[#2a2a2a] rounded-r-sm" />
        <div className="absolute left-[-2px] top-24 w-[2px] h-7 bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute left-[-2px] top-36 w-[2px] h-7 bg-[#2a2a2a] rounded-l-sm" />
        <div className="absolute left-[-2px] top-48 w-[2px] h-12 bg-[#2a2a2a] rounded-l-sm" />
      </div>
    </div>
  );
}

// ─── Aba Loja (Store Tab) ────────────────────────────────────────────────────
function AbaLoja({
  storefront,
  storeUrl,
  products,
  setProducts,
  productsLoading,
  blocks,
  onBlocksChange,
  onCopy,
  onOpen,
  navigate,
  onArchive,
  onDelete,
  onDuplicate,
}: {
  storefront: any;
  storeUrl: string | null;
  products: any[];
  setProducts: (p: any[]) => void;
  productsLoading: boolean;
  blocks: StorefrontBlock[];
  onBlocksChange: () => void;
  onCopy: () => void;
  onOpen: () => void;
  navigate: (path: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const dragIndexRef = useRef<number | null>(null);

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from === null || from === index) return;
    const reordered = [...products];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(index, 0, moved);
    setProducts(reordered);
    dragIndexRef.current = index;
  };

  const handleDrop = () => {
    dragIndexRef.current = null;
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
  };

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      {storefront && (
        <StoreProfileCard
          storefront={storefront}
          storeUrl={storeUrl}
          onCopy={onCopy}
          onOpen={onOpen}
        />
      )}

      {/* Blocks section removed — only Listings remain */}

      {/* Products Section */}
      <div className="pt-8 border-t border-[#e5e7eb]/80">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[15px] font-bold text-[#111827]">Listings</h3>
          <span className="text-[12px] text-[#6b7280] font-medium">
            {products.length} {products.length === 1 ? "item" : "items"}
          </span>
        </div>

        {productsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-[14px]" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-[20px] border-2 border-dashed border-[#e5e7eb] bg-[#fafafa]/50">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <p className="text-[16px] font-bold text-[#111827] mb-2">
              Nenhum produto ainda
            </p>
            <p className="text-[14px] text-[#6b7280] mb-6 max-w-[280px]">
              Crie seu primeiro produto para começar a vender
            </p>
            <Button 
              onClick={() => navigate("/products/new")} 
              className="gap-2 rounded-[12px] h-11 px-6 font-bold shadow-lg shadow-primary/25"
            >
              <Plus className="h-4 w-4" /> Criar produto
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {products.map((product: any, index: number) => (
              <ProductListItem
                key={product.id}
                product={product}
                onEdit={() => navigate(`/products/${product.id}/edit`)}
                onArchive={() => onArchive(product.id)}
                onDelete={() => onDelete(product.id)}
                onDuplicate={() => onDuplicate(product.id)}
                dragging={dragIndexRef.current === index}
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
              />
            ))}
          </div>
        )}

        {/* Add Product CTA */}
        {products.length > 0 && (
          <div className="mt-4 space-y-3">
            <button
              onClick={() => navigate("/products/new")}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-[16px] border-2 border-dashed border-primary/40 bg-primary/5 text-[14px] font-bold text-primary hover:bg-primary/10 hover:border-primary/60 transition-all"
            >
              <Plus className="h-5 w-5" />
              Adicionar Produto
            </button>
            <div className="text-center">
              <button className="text-[13px] font-semibold text-[#6b7280] hover:text-[#111827] transition-colors">
                Adicionar Seção
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba Landing Pages ───────────────────────────────────────────────────────
function AbaLandingPages({
  products,
  loading,
  navigate,
}: {
  products: any[];
  loading: boolean;
  navigate: (path: string) => void;
}) {
  const landingPages = products.filter(
    (p: any) => p.type === "LEAD_MAGNET" || p.type === "SERVICE" || p.type === "DIGITAL"
  );

  return (
    <div className="space-y-5">
      <p className="text-[14px] text-[#6b7280]">
        Páginas e ofertas dedicadas com checkout ou captura de leads.
      </p>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <Skeleton key={i} className="h-[68px] rounded-[14px]" />)}
        </div>
      ) : landingPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center rounded-[20px] border-2 border-dashed border-[#e5e7eb] bg-[#fafafa]/50">
          <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <FileText className="h-7 w-7 text-primary" />
          </div>
          <p className="text-[15px] font-bold text-[#111827] mb-2">
            Nenhuma landing page ainda
          </p>
          <p className="text-[13px] text-[#6b7280] mb-5 max-w-xs">
            Crie uma página de captura, serviço ou produto digital
          </p>
          <Button 
            size="sm" 
            onClick={() => navigate("/products/new")} 
            className="gap-2 rounded-[12px] font-bold"
          >
            <Plus className="h-4 w-4" /> Criar landing page
          </Button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {landingPages.map((product: any) => {
            const typeInfo = TYPE_LABELS[product.type] ?? TYPE_LABELS.DIGITAL;
            const TypeIcon = typeInfo.icon;
            const price = product.prices?.find((p: any) => p.is_default && p.is_active);

            return (
              <div
                key={product.id}
                className="flex items-center gap-3 px-4 py-3.5 rounded-[14px] border border-[#ececec] bg-white hover:border-[#d4d4d4] hover:bg-[#fafafa] transition-all cursor-pointer"
                onClick={() => navigate(`/products/${product.id}/edit`)}
              >
                <div className="h-12 w-12 rounded-[10px] overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {product.thumbnail_url ? (
                    <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <TypeIcon className="h-5 w-5 text-[#9ca3af]" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#111827] truncate">{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[12px] text-[#6b7280]">{typeInfo.label}</span>
                    {price && (
                      <>
                        <span className="text-[#d4d4d4] text-[10px]">·</span>
                        <span className="text-[12px] font-semibold text-[#6b7280]">
                          {formatCurrency(price.amount)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-[11px] font-semibold shrink-0",
                    product.status === "PUBLISHED" 
                      ? "bg-green-50 text-green-700 border-green-200" 
                      : "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]"
                  )}
                >
                  {STATUS_LABELS[product.status ?? "DRAFT"]}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => navigate("/products/new")}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-[16px] border-2 border-dashed border-primary/40 bg-primary/5 text-[14px] font-bold text-primary hover:bg-primary/10 hover:border-primary/60 transition-all mt-5"
      >
        <Plus className="h-5 w-5" />
        Adicionar Landing Page
      </button>
    </div>
  );
}

// ─── Aba Design (Edit Design) ────────────────────────────────────────────────
function AbaDesign({
  storefront,
  theme,
  saveStatus,
  onUpdateStorefront,
  onUpdateTheme,
  setLocalStorefront,
  setLocalTheme,
}: {
  storefront: StorefrontData;
  theme: StorefrontTheme | null | undefined;
  saveStatus: "saved" | "saving" | "unsaved";
  onUpdateStorefront: (data: Partial<StorefrontData>) => void;
  onUpdateTheme: (data: Partial<StorefrontTheme>) => void;
  setLocalStorefront: React.Dispatch<React.SetStateAction<StorefrontData | null>>;
  setLocalTheme: React.Dispatch<React.SetStateAction<StorefrontTheme | null | undefined>>;
}) {
  const [activePanel, setActivePanel] = useState<"theme" | "profile">("theme");

  const handleStorefrontUpdate = (data: Partial<StorefrontData>) => {
    setLocalStorefront(prev => prev ? { ...prev, ...data } : null);
    onUpdateStorefront(data);
  };

  const handleThemeUpdate = (data: Partial<StorefrontTheme>) => {
    setLocalTheme(prev => prev ? { ...prev, ...data } : undefined);
    onUpdateTheme(data);
  };

  return (
    <div className="flex flex-col w-full min-h-[700px] relative">

      {/* Compact pills tabs — Stan-style: no card wrapper */}
      <div className="flex items-center gap-1.5 pb-5">
        {[
          { key: "theme",   label: "Tema",    icon: Palette },
          { key: "profile", label: "Perfil",  icon: User },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActivePanel(key as any)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] font-bold transition-all",
              activePanel === key
                ? "bg-[#111827] text-white shadow-sm"
                : "text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827]"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Panel content — no card, open layout */}
      <div className="flex-1 overflow-y-auto">
        {activePanel === "theme" && (
          <ThemeSection
            theme={theme ?? undefined}
            storefrontId={storefront.id}
            onUpdate={handleThemeUpdate}
          />
        )}
        {activePanel === "profile" && (
          <ProfileSection
            storefront={storefront}
            onUpdate={handleStorefrontUpdate}
          />
        )}
      </div>

      {/* Footer actions — aligned right, Stan-style */}
      <div className="pt-5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[12px] font-semibold">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#6b7280]" />
              <span className="text-[#6b7280]">Salvando...</span>
            </>
          )}
          {saveStatus === "saved" && (
            <>
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-green-600]">Tudo salvo</span>
            </>
          )}
          {saveStatus === "unsaved" && (
            <span className="text-amber-600">Alterações não salvas</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="h-10 px-5 rounded-[10px] text-[13px] font-bold border-[#e5e7eb] text-[#374151] hover:text-[#111827] hover:border-[#d1d5db]"
          >
            Cancel
          </Button>
          <Button className="h-10 px-7 rounded-[10px] text-[13px] font-bold shadow-md shadow-primary/20">
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function Store() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const tab = (searchParams.get("tab") as StoreTab) || "loja";
  const setTab = (t: StoreTab) => setSearchParams({ tab: t }, { replace: true });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [localProducts, setLocalProducts] = useState<any[] | null>(null);

  // Local state for real-time preview updates
  const [localStorefront, setLocalStorefront] = useState<StorefrontData | null>(null);
  const [localTheme, setLocalTheme] = useState<StorefrontTheme | null | undefined>(undefined);

  

  // Fetch storefront
  const { data: storefront, isLoading: storefrontLoading } = useQuery({
    queryKey: ["storefront", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return null;
      const { data, error } = await supabase
        .from("storefronts")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .single();
      if (error) throw error;
      return { 
        ...data, 
        social_links: (data.social_links as Record<string, string>) || {} 
      } as unknown as StorefrontData;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Fetch theme
  const { data: theme } = useQuery({
    queryKey: ["storefront-theme", storefront?.id],
    queryFn: async () => {
      if (!storefront?.id) return null;
      const { data, error } = await supabase
        .from("storefront_themes")
        .select("*")
        .eq("storefront_id", storefront.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data as StorefrontTheme | null;
    },
    enabled: !!storefront?.id,
  });

  // Fetch blocks
  const { data: blocks = [] } = useQuery({
    queryKey: ["storefront-blocks", storefront?.id],
    queryFn: async () => {
      if (!storefront?.id) return [];
      const { data, error } = await supabase
        .from("storefront_blocks")
        .select("*")
        .eq("storefront_id", storefront.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return data as StorefrontBlock[];
    },
    enabled: !!storefront?.id,
  });

  // Fetch products
  const { data: fetchedProducts = [], isLoading: productsLoading } = useQuery({
    queryKey: ["all-products", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*, prices(*)")
        .eq("workspace_id", currentWorkspace.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  const products: any[] = (localProducts ?? fetchedProducts ?? []) as any[];
  const setProducts = setLocalProducts;

  // Mutations
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .update({ status: "ARCHIVED" as ProductStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto arquivado.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto excluído.");
    },
  });

  const duplicateProductMutation = useMutation({
    mutationFn: async (product: any) => {
      // Deep copy product, create new one with " - Cópia" suffix
      const { data, error } = await supabase
        .from("products")
        .insert({
          workspace_id: product.workspace_id,
          name: `${product.name} - Cópia`,
          type: product.type,
          status: "DRAFT", // Always duplicate as draft
          description: product.description,
          short_description: product.short_description,
          thumbnail_url: product.thumbnail_url,
          // Note: We don't copy prices/attachments for now to avoid complexity
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto duplicado.");
    },
    onError: () => {
      toast.error("Erro ao duplicar produto.");
    }
  });

  const saveStorefrontMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontData>) => {
      if (!storefront?.id) throw new Error("No storefront");
      setSaveStatus("saving");
      const { error } = await supabase
        .from("storefronts")
        .update({
          title: data.title,
          bio: data.bio,
          avatar_url: data.avatar_url,
          banner_url: data.banner_url,
          social_links: data.social_links,
        })
        .eq("id", storefront.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["storefront"] });
    },
    onError: () => {
      setSaveStatus("unsaved");
      toast.error("Erro ao salvar.");
    },
  });

  const saveThemeMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontTheme>) => {
      if (!storefront?.id) throw new Error("No storefront");
      setSaveStatus("saving");
      if (theme?.id) {
        const { error } = await supabase
          .from("storefront_themes")
          .update(data)
          .eq("id", theme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("storefront_themes")
          .insert({
            storefront_id: storefront.id,
            template_key: data.template_key || "minimal",
            primary_color: data.primary_color || "#F9423A",
            secondary_color: data.secondary_color || "#1a1a1a",
            background_color: data.background_color || "#ffffff",
            text_color: data.text_color || "#1a1a1a",
            font_heading: data.font_heading || "Inter",
            font_body: data.font_body || "Inter",
            button_style: data.button_style || "rounded",
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["storefront-theme"] });
    },
    onError: () => {
      setSaveStatus("unsaved");
      toast.error("Erro ao salvar tema.");
    },
  });

  // Debounced saves
  const debouncedSaveStorefront = useCallback(
    (data: Partial<StorefrontData>) => {
      setSaveStatus("unsaved");
      const t = setTimeout(() => saveStorefrontMutation.mutate(data), 1500);
      return () => clearTimeout(t);
    },
    [saveStorefrontMutation]
  );

  const debouncedSaveTheme = useCallback(
    (data: Partial<StorefrontTheme>) => {
      setSaveStatus("unsaved");
      const t = setTimeout(() => saveThemeMutation.mutate(data), 1500);
      return () => clearTimeout(t);
    },
    [saveThemeMutation]
  );

  // Store URL
  const storeUrl = storefront?.slug 
    ? `${window.location.origin}/${storefront.slug}` 
    : null;

  const copyLink = () => {
    if (storeUrl) {
      navigator.clipboard.writeText(storeUrl);
      toast.success("Link copiado!");
    }
  };

  const openStore = () => {
    if (storeUrl) window.open(storeUrl, "_blank");
  };

  // Loading state
  if (storefrontLoading) {
    return (
      <div className="p-8 space-y-5">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24 w-full rounded-[20px]" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] rounded-[14px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 md:px-10 max-w-[1600px] mx-auto w-full">
      
      {/* Warning Banner */}
      {storefront && !storefront.is_published && (
        <div className="mb-7 rounded-[16px] bg-[#fffbeb] px-5 py-4 border border-[#fef3c7] flex items-center justify-center gap-2">
          <AlertCircle className="h-4 w-4 text-[#b45309]" />
          <p className="text-[13px] font-semibold text-[#b45309]">
            Sua loja ainda não está publicada. Você pode{" "}
            <button className="text-[#0284c7] hover:underline font-bold">
              publicá-la aqui
            </button>
            .
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-8">
        <div>
          <h1 className="text-[36px] font-bold text-[#111827] tracking-tight leading-none mb-2">
            Minha Loja
          </h1>
          {storeUrl && (
            <div className="flex items-center gap-2.5">
              <a
                href={storeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[14px] font-medium text-[#6b7280] hover:text-primary transition-colors"
              >
                {storeUrl.replace(/https?:\/\//, "")}
              </a>
              <button
                onClick={copyLink}
                className="text-[#9ca3af] hover:text-primary p-1 rounded-md hover:bg-primary/10 transition-colors"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {storeUrl && (
            <Button
              variant="outline"
              onClick={openStore}
              className="gap-2 rounded-[12px] h-11 px-5 font-bold border-[#ececec] hover:border-[#d4d4d4]"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir loja
            </Button>
          )}
          <Button
            onClick={() => navigate("/products/new")}
            className="gap-2 rounded-[12px] h-11 px-6 font-bold shadow-lg shadow-primary/25"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        </div>
      </div>

      {/* Main Layout: 65/35 Split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] xl:grid-cols-[1fr_420px] gap-12 items-start">
        
        {/* Left Column: Editor */}
        <div className="w-full min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as StoreTab)}>
            
            {/* Tabs */}
            <TabsList className="bg-transparent h-auto p-0 gap-1.5 mb-7 flex-wrap justify-start border-none">
              <TabsTrigger
                value="loja"
                className={cn(
                  "gap-2 text-[14px] font-bold px-5 py-2.5 rounded-full border transition-all data-[state=active]:bg-[#111827] data-[state=active]:text-white data-[state=active]:border-transparent",
                  tab === "loja"
                    ? "bg-[#111827] text-white border-transparent"
                    : "border-transparent text-[#6b7280] hover:text-[#111827] hover:bg-[#fafafa] data-[state=active]:shadow-none"
                )}
              >
                <StoreIcon className="h-4 w-4" />
                Loja
              </TabsTrigger>
              <TabsTrigger
                value="landing-pages"
                className={cn(
                  "gap-2 text-[14px] font-bold px-5 py-2.5 rounded-full border transition-all",
                  tab === "landing-pages"
                    ? "bg-[#111827] text-white border-transparent"
                    : "border-transparent text-[#6b7280] hover:text-[#111827] hover:bg-[#fafafa]"
                )}
              >
                <FileText className="h-4 w-4" />
                Landing Pages
              </TabsTrigger>
              <TabsTrigger
                value="design"
                className={cn(
                  "gap-2 text-[14px] font-bold px-5 py-2.5 rounded-full border transition-all",
                  tab === "design"
                    ? "bg-[#111827] text-white border-transparent"
                    : "border-transparent text-primary/70 hover:text-primary hover:bg-primary/5"
                )}
              >
                <Palette className="h-4 w-4" />
                Editar Design
              </TabsTrigger>
            </TabsList>

            {/* Tab Contents */}
            <TabsContent value="loja" className="mt-0 outline-none">
              <AbaLoja
                storefront={storefront}
                storeUrl={storeUrl}
                products={products}
                setProducts={setProducts}
                productsLoading={productsLoading}
                blocks={blocks}
                onBlocksChange={() => queryClient.invalidateQueries({ queryKey: ["storefront-blocks"] })}
                onCopy={copyLink}
                onOpen={openStore}
                navigate={navigate}
                onArchive={(id) => archiveMutation.mutate(id)}
                onDelete={(id) => deleteMutation.mutate(id)}
                onDuplicate={(id) => duplicateProductMutation.mutate(products.find((p: any) => p.id === id))}
              />
            </TabsContent>

            <TabsContent value="landing-pages" className="mt-0 outline-none">
              <AbaLandingPages
                products={products}
                loading={productsLoading}
                navigate={navigate}
              />
            </TabsContent>

            <TabsContent value="design" className="mt-0 outline-none">
              {storefront ? (
                  <AbaDesign
                  storefront={localStorefront ?? storefront}
                  theme={localTheme ?? theme}
                  saveStatus={saveStatus}
                  onUpdateStorefront={debouncedSaveStorefront}
                  onUpdateTheme={debouncedSaveTheme}
                  setLocalStorefront={setLocalStorefront}
                  setLocalTheme={setLocalTheme}
                />
              ) : (
                <div className="py-16 text-center text-[#6b7280] text-[14px]">
                  Storefront não encontrada.
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Column: Sticky Preview */}
        <div className="sticky top-8 hidden lg:block">
          <PremiumPhonePreview
            storefront={localStorefront ?? storefront}
            theme={localTheme ?? theme}
            blocks={blocks}
          />
        </div>
      </div>
    </div>
  );
}
