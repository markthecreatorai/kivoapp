import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Paperclip, Link2, Video, BarChart3, Smile, X, Loader2, Upload, ChevronDown, Check, FileUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";
import EmojiPicker from "@/components/circle/EmojiPicker";
import GifPicker from "@/components/circle/GifPicker";
import { checkSpam } from "@/lib/antispam";
import { AttachmentComposerPreview, type PendingAttachment } from "@/components/circle/PostAttachments";

interface PostComposerProps {
  communityId: string;
  communityName?: string;
  memberId: string;
  memberPoints: number;
  memberAvatarUrl?: string;
  memberDisplayName?: string;
  pointsPerPost: number;
  spaces: any[];
  isAdmin: boolean;
  preselectedSpaceId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
  isMobile?: boolean;
}

export default function PostComposer({
  communityId, communityName, memberId, memberPoints, memberAvatarUrl, memberDisplayName,
  pointsPerPost, spaces, isAdmin, preselectedSpaceId, onClose, onSuccess, isMobile,
}: PostComposerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [selectedSpace, setSelectedSpace] = useState(preselectedSpaceId || spaces?.[0]?.id || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Attachments state
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", "", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollEndsAt, setPollEndsAt] = useState("");

  // Inline sections toggled by toolbar
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState("");
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [videoModalUrl, setVideoModalUrl] = useState("");
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [draggingVideo, setDraggingVideo] = useState(false);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const displayName = memberDisplayName || user?.email?.split("@")[0] || "User";
  const avatarUrl = memberAvatarUrl || "";
  const initial = displayName.charAt(0).toUpperCase();

  const hasContent = title.trim().length > 0 || body.trim().length > 0;

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files).slice(0, 5 - images.length)) {
        if (file.size > 5 * 1024 * 1024) { toast.error(`${file.name} é maior que 5MB`); continue; }
        const ext = file.name.split(".").pop();
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("community").upload(path, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from("community").getPublicUrl(path);
        newUrls.push(publicUrl);
      }
      setImages((prev) => [...prev, ...newUrls]);
    } catch (e: any) {
      toast.error("Erro ao fazer upload: " + (e.message || ""));
    } finally {
      setUploading(false);
    }
  }, [user, images.length]);

  const ALLOWED_MIMES = [
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/zip", "application/x-rar-compressed", "application/gzip",
  ];
  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
  const MAX_ATTACHMENTS = 5;

  const handleAttachmentAdd = useCallback((files: FileList | null) => {
    if (!files) return;
    const remaining = MAX_ATTACHMENTS - attachments.length;
    const newFiles: PendingAttachment[] = [];
    for (const file of Array.from(files).slice(0, remaining)) {
      if (file.size > MAX_FILE_SIZE) { toast.error(`${file.name} excede 20MB`); continue; }
      if (!ALLOWED_MIMES.includes(file.type)) { toast.error(`${file.name}: tipo não permitido`); continue; }
      const pa: PendingAttachment = { file };
      if (file.type.startsWith("image/")) pa.previewUrl = URL.createObjectURL(file);
      newFiles.push(pa);
    }
    setAttachments((prev) => [...prev, ...newFiles]);
  }, [attachments.length]);

  const createPost = useMutation({
    mutationFn: async () => {
      if (!selectedSpace || !title.trim()) throw new Error("Preencha categoria e título");

      const spamResult = await checkSpam(memberId, communityId, "post", title.trim());
      if (!spamResult.allowed) throw new Error(spamResult.reason || "Spam detectado");

      const postData: any = {
        community_id: communityId,
        space_id: selectedSpace,
        author_id: memberId,
        title: title.trim(),
        body: body.trim() || null,
        post_type: showPoll ? "POLL" : "DISCUSSION",
        images: images.length > 0 ? images : null,
        video_url: videoUrl.trim() || null,
        link_url: linkUrl.trim() || null,
      };

      if (showPoll) {
        const validOptions = pollOptions.filter((o) => o.trim());
        if (validOptions.length < 2) throw new Error("Enquete precisa de pelo menos 2 opções");
        postData.poll_options = validOptions.map((text, i) => ({
          id: `opt_${i}_${Date.now()}`, text: text.trim(), votes: 0,
        }));
        postData.poll_allow_multiple = pollAllowMultiple;
        if (pollEndsAt) postData.poll_ends_at = new Date(pollEndsAt).toISOString();
      }

      const { data: post, error } = await supabase.from("community_posts").insert(postData).select().single();
      if (error) throw error;

      // Upload attachments
      if (attachments.length > 0 && user) {
        for (const att of attachments) {
          const ext = att.file.name.split(".").pop();
          const filePath = `${user.id}/${post.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("community-post-attachments")
            .upload(filePath, att.file);
          if (upErr) { console.error("Attachment upload error:", upErr); continue; }
          await supabase.from("community_post_attachments").insert({
            post_id: post.id,
            uploader_id: memberId,
            file_path: filePath,
            file_name: att.file.name,
            mime_type: att.file.type,
            size_bytes: att.file.size,
          });
        }
      }

      await supabase.from("community_points_log").insert({
        community_id: communityId, member_id: memberId, action: "POST_CREATED",
        points: pointsPerPost, reference_id: post.id, reference_type: "post", description: "Criou um post",
      });
      await supabase.from("community_members")
        .update({ total_points: (memberPoints || 0) + pointsPerPost, last_active_at: new Date().toISOString() })
        .eq("id", memberId);

      return post;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-posts"] });
      queryClient.invalidateQueries({ queryKey: ["circle-member"] });
      toast.success("Post publicado com sucesso!");
      onSuccess();
      onClose();
    },
    onError: (e: any) => toast.error(e.message || "Erro ao publicar"),
  });

  // Auto-resize textarea
  const handleBodyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  return (
    <div
      className="rounded-xl overflow-hidden animate-fade-in"
      style={{ backgroundColor: "hsl(var(--card))", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
    >
      <div className="p-4 space-y-3">
        {/* Header: avatar + "posting in Community" */}
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback className="bg-muted text-muted-foreground text-sm font-medium">{initial}</AvatarFallback>
          </Avatar>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{displayName}</span>
            {" "}postando em{" "}
            <span className="font-bold text-foreground">{communityName || "Comunidade"}</span>
          </p>
        </div>

        {/* Title */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value.slice(0, 200))}
          placeholder="Título"
          className="w-full text-xl font-semibold text-foreground placeholder:text-muted-foreground/50 bg-transparent border-0 outline-none focus:ring-0 px-0"
          autoFocus
        />

        <div className="h-px bg-border" />

        {/* Body textarea */}
        <textarea
          ref={bodyRef}
          value={body}
          onChange={handleBodyChange}
          placeholder="Escreva algo..."
          className="w-full min-h-[80px] text-sm text-foreground placeholder:text-muted-foreground/50 bg-transparent border-0 outline-none focus:ring-0 px-0 resize-none"
        />

        {/* Image previews */}
        {images.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-border" />
                <button
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Video shown as tag */}
        {videoUrl && (
          <div className="flex items-center gap-2 text-sm">
            <Video className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-primary truncate">{videoUrl}</span>
            <button onClick={() => setVideoUrl("")} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Inserted link shown as tag */}
        {linkUrl && (
          <div className="flex items-center gap-2 text-sm">
            <Link2 className="h-3.5 w-3.5 text-primary shrink-0" />
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">{linkUrl}</a>
            <button onClick={() => setLinkUrl("")} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}

        {/* Poll section */}
        {showPoll && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Enquete</span>
              <button
                onClick={() => { setShowPoll(false); setPollOptions(["", "", ""]); setPollAllowMultiple(false); setPollEndsAt(""); }}
                className="text-xs text-destructive hover:underline"
              >
                Remover
              </button>
            </div>
            {pollOptions.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const copy = [...pollOptions];
                    copy[i] = e.target.value;
                    setPollOptions(copy);
                  }}
                  placeholder={`Opção ${i + 1}`}
                  className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/50 bg-muted/30 rounded-lg px-3 py-2 border border-border outline-none"
                />
                {pollOptions.length > 2 && (
                  <button
                    onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
            {pollOptions.length < 6 && (
              <button
                onClick={() => setPollOptions([...pollOptions, ""])}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 uppercase tracking-wide"
              >
                + Adicionar opção
              </button>
            )}
            {/* Poll settings */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-border">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={pollAllowMultiple}
                  onChange={(e) => setPollAllowMultiple(e.target.checked)}
                  className="rounded border-border"
                />
                Permitir múltiplos votos
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">Encerrar em:</span>
                <input
                  type="datetime-local"
                  value={pollEndsAt}
                  onChange={(e) => setPollEndsAt(e.target.value)}
                  className="text-xs bg-muted/30 rounded-lg px-2 py-1 border border-border outline-none text-foreground"
                />
              </div>
            </div>
          </div>
        )}

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <AttachmentComposerPreview
            files={attachments}
            onRemove={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
          />
        )}
      </div>

      {/* Footer toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        {/* Left: media icons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || images.length >= 5}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-40"
            title="Anexar imagem"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </button>
          <button
            onClick={() => attachmentInputRef.current?.click()}
            disabled={attachments.length >= MAX_ATTACHMENTS}
            className={cn("p-2 rounded-lg transition-colors", attachments.length > 0 ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50", "disabled:opacity-40")}
            title={`Anexar arquivo (${attachments.length}/${MAX_ATTACHMENTS})`}
          >
            <FileUp className="h-4 w-4" />
          </button>
          <button
            className={cn("p-2 rounded-lg transition-colors", linkUrl ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
            title="Link"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setVideoModalUrl(""); setShowVideoModal(true); }}
            className={cn("p-2 rounded-lg transition-colors", videoUrl ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
            title="Vídeo"
          >
            <Video className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowPoll(!showPoll)}
            className={cn("p-2 rounded-lg transition-colors", showPoll ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
            title="Enquete"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Emoji"
              >
                <Smile className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto p-0 border-0 shadow-none bg-transparent">
              <EmojiPicker onSelect={(emoji) => {
                setBody(prev => prev + emoji);
                if (bodyRef.current) {
                  bodyRef.current.focus();
                }
              }} />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-bold"
                title="GIF"
              >
                GIF
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-auto p-0 border-0 shadow-none bg-transparent">
              <GifPicker onSelect={(gifUrl) => {
                setImages(prev => [...prev, gifUrl]);
              }} />
            </PopoverContent>
          </Popover>
        </div>

        {/* Right: category + cancel + post */}
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button className="h-8 flex items-center gap-1.5 px-3 text-xs border border-border rounded-lg bg-transparent hover:bg-muted/50 transition-colors">
                <span className={cn(selectedSpace ? "text-foreground" : "text-muted-foreground")}>
                  {selectedSpace
                    ? (() => { const s = spaces?.find((sp: any) => sp.id === selectedSpace); return s ? `${s.emoji || ""} ${s.name}` : "Selecionar categoria"; })()
                    : "Selecionar categoria"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="end" className="w-[200px] p-1">
              {spaces?.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSpace(s.id)}
                  className={cn(
                    "w-full flex items-center gap-2 px-2.5 py-2 text-sm rounded-md transition-colors text-left",
                    selectedSpace === s.id ? "bg-accent text-accent-foreground" : "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <span>{s.emoji}</span>
                  <span className="flex-1 truncate">{s.name}</span>
                  {selectedSpace === s.id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </PopoverContent>
          </Popover>

          <button
            onClick={onClose}
            className="text-sm font-bold uppercase tracking-wide px-2 transition-colors"
            style={{ color: "#6B7280" }}
          >
            Cancelar
          </button>

          <button
            onClick={() => createPost.mutate()}
            disabled={!hasContent || createPost.isPending}
            className={cn(
              "px-6 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition-colors",
              hasContent
                ? "text-white hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
            style={hasContent ? { backgroundColor: "hsl(var(--primary))" } : undefined}
          >
            {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Publicar"}
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImageUpload(e.target.files)}
      />

      <input
        ref={attachmentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.zip,.rar,.gz,.jpg,.jpeg,.png,.gif,.webp"
        multiple
        className="hidden"
        onChange={(e) => { handleAttachmentAdd(e.target.files); e.target.value = ""; }}
      />

      {/* Link modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md p-6 [&>button[data-close]]:hidden [&>button]:hidden">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-lg font-bold text-foreground">Adicionar link</DialogTitle>
          </DialogHeader>
          <div className="pt-4 space-y-4">
            <div>
              <input
                type="url"
                value={linkModalUrl}
                onChange={(e) => setLinkModalUrl(e.target.value)}
                placeholder="Insira uma URL"
                className="w-full px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 border border-border rounded-sm outline-none focus:border-primary transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (linkModalUrl.trim()) {
                      try {
                        new URL(linkModalUrl.trim());
                        setLinkUrl(linkModalUrl.trim());
                        setShowLinkModal(false);
                      } catch {
                        toast.error("URL inválida");
                      }
                    }
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const url = linkModalUrl.trim();
                  if (!url) return;
                  try {
                    new URL(url);
                    setLinkUrl(url);
                    setShowLinkModal(false);
                  } catch {
                    toast.error("URL inválida");
                  }
                }}
                className="px-4 py-1.5 rounded-sm text-sm font-bold uppercase tracking-wide text-primary-foreground bg-primary hover:opacity-90 transition-opacity"
              >
                Inserir link
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Video modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="sm:max-w-md p-6 [&>button]:hidden">
          <DialogHeader className="pb-0">
            <DialogTitle className="text-lg font-bold text-foreground">Adicionar vídeo</DialogTitle>
          </DialogHeader>
          <div className="pt-4 space-y-4">
            {/* URL input */}
            <div className="flex items-center gap-2 border border-border rounded-lg px-4 py-3 focus-within:border-primary transition-colors">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="url"
                value={videoModalUrl}
                onChange={(e) => setVideoModalUrl(e.target.value)}
                placeholder="YouTube, Loom, Vimeo, or Wistia link"
                className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/60 bg-transparent outline-none"
                autoFocus
              />
            </div>

            {/* Drag and drop area */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDraggingVideo(true); }}
              onDragLeave={() => setDraggingVideo(false)}
              onDrop={async (e) => {
                e.preventDefault();
                setDraggingVideo(false);
                const file = e.dataTransfer.files?.[0];
                if (file && /\.(mp4|mov|webm)$/i.test(file.name)) {
                  await handleVideoUpload(file);
                } else {
                  toast.error("Formato não suportado. Use MP4, MOV ou WebM.");
                }
              }}
              className={cn(
                "border-2 border-dashed rounded-lg flex flex-col items-center justify-center py-8 transition-colors cursor-pointer",
                draggingVideo ? "border-primary bg-primary/5" : "border-border"
              )}
              onClick={() => videoFileRef.current?.click()}
            >
              {uploadingVideo ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Arraste e solte o vídeo aqui{" "}
                    <span className="text-primary hover:underline">ou selecione um arquivo</span>
                  </p>
                </>
              )}
            </div>
            <input
              ref={videoFileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleVideoUpload(file);
              }}
            />

            {/* Footer */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowVideoModal(false)}
                className="px-4 py-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const url = videoModalUrl.trim();
                  if (!url) return;
                  try {
                    new URL(url);
                    setVideoUrl(url);
                    setShowVideoModal(false);
                  } catch {
                    toast.error("URL inválida");
                  }
                }}
                className="px-4 py-1.5 rounded-sm text-sm font-bold uppercase tracking-wide text-primary-foreground bg-primary hover:opacity-90 transition-opacity"
              >
                Adicionar
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  async function handleVideoUpload(file: File) {
    if (!user) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Vídeo deve ter no máximo 50MB");
      return;
    }
    setUploadingVideo(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${user.id}/video-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("community").upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("community").getPublicUrl(path);
      setVideoUrl(publicUrl);
      setShowVideoModal(false);
      toast.success("Vídeo enviado!");
    } catch (e: any) {
      toast.error("Erro no upload: " + (e.message || ""));
    } finally {
      setUploadingVideo(false);
    }
  }
}
