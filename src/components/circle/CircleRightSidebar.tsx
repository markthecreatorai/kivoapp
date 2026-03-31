import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, MessageSquare, Calendar, Trophy } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getLevelInfo } from "@/components/circle/CircleLayout";

interface CircleRightSidebarProps {
  community: any;
  member: any;
}

export default function CircleRightSidebar({ community, member }: CircleRightSidebarProps) {
  const { slug } = useParams<{ slug: string }>();
  const basePath = slug ? `/c/${slug}` : "/circle";

  // Top 5 members for mini leaderboard
  const { data: topMembers } = useQuery({
    queryKey: ["circle-top5", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, total_points, role")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!community,
  });

  // Next upcoming event
  const { data: nextEvent } = useQuery({
    queryKey: ["circle-next-event", community?.id],
    queryFn: async () => {
      if (!community) return null;
      const { data } = await supabase
        .from("community_events")
        .select("*")
        .eq("community_id", community.id)
        .eq("status", "UPCOMING")
        .gte("starts_at", new Date().toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!community,
  });

  if (!community) return null;

  return (
    <div className="p-4 space-y-4">
      {/* About */}
      <Card className="p-4 space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sobre a comunidade</h3>
        {community.long_description ? (
          <p className="text-sm text-foreground leading-relaxed">{community.long_description}</p>
        ) : community.description ? (
          <p className="text-sm text-foreground leading-relaxed">{community.description}</p>
        ) : null}
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {community.member_count} membros
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {community.post_count} posts
          </span>
        </div>
      </Card>

      {/* Mini Leaderboard */}
      {topMembers && topMembers.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ranking</h3>
            <Link to={`${basePath}/leaderboard`} className="text-xs text-primary hover:underline">Ver todos</Link>
          </div>
          <div className="space-y-2">
            {topMembers.map((m: any, i: number) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              return (
                <div key={m.id} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs">
                    {medal || <span className="text-muted-foreground">{i + 1}</span>}
                  </span>
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                      {(m.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-medium flex-1 truncate">{m.display_name || "Membro"}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{m.total_points} pts</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Next Event */}
      {nextEvent && (
        <Card className="p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Próximo evento</h3>
          <Link to={`${basePath}/events`} className="block hover:bg-muted/50 rounded-lg -m-1 p-1 transition-colors">
            <p className="text-sm font-semibold text-foreground">{nextEvent.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Calendar className="h-3.5 w-3.5" />
              <span>{format(new Date(nextEvent.starts_at), "dd MMM · HH:mm", { locale: ptBR })}</span>
            </div>
            {nextEvent.rsvp_count > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{nextEvent.rsvp_count} confirmados</p>
            )}
          </Link>
        </Card>
      )}

      {/* My stats */}
      {member && (
        <Card className="p-4 space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Seus dados</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-lg font-bold text-foreground">{member.total_points}</p>
              <p className="text-[10px] text-muted-foreground">Pontos</p>
            </div>
            <div className="text-center p-2 bg-muted/50 rounded-lg">
              <p className="text-lg font-bold text-foreground">🔥 {member.current_streak}</p>
              <p className="text-[10px] text-muted-foreground">Dias seguidos</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center">
            Nível {getLevelInfo(member.total_points).level} — {getLevelInfo(member.total_points).label}
          </p>
        </Card>
      )}
    </div>
  );
}
