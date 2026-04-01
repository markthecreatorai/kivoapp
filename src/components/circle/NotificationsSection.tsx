import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ChevronDown, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CommunityItem {
  id: string;
  name: string;
  icon_url?: string | null;
  slug?: string;
  role?: string;
}

interface Props {
  userId: string;
  userCommunities: CommunityItem[];
}

const GLOBAL_TOGGLES = [
  { key: "new_follower_enabled", label: "Novo seguidor", description: "Quando alguém começar a seguir você" },
  { key: "likes_enabled", label: "Curtidas", description: "Quando alguém curtir seus posts ou comentários" },
  { key: "kaching_enabled", label: "Vendas / Recebimentos", description: "Notificações de vendas e pagamentos recebidos" },
  { key: "affiliate_referral_enabled", label: "Referral de afiliado", description: "Quando alguém se cadastrar pelo seu link" },
] as const;

type GlobalKey = typeof GLOBAL_TOGGLES[number]["key"];

const DIGEST_OPTIONS = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
  { value: "never", label: "Nunca" },
];

const NOTIF_EMAIL_OPTIONS = [
  { value: "hourly", label: "A cada hora" },
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "never", label: "Nunca" },
];

export default function NotificationsSection({ userId, userCommunities }: Props) {
  const queryClient = useQueryClient();
  const [expandedCommunity, setExpandedCommunity] = useState<string | null>(null);

  // ── Global prefs ──
  const { data: globalPrefs, isLoading: loadingGlobal } = useQuery({
    queryKey: ["user-notification-prefs", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_notification_preferences" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as any) || null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const upsertGlobal = useMutation({
    mutationFn: async (updates: Partial<Record<GlobalKey, boolean>>) => {
      const payload = {
        user_id: userId,
        ...updates,
      };
      const { error } = await (supabase as any)
        .from("user_notification_preferences")
        .upsert(payload, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["user-notification-prefs", userId] });
      const prev = queryClient.getQueryData(["user-notification-prefs", userId]);
      queryClient.setQueryData(["user-notification-prefs", userId], (old: any) => ({
        ...(old || { new_follower_enabled: true, likes_enabled: true, kaching_enabled: true, affiliate_referral_enabled: true }),
        ...updates,
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["user-notification-prefs", userId], ctx.prev);
      toast.error("Não foi possível salvar. Tente novamente.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user-notification-prefs", userId] }),
  });

  const getGlobalValue = (key: GlobalKey): boolean => {
    if (!globalPrefs) return true; // default on
    return (globalPrefs as any)[key] ?? true;
  };

  // ── Community prefs ──
  const { data: communityPrefs = [], isLoading: loadingCommunity } = useQuery({
    queryKey: ["community-notification-prefs", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_notification_preferences" as any)
        .select("*")
        .eq("user_id", userId);
      return (data as any[]) || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const upsertCommunityPref = useMutation({
    mutationFn: async ({ communityId, updates }: { communityId: string; updates: Record<string, any> }) => {
      const payload = {
        user_id: userId,
        community_id: communityId,
        ...updates,
      };
      const { error } = await (supabase as any)
        .from("community_notification_preferences")
        .upsert(payload, { onConflict: "user_id,community_id" });
      if (error) throw error;
    },
    onMutate: async ({ communityId, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["community-notification-prefs", userId] });
      const prev = queryClient.getQueryData(["community-notification-prefs", userId]);
      queryClient.setQueryData(["community-notification-prefs", userId], (old: any[]) => {
        const list = old || [];
        const idx = list.findIndex((p: any) => p.community_id === communityId);
        const defaults = {
          user_id: userId,
          community_id: communityId,
          digest_frequency: "daily",
          notifications_frequency: "daily",
          admin_announcements_enabled: true,
          event_reminder_enabled: true,
        };
        if (idx >= 0) {
          const updated = [...list];
          updated[idx] = { ...updated[idx], ...updates };
          return updated;
        }
        return [...list, { ...defaults, ...updates }];
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["community-notification-prefs", userId], ctx.prev);
      toast.error("Não foi possível salvar. Tente novamente.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["community-notification-prefs", userId] }),
  });

  const getCommunityPref = useCallback((communityId: string) => {
    return (communityPrefs as any[]).find((p: any) => p.community_id === communityId) || {
      digest_frequency: "daily",
      notifications_frequency: "daily",
      admin_announcements_enabled: true,
      event_reminder_enabled: true,
    };
  }, [communityPrefs]);

  if (loadingGlobal || loadingCommunity) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64" />
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Global toggles */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Notificações</h3>
        <p className="text-sm text-muted-foreground mb-4">Gerencie suas preferências de notificação</p>

        {GLOBAL_TOGGLES.map((item, i) => (
          <div key={item.key}>
            <div className="flex items-center justify-between py-4">
              <div>
                <p className="font-medium text-foreground text-sm">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
              <Switch
                checked={getGlobalValue(item.key)}
                onCheckedChange={(v) => upsertGlobal.mutate({ [item.key]: v })}
              />
            </div>
            {i < GLOBAL_TOGGLES.length - 1 && <Separator />}
          </div>
        ))}
      </Card>

      {/* Per-community */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Comunidades</h3>
        <p className="text-sm text-muted-foreground mb-4">Configurações de notificação por comunidade</p>

        {userCommunities.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <Inbox className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Você ainda não participa de nenhuma comunidade</p>
          </div>
        ) : (
          <div className="space-y-1">
            {userCommunities.map((c) => {
              const pref = getCommunityPref(c.id);
              const isOpen = expandedCommunity === c.id;

              return (
                <Collapsible key={c.id} open={isOpen} onOpenChange={(v) => setExpandedCommunity(v ? c.id : null)}>
                  <CollapsibleTrigger className="w-full flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      {c.icon_url && <AvatarImage src={c.icon_url} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs">
                        {c.name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 text-left text-sm font-medium text-foreground truncate">{c.name}</span>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                  </CollapsibleTrigger>

                  <CollapsibleContent className="px-3 pb-4 pt-1 ml-11 space-y-4">
                    {/* Digest email */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Resumo por email</p>
                        <p className="text-xs text-muted-foreground">Frequência do digest</p>
                      </div>
                      <Select
                        value={pref.digest_frequency}
                        onValueChange={(v) => upsertCommunityPref.mutate({ communityId: c.id, updates: { digest_frequency: v } })}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DIGEST_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Notifications email */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Emails de notificação</p>
                        <p className="text-xs text-muted-foreground">Frequência dos emails</p>
                      </div>
                      <Select
                        value={pref.notifications_frequency}
                        onValueChange={(v) => upsertCommunityPref.mutate({ communityId: c.id, updates: { notifications_frequency: v } })}
                      >
                        <SelectTrigger className="w-[120px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {NOTIF_EMAIL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Admin announcements */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Anúncios da administração</p>
                        <p className="text-xs text-muted-foreground">Receber avisos de admins</p>
                      </div>
                      <Switch
                        checked={pref.admin_announcements_enabled}
                        onCheckedChange={(v) => upsertCommunityPref.mutate({ communityId: c.id, updates: { admin_announcements_enabled: v } })}
                      />
                    </div>

                    {/* Event reminders */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">Lembrete de eventos</p>
                        <p className="text-xs text-muted-foreground">Receber lembretes por email</p>
                      </div>
                      <Switch
                        checked={pref.event_reminder_enabled}
                        onCheckedChange={(v) => upsertCommunityPref.mutate({ communityId: c.id, updates: { event_reminder_enabled: v } })}
                      />
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
