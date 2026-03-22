import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageCircle, Pin, BarChart3, Play, Star, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import LevelBadge from "@/components/circle/LevelBadge";

interface PostCardProps {
  post: any;
  liked: boolean;
  onToggleLike: (postId: string) => void;
  isMuted: boolean;
  showSpace?: boolean;
}

function getVideoThumb(url: string | null) {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  return null;
}

export default function PostCard({ post, liked, onToggleLike, isMuted, showSpace = true }: PostCardProps) {
  const videoThumb = getVideoThumb(post.video_url);
  const firstImage = post.images && (post.images as string[]).length > 0 ? (post.images as string[])[0] : null;
  const thumbnail = firstImage || videoThumb;
  const isCreatorOrAdmin = post.author?.role === "OWNER" || post.author?.role === "ADMIN";

  return (
    <div
      className={cn(
        "bg-card rounded-xl border border-border p-4 md:p-5 transition-shadow hover:shadow-md relative",
        post.is_pinned && "border-l-4 border-l-amber-400"
      )}
    >
      {/* Pinned badge — top right */}
      {post.is_pinned && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Pin className="h-3.5 w-3.5" />
          <span className="text-[11px] font-semibold">Pinned</span>
        </div>
      )}

      {/* Header: avatar + name + badges + timestamp + category */}
      <div className="flex items-center gap-2.5">
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={post.author?.avatar_url || ""} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {(post.author?.display_name || "U").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 text-sm">
          <span className="font-semibold text-foreground">
            {post.author?.display_name || "Member"}
          </span>
          {/* Role badges */}
          {isCreatorOrAdmin && (
            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
          )}
          <LevelBadge points={post.author?.total_points || 0} size="sm" />
          <span className="text-xs text-muted-foreground">
            · {formatDistanceToNow(new Date(post.created_at), { addSuffix: true, locale: ptBR })}
          </span>
          {showSpace && post.space && (
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-normal">
              {post.space.emoji} {post.space.name}
            </Badge>
          )}
        </div>
      </div>

      {/* Content area: text left + optional thumbnail right */}
      <Link to={`/circle/post/${post.id}`} className="block mt-3">
        <div className="flex gap-4">
          {/* Text content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {post.post_type === "QUESTION" && (
                <span className="text-sm">❓</span>
              )}
              {post.post_type === "ANNOUNCEMENT" && (
                <span className="text-sm">📢</span>
              )}
              {post.post_type === "WIN" && (
                <span className="text-sm">🏆</span>
              )}
              {post.post_type === "POLL" && (
                <span className="text-sm">📊</span>
              )}
              <h3 className="text-[15px] font-bold text-foreground leading-snug hover:text-primary transition-colors">
                {post.title}
              </h3>
              {post.post_type === "QUESTION" && post.is_answered && (
                <span className="text-xs text-accent font-medium shrink-0">✅</span>
              )}
            </div>
            {post.body && (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 whitespace-pre-wrap leading-relaxed">
                {post.body.replace(/<[^>]*>/g, "")}
              </p>
            )}

            {/* Poll preview inline */}
            {post.post_type === "POLL" && post.poll_options && (
              <div className="mt-2.5 space-y-1.5">
                {(post.poll_options as any[]).slice(0, 3).map((opt: any) => (
                  <div key={opt.id} className="flex items-center gap-2 text-xs">
                    <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{opt.text}</span>
                  </div>
                ))}
                {(post.poll_options as any[]).length > 3 && (
                  <p className="text-xs text-muted-foreground">+{(post.poll_options as any[]).length - 3} more</p>
                )}
              </div>
            )}
          </div>

          {/* Thumbnail on the right */}
          {thumbnail && (
            <div className="shrink-0 w-24 h-20 md:w-28 md:h-[76px] rounded-lg overflow-hidden bg-muted relative">
              <img
                src={thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
              {videoThumb && !firstImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="h-8 w-8 rounded-full bg-primary/90 flex items-center justify-center">
                    <Play className="h-3.5 w-3.5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Footer: likes + comments + recent commenters */}
      <div className="mt-3 flex items-center gap-4 pt-2.5 border-t border-border">
        <button
          onClick={() => !isMuted && onToggleLike(post.id)}
          disabled={isMuted}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-all",
            liked ? "text-primary" : "text-muted-foreground hover:text-primary",
            isMuted && "opacity-50 cursor-not-allowed"
          )}
        >
          <Heart className={cn("h-4 w-4 transition-transform", liked && "fill-current scale-110")} />
          <span className="font-medium">{post.like_count}</span>
        </button>
        <Link
          to={`/circle/post/${post.id}`}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-4 w-4" />
          <span className="font-medium">{post.comment_count}</span>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Recent comment hint */}
        {post.comment_count > 0 && (
          <Link
            to={`/circle/post/${post.id}`}
            className="text-xs text-primary hover:underline hidden sm:block"
          >
            {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
          </Link>
        )}
      </div>
    </div>
  );
}
