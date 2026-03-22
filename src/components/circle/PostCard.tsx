import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Heart, MessageCircle, Pin, BarChart3, Play } from "lucide-react";
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

function timeAgo(date: string) {
  return formatDistanceToNow(new Date(date), { addSuffix: false, locale: ptBR });
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: "Creator",
  ADMIN: "Admin",
  MODERATOR: "Mod",
};

export default function PostCard({ post, liked, onToggleLike, isMuted, showSpace = true }: PostCardProps) {
  const videoThumb = getVideoThumb(post.video_url);
  const firstImage = post.images && (post.images as string[]).length > 0 ? (post.images as string[])[0] : null;
  const thumbnail = firstImage || videoThumb;
  const roleLabel = ROLE_LABEL[post.author?.role];

  return (
    <div className="bg-card rounded-xl shadow-sm p-5 relative group">
      {/* Pinned accent bar */}
      {post.is_pinned && (
        <div
          className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full"
          style={{ backgroundColor: "#f5c518" }}
        />
      )}

      {/* Header: avatar | name + badges + timestamp + category — single line */}
      <div className="flex items-center gap-2.5">
        <Link to={`/circle/post/${post.id}`} className="shrink-0">
          <Avatar className="h-9 w-9">
            <AvatarImage src={post.author?.avatar_url || ""} />
            <AvatarFallback className="bg-muted text-muted-foreground text-[11px] font-medium">
              {(post.author?.display_name || "U").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex items-center gap-1.5 flex-wrap min-w-0 leading-none">
          <span className="text-[13px] font-bold text-foreground whitespace-nowrap">
            {post.author?.display_name || "Member"}
          </span>
          {roleLabel && (
            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded whitespace-nowrap">
              {roleLabel}
            </span>
          )}
          <LevelBadge points={post.author?.total_points || 0} size="sm" />
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            · {timeAgo(post.created_at)}
          </span>
          {showSpace && post.space && (
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              · in {post.space.emoji} {post.space.name}
            </span>
          )}
          {post.is_pinned && (
            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground whitespace-nowrap">
              · <Pin className="h-2.5 w-2.5" /> Pinned
            </span>
          )}
        </div>
      </div>

      {/* Content: title + body + thumbnail */}
      <Link to={`/circle/post/${post.id}`} className="block mt-2.5">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
              {post.title}
            </h3>
            {post.body && (
              <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                {post.body.replace(/<[^>]*>/g, "")}
              </p>
            )}
            {post.post_type === "POLL" && post.poll_options && (
              <div className="mt-2 space-y-1">
                {(post.poll_options as any[]).slice(0, 3).map((opt: any) => (
                  <div key={opt.id} className="flex items-center gap-2 text-[12px]">
                    <BarChart3 className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{opt.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {thumbnail && (
            <div className="shrink-0 w-[100px] h-[72px] rounded-lg overflow-hidden bg-muted relative">
              <img src={thumbnail} alt="" className="w-full h-full object-cover" />
              {videoThumb && !firstImage && (
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/20">
                  <div className="h-7 w-7 rounded-full bg-card/90 flex items-center justify-center">
                    <Play className="h-3 w-3 text-foreground ml-0.5" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Link>

      {/* Footer */}
      <div className="mt-3 pt-3 border-t border-border flex items-center">
        <button
          onClick={() => !isMuted && onToggleLike(post.id)}
          disabled={isMuted}
          className={cn(
            "flex items-center gap-1.5 text-[13px] transition-colors mr-4",
            liked ? "text-primary" : "text-muted-foreground hover:text-primary",
            isMuted && "opacity-50 cursor-not-allowed"
          )}
        >
          <Heart className={cn("h-[15px] w-[15px]", liked && "fill-current")} />
          {post.like_count > 0 && <span>{post.like_count}</span>}
        </button>
        <Link
          to={`/circle/post/${post.id}`}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="h-[15px] w-[15px]" />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </Link>
        <div className="flex-1" />
        {post.comment_count > 0 && (
          <Link
            to={`/circle/post/${post.id}`}
            className="text-[12px] text-primary hover:underline hidden sm:block"
          >
            {post.comment_count} comment{post.comment_count !== 1 ? "s" : ""}
          </Link>
        )}
      </div>
    </div>
  );
}
