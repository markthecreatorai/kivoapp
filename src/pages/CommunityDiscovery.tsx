import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Users, MessageSquare, Search,
  Sparkles, CheckCircle2,
  User, Settings, LogOut, LogIn,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import CommunitySwitcher from "@/components/circle/CommunitySwitcher";
import { useUserAvatar } from "@/hooks/useUserAvatar";

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
      onClick={() => navigate(`/circles/${community.slug}`)}
      className="group bg-card border border-border rounded-2xl overflow-hidden cursor-pointer hover:shadow-lg hover:border-primary/30 transition-all duration-200 flex flex-col h-full"
    >
      <div className="relative h-36 overflow-hidden bg-gradient-to-br from-primary/20 via-primary/10 to-muted shrink-0">
        {community.cover_image_url && (
          <img src={community.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start gap-3">
          {community.icon_url ? (
            <img src={community.icon_url} alt="" className="h-12 w-12 rounded-xl object-cover border-2 border-background shadow -mt-8 relative z-10 shrink-0" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-primary/10 border-2 border-background shadow -mt-8 relative z-10 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5 text-primary" />
            </div>
          )}
          <div className="min-w-0 pt-1">
            <h3 className="font-bold text-foreground text-base leading-tight truncate group-hover:text-primary transition-colors">{community.name}</h3>
            {community.category && <span className="text-xs text-muted-foreground">{community.category}</span>}
          </div>
        </div>
        <div className="flex-1">
          {community.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2 leading-relaxed">{community.description}</p>}
        </div>
        <div className="mt-auto pt-3">
          <p className="text-sm text-muted-foreground">
            {community.member_count || 0} Membros · {community.access_type === "OPEN" ? "Gratuito" : community.price_cents ? `R$${(community.price_cents / 100).toFixed(0)}/${community.billing_period === "yearly" ? "ano" : "mês"}` : "Gratuito"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CommunityDiscovery() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
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
    <div className="min-h-screen bg-muted/40 flex flex-col">
      {/* Header — same as CircleLayout */}
      <header className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="flex items-center h-14 px-4 max-w-5xl mx-auto">
          <div className="flex items-center gap-1 min-w-0">
            <CommunitySwitcher currentCommunity={null} />
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-full focus:outline-none focus:ring-2 focus:ring-ring">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={avatarUrl || ""} />
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{user.email?.split("@")[0]}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-sm cursor-pointer">
                    <Settings className="h-4 w-4" /> Configurações
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="gap-2 text-sm text-destructive focus:text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4" /> Sair
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/login")} className="gap-2">
                <LogIn className="h-4 w-4" /> Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-8 w-full pt-[72px]">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">Descubra comunidades</h1>
          <p className="text-muted-foreground mt-2">
            Explore comunidades ou{" "}
            <button onClick={() => navigate("/circles")} className="text-primary hover:underline font-medium">crie a sua</button>
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md mx-auto mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar comunidades..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 h-11 rounded-xl" />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {([{ key: "all", label: "Todas" }, { key: "free", label: "Gratuitas" }, { key: "paid", label: "Pagas" }] as const).map((f) => (
            <button
              key={f.key}
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
              <Button variant="outline" className="mt-4" onClick={() => setSearch("")}>Limpar busca</Button>
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
