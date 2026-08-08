import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Download,
  FileText,
  Image,
  Film,
  Music,
  Archive,
  Search,
  ArrowLeft,
  FolderOpen,
  ExternalLink,
  LogOut,
  Library,
  BookOpen,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";

/* ─── Types ─── */
interface AssetItem {
  id: string;
  title: string;
  file_path: string;
  mime_type: string | null;
  size_bytes: number;
  owner_type: string;
  owner_id: string;
  workspace_id: string;
  granted_at: string;
  source_type: string;
}

interface LegacyItem {
  product_id: string;
  product_name: string;
  product_thumbnail: string | null;
  product_type: string;
  delivery_url: string | null;
  delivery_mode: string | null;
  granted_at: string;
  workspace_id: string;
}

type UnifiedItem =
  | { kind: "asset"; data: AssetItem }
  | { kind: "legacy"; data: LegacyItem };

/* ─── Helpers ─── */
const FILE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText, doc: FileText, docx: FileText,
  png: Image, jpg: Image, jpeg: Image, gif: Image, webp: Image,
  mp4: Film, mov: Film, avi: Film,
  mp3: Music, wav: Music,
  zip: Archive, rar: Archive,
};

function iconForMime(mime: string | null, path: string | null) {
  if (mime) {
    if (mime.startsWith("image/")) return Image;
    if (mime.startsWith("video/")) return Film;
    if (mime.startsWith("audio/")) return Music;
    if (mime.includes("pdf")) return FileText;
    if (mime.includes("zip") || mime.includes("rar")) return Archive;
  }
  const ext = (path || "").split(".").pop()?.toLowerCase().split("?")[0] || "";
  return FILE_ICONS[ext] || FileText;
}

