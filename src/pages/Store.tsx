import { useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  Store as StoreIcon,
  ExternalLink,
  Copy,
  Package,
  Globe,
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

// ─── Types ──────────────────────────────────────────────────────────────────

type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type StoreTab = "loja" | "landing-pages" | "design";

const TYPE_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  DIGITAL:     { label: "Digital",      icon: Package },
  LEAD_MAGNET: { label: "Lead Magnet",  icon: Megaphone },
  SERVICE:     { label: "Serviço",      icon: Calendar },
  COURSE:      { label: "Curso",        icon: GraduationCap },
  PHYSICAL:    { label: "Físico",       icon: Package },
};

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-accent/15 text-accent border-accent/30",
  DRAFT:     "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700/40",
  ARCHIVED:  "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Ativo",
  DRAFT:     "Rascunho",
  ARCHIVED:  "Arquivado",
};

// ─── Social icon helper ──────────────────────────────────────────────────────

function SocialIcon({ platform }: { platform: string }) {
  const icons: Record<string, React.ElementType> = {
    instagram: Instagram,
    twitter: Twitter,
    youtube: Youtube,
  };
  const Icon = icons[platform.toLowerCase()] ?? Link2;
  return <Icon className="h-4 w-4" />;
}

// ─── Store profile card ──────────────────────────────────────────────────────

