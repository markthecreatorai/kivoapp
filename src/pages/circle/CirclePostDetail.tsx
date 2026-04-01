import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Heart, MessageCircle, ArrowLeft, Pin, Lock, Trash2, Link2,
  MoreHorizontal, Eye, Play, ArrowRightLeft,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import CommentSection from "@/components/circle/CommentSection";
import { createNotification } from "@/lib/notifications";

export default function CirclePostDetail() {
  const { id: postId } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

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
        .eq("id", postId!)
        .single();

      if (data) {
        supabase.from("community_posts").update({ view_count: (data.view_count || 0) + 1 }).eq("id", postId!).then(() => {});
      }
      return data;
    },
    enabled: !!postId,
  });

  const { data: comments } = useQuery({
    queryKey: ["circle-comments", postId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_comments")
        .select(`*, author:community_members!author_id(id, display_name, avatar_url, level, role, total_points)`)
        .eq("post_id", postId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: !!postId,
  });

  const { data: userReactions } = useQuery({
    queryKey: ["circle-post-reactions", member?.id, postId],
    queryFn: async () => {
      if (!member) return { postLiked: false, commentLikes: [] as string[] };
      const { data: postReaction } = await supabase.from("community_reactions").select("id").eq("member_id", member.id).eq("post_id", postId!).maybeSingle();
      const { data: commentReactions } = await supabase.from("community_reactions").select("comment_id").eq("member_id", member.id).not("comment_id", "is", null);
      return {
        postLiked: !!postReaction,
        commentLikes: commentReactions?.map((r: any) => r.comment_id) || [],
      };
    },
    enabled: !!member && !!postId,
  });

  const { data: pollVotes } = useQuery({
    queryKey: ["circle-poll-votes", postId, member?.id],
    queryFn: async () => {
      if (!member || !postId) return { userVotes: [] as string[], allVotes: [] as any[] };
      const { data: userV } = await supabase.from("community_poll_votes").select("option_id").eq("post_id", postId).eq("member_id", member.id);
      const { data: allV } = await supabase.from("community_poll_votes").select("option_id").eq("post_id", postId);
      return {
        userVotes: userV?.map((v: any) => v.option_id) || [],
        allVotes: allV || [],
      };
    },
    enabled: !!member && !!postId && post?.post_type === "POLL",
  });

  // Spaces for "move to" feature
  const { data: spaces } = useQuery({
    queryKey: ["circle-spaces", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase.from("community_spaces").select("id, name, emoji, slug")
        .eq("community_id", community.id).order("position");
      return data || [];
    },
    enabled: !!community,
  });

  const isMuted = member?.status === "MUTED";
  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN" || member?.role === "MODERATOR";
  const isAuthor = post?.author?.user_id === user?.id;

  const togglePostLike = useMutation({
    mutationFn: async () => {
      if (!member || !community) throw new Error("Missing");
      if (userReactions?.postLiked) {
        await supabase.from("community_reactions").delete().eq("member_id", member.id).eq("post_id", postId!);
      } else {
        await supabase.from("community_reactions").insert({ member_id: member.id, post_id: postId!, emoji: "❤️" });
        if (post?.author_id !== member.id) {
          await supabase.from("community_points_log").insert({
            community_id: community.id, member_id: post?.author_id, action: "LIKE_RECEIVED",
            points: community.points_per_like_received, reference_id: postId!, reference_type: "post", description: "Recebeu um like",
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-post-reactions"] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      // Notify post author on like
      if (!userReactions?.postLiked && post?.author_id && member && community) {
        createNotification({
          communityId: community.id,
          recipientId: post.author_id,
          actorId: member.id,
          type: "POST_LIKE",
          title: `${member.display_name || "Alguém"} curtiu seu post`,
          body: post.title,
          postId: postId!,
        });
      }
    },
  });

  const pinPost = useMutation({
    mutationFn: async () => {
      await supabase.from("community_posts").update({ is_pinned: !post?.is_pinned }).eq("id", postId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      toast.success(post?.is_pinned ? "Post desfixado" : "Post fixado");
      // Notify post author on pin
      if (!post?.is_pinned && post?.author_id && member && community) {
        createNotification({
          communityId: community.id,
          recipientId: post.author_id,
          actorId: member.id,
          type: "POST_PINNED",
          title: `📌 Seu post foi fixado por um admin`,
          body: post.title,
          postId: postId!,
        });
      }
    },
  });

  const lockPost = useMutation({
    mutationFn: async () => {
      await supabase.from("community_posts").update({ is_locked: !post?.is_locked }).eq("id", postId!);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["circle-post", postId] }); toast.success(post?.is_locked ? "Comentários liberados" : "Comentários bloqueados"); },
  });

  const deletePost = useMutation({
    mutationFn: async () => {
      await supabase.from("community_posts").update({ deleted_at: new Date().toISOString() }).eq("id", postId!);
    },
    onSuccess: () => {
      const undoTimeout = setTimeout(() => {}, 5000);
      toast.success("Post excluído", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            clearTimeout(undoTimeout);
            await supabase.from("community_posts").update({ deleted_at: null }).eq("id", postId!);
            queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
            toast.success("Post restaurado!");
          },
        },
        duration: 5000,
      });
      navigate(`/c/${community?.slug}/feed`);
    },
  });

  const movePost = useMutation({
    mutationFn: async (spaceId: string) => {
      await supabase.from("community_posts").update({ space_id: spaceId }).eq("id", postId!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      toast.success("Post movido para outro espaço!");
    },
  });

  const votePoll = useMutation({
    mutationFn: async (optionId: string) => {
      if (!member || !postId) throw new Error("Missing");
      const alreadyVoted = pollVotes?.userVotes.includes(optionId);
      if (alreadyVoted) return;
      await supabase.from("community_poll_votes").insert({ post_id: postId, member_id: member.id, option_id: optionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-poll-votes"] });
      toast.success("Voto registrado!");
    },
  });

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado!");
  };

  // Video embed helper
  const getVideoEmbed = (url: string | null) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    const loomMatch = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
    if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
    return null;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>;
  }

  if (!post) {
    return <div className="p-6 text-center text-muted-foreground">Post não encontrado.</div>;
  }

  const totalPollVotes = pollVotes?.allVotes.length || 0;
  const getVoteCount = (optionId: string) => pollVotes?.allVotes.filter((v: any) => v.option_id === optionId).length || 0;
  const videoEmbed = getVideoEmbed(post.video_url);

  const POST_BORDER: Record<string, string> = {
    ANNOUNCEMENT: "border-l-4 border-l-primary",
    WIN: "border-l-4 border-l-yellow-400",
  };

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />Voltar
      </Button>

      {/* Post */}
      <Card className={cn("p-5", POST_BORDER[post.post_type])}>
        <div className="flex items-start gap-3">
          <Avatar className="h-11 w-11 ring-2 ring-primary/10">
            <AvatarImage src={post.author?.avatar_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">{(post.author?.display_name || "U").charAt(0).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{post.author?.display_name || "Membro"}</span>
              {post.author?.role !== "MEMBER" && (
                <Badge variant="secondary" className="text-[10px] h-5">
                  {post.author?.role === "OWNER" ? "Criador" : post.author?.role === "ADMIN" ? "Admin" : "Mod"}
                </Badge>
              )}
              <LevelBadge points={post.author?.total_points || 0} size="sm" />
              <span className="text-xs text-muted-foreground">· {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}</span>
            </div>
            {post.space && (
              <Link to={`/c/${community?.slug}/spaces/${post.space.slug}`} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                {post.space.emoji} {post.space.name}
              </Link>
            )}
          </div>
        </div>

        {/* Title + badges */}
        <div className="mt-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{post.title}</h1>
            {post.is_pinned && (
              <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium">
                <Pin className="h-3.5 w-3.5" /> Fixado
              </span>
            )}
            {post.is_locked && <Lock className="h-4 w-4 text-muted-foreground" />}
            {post.post_type === "QUESTION" && post.is_answered && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ Respondida</Badge>
            )}
          </div>

          {/* Body - render HTML from TipTap or plain text */}
          {post.body && (
            <div className="text-foreground prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: post.body.startsWith("<") ? post.body : `<p>${post.body.replace(/\n/g, "<br/>")}</p>` }}
            />
          )}
        </div>

        {/* Images gallery */}
        {post.images && (post.images as string[]).length > 0 && (
          <div className="mt-4 flex gap-2 flex-wrap">
            {(post.images as string[]).map((url: string, i: number) => (
              <img
                key={i}
                src={url}
                alt=""
                className="max-h-[300px] rounded-lg object-cover border border-border cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setLightboxImg(url)}
              />
            ))}
          </div>
        )}

        {/* Video embed */}
        {videoEmbed && (
          <div className="mt-4 aspect-video rounded-lg overflow-hidden border border-border">
            <iframe src={videoEmbed} className="w-full h-full" allowFullScreen />
          </div>
        )}

        {/* Link preview */}
        {post.link_url && !videoEmbed && (
          <a href={post.link_url} target="_blank" rel="noopener noreferrer"
            className="mt-4 block p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-2 text-sm">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-primary truncate">{post.link_url}</span>
            </div>
          </a>
        )}

        {/* Poll */}
        {post.post_type === "POLL" && post.poll_options && (
          <div className="mt-4 space-y-2">
            {(post.poll_options as any[]).map((opt: any) => {
              const count = getVoteCount(opt.id);
              const pct = totalPollVotes > 0 ? Math.round((count / totalPollVotes) * 100) : 0;
              const voted = pollVotes?.userVotes.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  onClick={() => !isMuted && votePoll.mutate(opt.id)}
                  disabled={isMuted || !!voted}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors relative overflow-hidden",
                    voted ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                  )}
                >
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

        {/* Actions bar */}
        <div className="mt-4 flex items-center gap-4 pt-3 border-t border-border/40">
          <button
            onClick={() => !isMuted && togglePostLike.mutate()}
            disabled={isMuted}
            className={cn("flex items-center gap-1.5 text-sm transition-all",
              userReactions?.postLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}
          >
            <Heart className={cn("h-4 w-4 transition-transform", userReactions?.postLiked && "fill-current scale-110")} />
            {post.like_count}
          </button>
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <MessageCircle className="h-4 w-4" />{post.comment_count}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />{post.view_count}
          </span>
          <button onClick={copyLink} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-auto">
            <Link2 className="h-3.5 w-3.5" />Copiar link
          </button>

          {/* Admin/author menu */}
          {(isAdmin || isAuthor) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <>
                    <DropdownMenuItem onClick={() => pinPost.mutate()}>
                      <Pin className="h-3.5 w-3.5 mr-2" />{post.is_pinned ? "Desfixar" : "Fixar"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => lockPost.mutate()}>
                      <Lock className="h-3.5 w-3.5 mr-2" />{post.is_locked ? "Desbloquear" : "Bloquear comentários"}
                    </DropdownMenuItem>
                    {/* Move to space */}
                    {spaces && spaces.length > 1 && (
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <ArrowRightLeft className="h-3.5 w-3.5 mr-2" />Mover para espaço
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {spaces.filter((s: any) => s.id !== post.space_id).map((s: any) => (
                            <DropdownMenuItem key={s.id} onClick={() => movePost.mutate(s.id)}>
                              {s.emoji} {s.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    )}
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem className="text-destructive" onClick={() => { if (confirm("Excluir este post?")) deletePost.mutate(); }}>
                  <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </Card>

      {/* Comments Section */}
      <CommentSection
        postId={postId!}
        postTitle={post.title}
        postAuthorId={post.author_id}
        postType={post.post_type}
        isLocked={post.is_locked}
        isMuted={isMuted}
        isAdmin={isAdmin}
        isPostAuthor={isAuthor}
        member={member}
        community={community}
        comments={comments || []}
        userReactions={userReactions}
      />

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImg(null)}
        >
          <img src={lightboxImg} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" />
        </div>
      )}
    </div>
  );
}
