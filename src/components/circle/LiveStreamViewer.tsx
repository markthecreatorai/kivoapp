import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Users, Send, MessageCircle, Radio } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { extractYouTubeId, extractTwitchChannel } from "./LiveStreamFormModal";

interface LiveStreamViewerProps {
  stream: any;
  open: boolean;
  onClose: () => void;
  memberId?: string;
  memberName?: string;
  memberAvatar?: string;
  isAdmin?: boolean;
  onEdit?: (stream: any) => void;
}

function EmbedPlayer({ stream }: { stream: any }) {
  if (stream.embed_type === "youtube") {
    const videoId = extractYouTubeId(stream.embed_url);
    if (!videoId) return <div className="bg-muted flex items-center justify-center h-full text-muted-foreground">URL inválida</div>;
    return (
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?autoplay=1`}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={stream.title}
      />
    );
  }

  if (stream.embed_type === "twitch") {
    const channel = extractTwitchChannel(stream.embed_url);
    if (!channel) return <div className="bg-muted flex items-center justify-center h-full text-muted-foreground">URL inválida</div>;
    return (
      <iframe
        src={`https://player.twitch.tv/?channel=${channel}&parent=${window.location.hostname}`}
        className="w-full h-full"
        allowFullScreen
        title={stream.title}
      />
    );
  }

  return (
    <div className="bg-muted flex items-center justify-center h-full">
      <a href={stream.embed_url} target="_blank" rel="noopener noreferrer" className="text-primary underline">
        Abrir transmissão externa
      </a>
    </div>
  );
}

export default function LiveStreamViewer({ stream, open, onClose, memberId, memberName, memberAvatar }: LiveStreamViewerProps) {
  const queryClient = useQueryClient();
  const [chatMessage, setChatMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showChat, setShowChat] = useState(true);

  // Fetch chat messages
  const { data: messages } = useQuery({
    queryKey: ["stream-chat", stream?.id],
    queryFn: async () => {
      if (!stream?.id) return [];
      const { data } = await supabase
        .from("live_stream_messages" as any)
        .select("*, member:member_id(display_name, avatar_url)")
        .eq("stream_id", stream.id)
        .order("created_at", { ascending: true })
        .limit(200);
      return (data || []) as any[];
    },
    enabled: !!stream?.id && stream?.chat_enabled,
    refetchInterval: 3000,
  });

  // Fetch viewer count
  const { data: viewerCount } = useQuery({
    queryKey: ["stream-viewers", stream?.id],
    queryFn: async () => {
      if (!stream?.id) return 0;
      const { count } = await supabase
        .from("live_stream_viewers" as any)
        .select("*", { count: "exact", head: true })
        .eq("stream_id", stream.id)
        .is("left_at", null);
      return count || 0;
    },
    enabled: !!stream?.id,
    refetchInterval: 10000,
  });

  // Register as viewer
  useEffect(() => {
    if (!stream?.id || !memberId) return;

    supabase
      .from("live_stream_viewers" as any)
      .upsert({ stream_id: stream.id, member_id: memberId, joined_at: new Date().toISOString(), left_at: null } as any, { onConflict: "stream_id,member_id" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["stream-viewers", stream.id] }));

    return () => {
      supabase
        .from("live_stream_viewers" as any)
        .update({ left_at: new Date().toISOString() } as any)
        .eq("stream_id", stream.id)
        .eq("member_id", memberId)
        .then(() => {});
    };
  }, [stream?.id, memberId]);

  // Realtime chat subscription
  useEffect(() => {
    if (!stream?.id || !stream?.chat_enabled) return;

    const channel = supabase
      .channel(`stream-chat-${stream.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "live_stream_messages",
        filter: `stream_id=eq.${stream.id}`,
      }, () => {
        queryClient.invalidateQueries({ queryKey: ["stream-chat", stream.id] });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [stream?.id, stream?.chat_enabled]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!memberId || !chatMessage.trim()) return;
      const { error } = await supabase
        .from("live_stream_messages" as any)
        .insert({ stream_id: stream.id, member_id: memberId, body: chatMessage.trim() } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setChatMessage("");
      queryClient.invalidateQueries({ queryKey: ["stream-chat", stream.id] });
    },
  });

  const handleSend = useCallback(() => {
    if (chatMessage.trim()) sendMessage.mutate();
  }, [chatMessage]);

  if (!stream) return null;

  const isLive = stream.status === "LIVE";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] p-0 gap-0 overflow-hidden">
        <div className="flex h-full">
          {/* Video area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3 min-w-0">
                {isLive && (
                  <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                    <Radio className="h-3 w-3" />
                    AO VIVO
                  </span>
                )}
                <h2 className="text-sm font-bold text-foreground truncate">{stream.title}</h2>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">{viewerCount || 0}</span>
                </div>
                {stream.chat_enabled && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowChat(!showChat)}
                    className={cn(showChat && "bg-muted")}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Player */}
            <div className="flex-1 bg-black">
              <EmbedPlayer stream={stream} />
            </div>

            {/* Description */}
            {stream.description && (
              <div className="px-4 py-2 border-t border-border">
                <p className="text-xs text-muted-foreground line-clamp-2">{stream.description}</p>
              </div>
            )}
          </div>

          {/* Chat sidebar */}
          {stream.chat_enabled && showChat && (
            <div className="w-80 border-l border-border flex flex-col bg-card">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-semibold">Chat ao vivo</h3>
              </div>

              <ScrollArea className="flex-1 px-3 py-2">
                <div className="space-y-3">
                  {(messages || []).map((msg: any) => (
                    <div key={msg.id} className="flex gap-2">
                      <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                        <AvatarImage src={msg.member?.avatar_url || undefined} />
                        <AvatarFallback className="text-[9px] bg-muted">
                          {(msg.member?.display_name || "U").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xs font-semibold text-foreground truncate">
                            {msg.member?.display_name || "Membro"}
                          </span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {formatDistanceToNow(new Date(msg.created_at), { addSuffix: false, locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/90 break-words">{msg.body}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {memberId && (
                <div className="p-3 border-t border-border">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Envie uma mensagem..."
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                      className="text-sm h-9"
                      maxLength={500}
                    />
                    <Button
                      size="sm"
                      onClick={handleSend}
                      disabled={!chatMessage.trim() || sendMessage.isPending}
                      className="h-9 px-3"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
