import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, Clock, Video, Users, Plus, List, CalendarDays, Radio, Image as ImageIcon, Upload, Trash2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { format, isPast, isFuture, isWithinInterval, addHours, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import EventFormModal from "@/components/circle/EventFormModal";
import EventDetailModal from "@/components/circle/EventDetailModal";
import LiveStreamViewer from "@/components/circle/LiveStreamViewer";
import LiveStreamFormModal from "@/components/circle/LiveStreamFormModal";

const PLATFORM_LABELS: Record<string, string> = {
  zoom: "Zoom",
  google_meet: "Google Meet",
  teams: "Teams",
  discord: "Discord",
  youtube: "YouTube",
  twitch: "Twitch",
  custom: "Link",
};

function getEventStatus(event: any) {
  const now = new Date();
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : addHours(start, 1);

  if (event.status === "CANCELLED") return { label: "Cancelado", color: "bg-destructive/10 text-destructive", key: "cancelled" };
  if (isPast(end)) return { label: "Encerrado", color: "bg-muted text-muted-foreground", key: "past" };
  if (isWithinInterval(now, { start, end })) return { label: "🔴 Ao vivo", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 animate-pulse", key: "live" };
  return { label: "Em breve", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", key: "upcoming" };
}

export default function CircleEvents() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [showCreate, setShowCreate] = useState(false);
  const [editEvent, setEditEvent] = useState<any>(null);
  const [detailEvent, setDetailEvent] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

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

  const { data: events, isLoading } = useQuery({
    queryKey: ["circle-events", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase.from("community_events").select("*").eq("community_id", community.id).order("starts_at", { ascending: true });
      return data || [];
    },
    enabled: !!community,
  });

  // Fetch orphan live streams (not linked to any event)
  const { data: orphanStreams } = useQuery({
    queryKey: ["orphan-live-streams", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data: streams } = await supabase
        .from("community_live_streams" as any)
        .select("*, creator:created_by(display_name, avatar_url)")
        .eq("community_id", community.id)
        .in("status", ["LIVE", "SCHEDULED"]);
      if (!streams || streams.length === 0) return [];
      // Filter out streams that already have a linked event
      const linkedIds = (events || []).map((e: any) => e.live_stream_id).filter(Boolean);
      return (streams as any[]).filter((s: any) => !linkedIds.includes(s.id));
    },
    enabled: !!community && events !== undefined,
  });

  const { data: userRsvps } = useQuery({
    queryKey: ["circle-rsvps", member?.id],
    queryFn: async () => {
      if (!member) return {};
      const { data } = await supabase.from("community_event_rsvps").select("event_id, status").eq("member_id", member.id);
      const map: Record<string, string> = {};
      data?.forEach((r: any) => { map[r.event_id] = r.status; });
      return map;
    },
    enabled: !!member,
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  const rsvp = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: "GOING" | "MAYBE" | "NOT_GOING" }) => {
      if (!member) throw new Error("Not a member");
      const existing = userRsvps?.[eventId];
      if (existing) {
        await supabase.from("community_event_rsvps").update({ status } as any).eq("event_id", eventId).eq("member_id", member.id);
      } else {
        await supabase.from("community_event_rsvps").insert([{ event_id: eventId, member_id: member.id, status }] as any);
      }
      const { count } = await supabase
        .from("community_event_rsvps")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "GOING");
      await supabase.from("community_events").update({ rsvp_count: count || 0 }).eq("id", eventId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-rsvps"] });
      queryClient.invalidateQueries({ queryKey: ["circle-events"] });
      toast.success("RSVP atualizado!");
    },
  });

  // Convert orphan streams to event-like objects for unified rendering
  const allItems = useMemo(() => {
    const eventItems = (events || []).map((e: any) => ({ ...e, _type: "event" as const }));
    const streamItems = (orphanStreams || []).map((s: any) => ({
      id: `stream-${s.id}`,
      _streamId: s.id,
      _type: "stream" as const,
      title: `🔴 ${s.title}`,
      description: s.description,
      starts_at: s.scheduled_at || s.created_at,
      ends_at: s.scheduled_at ? new Date(new Date(s.scheduled_at).getTime() + 2 * 3600000).toISOString() : null,
      status: s.status === "LIVE" ? "ACTIVE" : "SCHEDULED",
      meeting_url: s.embed_url,
      meeting_platform: s.embed_type,
      cover_image_url: null,
      rsvp_count: s.viewer_count || 0,
      is_all_day: false,
      live_stream_id: s.id,
      _stream: s,
    }));
    return [...eventItems, ...streamItems].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  }, [events, orphanStreams]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    const now = new Date();
    return allItems.filter((e: any) => {
      const end = e.ends_at ? new Date(e.ends_at) : addHours(new Date(e.starts_at), 1);
      if (filter === "upcoming") return !isPast(end);
      if (filter === "past") return isPast(end);
      return true;
    });
  }, [allItems, filter]);

  // Events for selected calendar date
  const dateEvents = useMemo(() => {
    if (!selectedDate) return [];
    return allItems.filter((e: any) => isSameDay(new Date(e.starts_at), selectedDate));
  }, [allItems, selectedDate]);

  // Dates with events for calendar dots
  const eventDates = useMemo(() => {
    return new Set(allItems.map((e: any) => format(new Date(e.starts_at), "yyyy-MM-dd")));
  }, [allItems]);

  const handleRsvp = (eventId: string, status: "GOING" | "MAYBE" | "NOT_GOING") => {
    rsvp.mutate({ eventId, status });
  };

  // Counts
  const upcomingCount = useMemo(() => {
    const now = new Date();
    return allItems.filter((e: any) => {
      const end = e.ends_at ? new Date(e.ends_at) : addHours(new Date(e.starts_at), 1);
      return !isPast(end);
    }).length;
  }, [allItems]);

  const liveCount = useMemo(() => {
    return allItems.filter((e: any) => {
      const s = getEventStatus(e);
      return s.key === "live";
    }).length;
  }, [allItems]);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            Eventos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {upcomingCount} evento{upcomingCount !== 1 ? "s" : ""} próximo{upcomingCount !== 1 ? "s" : ""}
            {liveCount > 0 && <span className="text-red-500 font-medium ml-1">· {liveCount} ao vivo</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-lg overflow-hidden">
            <Button
              variant="ghost" size="sm"
              className={cn("rounded-none h-8 px-2.5", view === "list" && "bg-muted")}
              onClick={() => setView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="sm"
              className={cn("rounded-none h-8 px-2.5", view === "calendar" && "bg-muted")}
              onClick={() => setView("calendar")}
            >
              <CalendarDays className="h-4 w-4" />
            </Button>
          </div>

          {(isAdmin || community?.allow_member_events) && (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4 mr-1.5" />Criar
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {([
          { key: "upcoming" as const, label: "Próximos" },
          { key: "past" as const, label: "Passados" },
          { key: "all" as const, label: "Todos" },
        ]).map((f) => (
          <Button
            key={f.key}
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Calendar view */}
      {view === "calendar" && (
        <div className="space-y-4">
          <Card className="p-4 flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              locale={ptBR}
              className="pointer-events-auto"
              modifiers={{ hasEvent: (date) => eventDates.has(format(date, "yyyy-MM-dd")) }}
              modifiersStyles={{ hasEvent: { position: "relative" } }}
              modifiersClassNames={{ hasEvent: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1.5 after:w-1.5 after:rounded-full after:bg-primary" }}
            />
          </Card>

          {selectedDate && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                {dateEvents.length === 0 && <span className="text-muted-foreground ml-2">— sem eventos</span>}
              </p>
              {dateEvents.map((event: any) => (
                <EventCard
                  key={event.id}
                  event={event}
                  myRsvp={userRsvps?.[event.id]}
                  onRsvp={handleRsvp}
                  rsvpPending={rsvp.isPending}
                  onClick={() => event._type !== "stream" && setDetailEvent(event)}
                  isAdmin={isAdmin}
                  onEdit={() => event._type !== "stream" && setEditEvent(event)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Card key={i} className="p-6 animate-pulse space-y-3">
                  <div className="h-5 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </Card>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <Card className="p-12 text-center">
              <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="font-semibold text-foreground">Nenhum evento programado</h3>
              <p className="text-sm text-muted-foreground mt-1">Fique ligado! 📅</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredEvents.map((event: any) => (
                <EventCard
                  key={event.id}
                  event={event}
                  myRsvp={event._type === "stream" ? undefined : userRsvps?.[event.id]}
                  onRsvp={handleRsvp}
                  rsvpPending={rsvp.isPending}
                  onClick={() => event._type !== "stream" && setDetailEvent(event)}
                  isAdmin={isAdmin}
                  onEdit={() => event._type !== "stream" && setEditEvent(event)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      <EventFormModal
        open={showCreate || !!editEvent}
        onOpenChange={(open) => {
          if (!open) { setShowCreate(false); setEditEvent(null); }
        }}
        communityId={community?.id || ""}
        memberId={member?.id || ""}
        event={editEvent}
      />

      <EventDetailModal
        event={detailEvent}
        open={!!detailEvent}
        onOpenChange={(open) => !open && setDetailEvent(null)}
        myRsvp={detailEvent ? userRsvps?.[detailEvent.id] : undefined}
        onRsvp={handleRsvp}
        rsvpPending={rsvp.isPending}
      />
    </div>
  );
}

// ──────────── Event Card Component ────────────

interface EventCardProps {
  event: any;
  myRsvp?: string;
  onRsvp: (eventId: string, status: "GOING" | "MAYBE" | "NOT_GOING") => void;
  rsvpPending: boolean;
  onClick: () => void;
  isAdmin: boolean;
  onEdit: () => void;
}

function EventCard({ event, myRsvp, onRsvp, rsvpPending, onClick, isAdmin, onEdit }: EventCardProps) {
  const status = getEventStatus(event);
  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const duration = end ? Math.round((end.getTime() - start.getTime()) / 60000) : null;
  const isEnded = status.key === "past";
  const isLive = status.key === "live";
  const isStream = event._type === "stream";
  const hasCover = !!event.cover_image_url;

  return (
    <Card className={cn(
      "overflow-hidden group transition-shadow hover:shadow-md",
      isLive && "ring-2 ring-red-500/50",
      isStream && "ring-1 ring-primary/30"
    )}>
      {/* Cover image or gradient header */}
      <div
        className={cn(
          "relative cursor-pointer overflow-hidden",
          hasCover ? "h-36" : "h-24",
          !hasCover && isStream && "bg-gradient-to-br from-red-500/20 via-primary/10 to-primary/5",
          !hasCover && !isStream && "bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5"
        )}
        onClick={onClick}
      >
        {hasCover && (
          <img src={event.cover_image_url} alt="" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
        <div className="absolute bottom-3 left-4 right-4">
          <h3 className="font-bold text-white text-lg leading-tight drop-shadow-md line-clamp-2">{event.title}</h3>
          {event.description && (
            <p className="text-white/70 text-xs mt-0.5 line-clamp-1">{event.description}</p>
          )}
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {isStream && (
            <Badge className="bg-red-600 text-white border-0 text-[10px] gap-1">
              <Radio className="h-2.5 w-2.5" />
              LIVE
            </Badge>
          )}
          <Badge className={cn(status.color, "text-[10px]")}>{status.label}</Badge>
        </div>
        {/* Date overlay chip */}
        <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg px-2.5 py-1 text-center shadow-sm">
          <span className="text-xs font-bold text-foreground block leading-tight">{format(start, "dd")}</span>
          <span className="text-[10px] text-muted-foreground uppercase leading-tight">{format(start, "MMM", { locale: ptBR })}</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {/* Info row */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {format(start, "EEE, dd MMM yyyy", { locale: ptBR })}
          </span>
          {!event.is_all_day && (
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {format(start, "HH:mm")}
              {end && ` – ${format(end, "HH:mm")}`}
            </span>
          )}
          {event.meeting_platform && (
            <Badge variant="secondary" className="text-[10px] h-5">
              <Video className="h-2.5 w-2.5 mr-1" />
              {PLATFORM_LABELS[event.meeting_platform] || "Link"}
            </Badge>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {event.rsvp_count} {isStream ? "espectador" : "confirmado"}{event.rsvp_count !== 1 ? (isStream ? "es" : "s") : ""}
          </span>
        </div>

        {/* RSVP & Actions */}
        {!isEnded && event.status !== "CANCELLED" && !isStream && (
          <div className="flex items-center gap-2 flex-wrap">
            {(["GOING", "MAYBE", "NOT_GOING"] as const).map((s) => (
              <Button
                key={s}
                variant={myRsvp === s ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => onRsvp(event.id, s)}
                disabled={rsvpPending}
              >
                {s === "GOING" ? "✅ Vou" : s === "MAYBE" ? "🤔 Talvez" : "❌ Não vou"}
              </Button>
            ))}

            {isLive && event.meeting_url && (
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs" asChild>
                <a href={event.meeting_url} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3.5 w-3.5 mr-1" />Entrar
                </a>
              </Button>
            )}

            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={onEdit} className="ml-auto text-muted-foreground h-8 text-xs">
                Editar
              </Button>
            )}
          </div>
        )}

        {/* Stream actions */}
        {isStream && !isEnded && (
          <div className="flex items-center gap-2">
            {isLive && event.meeting_url && (
              <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs" asChild>
                <a href={event.meeting_url} target="_blank" rel="noopener noreferrer">
                  <Video className="h-3.5 w-3.5 mr-1" />Assistir ao vivo
                </a>
              </Button>
            )}
            <Badge variant="outline" className="text-[10px]">
              <Radio className="h-2.5 w-2.5 mr-1" />
              Transmissão ao vivo
            </Badge>
          </div>
        )}

        {isEnded && (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">✅ {event.rsvp_count} participaram</Badge>
          </div>
        )}
      </div>
    </Card>
  );
}
