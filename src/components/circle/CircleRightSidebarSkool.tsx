import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Users } from "lucide-react";
import { Link } from "react-router-dom";

interface Props {
  community: any;
  member: any;
}

export default function CircleRightSidebarSkool({ community, member }: Props) {
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

  const { data: recentMembers } = useQuery({
    queryKey: ["circle-recent-members", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .order("joined_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!community,
  });

  if (!community) return null;

  return (
    <div className="p-4 space-y-4">
      {/* ── About Card ── */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {/* Cover image */}
        {community.cover_image_url ? (
          <div className="h-40">
            <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="h-40 bg-gradient-to-b from-foreground/80 to-foreground/40" />
        )}

        <div className="px-4 pt-4 pb-4 space-y-4">
          {/* Community name */}
          <h3 className="font-bold text-foreground text-[15px] leading-tight">
            {community.name}
          </h3>

          {/* Description */}
          {(community.description || community.long_description) && (
            <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-3">
              {community.long_description || community.description}
            </p>
          )}

          {/* Quick links */}
          <div className="space-y-0.5">
            <Link to="/circle/feed" className="text-[13px] text-primary hover:underline block font-medium">
              ➪ Start Here
            </Link>
          </div>

          {/* Stats row — 3 columns with dividers */}
          <div className="flex items-center border-t border-b border-border py-3 -mx-4 px-4">
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{community.member_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Members</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{community.post_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Posts</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{adminCount ?? 0}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Admins</p>
            </div>
          </div>

          {/* Overlapping member avatars */}
          {recentMembers && recentMembers.length > 0 && (
            <div className="flex items-center">
              <div className="flex items-center">
                {recentMembers.slice(0, 8).map((m: any, i: number) => (
                  <Avatar
                    key={m.id}
                    className="h-8 w-8 border-2 border-card"
                    style={{ marginLeft: i > 0 ? "-6px" : "0", zIndex: 20 - i }}
                  >
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
                      {(m.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {community.member_count > 8 && (
                <span className="text-[11px] text-muted-foreground ml-2 shrink-0">
                  +{community.member_count - 8}
                </span>
              )}
            </div>
          )}

          {/* Yellow/gold invite button — Skool signature */}
          <Link
            to="/circle/members"
            className="flex items-center justify-center gap-2 w-full rounded-lg py-2.5 px-4 font-bold text-sm transition-colors"
            style={{
              backgroundColor: "hsl(45, 93%, 58%)",
              color: "hsl(30, 30%, 15%)",
            }}
          >
            <Users className="h-4 w-4" />
            Invite Members
          </Link>
        </div>
      </div>

      {/* ── Leaderboard Card ── */}
      {topMembers && topMembers.length > 0 && (
        <div className="bg-card rounded-xl border border-border px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Leaderboard
            </h4>
            <Link to="/circle/leaderboard" className="text-[12px] text-primary hover:underline font-medium">
              See all
            </Link>
          </div>
          <div className="space-y-3">
            {topMembers.map((m: any, i: number) => (
              <div key={m.id} className="flex items-center gap-3">
                {/* Rank badge */}
                <div
                  className="h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                  style={{
                    backgroundColor:
                      i === 0
                        ? "hsl(45, 93%, 58%)"
                        : i === 1
                        ? "hsl(0, 0%, 80%)"
                        : "hsl(28, 60%, 60%)",
                    color:
                      i === 0
                        ? "hsl(30, 30%, 15%)"
                        : i === 1
                        ? "hsl(0, 0%, 25%)"
                        : "hsl(0, 0%, 100%)",
                  }}
                >
                  {i + 1}
                </div>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={m.avatar_url || ""} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
                    {(m.display_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-[13px] font-medium text-foreground flex-1 truncate">
                  {m.display_name || "Member"}
                </span>
                <span className="text-[12px] font-semibold text-primary shrink-0">
                  +{m.total_points}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
