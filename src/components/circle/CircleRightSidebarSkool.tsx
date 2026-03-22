import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { getLevelInfo } from "@/components/circle/CircleLayout";

interface Props {
  community: any;
  member: any;
}

export default function CircleRightSidebarSkool({ community, member }: Props) {
  // Top 3 members for mini leaderboard
  const { data: topMembers } = useQuery({
    queryKey: ["circle-top3", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, total_points, role")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("total_points", { ascending: false })
        .limit(3);
      return data || [];
    },
    enabled: !!community,
  });

  // Count admins
  const { data: adminCount } = useQuery({
    queryKey: ["circle-admin-count", community?.id],
    queryFn: async () => {
      if (!community) return 0;
      const { count } = await supabase
        .from("community_members")
        .select("*", { count: "exact", head: true })
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .in("role", ["OWNER", "ADMIN"]);
      return count || 0;
    },
    enabled: !!community,
  });

  if (!community) return null;

  return (
    <div className="p-4 space-y-4">
      {/* Community About Card */}
      <Card className="overflow-hidden">
        {/* Cover */}
        {community.cover_image_url ? (
          <div className="h-24 bg-muted">
            <img
              src={community.cover_image_url}
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
        )}

        <div className="p-4 space-y-3">
          {/* Community name */}
          <h3 className="font-bold text-foreground text-base">{community.name}</h3>

          {/* Description */}
          {(community.description || community.long_description) && (
            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3">
              {community.long_description || community.description}
            </p>
          )}

          {/* Quick links */}
          <div className="space-y-1">
            <Link
              to="/circle/feed"
              className="text-sm text-primary hover:underline block"
            >
              ➪ Start Here
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="flex-1 text-center">
              <p className="text-sm font-bold text-foreground">{community.member_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Members</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-sm font-bold text-foreground">{community.post_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Posts</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-sm font-bold text-foreground">{adminCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Admins</p>
            </div>
          </div>

          {/* Member avatars row */}
          {topMembers && topMembers.length > 0 && (
            <div className="flex items-center gap-0 pt-1">
              {topMembers.map((m: any, i: number) => (
                <Avatar
                  key={m.id}
                  className="h-8 w-8 border-2 border-card"
                  style={{ marginLeft: i > 0 ? "-8px" : "0", zIndex: 10 - i }}
                >
                  <AvatarImage src={m.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                    {(m.display_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
              {community.member_count > 3 && (
                <span className="text-xs text-muted-foreground ml-2">
                  +{community.member_count - 3} more
                </span>
              )}
            </div>
          )}

          {/* Contribute / Invite button */}
          <Button
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90 font-bold"
            size="sm"
            asChild
          >
            <Link to="/circle/members">
              <Users className="h-4 w-4 mr-2" />
              View Members
            </Link>
          </Button>
        </div>
      </Card>

      {/* Mini Leaderboard */}
      {topMembers && topMembers.length > 0 && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Leaderboard
            </h3>
            <Link
              to="/circle/leaderboard"
              className="text-xs text-primary hover:underline font-medium"
            >
              See all
            </Link>
          </div>
          <div className="space-y-2.5">
            {topMembers.map((m: any, i: number) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span className="w-5 text-center text-sm">{medal}</span>
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                      {(m.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium flex-1 truncate text-foreground">
                    {m.display_name || "Member"}
                  </span>
                  <span className="text-xs font-semibold text-primary">
                    +{m.total_points}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
