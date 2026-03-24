import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Send, X, Bold, Italic, List, ListOrdered, Quote, Code,
  Heading2, ImagePlus, Video, Link2, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthProvider";

interface PostComposerProps {
  communityId: string;
  memberId: string;
  memberPoints: number;
  pointsPerPost: number;
  spaces: any[];
  isAdmin: boolean;
  preselectedSpaceId?: string | null;
  onClose: () => void;
  onSuccess: () => void;
  isMobile?: boolean;
}

export default function PostComposer({
  communityId, memberId, memberPoints, pointsPerPost,
  spaces, isAdmin, preselectedSpaceId, onClose, onSuccess, isMobile,
}: PostComposerProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedSpace, setSelectedSpace] = useState(preselectedSpaceId || "");
  const [selectedType, setSelectedType] = useState("DISCUSSION");
  const [title, setTitle] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  // Poll state
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
  const [pollEndsAt, setPollEndsAt] = useState("");

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[120px] p-3 focus:outline-none",
      },
    },
  });

  const handleImageUpload = useCallback(async (files: FileList | null) => {
    if (!files || !user) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files).slice(0, 5 - images.length)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} é maior que 5MB`);
          continue;
        }
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

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  const getVideoEmbed = (url: string) => {
    if (!url) return null;
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
    const loomMatch = url.match(/loom\.com\/share\/([a-z0-9]+)/i);
    if (loomMatch) return `https://www.loom.com/embed/${loomMatch[1]}`;
    return null;
  };

  const createPost = useMutation({
    mutationFn: async () => {
      if (!selectedSpace || !title.trim()) throw new Error("Preencha espaço e título");

      // Anti-spam check
      const { checkSpam } = await import("@/lib/antispam");
      const spamResult = await checkSpam(memberId, communityId, "post", title.trim());
      if (!spamResult.allowed) throw new Error(spamResult.reason || "Spam detectado");

      const body = editor?.getHTML() || "";
      const plainBody = editor?.getText() || "";

      const postData: any = {
        community_id: communityId,
        space_id: selectedSpace,
        author_id: memberId,
        title: title.trim(),
        body: plainBody.trim() ? body : null,
        post_type: selectedType,
        images: images.length > 0 ? images : null,
        video_url: videoUrl.trim() || null,
        link_url: linkUrl.trim() || null,
      };

      if (selectedType === "POLL") {
        const validOptions = pollOptions.filter((o) => o.trim());
        if (validOptions.length < 2) throw new Error("Enquete precisa de pelo menos 2 opções");
        postData.poll_options = validOptions.map((text, i) => ({
          id: `opt_${i}_${Date.now()}`,
          text: text.trim(),
          votes: 0,
        }));
        postData.poll_allow_multiple = pollAllowMultiple;
        postData.poll_ends_at = pollEndsAt || null;
      }

      const { data: post, error } = await supabase
        .from("community_posts")
        .insert(postData)
        .select()
        .single();
      if (error) throw error;

      // Award points
      await supabase.from("community_points_log").insert({
        community_id: communityId,
        member_id: memberId,
        action: "POST_CREATED",
        points: pointsPerPost,
        reference_id: post.id,
        reference_type: "post",
        description: "Criou um post",
      });

      await supabase
        .from("community_members")
        .update({
          total_points: (memberPoints || 0) + pointsPerPost,
          last_active_at: new Date().toISOString(),
        })
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

  const videoEmbed = getVideoEmbed(videoUrl);

  const content = (
    <div className="space-y-4">
      {/* Space + Type selectors */}
      <div className="flex gap-2">
        <Select value={selectedSpace} onValueChange={setSelectedSpace}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Selecione o espaço" />
          </SelectTrigger>
          <SelectContent>
            {spaces?.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>
                {s.emoji} {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="DISCUSSION">💬 Discussão</SelectItem>
            <SelectItem value="QUESTION">❓ Pergunta</SelectItem>
            <SelectItem value="WIN">🏆 Conquista</SelectItem>
            {isAdmin && <SelectItem value="ANNOUNCEMENT">📢 Anúncio</SelectItem>}
            <SelectItem value="POLL">📊 Enquete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Title */}
      <Input
        placeholder="Título do post"
        value={title}
        onChange={(e) => setTitle(e.target.value.slice(0, 200))}
        className="text-base font-semibold"
        maxLength={200}
      />

      {/* Rich text editor */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 p-1.5 border-b border-border bg-muted/30 flex-wrap">
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleBold().run()}
            data-active={editor?.isActive("bold")}>
            <Bold className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <Code className="h-3.5 w-3.5" />
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7"
            onClick={() => fileInputRef.current?.click()} disabled={uploading || images.length >= 5}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <EditorContent editor={editor} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleImageUpload(e.target.files)}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((url, i) => (
            <div key={i} className="relative group">
              <img src={url} alt="" className="h-20 w-20 rounded-lg object-cover border border-border" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground self-end">{images.length}/5 imagens</p>
        </div>
      )}

      {/* Video URL */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="URL do vídeo (YouTube, Vimeo, Loom)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="text-sm"
          />
        </div>
        {videoEmbed && (
          <div className="aspect-video rounded-lg overflow-hidden border border-border">
            <iframe src={videoEmbed} className="w-full h-full" allowFullScreen />
          </div>
        )}
      </div>

      {/* Link URL */}
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Link externo (opcional)"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          className="text-sm"
        />
      </div>

      {/* Poll options */}
      {selectedType === "POLL" && (
        <div className="space-y-3 p-3 border border-border rounded-lg bg-muted/20">
          <p className="text-xs font-semibold text-foreground">📊 Opções da enquete</p>
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <Input
                placeholder={`Opção ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const copy = [...pollOptions];
                  copy[i] = e.target.value;
                  setPollOptions(copy);
                }}
              />
              {pollOptions.length > 2 && (
                <Button variant="ghost" size="icon" className="shrink-0"
                  onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          {pollOptions.length < 8 && (
            <Button variant="outline" size="sm" onClick={() => setPollOptions([...pollOptions, ""])}>
              + Adicionar opção
            </Button>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <Label className="text-xs">Permitir múltipla escolha</Label>
            <Switch checked={pollAllowMultiple} onCheckedChange={setPollAllowMultiple} />
          </div>
          <div>
            <Label className="text-xs">Encerra em (opcional)</Label>
            <Input
              type="datetime-local"
              value={pollEndsAt}
              onChange={(e) => setPollEndsAt(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button
          onClick={() => createPost.mutate()}
          disabled={!title.trim() || !selectedSpace || createPost.isPending}
        >
          {createPost.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
          Publicar
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-full h-full max-h-full sm:max-w-lg sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Post</DialogTitle>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card className="p-5 space-y-0">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Novo Post</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {content}
    </Card>
  );
}
