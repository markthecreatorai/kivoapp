import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Heart, Send, CheckCircle, ChevronDown, ChevronUp, Link2, Trash2,
  MoreHorizontal, Flag,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import { createNotification } from "@/lib/notifications";

interface CommentSectionProps {
  postId: string;
  postTitle: string;
  postAuthorId: string;
  postType: string;
  isLocked: boolean;
  isMuted: boolean;
  isAdmin: boolean;
  isPostAuthor: boolean;
  member: any;
  community: any;
  comments: any[];
  userReactions: { postLiked: boolean; commentLikes: string[] } | undefined;
}

export default function CommentSection({
  postId, postTitle, postAuthorId, postType, isLocked, isMuted, isAdmin, isPostAuthor,
  member, community, comments, userReactions,
}: CommentSectionProps) {
  const queryClient = useQueryClient();
  const [commentBody, setCommentBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "popular">("recent");
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());

  const topComments = (comments || []).filter((c: any) => !c.parent_id);
  const getReplies = (parentId: string) =>
    (comments || []).filter((c: any) => c.parent_id === parentId);

  const sortedComments = [...topComments].sort((a: any, b: any) => {
    if (sortBy === "popular") return (b.like_count || 0) - (a.like_count || 0);
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  const toggleExpanded = (commentId: string) => {
    setExpandedReplies((prev) => {
      const next = new Set(prev);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  };

  const addComment = useMutation({
    mutationFn: async ({ body, parentId }: { body: string; parentId?: string }) => {
      if (!member || !community) throw new Error("Missing");

      // Anti-spam check
      const { checkSpam } = await import("@/lib/antispam");
      const spamResult = await checkSpam(member.id, community.id, "comment", body.trim());
      if (!spamResult.allowed) throw new Error(spamResult.reason || "Spam detectado");
      const { data: comment, error } = await supabase.from("community_comments").insert({
        post_id: postId,
        author_id: member.id,
        body: body.trim(),
        parent_id: parentId || null,
      }).select().single();
      if (error) throw error;

      await supabase.from("community_points_log").insert({
        community_id: community.id,
        member_id: member.id,
        action: "COMMENT_CREATED",
        points: community.points_per_comment,
        reference_id: comment.id,
        reference_type: "comment",
        description: "Comentou em um post",
      });
      await supabase.from("community_members").update({
        total_points: (member.total_points || 0) + community.points_per_comment,
        last_active_at: new Date().toISOString(),
      }).eq("id", member.id);

      return comment;
    },
    onSuccess: (comment, { parentId }) => {
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      setCommentBody("");
      setReplyTo(null);
      setReplyBody("");
      toast.success(`Comentário publicado! +${community?.points_per_comment || 1} pt`);

      // Create notifications
      if (parentId) {
        // Reply to a comment → notify parent comment author
        const parentComment = comments?.find((c: any) => c.id === parentId);
        if (parentComment && parentComment.author_id !== member.id) {
          createNotification({
            communityId: community.id,
            recipientId: parentComment.author_id,
            actorId: member.id,
            type: "COMMENT_REPLY",
            title: `${member.display_name || "Alguém"} respondeu ao seu comentário`,
            body: postTitle,
            postId,
            commentId: comment?.id,
          });
        }
      } else {
        // Top-level comment → notify post author
        if (postAuthorId !== member.id) {
          createNotification({
            communityId: community.id,
            recipientId: postAuthorId,
            actorId: member.id,
            type: "POST_REPLY",
            title: `${member.display_name || "Alguém"} comentou no seu post`,
            body: postTitle,
            postId,
            commentId: comment?.id,
          });
        }
      }
    },
    onError: () => toast.error("Erro ao comentar"),
  });

  const toggleCommentLike = useMutation({
    mutationFn: async (commentId: string) => {
      if (!member || !community) throw new Error("Missing");
      const liked = userReactions?.commentLikes.includes(commentId);
      if (liked) {
        await supabase.from("community_reactions").delete().eq("member_id", member.id).eq("comment_id", commentId);
      } else {
        await supabase.from("community_reactions").insert({ member_id: member.id, comment_id: commentId, emoji: "❤️" });
      }
    },
    onSuccess: (_, commentId) => {
      queryClient.invalidateQueries({ queryKey: ["circle-post-reactions"] });
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      // Notify comment author on like
      const liked = userReactions?.commentLikes.includes(commentId);
      if (!liked) {
        const comment = comments?.find((c: any) => c.id === commentId);
        if (comment && comment.author_id !== member?.id && community) {
          createNotification({
            communityId: community.id,
            recipientId: comment.author_id,
            actorId: member!.id,
            type: "COMMENT_LIKE",
            title: `${member?.display_name || "Alguém"} curtiu seu comentário`,
            body: postTitle,
            postId,
            commentId,
          });
        }
      }
    },
  });

  const markBestAnswer = useMutation({
    mutationFn: async (commentId: string) => {
      await supabase.from("community_comments").update({ is_best_answer: false }).eq("post_id", postId);
      await supabase.from("community_comments").update({ is_best_answer: true }).eq("id", commentId);
      await supabase.from("community_posts").update({ is_answered: true, best_answer_id: commentId }).eq("id", postId);

      const comment = comments?.find((c: any) => c.id === commentId);
      if (comment && community) {
        await supabase.from("community_points_log").insert({
          community_id: community.id, member_id: comment.author_id, action: "ADMIN_BONUS" as any,
          points: 5, reference_id: commentId, reference_type: "comment", description: "Melhor resposta",
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      toast.success("Melhor resposta marcada! +5 pts");
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      await supabase.from("community_comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId);
    },
    onSuccess: (_, commentId) => {
      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["circle-post", postId] });
      toast.success("Comentário removido", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            await supabase.from("community_comments").update({ deleted_at: null }).eq("id", commentId);
            queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
            toast.success("Comentário restaurado!");
          },
        },
        duration: 5000,
      });
    },
  });

  const copyPostLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado!");
  };

  return (
    <div className="space-y-4">
      {/* Comment input */}
      {!isLocked && !isMuted && member && (
        <Card className="p-4">
          <div className="flex gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={member?.avatar_url || ""} />
              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                {(member?.display_name || "U").charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Escreva um comentário..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                rows={2}
              />
              <div className="flex justify-between items-center">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={copyPostLink}>
                  <Link2 className="h-3.5 w-3.5 mr-1" />Copiar link
                </Button>
                <Button size="sm" onClick={() => addComment.mutate({ body: commentBody })} disabled={!commentBody.trim() || addComment.isPending}>
                  <Send className="h-3.5 w-3.5 mr-1.5" />Comentar
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {isLocked && (
        <p className="text-center text-sm text-muted-foreground">🔒 Comentários bloqueados neste post.</p>
      )}

      {/* Sort + count */}
      {topComments.length > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">
            {topComments.length} {topComments.length === 1 ? "comentário" : "comentários"}
          </h3>
          <div className="flex gap-1">
            <Button variant={sortBy === "recent" ? "default" : "ghost"} size="sm" className="text-xs h-7"
              onClick={() => setSortBy("recent")}>Recentes</Button>
            <Button variant={sortBy === "popular" ? "default" : "ghost"} size="sm" className="text-xs h-7"
              onClick={() => setSortBy("popular")}>Populares</Button>
          </div>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-3">
        {sortedComments.map((comment: any) => {
          const cLiked = userReactions?.commentLikes.includes(comment.id);
          const replies = getReplies(comment.id);
          const isExpanded = expandedReplies.has(comment.id);
          const visibleReplies = isExpanded ? replies : replies.slice(0, 2);
          const hiddenCount = replies.length - 2;
          // Level badge handled by LevelBadge component

          return (
            <div key={comment.id}>
              <Card className={cn("p-4", comment.is_best_answer && "border-green-500/50 bg-green-50/30 dark:bg-green-900/10")}>
                {comment.is_best_answer && (
                  <Badge className="mb-2 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ Melhor Resposta</Badge>
                )}
                <div className="flex items-start gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={comment.author?.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {(comment.author?.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">{comment.author?.display_name || "Membro"}</span>
                      <LevelBadge points={comment.author?.total_points || 0} size="sm" />
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{comment.body}</p>

                    {/* Comment images */}
                    {comment.images && (comment.images as string[]).length > 0 && (
                      <div className="mt-2 flex gap-2">
                        {(comment.images as string[]).map((url: string, i: number) => (
                          <img key={i} src={url} alt="" className="max-h-32 rounded-lg object-cover border border-border" />
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <button
                        onClick={() => !isMuted && toggleCommentLike.mutate(comment.id)}
                        disabled={isMuted}
                        className={cn("flex items-center gap-1 text-xs transition-all",
                          cLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}
                      >
                        <Heart className={cn("h-3.5 w-3.5", cLiked && "fill-current")} />
                        {comment.like_count}
                      </button>
                      {!isLocked && !isMuted && (
                        <button
                          onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Responder
                        </button>
                      )}
                      {postType === "QUESTION" && (isAdmin || isPostAuthor) && !comment.is_best_answer && (
                        <button
                          onClick={() => markBestAnswer.mutate(comment.id)}
                          className="text-xs text-green-600 hover:text-green-700 flex items-center gap-1"
                        >
                          <CheckCircle className="h-3.5 w-3.5" />Melhor resposta
                        </button>
                      )}
                      {/* More menu - show for admin OR author */}
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {comment.author_id === member?.id && (
                              <DropdownMenuItem
                                onClick={() => {
                                  const newBody = prompt("Editar comentário:", comment.body);
                                  if (newBody && newBody.trim()) {
                                    supabase.from("community_comments").update({ body: newBody.trim(), edited_at: new Date().toISOString() }).eq("id", comment.id).then(() => {
                                      queryClient.invalidateQueries({ queryKey: ["circle-comments", postId] });
                                      toast.success("Comentário editado");
                                    });
                                  }
                                }}
                              >
                                ✏️ Editar
                              </DropdownMenuItem>
                            )}
                            {(isAdmin || comment.author_id === member?.id) && (
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => deleteComment.mutate(comment.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir
                              </DropdownMenuItem>
                            )}
                            {comment.author_id !== member?.id && community && member && (
                              <DropdownMenuItem
                                onClick={() => {
                                  supabase.from("community_reports" as any).insert({
                                    community_id: community.id,
                                    reporter_id: member.id,
                                    comment_id: comment.id,
                                    target_member_id: comment.author_id,
                                    reason: "spam",
                                    status: "PENDING",
                                  } as any).then(({ error }) => {
                                    if (!error) toast.success("Denúncia enviada");
                                    else toast.error("Erro ao denunciar");
                                  });
                                }}
                              >
                                <Flag className="h-3.5 w-3.5 mr-2" />Denunciar
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Reply input */}
                {replyTo === comment.id && (
                  <div className="mt-3 ml-11 flex gap-2">
                    <Textarea
                      placeholder="Escreva uma resposta..."
                      value={replyBody}
                      onChange={(e) => setReplyBody(e.target.value)}
                      rows={2}
                      className="text-sm"
                    />
                    <Button size="sm" onClick={() => addComment.mutate({ body: replyBody, parentId: comment.id })} disabled={!replyBody.trim()}>
                      <Send className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </Card>

              {/* Nested replies */}
              {replies.length > 0 && (
                <div className="ml-8 mt-2 space-y-2 border-l-2 border-border/40 pl-4">
                  {visibleReplies.map((reply: any) => {
                    const rLiked = userReactions?.commentLikes.includes(reply.id);
                    return (
                      <Card key={reply.id} className="p-3">
                        <div className="flex items-start gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={reply.author?.avatar_url || ""} />
                            <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                              {(reply.author?.display_name || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-xs">{reply.author?.display_name || "Membro"}</span>
                              <span className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true, locale: ptBR })}
                              </span>
                            </div>
                            <p className="text-xs text-foreground mt-0.5 whitespace-pre-wrap">{reply.body}</p>
                            <div className="flex items-center gap-3 mt-1.5">
                              <button
                                onClick={() => !isMuted && toggleCommentLike.mutate(reply.id)}
                                disabled={isMuted}
                                className={cn("flex items-center gap-1 text-[10px]",
                                  rLiked ? "text-primary" : "text-muted-foreground hover:text-primary")}
                              >
                                <Heart className={cn("h-3 w-3", rLiked && "fill-current")} />
                                {reply.like_count}
                              </button>
                              {isAdmin && (
                                <button
                                  onClick={() => { if (confirm("Excluir?")) deleteComment.mutate(reply.id); }}
                                  className="text-[10px] text-destructive/60 hover:text-destructive"
                                >
                                  Excluir
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}

                  {/* Show more / less replies */}
                  {hiddenCount > 0 && (
                    <button
                      onClick={() => toggleExpanded(comment.id)}
                      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 ml-2"
                    >
                      {isExpanded ? (
                        <><ChevronUp className="h-3.5 w-3.5" />Ocultar respostas</>
                      ) : (
                        <><ChevronDown className="h-3.5 w-3.5" />Ver mais {hiddenCount} {hiddenCount === 1 ? "resposta" : "respostas"}</>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
