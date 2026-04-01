import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users, MessageSquare, Search,
  Sparkles, Globe, CheckCircle2, Crown,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

function CommunityCard({ community }: { community: any }) {
  const navigate = useNavigate();

  const accessInfo = {
    OPEN: { label: "Gratuita", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", cta: "Participar grátis" },
    FREE_WITH_PRODUCT: { label: "Inclusa na compra", className: "bg-blue-500/10 text-blue-600 border-blue-500/20", cta: "Ver detalhes" },
    PAID_SUBSCRIPTION: { label: "Assinatura", className: "bg-purple-500/10 text-purple-600 border-purple-500/20", cta: "Ver plano" },
  }[community.access_type as string] || { label: "Gratuita", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", cta: "Participar grátis" };

  const activityScore = (community.member_count || 0) * 0.7 + (community.post_count || 0) * 0.3;
  const postsPerMember = (community.post_count || 0) / Math.max(1, community.member_count || 1);
  const cadenceLabel = postsPerMember >= 0.7 ? "Movimento alto" : postsPerMember >= 0.25 ? "Movimento constante" : "Movimento inicial";
  const trustBadges = [
    activityScore >= 120 ? "Alta atividade" : null,
    (community.member_count || 0) >= 100 ? "Comunidade popular" : null,
    community.require_approval ? "Curadoria ativa" : null,
  ].filter(Boolean) as string[];

  return (
    <div
      onClick={() => navigate(`/c/${community.slug}`)}
      className="group bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-200"
      id={`community-card-${community.id}`}
    >
      {/* Cover */}
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-muted">
        {community.cover_image_url && (
          <img
            src={community.cover_image_url}
            alt=""
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3">
          <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", accessInfo.className)}>
            {accessInfo.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start gap-3">
          {community.icon_url ? (
            <img
              src={community.icon_url}
              alt=""
              className="h-12 w-12 rounded-xl object-cover border-2 border-background shadow -mt-8 relative z-10 shrink-0"
            />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 border-2 border-background shadow -mt-8 relative z-10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0 pt-1">
            <h3 className="font-bold text-foreground text-base leading-tight truncate group-hover:text-primary transition-colors">
              {community.name}
            </h3>
            {community.category && (
              <span className="text-xs text-muted-foreground">{community.category}</span>
            )}
          </div>
        </div>

        {community.description && (
          <p className="text-sm text-muted-foreground mt-3 line-clamp-2 leading-relaxed">{community.description}</p>
        )}

        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />{community.member_count || 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />{community.post_count || 0}
          </span>
          <span className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="h-3.5 w-3.5" /> ativa
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {trustBadges.slice(0, 2).map((b) => (
            <Badge key={`${community.id}-${b}`} variant="outline" className="text-[10px]">{b}</Badge>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{community.require_approval ? "Entrada com aprovação" : "Entrada imediata"}</span>
          <span className="text-xs text-muted-foreground">{cadenceLabel}</span>
        </div>

        <Button size="sm" className="w-full mt-3" onClick={(e) => { e.stopPropagation(); navigate(`/c/${community.slug}`); }}>
          {accessInfo.cta}
        </Button>
      </div>
    </div>
  );
}

export default function CommunityDiscovery() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "free" | "paid">("all");
  const [sort, setSort] = useState<"trending" | "newest" | "members">("trending");

  const { data: communities = [], isLoading } = useQuery({
    queryKey: ["public-communities"],
    queryFn: async () => {
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("is_active", true)
        .order("member_count", { ascending: false });
      return (data || []) as any[];
    },
  });

  const filtered = communities.filter((c: any) => {
    const matchesSearch = !search || c.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter =
      filter === "all" ||
      (filter === "free" && c.access_type === "OPEN") ||
      (filter === "paid" && c.access_type !== "OPEN");
    return matchesSearch && matchesFilter;
  });

  const sorted = [...filtered].sort((a: any, b: any) => {
    if (sort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sort === "members") return (b.member_count || 0) - (a.member_count || 0);
    const aScore = (a.member_count || 0) * 0.7 + (a.post_count || 0) * 0.3;
    const bScore = (b.member_count || 0) * 0.7 + (b.post_count || 0) * 0.3;
    return bScore - aScore;
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background py-16 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 text-sm text-primary font-medium mb-2">
            <Globe className="h-4 w-4" />
            Descubra comunidades
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-foreground">
            Encontre sua comunidade
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Explore comunidades, aprenda com especialistas e conecte-se com pessoas que compartilham seus interesses.
          </p>
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Crown className="h-3.5 w-3.5 text-primary" />
            Comunidades com maior engajamento aparecem primeiro em "Em alta"
          </div>

          {/* Search */}
          <div className="relative max-w-md mx-auto mt-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="community-search"
              placeholder="Buscar comunidades..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-12 rounded-xl"
            />
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {(
            [
              { key: "all", label: "Todas" },
              { key: "free", label: "Gratuitas" },
              { key: "paid", label: "Pagas" },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              id={`filter-${f.key}`}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
          <span className="ml-auto text-sm text-muted-foreground">
            {sorted.length} {sorted.length === 1 ? "comunidade" : "comunidades"}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-6 flex-wrap">
          {(
            [
              { key: "trending", label: "Em alta" },
              { key: "newest", label: "Recentes" },
              { key: "members", label: "Mais membros" },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              id={`sort-${s.key}`}
              onClick={() => setSort(s.key)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                sort === s.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-card rounded-2xl border border-border overflow-hidden animate-pulse">
                <div className="h-36 bg-muted" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
              <Sparkles className="h-9 w-9 text-muted-foreground/40" />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">Nenhuma comunidade encontrada</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {search ? `Nenhuma comunidade corresponde a "${search}".` : "Ainda não há comunidades públicas disponíveis."}
            </p>
            {search && (
              <Button variant="outline" className="mt-4" onClick={() => setSearch("")}>
                Limpar busca
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((c: any) => (
              <CommunityCard key={c.id} community={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
