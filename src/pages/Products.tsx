import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Pencil,
  Copy,
  Archive,
  Trash2,
  Package,
  Megaphone,
  Calendar,
  GraduationCap,
  ShoppingBag,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { describePlanError } from "@/lib/plan-errors";

type ProductStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

const TYPE_LABELS: Record<string, { label: string; icon: typeof Package }> = {
  DIGITAL: { label: "Digital", icon: Package },
  LEAD_MAGNET: { label: "Lead Magnet", icon: Megaphone },
  SERVICE: { label: "Serviço", icon: Calendar },
  COURSE: { label: "Curso", icon: GraduationCap },
  PHYSICAL: { label: "Físico", icon: Package },
};

const STATUS_STYLES: Record<string, string> = {
  PUBLISHED: "bg-accent/15 text-accent border-accent/30",
  DRAFT: "bg-yellow-100 text-yellow-700 border-yellow-300",
  ARCHIVED: "bg-muted text-muted-foreground border-border",
};

const STATUS_LABELS: Record<string, string> = {
  PUBLISHED: "Ativo",
  DRAFT: "Rascunho",
  ARCHIVED: "Arquivado",
};

const PLACEHOLDER_COLORS = [
  "bg-primary/10",
  "bg-accent/10",
  "bg-blue-100",
  "bg-purple-100",
  "bg-orange-100",
  "bg-pink-100",
];

export default function Products() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["products", currentWorkspace?.id, statusFilter],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      let query = supabase
        .from("products")
        .select("*, prices(*)")
        .eq("workspace_id", currentWorkspace.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (statusFilter !== "ALL") {
        query = query.eq("status", statusFilter as ProductStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const duplicateMutation = useMutation({
    mutationFn: async (productId: string) => {
      const product = products.find((p: any) => p.id === productId);
      if (!product || !currentWorkspace) return;

      const { data: newProduct, error } = await supabase
        .from("products")
        .insert({
          workspace_id: currentWorkspace.id,
          name: product.name + " (cópia)",
          slug: (product.slug || "product") + "-copy-" + Date.now().toString(36),
          type: product.type,
          status: "DRAFT" as const,
          description: product.description,
          short_description: product.short_description,
          thumbnail_url: product.thumbnail_url,
        })
        .select()
        .single();

      if (error) throw error;

      // Duplicate prices
      const defaultPrice = product.prices?.find((p: any) => p.is_default);
      if (defaultPrice && newProduct) {
        await supabase.from("prices").insert({
          product_id: newProduct.id,
          amount: defaultPrice.amount,
          compare_at_amount: defaultPrice.compare_at_amount,
          pix_discount_percent: defaultPrice.pix_discount_percent,
          max_installments: defaultPrice.max_installments,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto duplicado com sucesso!");
    },
    onError: (error) => {
      const info = describePlanError(error);
      toast.error(info.title, { description: info.description });
    },
  });


  const archiveMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("products")
        .update({ status: "ARCHIVED" as ProductStatus })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto arquivado!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (productId: string) => {
      const { error } = await supabase
        .from("products")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", productId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success("Produto excluído!");
    },
  });

  const getDefaultPrice = (product: any) => {
    const price = product.prices?.find((p: any) => p.is_default && p.is_active);
    return price ? price.amount : null;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Produtos</h1>
        <Button
          onClick={() => navigate("/products/new")}
          className="kivo-gradient text-primary-foreground gap-2"
        >
          <Plus className="h-4 w-4" />
          Novo Produto
        </Button>
      </div>

      {/* Filters */}
      <Tabs value={statusFilter} onValueChange={setStatusFilter}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="ALL">Todos</TabsTrigger>
          <TabsTrigger value="PUBLISHED">Ativos</TabsTrigger>
          <TabsTrigger value="DRAFT">Rascunhos</TabsTrigger>
          <TabsTrigger value="ARCHIVED">Arquivados</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Product Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse h-48" />
          ))}
        </div>
      ) : products.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <ShoppingBag className="h-10 w-10 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Nenhum produto ainda
          </h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Crie seu primeiro produto e comece a vender para sua audiência.
          </p>
          <Button
            onClick={() => navigate("/products/new")}
            className="kivo-gradient text-primary-foreground gap-2"
          >
            <Plus className="h-4 w-4" />
            Criar Primeiro Produto
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((product: any, index: number) => {
            const typeInfo = TYPE_LABELS[product.type] || TYPE_LABELS.DIGITAL;
            const TypeIcon = typeInfo.icon;
            const price = getDefaultPrice(product);
            const colorClass = PLACEHOLDER_COLORS[index % PLACEHOLDER_COLORS.length];

            return (
              <div
                key={product.id}
                className="bg-card rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow group"
              >
                {/* Thumbnail */}
                <div className="relative h-36 overflow-hidden">
                  {product.thumbnail_url ? (
                    <img
                      src={product.thumbnail_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className={`w-full h-full ${colorClass} flex items-center justify-center`}>
                      <TypeIcon className="h-12 w-12 text-muted-foreground/40" />
                    </div>
                  )}
                  <Badge
                    variant="outline"
                    className={`absolute top-3 left-3 text-xs ${STATUS_STYLES[product.status || "DRAFT"]}`}
                  >
                    {STATUS_LABELS[product.status || "DRAFT"]}
                  </Badge>
                </div>

                {/* Info */}
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-foreground truncate">{product.name}</h3>
                      <Badge variant="secondary" className="mt-1 text-xs font-normal">
                        {typeInfo.label}
                      </Badge>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => navigate(`/products/${product.id}/edit`)}>
                          <Pencil className="h-4 w-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicateMutation.mutate(product.id)}>
                          <Copy className="h-4 w-4 mr-2" /> Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archiveMutation.mutate(product.id)}>
                          <Archive className="h-4 w-4 mr-2" /> Arquivar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            if (confirm("Tem certeza que deseja excluir este produto?")) {
                              deleteMutation.mutate(product.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-foreground">
                      {price !== null ? formatCurrency(price) : "Gratuito"}
                    </span>
                    <span className="text-muted-foreground">
                      {product.sales_count || 0} vendas
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
