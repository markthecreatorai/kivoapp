import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "react-router-dom";

interface Props {
  community: any;
  member: any;
}

export default function CircleRightSidebarSkool({ community, member }: Props) {
  // Simulated online count (% of members, fluctuates slightly)
  const [onlineCount, setOnlineCount] = useState(0);
  useEffect(() => {
    if (!community) return;
    const base = Math.max(1, Math.floor(community.member_count * 0.12));
    const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
    setOnlineCount(base + jitter);
    const interval = setInterval(() => {
      const j = Math.floor(Math.random() * Math.max(1, Math.floor(base * 0.3)));
      setOnlineCount(base + j);
    }, 30000);
    return () => clearInterval(interval);
  }, [community?.member_count]);

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

  const { data: adminMembers } = useQuery({
    queryKey: ["circle-admin-members", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url, role")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .in("role", ["OWNER", "ADMIN"])
        .order("role")
        .limit(6);
      return data || [];
    },
    enabled: !!community,
  });

  if (!community) return null;

  const adminCount = adminMembers?.length ?? 0;

  return (
    <div className="p-4 space-y-4">
      {/* ── About Card ── */}
      <div className="bg-card rounded-xl shadow-sm overflow-hidden">
        {/* Cover image — flush top, no padding */}
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

          {/* Stats row — Members | Online | Admins */}
          <div className="flex items-center border-t border-b border-border py-3 -mx-4 px-4">
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{community.member_count}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Members</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground flex items-center justify-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-accent animate-pulse" />
                {onlineCount}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Online</p>
            </div>
            <div className="w-px h-9 bg-border" />
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-foreground">{adminCount}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Admins</p>
            </div>
          </div>

          {/* Admin avatars row */}
          {adminMembers && adminMembers.length > 0 && (
            <div className="flex items-center">
              {adminMembers.map((m: any, i: number) => (
                <Avatar
                  key={m.id}
                  className="h-7 w-7 border-2 border-card"
                  style={{ marginLeft: i > 0 ? "-5px" : "0", zIndex: 20 - i }}
                >
                  <AvatarImage src={m.avatar_url || ""} />
                  <AvatarFallback className="bg-muted text-muted-foreground text-[9px] font-medium">
                    {(m.display_name || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ))}
            </div>
          )}

          {/* Yellow CTA button — Skool signature */}
          <Link
            to="/circle/feed"
            className="flex items-center justify-center w-full rounded-lg py-3 px-4 font-bold text-[15px] uppercase tracking-wide transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#f5c518", color: "#1a1a1a" }}
          >
            Enter Group
          </Link>
        </div>
      </div>

      {/* ── Leaderboard Card (30-day) ── */}
      {topMembers && topMembers.length > 0 && (
        <div className="bg-card rounded-xl shadow-sm px-4 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Leaderboard (30-day)
            </h4>
            <Link to="/circle/leaderboard" className="text-[12px] text-primary hover:underline font-medium">
              See all
            </Link>
          </div>
          <div className="space-y-3">
            {topMembers.map((m: any, i: number) => {
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
              return (
                <div key={m.id} className="flex items-center gap-2.5">
                  <span className="w-5 text-center text-sm shrink-0">{medal}</span>
                  <Avatar className="h-7 w-7 shrink-0">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-muted text-muted-foreground text-[9px] font-medium">
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