function StoreProfileCard({ storefront, storeUrl, onCopy, onOpen }: {
  storefront: any;
  storeUrl: string | null;
  onCopy: () => void;
  onOpen: () => void;
}) {
  const socialLinks = (storefront.social_links as Record<string, string>) || {};
  const socialEntries = Object.entries(socialLinks).filter(([, v]) => !!v);

  return (
    <div className="flex items-start gap-4 p-5 rounded-xl border border-border/60 bg-card">
      {/* Avatar */}
      <div className="h-16 w-16 rounded-xl bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {storefront.avatar_url ? (
          <img src={storefront.avatar_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <StoreIcon className="h-7 w-7 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="font-semibold text-foreground truncate">{storefront.title || "Minha Loja"}</h2>
          <Badge
            variant="outline"
            className={storefront.is_published
              ? "bg-accent/15 text-accent border-accent/30"
              : "bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700/40"}
          >
            {storefront.is_published ? "Online" : "Rascunho"}
          </Badge>
        </div>
        {storefront.bio && (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{storefront.bio}</p>
        )}
        {storeUrl && (
          <p className="text-xs text-muted-foreground/70 mt-1 font-mono truncate">{storeUrl}</p>
        )}
        {socialEntries.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            {socialEntries.map(([platform]) => (
              <span key={platform} className="text-muted-foreground hover:text-foreground transition-colors">
                <SocialIcon platform={platform} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {storeUrl && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onCopy}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
        {storeUrl && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={onOpen}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Draggable Product list item ─────────────────────────────────────────────

function ProductListItem({
  product,
  onEdit,
  onArchive,
  onDelete,
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
        "flex items-center gap-3 px-3 py-3 rounded-lg border bg-card transition-all group cursor-pointer select-none",
        dragging
          ? "opacity-40 scale-[0.98] border-primary/40 shadow-none"
          : "border-border/50 hover:border-border hover:shadow-sm"
      )}
      onClick={onEdit}
    >
      {/* Drag handle */}
      <div
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </div>

      {/* Thumbnail */}
      <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
        {product.thumbnail_url ? (
          <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <TypeIcon className="h-5 w-5 text-muted-foreground/50" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-muted-foreground">{typeInfo.label}</span>
          {price && (
            <>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <span className="text-xs text-muted-foreground">{formatCurrency(price.amount)}</span>
            </>
          )}
          {product.sales_count > 0 && (
            <>
              <span className="text-muted-foreground/30 text-xs">·</span>
              <span className="text-xs text-muted-foreground">{product.sales_count} vendas</span>
            </>
          )}
        </div>
      </div>

      {/* Status */}
      <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_STYLES[product.status ?? "DRAFT"])}>
        {STATUS_LABELS[product.status ?? "DRAFT"]}
      </Badge>

      {/* Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="h-4 w-4 mr-2" /> Editar
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
  );
}

// ─── Mini store preview (simplified, shows products list) ────────────────────

function MiniStorePreview({
  storefront,
  theme,
  products,
}: {
  storefront: any;
  theme: StorefrontTheme | null | undefined;
  products: any[];
}) {
  const bg = theme?.background_color || "#ffffff";
  const txt = theme?.text_color || "#1a1a1a";
  const primary = theme?.primary_color || "#F9423A";
  const btnRadius =
    theme?.button_style === "pill" ? "9999px" :
    theme?.button_style === "square" ? "0px" : "8px";

  const publishedProducts = products.filter((p) => p.status === "PUBLISHED");

  return (
    <div className="w-[220px] flex-shrink-0">
      <p className="text-[10px] font-medium text-muted-foreground mb-2 text-center">Preview da loja</p>
      {/* Phone shell */}
      <div className="w-[220px] h-[420px] bg-black rounded-[32px] p-2 shadow-xl">
        <div
          className="w-full h-full rounded-[26px] overflow-hidden flex flex-col"
          style={{ backgroundColor: bg, fontFamily: theme?.font_body || "Inter" }}
        >
          {/* Notch */}
          <div className="flex justify-center pt-1 pb-1 flex-shrink-0">
            <div className="w-14 h-1.5 bg-black/80 rounded-full" />
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {/* Profile */}
            <div className="flex flex-col items-center text-center pt-2 pb-3">
              <div
                className="h-12 w-12 rounded-full mb-2 flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: primary + "20" }}
              >
                {storefront?.avatar_url ? (
                  <img src={storefront.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-bold" style={{ color: primary }}>
                    {storefront?.title?.charAt(0)?.toUpperCase() || "K"}
                  </span>
                )}
              </div>
              <p className="text-[11px] font-bold leading-tight" style={{ color: txt }}>
                {storefront?.title || "Minha Loja"}
              </p>
              {storefront?.bio && (
                <p className="text-[9px] mt-0.5 opacity-70 line-clamp-2" style={{ color: txt }}>
                  {storefront.bio}
                </p>
              )}
            </div>

            {/* Products */}
            <div className="space-y-2">
              {publishedProducts.length === 0 ? (
                <div
                  className="rounded-lg border border-dashed py-4 text-center"
                  style={{ borderColor: txt + "30" }}
                >
                  <p className="text-[9px] opacity-40" style={{ color: txt }}>
                    Nenhum produto publicado
                  </p>
                </div>
              ) : (
                publishedProducts.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg overflow-hidden border"
                    style={{ borderColor: primary + "30" }}
                  >
                    {p.thumbnail_url && (
                      <img
                        src={p.thumbnail_url}
                        alt={p.name}
                        className="w-full h-14 object-cover"
                      />
                    )}
                    <div className="p-1.5">
                      <p className="text-[9px] font-semibold truncate" style={{ color: txt }}>
                        {p.name}
                      </p>
                      <button
                        className="mt-1 w-full py-0.5 text-[8px] font-medium text-white"
                        style={{ backgroundColor: primary, borderRadius: btnRadius }}
                      >
                        Ver produto
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Aba Loja ────────────────────────────────────────────────────────────────

function AbaLoja({
  storefront,
  storeUrl,
  products,
  setProducts,
  productsLoading,
  theme,
  onCopy,
  onOpen,
  navigate,
  onArchive,
  onDelete,
}: {
  storefront: any;
  storeUrl: string | null;
  products: any[];
  setProducts: (p: any[]) => void;
  productsLoading: boolean;
  theme: StorefrontTheme | null | undefined;
  onCopy: () => void;
  onOpen: () => void;
  navigate: (path: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
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
    <div className="flex gap-6">
      {/* ── Left column ── */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Perfil da loja */}
        {storefront && (
          <StoreProfileCard
            storefront={storefront}
            storeUrl={storeUrl}
            onCopy={onCopy}
            onOpen={onOpen}
          />
        )}

        {/* Lista de produtos */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Itens da loja</h2>
            <span className="text-xs text-muted-foreground">{products.length} item{products.length !== 1 ? "s" : ""}</span>
          </div>

          {productsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
            </div>
          ) : products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Package className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">Nenhum produto ainda</p>
              <p className="text-xs text-muted-foreground mb-4 max-w-xs">
                Crie seu primeiro produto e ele será exibido aqui e na sua loja pública.
              </p>
              <Button size="sm" onClick={() => navigate("/products/new")} className="gap-2">
                <Plus className="h-4 w-4" /> Criar produto
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {products.map((product: any, index: number) => (
                <ProductListItem
                  key={product.id}
                  product={product}
                  onEdit={() => navigate(`/products/${product.id}/edit`)}
                  onArchive={() => onArchive(product.id)}
                  onDelete={() => onDelete(product.id)}
                  dragging={dragIndexRef.current === index ? false : false}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          )}

          {/* CTA adicionar produto */}
          <button
            onClick={() => navigate("/products/new")}
            className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
          >
            <Plus className="h-4 w-4" />
            Adicionar produto
          </button>
        </div>
      </div>

      {/* ── Right column: live mini preview ── */}
      {storefront && (
        <div className="hidden xl:flex items-start pt-1 flex-shrink-0">
          <MiniStorePreview
            storefront={storefront}
            theme={theme}
            products={products}
          />
        </div>
      )}
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
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Páginas e ofertas dedicadas com checkout ou captura de leads.
      </p>

      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
        </div>
      ) : landingPages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center rounded-xl border border-dashed border-border/60 bg-muted/20">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma landing page ainda</p>
          <p className="text-xs text-muted-foreground mb-4 max-w-xs">
            Crie uma página de captura, serviço ou produto digital para começar.
          </p>
          <Button size="sm" onClick={() => navigate("/products/new")} className="gap-2">
            <Plus className="h-4 w-4" /> Criar landing page
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {landingPages.map((product: any) => {
            const typeInfo = TYPE_LABELS[product.type] ?? TYPE_LABELS.DIGITAL;
            const TypeIcon = typeInfo.icon;
            const price = product.prices?.find((p: any) => p.is_default && p.is_active);

            return (
              <div
                key={product.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card hover:border-border hover:shadow-sm transition-all cursor-pointer"
                onClick={() => navigate(`/products/${product.id}/edit`)}
              >
                <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0">
                  {product.thumbnail_url ? (
                    <img src={product.thumbnail_url} alt={product.name} className="h-full w-full object-cover" />
                  ) : (
                    <TypeIcon className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{typeInfo.label}</span>
                    {price && (
                      <>
                        <span className="text-muted-foreground/30 text-xs">·</span>
                        <span className="text-xs text-muted-foreground">{formatCurrency(price.amount)}</span>
                      </>
                    )}
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-xs shrink-0", STATUS_STYLES[product.status ?? "DRAFT"])}>
                  {STATUS_LABELS[product.status ?? "DRAFT"]}
                </Badge>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={() => navigate("/products/new")}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border border-dashed border-border/60 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all"
      >
        <Plus className="h-4 w-4" />
        Adicionar Landing Page
      </button>
    </div>
  );
}

// ─── Aba Editar Design (inline editor) ──────────────────────────────────────

function AbaDesign({
  storefront,
  theme,
  blocks,
  saveStatus,
  onUpdateStorefront,
  onUpdateTheme,
  onBlocksChange,
}: {
  storefront: StorefrontData;
  theme: StorefrontTheme | null | undefined;
  blocks: StorefrontBlock[];
  saveStatus: "saved" | "saving" | "unsaved";
  onUpdateStorefront: (data: Partial<StorefrontData>) => void;
  onUpdateTheme: (data: Partial<StorefrontTheme>) => void;
  onBlocksChange: () => void;
}) {
  const [activePanel, setActivePanel] = useState<"profile" | "blocks" | "theme">("theme");

  return (
    <div className="flex gap-6 min-h-[600px]">
      {/* Painel esquerdo */}
      <div className="flex-1 flex flex-col">
        {/* Save status */}
        <div className="flex items-center gap-1.5 mb-4 text-xs text-muted-foreground">
          {saveStatus === "saving" && <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>}
          {saveStatus === "saved"  && <><Check className="h-3 w-3 text-green-500" /> Salvo</>}
          {saveStatus === "unsaved" && <span className="text-amber-500">Não salvo</span>}
        </div>

        {/* Mini nav */}
        <div className="flex gap-1 mb-5 p-1 bg-muted/40 rounded-lg w-fit">
          {[
            { key: "theme",   label: "Tema",    icon: Palette },
            { key: "profile", label: "Perfil",  icon: User },
            { key: "blocks",  label: "Blocos",  icon: LayoutGrid },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActivePanel(key as any)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                activePanel === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <ScrollArea className="flex-1">
          {activePanel === "theme" && (
            <ThemeSection
              theme={theme ?? undefined}
              storefrontId={storefront.id}
              onUpdate={onUpdateTheme}
            />
          )}
          {activePanel === "profile" && (
            <ProfileSection
              storefront={storefront}
              onUpdate={onUpdateStorefront}
            />
          )}
          {activePanel === "blocks" && (
            <BlocksSection
              storefrontId={storefront.id}
              blocks={blocks}
              onBlocksChange={onBlocksChange}
            />
          )}
        </ScrollArea>
      </div>

      {/* Preview mobile */}
      <div className="hidden lg:flex items-start justify-center pt-2">
        <StorefrontPreview storefront={storefront} theme={theme ?? undefined} blocks={blocks} />
      </div>
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Store() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();

  const tab = (searchParams.get("tab") as StoreTab) || "loja";
  const setTab = (t: StoreTab) => setSearchParams({ tab: t }, { replace: true });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  // Local products state for drag & drop
  const [localProducts, setLocalProducts] = useState<any[] | null>(null);

  // ── Storefront ──
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
      return { ...data, social_links: (data.social_links as Record<string, string>) || {} } as StorefrontData;
    },
    enabled: !!currentWorkspace?.id,
  });

  // ── Theme ──
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

  // ── Blocks ──
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

  // ── All products ──
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
    onSuccess: (data: any[]) => {
      // Sync local state when remote data arrives (but preserve drag order)
      setLocalProducts((prev) => {
        if (!prev) return data;
        // Map to preserve any local reordering, adding new items
        const existingIds = new Set(prev.map((p) => p.id));
        const newItems = data.filter((p) => !existingIds.has(p.id));
        const updatedPrev = prev
          .map((lp) => data.find((dp: any) => dp.id === lp.id) ?? lp)
          .filter((lp) => data.some((dp: any) => dp.id === lp.id));
        return [...updatedPrev, ...newItems];
      });
    },
  } as any);

  const products: any[] = localProducts ?? fetchedProducts ?? [];
  const setProducts = setLocalProducts;

  // ── Mutations ──
  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ status: "ARCHIVED" as ProductStatus }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto arquivado.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-products"] });
      toast.success("Produto excluído.");
    },
  });

  const saveStorefrontMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontData>) => {
      if (!storefront?.id) throw new Error("No storefront");
      setSaveStatus("saving");
      const { error } = await supabase.from("storefronts").update({
        title: data.title,
        bio: data.bio,
        avatar_url: data.avatar_url,
        social_links: data.social_links,
      }).eq("id", storefront.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["storefront"] });
    },
    onError: () => { setSaveStatus("unsaved"); toast.error("Erro ao salvar."); },
  });

  const saveThemeMutation = useMutation({
    mutationFn: async (data: Partial<StorefrontTheme>) => {
      if (!storefront?.id) throw new Error("No storefront");
      setSaveStatus("saving");
      if (theme?.id) {
        const { error } = await supabase.from("storefront_themes").update(data).eq("id", theme.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("storefront_themes").insert({
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
    onError: () => { setSaveStatus("unsaved"); toast.error("Erro ao salvar tema."); },
  });

  // ── Debounced saves ──
  const debouncedSaveStorefront = useCallback((data: Partial<StorefrontData>) => {
    setSaveStatus("unsaved");
    const t = setTimeout(() => saveStorefrontMutation.mutate(data), 1500);
    return () => clearTimeout(t);
  }, [saveStorefrontMutation]);

  const debouncedSaveTheme = useCallback((data: Partial<StorefrontTheme>) => {
    setSaveStatus("unsaved");
    const t = setTimeout(() => saveThemeMutation.mutate(data), 1500);
    return () => clearTimeout(t);
  }, [saveThemeMutation]);

  // ── Storefront URL ──
  const storeUrl = storefront?.slug ? `${window.location.origin}/${storefront.slug}` : null;

  const copyLink = () => {
    if (storeUrl) { navigator.clipboard.writeText(storeUrl); toast.success("Link copiado!"); }
  };
  const openStore = () => { if (storeUrl) window.open(storeUrl, "_blank"); };

  // ── Loading ──
  if (storefrontLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-[62px] rounded-lg" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-5xl">
      {/* ── Page Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minha Loja</h1>
          {storeUrl && (
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 mt-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors group"
            >
              <Globe className="h-3 w-3" />
              <span className="font-mono">{storeUrl}</span>
              <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/products/new")} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo produto
          </Button>
          {storeUrl && (
            <Button variant="ghost" size="sm" onClick={openStore} className="gap-2 text-muted-foreground">
              <ExternalLink className="h-4 w-4" />
              Abrir loja
            </Button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as StoreTab)}>
        <TabsList className="bg-muted/40 h-9 p-1">
          <TabsTrigger value="loja" className="gap-2 text-xs font-medium px-4">
            <StoreIcon className="h-3.5 w-3.5" />
            Loja
          </TabsTrigger>
          <TabsTrigger value="landing-pages" className="gap-2 text-xs font-medium px-4">
            <FileText className="h-3.5 w-3.5" />
            Landing Pages
          </TabsTrigger>
          <TabsTrigger value="design" className="gap-2 text-xs font-medium px-4">
            <Palette className="h-3.5 w-3.5" />
            Editar Design
          </TabsTrigger>
        </TabsList>

        {/* ─ Aba Loja ─ */}
        <TabsContent value="loja" className="mt-5">
          <AbaLoja
            storefront={storefront}
            storeUrl={storeUrl}
            products={products}
            setProducts={setProducts}
            productsLoading={productsLoading}
            theme={theme}
            onCopy={copyLink}
            onOpen={openStore}
            navigate={navigate}
            onArchive={(id) => archiveMutation.mutate(id)}
            onDelete={(id) => deleteMutation.mutate(id)}
          />
        </TabsContent>

        {/* ─ Aba Landing Pages ─ */}
        <TabsContent value="landing-pages" className="mt-5">
          <AbaLandingPages
            products={products}
            loading={productsLoading}
            navigate={navigate}
          />
        </TabsContent>

        {/* ─ Aba Editar Design ─ */}
        <TabsContent value="design" className="mt-5">
          {storefront ? (
            <AbaDesign
              storefront={storefront}
              theme={theme}
              blocks={blocks}
              saveStatus={saveStatus}
              onUpdateStorefront={debouncedSaveStorefront}
              onUpdateTheme={debouncedSaveTheme}
              onBlocksChange={() => queryClient.invalidateQueries({ queryKey: ["storefront-blocks"] })}
            />
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm">Storefront não encontrada.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
