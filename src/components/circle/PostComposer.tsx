import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Paperclip, Link2, Video, BarChart3, Smile, X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";

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

  const [selectedSpace, setSelectedSpace] = useState(preselectedSpaceId || "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Poll state
  const [showPoll, setShowPoll] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(["", "", ""]);

  // Inline sections toggled by toolbar
  const [showVideoInput, setShowVideoInput] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkModalUrl, setLinkModalUrl] = useState("");

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

  const createPost = useMutation({
    mutationFn: async () => {
      if (!selectedSpace || !title.trim()) throw new Error("Preencha categoria e título");

      const { checkSpam } = await import("@/lib/antispam");
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
      }

      const { data: post, error } = await supabase.from("community_posts").insert(postData).select().single();
      if (error) throw error;

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
      toast.success(`Post publicado! +${pointsPerPost} pts`);
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
            {" "}posting in{" "}
            <span className="font-bold text-foreground">{communityName || "Community"}</span>
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
          placeholder="Write something..."
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

        {/* Video URL inline */}
        {showVideoInput && (
          <div className="flex items-center gap-2">
            <Video className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="URL do vídeo (YouTube, Vimeo, Loom)"
              className="flex-1 text-sm text-foreground placeholder:text-muted-foreground/50 bg-muted/30 rounded-lg px-3 py-1.5 border border-border outline-none"
            />
            <button onClick={() => { setShowVideoInput(false); setVideoUrl(""); }} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
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
              <span className="text-sm font-semibold text-foreground">Poll</span>
              <button
                onClick={() => { setShowPoll(false); setPollOptions(["", "", ""]); }}
                className="text-xs text-destructive hover:underline"
              >
                Remove
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
                  placeholder={`Option ${i + 1}`}
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
                + Add Option
              </button>
            )}
          </div>
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
            onClick={() => { setLinkModalUrl(""); setShowLinkModal(true); }}
            className={cn("p-2 rounded-lg transition-colors", linkUrl ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
            title="Link"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowVideoInput(!showVideoInput)}
            className={cn("p-2 rounded-lg transition-colors", showVideoInput ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
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
          <button
            onClick={() => toast.info("Emoji picker em breve!")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            title="Emoji"
          >
            <Smile className="h-4 w-4" />
          </button>
          <button
            onClick={() => toast.info("GIF picker em breve!")}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-xs font-bold"
            title="GIF"
          >
            GIF
          </button>
        </div>

        {/* Right: category + cancel + post */}
        <div className="flex items-center gap-2">
          <Select value={selectedSpace} onValueChange={setSelectedSpace}>
            <SelectTrigger className="h-8 text-xs border-border bg-transparent w-auto min-w-[140px]">
              <SelectValue placeholder="Select a category" />
            </SelectTrigger>
            <SelectContent>
              {spaces?.map((s: any) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.emoji} {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors px-2"
          >
            CANCELAR
          </button>

          <button
            onClick={() => createPost.mutate()}
            disabled={!hasContent || !selectedSpace || createPost.isPending}
            className={cn(
              "px-4 py-1.5 rounded-lg text-sm font-bold uppercase tracking-wide transition-colors",
              hasContent && selectedSpace
                ? "bg-primary text-primary-foreground hover:opacity-90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {createPost.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "POST"}
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
    </div>
  );
}
