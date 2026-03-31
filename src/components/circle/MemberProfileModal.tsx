import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Flame, MessageCircle, Heart, FileText, Calendar } from "lucide-react";
import LevelBadge from "@/components/circle/LevelBadge";
import { getLevelInfo } from "@/components/circle/CircleLayout";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Link, useParams } from "react-router-dom";

interface MemberProfileModalProps {
  memberId: string | null;
  communityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MemberProfileModal({ memberId, communityId, open, onOpenChange }: MemberProfileModalProps) {
  const { slug: communitySlug } = useParams();
  const { data: member } = useQuery({
    queryKey: ["circle-member-profile", memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const { data } = await supabase.from("community_members").select("*").eq("id", memberId).single();
      return data;
    },
    enabled: !!memberId && open,
  });

  const { data: stats } = useQuery({
    queryKey: ["circle-member-stats", memberId],
    queryFn: async () => {
      if (!memberId) return null;
      const [posts, comments, likes] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", memberId).is("deleted_at", null),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("author_id", memberId).is("deleted_at", null),
        supabase.from("community_reactions").select("id", { count: "exact", head: true }).eq("member_id", memberId),
      ]);
      return {
        posts: posts.count || 0,
        comments: comments.count || 0,
        likes: likes.count || 0,
      };
    },
    enabled: !!memberId && open,
  });

  const { data: recentPosts } = useQuery({
    queryKey: ["circle-member-recent-posts", memberId],
    queryFn: async () => {
      if (!memberId) return [];
      const { data } = await supabase.from("community_posts")
        .select("id, title, created_at")
        .eq("author_id", memberId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
    enabled: !!memberId && open,
  });

  // Get rank position
  const { data: rank } = useQuery({
    queryKey: ["circle-member-rank", memberId, communityId],
    queryFn: async () => {
      if (!memberId || !communityId) return null;
      const { data } = await supabase.from("community_members")
        .select("id")
        .eq("community_id", communityId)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false });
      if (!data) return null;
      const idx = data.findIndex((m: any) => m.id === memberId);
      return idx >= 0 ? idx + 1 : null;
    },
    enabled: !!memberId && !!communityId && open,
  });

  if (!member) return null;

  const level = getLevelInfo(member.total_points);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="sr-only">Perfil do membro</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center text-center space-y-4">
          <Avatar className="h-20 w-20 ring-2 ring-offset-2 ring-border">
            <AvatarImage src={member.avatar_url || ""} />
            <AvatarFallback className="bg-primary/10 text-primary text-xl">
              {(member.display_name || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-lg font-bold text-foreground">{member.display_name || "Membro"}</h2>
            {member.bio && <p className="text-sm text-muted-foreground mt-1">{member.bio}</p>}
          </div>

          <div className="flex items-center gap-3">
            <LevelBadge points={member.total_points} size="md" showLabel />
          </div>

          <div className="grid grid-cols-3 gap-3 w-full text-center">
            <Card className="p-3">
              <p className="text-lg font-bold text-foreground">{member.total_points}</p>
              <p className="text-[10px] text-muted-foreground">Pontos</p>
            </Card>
            <Card className="p-3">
              <p className="text-lg font-bold text-foreground">#{rank || "–"}</p>
              <p className="text-[10px] text-muted-foreground">Ranking</p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center justify-center gap-1">
                <Flame className="h-4 w-4 text-orange-500" />
                <p className="text-lg font-bold text-foreground">{member.current_streak}</p>
              </div>
              <p className="text-[10px] text-muted-foreground">Streak</p>
            </Card>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {stats?.posts || 0} posts</span>
            <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> {stats?.comments || 0} comentários</span>
            <span className="flex items-center gap-1"><Heart className="h-3.5 w-3.5" /> {stats?.likes || 0} likes</span>
          </div>

          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Membro desde {format(new Date(member.joined_at || member.created_at), "dd/MM/yyyy", { locale: ptBR })}
          </p>

          {recentPosts && recentPosts.length > 0 && (
            <div className="w-full text-left space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Últimos posts</p>
              {recentPosts.map((p: any) => (
                <Link
                  key={p.id}
                  to={`/circle/post/${p.id}`}
                  onClick={() => onOpenChange(false)}
                  className="block text-sm text-foreground hover:text-primary truncate"
                >
                  {p.title}
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {formatDistanceToNow(new Date(p.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
