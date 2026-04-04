import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageCircle, Pin, BarChart3, Play, Flag, MoreHorizontal, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";
import ReactionBar, { type ReactionData } from "@/components/circle/ReactionBar";
import { toast } from "sonner";

interface PostCardProps {
  post: any;
  liked: boolean;
  onToggleLike: (postId: string) => void;
  isMuted: boolean;
  showSpace?: boolean;
  communityId?: string;
  memberId?: string;
  memberRole?: string;
  reactions?: ReactionData[];
  onOpenPost?: (postId: string) => void;
  onDeletePost?: (postId: string) => void;
}

function getVideoThumb(url: string | null) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  return null;
}

function timeAgo(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Creator",
  ADMIN: "Admin",
  MODERATOR: "Mod",
};

function PollSection({ post, memberId }: { post: any; memberId?: string }) {
  const queryClient = useQueryClient();
  const options = (post.poll_options || []) as Array<{ id: string; text: string; votes?: number }>;

  const { data: votes } = useQuery({
    queryKey: ["poll-votes", post.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_poll_votes")
        .select("option_id, member_id")
        .eq("post_id", post.id);
      return data || [];
    },
  });

  const myVote = votes?.find((v: any) => v.member_id === memberId)?.option_id;
  const hasVoted = !!myVote;
  const totalVotes = votes?.length || 0;

  const voteMutation = useMutation({
    mutationFn: async (optionId: string) => {
      if (!memberId) throw new Error("Not a member");
      // Remove existing vote first
      await supabase.from("community_poll_votes").delete().eq("post_id", post.id).eq("member_id", memberId);
      // Insert new vote
      const { error } = await supabase.from("community_poll_votes").insert({
        post_id: post.id, member_id: memberId, option_id: optionId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["poll-votes", post.id] });
    },
    onError: () => toast.error("Erro ao votar"),
  });

  const getVoteCount = (optionId: string) => votes?.filter((v: any) => v.option_id === optionId).length || 0;
  const getPercent = (optionId: string) => totalVotes === 0 ? 0 : Math.round((getVoteCount(optionId) / totalVotes) * 100);

  return (
    <div className="mt-3 space-y-2">
      {options.map((opt) => {
        const percent = getPercent(opt.id);
        const isMyVote = myVote === opt.id;

        return (
          <button
            key={opt.id}
            onClick={() => !voteMutation.isPending && memberId && voteMutation.mutate(opt.id)}
            disabled={!memberId || voteMutation.isPending}
            className={cn(
              "w-full relative rounded-lg border px-4 py-2.5 text-left text-sm transition-colors overflow-hidden",
              isMyVote ? "border-primary bg-primary/5" : "border-border hover:border-primary/40",
              !memberId && "cursor-default"
            )}
          >
            {/* Progress bar background */}
            {hasVoted && (
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-500",
                  isMyVote ? "bg-primary/15" : "bg-muted/60"
                )}
                style={{ width: `${percent}%` }}
              />
            )}
            <div className="relative flex items-center justify-between">
              <span className={cn("font-medium", isMyVote && "text-primary")}>
                {opt.text}
              </span>
              {hasVoted && (
                <span className={cn("text-xs font-semibold ml-2", isMyVote ? "text-primary" : "text-muted-foreground")}>
                  {percent}%
                </span>
              )}
            </div>
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">{totalVotes} vote{totalVotes !== 1 ? "s" : ""}</p>
    </div>
  );
}

export default function PostCard({ post, liked, onToggleLike, isMuted, showSpace = true, communityId, memberId, memberRole, reactions = [], onOpenPost, onDeletePost }: PostCardProps) {
  const queryClient = useQueryClient();
  const videoThumb = getVideoThumb(post.video_url);
  const firstImage = post.images && (post.images as string[]).length > 0 ? (post.images as string[])[0] : null;
  const thumbnail = firstImage || videoThumb;
  const roleLabel = ROLE_LABEL[post.author?.role];
  const isPoll = post.post_type === "POLL" && post.poll_options;

  return (
    <div
      onClick={() => onOpenPost?.(post.id)}
      className={cn(
        "bg-card rounded-xl shadow-sm p-5 relative cursor-pointer hover:border-primary/40 border border-transparent transition-colors",
        post.is_pinned && "border-primary"
      )}
    >
      {/* Pinned badge */}
      {post.is_pinned && (
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary px-2.5 py-1">
          <Pin className="h-3 w-3" />
          <span className="text-[11px] font-semibold">Post fixado</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={post.author?.avatar_url || undefined} />
          <AvatarFallback className="bg-muted text-muted-foreground text-[11px] font-medium">
            {(post.author?.display_name || "U").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 leading-none">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-foreground whitespace-nowrap">
              {post.author?.display_name || "Membro"}
            </span>
            {roleLabel && (
              <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
                {roleLabel}
              </span>
            )}
            <LevelBadge points={post.author?.total_points || 0} size="sm" />
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {timeAgo(post.created_at)}
            </span>
            {showSpace && post.space && (
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                · {post.space.emoji} {post.space.name}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Title + body + thumbnail */}
      <div className="mt-3">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-foreground leading-snug">
              {post.title}
            </h3>
            {post.body && (
              <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">
                {post.body.replace(/<[^>]*>/g, "")}
              </p>
            )}
          </div>
          {thumbnail && !isPoll && (
            <div className="shrink-0 w-[120px] h-[90px] rounded-lg overflow-hidden bg-muted relative">
              <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              {videoThumb && !firstImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                  <div className="h-8 w-8 rounded-full bg-card/90 flex items-center justify-center">
                    <Play className="h-3.5 w-3.5 text-foreground ml-0.5" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Poll */}
      {isPoll && <div onClick={(e) => e.stopPropagation()}><PollSection post={post} memberId={memberId} /></div>}

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-1">
        <button
          onClick={(e) => { e.stopPropagation(); if (!isMuted) onToggleLike(post.id); }}
          disabled={isMuted}
          className={cn(
            "flex items-center gap-1 text-[13px] transition-colors px-1.5 py-0.5 rounded-md",
            liked ? "text-primary" : "text-muted-foreground hover:text-primary hover:bg-muted/50",
            isMuted && "opacity-50 cursor-not-allowed"
          )}
        >
          <ThumbsUp className={cn("h-[14px] w-[14px]", liked && "fill-current")} />
          {post.like_count > 0 && <span>{post.like_count}</span>}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); onOpenPost?.(post.id); }}
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted/50"
        >
          <MessageCircle className="h-[14px] w-[14px]" />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </button>

        {communityId && memberId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted/50"
              >
                <MoreHorizontal className="h-[14px] w-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  supabase.from("community_reports" as any).insert({
                    community_id: communityId, reporter_id: memberId,
                    post_id: post.id, target_member_id: post.author_id,
                    reason: "spam", status: "PENDING",
                  } as any).then(({ error }) => {
                    if (!error) toast.success("Denúncia enviada");
                  });
                }}
              >
                <Flag className="h-3.5 w-3.5 mr-2" />Denunciar post
              </DropdownMenuItem>
              {(memberRole === 'OWNER' || memberRole === 'ADMIN') && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    supabase.from("community_posts").update({ is_pinned: !post.is_pinned }).eq("id", post.id).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
                      toast.success(post.is_pinned ? "Post desfixado" : "Post fixado");
                    });
                  }}
                >
                  <Pin className="h-3.5 w-3.5 mr-2" />{post.is_pinned ? "Desfixar" : "Fixar"}
                </DropdownMenuItem>
              )}
              {(post.author_id === memberId || memberRole === 'OWNER' || memberRole === 'ADMIN') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePost?.(post.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" />Excluir post
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="flex-1" />

        {post.comment_count > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex items-center">
              {[0, 1, 2].slice(0, Math.min(post.comment_count, 3)).map((idx) => (
                <div
                  key={idx}
                  className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center"
                  style={{ marginLeft: idx > 0 ? "-6px" : "0", zIndex: 10 - idx }}
                >
                  <span className="text-[8px] text-muted-foreground font-medium">
                    {String.fromCharCode(65 + idx)}
                  </span>
                </div>
              ))}
            </div>
            <span className="text-[12px] text-primary whitespace-nowrap hidden sm:block">
              Novo comentário há {timeAgo(post.updated_at)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
