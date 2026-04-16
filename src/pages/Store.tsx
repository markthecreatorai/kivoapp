import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { getDisplayPrice } from "@/lib/formatPrice";
import { resolveProductDisplay } from "@/lib/productDisplayRules";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  Eye,
  EyeOff,
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

// ─── Sortable Product List Item (using @dnd-kit) ─────────────────────────────
function SortableProductItem({
  product,
  onEdit,
  onArchive,
  onTogglePublish,
  onDelete,
  onDuplicate,
}: {
  product: any;
  onEdit: () => void;
  onArchive: () => void;
  onTogglePublish: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
  };

  const typeInfo = TYPE_LABELS[product.type] ?? TYPE_LABELS.DIGITAL;
  const TypeIcon = typeInfo.icon;
  const price = product.prices?.find((p: any) => p.is_default && p.is_active);
  const { price: priceDisplay, ctaText: _ctaText, rules } = resolveProductDisplay({
    productType: product.type,
    formatId: (product.metadata as any)?.format_id,
    amount: price?.amount,
    currency: price?.currency,
    customCTA: product.listing_button_text,
  });

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 px-3 py-3 rounded-[14px] bg-white transition-shadow group cursor-pointer select-none",
        isDragging
          ? "opacity-80 shadow-lg ring-2 ring-primary/30"
          : "border border-[#ececec] hover:bg-[#fafafa] hover:border-[#d4d4d4]"
      )}
      onClick={onEdit}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 group-hover:text-muted-foreground/70 transition-colors touch-none"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail */}
      <div className="h-12 w-12 rounded-[10px] overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border/40">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <TypeIcon className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold text-foreground truncate leading-tight">
          {product.name}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[12px] text-muted-foreground font-medium">{typeInfo.label}</span>
          {priceDisplay.label && (
            <>
              <span className="text-border text-[10px]">·</span>
              <span className={cn("text-[12px] font-semibold", priceDisplay.isFree ? "text-primary" : "text-muted-foreground")}>
                {priceDisplay.label}
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
              ? "bg-muted text-muted-foreground border-border"
              : "bg-amber-50 text-amber-700 border-amber-200"
          )}
        >
          {product.status === "PUBLISHED" ? "Ativo" : "Rascunho"}
        </Badge>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={onTogglePublish}>
              {product.status === "PUBLISHED" ? (
                <><EyeOff className="h-4 w-4 mr-2" /> Despublicar</>
              ) : (
                <><Eye className="h-4 w-4 mr-2" /> Publicar</>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDuplicate}>
              <Copy className="h-4 w-4 mr-2" /> Duplicar
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
  products,
}: {
  storefront: any;
  theme: StorefrontTheme | null | undefined;
  blocks: StorefrontBlock[];
  products?: any[];
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


          {/* Screen Content */}
          <div className="flex-1 w-full h-full relative">
            <StorefrontPreview
              storefront={storefront}
              theme={theme ?? undefined}
              blocks={blocks}
              products={products}
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
  onTogglePublish,
  onDelete,
  onDuplicate,
  onReorder,
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
  onTogglePublish: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onReorder: (reordered: any[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const productIds = useMemo(() => products.map((p: any) => p.id), [products]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = products.findIndex((p: any) => p.id === active.id);
    const newIndex = products.findIndex((p: any) => p.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const previous = products;
    const reordered = arrayMove(products, oldIndex, newIndex).map((p: any, index: number) => ({
      ...p,
      storefront_order: index,
    }));

    // Optimistic local update
    onReorder(reordered);

    // Persist order (best effort but with rollback on failure)
    const results = await Promise.allSettled(
      reordered.map((p: any, index: number) =>
        supabase.from("products").update({ storefront_order: index }).eq("id", p.id)
      )
    );

    const failed = results.some((r: any) => r.status === "rejected" || r.value?.error);
    if (failed) {
      onReorder(previous);
      toast.error("Erro ao reordenar produtos. Tente novamente.");
      return;
    }

    toast.success("Ordem dos produtos atualizada.");
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

      {/* Products Section */}
      <div className="pt-2">

        {productsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[68px] rounded-[14px]" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-[20px] border-2 border-dashed border-border bg-muted/30">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Package className="h-8 w-8 text-primary" />
            </div>
            <p className="text-[16px] font-bold text-foreground mb-2">
              Nenhum produto ainda
            </p>
            <p className="text-[14px] text-muted-foreground mb-6 max-w-[280px]">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={productIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {products.map((product: any) => (
                  <SortableProductItem
                    key={product.id}
                    product={product}
                    onEdit={() => navigate(`/products/${product.id}/edit`)}
                    onArchive={() => onArchive(product.id)}
                    onTogglePublish={() => onTogglePublish(product.id)}
                    onDelete={() => onDelete(product.id)}
                    onDuplicate={() => onDuplicate(product.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Add Product CTA */}
        {products.length > 0 && (
          <div className="mt-4">
            <Button
              onClick={() => navigate("/products/new")}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-[12px] h-12 text-[14px] font-bold shadow-sm"
            >
              <Plus className="h-5 w-5" />
              Adicionar Produto
            </Button>
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
            const { price: priceDisplay } = resolveProductDisplay({
              productType: product.type,
              formatId: (product.metadata as any)?.format_id,
              amount: price?.amount,
              currency: price?.currency,
              customCTA: product.listing_button_text,
            });

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
                    {priceDisplay.label && (
                      <>
                        <span className="text-[#d4d4d4] text-[10px]">·</span>
                        <span className={cn("text-[12px] font-semibold", priceDisplay.isFree ? "text-primary" : "text-[#6b7280]")}>
                          {priceDisplay.label}
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
        .order("storefront_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  // Dirty flags — prevent refetch from overwriting pending local edits
  const localStorefrontDirty = useRef(false);
  const localThemeDirty = useRef(false);
  const localProductsDirty = useRef(false);
  const storefrontTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const themeTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync local state with fetched data (only when not dirty)
  useEffect(() => {
    if (storefront && !localStorefrontDirty.current) setLocalStorefront(storefront);
  }, [storefront]);

  useEffect(() => {
    if (!localThemeDirty.current) setLocalTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!localProductsDirty.current) {
      setLocalProducts(null);
    }
  }, [fetchedProducts]);

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
      localProductsDirty.current = false;
      setLocalProducts(null);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto arquivado.");
    },
  });

  const togglePublishMutation = useMutation({
    mutationFn: async (id: string) => {
      const product = products.find((p: any) => p.id === id);
      const newStatus = product?.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED";
      const { error } = await supabase
        .from("products")
        .update({ status: newStatus as ProductStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      localProductsDirty.current = false;
      setLocalProducts(null);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Status do produto atualizado.");
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
      localProductsDirty.current = false;
      setLocalProducts(null);
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto excluído.");
      setDeleteTargetId(null);
    },
    onError: () => {
      toast.error("Erro ao excluir produto.");
      setDeleteTargetId(null);
    },
  });

  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const duplicateProductMutation = useMutation({
    mutationFn: async (product: any) => {
      if (!product) throw new Error("Produto não encontrado");
      const { data, error } = await supabase
        .from("products")
        .insert([{
          workspace_id: product.workspace_id,
          name: `${product.name} - Cópia`,
          slug: `${product.slug || 'product'}-copy-${Date.now()}`,
          type: product.type,
          status: "DRAFT" as const,
          description: product.description,
          short_description: product.short_description,
          thumbnail_url: product.thumbnail_url,
        }])
        .select()
        .single();
      
      if (error) throw error;

      // Duplicate prices from original product
      const defaultPrice = product.prices?.find((p: any) => p.is_default);
      if (defaultPrice && data) {
        await supabase.from("prices").insert({
          product_id: data.id,
          amount: defaultPrice.amount,
          compare_at_amount: defaultPrice.compare_at_amount,
          pix_discount_percent: defaultPrice.pix_discount_percent,
          max_installments: defaultPrice.max_installments,
          type: defaultPrice.type,
        });
      }

      return data;
    },
    onSuccess: () => {
      localProductsDirty.current = false;
      setLocalProducts(null);
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
      localStorefrontDirty.current = false;
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
      localThemeDirty.current = false;
      // Don't invalidateQueries here — local state is the source of truth
      // and a refetch would overwrite the user's current selection, causing the slider to jump.
    },
    onError: () => {
      setSaveStatus("unsaved");
      toast.error("Erro ao salvar tema.");
    },
  });

  // Debounced saves — cancel previous timer before starting new one
  const debouncedSaveStorefront = useCallback(
    (data: Partial<StorefrontData>) => {
      setSaveStatus("unsaved");
      localStorefrontDirty.current = true;
      clearTimeout(storefrontTimerRef.current);
      storefrontTimerRef.current = setTimeout(() => saveStorefrontMutation.mutate(data), 1500);
    },
    [saveStorefrontMutation]
  );

  const debouncedSaveTheme = useCallback(
    (data: Partial<StorefrontTheme>) => {
      setSaveStatus("unsaved");
      localThemeDirty.current = true;
      clearTimeout(themeTimerRef.current);
      themeTimerRef.current = setTimeout(() => saveThemeMutation.mutate(data), 1500);
    },
    [saveThemeMutation]
  );

  // Store URL
  const storeUrl = storefront?.slug 
    ? `${window.location.origin}/${storefront.slug}` 
    : null;

  const previewBlocks = tab === "loja"
    ? blocks.filter((block) => block.type !== "product")
    : blocks;

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
    <div className="px-4 py-5 md:px-6 md:py-6 max-w-[1440px] mx-auto w-full">
      
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
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-[#111827] tracking-tight leading-none mb-1.5">
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
              className="gap-2 rounded-[10px] h-9 px-4 text-[13px] font-semibold border-[#ececec] hover:border-[#d4d4d4]"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir loja
            </Button>
          )}
          <Button
            onClick={() => navigate("/products/new")}
            className="gap-2 rounded-[10px] h-9 px-4 text-[13px] font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
        </div>
      </div>

      {/* Main Layout: 65/35 Split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_400px] gap-8 items-start">
        
        {/* Left Column: Editor */}
        <div className="w-full min-w-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as StoreTab)}>
            
            {/* Tabs */}
            <TabsList className="bg-transparent h-auto p-0 gap-1 mb-5 flex-wrap justify-start border-none">
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
                onTogglePublish={(id) => togglePublishMutation.mutate(id)}
                onDelete={(id) => handleDelete(id)}
                onDuplicate={(id) => duplicateProductMutation.mutate(products.find((p: any) => p.id === id))}
                onReorder={(reordered) => {
                  localProductsDirty.current = true;
                  setProducts(reordered);
                }}
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
            blocks={previewBlocks}
            products={products}
          />
        </div>
      </div>
      <AlertDialog open={!!deleteTargetId} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este produto? Esta ação pode ser desfeita pelo suporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTargetId && deleteMutation.mutate(deleteTargetId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
