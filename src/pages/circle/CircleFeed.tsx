import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { MessageCircle, Calendar, Lock, Video, SlidersHorizontal, ChevronDown, X, CheckCircle2, Circle, PlayCircle, MessageSquare, Smartphone, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import PostCard from "@/components/circle/PostCard";
import PostComposer from "@/components/circle/PostComposer";
import SpaceFormModal from "@/components/circle/SpaceFormModal";
import { useIsMobile } from "@/hooks/use-mobile";

export default function CircleFeed() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { slug: spaceSlug } = useParams();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCompose, setShowCompose] = useState(false);
  const [filter, setFilter] = useState<"recent" | "popular">("recent");
  const [activeSpaceId, setActiveSpaceId] = useState<string>("all");

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
      const { data } = await supabase
        .from("community_members").select("*")
        .eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const { data: spaces } = useQuery({
    queryKey: ["circle-spaces", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_spaces").select("*")
        .eq("community_id", community.id).eq("is_visible", true)
        .order("position");
      return data || [];
    },
    enabled: !!community,
  });

  // If accessed via /circle/spaces/:slug, find the space
  const urlSpaceId = spaceSlug
    ? spaces?.find((s: any) => s.slug === spaceSlug)?.id
    : null;

  // Effective filter: URL space takes priority, then pill selection
  const effectiveSpaceId = urlSpaceId || (activeSpaceId !== "all" ? activeSpaceId : null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["circle-posts", community?.id, filter, effectiveSpaceId],
    queryFn: async () => {
      if (!community) return [];
      let query = supabase
        .from("community_posts")
        .select(`*, author:community_members!author_id(id, display_name, avatar_url, level, role, total_points),
          space:community_spaces!space_id(id, name, emoji, slug)`)
        .eq("community_id", community.id)
        .is("deleted_at", null);

      if (effectiveSpaceId) {
        query = query.eq("space_id", effectiveSpaceId);
      }

      if (filter === "recent") {
        query = query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
      } else {
        query = query.order("like_count", { ascending: false });
      }

      const { data } = await query.limit(50);
      return data || [];
    },
    enabled: !!community,
  });

  // Next upcoming event for announcement banner
  const { data: nextEvent } = useQuery({
    queryKey: ["circle-next-event-banner", community?.id],
    queryFn: async () => {
      if (!community) return null;
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const { data } = await supabase
        .from("community_events")
        .select("*")
        .eq("community_id", community.id)
        .eq("status", "UPCOMING")
        .gte("starts_at", now.toISOString())
        .lte("starts_at", in24h.toISOString())
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!community,
  });

  const { data: userReactions } = useQuery({
    queryKey: ["circle-reactions", member?.id],
    queryFn: async () => {
      if (!member) return [];
      const { data } = await supabase
        .from("community_reactions").select("post_id")
        .eq("member_id", member.id);
      return data?.map((r: any) => r.post_id) || [];
    },
    enabled: !!member,
  });

  // Onboarding checklist data
  const { data: memberCommentCount } = useQuery({
    queryKey: ["circle-member-comments-count", member?.id],
    queryFn: async () => {
      if (!member) return 0;
      const { count } = await supabase.from("community_comments")
        .select("id", { count: "exact", head: true })
        .eq("author_id", member.id);
      return count || 0;
    },
    enabled: !!member && !(member as any).onboarding_dismissed,
  });

  const { data: lessonProgress } = useQuery({
    queryKey: ["circle-lesson-progress-count", member?.id],
    queryFn: async () => {
      if (!member) return 0;
      const { count } = await supabase.from("circle_lesson_progress")
        .select("id", { count: "exact", head: true })
        .eq("member_id", member.id);
      return count || 0;
    },
    enabled: !!member && !(member as any).onboarding_dismissed,
  });

  const onboardingTasks = useMemo(() => [
    { label: "Assistir vídeo de introdução", icon: PlayCircle, done: (lessonProgress || 0) > 0, link: "/circle/classroom" },
    { label: "Encontrar um post e deixar um comentário", icon: MessageSquare, done: (memberCommentCount || 0) > 0, link: "#" },
    { label: "Baixar o app", icon: Smartphone, done: false, link: "#" },
  ], [lessonProgress, memberCommentCount]);

  const allOnboardingDone = onboardingTasks.every((t) => t.done);
  const showOnboarding = member && !(member as any).onboarding_dismissed && !allOnboardingDone;

  const handleDismissOnboarding = async () => {
    if (!member) return;
    await supabase.from("community_members").update({ onboarding_dismissed: true } as any).eq("id", member.id);
    queryClient.invalidateQueries({ queryKey: ["circle-member"] });
  };

  const isMuted = member?.status === "MUTED";
  const isAdminMember = member?.role === "OWNER" || member?.role === "ADMIN" || member?.role === "MODERATOR";

  const toggleLike = useMutation({
    mutationFn: async (postId: string) => {
      if (!member || !community) throw new Error("Not a member");
      const liked = userReactions?.includes(postId);
      if (liked) {
        await supabase.from("community_reactions").delete().eq("member_id", member.id).eq("post_id", postId);
      } else {
        await supabase.from("community_reactions").insert({ member_id: member.id, post_id: postId, emoji: "❤️" });
        const post = posts?.find((p: any) => p.id === postId);
        if (post && post.author_id !== member.id) {
          await supabase.from("community_points_log").insert({
            community_id: community.id, member_id: post.author_id,
            action: "LIKE_RECEIVED", points: community.points_per_like_received,
            reference_id: postId, reference_type: "post", description: "Recebeu um like",
          });
          await supabase.from("community_members")
            .update({ total_points: (post.author?.total_points || 0) + community.points_per_like_received })
            .eq("id", post.author_id);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
      queryClient.invalidateQueries({ queryKey: ["circle-reactions"] });
    },
  });

  // Determine if user can post in the currently filtered space
  const currentSpace = effectiveSpaceId ? spaces?.find((s: any) => s.id === effectiveSpaceId) : null;
  const canPost = currentSpace?.only_admins_can_post ? isAdminMember : true;

  return (
    <div className="p-4 md:py-6 md:px-5 space-y-3">
      {/* Composer trigger — Skool style */}
      {!isMuted && canPost && (
        <>
           {!showCompose ? (
             <Card
               className="rounded-xl border-0 px-4 py-3 cursor-pointer hover:shadow-md transition-shadow"
               style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
               onClick={() => setShowCompose(true)}
             >
               <div className="flex items-center gap-3">
                 <Avatar className="h-10 w-10 shrink-0">
                   <AvatarImage src={member?.avatar_url || ""} />
                   <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                     {(member?.display_name || user?.email || "U").charAt(0).toUpperCase()}
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 rounded-xl bg-muted/40 px-4 py-2.5">
                   <span className="text-muted-foreground text-sm">Write something...</span>
                 </div>
                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     toast.info("Go Live em breve!");
                   }}
                   className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 px-3 py-1.5 rounded-lg hover:bg-muted/50"
                 >
                   <Video className="h-4 w-4" />
                   <span className="hidden sm:inline">Go Live</span>
                 </button>
               </div>
             </Card>
           ) : community && member && (
            <PostComposer
              communityId={community.id}
              communityName={community.name}
              memberId={member.id}
              memberPoints={member.total_points || 0}
              memberAvatarUrl={member.avatar_url || ""}
              memberDisplayName={member.display_name || ""}
              pointsPerPost={community.points_per_post}
              spaces={spaces || []}
              isAdmin={isAdminMember}
              preselectedSpaceId={effectiveSpaceId}
              onClose={() => setShowCompose(false)}
              onSuccess={() => {}}
              isMobile={isMobile}
            />
          )}
        </>
      )}

      {/* Event banner — only shows when event starts within 24h */}
      {nextEvent && (
        <div
          className="flex items-center justify-center gap-2 py-2 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => toast.info(`Evento: ${nextEvent.title}`)}
        >
          <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
          {nextEvent.max_attendees && <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-sm" style={{ color: "#111827" }}>
            <strong>{nextEvent.title}</strong>
            {" "}is happening in {formatDistanceToNow(new Date(nextEvent.starts_at), { locale: ptBR })}
          </span>
        </div>
      )}

      {/* Category pills + filter */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide items-center flex-1 min-w-0">
          <button
            onClick={() => setActiveSpaceId("all")}
            className={cn(
              "shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              !effectiveSpaceId
                ? "text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            style={!effectiveSpaceId ? { backgroundColor: "#111827" } : { backgroundColor: "#F3F4F6" }}
          >
            All
          </button>
          {(spaces || []).slice(0, 5).map((space: any) => (
            <button
              key={space.id}
              onClick={() => setActiveSpaceId(space.id)}
              className={cn(
                "shrink-0 px-3 py-1 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
                effectiveSpaceId === space.id
                  ? "text-background"
                  : "text-muted-foreground hover:text-foreground"
              )}
              style={effectiveSpaceId === space.id ? { backgroundColor: "#111827" } : { backgroundColor: "#F3F4F6" }}
            >
              {space.emoji} {space.name}
            </button>
          ))}
          {(spaces || []).length > 5 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="shrink-0 px-3 py-1 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: "#F3F4F6" }}
                >
                  More... <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(spaces || []).slice(5).map((space: any) => (
                  <DropdownMenuItem key={space.id} onClick={() => setActiveSpaceId(space.id)}>
                    {space.emoji} {space.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <Separator orientation="vertical" className="h-5" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="shrink-0 p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setFilter("recent")} className={cn(filter === "recent" && "font-semibold")}>
              Mais recentes
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("popular")} className={cn(filter === "popular" && "font-semibold")}>
              Mais curtidos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Onboarding welcome card */}
      {showOnboarding && (
        <Card className="p-4 rounded-xl border-0" style={{ backgroundColor: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
              <span className="text-sm font-bold text-foreground">Welcome! Start here</span>
            </div>
            <button
              onClick={handleDismissOnboarding}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted"
            >
              Dismiss
            </button>
          </div>
          <div className="space-y-2.5">
            {onboardingTasks.map((task, i) => (
              <a
                key={i}
                href={task.link}
                onClick={(e) => { if (task.link === "#") e.preventDefault(); }}
                className="flex items-center gap-3 group cursor-pointer"
              >
                {task.done ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40 shrink-0" />
                )}
                <task.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className={cn(
                  "text-sm",
                  task.done ? "text-muted-foreground line-through" : "text-foreground group-hover:text-primary"
                )}>
                  {task.label}
                </span>
              </a>
            ))}
          </div>
        </Card>
      )}

      {/* Posts */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-card rounded-xl shadow-sm p-5 animate-pulse">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <div className="bg-card rounded-xl shadow-sm p-12 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">No posts yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Be the first to share something! 🎉</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts?.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              liked={userReactions?.includes(post.id) || false}
              onToggleLike={(id) => toggleLike.mutate(id)}
              isMuted={isMuted}
              showSpace={!effectiveSpaceId}
              communityId={community?.id}
              memberId={member?.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
