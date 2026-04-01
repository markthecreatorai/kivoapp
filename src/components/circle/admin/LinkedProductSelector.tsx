import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Package, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  value: string;
  onChange: (id: string) => void;
}

export default function LinkedProductSelector({ workspaceId, value, onChange }: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["workspace-products", workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, type, status, prices(amount)")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id as string,
        name: p.name as string,
        type: (p.type ?? "") as string,
        status: p.status as string | null,
        price: (p.prices?.[0]?.amount ?? 0) as number,
      }));
    },
    enabled: !!workspaceId,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter((p) => p.name?.toLowerCase().includes(q));
  }, [products, search]);

  const selected = products.find((p) => p.id === value);

  const formatPrice = (price: number | null) => {
    if (!price || price <= 0) return "Grátis";
    return `R$${(price / 100).toFixed(0)}`;
  };

  const typeLabel: Record<string, string> = {
    digital: "Digital",
    subscription: "Assinatura",
    coaching: "Coaching",
    community: "Comunidade",
    lead_magnet: "Lead Magnet",
    custom: "Personalizado",
    webinar: "Webinar",
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-muted/50 p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
        <div className="h-10 bg-muted rounded" />
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center space-y-3">
        <Package className="h-8 w-8 text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">
          Nenhum produto encontrado na sua loja.
        </p>
        <button
          onClick={() => navigate("/store")}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Criar produto na loja <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Selected preview */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-3 w-full p-3 rounded-xl border text-left transition-all",
          value
            ? "border-primary/40 bg-primary/5"
            : "border-border bg-muted/50 hover:bg-muted"
        )}
      >
        <Package className="h-5 w-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          {selected ? (
            <>
              <p className="text-sm font-medium text-foreground truncate">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {typeLabel[selected.type ?? ""] ?? selected.type} · {formatPrice(selected.price)}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Selecionar produto…</p>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto…"
              className="flex-1 text-sm outline-none bg-transparent"
              autoFocus
            />
          </div>

          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum produto encontrado.
              </p>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-3 py-2.5 text-left hover:bg-muted/60 transition-colors",
                    p.id === value && "bg-primary/5"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {typeLabel[p.type ?? ""] ?? p.type} · {formatPrice(p.price)}
                    </p>
                  </div>
                  {p.id === value && (
                    <span className="text-xs text-primary font-medium">✓</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
