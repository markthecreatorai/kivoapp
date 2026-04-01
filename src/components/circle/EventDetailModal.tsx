import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, Video, Users, ExternalLink, MapPin } from "lucide-react";
import { format, differenceInMinutes, isPast, isFuture, isWithinInterval, addHours } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EventDetailModalProps {
  event: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myRsvp?: string;
  onRsvp: (eventId: string, status: "GOING" | "MAYBE" | "NOT_GOING") => void;
  rsvpPending?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  teams: "Microsoft Teams",
  discord: "Discord",
  custom: "Link personalizado",
};

function buildGCalUrl(event: any) {
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${fmt(start)}/${fmt(end)}&details=${encodeURIComponent(event.description || "")}&location=${encodeURIComponent(event.meeting_url || "")}`;
}

function getEventStatus(event: any) {
  const now = new Date();
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : addHours(start, 1);

  if (event.status === "CANCELLED") return { label: "Cancelado", color: "bg-destructive/10 text-destructive", isLive: false };
  if (isPast(end)) return { label: "Encerrado", color: "bg-muted text-muted-foreground", isLive: false };
  if (isWithinInterval(now, { start, end })) return { label: "🔴 Ao vivo", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse", isLive: true };
  return { label: "Em breve", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", isLive: false };
}

export default function EventDetailModal({ event, open, onOpenChange, myRsvp, onRsvp, rsvpPending }: EventDetailModalProps) {
  const { data: attendees } = useQuery({
    queryKey: ["circle-event-attendees", event?.id],
    queryFn: async () => {
      if (!event) return [];
      const { data } = await supabase
        .from("community_event_rsvps")
        .select("member_id, status")
        .eq("event_id", event.id)
        .eq("status", "GOING");

      if (!data || data.length === 0) return [];
      const memberIds = data.map((r: any) => r.member_id);
      const { data: members } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .in("id", memberIds);
      return members || [];
    },
    enabled: !!event && open,
  });

  if (!event) return null;

  const status = getEventStatus(event);
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const duration = end ? differenceInMinutes(end, start) : null;
  const isEnded = isPast(end || addHours(start, 1));
  const showRsvp = !isEnded && event.status !== "CANCELLED";
  const maxVisible = 8;
  const extraCount = (attendees?.length || 0) - maxVisible;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{event.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Cover */}
          {event.cover_image_url ? (
            <img src={event.cover_image_url} alt="" className="w-full h-40 object-cover rounded-lg" />
          ) : (
            <div className="w-full h-28 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
              <Calendar className="h-10 w-10 text-primary/40" />
            </div>
          )}

          <div className="flex items-start justify-between gap-3">
            <h2 className="text-xl font-bold text-foreground">{event.title}</h2>
            <Badge className={status.color}>{status.label}</Badge>
          </div>

          {event.description && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>
          )}

          {/* Info grid */}
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-foreground">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>{format(start, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            </div>
            {!event.is_all_day && (
              <div className="flex items-center gap-2 text-foreground">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>
                  {format(start, "HH:mm")}
                  {end && ` – ${format(end, "HH:mm")}`}
                  {duration && ` (${duration >= 60 ? `${Math.floor(duration / 60)}h${duration % 60 > 0 ? `${duration % 60}min` : ""}` : `${duration}min`})`}
                </span>
              </div>
            )}
            {event.meeting_platform && (
              <div className="flex items-center gap-2 text-foreground">
                <Video className="h-4 w-4 text-muted-foreground" />
                <span>{PLATFORM_LABELS[event.meeting_platform] || "Link"}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-foreground">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>
                {event.rsvp_count} confirmado{event.rsvp_count !== 1 ? "s" : ""}
                {event.max_attendees && ` / ${event.max_attendees} vagas`}
              </span>
            </div>
          </div>

          {/* Attendees avatars */}
          {attendees && attendees.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Confirmados</p>
              <div className="flex items-center -space-x-2">
                {attendees.slice(0, maxVisible).map((a: any) => (
                  <Avatar key={a.id} className="h-8 w-8 ring-2 ring-background">
                    <AvatarImage src={a.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {(a.display_name || "U").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                ))}
                {extraCount > 0 && (
                  <div className="h-8 w-8 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
                    +{extraCount}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="space-y-2 pt-2">
            {/* RSVP */}
            {showRsvp && (
              <div className="flex items-center gap-2">
                {(["GOING", "MAYBE", "NOT_GOING"] as const).map((s) => (
                  <Button
                    key={s}
                    variant={myRsvp === s ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => onRsvp(event.id, s)}
                    disabled={rsvpPending}
                  >
                    {s === "GOING" ? "✅ Vou" : s === "MAYBE" ? "🤔 Talvez" : "❌ Não vou"}
                  </Button>
                ))}
              </div>
            )}

            {/* Live: join meeting */}
            {status.isLive && event.meeting_url && (
              <Button className="w-full bg-red-600 hover:bg-red-700 text-white" asChild>
                <a href={event.meeting_url} target="_blank" rel="noopener noreferrer">
                  <Video className="h-4 w-4 mr-2" />
                  🔴 Entrar na reunião
                </a>
              </Button>
            )}

            {/* Future: Google Calendar */}
            {!isEnded && (
              <Button variant="outline" className="w-full" asChild>
                <a href={buildGCalUrl(event)} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  📅 Adicionar ao Google Calendar
                </a>
              </Button>
            )}

            {/* Past */}
            {isEnded && (
              <div className="text-center py-2">
                <Badge variant="secondary">✅ {event.rsvp_count} participaram</Badge>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