function friendlySize(bytes: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractFileName(path: string | null) {
  if (!path) return "Arquivo";
  try {
    const p = new URL(path).pathname;
    return decodeURIComponent(p.split("/").pop() || "Arquivo");
  } catch {
    return path.split("/").pop() || "Arquivo";
  }
}

const ORIGIN_LABELS: Record<string, { label: string; icon: typeof FileText }> = {
  product: { label: "Produto", icon: FileText },
  lesson: { label: "Curso", icon: BookOpen },
  community_resource: { label: "Comunidade", icon: Users },
};

const PAGE_SIZE = 20;

/* ─── Component ─── */
export default function MemberLibrary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);

  // Data
  const [assetItems, setAssetItems] = useState<AssetItem[]>([]);
  const [legacyItems, setLegacyItems] = useState<LegacyItem[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // Pagination
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Download state
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // ─── Load data ───
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/member/login"); return; }
      setUserEmail(user.email || null);
      setUserId(user.id);

      // Track
      trackEvent("library_viewed", {}, undefined);

      // 1) New asset system
      const { data: entitlements } = await supabase
        .from("user_asset_entitlements")
        .select("asset_id, granted_at, source_type, content_assets(*)")
        .eq("user_id", user.id)
        .is("revoked_at", null)
        .order("granted_at", { ascending: false });

      if (entitlements && entitlements.length > 0) {
        const mapped: AssetItem[] = entitlements
          .filter((e: any) => e.content_assets)
          .map((e: any) => ({
            id: e.content_assets.id,
            title: e.content_assets.title,
            file_path: e.content_assets.file_path,
            mime_type: e.content_assets.mime_type,
            size_bytes: e.content_assets.size_bytes || 0,
            owner_type: e.content_assets.owner_type,
            owner_id: e.content_assets.owner_id,
            workspace_id: e.content_assets.workspace_id,
            granted_at: e.granted_at,
            source_type: e.source_type,
          }));
        setAssetItems(mapped);
      }

      // 2) Legacy: entitlements → products with delivery_url
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email!)
        .limit(1)
        .maybeSingle();

      if (customer) {
        setCustomerId(customer.id);
        const { data: legacyEnt } = await supabase
          .from("entitlements")
          .select("product_id, granted_at")
          .eq("customer_id", customer.id)
          .is("revoked_at", null);

        if (legacyEnt && legacyEnt.length > 0) {
          const pIds = [...new Set(legacyEnt.map(e => e.product_id))];
          const { data: products } = await supabase
            .from("products")
            .select("id, name, thumbnail_url, type, delivery_url, delivery_mode, workspace_id")
            .in("id", pIds);

          if (products) {
            const items: LegacyItem[] = legacyEnt
              .map(e => {
                const p = products.find(pr => pr.id === e.product_id);
                if (!p || !p.delivery_url) return null;
                return {
                  product_id: p.id,
                  product_name: p.name,
                  product_thumbnail: p.thumbnail_url,
                  product_type: p.type,
                  delivery_url: p.delivery_url,
                  delivery_mode: p.delivery_mode,
                  granted_at: e.granted_at,
                  workspace_id: p.workspace_id,
                };
              })
              .filter(Boolean) as LegacyItem[];
            setLegacyItems(items);
          }
        }
      }

      setLoading(false);
    }
    load();
  }, [navigate]);

  // ─── Unified + filtered list ───
  const unified: UnifiedItem[] = useMemo(() => {
    const all: UnifiedItem[] = [
      ...assetItems.map(a => ({ kind: "asset" as const, data: a })),
      ...legacyItems.map(l => ({ kind: "legacy" as const, data: l })),
    ];

    return all
      .filter(item => {
        const title = item.kind === "asset" ? item.data.title : item.data.product_name;
        if (searchQuery && !title.toLowerCase().includes(searchQuery.toLowerCase())) return false;

        if (originFilter !== "all") {
          if (item.kind === "asset" && item.data.owner_type !== originFilter) return false;
          if (item.kind === "legacy" && originFilter !== "product") return false;
        }

        if (typeFilter !== "all") {
          const mime = item.kind === "asset" ? (item.data.mime_type || "") : "";
          const path = item.kind === "asset" ? item.data.file_path : (item.data.delivery_url || "");
          const ext = path.split(".").pop()?.toLowerCase().split("?")[0] || "";
          if (typeFilter === "image" && !mime.startsWith("image/") && !["png","jpg","jpeg","gif","webp"].includes(ext)) return false;
          if (typeFilter === "video" && !mime.startsWith("video/") && !["mp4","mov","avi"].includes(ext)) return false;
          if (typeFilter === "document" && !["pdf","doc","docx","txt","xls","xlsx","ppt","pptx"].includes(ext)) return false;
          if (typeFilter === "archive" && !["zip","rar","7z","tar","gz"].includes(ext)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        const da = a.kind === "asset" ? a.data.granted_at : a.data.granted_at;
        const db = b.kind === "asset" ? b.data.granted_at : b.data.granted_at;
        return new Date(db).getTime() - new Date(da).getTime();
      });
  }, [assetItems, legacyItems, searchQuery, originFilter, typeFilter]);

  const visibleItems = unified.slice(0, visibleCount);
  const hasMore = visibleCount < unified.length;

  // Infinite scroll
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisibleCount(prev => prev + PAGE_SIZE); },
      { threshold: 0.1 }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]);

  // ─── Download handlers ───
  const handleAssetDownload = useCallback(async (item: AssetItem) => {
    setDownloadingId(item.id);
    try {
      trackEvent("asset_download_clicked", { asset_id: item.id, title: item.title }, item.workspace_id);

      // URL assinada emitida no servidor após conferir o entitlement do asset
      const signedUrl = await getSignedPrivateUrl({ path: item.file_path, assetId: item.id });

      // Log download
      if (userId) {
        await supabase.from("asset_download_logs").insert({
          workspace_id: item.workspace_id,
          user_id: userId,
          asset_id: item.id,
        });
      }

      window.open(signedUrl, "_blank");
      toast.success("Download iniciado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar");
    } finally {
      setDownloadingId(null);
    }
  }, [userId]);

  const handleLegacyDownload = useCallback(async (item: LegacyItem) => {
    if (!item.delivery_url) return;
    setDownloadingId(item.product_id);
    try {
      trackEvent("asset_download_clicked", { product_id: item.product_id }, item.workspace_id);

      let downloadUrl = item.delivery_url;

      if (isPrivateFileUrl(item.delivery_url)) {
        downloadUrl = await getSignedPrivateUrl({
          path: item.delivery_url,
          productId: item.product_id,
        });
      }

      if (customerId) {
        await supabase.from("download_logs").insert({
          customer_id: customerId,
          product_id: item.product_id,
          file_path: item.delivery_url,
        });
      }

      window.open(downloadUrl, "_blank");
      toast.success("Download iniciado!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao baixar");
    } finally {
      setDownloadingId(null);
    }
  }, [customerId]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/member/login");
  };

  // ─── Render ───
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalItems = assetItems.length + legacyItems.length;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/member" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Meus Cursos</span>
            </Link>
            <div className="flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">Meus Downloads</span>
              {totalItems > 0 && (
                <Badge variant="secondary" className="text-[10px]">{totalItems}</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        {totalItems > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setVisibleCount(PAGE_SIZE); }}
                className="pl-9"
              />
            </div>
            <Select value={originFilter} onValueChange={(v) => { setOriginFilter(v); setVisibleCount(PAGE_SIZE); }}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Origem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                <SelectItem value="product">Produto</SelectItem>
                <SelectItem value="lesson">Curso/Aula</SelectItem>
                <SelectItem value="community_resource">Comunidade</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setVisibleCount(PAGE_SIZE); }}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="document">Documentos</SelectItem>
                <SelectItem value="image">Imagens</SelectItem>
                <SelectItem value="video">Vídeos</SelectItem>
                <SelectItem value="archive">Arquivos ZIP</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Empty state */}
        {totalItems === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Você ainda não tem arquivos liberados</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Seus arquivos de download aparecerão aqui após uma compra, assinatura ou acesso a comunidade.
            </p>
            <Link to="/member">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar ao dashboard
              </Button>
            </Link>
          </div>
        ) : unified.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              Nenhum resultado para "{searchQuery}"
            </p>
          </div>
        ) : (
          /* File list */
          <div className="space-y-3">
            {visibleItems.map((item) => {
              if (item.kind === "asset") {
                const a = item.data;
                const Icon = iconForMime(a.mime_type, a.file_path);
                const origin = ORIGIN_LABELS[a.owner_type] || ORIGIN_LABELS.product;
                const isDownloading = downloadingId === a.id;

                return (
                  <div key={`a-${a.id}`} className="flex items-center gap-4 p-4 bg-card rounded-xl border transition-shadow hover:shadow-sm">
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate text-sm">{a.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-[10px] gap-1">
                          <origin.icon className="w-3 h-3" />
                          {origin.label}
                        </Badge>
                        {a.size_bytes > 0 && (
                          <span className="text-[10px] text-muted-foreground">{friendlySize(a.size_bytes)}</span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Liberado em {new Date(a.granted_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2 shrink-0"
                      disabled={isDownloading}
                      onClick={() => handleAssetDownload(a)}
                    >
                      {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span className="hidden sm:inline">Baixar</span>
                    </Button>
                  </div>
                );
              }

              // Legacy item
              const l = item.data;
              const LIcon = iconForMime(null, l.delivery_url);
              const fileName = extractFileName(l.delivery_url);
              const isDownloading = downloadingId === l.product_id;

              return (
                <div key={`l-${l.product_id}`} className="flex items-center gap-4 p-4 bg-card rounded-xl border transition-shadow hover:shadow-sm">
                  {l.product_thumbnail ? (
                    <img src={l.product_thumbnail} alt={l.product_name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <LIcon className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate text-sm">{l.product_name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {l.product_type === "DIGITAL" ? "Digital" : l.product_type === "COURSE" ? "Curso" : l.product_type === "LEAD_MAGNET" ? "Gratuito" : l.product_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">{fileName}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Adquirido em {new Date(l.granted_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  {l.delivery_mode === "EXTERNAL" ? (
                    <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => {
                      window.open(l.delivery_url!, "_blank");
                      trackEvent("asset_download_clicked", { product_id: l.product_id, type: "external" }, l.workspace_id);
                    }}>
                      <ExternalLink className="w-4 h-4" />
                      <span className="hidden sm:inline">Acessar</span>
                    </Button>
                  ) : (
                    <Button variant="default" size="sm" className="gap-2 shrink-0" disabled={isDownloading} onClick={() => handleLegacyDownload(l)}>
                      {isDownloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span className="hidden sm:inline">Baixar</span>
                    </Button>
                  )}
                </div>
              );
            })}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
