import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Users, Globe, CreditCard, CheckCircle, Play,
  Upload, Link2, Pencil, X, Plus,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function formatPrice(price: number, period?: string) {
  const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price);
  return period === "annual" ? `${fmt}/ano` : `${fmt}/mês`;
}

function getEmbedUrl(url: string): string | null {
  if (!url) return null;
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=0&rel=0`;
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  return url;
}

export default function CircleAbout() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [mediaVideoUrl, setMediaVideoUrl] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaImageInputRef = useRef<HTMLInputElement>(null);

  // Fetch community
  const { data: community, isLoading } = useQuery({
    queryKey: ["community-about", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase
        .from("communities")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  // Check if current user is admin
  const { data: member } = useQuery({
    queryKey: ["about-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase
        .from("community_members")
        .select("role, id")
        .eq("community_id", community.id)
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!community?.id && !!user?.id,
  });

  // Fetch community owner
  const { data: owner } = useQuery({
    queryKey: ["community-owner", community?.id],
    queryFn: async () => {
      if (!community) return null;
      const { data } = await supabase
        .from("community_members")
        .select("display_name, avatar_url, user_id")
        .eq("community_id", community.id)
        .eq("role", "OWNER")
        .eq("status", "ACTIVE")
        .maybeSingle();
      return data;
    },
    enabled: !!community?.id,
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  // ─── Mutations ───

  const updateCommunity = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const { error } = await supabase
        .from("communities")
        .update(payload)
        .eq("id", community!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-about", slug] });
      queryClient.invalidateQueries({ queryKey: ["community-slug", slug] });
      queryClient.invalidateQueries({ queryKey: ["public-community", slug] });
    },
  });

  const handleUploadMediaImage = async (file: File) => {
    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${community!.id}/about-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      await updateCommunity.mutateAsync({ cover_image_url: urlData.publicUrl });
      toast.success("Imagem adicionada!");
      setShowMediaModal(false);
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleSaveVideo = async () => {
    await updateCommunity.mutateAsync({ about_video_url: mediaVideoUrl.trim() || null });
    toast.success("Vídeo salvo!");
    setShowMediaModal(false);
    setMediaVideoUrl("");
  };

  const handleSaveDescription = async () => {
    await updateCommunity.mutateAsync({ description: descriptionDraft });
    toast.success("Descrição salva!");
    setEditingDescription(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!community) return null;

  const isPaid = community.access_type === "PAID_SUBSCRIPTION" && !!(community as any).price;
  const price = (community as any).price as number | undefined;
  const billingPeriod = (community as any).billing_period as string | undefined;
  const videoUrl = (community as any).about_video_url as string | undefined;
  const embedUrl = videoUrl ? getEmbedUrl(videoUrl) : null;
  const memberCount = community.member_count || 0;
  const hasMedia = !!embedUrl || !!community.cover_image_url;

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{community.name}</h1>
      </div>

      {/* ── MEDIA AREA ── */}
      {hasMedia ? (
        <div className="relative group">
          {embedUrl ? (
            <div className="rounded-xl overflow-hidden bg-black aspect-video shadow-sm">
              {videoPlaying ? (
                <iframe
                  src={embedUrl + "&autoplay=1"}
                  className="w-full h-full"
                  allowFullScreen
                  allow="autoplay; fullscreen"
                  title={community.name}
                />
              ) : (
                <button onClick={() => setVideoPlaying(true)} className="relative w-full h-full">
                  {community.cover_image_url ? (
                    <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <Play className="h-12 w-12 text-white/30" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/25 flex items-center justify-center hover:bg-black/35 transition-colors">
                    <div className="h-16 w-16 rounded-full bg-white/95 flex items-center justify-center shadow-2xl hover:scale-105 transition-transform">
                      <Play className="h-7 w-7 text-gray-900 fill-gray-900 ml-1" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl overflow-hidden aspect-video shadow-sm">
              <img src={community.cover_image_url!} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => { setMediaVideoUrl(videoUrl || ""); setShowMediaModal(true); }}
              className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Pencil className="h-3.5 w-3.5" /> Editar mídia
            </button>
          )}
        </div>
      ) : isAdmin ? (
        <button
          onClick={() => { setMediaVideoUrl(videoUrl || ""); setShowMediaModal(true); }}
          className="w-full aspect-video rounded-xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-muted-foreground/40 transition-all flex flex-col items-center justify-center gap-3 text-muted-foreground group"
        >
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center group-hover:bg-muted-foreground/10 transition-colors">
            <Plus className="h-6 w-6" />
          </div>
          <span className="text-sm font-medium">Adicionar imagens / vídeos</span>
          <span className="text-xs">Clique para adicionar mídia à página Sobre</span>
        </button>
      ) : null}

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Globe className="h-4 w-4" />
          {community.access_type === "OPEN" ? "Público" : "Privado"}
        </span>
        <span className="flex items-center gap-1.5">
          <Users className="h-4 w-4" />
          {memberCount.toLocaleString("pt-BR")} membros
        </span>
        <span className="flex items-center gap-1.5">
          {isPaid ? (
            <><CreditCard className="h-4 w-4 text-amber-500" /><span className="text-amber-600 font-medium">{formatPrice(price!, billingPeriod)}</span></>
          ) : (
            <><CheckCircle className="h-4 w-4 text-emerald-500" /><span className="text-emerald-600 font-medium">Gratuito</span></>
          )}
        </span>
        {owner && (
          <span className="flex items-center gap-1.5">
            {owner.avatar_url ? (
              <img src={owner.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
            ) : (
              <Users className="h-4 w-4" />
            )}
            <span>By <span className="font-medium text-foreground">{owner.display_name || "Criador"}</span></span>
          </span>
        )}
      </div>

      {/* ── DESCRIPTION — editable for admin ── */}
      {editingDescription ? (
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value.slice(0, 1000))}
              maxLength={1000}
              rows={6}
              placeholder="Descreva sua comunidade..."
              className="resize-none pb-7"
              autoFocus
            />
            <span className={cn(
              "absolute bottom-2 right-3 text-xs",
              1000 - descriptionDraft.length < 50 ? "text-destructive" : "text-muted-foreground"
            )}>
              {descriptionDraft.length} / 1000
            </span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>Cancelar</Button>
            <Button size="sm" onClick={handleSaveDescription} disabled={updateCommunity.isPending}>Salvar</Button>
          </div>
        </div>
      ) : community.description ? (
        <div
          className={cn(
            "bg-card rounded-xl p-5 shadow-sm border border-border",
            isAdmin && "cursor-pointer hover:border-primary/40 group relative"
          )}
          onClick={() => {
            if (isAdmin) {
              setDescriptionDraft(community.description || "");
              setEditingDescription(true);
            }
          }}
        >
          <p className="text-foreground leading-relaxed whitespace-pre-line text-sm">
            {community.description}
          </p>
          {isAdmin && (
            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ) : isAdmin ? (
        <button
          onClick={() => { setDescriptionDraft(""); setEditingDescription(true); }}
          className="text-primary hover:underline text-sm flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Adicionar descrição...
        </button>
      ) : null}

      {/* ────────── MEDIA MODAL (admin only) ────────── */}
      <Dialog open={showMediaModal} onOpenChange={setShowMediaModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar mídia</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Envie uma imagem <span className="text-xs">(1400 × 790 recomendado)</span>.
              </p>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                ref={mediaImageInputRef}
                onChange={(e) => e.target.files?.[0] && handleUploadMediaImage(e.target.files[0])}
              />
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => mediaImageInputRef.current?.click()}
                disabled={uploadingMedia}
              >
                {uploadingMedia ? (
                  <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploadingMedia ? "Enviando..." : "Enviar imagem"}
              </Button>
            </div>

            <div className="relative flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" />
              Ou adicione um vídeo
              <div className="flex-1 h-px bg-border" />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Link do YouTube, Vimeo ou outro</Label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="https://youtube.com/watch?v=..."
                  value={mediaVideoUrl}
                  onChange={(e) => setMediaVideoUrl(e.target.value)}
                />
              </div>
            </div>

            {videoUrl && (
              <button
                className="text-xs text-destructive hover:underline flex items-center gap-1"
                onClick={async () => {
                  await updateCommunity.mutateAsync({ about_video_url: null });
                  setMediaVideoUrl("");
                  toast.success("Vídeo removido");
                  setShowMediaModal(false);
                }}
              >
                <X className="h-3 w-3" /> Remover vídeo atual
              </button>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setShowMediaModal(false)}>Cancelar</Button>
            <Button
              onClick={handleSaveVideo}
              disabled={!mediaVideoUrl.trim() || updateCommunity.isPending}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
