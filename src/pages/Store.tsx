import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Store as StoreIcon,
  ExternalLink,
  Pencil,
  Copy,
  Package,
  Eye,
  Globe,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";

export default function Store() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();

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
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ["store-products", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("*, prices(*)")
        .eq("workspace_id", currentWorkspace.id)
        .eq("status", "PUBLISHED")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace?.id,
  });

  const storeUrl = storefront?.slug
    ? `${window.location.origin}/${storefront.slug}`
    : null;

  const copyLink = () => {
    if (storeUrl) {
      navigator.clipboard.writeText(storeUrl);
      toast.success("Link copiado!");
    }
  };

  const getDefaultPrice = (product: any) => {
    const price = product.prices?.find((p: any) => p.is_default && p.is_active);
    return price ? price.amount : null;
  };

  const isLoading = storefrontLoading || productsLoading;

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Minha Loja</h1>
          <p className="text-muted-foreground text-sm">
            Gerencie sua vitrine e produtos publicados
          </p>
        </div>
        <Button
          onClick={() => navigate("/store/editor")}
          className="kivo-gradient text-primary-foreground gap-2"
        >
          <Pencil className="h-4 w-4" />
          Editar Loja
        </Button>
      </div>

      {/* Store Info Card */}
      {isLoading ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : storefront ? (
        <Card>
          <CardContent className="flex items-center gap-4 py-5">
            <div className="h-14 w-14 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {storefront.avatar_url ? (
                <img
                  src={storefront.avatar_url}
                  alt=""
                  className="h-14 w-14 rounded-xl object-cover"
                />
              ) : (
                <StoreIcon className="h-7 w-7 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-foreground truncate">
                  {storefront.title || currentWorkspace?.name}
                </h2>
                <Badge
                  variant="outline"
                  className={
                    storefront.is_published
                      ? "bg-accent/15 text-accent border-accent/30"
                      : "bg-yellow-100 text-yellow-700 border-yellow-300"
                  }
                >
                  {storefront.is_published ? "Publicada" : "Rascunho"}
                </Badge>
              </div>
              {storeUrl && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {storeUrl}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={copyLink}>
                <Copy className="h-4 w-4 mr-1" />
                Copiar
              </Button>
              {storeUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(storeUrl, "_blank")}
                >
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Abrir
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {products.length}
                </p>
                <p className="text-xs text-muted-foreground">Produtos ativos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Globe className="h-5 w-5 text-accent" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {storefront?.is_published ? "Online" : "Offline"}
                </p>
                <p className="text-xs text-muted-foreground">Status da loja</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Published Products */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          Produtos Publicados
        </h2>
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                <Package className="h-8 w-8 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                Nenhum produto publicado
              </h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                Publique seu primeiro produto para que ele apareça na sua loja.
              </p>
              <Button
                variant="outline"
                onClick={() => navigate("/products")}
              >
                Ver Produtos
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((product: any) => {
              const price = getDefaultPrice(product);
              return (
                <Card
                  key={product.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/products/${product.id}/edit`)}
                >
                  <CardContent className="flex items-center gap-3 py-4">
                    {product.thumbnail_url ? (
                      <img
                        src={product.thumbnail_url}
                        alt={product.name}
                        className="h-12 w-12 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Package className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-foreground text-sm truncate">
                        {product.name}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {price !== null ? formatCurrency(price) : "Gratuito"}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {product.sales_count || 0} vendas
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
