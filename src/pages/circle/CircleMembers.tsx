import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Users, Search, Flame, Info } from "lucide-react";
import { useState, useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import MemberProfileModal from "@/components/circle/MemberProfileModal";

const MAX_VISIBLE = 30;

const ROLE_PRIORITY: Record<string, number> = { OWNER: 0, ADMIN: 1, MODERATOR: 2, MEMBER: 3 };

export default function CircleMembers() {
  const { currentWorkspace } = useWorkspace();
  const [search, setSearch] = useState("");
  const [profileMemberId, setProfileMemberId] = useState<string | null>(null);

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase
        .from("communities").select("*")
        .eq("workspace_id", currentWorkspace.id).single();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  // Fetch total count separately
  const { data: totalCount } = useQuery({
    queryKey: ["circle-members-count", community?.id],
    queryFn: async () => {
      if (!community) return 0;
      const { count } = await supabase
        .from("community_members")
        .select("id", { count: "exact", head: true })
        .eq("community_id", community.id)
        .eq("status", "ACTIVE");
      return count || 0;
    },
    enabled: !!community,
  });

  // Fetch only 30 members, ordered: admins first, then by points
  const { data: members, isLoading } = useQuery({
    queryKey: ["circle-members-list", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("*")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false })
        .limit(MAX_VISIBLE);
      // Sort client-side: admins first, then by points
      return (data || []).sort((a: any, b: any) => {
        const rA = ROLE_PRIORITY[a.role] ?? 3;
        const rB = ROLE_PRIORITY[b.role] ?? 3;
        if (rA !== rB) return rA - rB;
        return (b.total_points || 0) - (a.total_points || 0);
      });
    },
    enabled: !!community,
  });

  const filtered = useMemo(() => {
    if (!members) return [];
    if (!search) return members;
    const q = search.toLowerCase();
    return members.filter((m: any) =>
      (m.display_name || "").toLowerCase().includes(q) ||
      (m.username || "").toLowerCase().includes(q)
    );
  }, [members, search]);

  const displayCount = filtered.length;
  const total = totalCount || 0;

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
          <p className="text-sm text-muted-foreground mt-1">{total} membros ativos</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar membros..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
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
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold">Nenhum membro encontrado</h3>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((m: any, idx: number) => {
            const role = roleLabel(m.role);
            return (
              <Card
                key={m.id}
                className="p-4 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setProfileMemberId(m.id)}
              >
                <Avatar className="h-11 w-11">
                  <AvatarImage src={m.avatar_url || undefined} />
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
                    @{m.username || "membro"} · {m.total_points} pts
                    {m.last_active_at && (
                      <> · Ativo {formatDistanceToNow(new Date(m.last_active_at), { addSuffix: true, locale: ptBR })}</>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">
                    <Flame className="h-3 w-3 inline text-orange-500" /> {m.current_streak}d
                  </p>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer count */}
      {!isLoading && filtered.length > 0 && (
        <p className="text-xs text-muted-foreground text-center pt-2">
          Mostrando {Math.min(displayCount, MAX_VISIBLE)} de {total} membros
        </p>
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
