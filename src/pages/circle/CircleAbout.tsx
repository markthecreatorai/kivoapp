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
  UserPlus, Copy, Link2, Sparkles, Shield,
  Upload, ImagePlus, Settings, Pencil, X, Plus,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // UI state
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [mediaVideoUrl, setMediaVideoUrl] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const mediaImageInputRef = useRef<HTMLInputElement>(null);

  const inviteLink = `${window.location.origin}/c/${slug}`;

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

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  const { data: adminCount = 0 } = useQuery({
    queryKey: ["about-admin-count", community?.id],
    queryFn: async () => {
      const { count } = await supabase
        .from("community_members")
        .select("*", { count: "exact", head: true })
        .eq("community_id", community!.id)
        .in("role", ["OWNER", "ADMIN"])
        .eq("status", "ACTIVE");
      return count || 0;
    },
    enabled: !!community?.id,
  });

  const { data: recentMembers = [] } = useQuery({
    queryKey: ["about-recent-members", community?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("community_members")
        .select("display_name, avatar_url")
        .eq("community_id", community!.id)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(8);
      return data || [];
    },
    enabled: !!community?.id,
  });

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

  const handleUploadCover = async (file: File) => {
    setUploadingCover(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${community!.id}/cover-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      await updateCommunity.mutateAsync({ cover_image_url: urlData.publicUrl });
      toast.success("Capa atualizada!");
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingCover(false);
    }
  };

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

  // ─────────────────────────────────────────

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
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="grid md:grid-cols-[1fr_280px] gap-6 items-start">

        {/* ── Left: main about content ── */}
        <div className="space-y-5">
          {/* Title row */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-foreground">{community.name}</h1>
            {isAdmin && !hasMedia && (
              <button
                onClick={() => {
                  setMediaVideoUrl(videoUrl || "");
                  setShowMediaModal(true);
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Adicionar mídia"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            )}
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
                    <button
                      onClick={() => setVideoPlaying(true)}
                      className="relative w-full h-full"
                    >
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

              {/* Admin edit overlay */}
              {isAdmin && (
                <button
                  onClick={() => {
                    setMediaVideoUrl(videoUrl || "");
                    setShowMediaModal(true);
                  }}
                  className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white rounded-lg px-2.5 py-1.5 text-xs flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pencil className="h-3.5 w-3.5" /> Editar mídia
                </button>
              )}
            </div>
          ) : isAdmin ? (
            /* Admin placeholder */
            <button
              onClick={() => {
                setMediaVideoUrl(videoUrl || "");
                setShowMediaModal(true);
              }}
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
          </div>

          {/* ── DESCRIPTION — editable for admin ── */}
          {editingDescription ? (
            <div className="space-y-2">
              <Textarea
                value={descriptionDraft}
                onChange={(e) => setDescriptionDraft(e.target.value)}
                rows={6}
                placeholder="Descreva sua comunidade..."
                className="resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleSaveDescription} disabled={updateCommunity.isPending}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>
                  Cancelar
                </Button>
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
              onClick={() => {
                setDescriptionDraft("");
                setEditingDescription(true);
              }}
              className="text-primary hover:underline text-sm flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" /> Adicionar descrição...
            </button>
          ) : null}
        </div>

        {/* ── Right: info card ── */}
        <div className="md:sticky md:top-[108px] space-y-4">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">

            {/* Cover banner — admin can click to upload */}
            <div className="relative group">
              {community.cover_image_url ? (
                <div className="h-24 overflow-hidden">
                  <img src={community.cover_image_url} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/5" />
              )}

              {isAdmin && (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={coverInputRef}
                    onChange={(e) => e.target.files?.[0] && handleUploadCover(e.target.files[0])}
                  />
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    className={cn(
                      "absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium text-white bg-black/40 hover:bg-black/55 transition-colors",
                      !community.cover_image_url ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    )}
                  >
                    {uploadingCover ? (
                      <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <><Upload className="h-4 w-4" /> Foto de capa</>
                    )}
                  </button>
                </>
              )}
            </div>

            <div className="p-4 space-y-3">
              {/* Icon + title */}
              <div className="flex items-start gap-3">
                {community.icon_url ? (
                  <img src={community.icon_url} alt="" className="h-12 w-12 rounded-xl object-cover shrink-0 -mt-7 ring-4 ring-card shadow" />
                ) : (
                  <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shrink-0 -mt-7 ring-4 ring-card shadow">
                    <Users className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>
              <div>
                <p className="font-bold text-foreground">{community.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">kivo.com/c/{community.slug}</p>
              </div>
              {community.description && !isAdmin && (
                <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                  {community.description}
                </p>
              )}
              {isAdmin && !community.description && (
                <p className="text-xs text-muted-foreground italic">
                  Adicione uma descrição clicando na área à esquerda.
                </p>
              )}
            </div>

            {/* Stats */}
            <div className="border-t border-border px-4 py-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-sm font-bold text-foreground">{memberCount.toLocaleString("pt-BR")}</p>
                <p className="text-[10px] text-muted-foreground">Membros</p>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{(community as any).online_count ?? "—"}</p>
                <p className="text-[10px] text-muted-foreground">Online</p>
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">{adminCount}</p>
                <p className="text-[10px] text-muted-foreground">Admins</p>
              </div>
            </div>

            {/* Avatar cluster */}
            {recentMembers.length > 0 && (
              <div className="px-4 pb-3 flex items-center flex-wrap">
                {recentMembers.slice(0, 7).map((m: any, i: number) => (
                  <div
                    key={i}
                    className="h-7 w-7 rounded-full bg-primary/10 border-2 border-card flex items-center justify-center text-[10px] font-bold text-primary -ml-1.5 first:ml-0 shrink-0 shadow-sm"
                    style={{ zIndex: 7 - i }}
                  >
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      (m.display_name || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                ))}
                {memberCount > 7 && (
                  <span className="text-[10px] text-muted-foreground ml-2">
                    +{(memberCount - 7).toLocaleString("pt-BR")}
                  </span>
                )}
              </div>
            )}

            {/* CTA — admin sees Settings, members see Invite */}
            <div className="px-4 pb-4 space-y-2">
              {isAdmin ? (
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full font-semibold text-sm h-11 gap-2"
                  onClick={() => navigate(`/c/${slug}/admin`)}
                  id="about-settings-btn"
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </Button>
              ) : (
                <Button
                  size="lg"
                  className="w-full font-bold text-sm h-11 gap-2"
                  onClick={() => setShowInviteModal(true)}
                  id="about-invite-btn"
                >
                  <UserPlus className="h-4 w-4" />
                  Convidar Pessoas
                </Button>
              )}

              {isAdmin && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground gap-1.5"
                  onClick={() => setShowInviteModal(true)}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Convidar pessoas
                </Button>
              )}
            </div>

            {/* Nav to feed */}
            <div className="border-t border-border px-4 py-2.5">
              <button
                onClick={() => navigate(`/c/${slug}/feed`)}
                className="text-xs text-primary hover:underline w-full text-center font-medium"
              >
                Ir para o Feed da Comunidade →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────── */}
      {/* MEDIA MODAL (admin only) */}
      {/* ────────────────────────────────────────────────────── */}
      <Dialog open={showMediaModal} onOpenChange={setShowMediaModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar mídia</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-1">
            {/* Upload image */}
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

            {/* Video URL */}
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

            {/* Remove current video */}
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

      {/* ────────────────────── */}
      {/* INVITE MODAL           */}
      {/* ────────────────────── */}
      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-5 w-5 text-primary" />
              Convidar Pessoas
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Compartilhe o link para convidar pessoas a participar de{" "}
              <span className="font-semibold text-foreground">{community.name}</span>.
            </p>
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Link de convite
              </label>
              <div className="flex items-center gap-2">
                <div className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-sm font-mono truncate select-all">
                  {inviteLink}
                </div>
                <Button size="sm" variant="outline" className="shrink-0 gap-1.5"
                  onClick={() => { navigator.clipboard.writeText(inviteLink); toast.success("Link copiado!"); }}>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Button variant="outline" className="gap-2 text-sm h-10"
                onClick={() => { const t = encodeURIComponent(`Participe de ${community.name} na Kivo! ${inviteLink}`); window.open(`https://wa.me/?text=${t}`, "_blank"); }}>
                <svg className="h-4 w-4 text-[#25D366]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                WhatsApp
              </Button>
              <Button variant="outline" className="gap-2 text-sm h-10"
                onClick={() => { const t = encodeURIComponent(`Participe de ${community.name} na Kivo!`); const u = encodeURIComponent(inviteLink); window.open(`https://twitter.com/intent/tweet?text=${t}&url=${u}`, "_blank"); }}>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                X (Twitter)
              </Button>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Quem receber o link verá a página pública e poderá se cadastrar diretamente.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
