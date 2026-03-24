import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, Search, ArrowLeft, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { createNotification } from "@/lib/notifications";

export default function CircleMessages() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [searchMembers, setSearchMembers] = useState("");
  const [showNewDM, setShowNewDM] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: community } = useQuery({
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).maybeSingle();
      return data;
    },
    enabled: !!currentWorkspace,
  });

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).maybeSingle();
      return data;
    },
    enabled: !!community && !!user,
  });

  // Get conversations
  const { data: conversations } = useQuery({
    queryKey: ["circle-conversations", member?.id],
    queryFn: async () => {
      if (!member) return [];
      const { data: memberships } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id, last_read_at")
        .eq("member_id", member.id);

      if (!memberships?.length) return [];

      const convIds = (memberships as any[]).map((m: any) => m.conversation_id);
      const readMap: Record<string, string | null> = {};
      (memberships as any[]).forEach((m: any) => { readMap[m.conversation_id] = m.last_read_at; });

      const { data: convMembers } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id, member_id")
        .in("conversation_id", convIds)
        .neq("member_id", member.id);

      if (!convMembers?.length) return [];

      const otherMemberIds = [...new Set((convMembers as any[]).map((cm: any) => cm.member_id))];
      const { data: members } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .in("id", otherMemberIds);

      const memberMap: Record<string, any> = {};
      members?.forEach((m: any) => { memberMap[m.id] = m; });

      const { data: lastMessages } = await supabase
        .from("community_messages" as any)
        .select("conversation_id, body, created_at, sender_id")
        .in("conversation_id", convIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      const lastMsgMap: Record<string, any> = {};
      (lastMessages as any[] || []).forEach((msg: any) => {
        if (!lastMsgMap[msg.conversation_id]) lastMsgMap[msg.conversation_id] = msg;
      });

      return convIds.map((convId: string) => {
        const otherMemberId = (convMembers as any[]).find((cm: any) => cm.conversation_id === convId)?.member_id;
        const otherMember = otherMemberId ? memberMap[otherMemberId] : null;
        const lastMsg = lastMsgMap[convId];
        const lastRead = readMap[convId];
        const hasUnread = lastMsg && (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead)) && lastMsg.sender_id !== member.id;

        return {
          id: convId,
          otherMember,
          lastMessage: lastMsg,
          hasUnread,
        };
      }).sort((a: any, b: any) => {
        const aTime = a.lastMessage?.created_at || "1970-01-01";
        const bTime = b.lastMessage?.created_at || "1970-01-01";
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },
    enabled: !!member,
  });

  // Messages for selected conversation — no polling, realtime handles it
  const { data: messages } = useQuery({
    queryKey: ["circle-messages", selectedConv],
    queryFn: async () => {
      if (!selectedConv) return [];
      const { data } = await supabase
        .from("community_messages" as any)
        .select("*")
        .eq("conversation_id", selectedConv)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!selectedConv,
  });

  // ── Realtime: new messages in selected conversation ──
  useEffect(() => {
    if (!selectedConv) return;

    const channel = supabase
      .channel(`dm:${selectedConv}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
          filter: `conversation_id=eq.${selectedConv}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["circle-messages", selectedConv] });
          queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConv, queryClient]);

  // ── Realtime: new messages across ALL conversations (for unread badges) ──
  useEffect(() => {
    if (!member || !community) return;

    // Get conversation IDs to filter realtime events
    const convIds = conversations?.map((c: any) => c.id) || [];

    const channel = supabase
      .channel(`dm-inbox:${member.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "community_messages",
        },
        (payload) => {
          const msg = payload.new as any;
          // Only process if it's in one of our conversations
          if (convIds.length > 0 && !convIds.includes(msg.conversation_id)) return;
          // Only refresh if it's not from me
          if (msg.sender_id !== member.id) {
            queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
            queryClient.invalidateQueries({ queryKey: ["circle-dm-unread"] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [member?.id, community?.id, queryClient, conversations]);

  // Mark as read when selecting conversation
  useEffect(() => {
    if (selectedConv && member) {
      supabase
        .from("community_conversation_members" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", selectedConv)
        .eq("member_id", member.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
          queryClient.invalidateQueries({ queryKey: ["circle-dm-unread"] });
        });
    }
  }, [selectedConv, member, messages?.length]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // Send message
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!member || !selectedConv || !messageBody.trim() || !community) return;
      const { error } = await supabase.from("community_messages" as any).insert({
        conversation_id: selectedConv,
        sender_id: member.id,
        body: messageBody.trim(),
      } as any);
      if (error) throw error;

      // Notify other member about new DM
      const convData = conversations?.find((c: any) => c.id === selectedConv);
      if (convData?.otherMember) {
        createNotification({
          communityId: community.id,
          recipientId: convData.otherMember.id,
          actorId: member.id,
          type: "NEW_DM",
          title: `💬 ${member.display_name || "Alguém"} te enviou uma mensagem`,
          body: messageBody.trim().slice(0, 80),
        });
      }
    },
    onSuccess: () => {
      setMessageBody("");
      queryClient.invalidateQueries({ queryKey: ["circle-messages", selectedConv] });
      queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
    },
    onError: () => toast.error("Erro ao enviar mensagem"),
  });

  // Search members for new DM
  const { data: searchResults } = useQuery({
    queryKey: ["circle-member-search", community?.id, searchMembers],
    queryFn: async () => {
      if (!community || searchMembers.length < 2) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .eq("community_id", community.id)
        .eq("status", "ACTIVE")
        .neq("id", member?.id || "")
        .ilike("display_name", `%${searchMembers}%`)
        .limit(10);
      return data || [];
    },
    enabled: !!community && searchMembers.length >= 2,
  });

  // Start new conversation
  const startConversation = useMutation({
    mutationFn: async (targetMemberId: string) => {
      if (!member || !community) throw new Error("Missing");

      const { data: myConvs } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id")
        .eq("member_id", member.id);

      if (myConvs?.length) {
        const myConvIds = (myConvs as any[]).map((c: any) => c.conversation_id);
        const { data: existing } = await supabase
          .from("community_conversation_members" as any)
          .select("conversation_id")
          .eq("member_id", targetMemberId)
          .in("conversation_id", myConvIds);

        if (existing?.length) {
          return (existing as any[])[0].conversation_id;
        }
      }

      const { data: conv, error } = await supabase
        .from("community_conversations" as any)
        .insert({ community_id: community.id } as any)
        .select()
        .single();
      if (error) throw error;

      await supabase.from("community_conversation_members" as any).insert([
        { conversation_id: (conv as any).id, member_id: member.id },
        { conversation_id: (conv as any).id, member_id: targetMemberId },
      ] as any);

      return (conv as any).id;
    },
    onSuccess: (convId) => {
      setSelectedConv(convId);
      setShowNewDM(false);
      setSearchMembers("");
      queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
    },
    onError: () => toast.error("Erro ao criar conversa"),
  });

  // Unread DM count (used by CircleLayout)
  const totalUnreadDMs = conversations?.filter((c: any) => c.hasUnread).length || 0;

  const selectedConvData = conversations?.find((c: any) => c.id === selectedConv);

  return (
    <div className="max-w-4xl mx-auto p-4 h-[calc(100vh-120px)]">
      <div className="flex h-full gap-4">
        {/* Conversation List */}
        <div className={cn(
          "w-80 flex-shrink-0 flex flex-col bg-card rounded-xl border border-border",
          selectedConv && "hidden md:flex"
        )}>
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-sm text-foreground">Mensagens</h2>
            <Button size="sm" variant="outline" onClick={() => setShowNewDM(!showNewDM)}>
              Nova DM
            </Button>
          </div>

          {showNewDM && (
            <div className="p-3 border-b border-border space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar membro..."
                  value={searchMembers}
                  onChange={(e) => setSearchMembers(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
              {searchResults?.map((m: any) => (
                <button
                  key={m.id}
                  onClick={() => startConversation.mutate(m.id)}
                  className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted/50 text-left"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={m.avatar_url || ""} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                      {(m.display_name || "U")[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm truncate">{m.display_name}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {(!conversations || conversations.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-center px-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">Nenhuma conversa ainda</p>
              </div>
            )}
            {conversations?.map((conv: any) => (
              <button
                key={conv.id}
                onClick={() => setSelectedConv(conv.id)}
                className={cn(
                  "flex items-center gap-3 w-full p-3 text-left hover:bg-muted/50 border-b border-border/50",
                  selectedConv === conv.id && "bg-muted/70",
                  conv.hasUnread && "bg-primary/5"
                )}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={conv.otherMember?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(conv.otherMember?.display_name || "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={cn("text-sm truncate", conv.hasUnread && "font-semibold")}>
                      {conv.otherMember?.display_name || "Membro"}
                    </span>
                    {conv.lastMessage && (
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatDistanceToNow(new Date(conv.lastMessage.created_at), { addSuffix: false, locale: ptBR })}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {conv.lastMessage.body}
                    </p>
                  )}
                </div>
                {conv.hasUnread && (
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages Panel */}
        <div className={cn(
          "flex-1 flex flex-col bg-card rounded-xl border border-border",
          !selectedConv && "hidden md:flex"
        )}>
          {!selectedConv ? (
            <div className="flex items-center justify-center h-full text-center">
              <div>
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-3 border-b border-border flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setSelectedConv(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={selectedConvData?.otherMember?.avatar_url || ""} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(selectedConvData?.otherMember?.display_name || "U")[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm">{selectedConvData?.otherMember?.display_name || "Membro"}</span>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages?.map((msg: any) => {
                  const isMine = msg.sender_id === member?.id;
                  return (
                    <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "max-w-[70%] rounded-2xl px-4 py-2",
                        isMine ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      )}>
                        <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                        <p className={cn(
                          "text-[10px] mt-1",
                          isMine ? "text-primary-foreground/70" : "text-muted-foreground"
                        )}>
                          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-3 border-t border-border">
                <form
                  onSubmit={(e) => { e.preventDefault(); sendMessage.mutate(); }}
                  className="flex gap-2"
                >
                  <Textarea
                    placeholder="Digite sua mensagem..."
                    value={messageBody}
                    onChange={(e) => setMessageBody(e.target.value)}
                    rows={1}
                    className="resize-none text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage.mutate();
                      }
                    }}
                  />
                  <Button type="submit" size="icon" disabled={!messageBody.trim() || sendMessage.isPending}>
                    <Send className="h-4 w-4" />
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
