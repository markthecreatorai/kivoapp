import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageCircle, Calendar, Lock, Video, SlidersHorizontal, ChevronDown, X, CheckCircle2, Circle, PlayCircle, MessageSquare, Smartphone, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import PostCard from "@/components/circle/PostCard";
import PostComposer from "@/components/circle/PostComposer";
import SpaceFormModal from "@/components/circle/SpaceFormModal";
import PostDetailModal from "@/components/circle/PostDetailModal";
import LiveStreamFormModal from "@/components/circle/LiveStreamFormModal";
import LiveStreamViewer from "@/components/circle/LiveStreamViewer";
import LiveStreamBanner from "@/components/circle/LiveStreamBanner";
import { useIsMobile } from "@/hooks/use-mobile";
import AdminSetupChecklist from "@/components/circle/AdminSetupChecklist";
import MemberWelcomeCard from "@/components/circle/MemberWelcomeCard";

function InviteDialogBody({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/circles/${slug}`;
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };
  return (
    <div className="pt-4 space-y-4">
      <div className="flex">
        <input type="text" readOnly value={link} className="flex-1 min-w-0 px-3 py-2 text-sm border border-border rounded-l-lg bg-background text-foreground truncate focus:outline-none select-all" />
        <button onClick={handleCopy} className="px-4 py-2 text-sm font-bold rounded-r-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity flex items-center gap-1.5">
          {copied ? <><Check className="h-4 w-4" /> COPIADO</> : <><Copy className="h-4 w-4" /> COPIAR</>}
        </button>
      </div>
      <div className="flex gap-2">
        <a href={`https://wa.me/?text=${encodeURIComponent(`Venha participar! ${link}`)}`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">WhatsApp</a>
        <a href={`https://instagram.com`} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">Instagram</a>
      </div>
    </div>
  );
}

