import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { UserX } from "lucide-react";
import { toast } from "sonner";

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

export default function ChatSection({ userId, userCommunities }: Props) {
  const queryClient = useQueryClient();

  // ── Global chat prefs ──
  const { data: chatPrefs, isLoading: loadingGlobal } = useQuery({
    queryKey: ["user-chat-prefs", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_chat_preferences" as any)
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      return (data as any) || null;
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const upsertGlobal = useMutation({
    mutationFn: async (updates: Record<string, boolean>) => {
      const { error } = await (supabase as any)
        .from("user_chat_preferences")
        .upsert({ user_id: userId, ...updates }, { onConflict: "user_id" });
      if (error) throw error;
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ["user-chat-prefs", userId] });
      const prev = queryClient.getQueryData(["user-chat-prefs", userId]);
      queryClient.setQueryData(["user-chat-prefs", userId], (old: any) => ({
        ...(old || { chat_notifications_enabled: true, chat_email_enabled: false }),
        ...updates,
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["user-chat-prefs", userId], ctx.prev);
      toast.error("Não foi possível salvar. Tente novamente.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["user-chat-prefs", userId] }),
  });

  // ── Per-community chat prefs ──
  const { data: communityPrefs = [], isLoading: loadingCommunity } = useQuery({
    queryKey: ["community-chat-prefs", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_chat_preferences" as any)
        .select("*")
        .eq("user_id", userId);
      return (data as any[]) || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const upsertCommunityChat = useMutation({
    mutationFn: async ({ communityId, chat_enabled }: { communityId: string; chat_enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from("community_chat_preferences")
        .upsert({ user_id: userId, community_id: communityId, chat_enabled }, { onConflict: "user_id,community_id" });
      if (error) throw error;
    },
    onMutate: async ({ communityId, chat_enabled }) => {
      await queryClient.cancelQueries({ queryKey: ["community-chat-prefs", userId] });
      const prev = queryClient.getQueryData(["community-chat-prefs", userId]);
      queryClient.setQueryData(["community-chat-prefs", userId], (old: any[]) => {
        const list = old || [];
        const idx = list.findIndex((p: any) => p.community_id === communityId);
        if (idx >= 0) {
          const updated = [...list];
          updated[idx] = { ...updated[idx], chat_enabled };
          return updated;
        }
        return [...list, { user_id: userId, community_id: communityId, chat_enabled }];
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev !== undefined) queryClient.setQueryData(["community-chat-prefs", userId], ctx.prev);
      toast.error("Não foi possível salvar. Tente novamente.");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["community-chat-prefs", userId] }),
  });

  // ── Blocked users ──
  const { data: blockedUsers = [], isLoading: loadingBlocked } = useQuery({
    queryKey: ["blocked-users", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("blocked_users" as any)
        .select("*")
        .eq("user_id", userId);
      return (data as any[]) || [];
    },
    enabled: !!userId,
    staleTime: 30_000,
  });

  const unblockUser = useMutation({
    mutationFn: async (blockedUserId: string) => {
      const { error } = await (supabase as any)
        .from("blocked_users")
        .delete()
        .eq("user_id", userId)
        .eq("blocked_user_id", blockedUserId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["blocked-users", userId] });
      toast.success("Usuário desbloqueado");
    },
    onError: () => toast.error("Erro ao desbloquear usuário"),
  });

  const getChatEnabled = useCallback((communityId: string): boolean => {
    const pref = (communityPrefs as any[]).find((p: any) => p.community_id === communityId);
    return pref ? pref.chat_enabled : true;
  }, [communityPrefs]);

  const notificationsEnabled = chatPrefs?.chat_notifications_enabled ?? true;
  const emailEnabled = chatPrefs?.chat_email_enabled ?? false;

  if (loadingGlobal || loadingCommunity || loadingBlocked) {
    return (
      <Card className="p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-56" />
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Chat</h3>
        <p className="text-sm text-muted-foreground mb-4">Gerencie suas preferências de mensagens</p>

        {/* Notifications toggle */}
        <div className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium text-foreground text-sm">Notificações de chat</p>
            <p className="text-xs text-muted-foreground mt-0.5">Som e alerta quando alguém enviar uma mensagem</p>
          </div>
          <Switch
            checked={notificationsEnabled}
            onCheckedChange={(v) => upsertGlobal.mutate({ chat_notifications_enabled: v })}
          />
        </div>
        <Separator />

        {/* Email toggle */}
        <div className="flex items-center justify-between py-4">
          <div>
            <p className="font-medium text-foreground text-sm">Notificações por email</p>
            <p className="text-xs text-muted-foreground mt-0.5">Receber email quando estiver offline e houver mensagens não lidas</p>
          </div>
          <Switch
            checked={emailEnabled}
            onCheckedChange={(v) => upsertGlobal.mutate({ chat_email_enabled: v })}
          />
        </div>
      </Card>

      {/* Per-community chat control */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Quem pode me enviar mensagem?</h3>
        <p className="text-sm text-muted-foreground mb-4">Controle por comunidade quem pode iniciar conversas com você</p>

        {userCommunities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Você não participa de nenhuma comunidade.</p>
        ) : (
          <div className="space-y-1">
            {userCommunities.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-3 rounded-lg hover:bg-muted/30 transition-colors">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  {c.icon_url && <AvatarImage src={c.icon_url} />}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {c.name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="flex-1 text-sm font-medium text-foreground truncate">{c.name}</span>
                <Select
                  value={getChatEnabled(c.id) ? "on" : "off"}
                  onValueChange={(v) => upsertCommunityChat.mutate({ communityId: c.id, chat_enabled: v === "on" })}
                >
                  <SelectTrigger className="w-[100px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="on">Chat on</SelectItem>
                    <SelectItem value="off">Chat off</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Blocked users */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">Usuários bloqueados</h3>
        <p className="text-sm text-muted-foreground mb-4">Gerencie sua lista de bloqueio</p>

        {(blockedUsers as any[]).length === 0 ? (
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <UserX className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">Você não bloqueou nenhum usuário.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {(blockedUsers as any[]).map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {b.blocked_user_id?.slice(0, 2)?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-foreground">{b.blocked_user_id}</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => unblockUser.mutate(b.blocked_user_id)}
                >
                  Desbloquear
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
