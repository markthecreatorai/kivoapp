import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker from "@/components/circle/EmojiPicker";
import { trackEvent } from "@/lib/tracking";

const QUICK_EMOJIS = ["❤️", "🔥", "👏", "😂", "😍", "🎉", "💯", "👀"];

export interface ReactionData {
  emoji: string;
  count: number;
  reacted: boolean; // current user reacted with this emoji
}

interface ReactionBarProps {
  targetType: "post" | "comment";
  targetId: string;
  memberId?: string;
  communityId?: string;
  isMuted?: boolean;
  reactions: ReactionData[];
  compact?: boolean;
}

export default function ReactionBar({
  targetType,
  targetId,
  memberId,
  communityId,
  isMuted,
  reactions,
  compact = false,
}: ReactionBarProps) {
  const queryClient = useQueryClient();
  const [quickOpen, setQuickOpen] = useState(false);
  const [fullOpen, setFullOpen] = useState(false);

  const toggleReaction = useMutation({
    mutationFn: async (emoji: string) => {
      if (!memberId) throw new Error("Not a member");
      const existing = reactions.find((r) => r.emoji === emoji && r.reacted);
      if (existing) {
        // Remove reaction
        const col = targetType === "post" ? "post_id" : "comment_id";
        await supabase
          .from("community_reactions")
          .delete()
          .eq("member_id", memberId)
          .eq(col, targetId)
          .eq("emoji", emoji);
      } else {
        // Add reaction
        await supabase.from("community_reactions").insert({
          member_id: memberId,
          ...(targetType === "post" ? { post_id: targetId } : { comment_id: targetId }),
          emoji,
        });
      }
      return { emoji, action: existing ? "remove" : "add" };
    },
    onSuccess: ({ emoji, action }) => {
      queryClient.invalidateQueries({ queryKey: ["circle-reactions-multi"] });
      queryClient.invalidateQueries({ queryKey: ["circle-post-reactions-multi"] });
      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
      queryClient.invalidateQueries({ queryKey: ["circle-post"] });
      queryClient.invalidateQueries({ queryKey: ["circle-comments"] });
      // Telemetry
      trackEvent("community.reaction.toggle", {
        community_id: communityId,
        target_type: targetType,
        emoji,
        action,
      });
    },
  });

  const handleEmoji = (emoji: string) => {
    if (!isMuted && memberId && !toggleReaction.isPending) {
      toggleReaction.mutate(emoji);
    }
    setQuickOpen(false);
    setFullOpen(false);
  };

  // Sort reactions by count desc
  const sorted = [...reactions].filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
  const iconSize = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const pillSize = compact
    ? "px-1.5 py-0.5 text-[11px] gap-1"
    : "px-2 py-1 text-xs gap-1.5";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {sorted.map((r) => (
        <button
          key={r.emoji}
          onClick={(e) => {
            e.stopPropagation();
            handleEmoji(r.emoji);
          }}
          disabled={isMuted || !memberId}
          className={cn(
            "inline-flex items-center rounded-full border font-medium transition-all duration-200",
            pillSize,
            r.reacted
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:bg-muted/60",
            isMuted && "opacity-50 cursor-not-allowed",
            !isMuted && memberId && "hover:scale-105 active:scale-95"
          )}
        >
          <span>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      {/* Quick add popover */}
      {memberId && !isMuted && (
        <Popover open={quickOpen} onOpenChange={setQuickOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className={cn(
                "inline-flex items-center justify-center rounded-full border border-dashed border-border text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all",
                compact ? "h-5 w-5" : "h-7 w-7"
              )}
            >
              <Plus className={iconSize} />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-2"
            align="start"
            side="top"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-1">
              {QUICK_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleEmoji(emoji)}
                  className="h-8 w-8 flex items-center justify-center text-lg rounded-md hover:bg-muted transition-colors hover:scale-110 active:scale-95"
                >
                  {emoji}
                </button>
              ))}
              <Popover open={fullOpen} onOpenChange={setFullOpen}>
                <PopoverTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 flex items-center justify-center text-xs text-muted-foreground rounded-md hover:bg-muted transition-colors"
                  >
                    ⋯
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" side="top">
                  <EmojiPicker onSelect={handleEmoji} />
                </PopoverContent>
              </Popover>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
