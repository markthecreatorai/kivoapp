import { useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
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
  Upload, Link2, Pencil, X, Plus, Eye, EyeOff,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type GalleryItem = { type: "image" | "video"; url: string; position: number };

function SortableThumb({
  item,
  index,
  isActive,
  isAdminEditing,
  onSelect,
  onRemove,
}: {
  item: GalleryItem;
  index: number;
  isActive: boolean;
  isAdminEditing: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `gallery-${index}`,
    disabled: !isAdminEditing,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "relative group/thumb shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-all",
        isAdminEditing && "cursor-grab active:cursor-grabbing",
        !isAdminEditing && "cursor-pointer",
        isActive ? "border-primary ring-1 ring-primary/30" : "border-transparent hover:border-muted-foreground/30"
      )}
      onClick={onSelect}
    >
      {item.type === "image" ? (
        <img src={item.url} alt="" className="w-full h-full object-cover pointer-events-none" />
      ) : (
        <div className="relative w-full h-full pointer-events-none">
          {getVideoThumbnail(item.url) ? (
            <img src={getVideoThumbnail(item.url)!} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gray-800 flex items-center justify-center">
              <Play className="h-4 w-4 text-white/60" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <Play className="h-4 w-4 text-white drop-shadow" />
          </div>
        </div>
      )}

      {isAdminEditing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 hover:bg-destructive text-white flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

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

function getVideoThumbnail(url: string): string | null {
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/mqdefault.jpg`;
  return null;
}

export default function CircleAbout() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [activeIndex, setActiveIndex] = useState(0);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [mediaVideoUrl, setMediaVideoUrl] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const mediaImageInputRef = useRef<HTMLInputElement>(null);
  const previewMode = searchParams.get("preview") === "visitor";

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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
  const isAdminEditing = isAdmin && !previewMode;

  // Parse gallery from community data
  const gallery: GalleryItem[] = (() => {
    const raw = (community as any)?.about_gallery;
    if (Array.isArray(raw) && raw.length > 0) return raw;
    // Fallback to legacy fields
    const items: GalleryItem[] = [];
    if (community?.cover_image_url) items.push({ type: "image", url: community.cover_image_url, position: 0 });
    const videoUrl = (community as any)?.about_video_url;
    if (videoUrl) items.push({ type: "video", url: videoUrl, position: 1 });
    return items;
  })();

  const activeItem = gallery[activeIndex] || null;

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

  const saveGallery = async (newGallery: GalleryItem[]) => {
    const sorted = newGallery.map((g, i) => ({ ...g, position: i }));
    await updateCommunity.mutateAsync({ about_gallery: sorted } as any);
  };

  const handleUploadMediaImage = async (file: File) => {
    setUploadingMedia(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${community!.id}/about-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("community").getPublicUrl(path);
      const newGallery = [...gallery, { type: "image" as const, url: urlData.publicUrl, position: gallery.length }];
      await saveGallery(newGallery);
      setActiveIndex(newGallery.length - 1);
      toast.success("Imagem adicionada!");
      setShowMediaModal(false);
    } catch {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploadingMedia(false);
    }
  };

  const handleAddVideo = async () => {
    const url = mediaVideoUrl.trim();
    if (!url) return;
    const newGallery = [...gallery, { type: "video" as const, url, position: gallery.length }];
    await saveGallery(newGallery);
    setActiveIndex(newGallery.length - 1);
    toast.success("Vídeo adicionado!");
    setShowMediaModal(false);
    setMediaVideoUrl("");
  };

  const handleRemoveItem = async (index: number) => {
    const newGallery = gallery.filter((_, i) => i !== index);
    await saveGallery(newGallery);
    setActiveIndex((prev) => Math.min(prev, Math.max(newGallery.length - 1, 0)));
    toast.success("Mídia removida");
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
  const memberCount = community.member_count || 0;
  const hasMedia = gallery.length > 0;

  const renderMainMedia = () => {
    if (!activeItem) return null;

    if (activeItem.type === "video") {
      const embedUrl = getEmbedUrl(activeItem.url);
      if (!embedUrl) return null;
      return (
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
              {getVideoThumbnail(activeItem.url) ? (
                <img src={getVideoThumbnail(activeItem.url)!} alt="" className="w-full h-full object-cover" />
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
      );
    }

    return (
      <div className="rounded-xl overflow-hidden aspect-video shadow-sm">
        <img src={activeItem.url} alt="" className="w-full h-full object-cover" />
      </div>
    );
  };

  return (
    <div className="p-4 md:p-5 space-y-5">
      {/* Preview banner */}
      {previewMode && (
        <div className="flex items-center justify-between bg-muted rounded-lg px-4 py-2.5 text-sm">
          <span className="text-muted-foreground">Modo de visualização — você está vendo como um visitante</span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("preview");
              setSearchParams(next);
            }}
          >
            <EyeOff className="h-3.5 w-3.5" /> Sair do preview
          </Button>
        </div>
      )}

      {/* Title row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{community.name}</h1>
        {isAdmin && !previewMode && (
          <button
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.set("preview", "visitor");
              setSearchParams(next);
            }}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Ver como visitante"
          >
            <Eye className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* ── MEDIA CAROUSEL ── */}
      {hasMedia ? (
        <div className="space-y-3">
          {/* Main media */}
          <div className="relative group">
            {renderMainMedia()}

            {/* Nav arrows */}
            {gallery.length > 1 && (
              <>
                <button
                  onClick={() => { setActiveIndex((p) => Math.max(0, p - 1)); setVideoPlaying(false); }}
                  disabled={activeIndex === 0}
                  className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  onClick={() => { setActiveIndex((p) => Math.min(gallery.length - 1, p + 1)); setVideoPlaying(false); }}
                  disabled={activeIndex === gallery.length - 1}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-0"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>

          {/* Thumbnails with drag & drop */}
          {(gallery.length > 1 || isAdminEditing) && (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIndex = gallery.findIndex((_, i) => `gallery-${i}` === active.id);
                const newIndex = gallery.findIndex((_, i) => `gallery-${i}` === over.id);
                if (oldIndex === -1 || newIndex === -1) return;
                const reordered = arrayMove(gallery, oldIndex, newIndex);
                saveGallery(reordered);
                // Update active index to follow the selected item
                if (activeIndex === oldIndex) setActiveIndex(newIndex);
                else if (activeIndex === newIndex) setActiveIndex(oldIndex);
              }}
            >
              <SortableContext
                items={gallery.map((_, i) => `gallery-${i}`)}
                strategy={horizontalListSortingStrategy}
              >
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {gallery.map((item, i) => (
                    <SortableThumb
                      key={`gallery-${i}`}
                      item={item}
                      index={i}
                      isActive={activeIndex === i}
                      isAdminEditing={isAdminEditing}
                      onSelect={() => { setActiveIndex(i); setVideoPlaying(false); }}
                      onRemove={() => handleRemoveItem(i)}
                    />
                  ))}

                  {/* Add button */}
                  {isAdminEditing && (
                    <button
                      onClick={() => { setMediaVideoUrl(""); setShowMediaModal(true); }}
                      className="shrink-0 w-20 h-14 rounded-lg border-2 border-dashed border-border hover:border-muted-foreground/40 bg-muted/30 hover:bg-muted/50 flex items-center justify-center transition-all"
                    >
                      <Plus className="h-5 w-5 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      ) : isAdminEditing ? (
        <button
          onClick={() => { setMediaVideoUrl(""); setShowMediaModal(true); }}
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
            <><CreditCard className="h-4 w-4 text-primary" /><span className="text-primary font-medium">{formatPrice(price!, billingPeriod)}</span></>
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
            <span>Por <span className="font-medium text-foreground">{owner.display_name || "Criador"}</span></span>
          </span>
        )}
      </div>

      {/* ── DESCRIPTION ── */}
      {editingDescription && isAdminEditing ? (
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
          className={cn("relative", isAdminEditing && "cursor-pointer group")}
          onClick={() => {
            if (isAdminEditing) {
              setDescriptionDraft(community.description || "");
              setEditingDescription(true);
            }
          }}
        >
          <p className="text-foreground leading-relaxed whitespace-pre-line text-sm px-1">
            {community.description}
          </p>
          {isAdminEditing && (
            <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
      ) : isAdminEditing ? (
        <button
          onClick={() => { setDescriptionDraft(""); setEditingDescription(true); }}
          className="text-primary hover:underline text-sm flex items-center gap-1.5"
        >
          <Plus className="h-4 w-4" /> Adicionar descrição...
        </button>
      ) : null}

      {/* ── MEDIA MODAL ── */}
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
          </div>

          <DialogFooter className="mt-2">
            <Button variant="ghost" onClick={() => setShowMediaModal(false)}>Cancelar</Button>
            <Button
              onClick={handleAddVideo}
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
