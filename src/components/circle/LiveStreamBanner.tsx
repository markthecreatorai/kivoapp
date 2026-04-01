import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Radio, Calendar, Users, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface LiveStreamBannerProps {
  communityId: string;
  onWatch: (stream: any) => void;
  isAdmin?: boolean;
  onCreateLive?: () => void;
}

export default function LiveStreamBanner({ communityId, onWatch, isAdmin, onCreateLive }: LiveStreamBannerProps) {
  const { data: streams } = useQuery({
    queryKey: ["live-streams", communityId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_live_streams" as any)
        .select("*, creator:created_by(display_name, avatar_url)")
        .eq("community_id", communityId)
        .in("status", ["LIVE", "SCHEDULED"])
        .order("scheduled_at", { ascending: true })
        .limit(5);
      return (data || []) as any[];
    },
    enabled: !!communityId,
    refetchInterval: 15000,
  });

  const liveNow = streams?.filter((s: any) => s.status === "LIVE") || [];
  const scheduled = streams?.filter((s: any) => s.status === "SCHEDULED") || [];

  if (!liveNow.length && !scheduled.length) return null;

  return (
    <div className="space-y-2">
      {/* Live now banner */}
      {liveNow.map((stream: any) => (
        <div
          key={stream.id}
          onClick={() => onWatch(stream)}
          className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-3 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
        >
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full animate-pulse shrink-0">
            <Radio className="h-3 w-3" />
            AO VIVO
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">{stream.title}</p>
            <p className="text-xs text-muted-foreground">
              por {stream.creator?.display_name || "Admin"}
            </p>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Users className="h-3.5 w-3.5" />
            <span className="text-xs">{stream.viewer_count}</span>
          </div>
          <Button size="sm" variant="destructive" className="shrink-0 h-8 text-xs font-semibold">
            <Play className="h-3 w-3 mr-1" />
            Assistir
          </Button>
        </div>
      ))}

      {/* Next scheduled */}
      {!liveNow.length && scheduled.length > 0 && (
        <div
          onClick={() => onWatch(scheduled[0])}
          className="flex items-center gap-3 bg-muted/40 rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/60 transition-colors"
        >
          <Calendar className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">
              📺 {scheduled[0].title}
            </p>
            <p className="text-xs text-muted-foreground">
              {scheduled[0].scheduled_at
                ? format(new Date(scheduled[0].scheduled_at), "dd MMM · HH:mm", { locale: ptBR })
                : "Em breve"
              }
              {" · "}{scheduled[0].creator?.display_name || "Admin"}
            </p>
          </div>
          <span className="text-xs font-medium text-primary shrink-0">Ver detalhes →</span>
        </div>
      )}
    </div>
  );
}