export default function CircleFeed() {
  const { user } = useAuth();
  const { slug: communitySlug, spaceSlug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [showCompose, setShowCompose] = useState(false);
  const [filter, setFilter] = useState<"default" | "new" | "top" | "unread">("default");
  const [activeSpaceId, setActiveSpaceId] = useState<string>("all");
  const [showLiveForm, setShowLiveForm] = useState(false);
  const [watchingStream, setWatchingStream] = useState<any>(null);
  const [showInviteFromChecklist, setShowInviteFromChecklist] = useState(false);
  const [editingStream, setEditingStream] = useState<any>(null);

  // Post modal state — support both ?post=id (legacy) and direct open via prop/state
  const [activePostId, setActivePostId] = useState<string | null>(searchParams.get("post"));

  // Sync from search params on mount (for legacy ?post= links and redirects)
  useEffect(() => {
    const qp = searchParams.get("post");
    if (qp) {
      setActivePostId(qp);
      // Clean the query param and switch to clean URL
      setSearchParams((prev) => { const next = new URLSearchParams(prev); next.delete("post"); return next; }, { replace: true });
      window.history.replaceState(null, "", `/circles/${communitySlug}/post/${qp}`);
    }
  }, [searchParams, communitySlug, setSearchParams]);

  const handleOpenPost = useCallback((postId: string) => {
    setActivePostId(postId);
    window.history.pushState(null, "", `/circles/${communitySlug}/post/${postId}`);
  }, [communitySlug]);

  const handleClosePost = useCallback(() => {
    setActivePostId(null);
    window.history.pushState(null, "", `/circles/${communitySlug}/feed`);
  }, [communitySlug]);

  const { data: community } = useQuery({
    queryKey: ["community-slug", communitySlug],
    queryFn: async () => {
      if (!communitySlug) return null;
      const { data } = await supabase
        .from("communities").select("*")
        .eq("slug", communitySlug).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!communitySlug,
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

      if (filter === "top") {
        query = query.order("like_count", { ascending: false });
      } else if (filter === "new") {
        query = query.order("created_at", { ascending: false });
      } else {
        // "default" and "unread" — pinned first + recent
        query = query.order("is_pinned", { ascending: false }).order("created_at", { ascending: false });
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

  // Fetch all reactions for current feed posts (grouped by post + emoji + user)
  const { data: allReactions } = useQuery({
    queryKey: ["circle-reactions-multi", community?.id, member?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("community_reactions")
        .select("post_id, emoji, member_id")
        .not("post_id", "is", null)
        .in("post_id", (posts || []).map((p: any) => p.id));
      return data || [];
    },
    enabled: !!community && !!posts && posts.length > 0,
  });

  // Build grouped reactions per post
  const getPostReactions = (postId: string) => {
    if (!allReactions) return [];
    const postReacts = allReactions.filter((r: any) => r.post_id === postId);
    const grouped: Record<string, { count: number; reacted: boolean }> = {};
    for (const r of postReacts) {
      if (!grouped[r.emoji]) grouped[r.emoji] = { count: 0, reacted: false };
      grouped[r.emoji].count++;
      if (r.member_id === member?.id) grouped[r.emoji].reacted = true;
    }
    return Object.entries(grouped).map(([emoji, data]) => ({ emoji, ...data }));
  };

  // Legacy compat: check if user has any reaction on a post
  const userReactions = allReactions
    ?.filter((r: any) => r.member_id === member?.id)
    .map((r: any) => r.post_id) || [];

  const isMuted = member?.status === "MUTED";
  const isAdminMember = member?.role === "OWNER" || member?.role === "ADMIN" || member?.role === "MODERATOR";

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
                   <AvatarImage src={member?.avatar_url || undefined} />
                   <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">
                     {(member?.display_name || user?.email || "U").charAt(0).toUpperCase()}
                   </AvatarFallback>
                 </Avatar>
                 <div className="flex-1 rounded-xl bg-muted/40 px-4 py-2.5">
                   <span className="text-muted-foreground text-sm">Escreva algo...</span>
                 </div>
                 {isAdminMember && (
                   <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowLiveForm(true);
                    }}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0 px-3 py-1.5 rounded-lg hover:bg-muted/50"
                  >
                    <Video className="h-4 w-4" />
                    <span className="hidden sm:inline">Ao vivo</span>
                  </button>
                 )}
               </div>
             </Card>
           ) : community && member && (
            <PostComposer
              communityId={community.id}
              communityName={community.name}
              memberId={member.id}
              memberPoints={member.total_points || 0}
              memberAvatarUrl={member.avatar_url || undefined}
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
            {" "}acontece em {formatDistanceToNow(new Date(nextEvent.starts_at), { locale: ptBR })}
          </span>
        </div>
      )}

      {/* Live stream banner */}
      {community && (
        <LiveStreamBanner
          communityId={community.id}
          onWatch={(stream) => setWatchingStream(stream)}
          isAdmin={isAdminMember}
          onCreateLive={() => setShowLiveForm(true)}
          onEdit={(stream) => { setEditingStream(stream); setShowLiveForm(true); }}
        />
      )}

      {/* Category pills + filter */}
      <div className="flex items-center gap-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide items-center flex-1 min-w-0">
          <button
            onClick={() => setActiveSpaceId("all")}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
              !effectiveSpaceId
                ? "text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            style={!effectiveSpaceId ? { backgroundColor: "#111827" } : { backgroundColor: "#F3F4F6" }}
          >
            Todas
          </button>
          {(spaces || []).slice(0, 5).map((space: any) => (
            <button
              key={space.id}
              onClick={() => setActiveSpaceId(space.id)}
              className={cn(
                "shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap",
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
                  className="shrink-0 px-3 py-1.5 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: "#F3F4F6" }}
                >
                  Mais... <ChevronDown className="h-3 w-3" />
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
            <DropdownMenuItem onClick={() => setFilter("default")} className={cn(filter === "default" && "font-semibold")}>
              Padrão
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("new")} className={cn(filter === "new" && "font-semibold")}>
              Novos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("top")} className={cn(filter === "top" && "font-semibold")}>
              Top
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setFilter("unread")} className={cn(filter === "unread" && "font-semibold")}>
              Não lidos
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Admin setup checklist — only for OWNER/ADMIN */}
      {isAdminMember && community && member && communitySlug && (
        <AdminSetupChecklist
          community={community}
          member={member}
          slug={communitySlug}
          onOpenComposer={() => setShowCompose(true)}
          onOpenInvite={() => setShowInviteFromChecklist(true)}
        />
      )}

      {/* Member welcome card — only for non-admin members */}
      {!isAdminMember && community && member && communitySlug && (
        <MemberWelcomeCard
          communityId={community.id}
          memberId={member.id}
          slug={communitySlug}
        />
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
          <h3 className="font-semibold text-foreground">Ainda não há posts</h3>
          <p className="text-sm text-muted-foreground mt-1">Seja o primeiro a compartilhar algo! 🎉</p>
          {!showCompose && !isMuted && canPost && (
            <Button className="mt-4" onClick={() => setShowCompose(true)}>Criar post</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {posts?.map((post: any) => (
            <PostCard
              key={post.id}
              post={post}
              liked={userReactions?.includes(post.id) || false}
              onToggleLike={() => {}}
              isMuted={isMuted}
              showSpace={!effectiveSpaceId}
              communityId={community?.id}
              memberId={member?.id}
              memberRole={member?.role}
              reactions={getPostReactions(post.id)}
              onOpenPost={handleOpenPost}
              onDeletePost={async (id) => {
                const { data, error } = await supabase.rpc("soft_delete_post", { p_post_id: id });
                if (error || !data) {
                  toast.error("Erro ao excluir post");
                  return;
                }
                queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
                toast.success("Post excluído");
              }}
            />
          ))}
        </div>
      )}

      {/* Post detail modal */}
      {activePostId && (
        <PostDetailModal
          postId={activePostId}
          open={!!activePostId}
          onClose={handleClosePost}
        />
      )}

      {/* Live stream form modal */}
      {community && member && (
        <LiveStreamFormModal
          open={showLiveForm}
          onOpenChange={(open) => { setShowLiveForm(open); if (!open) setEditingStream(null); }}
          communityId={community.id}
          memberId={member.id}
          stream={editingStream}
        />
      )}

      {/* Live stream viewer */}
      <LiveStreamViewer
        stream={watchingStream}
        open={!!watchingStream}
        onClose={() => setWatchingStream(null)}
        memberId={member?.id}
        memberName={member?.display_name}
        memberAvatar={member?.avatar_url}
        isAdmin={isAdminMember}
        onEdit={(stream) => { setWatchingStream(null); setEditingStream(stream); setShowLiveForm(true); }}
      />

      {/* Invite modal triggered from admin checklist */}
      {community && (
        <Dialog open={showInviteFromChecklist} onOpenChange={setShowInviteFromChecklist}>
          <DialogContent className="sm:max-w-md p-6">
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="text-xl font-bold text-foreground">Convidar pessoas</DialogTitle>
              <p className="text-sm text-muted-foreground">
                Convide seus amigos para <span className="font-medium text-foreground">{community.name}</span>
              </p>
            </DialogHeader>
            <InviteDialogBody slug={communitySlug || community.slug} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
