import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, Flame, Info } from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import MemberProfileModal from "@/components/circle/MemberProfileModal";

export default function CircleMembers() {
  const { currentWorkspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"points" | "recent" | "streak">("points");
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("workspace_id", currentWorkspace.id)
        .single();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ["circle-members-list", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false });
      return data || [];
    },
    enabled: !!community,
  });

  const filtered = (members || [])
    .filter((m: any) => !search || (m.display_name || "").toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (sort === "recent") return new Date(b.last_active_at || 0).getTime() - new Date(a.last_active_at || 0).getTime();
      if (sort === "streak") return (b.current_streak || 0) - (a.current_streak || 0);
      return (b.total_points || 0) - (a.total_points || 0);
    });

  const roleLabel = (role: string) => {
    switch (role) {
      case "OWNER": return { label: "Criador", variant: "default" as const };
      case "ADMIN": return { label: "Admin", variant: "secondary" as const };
      case "MODERATOR": return { label: "Moderador", variant: "outline" as const };
      default: return null;
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Membros</h1>
          <p className="text-sm text-muted-foreground mt-1">{members?.length || 0} membros ativos</p>
        </div>
      </div>

      <Card className="p-3 bg-muted/20 border-dashed">
        <p className="text-xs text-muted-foreground flex items-center gap-2"><Info className="h-3.5 w-3.5" /> Como ganhar pontos: publicar, comentar, receber curtidas e concluir aulas.</p>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar membros..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <button className={`px-3 py-1.5 text-xs rounded-full border ${sort === "points" ? "bg-primary text-primary-foreground border-primary" : ""}`} onClick={() => setSort("points")}>Top pontos</button>
        <button className={`px-3 py-1.5 text-xs rounded-full border ${sort === "recent" ? "bg-primary text-primary-foreground border-primary" : ""}`} onClick={() => setSort("recent")}>Mais ativos</button>
        <button className={`px-3 py-1.5 text-xs rounded-full border ${sort === "streak" ? "bg-primary text-primary-foreground border-primary" : ""}`} onClick={() => setSort("streak")}>Maior sequência</button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse flex gap-3">
              <div className="h-11 w-11 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-1/4" />
              </div>
            </Card>
          ))}
        </div>
      ) : filtered?.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold">Nenhum membro encontrado</h3>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered?.map((m: any) => {
            const role = roleLabel(m.role);
            return (
              <Card key={m.id} className="p-4 md:p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setProfileMemberId(m.id)}>
                <Avatar className="h-11 w-11">
                  <AvatarImage src={m.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {(m.display_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{m.display_name || "Membro"}</span>
                    {role && <Badge variant={role.variant} className="text-[10px] h-5">{role.label}</Badge>}
                    <LevelBadge points={m.total_points} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m.total_points} pts ·{" "}
                    {m.last_active_at
                      ? `Ativo ${formatDistanceToNow(new Date(m.last_active_at), { addSuffix: true, locale: ptBR })}`
                      : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">#{filtered.findIndex((x: any) => x.id === m.id) + 1}</p>
                  <p className="text-xs text-muted-foreground"><Flame className="h-3 w-3 inline text-orange-500" /> {m.current_streak}d</p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <MemberProfileModal
        memberId={profileMemberId}
        communityId={community?.id || null}
        open={!!profileMemberId}
        onOpenChange={(open) => !open && setProfileMemberId(null)}
      />
    </div>
  );
}
