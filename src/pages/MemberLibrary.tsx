import { useState, useEffect, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";

interface LibraryItem {
  product_id: string;
  product_name: string;
  product_thumbnail: string | null;
  product_type: string;
  delivery_url: string | null;
  delivery_mode: string | null;
  granted_at: string;
  workspace_id: string;
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  pdf: FileText,
  doc: FileText,
  docx: FileText,
  png: Image,
  jpg: Image,
  jpeg: Image,
  gif: Image,
  webp: Image,
  mp4: Film,
  mov: Film,
  avi: Film,
  mp3: Music,
  wav: Music,
  zip: Archive,
  rar: Archive,
};

function getFileIcon(url: string | null) {
  if (!url) return FileText;
  const ext = url.split(".").pop()?.toLowerCase().split("?")[0] || "";
  return FILE_TYPE_ICONS[ext] || FileText;
}

function getFileName(url: string | null) {
  if (!url) return "Arquivo";
  try {
    const path = new URL(url).pathname;
    const name = path.split("/").pop() || "Arquivo";
    return decodeURIComponent(name);
  } catch {
    return url.split("/").pop() || "Arquivo";
  }
}

export default function MemberLibrary() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        navigate("/member/login");
        return;
      }
      setUserEmail(user.email || null);

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email!)
        .limit(1)
        .maybeSingle();

      if (!customer) {
        setLoading(false);
        return;
      }
      setCustomerId(customer.id);

      // Get active entitlements
      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("product_id, granted_at")
        .eq("customer_id", customer.id)
        .is("revoked_at", null);

      if (!entitlements || entitlements.length === 0) {
        setLoading(false);
        return;
      }

      const productIds = [...new Set(entitlements.map((e) => e.product_id))];

      const { data: products } = await supabase
        .from("products")
        .select("id, name, thumbnail_url, type, delivery_url, delivery_mode, workspace_id")
        .in("id", productIds);

      if (!products) {
        setLoading(false);
        return;
      }

      // Only include products that have a delivery_url (downloadable content)
      const libraryItems: LibraryItem[] = entitlements
        .map((e) => {
          const prod = products.find((p) => p.id === e.product_id);
          if (!prod || !prod.delivery_url) return null;
          return {
            product_id: prod.id,
            product_name: prod.name,
            product_thumbnail: prod.thumbnail_url,
            product_type: prod.type,
            delivery_url: prod.delivery_url,
            delivery_mode: prod.delivery_mode,
            granted_at: e.granted_at,
            workspace_id: prod.workspace_id,
          };
        })
        .filter(Boolean) as LibraryItem[];

      setItems(libraryItems);
      setLoading(false);
    }
    load();
  }, [navigate]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesType =
        typeFilter === "all" || item.product_type === typeFilter;
      return matchesSearch && matchesType;
    });
  }, [items, searchQuery, typeFilter]);

  const productTypes = useMemo(() => {
    const types = new Set(items.map((i) => i.product_type));
    return Array.from(types);
  }, [items]);

  const handleDownload = useCallback(
    async (item: LibraryItem) => {
      if (!item.delivery_url || !customerId) return;
      setDownloadingId(item.product_id);

      try {
        // Check if it's a Supabase storage URL (private bucket)
        const isSupabaseStorage = item.delivery_url.includes("supabase") && item.delivery_url.includes("storage");
        const isPrivateBucket = item.delivery_url.includes("private-files");

        let downloadUrl = item.delivery_url;

        if (isSupabaseStorage && isPrivateBucket) {
          // Extract the file path from the URL
          const pathMatch = item.delivery_url.match(/private-files\/(.+)/);
          if (pathMatch) {
            const filePath = pathMatch[1].split("?")[0];
            const { data: signedData, error } = await supabase.storage
              .from("private-files")
              .createSignedUrl(filePath, 300); // 5 min expiry

            if (error || !signedData?.signedUrl) {
              throw new Error("Erro ao gerar link de download");
            }
            downloadUrl = signedData.signedUrl;
          }
        }

        // Log the download
        await supabase.from("download_logs").insert({
          customer_id: customerId,
          product_id: item.product_id,
          file_path: item.delivery_url,
        });

        trackEvent(
          "file_downloaded",
          { product_id: item.product_id, product_name: item.product_name },
          item.workspace_id
        );

        // Open download in new tab
        window.open(downloadUrl, "_blank");
        toast.success("Download iniciado!");
      } catch (e: any) {
        toast.error(e.message || "Erro ao baixar arquivo");
      } finally {
        setDownloadingId(null);
      }
    },
    [customerId]
  );

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/member/login");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--muted)/0.3)]">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/member"
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Meus Cursos</span>
            </Link>
            <div className="flex items-center gap-2">
              <Library className="w-5 h-5 text-primary" />
              <span className="font-semibold text-foreground">
                Meus Downloads
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {userEmail}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="gap-1"
            >
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Filters */}
        {items.length > 0 && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do produto..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            {productTypes.length > 1 && (
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {productTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t === "DIGITAL"
                        ? "Digital"
                        : t === "COURSE"
                        ? "Curso"
                        : t === "LEAD_MAGNET"
                        ? "Material gratuito"
                        : t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* Empty state */}
        {items.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <FolderOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Nenhum arquivo disponível
            </h2>
            <p className="text-sm text-muted-foreground">
              Seus arquivos de download aparecerão aqui após uma compra.
            </p>
            <Link to="/member">
              <Button variant="outline" className="gap-2">
                <ArrowLeft className="w-4 h-4" /> Voltar
              </Button>
            </Link>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              Nenhum resultado para "{searchQuery}"
            </p>
          </div>
        ) : (
          /* File list */
          <div className="space-y-3">
            {filteredItems.map((item) => {
              const FileIcon = getFileIcon(item.delivery_url);
              const fileName = getFileName(item.delivery_url);
              const isDownloading = downloadingId === item.product_id;

              return (
                <div
                  key={item.product_id}
                  className="flex items-center gap-4 p-4 bg-card rounded-xl border transition-shadow hover:shadow-sm"
                >
                  {/* Thumbnail or icon */}
                  {item.product_thumbnail ? (
                    <img
                      src={item.product_thumbnail}
                      alt={item.product_name}
                      className="w-14 h-14 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <FileIcon className="w-6 h-6 text-muted-foreground" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">
                      {item.product_name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {item.product_type === "DIGITAL"
                          ? "Digital"
                          : item.product_type === "COURSE"
                          ? "Curso"
                          : item.product_type === "LEAD_MAGNET"
                          ? "Gratuito"
                          : item.product_type}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {fileName}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Adquirido em{" "}
                      {new Date(item.granted_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>

                  {/* Download button */}
                  {item.delivery_mode === "EXTERNAL" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 shrink-0"
                      onClick={() => {
                        window.open(item.delivery_url!, "_blank");
                        trackEvent(
                          "file_downloaded",
                          {
                            product_id: item.product_id,
                            type: "external",
                          },
                          item.workspace_id
                        );
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="hidden sm:inline">Acessar</span>
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-2 shrink-0"
                      disabled={isDownloading}
                      onClick={() => handleDownload(item)}
                    >
                      {isDownloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Baixar</span>
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
