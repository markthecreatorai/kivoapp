import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Video, Radio, Calendar, Link as LinkIcon, Trash2, Upload, ImageIcon } from "lucide-react";
import { toast } from "sonner";

interface LiveStreamFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  communityId: string;
  memberId: string;
  stream?: any;
}

function detectEmbedType(url: string): "youtube" | "twitch" | "custom" {
  if (!url) return "custom";
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("twitch.tv")) return "twitch";
  return "custom";
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/live\/)([^&\s?/]+)/);
  return match ? match[1] : null;
}

function extractTwitchChannel(url: string): string | null {
  const match = url.match(/twitch\.tv\/([^/?]+)/);
  return match ? match[1] : null;
}

export { extractYouTubeId, extractTwitchChannel, detectEmbedType };

export default function LiveStreamFormModal({ open, onOpenChange, communityId, memberId, stream }: LiveStreamFormModalProps) {
  const queryClient = useQueryClient();
  const isEditing = !!stream;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [chatEnabled, setChatEnabled] = useState(true);
  const [goLiveNow, setGoLiveNow] = useState(false);

  useEffect(() => {
    if (stream) {
      setTitle(stream.title || "");
      setDescription(stream.description || "");
      setEmbedUrl(stream.embed_url || "");
      setScheduledAt(stream.scheduled_at ? new Date(stream.scheduled_at).toISOString().slice(0, 16) : "");
      setChatEnabled(stream.chat_enabled ?? true);
      setGoLiveNow(false);
    } else {
      setTitle("");
      setDescription("");
      setEmbedUrl("");
      setScheduledAt("");
      setChatEnabled(true);
      setGoLiveNow(false);
    }
  }, [stream, open]);

  const embedType = detectEmbedType(embedUrl);
  const isValidUrl = embedUrl.trim().length > 0 && (
    embedType === "youtube" ? !!extractYouTubeId(embedUrl) :
    embedType === "twitch" ? !!extractTwitchChannel(embedUrl) :
    embedUrl.startsWith("http")
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const status = goLiveNow ? "LIVE" : "SCHEDULED";
      const payload = {
        community_id: communityId,
        created_by: memberId,
        title: title.trim(),
        description: description.trim() || null,
        embed_url: embedUrl.trim(),
        embed_type: embedType,
        status,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : (goLiveNow ? new Date().toISOString() : null),
        started_at: goLiveNow ? new Date().toISOString() : null,
        chat_enabled: chatEnabled,
      };

      if (isEditing) {
        const { error } = await supabase
          .from("community_live_streams" as any)
          .update(payload as any)
          .eq("id", stream.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("community_live_streams" as any)
          .insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: async (_, __, context) => {
      // Sync with community_events calendar
      try {
        const scheduledDate = scheduledAt ? new Date(scheduledAt).toISOString() : (goLiveNow ? new Date().toISOString() : null);
        if (scheduledDate) {
          const endsAt = new Date(new Date(scheduledDate).getTime() + 2 * 60 * 60 * 1000).toISOString();

          if (isEditing && stream.id) {
            // Update linked event if exists
            const { data: existingEvent } = await supabase
              .from("community_events")
              .select("id")
              .eq("live_stream_id", stream.id)
              .maybeSingle();

            if (existingEvent) {
              await supabase
                .from("community_events")
                .update({
                  title: `🔴 ${title.trim()}`,
                  starts_at: scheduledDate,
                  ends_at: endsAt,
                  meeting_url: embedUrl.trim(),
                  description: description.trim() || null,
                  status: goLiveNow ? "ACTIVE" : "SCHEDULED",
                } as any)
                .eq("id", existingEvent.id);
            }
          } else {
            // Create new linked event — need to get the stream id from latest insert
            const { data: latestStream } = await supabase
              .from("community_live_streams" as any)
              .select("id")
              .eq("community_id", communityId)
              .eq("created_by", memberId)
              .order("created_at", { ascending: false })
              .limit(1)
              .single();

            if (latestStream) {
              await supabase
                .from("community_events")
                .insert({
                  community_id: communityId,
                  created_by: memberId,
                  title: `🔴 ${title.trim()}`,
                  description: description.trim() || null,
                  starts_at: scheduledDate,
                  ends_at: endsAt,
                  meeting_url: embedUrl.trim(),
                  meeting_platform: embedType === "youtube" ? "youtube" : embedType === "twitch" ? "twitch" : "custom",
                  status: goLiveNow ? "ACTIVE" : "SCHEDULED",
                  live_stream_id: (latestStream as any).id,
                } as any);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to sync event:", e);
      }

      queryClient.invalidateQueries({ queryKey: ["live-streams"] });
      queryClient.invalidateQueries({ queryKey: ["community-events"] });
      queryClient.invalidateQueries({ queryKey: ["circle-events"] });
      toast.success(isEditing ? "Live atualizada!" : goLiveNow ? "Você está ao vivo! 🔴" : "Live agendada!");
      onOpenChange(false);
    },
    onError: () => toast.error("Erro ao salvar transmissão"),
  });

  const canSave = title.trim().length > 0 && isValidUrl && (goLiveNow || scheduledAt);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-primary" />
            {isEditing ? "Editar transmissão" : "Nova transmissão ao vivo"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="live-title">Título *</Label>
            <Input
              id="live-title"
              placeholder="Ex: Live de lançamento do módulo 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </div>

          <div>
            <Label htmlFor="live-desc">Descrição</Label>
            <Textarea
              id="live-desc"
              placeholder="Do que se trata essa live?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="live-url" className="flex items-center gap-1.5">
              <LinkIcon className="h-3.5 w-3.5" />
              URL do YouTube ou Twitch *
            </Label>
            <Input
              id="live-url"
              placeholder="https://youtube.com/watch?v=... ou https://twitch.tv/..."
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
            />
            {embedUrl && (
              <div className="flex items-center gap-1.5 mt-1.5">
                {embedType === "youtube" && (
                  <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded">▶ YouTube</span>
                )}
                {embedType === "twitch" && (
                  <span className="text-xs font-medium text-purple-600 bg-purple-50 px-2 py-0.5 rounded">📺 Twitch</span>
                )}
                {embedType === "custom" && (
                  <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded">🔗 Link externo</span>
                )}
                {!isValidUrl && (
                  <span className="text-xs text-destructive">URL inválida</span>
                )}
              </div>
            )}
          </div>

          {!isEditing && (
            <div className="flex items-center justify-between bg-muted/40 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <Video className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Iniciar ao vivo agora</span>
              </div>
              <Switch checked={goLiveNow} onCheckedChange={setGoLiveNow} />
            </div>
          )}

          {!goLiveNow && (
            <div>
              <Label htmlFor="live-schedule" className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                Agendar para *
              </Label>
              <Input
                id="live-schedule"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="live-chat" className="cursor-pointer">Chat ao vivo</Label>
            <Switch id="live-chat" checked={chatEnabled} onCheckedChange={setChatEnabled} />
          </div>
        </div>

        <div className="flex justify-between mt-4">
          {isEditing ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={async () => {
                if (!confirm("Tem certeza que deseja excluir esta live e o evento vinculado?")) return;
                try {
                  // Delete linked event first
                  await supabase.from("community_events").delete().eq("live_stream_id", stream.id);
                  // Delete the stream
                  await supabase.from("community_live_streams" as any).delete().eq("id", stream.id);
                  queryClient.invalidateQueries({ queryKey: ["live-streams"] });
                  queryClient.invalidateQueries({ queryKey: ["community-events"] });
                  queryClient.invalidateQueries({ queryKey: ["circle-events"] });
                  toast.success("Live excluída");
                  onOpenChange(false);
                } catch {
                  toast.error("Erro ao excluir");
                }
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              Excluir
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!canSave || saveMutation.isPending}
              className={goLiveNow ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {saveMutation.isPending ? "Salvando..." : goLiveNow ? "🔴 Ir ao vivo" : isEditing ? "Salvar" : "Agendar live"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
