import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Lock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLevelInfo, LEVEL_THRESHOLDS } from "@/components/circle/CircleLayout";
import MemberProfileModal from "@/components/circle/MemberProfileModal";

export default function CircleLeaderboard() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
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

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*")
        .eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const { data: allMembers } = useQuery({
    queryKey: ["circle-leaderboard-all", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase.from("community_members").select("*")
        .eq("community_id", community.id).eq("status", "ACTIVE")
        .order("total_points", { ascending: false });
      return data || [];
    },
    enabled: !!community,
  });

  // Period-based leaderboard data
  const fetchPeriodData = async (days: number) => {
    if (!community) return [];
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const { data: logs } = await supabase.from("community_points_log")
      .select("member_id, points").eq("community_id", community.id)
      .gte("created_at", start.toISOString());
    if (!logs) return [];
    const pointsMap = new Map<string, number>();
    logs.forEach((log: any) => {
      pointsMap.set(log.member_id, (pointsMap.get(log.member_id) || 0) + log.points);
    });
    const memberIds = Array.from(pointsMap.keys());
    if (memberIds.length === 0) return [];
    const { data: members } = await supabase.from("community_members").select("*")
      .in("id", memberIds).eq("status", "ACTIVE");
    return (members || [])
      .map((m: any) => ({ ...m, period_points: pointsMap.get(m.id) || 0 }))
      .sort((a: any, b: any) => b.period_points - a.period_points)
      .slice(0, 10);
  };

  const { data: weekly } = useQuery({
    queryKey: ["circle-lb-7day", community?.id],
    queryFn: () => fetchPeriodData(7),
    enabled: !!community,
  });

  const { data: monthly } = useQuery({
    queryKey: ["circle-lb-30day", community?.id],
    queryFn: () => fetchPeriodData(30),
    enabled: !!community,
  });

  const myLevel = member ? getLevelInfo(member.total_points) : null;
  const nextLevel = myLevel ? LEVEL_THRESHOLDS.find((l) => l.level === myLevel.level + 1) : null;
  const pointsToNext = nextLevel ? nextLevel.min - (member?.total_points || 0) : 0;

  // Calculate % of members at each level
  const totalMembers = allMembers?.length || 1;
  const levelDistribution = LEVEL_THRESHOLDS.map((l) => {
    const count = allMembers?.filter((m: any) => getLevelInfo(m.total_points).level === l.level).length || 0;
    return { ...l, percent: Math.round((count / totalMembers) * 100) };
  });

  const renderLeaderboardList = (data: any[] | undefined, useField: string) => {
    if (!data || data.length === 0) {
      return <p className="text-sm text-muted-foreground py-4">Nenhuma atividade ainda</p>;
    }
    return (
      <div className="space-y-3 mt-3">
        {data.slice(0, 10).map((m: any, i: number) => (
          <div
            key={m.id}
            onClick={() => setProfileMemberId(m.id)}
            className="flex items-center gap-3 cursor-pointer hover:bg-muted/50 rounded-lg px-2 py-1 transition-colors"
          >
            <span className="w-5 text-xs font-medium text-muted-foreground">{i + 1}</span>
            <Avatar className="h-8 w-8">
              <AvatarImage src={m.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {(m.display_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{m.display_name || "Membro"}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <LevelCircle level={getLevelInfo(useField === "period_points" ? (m.total_points || 0) : m.total_points).level} size={20} />
              <span className="text-xs font-semibold text-muted-foreground">
                {useField === "period_points" ? m.period_points : m.total_points}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Profile + Levels Card */}
      <Card className="p-6 md:p-8">
        <div className="flex flex-col md:flex-row gap-8">
          {/* Left: Avatar + Name */}
          <div className="flex flex-col items-center text-center min-w-[200px]">
            <div className="relative">
              <Avatar className="h-40 w-40 ring-4 ring-muted">
                <AvatarImage src={member?.avatar_url || ""} />
                <AvatarFallback className="bg-primary/10 text-primary text-3xl">
                  {(member?.display_name || "U").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {myLevel && (
                <div className="absolute -bottom-1 -right-1">
                  <LevelCircle level={myLevel.level} size={36} />
                </div>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground mt-4">{member?.display_name || "Membro"}</h2>
            {myLevel && <p className="text-sm text-primary font-medium">Nível {myLevel.level}</p>}
            {nextLevel && (
              <p className="text-sm text-primary mt-1">
                <span className="font-semibold">{pointsToNext}</span> pontos para subir de nível
              </p>
            )}
            {!nextLevel && myLevel && (
              <p className="text-sm text-primary mt-1 font-medium">Nível máximo atingido! 👑</p>
            )}
          </div>

          {/* Right: Levels Grid */}
          <div className="flex-1 grid grid-cols-2 gap-x-8 gap-y-3 content-start">
            {levelDistribution.map((l) => {
              const isUnlocked = myLevel && myLevel.level >= l.level;
              const isCurrent = myLevel?.level === l.level;
              return (
                <div key={l.level} className="flex items-center gap-3">
                  {isUnlocked ? (
                    <LevelCircle level={l.level} size={28} />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center">
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                  )}
                  <div>
                    <p className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "text-foreground" : isUnlocked ? "text-foreground" : "text-muted-foreground"
                    )}>
                      Level {l.level}
                    </p>
                    <p className="text-xs text-muted-foreground">{l.percent}% of members</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Info text */}
      <p className="text-sm text-muted-foreground italic text-center">
        Leaderboards will be updated when there is more activity
      </p>

      {/* 3 Leaderboard columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <h3 className="text-base font-bold text-foreground border-b pb-3 border-border">
            Leaderboard (7-day)
          </h3>
          {renderLeaderboardList(weekly, "period_points")}
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-bold text-foreground border-b pb-3 border-border">
            Leaderboard (30-day)
          </h3>
          {renderLeaderboardList(monthly, "period_points")}
        </Card>
        <Card className="p-5">
          <h3 className="text-base font-bold text-foreground border-b pb-3 border-border">
            Leaderboard (all-time)
          </h3>
          {renderLeaderboardList(allMembers?.slice(0, 10), "total_points")}
        </Card>
      </div>

      {/* Member profile modal */}
      <MemberProfileModal
        memberId={profileMemberId}
        communityId={community?.id || null}
        open={!!profileMemberId}
        onOpenChange={(open) => !open && setProfileMemberId(null)}
      />
    </div>
  );
}

// Small level circle badge component (matches Skool style)
function LevelCircle({ level, size = 24 }: { level: number; size?: number }) {
  const colors: Record<number, string> = {
    1: "bg-yellow-100 text-yellow-700 border-yellow-300",
    2: "bg-yellow-100 text-yellow-700 border-yellow-300",
    3: "bg-yellow-100 text-yellow-700 border-yellow-300",
    4: "bg-yellow-100 text-yellow-700 border-yellow-300",
    5: "bg-yellow-100 text-yellow-700 border-yellow-300",
    6: "bg-yellow-100 text-yellow-700 border-yellow-300",
    7: "bg-yellow-100 text-yellow-700 border-yellow-300",
    8: "bg-yellow-100 text-yellow-700 border-yellow-300",
    9: "bg-yellow-100 text-yellow-700 border-yellow-300",
  };
  const style = colors[level] || colors[1];
  return (
    <div
      className={cn("rounded-full border-2 flex items-center justify-center font-bold", style)}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {level}
    </div>
  );
}
