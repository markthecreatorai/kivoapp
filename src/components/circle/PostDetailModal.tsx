import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ThumbsUp, MessageCircle, Pin, Lock, Trash2, Link2,
  MoreHorizontal, Bell, ArrowRightLeft, ChevronDown,
  ChevronUp, ChevronLeft, ChevronRight, Paperclip, Video,
  Smile, Send, ArrowDown, Flag,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import { createNotification } from "@/lib/notifications";
import { checkSpam } from "@/lib/antispam";
import EmojiPicker from "@/components/circle/EmojiPicker";
import GifPicker from "@/components/circle/GifPicker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X as XIcon, Image as ImageIcon } from "lucide-react";

interface PostDetailModalProps {
  postId: string;
  open: boolean;
  onClose: () => void;
}

/* ── Helpers ─────────────────────────────────────── */

const ROLE_LABEL: Record<string, string> = { OWNER: "Creator", ADMIN: "Admin", MODERATOR: "Mod" };

function getVideoEmbed(url: string | null) {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim) return `https://player.vimeo.com/video/${vim[1]}`;
  const loom = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

/* ── Render @mentions as styled spans ── */
const renderMentions = (text: string) => {
  const parts = text.split(/(@\S+)/g);
  return parts.map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="text-primary font-semibold">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

/* ── Main Component ──────────────────────────────── */

export default function PostDetailModal({ postId, open, onClose }: PostDetailModalProps) {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const { slug: communitySlug } = useParams();
  const queryClient = useQueryClient();

  const scrollRef = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const [showJumpBtn, setShowJumpBtn] = useState(false);
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);
  const [bodyExpanded, setBodyExpanded] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [isNotified, setIsNotified] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [commentImages, setCommentImages] = useState<string[]>([]);
  const commentImageRef = useRef<HTMLInputElement>(null);

  /* ── Queries ─────── */
  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).single();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const { data: post, isLoading } = useQuery({
    queryKey: ["circle-post", postId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_posts")
        .select(`*, author:community_members!author_id(id, display_name, avatar_url, level, role, total_points, user_id), space:community_spaces!space_id(id, name, emoji, slug)`)
        .eq("id", postId)
        .single();
      if (data) supabase.from("community_posts").update({ view_count: (data.view_count || 0) + 1 }).eq("id", postId).then(() => {});
      return data;
    },
    enabled: !!postId && open,
  });

  const { data: comments } = useQuery({
    queryKey: ["circle-comments", postId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_comments")
        .select(`*, author:community_members!author_id(id, display_name, avatar_url, level, role, total_points)`)
        .eq("post_id", postId).is("deleted_at", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!postId && open,
  });

  const { data: userReactions } = useQuery({
    queryKey: ["circle-post-reactions", member?.id, postId],
    queryFn: async () => {
      if (!member) return { postLiked: false, commentLikes: [] as string[] };
      const { data: pr } = await supabase.from("community_reactions").select("id").eq("member_id", member.id).eq("post_id", postId).maybeSingle();
      const { data: cr } = await supabase.from("community_reactions").select("comment_id").eq("member_id", member.id).not("comment_id", "is", null);
      return { postLiked: !!pr, commentLikes: cr?.map((r: any) => r.comment_id) || [] };
    },
    enabled: !!member && !!postId && open,
  });

  const { data: pollVotes } = useQuery({
    queryKey: ["circle-poll-votes", postId, member?.id],
    queryFn: async () => {
      if (!member) return { userVotes: [] as string[], allVotes: [] as any[] };
      const { data: uv } = await supabase.from("community_poll_votes").select("option_id").eq("post_id", postId).eq("member_id", member.id);
      const { data: av } = await supabase.from("community_poll_votes").select("option_id").eq("post_id", postId);
      return { userVotes: uv?.map((v: any) => v.option_id) || [], allVotes: av || [] };
    },
    enabled: !!member && !!postId && open && post?.post_type === "POLL",
  });

  const { data: spaces } = useQuery({
    queryKey: ["circle-spaces", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase.from("community_spaces").select("id, name, emoji, slug").eq("community_id", community.id).order("position");
      return data || [];
    },
    enabled: !!community,
  });

  /* ── Derived state ─── */
  const isMuted = member?.status === "MUTED";
  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN" || member?.role === "MODERATOR";
  const isAuthor = post?.author?.user_id === user?.id;
  const totalPollVotes = pollVotes?.allVotes.length || 0;
  const getVoteCount = (oid: string) => pollVotes?.allVotes.filter((v: any) => v.option_id === oid).length || 0;
  const videoEmbed = post ? getVideoEmbed(post.video_url) : null;
  const images = (post?.images as string[]) || [];
  const allMedia = [...images, ...(videoEmbed ? [videoEmbed] : [])];
  const topComments = (comments || []).filter((c: any) => !c.parent_id);
  const getReplies = (pid: string) => (comments || []).filter((c: any) => c.parent_id === pid);

  /* ── Scroll handling for jump button ─── */
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpBtn(distFromBottom > 300 && topComments.length > 3);
  }, [topComments.length]);

  const jumpToLatest = () => {
    commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  /* ── Mutations ─────── */
  const togglePostLike = useMutation({
    mutationFn: async () => {
      if (!member || !community) throw new Error("Missing");
      if (userReactions?.postLiked) {
        await supabase.from("community_reactions").delete().eq("member_id", member.id).eq("post_id", postId);
      } else {
        await supabase.from("community_reactions").insert({ member_id: member.id, post_id: postId, emoji: "❤️" });
        if (post?.author_id !== member.id) {
          await supabase.from("community_points_log").insert({
            community_id: community.id, member_id: post?.author_id, action: "LIKE_RECEIVED",
            points: community.points_per_like_received, reference_id: postId, reference_type: "post", description: "Recebeu um like",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-post-reactions"] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
      queryClient.invalidateQueries({ queryKey: ["circle-reactions"] });
      if (!userReactions?.postLiked && post?.author_id && member && community) {
        createNotification({ communityId: community.id, recipientId: post.author_id, actorId: member.id, type: "POST_LIKE", title: `${member.display_name || "Alguém"} curtiu seu post`, body: post.title, postId });
      }
    },
  });

  const pinPost = useMutation({
    mutationFn: async () => { await supabase.from("community_posts").update({ is_pinned: !post?.is_pinned }).eq("id", postId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-post", postId] }); queryClient.invalidateQueries({ queryKey: ["circle-posts"] }); toast.success(post?.is_pinned ? "Post desfixado" : "Post fixado"); },
  });

  const lockPost = useMutation({
    mutationFn: async () => { await supabase.from("community_posts").update({ is_locked: !post?.is_locked }).eq("id", postId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-post", postId] }); toast.success(post?.is_locked ? "Comentários liberados" : "Comentários bloqueados"); },
  });

  const deletePost = useMutation({
    mutationFn: async () => { await supabase.from("community_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId); },
    onSuccess: () => { toast.success("Post excluído"); queryClient.invalidateQueries({ queryKey: ["circle-posts"] }); onClose(); },
  });

  const movePost = useMutation({
    mutationFn: async (spaceId: string) => { await supabase.from("community_posts").update({ space_id: spaceId }).eq("id", postId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-post", postId] }); queryClient.invalidateQueries({ queryKey: ["circle-posts"] }); toast.success("Post movido!"); },
  });

  const votePoll = useMutation({
    mutationFn: async (optionId: string) => {
      if (!member) throw new Error("Missing");
      if (pollVotes?.userVotes.includes(optionId)) return;
      await supabase.from("community_poll_votes").insert({ post_id: postId, member_id: member.id, option_id: optionId });
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-poll-votes"] }); toast.success("Voto registrado!"); },
  });

  const addComment = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string }) => {
      if (!member || !community) throw new Error("Missing");
      const spam = await checkSpam(member.id, community.id, "comment", body.trim());
      if (!spam.allowed) throw new Error(spam.reason || "Spam detectado");
      const insertImages = parentId ? undefined : (commentImages.length > 0 ? commentImages : undefined);
      const { data: comment, error } = await supabase.from("community_comments").insert({ post_id: postId, author_id: member.id, body: body.trim(), parent_id: parentId || null, ...(insertImages ? { images: insertImages } : {}) }).select().single();
      if (error) throw error;
      await supabase.from("community_points_log").insert({ community_id: community.id, member_id: member.id, action: "COMMENT_CREATED", points: community.points_per_comment, reference_id: comment.id, reference_type: "comment", description: "Comentou em um post" });
      await supabase.from("community_members").update({ total_points: (member.total_points || 0) + community.points_per_comment, last_active_at: new Date().toISOString() }).eq("id", member.id);
      return comment;
    },
    onSuccess: (comment, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      setCommentBody(""); setReplyTo(null); setReplyBody(""); setCommentImages([]); setShowEmojiPicker(false); setShowGifPicker(false);
      toast.success(`Comentário publicado! +${community?.points_per_comment || 1} pt`);
      // Notifications
      if (parentId) {
        const parent = comments?.find((c: any) => c.id === parentId);
        if (parent && parent.author_id !== member?.id && community && member) {
          createNotification({ communityId: community.id, recipientId: parent.author_id, actorId: member.id, type: "COMMENT_REPLY", title: `${member.display_name || "Alguém"} respondeu ao seu comentário`, body: post?.title || "", postId, commentId: comment?.id });
        }
      } else if (post?.author_id && post.author_id !== member?.id && community && member) {
        createNotification({ communityId: community.id, recipientId: post.author_id, actorId: member.id, type: "POST_REPLY", title: `${member.display_name || "Alguém"} comentou no seu post`, body: post.title, postId, commentId: comment?.id });
      }
      // Auto-scroll to bottom
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: "smooth" }), 200);
    },
    onError: () => toast.error("Erro ao comentar"),
  });

  const toggleCommentLike = useMutation({
    mutationFn: async (commentId: string) => {
      if (!member) throw new Error("Missing");
      const liked = userReactions?.commentLikes.includes(commentId);
      if (liked) await supabase.from("community_reactions").delete().eq("member_id", member.id).eq("comment_id", commentId);
      else await supabase.from("community_reactions").insert({ member_id: member.id, comment_id: commentId, emoji: "❤️" });
    },
    onSuccess: (_, commentId) => {
      queryClient.invalidateQueries({ queryKey: ["circle-post-reactions"] });
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      const liked = userReactions?.commentLikes.includes(commentId);
      if (!liked) {
        const c = comments?.find((x: any) => x.id === commentId);
        if (c && c.author_id !== member?.id && community && member) {
          createNotification({ communityId: community.id, recipientId: c.author_id, actorId: member.id, type: "COMMENT_LIKE", title: `${member.display_name || "Alguém"} curtiu seu comentário`, body: post?.title || "", postId, commentId });
        }
      }
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => { await supabase.from("community_comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] }); queryClient.invalidateQueries({ queryKey: ["circle-post", postId] }); toast.success("Comentário removido"); },
  });

  const handleCommentKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (commentBody.trim() || commentImages.length > 0) addComment.mutate({ body: commentBody || "📷" });
    }
  };

  const handleReplyKeyDown = (e: React.KeyboardEvent, parentId: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (replyBody.trim()) addComment.mutate({ body: replyBody, parentId });
    }
  };

  /* ── Body truncation ─── */
  const bodyHtml = post?.body
    ? post.body.startsWith("<") ? post.body : `<p>${post.body.replace(/\n/g, "<br/>")}</p>`
    : "";
  const isLongBody = (post?.body || "").length > 600;

  /* ── Render ─────────────────────────────────────── */
  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
        {/* Custom overlay — rgba(0,0,0,0.5) per Skool spec */}
        <DialogContent
          className="max-w-[570px] w-full p-0 gap-0 flex flex-col border-0 rounded-xl bg-background shadow-xl"
          style={{ maxHeight: "90vh" }}
          overlayClassName="bg-black/50"
        >
          <VisuallyHidden><DialogTitle>Post detail</DialogTitle></VisuallyHidden>

          {isLoading ? (
            <div className="flex items-center justify-center min-h-[200px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : !post ? (
            <div className="p-6 text-center text-muted-foreground">Post não encontrado.</div>
          ) : (
            <>
              {/* ═══ FIXED HEADER ═══ */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border shrink-0">
                {/* Avatar with level badge */}
                <div className="relative shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={post.author?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm font-medium">
                      {(post.author?.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-1 -right-1">
                    <LevelBadge points={post.author?.total_points || 0} size="sm" />
                  </div>
                </div>

                {/* Author info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap leading-tight">
                    <span className="text-[14px] font-semibold text-foreground cursor-pointer hover:underline">
                      {post.author?.display_name || "Membro"}
                    </span>
                    {ROLE_LABEL[post.author?.role] && (
                      <Badge
                        className={cn(
                          "text-[10px] h-4 px-1.5 border-0",
                          post.author.role === "OWNER"
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {ROLE_LABEL[post.author.role]}
                      </Badge>
                    )}
                    <span className="text-[13px] text-muted-foreground">
                      · {formatDistanceToNow(new Date(post.created_at), { addSuffix: false, locale: ptBR })}
                    </span>
                    {post.space && (
                      <span className="text-xs text-muted-foreground">
                        · em {post.space.emoji} {post.space.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Header actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={async () => {
                      if (!member || !community) return;
                      const next = !isNotified;
                      setIsNotified(next);
                      if (next) {
                        await supabase.from("community_post_subscriptions" as any).upsert({ post_id: postId, member_id: member.id } as any, { onConflict: "post_id,member_id" });
                      } else {
                        await supabase.from("community_post_subscriptions" as any).delete().eq("post_id", postId).eq("member_id", member.id);
                      }
                      toast.success(next ? "Notificações ativadas para este post" : "Notificações desativadas");
                    }}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                  >
                    {isNotified ? <Bell className="h-4 w-4 fill-current text-primary" /> : <Bell className="h-4 w-4" />}
                  </button>

                  {(isAdmin || isAuthor) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {isAdmin && (
                          <>
                            <DropdownMenuItem onClick={() => pinPost.mutate()}>
                              <Pin className="h-3.5 w-3.5 mr-2" />{post.is_pinned ? "Desfixar" : "Fixar"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => lockPost.mutate()}>
                              <Lock className="h-3.5 w-3.5 mr-2" />{post.is_locked ? "Desbloquear comentários" : "Bloquear comentários"}
                            </DropdownMenuItem>
                            {spaces && spaces.length > 1 && (
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger><ArrowRightLeft className="h-3.5 w-3.5 mr-2" />Mover</DropdownMenuSubTrigger>
                                <DropdownMenuSubContent>
                                  {spaces.filter((s: any) => s.id !== post.space_id).map((s: any) => (
                                    <DropdownMenuItem key={s.id} onClick={() => movePost.mutate(s.id)}>{s.emoji} {s.name}</DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}
                        <DropdownMenuItem onClick={() => {
                          const url = `${window.location.origin}/c/${communitySlug}/post/${postId}`;
                          navigator.clipboard.writeText(url); toast.success("Link copiado!");
                        }}>
                          <Link2 className="h-3.5 w-3.5 mr-2" />Copiar link
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Excluir este post?")) deletePost.mutate(); }}>
                          <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {!isAdmin && !isAuthor && member && community && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          supabase.from("community_reports" as any).insert({ community_id: community.id, reporter_id: member.id, post_id: postId, target_member_id: post.author_id, reason: "spam", status: "PENDING" } as any).then(({ error }) => { if (!error) toast.success("Denúncia enviada"); });
                        }}>
                          <Flag className="h-3.5 w-3.5 mr-2" />Denunciar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          const url = `${window.location.origin}/c/${communitySlug}/post/${postId}`;
                          navigator.clipboard.writeText(url); toast.success("Link copiado!");
                        }}>
                          <Link2 className="h-3.5 w-3.5 mr-2" />Copiar link
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>

              {/* ═══ SCROLLABLE BODY ═══ */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto" onScroll={handleScroll}>
                <div className="px-5 py-4 space-y-4">
                  {/* Title */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-lg font-bold text-foreground leading-snug">{post.title}</h1>
                    {post.is_pinned && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium">
                        📌 Fixado
                      </span>
                    )}
                    {post.is_locked && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>

                  {/* Body with "Ver mais" */}
                  {post.body && (
                    <div className="relative">
                      <div
                        className={cn("text-sm text-foreground prose prose-sm max-w-none dark:prose-invert", !bodyExpanded && isLongBody && "max-h-[200px] overflow-hidden")}
                        dangerouslySetInnerHTML={{ __html: bodyHtml }}
                      />
                      {isLongBody && !bodyExpanded && (
                        <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-background to-transparent" />
                      )}
                      {isLongBody && (
                        <button onClick={() => setBodyExpanded(!bodyExpanded)} className="text-sm font-medium text-primary hover:underline mt-1">
                          {bodyExpanded ? "Ver menos" : "Ver mais"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Media gallery */}
                  {allMedia.length > 0 && (
                    <div className="relative rounded-lg overflow-hidden border border-border">
                      {allMedia[mediaIndex]?.startsWith("https://www.youtube.com") || allMedia[mediaIndex]?.startsWith("https://player.vimeo.com") || allMedia[mediaIndex]?.startsWith("https://www.loom.com") ? (
                        <div className="aspect-video">
                          <iframe src={allMedia[mediaIndex]} className="w-full h-full" allowFullScreen />
                        </div>
                      ) : (
                        <img
                          src={allMedia[mediaIndex]}
                          alt=""
                          className="w-full max-h-[400px] object-contain bg-muted/30 cursor-pointer"
                          onClick={() => setLightboxImg(allMedia[mediaIndex])}
                        />
                      )}
                      {allMedia.length > 1 && (
                        <>
                          <button onClick={() => setMediaIndex((p) => Math.max(0, p - 1))} disabled={mediaIndex === 0}
                            className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition disabled:opacity-30">
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <button onClick={() => setMediaIndex((p) => Math.min(allMedia.length - 1, p + 1))} disabled={mediaIndex === allMedia.length - 1}
                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition disabled:opacity-30">
                            <ChevronRight className="h-4 w-4" />
                          </button>
                          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                            {allMedia.map((_, i) => (
                              <div key={i} className={cn("h-1.5 w-1.5 rounded-full transition-colors", i === mediaIndex ? "bg-foreground" : "bg-foreground/30")} />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Link preview */}
                  {post.link_url && !videoEmbed && (
                    <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="block p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 text-sm">
                        <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-primary truncate">{post.link_url}</span>
                      </div>
                    </a>
                  )}

                  {/* Poll */}
                  {post.post_type === "POLL" && post.poll_options && (
                    <div className="space-y-2">
                      {(post.poll_options as any[]).map((opt: any) => {
                        const count = getVoteCount(opt.id);
                        const pct = totalPollVotes > 0 ? Math.round((count / totalPollVotes) * 100) : 0;
                        const voted = pollVotes?.userVotes.includes(opt.id);
                        return (
                          <button key={opt.id} onClick={() => !isMuted && votePoll.mutate(opt.id)} disabled={isMuted || !!voted}
                            className={cn("w-full text-left p-3 rounded-lg border transition-colors relative overflow-hidden", voted ? "border-primary bg-primary/5" : "border-border hover:border-primary/40")}>
                            <div className="absolute inset-y-0 left-0 bg-primary/10 transition-all" style={{ width: `${pct}%` }} />
                            <div className="relative flex justify-between items-center">
                              <span className="text-sm font-medium">{opt.text}</span>
                              <span className="text-xs text-muted-foreground">{pct}% ({count})</span>
                            </div>
                          </button>
                        );
                      })}
                      <p className="text-xs text-muted-foreground text-center">{totalPollVotes} votos</p>
                    </div>
                  )}
                </div>

                {/* ═══ ACTION BAR ═══ */}
                <div className="px-5 py-3 border-y border-border flex items-center gap-4">
                  <button onClick={() => !isMuted && togglePostLike.mutate()} disabled={isMuted}
                    className={cn("flex items-center gap-1.5 text-sm font-medium transition-all", userReactions?.postLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}>
                    <ThumbsUp className={cn("h-4 w-4", userReactions?.postLiked && "fill-current")} />
                    {post.like_count > 0 && <span>{post.like_count}</span>}
                  </button>
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MessageCircle className="h-4 w-4" />
                    {topComments.length} {topComments.length === 1 ? "comentário" : "comentários"}
                  </span>
                  <button onClick={() => {
                    const url = `${window.location.origin}/c/${communitySlug}/post/${postId}`;
                    navigator.clipboard.writeText(url); toast.success("Link copiado!");
                  }}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto">
                    <Link2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* ═══ COMMENTS SECTION ═══ */}
                <div className="px-5 py-4 divide-y divide-border/50">
                  {post.is_locked && (
                    <p className="text-center text-sm text-muted-foreground py-2">🔒 Comentários bloqueados neste post.</p>
                  )}

                  {topComments.map((comment: any) => {
                    const cLiked = userReactions?.commentLikes.includes(comment.id);
                    const replies = getReplies(comment.id);
                    const isExpanded = expandedReplies.has(comment.id);
                    const visibleReplies = isExpanded ? replies : replies.slice(0, 2);
                    const hiddenCount = replies.length - 2;

                    return (
                      <div key={comment.id} className="group/comment py-3 first:pt-0">
                        {/* Top-level comment */}
                        <div className="flex gap-3 rounded-lg p-2 hover:bg-muted/20 transition-colors">
                          <div className="relative shrink-0">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={comment.author?.avatar_url || undefined} />
                              <AvatarFallback className="bg-muted text-muted-foreground text-[10px] font-medium">
                                {(comment.author?.display_name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="absolute -bottom-0.5 -right-0.5">
                              <LevelBadge points={comment.author?.total_points || 0} size="sm" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-foreground cursor-pointer hover:underline">
                                {comment.author?.display_name || "Membro"}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                · {formatDistanceToNow(new Date(comment.created_at), { addSuffix: false, locale: ptBR })}
                              </span>
                              {comment.edited_at && <span className="text-[10px] text-muted-foreground">(editado)</span>}

                              {/* Three dots on hover */}
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button className="ml-auto p-1 rounded opacity-0 group-hover/comment:opacity-100 hover:bg-muted transition-all text-muted-foreground hover:text-foreground">
                                    <MoreHorizontal className="h-3.5 w-3.5" />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {comment.author_id === member?.id && (
                                    <DropdownMenuItem onClick={() => {
                                      const newBody = prompt("Editar comentário:", comment.body);
                                      if (newBody?.trim()) {
                                        supabase.from("community_comments").update({ body: newBody.trim(), edited_at: new Date().toISOString() }).eq("id", comment.id).then(() => {
                                          queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] }); toast.success("Editado");
                                        });
                                      }
                                    }}>✏️ Editar</DropdownMenuItem>
                                  )}
                                  {(isAdmin || comment.author_id === member?.id) && (
                                    <DropdownMenuItem className="text-destructive" onClick={() => deleteComment.mutate(comment.id)}>
                                      <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                                    </DropdownMenuItem>
                                  )}
                                  {comment.author_id !== member?.id && member && community && (
                                    <DropdownMenuItem onClick={() => {
                                      supabase.from("community_reports" as any).insert({ community_id: community.id, reporter_id: member.id, comment_id: comment.id, target_member_id: comment.author_id, reason: "spam", status: "PENDING" } as any).then(({ error }) => { if (!error) toast.success("Denúncia enviada"); });
                                    }}>
                                      <Flag className="h-3.5 w-3.5 mr-2" />Denunciar
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>

                            <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{renderMentions(comment.body)}</p>

                            {/* Comment images */}
                            {comment.images && (comment.images as string[]).length > 0 && (
                              <div className="mt-2 flex gap-2">
                                {(comment.images as string[]).map((url: string, i: number) => (
                                  <img key={i} src={url} alt="" className="max-h-32 rounded-lg object-cover border border-border cursor-pointer" onClick={() => setLightboxImg(url)} />
                                ))}
                              </div>
                            )}

                            <div className="flex items-center gap-3 mt-2">
                              <button onClick={() => !isMuted && toggleCommentLike.mutate(comment.id)} disabled={isMuted}
                                className={cn("flex items-center gap-1 text-xs transition-all", cLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}>
                                <ThumbsUp className={cn("h-3.5 w-3.5", cLiked && "fill-current")} />
                                {comment.like_count > 0 && <span>{comment.like_count}</span>}
                              </button>
                              {!post.is_locked && !isMuted && (
                                <button onClick={() => {
                                  if (replyTo === comment.id) {
                                    setReplyTo(null);
                                    setReplyBody("");
                                  } else {
                                    setReplyTo(comment.id);
                                    setReplyBody(`@${comment.author?.display_name || "Membro"} `);
                                  }
                                }}
                                  className="text-xs font-medium text-muted-foreground hover:text-foreground">
                                  Responder
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Reply input */}
                        {replyTo === comment.id && (
                          <div className="mt-2 ml-11 flex gap-2 items-start">
                            <Avatar className="h-6 w-6 shrink-0">
                              <AvatarImage src={member?.avatar_url || undefined} />
                              <AvatarFallback className="bg-muted text-muted-foreground text-[9px]">
                                {(member?.display_name || "U").charAt(0).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 flex items-center gap-2 border border-border rounded-full px-3 py-1.5 focus-within:border-primary/50 transition-colors">
                              <input
                                type="text"
                                value={replyBody}
                                onChange={(e) => setReplyBody(e.target.value)}
                                onKeyDown={(e) => handleReplyKeyDown(e, comment.id)}
                                placeholder="Escreva uma resposta..."
                                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                                autoFocus
                              />
                              <button onClick={() => replyBody.trim() && addComment.mutate({ body: replyBody, parentId: comment.id })} disabled={!replyBody.trim() || addComment.isPending}
                                className="text-primary hover:text-primary/80 disabled:opacity-30 transition-opacity">
                                <Send className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Nested replies */}
                        {replies.length > 0 && (
                          <div className="ml-11 mt-3 space-y-2 pl-4 border-l-2 border-border/30">
                            {visibleReplies.map((reply: any) => {
                              const rLiked = userReactions?.commentLikes.includes(reply.id);
                              return (
                                <div key={reply.id} className="flex gap-2.5 group/reply rounded-lg p-2 bg-muted/30">
                                  <div className="relative shrink-0">
                                    <Avatar className="h-6 w-6">
                                      <AvatarImage src={reply.author?.avatar_url || undefined} />
                                      <AvatarFallback className="bg-muted text-muted-foreground text-[9px]">
                                        {(reply.author?.display_name || "U").charAt(0).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-medium text-xs text-foreground">{reply.author?.display_name || "Membro"}</span>
                                      <span className="text-[10px] text-muted-foreground">
                                        · {formatDistanceToNow(new Date(reply.created_at), { addSuffix: false, locale: ptBR })}
                                      </span>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <button className="ml-auto p-0.5 rounded opacity-0 group-hover/reply:opacity-100 hover:bg-muted transition-all text-muted-foreground">
                                            <MoreHorizontal className="h-3 w-3" />
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          {(isAdmin || reply.author_id === member?.id) && (
                                            <DropdownMenuItem className="text-destructive" onClick={() => deleteComment.mutate(reply.id)}>
                                              <Trash2 className="h-3 w-3 mr-2" />Excluir
                                            </DropdownMenuItem>
                                          )}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                    <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{reply.body}</p>
                                    <div className="flex items-center gap-3 mt-1">
                                      <button onClick={() => !isMuted && toggleCommentLike.mutate(reply.id)} disabled={isMuted}
                                        className={cn("flex items-center gap-1 text-[10px]", rLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}>
                                        <ThumbsUp className={cn("h-3 w-3", rLiked && "fill-current")} />
                                        {reply.like_count > 0 && <span>{reply.like_count}</span>}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            {hiddenCount > 0 && (
                              <button onClick={() => {
                                const next = new Set(expandedReplies);
                                if (next.has(comment.id)) next.delete(comment.id); else next.add(comment.id);
                                setExpandedReplies(next);
                              }} className="flex items-center gap-1.5 text-xs text-primary hover:underline pl-2">
                                <span className="text-primary">↩</span>
                                {isExpanded ? "Ocultar respostas" : `Ver ${hiddenCount} mais ${hiddenCount === 1 ? "resposta" : "respostas"}`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  <div ref={commentsEndRef} />
                </div>
              </div>

              {/* ═══ JUMP TO LATEST BUTTON ═══ */}
              {showJumpBtn && (
                <button onClick={jumpToLatest}
                  className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-4 py-2 rounded-full bg-foreground text-background text-xs font-medium shadow-lg hover:opacity-90 transition-opacity">
                  <ArrowDown className="h-3.5 w-3.5" />
                  Ir para o último comentário
                </button>
              )}

              {/* ═══ STICKY COMMENT INPUT ═══ */}
              {!post.is_locked && !isMuted && member && (
                <div className="border-t border-border px-4 py-3 shrink-0 bg-background">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={member?.avatar_url || undefined} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs font-medium">
                        {(member?.display_name || "U").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 flex flex-col gap-2">
                      {/* Image previews */}
                      {commentImages.length > 0 && (
                        <div className="flex gap-2 flex-wrap px-1">
                          {commentImages.map((img, i) => (
                            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border">
                              <img src={img} alt="" className="w-full h-full object-cover" />
                              <button
                                onClick={() => setCommentImages((prev) => prev.filter((_, idx) => idx !== i))}
                                className="absolute top-0.5 right-0.5 bg-foreground/60 text-background rounded-full p-0.5"
                              >
                                <XIcon className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2 border border-border rounded-full px-4 py-2 focus-within:border-primary/50 transition-colors">
                        <input
                          type="text"
                          value={commentBody}
                          onChange={(e) => setCommentBody(e.target.value)}
                          onKeyDown={handleCommentKeyDown}
                          placeholder="Seu comentário..."
                          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                        />
                        <div className="flex items-center gap-1 text-muted-foreground">
                          {/* Image upload */}
                          <input
                            ref={commentImageRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
                              const reader = new FileReader();
                              reader.onload = () => {
                                if (reader.result) setCommentImages((prev) => [...prev, reader.result as string]);
                              };
                              reader.readAsDataURL(file);
                              e.target.value = "";
                            }}
                          />
                          <button className="p-1 hover:text-foreground transition-colors" onClick={() => commentImageRef.current?.click()}>
                            <Paperclip className="h-3.5 w-3.5" />
                          </button>




                          {/* Emoji picker */}
                          <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                            <PopoverTrigger asChild>
                              <button className="p-1 hover:text-foreground transition-colors">
                                <Smile className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[280px] p-0" align="end" side="top">
                              <EmojiPicker onSelect={(emoji) => {
                                setCommentBody((prev) => prev + emoji);
                                setShowEmojiPicker(false);
                              }} />
                            </PopoverContent>
                          </Popover>

                          {/* GIF picker */}
                          <Popover open={showGifPicker} onOpenChange={setShowGifPicker}>
                            <PopoverTrigger asChild>
                              <button className="p-1 hover:text-foreground transition-colors text-[10px] font-bold">
                                GIF
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0" align="end" side="top">
                              <GifPicker onSelect={(gifUrl) => {
                                setCommentImages((prev) => [...prev, gifUrl]);
                                setShowGifPicker(false);
                              }} />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <button
                          onClick={() => (commentBody.trim() || commentImages.length > 0) && addComment.mutate({ body: commentBody || "📷" })}
                          disabled={(!commentBody.trim() && commentImages.length === 0) || addComment.isPending}
                          className="text-primary hover:text-primary/80 disabled:opacity-30 transition-opacity"
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4 cursor-pointer" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}
