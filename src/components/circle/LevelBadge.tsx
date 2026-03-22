import { cn } from "@/lib/utils";
import { getLevelInfo } from "@/components/circle/CircleLayout";

interface LevelBadgeProps {
  points: number;
  size?: "sm" | "md";
  showLabel?: boolean;
}

const LEVEL_STYLES: Record<number, string> = {
  1: "bg-muted text-muted-foreground border-border",
  2: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
  3: "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800",
  4: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800",
  5: "bg-gradient-to-r from-yellow-100 to-amber-100 text-amber-800 border-yellow-300 dark:from-yellow-900/30 dark:to-amber-900/30 dark:text-yellow-300 dark:border-yellow-700",
  6: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
  7: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
  8: "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300 dark:border-pink-800",
  9: "bg-gradient-to-r from-yellow-200 to-amber-200 text-amber-900 border-yellow-400 dark:from-yellow-800/40 dark:to-amber-800/40 dark:text-yellow-200 dark:border-yellow-600 shadow-[0_0_6px_hsl(var(--primary)/0.3)]",
};

const LEVEL_EMOJI: Record<number, string> = {
  1: "",
  2: "⭐",
  3: "💪",
  4: "🔥",
  5: "👑",
  6: "💎",
  7: "🏆",
  8: "⚡",
  9: "🌟",
};

export default function LevelBadge({ points, size = "sm", showLabel = false }: LevelBadgeProps) {
  const level = getLevelInfo(points);
  const style = LEVEL_STYLES[level.level] || LEVEL_STYLES[1];
  const emoji = LEVEL_EMOJI[level.level];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border font-semibold whitespace-nowrap",
        style,
        size === "sm" ? "text-[10px] px-1.5 py-0.5 h-[18px]" : "text-xs px-2 py-0.5 h-5",
        level.level === 9 && "animate-pulse"
      )}
    >
      Lv{level.level}
      {emoji && <span className="ml-0.5">{emoji}</span>}
      {showLabel && <span className="ml-0.5">{level.label}</span>}
    </span>
  );
}
