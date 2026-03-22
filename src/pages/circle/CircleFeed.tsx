import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { MessageCircle, Calendar, Lock, Filter } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, differenceInHours, isFuture } from "date-fns";
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
    <div className="p-4 md:p-6 space-y-4">
      {/* Composer trigger — Skool style: avatar + "Write something..." */}
      {!isMuted && canPost && (
        <>
          {!showCompose ? (
            <Card
              className="p-3 cursor-pointer hover:bg-muted/30 transition-colors border"
              onClick={() => setShowCompose(true)}
            >
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={member?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(member?.display_name || user?.email || "U").charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-muted-foreground text-sm flex-1">Write something...</span>
              </div>
            </Card>
          ) : community && member && (
            <PostComposer
              communityId={community.id}
              memberId={member.id}
              memberPoints={member.total_points || 0}
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

      {/* Category filter chips — Skool style */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">
        <button
          onClick={() => setActiveSpaceId("all")}
          className={cn(
            "shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors",
            !effectiveSpaceId
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          )}
        >
          All
        </button>
        {spaces?.map((space: any) => (
          <button
            key={space.id}
            onClick={() => setActiveSpaceId(space.id)}
            className={cn(
              "shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              effectiveSpaceId === space.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {space.name} {space.emoji}
          </button>
        ))}
      </div>

      {/* Sort filter */}
      <div className="flex gap-1">
        {([
          { key: "recent" as const, label: "Recent" },
          { key: "popular" as const, label: "Top" },
        ]).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1 rounded-md text-xs font-medium transition-colors",
              filter === f.key
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Posts */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-2/3" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : posts?.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">No posts yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Be the first to share something! 🎉</p>
        </Card>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
