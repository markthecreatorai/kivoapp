import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, FileText, MessageCircle, Heart, Users, HelpCircle, Pencil, Eye } from "lucide-react";
import { format, subDays, eachDayOfInterval, startOfDay, getDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import { getLevelInfo } from "@/components/circle/CircleLayout";
import { cn } from "@/lib/utils";

// ─── Activity Heatmap ────────────────────────────────────────
function ActivityHeatmap({ memberId }: { memberId: string }) {
  const today = startOfDay(new Date());
  const yearAgo = subDays(today, 364);

  const { data: activityMap = {} } = useQuery({
    queryKey: ["circle-activity-heatmap", memberId],
    queryFn: async () => {
      // Fetch posts + comments created dates for past year
      const [posts, comments] = await Promise.all([
        supabase.from("community_posts").select("created_at").eq("author_id", memberId).gte("created_at", yearAgo.toISOString()).is("deleted_at", null),
        supabase.from("community_comments").select("created_at").eq("author_id", memberId).gte("created_at", yearAgo.toISOString()).is("deleted_at", null),
      ]);
      const map: Record<string, number> = {};
      [...(posts.data || []), ...(comments.data || [])].forEach((item: any) => {
        const day = format(new Date(item.created_at), "yyyy-MM-dd");
        map[day] = (map[day] || 0) + 1;
      });
      return map;
    },
    staleTime: 60_000 * 5,
  });

  const days = eachDayOfInterval({ start: yearAgo, end: today });

  // Group into weeks (columns)
  const weeks: Date[][] = [];
  let currentWeek: Date[] = [];
  days.forEach((d) => {
    if (getDay(d) === 0 && currentWeek.length > 0) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    currentWeek.push(d);
  });
  if (currentWeek.length) weeks.push(currentWeek);

  const getLevel = (count: number) => {
    if (count === 0) return 0;
    if (count <= 1) return 1;
    if (count <= 3) return 2;
    if (count <= 5) return 3;
    return 4;
  };

  const colors = [
    "bg-muted",
    "bg-primary/20",
    "bg-primary/40",
    "bg-primary/60",
    "bg-primary/90",
  ];

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" style={{ minWidth: "max-content" }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const count = activityMap[key] || 0;
                const level = getLevel(count);
                return (
                  <div
                    key={key}
                    className={cn("w-[11px] h-[11px] rounded-[2px]", colors[level])}
                    title={`${format(day, "dd MMM yyyy", { locale: ptBR })}: ${count} atividades`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>Less</span>
        {colors.map((c, i) => (
          <div key={i} className={cn("w-[11px] h-[11px] rounded-[2px]", c)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

// ─── "What is this?" Modal ────────────────────────────────────
function ActivityInfoModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Daily activity</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-muted-foreground space-y-3">
          <p>
            The activity chart shows your daily contributions over the past year.
            Each square represents one day — the darker the color, the more active you were.
          </p>
          <p>
            Activities counted include: posts, comments, reactions, and course progress.
          </p>
          <p>
            Consistent daily activity builds your streak 🔥 and helps you level up faster!
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Community Card ────────────────────────────────────────
function CommunityCard({ community, onView }: { community: any; onView: () => void }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      {community.icon_url ? (
        <img src={community.icon_url} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary">
          {(community.name || "C").charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground truncate">{community.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-0.5"><Users className="h-3 w-3" /> {community.member_count || 0}</span>
          <span>•</span>
          <span>{community.price_cents > 0 ? `R$ ${(community.price_cents / 100).toFixed(0)}/mo` : "Free"}</span>
        </div>
      </div>
      <Button variant="outline" size="sm" className="shrink-0 h-7 text-xs" onClick={onView}>
        <Eye className="h-3 w-3 mr-1" /> View
      </Button>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function CircleProfile() {
  const { slug, memberId: memberIdParam } = useParams<{ slug: string; memberId?: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showActivityInfo, setShowActivityInfo] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>("all");

  // Current community
  const { data: community } = useQuery({
    queryKey: ["circle-community-profile", slug],
    queryFn: async () => {
      const { data } = await supabase.from("communities").select("id, name, slug").eq("slug", slug!).single();
      return data;
    },
    enabled: !!slug,
  });

  // Current user's membership in this community
  const { data: currentMember } = useQuery({
    queryKey: ["circle-my-member", community?.id, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("community_members").select("*")
        .eq("community_id", community!.id).eq("user_id", user!.id).eq("status", "ACTIVE").single();
      return data;
    },
    enabled: !!community?.id && !!user?.id,
  });

  // Target member (self or other)
  const isOwnProfile = !memberIdParam;
  const targetMemberId = memberIdParam || currentMember?.id;

  const { data: member, isLoading: memberLoading } = useQuery({
    queryKey: ["circle-profile-member", targetMemberId],
    queryFn: async () => {
      const { data } = await supabase.from("community_members").select("*").eq("id", targetMemberId!).single();
      return data;
    },
    enabled: !!targetMemberId,
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["circle-profile-stats", targetMemberId],
    queryFn: async () => {
      if (!targetMemberId) return null;
      const [posts, comments, likes] = await Promise.all([
        supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", targetMemberId).is("deleted_at", null),
        supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("author_id", targetMemberId).is("deleted_at", null),
        supabase.from("community_reactions").select("id", { count: "exact", head: true }).eq("member_id", targetMemberId),
      ]);
      return { posts: posts.count || 0, comments: comments.count || 0, likes: likes.count || 0 };
    },
    enabled: !!targetMemberId,
  });

  // All communities this user is part of (for owned + memberships)
  const targetUserId = member?.user_id;
  const { data: allMemberships = [] } = useQuery({
    queryKey: ["circle-profile-memberships", targetUserId],
    queryFn: async () => {
      const { data } = await supabase.from("community_members")
        .select("community_id, role, communities:community_id(id, name, slug, icon_url, member_count, price_cents)")
        .eq("user_id", targetUserId!).eq("status", "ACTIVE");
      return (data || []).map((m: any) => ({ ...m.communities, role: m.role })).filter((c: any) => c.id);
    },
    enabled: !!targetUserId,
  });

  const ownedCommunities = allMemberships.filter((c: any) => c.role === "OWNER" || c.role === "ADMIN");
  const memberCommunities = allMemberships.filter((c: any) => c.role === "MEMBER" || c.role === "MODERATOR");

  // Contributions per community
  const { data: contributions = {} } = useQuery({
    queryKey: ["circle-profile-contributions", targetMemberId, targetUserId],
    queryFn: async () => {
      if (!targetUserId) return {};
      // Get member IDs across communities
      const { data: members } = await supabase.from("community_members")
        .select("id, community_id").eq("user_id", targetUserId).eq("status", "ACTIVE");
      if (!members) return {};
      const result: Record<string, { posts: number; comments: number; likes: number }> = {};
      for (const m of members) {
        const [posts, comments, likes] = await Promise.all([
          supabase.from("community_posts").select("id", { count: "exact", head: true }).eq("author_id", m.id).is("deleted_at", null),
          supabase.from("community_comments").select("id", { count: "exact", head: true }).eq("author_id", m.id).is("deleted_at", null),
          supabase.from("community_reactions").select("id", { count: "exact", head: true }).eq("member_id", m.id),
        ]);
        result[m.community_id] = { posts: posts.count || 0, comments: comments.count || 0, likes: likes.count || 0 };
      }
      return result;
    },
    enabled: !!targetUserId,
    staleTime: 60_000 * 5,
  });

  const totalContributions = (stats?.posts || 0) + (stats?.comments || 0) + (stats?.likes || 0);

  const filteredContributions = useMemo(() => {
    if (selectedCommunityId === "all") {
      return Object.entries(contributions).map(([cid, data]) => {
        const comm = allMemberships.find((c: any) => c.id === cid);
        return { communityName: comm?.name || "Unknown", ...data as any };
      });
    }
    const data = contributions[selectedCommunityId];
    const comm = allMemberships.find((c: any) => c.id === selectedCommunityId);
    return data ? [{ communityName: comm?.name || "Unknown", ...data }] : [];
  }, [contributions, selectedCommunityId, allMemberships]);

  if (memberLoading) {
    return (
      <div className="flex gap-6 p-4 md:p-6 max-w-5xl mx-auto w-full">
        <div className="flex-1 space-y-6">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <div className="hidden lg:block w-[280px] shrink-0">
          <Skeleton className="h-[360px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Member not found.</p>
      </div>
    );
  }

  const levelInfo = getLevelInfo(member.total_points);

  return (
    <div className="flex gap-6 p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* ─── Main Column ─── */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Activity */}
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Activity</h2>
            <button
              onClick={() => setShowActivityInfo(true)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" /> What is this?
            </button>
          </div>
          {targetMemberId && <ActivityHeatmap memberId={targetMemberId} />}
        </Card>

        {/* Owned communities */}
        {ownedCommunities.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              Owned by {member.display_name || "User"}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {ownedCommunities.map((c: any) => (
                <CommunityCard key={c.id} community={c} onView={() => navigate(`/c/${c.slug}/feed`)} />
              ))}
            </div>
          </div>
        )}

        {/* Memberships */}
        {memberCommunities.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Memberships</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {memberCommunities.map((c: any) => (
                <CommunityCard key={c.id} community={c} onView={() => navigate(`/c/${c.slug}/feed`)} />
              ))}
            </div>
          </div>
        )}

        {/* Contributions */}
        <Card className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Contributions</h2>
            <Select value={selectedCommunityId} onValueChange={setSelectedCommunityId}>
              <SelectTrigger className="h-8 w-[180px] text-xs">
                <SelectValue placeholder="All communities" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All communities</SelectItem>
                {allMemberships.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filteredContributions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No contributions yet.</p>
          ) : (
            <div className="space-y-2">
              {filteredContributions.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm text-foreground">{item.communityName}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {item.posts}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {item.comments}</span>
                    <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {item.likes}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ─── Profile Sidebar ─── */}
      <div className="hidden lg:block w-[280px] shrink-0">
        <Card className="p-5 space-y-5 sticky top-20">
          <div className="flex flex-col items-center text-center space-y-3">
            <Avatar className="h-20 w-20 ring-2 ring-offset-2 ring-border">
              <AvatarImage src={member.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl">
                {(member.display_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="text-base font-bold text-foreground">{member.display_name || "Member"}</h2>
              {member.username && (
                <p className="text-xs text-muted-foreground">@{member.username}</p>
              )}
            </div>
            {member.bio && (
              <p className="text-xs text-muted-foreground leading-relaxed">{member.bio}</p>
            )}
            <LevelBadge points={member.total_points} size="md" showLabel />
          </div>

          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            Joined {format(new Date(member.joined_at || member.created_at), "MMM d, yyyy")}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-base font-bold text-foreground">{totalContributions}</p>
              <p className="text-[10px] text-muted-foreground">Contributions</p>
            </div>
            <div>
              <p className="text-base font-bold text-foreground">0</p>
              <p className="text-[10px] text-muted-foreground">Followers</p>
            </div>
            <div>
              <p className="text-base font-bold text-foreground">0</p>
              <p className="text-[10px] text-muted-foreground">Following</p>
            </div>
          </div>

          {isOwnProfile && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs"
              onClick={() => navigate(`/c/${slug}/settings?section=profile`)}
            >
              <Pencil className="h-3 w-3 mr-1.5" /> EDIT PROFILE
            </Button>
          )}
        </Card>
      </div>

      {/* ─── Mobile Profile Summary ─── */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 z-10 bg-background border-t p-3 flex items-center gap-3">
        <Avatar className="h-9 w-9">
          <AvatarImage src={member.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {(member.display_name || "U").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">{member.display_name}</p>
          <p className="text-[10px] text-muted-foreground">{totalContributions} contributions</p>
        </div>
        {isOwnProfile && (
          <Button variant="outline" size="sm" className="text-xs h-7 shrink-0" onClick={() => navigate(`/circle-settings?section=profile`)}>
            Edit
          </Button>
        )}
      </div>

      <ActivityInfoModal open={showActivityInfo} onOpenChange={setShowActivityInfo} />
    </div>
  );
}
