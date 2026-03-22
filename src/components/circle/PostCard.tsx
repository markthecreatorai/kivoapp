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
    <div
      className={cn(
        "bg-card rounded-xl shadow-sm p-5 relative group",
        post.is_pinned && "border-l-4"
      )}
      style={post.is_pinned ? { borderLeftColor: "#f5c518" } : undefined}
    >
      {/* Pinned badge — top right */}
      {post.is_pinned && (
        <div className="absolute top-3 right-4 flex items-center gap-1">
          <Pin className="h-3 w-3 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground">Pinned</span>
        </div>
      )}

      {/* Header line: avatar | name + role + level | timestamp | category */}
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
        </div>
      </div>

      {/* Title + body + optional thumbnail */}
      <Link to={`/circle/post/${post.id}`} className="block mt-3">
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            {/* Title — bold, 16px */}
            <h3 className="text-base font-bold text-foreground leading-snug group-hover:text-primary transition-colors">
              {post.title}
            </h3>
            {/* Excerpt — 2-3 lines, gray */}
            {post.body && (
              <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-3 leading-relaxed">
                {post.body.replace(/<[^>]*>/g, "")}
              </p>
            )}
            {/* Poll preview */}
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

          {/* Thumbnail — right side, 120x90 */}
          {thumbnail && (
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
      </Link>

      {/* Footer: likes | comments | commenter avatars | "New comment X ago" */}
      <div className="mt-3 pt-3 border-t border-border flex items-center gap-1">
        {/* Like */}
        <button
          onClick={() => !isMuted && onToggleLike(post.id)}
          disabled={isMuted}
          className={cn(
            "flex items-center gap-1 text-[13px] transition-colors px-1.5 py-0.5 rounded-md",
            liked ? "text-primary" : "text-muted-foreground hover:text-primary hover:bg-muted/50",
            isMuted && "opacity-50 cursor-not-allowed"
          )}
        >
          <Heart className={cn("h-[14px] w-[14px]", liked && "fill-current")} />
          {post.like_count > 0 && <span>{post.like_count}</span>}
        </button>

        {/* Comment count */}
        <Link
          to={`/circle/post/${post.id}`}
          className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted/50"
        >
          <MessageCircle className="h-[14px] w-[14px]" />
          {post.comment_count > 0 && <span>{post.comment_count}</span>}
        </Link>

        <div className="flex-1" />

        {/* Right side: commenter avatars + "New comment X ago" */}
        {post.comment_count > 0 && (
          <Link
            to={`/circle/post/${post.id}`}
            className="flex items-center gap-2"
          >
            {/* Mini commenter avatars — show up to 3 overlapping */}
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
            <span className="text-[12px] text-primary hover:underline whitespace-nowrap hidden sm:block">
              New comment {timeAgo(post.updated_at)} ago
            </span>
          </Link>
        )}
      </div>
    </div>
  );
}
