import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Mail,
  Search,
  Send,
  ArrowLeft,
  MessageSquare,
  X,
  CheckCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { createNotification } from "@/lib/notifications";
import { useIsMobile } from "@/hooks/use-mobile";

interface MessagesPopoverProps {
  memberId: string;
  communityId: string;
  memberDisplayName?: string;
  unreadCount: number;
}

export default function MessagesPopover({
  memberId,
  communityId,
  memberDisplayName,
  unreadCount,
}: MessagesPopoverProps) {
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [convSearch, setConvSearch] = useState("");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [searchMembers, setSearchMembers] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Conversations ──
  const { data: conversations, isLoading: convsLoading } = useQuery({
    queryKey: ["circle-conversations", memberId],
    queryFn: async () => {
      const { data: memberships } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id, last_read_at")
        .eq("member_id", memberId);
      if (!memberships?.length) return [];

      const convIds = (memberships as any[]).map((m: any) => m.conversation_id);
      const readMap: Record<string, string | null> = {};
      (memberships as any[]).forEach((m: any) => { readMap[m.conversation_id] = m.last_read_at; });

      const { data: convMembers } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id, member_id")
        .in("conversation_id", convIds)
        .neq("member_id", memberId);
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
        const hasUnread = lastMsg && (!lastRead || new Date(lastMsg.created_at) > new Date(lastRead)) && lastMsg.sender_id !== memberId;
        return { id: convId, otherMember, lastMessage: lastMsg, hasUnread };
      }).sort((a: any, b: any) => {
        const aTime = a.lastMessage?.created_at || "1970-01-01";
        const bTime = b.lastMessage?.created_at || "1970-01-01";
        return new Date(bTime).getTime() - new Date(aTime).getTime();
      });
    },
    enabled: !!memberId && popoverOpen,
  });

  // ── Messages for active chat ──
  const { data: messages, isLoading: msgsLoading } = useQuery({
    queryKey: ["circle-messages", chatConvId],
    queryFn: async () => {
      if (!chatConvId) return [];
      const { data } = await supabase
        .from("community_messages" as any)
        .select("*")
        .eq("conversation_id", chatConvId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });
      return (data as any[]) || [];
    },
    enabled: !!chatConvId,
  });

  // ── Realtime for active chat ──
  useEffect(() => {
    if (!chatConvId) return;
    const channel = supabase
      .channel(`dm-popup:${chatConvId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "community_messages",
        filter: `conversation_id=eq.${chatConvId}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["circle-messages", chatConvId] });
        queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [chatConvId, queryClient]);

  // ── Realtime for inbox unread ──
  useEffect(() => {
    if (!memberId || !popoverOpen) return;
    const channel = supabase
      .channel(`dm-inbox-popup:${memberId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "community_messages",
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id !== memberId) {
          queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
          queryClient.invalidateQueries({ queryKey: ["circle-dm-unread"] });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [memberId, popoverOpen, queryClient]);

  // Mark as read
  useEffect(() => {
    if (chatConvId && memberId) {
      supabase
        .from("community_conversation_members" as any)
        .update({ last_read_at: new Date().toISOString() } as any)
        .eq("conversation_id", chatConvId)
        .eq("member_id", memberId)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
          queryClient.invalidateQueries({ queryKey: ["circle-dm-unread"] });
        });
    }
  }, [chatConvId, memberId, messages?.length]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages?.length]);

  // Send message
  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!chatConvId || !messageBody.trim()) return;
      const { error } = await supabase.from("community_messages" as any).insert({
        conversation_id: chatConvId,
        sender_id: memberId,
        body: messageBody.trim(),
      } as any);
      if (error) throw error;

      const convData = conversations?.find((c: any) => c.id === chatConvId);
      if (convData?.otherMember) {
        createNotification({
          communityId,
          recipientId: convData.otherMember.id,
          actorId: memberId,
          type: "NEW_DM",
          title: `💬 ${memberDisplayName || "Alguém"} te enviou uma mensagem`,
          body: messageBody.trim().slice(0, 80),
        });
      }
    },
    onSuccess: () => {
      setMessageBody("");
      queryClient.invalidateQueries({ queryKey: ["circle-messages", chatConvId] });
      queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
    },
    onError: () => toast.error("Erro ao enviar mensagem"),
  });

  // Search members
  const { data: searchResults } = useQuery({
    queryKey: ["circle-member-search", communityId, searchMembers],
    queryFn: async () => {
      if (searchMembers.length < 2) return [];
      const { data } = await supabase
        .from("community_members")
        .select("id, display_name, avatar_url")
        .eq("community_id", communityId)
        .eq("status", "ACTIVE")
        .neq("id", memberId)
        .ilike("display_name", `%${searchMembers}%`)
        .limit(10);
      return data || [];
    },
    enabled: searchMembers.length >= 2,
  });

  // Start new conversation
  const startConversation = useMutation({
    mutationFn: async (targetMemberId: string) => {
      const { data: myConvs } = await supabase
        .from("community_conversation_members" as any)
        .select("conversation_id")
        .eq("member_id", memberId);
      if (myConvs?.length) {
        const myConvIds = (myConvs as any[]).map((c: any) => c.conversation_id);
        const { data: existing } = await supabase
          .from("community_conversation_members" as any)
          .select("conversation_id")
          .eq("member_id", targetMemberId)
          .in("conversation_id", myConvIds);
        if (existing?.length) return (existing as any[])[0].conversation_id;
      }
      const { data: conv, error } = await supabase
        .from("community_conversations" as any)
        .insert({ community_id: communityId } as any)
        .select()
        .single();
      if (error) throw error;
      await supabase.from("community_conversation_members" as any).insert([
        { conversation_id: (conv as any).id, member_id: memberId },
        { conversation_id: (conv as any).id, member_id: targetMemberId },
      ] as any);
      return (conv as any).id;
    },
    onSuccess: (convId) => {
      setChatConvId(convId);
      setShowNewDM(false);
      setSearchMembers("");
      queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
    },
    onError: () => toast.error("Erro ao criar conversa"),
  });

  const markAllRead = async () => {
    if (!conversations?.length) return;
    const ids = conversations.map((c: any) => c.id);
    await supabase
      .from("community_conversation_members" as any)
      .update({ last_read_at: new Date().toISOString() } as any)
      .eq("member_id", memberId)
      .in("conversation_id", ids);
    queryClient.invalidateQueries({ queryKey: ["circle-conversations"] });
    queryClient.invalidateQueries({ queryKey: ["circle-dm-unread"] });
    toast.success("Mensagens marcadas como lidas");
  };

  const filteredConversations = (conversations || [])
    .filter((c: any) => {
      const matchesUnread = !showUnreadOnly || c.hasUnread;
      const matchesSearch = !convSearch.trim() || (c.otherMember?.display_name || "").toLowerCase().includes(convSearch.toLowerCase());
      return matchesUnread && matchesSearch;
    })
    .sort((a: any, b: any) => {
      if (a.hasUnread && !b.hasUnread) return -1;
      if (!a.hasUnread && b.hasUnread) return 1;
      return new Date(b.lastMessage?.created_at || 0).getTime() - new Date(a.lastMessage?.created_at || 0).getTime();
    });

  const selectedConvData = conversations?.find((c: any) => c.id === chatConvId);

  const openChat = (convId: string) => {
    setChatConvId(convId);
    setPopoverOpen(false);
  };

  const closeChat = () => {
    setChatConvId(null);
    setMessageBody("");
  };

  // ── Inbox content (shared between popover and mobile sheet) ──
  const inboxContent = (
    <div className="flex flex-col h-full max-h-[460px]">
      {/* Header */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-foreground">Mensagens</h3>
          <div className="flex items-center gap-1.5">
            {(conversations?.filter((c: any) => c.hasUnread).length || 0) > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 px-2" onClick={markAllRead}>
                <CheckCheck className="h-3 w-3" />
                Marcar lidas
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setShowNewDM(!showNewDM)}>
              Nova DM
            </Button>
          </div>
        </div>
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            className="h-7 text-xs px-2"
            variant={showUnreadOnly ? "default" : "outline"}
            onClick={() => setShowUnreadOnly((v) => !v)}
          >
            Não lidas
          </Button>
        </div>
      </div>

      {/* New DM search */}
      {showNewDM && (
        <div className="p-3 border-b border-border space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              placeholder="Buscar membro..."
              value={searchMembers}
              onChange={(e) => setSearchMembers(e.target.value)}
              className="pl-7 h-7 text-xs"
            />
          </div>
          {searchResults?.map((m: any) => (
            <button
              key={m.id}
              onClick={() => startConversation.mutate(m.id)}
              className="flex items-center gap-2 w-full p-1.5 rounded-lg hover:bg-muted/50 text-left"
            >
              <Avatar className="h-6 w-6">
                <AvatarImage src={m.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-[9px]">
                  {(m.display_name || "U")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs truncate">{m.display_name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {convsLoading && (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-36" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!convsLoading && (!conversations || conversations.length === 0) && (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare className="h-7 w-7 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">Nenhuma conversa ainda</p>
          </div>
        )}

        {!convsLoading && conversations && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-32 text-center px-4">
            <MessageSquare className="h-7 w-7 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
          </div>
        )}

        {filteredConversations.map((conv: any) => (
          <button
            key={conv.id}
            onClick={() => openChat(conv.id)}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-muted/50 transition-colors border-b border-border/30",
              conv.hasUnread && "bg-primary/5"
            )}
          >
            <div className="relative">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={conv.otherMember?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {(conv.otherMember?.display_name || "U")[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {conv.hasUnread && (
                <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary border-2 border-card" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className={cn("text-sm truncate", conv.hasUnread && "font-semibold")}>
                  {conv.otherMember?.display_name || "Membro"}
                </span>
                {conv.lastMessage && (
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
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
          </button>
        ))}
      </div>
    </div>
  );

  // ── Chat modal content ──
  const chatContent = (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="p-3 border-b border-border flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={closeChat}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarImage src={selectedConvData?.otherMember?.avatar_url || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary text-xs">
            {(selectedConvData?.otherMember?.display_name || "U")[0].toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <span className="font-medium text-sm truncate block">
            {selectedConvData?.otherMember?.display_name || "Membro"}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeChat}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {msgsLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={cn("flex", i % 2 === 0 ? "justify-end" : "justify-start")}>
                <Skeleton className="h-10 w-40 rounded-2xl" />
              </div>
            ))}
          </div>
        )}
        {messages?.map((msg: any) => {
          const isMine = msg.sender_id === memberId;
          return (
            <div key={msg.id} className={cn("flex", isMine ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[82%] rounded-2xl px-4 py-2.5",
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

      {/* Composer */}
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
            className="resize-none text-sm min-h-[36px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage.mutate();
              }
            }}
          />
          <Button type="submit" size="icon" className="shrink-0" disabled={!messageBody.trim() || sendMessage.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {/* Popover trigger */}
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <button
            className="relative h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Mensagens"
          >
            <Mail className="h-4 w-4" />
            {unreadCount > 0 && (
              <div className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[9px] font-bold px-1">
                {unreadCount > 99 ? "99+" : unreadCount}
              </div>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[360px] p-0 rounded-xl shadow-lg"
        >
          {inboxContent}
        </PopoverContent>
      </Popover>

      {/* Chat modal */}
      <Dialog open={!!chatConvId} onOpenChange={(open) => { if (!open) closeChat(); }}>
        <DialogContent
          className={cn(
            "p-0 gap-0 overflow-hidden",
            isMobile
              ? "h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none border-0 translate-x-0 translate-y-0 top-0 left-0 data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom"
              : "h-[70vh] max-h-[600px] w-full max-w-lg rounded-xl"
          )}
          overlayClassName={isMobile ? "bg-background" : undefined}
        >
          <DialogTitle className="sr-only">
            Chat com {selectedConvData?.otherMember?.display_name || "Membro"}
          </DialogTitle>
          {chatContent}
        </DialogContent>
      </Dialog>
    </>
  );
}
