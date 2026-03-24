import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Bell, CheckCheck, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";

const PAGE_SIZE = 20;

const NOTIFICATION_TEXTS: Record<string, (n: any) => string> = {
  POST_REPLY: (n) => `comentou no seu post: ${truncate(n.body)}`,
  COMMENT_REPLY: () => `respondeu ao seu comentário`,
  POST_LIKE: (n) => `curtiu seu post: ${truncate(n.body)}`,
  COMMENT_LIKE: () => `curtiu seu comentário`,
  MENTION: (n) => `mencionou você em: ${truncate(n.body)}`,
  NEW_EVENT: (n) => n.title,
  NEW_POST_IN_SPACE: (n) => n.title,
  MEMBER_JOINED: (n) => n.title,
  LEVEL_UP: (n) => n.title,
  POST_PINNED: () => `Seu post foi fixado por um admin`,
  EVENT_REMINDER: (n) => n.title,
  NEW_DM: (n) => n.title,
  REPORT_RESOLVED: (n) => n.title || `Sua denúncia foi analisada`,
  SUBSCRIPTION_PAST_DUE: (n) => n.title,
  SUBSCRIPTION_EXPIRED: (n) => n.title,
};

function truncate(s: string | null, max = 40) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max) + "…" : s;
}

function getNotificationRoute(n: any): string | null {
  if (n.type === "NEW_DM") return `/circle/messages`;
  if (n.type === "SUBSCRIPTION_PAST_DUE" || n.type === "SUBSCRIPTION_EXPIRED") return `/circle/feed`;
  if (n.post_id) return `/circle/post/${n.post_id}`;
  if (n.event_id) return `/circle/events`;
  if (n.type === "LEVEL_UP") return `/circle/leaderboard`;
  return null;
}

interface NotificationPanelProps {
  memberId: string;
  communityId: string;
  unreadCount: number;
}

export default function NotificationPanel({ memberId, communityId, unreadCount }: NotificationPanelProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  // Fetch notifications with pagination
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["circle-notifications", memberId],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data } = await supabase
        .from("community_notifications")
        .select("*, actor:community_members!community_notifications_actor_id_fkey(display_name, avatar_url)")
        .eq("recipient_id", memberId)
        .order("created_at", { ascending: false })
        .range(from, to);
      return data || [];
    },
    getNextPageParam: (lastPage, allPages) => {
      return lastPage.length === PAGE_SIZE ? allPages.length : undefined;
    },
    initialPageParam: 0,
    enabled: open,
  });

  const allNotifications = data?.pages.flat() || [];

  // Mark all as read
  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase
        .from("community_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("recipient_id", memberId)
        .eq("is_read", false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["circle-unread"] });
    },
  });

  // Mark single as read
  const markRead = useMutation({
    mutationFn: async (notifId: string) => {
      await supabase
        .from("community_notifications")
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq("id", notifId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["circle-unread"] });
    },
  });

  // Realtime subscription
  useEffect(() => {
    if (!memberId) return;

    const channel = supabase
      .channel(`notifications:${memberId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_notifications",
          filter: `recipient_id=eq.${memberId}`,
        },
        (payload) => {
          // Invalidate queries to refresh badge & list
          queryClient.invalidateQueries({ queryKey: ["circle-unread"] });
          queryClient.invalidateQueries({ queryKey: ["circle-notifications"] });

          // Show toast
          const n = payload.new as any;
          const text = NOTIFICATION_TEXTS[n.type]?.(n) || n.title;
          toast(text, {
            duration: 5000,
            action: n.post_id
              ? { label: "Ver", onClick: () => navigate(`/circle/post/${n.post_id}`) }
              : undefined,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, queryClient, navigate]);

  const handleClick = (n: any) => {
    if (!n.is_read) markRead.mutate(n.id);
    const route = getNotificationRoute(n);
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const target = e.target as HTMLDivElement;
      if (target.scrollHeight - target.scrollTop - target.clientHeight < 100 && hasNextPage && !isFetchingNextPage) {
        fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  const NotificationList = () => (
    <div className="flex flex-col h-full max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="font-semibold text-sm text-foreground">Notificações</h3>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="text-xs h-7 text-primary" onClick={() => markAllRead.mutate()}>
            <CheckCheck className="h-3.5 w-3.5 mr-1" />Marcar todas como lidas
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
        {allNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-3 text-muted-foreground/40" />
            <p className="text-sm">Nenhuma notificação por agora 🤫</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {allNotifications.map((n: any) => {
              const actorName = n.actor?.display_name || "";
              const typeText = NOTIFICATION_TEXTS[n.type];
              const displayText = typeText ? typeText(n) : n.title;
              const hasActor = n.actor_id && actorName && !["NEW_EVENT", "LEVEL_UP", "EVENT_REMINDER", "MEMBER_JOINED", "NEW_POST_IN_SPACE", "NEW_DM", "REPORT_RESOLVED", "SUBSCRIPTION_PAST_DUE", "SUBSCRIPTION_EXPIRED"].includes(n.type);

              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={cn(
                    "w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/50 transition-colors",
                    !n.is_read && "bg-primary/5"
                  )}
                >
                  <Avatar className="h-8 w-8 mt-0.5 flex-shrink-0">
                    {n.actor?.avatar_url ? (
                      <AvatarImage src={n.actor.avatar_url} />
                    ) : null}
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {actorName ? actorName[0].toUpperCase() : "🔔"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">
                      {hasActor && <span className="font-semibold">{actorName} </span>}
                      {displayText}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                  {!n.is_read && (
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  )}
                </button>
              );
            })}
            {isFetchingNextPage && (
              <div className="py-4 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary mx-auto" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const TriggerButton = (
    <Button variant="ghost" size="icon" className="relative h-8 w-8">
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <Badge className="absolute -top-1 -right-1 h-4 min-w-[16px] flex items-center justify-center p-0 px-1 text-[9px]">
          {unreadCount > 99 ? "99+" : unreadCount}
        </Badge>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{TriggerButton}</SheetTrigger>
        <SheetContent side="right" className="w-[320px] p-0">
          <NotificationList />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{TriggerButton}</PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        <NotificationList />
      </PopoverContent>
    </Popover>
  );
}
