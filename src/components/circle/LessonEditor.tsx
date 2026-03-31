import { useState, useCallback, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TiptapLink from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Image as ImageIcon, Link as LinkIcon, Youtube as YoutubeIcon,
  Heading1, Heading2, Heading3, Heading4,
  Loader2, Save, X, CheckCircle2, Upload,
  ChevronDown, ExternalLink, FileText, MessageSquare, Paperclip, Trash2, File,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── Migrate legacy markdown to HTML ─────────────────
function migrateContent(raw: string | null): string {
  if (!raw) return "";
  if (raw.trim().startsWith("<")) return raw;
  let html = raw.replace(
    /\[youtube\]\(([^)]+)\)/g,
    (_, url: string) => {
      const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (m) return `<div data-youtube-video><iframe src="https://www.youtube.com/embed/${m[1]}" width="640" height="480" allowfullscreen></iframe></div>`;
      return `<a href="${url}">${url}</a>`;
    }
  );
  html = html.replace(/\n\n/g, "</p><p>");
  return `<p>${html}</p>`;
}

// ─── Types ───────────────────────────────────────────
type ResourceLink = { type: "link"; label: string; url: string };
type ResourceFile = { type: "file"; label: string; fileUrl: string };
type ResourcePost = { type: "post"; postId: string };
type Resource = ResourceLink | ResourceFile | ResourcePost;

interface LessonEditorProps {
  lesson: {
    id: string;
    course_id: string;
    title: string;
    content: string | null;
    is_published: boolean;
    resources?: Resource[] | null;
  };
  isAdmin: boolean;
  courseId: string;
  memberId?: string;
  onMarkCompleted?: (lessonId: string) => void;
  isCompleted?: boolean;
}

// ─── Toolbar Button ──────────────────────────────────
function ToolbarButton({ icon: Icon, label, action, isActive }: {
  editor: any; icon: React.ElementType; label: string; action: () => void; isActive?: boolean;
}) {
  return (
    <button
      onClick={action}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded transition-colors text-muted-foreground/60 hover:text-foreground",
        isActive && "text-foreground"
      )}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ─── Resources Read-Only ─────────────────────────────
function ResourcesList({ resources }: { resources: Resource[] }) {
  if (resources.length === 0) return null;
  return (
    <div className="border-t border-border px-6 py-4 space-y-2">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <Paperclip className="h-4 w-4" /> Recursos
      </h3>
      <div className="space-y-1.5">
        {resources.map((r, i) => {
          if (r.type === "link") {
            return (
              <a key={i} href={r.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                {r.label || r.url}
              </a>
            );
          }
          if (r.type === "file") {
            return (
              <a key={i} href={r.fileUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline py-1">
                <File className="h-3.5 w-3.5 shrink-0" />
                {r.label || "Arquivo"}
              </a>
            );
          }
          if (r.type === "post") {
            return (
              <div key={i} className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                Post fixado: {r.postId.slice(0, 8)}…
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────
export default function LessonEditor({ lesson, isAdmin, courseId, memberId, onMarkCompleted, isCompleted = false }: LessonEditorProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [isPublished, setIsPublished] = useState(lesson.is_published);
  const [hasChanges, setHasChanges] = useState(false);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");

  // Resources state
  const [resources, setResources] = useState<Resource[]>(() =>
    Array.isArray(lesson.resources) ? (lesson.resources as Resource[]) : []
  );
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [postId, setPostId] = useState("");
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      Image.configure({ inline: false, allowBase64: true }),
      TiptapLink.configure({ openOnClick: false, autolink: true }),
      Youtube.configure({ width: 640, height: 360 }),
    ],
    content: lesson.content || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] p-4",
      },
    },
    onUpdate: () => setHasChanges(true),
  });

  // Reset on lesson change
  const [prevId, setPrevId] = useState(lesson.id);
  if (lesson.id !== prevId) {
    setPrevId(lesson.id);
    setTitle(lesson.title);
    setIsPublished(lesson.is_published);
    setResources(Array.isArray(lesson.resources) ? (lesson.resources as Resource[]) : []);
    setHasChanges(false);
    editor?.commands.setContent(lesson.content || "");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const htmlContent = editor?.getHTML() || null;
      const { error } = await supabase
        .from("circle_lessons")
        .update({
          title: title.trim() || "Untitled Lesson",
          content: htmlContent,
          is_published: isPublished,
          resources: resources as any,
        } as any)
        .eq("id", lesson.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", courseId] });
      setHasChanges(false);
      toast.success("Lição salva!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleCancel = () => {
    setTitle(lesson.title);
    setIsPublished(lesson.is_published);
    setResources(Array.isArray(lesson.resources) ? (lesson.resources as Resource[]) : []);
    setHasChanges(false);
    editor?.commands.setContent(lesson.content || "");
  };

  // ── Resource helpers ──
  const addResource = (r: Resource) => {
    setResources(prev => [...prev, r]);
    setHasChanges(true);
  };

  const removeResource = (index: number) => {
    setResources(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleAddLink = () => {
    if (!linkUrl.trim()) return;
    addResource({ type: "link", label: linkLabel.trim() || linkUrl.trim(), url: linkUrl.trim() });
    setLinkLabel("");
    setLinkUrl("");
    setLinkDialogOpen(false);
  };

  const handleAddPost = () => {
    if (!postId.trim()) return;
    addResource({ type: "post", postId: postId.trim() });
    setPostId("");
    setPostDialogOpen(false);
  };

  const handleFileUpload = async (file: globalThis.File) => {
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `classroom/${courseId}/${lesson.id}_${Date.now()}.${ext}`;
      const { data, error } = await supabase.storage.from("private-files").upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("private-files").getPublicUrl(data.path);
      addResource({ type: "file", label: file.name, fileUrl: urlData.publicUrl });
      toast.success("Arquivo enviado!");
    } catch (e: any) {
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploadingFile(false);
    }
  };

  // ── Editor toolbar helpers ──
  const promptAndInsertLink = () => {
    const url = window.prompt("URL do link:");
    if (url && editor) editor.chain().focus().setLink({ href: url }).run();
  };
  const promptAndInsertImage = () => {
    const url = window.prompt("URL da imagem:");
    if (url && editor) editor.chain().focus().setImage({ src: url }).run();
  };
  const handleAddVideo = () => {
    if (!videoUrl.trim() || !editor) return;
    try {
      editor.chain().focus().setYoutubeVideo({ src: videoUrl.trim() }).run();
      setHasChanges(true);
    } catch (err) {
      console.error("Erro ao inserir vídeo:", err);
      toast.error("URL de vídeo inválida ou não suportada");
    } finally {
      setVideoUrl("");
      setVideoDialogOpen(false);
    }
  };

  const parsedResources: Resource[] = resources;

  // ═══ READ-ONLY VIEW ═══
  if (!isAdmin) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">{lesson.title}</h2>
          {lesson.content ? (
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: lesson.content }} />
          ) : (
            <p className="text-muted-foreground text-sm italic">Conteúdo em breve...</p>
          )}
        </div>
        {parsedResources.length > 0 && <ResourcesList resources={parsedResources} />}
        {memberId && onMarkCompleted && (
          <div className="px-6 pb-6">
            <Button
              variant={isCompleted ? "outline" : "default"}
              size="sm"
              onClick={() => !isCompleted && onMarkCompleted(lesson.id)}
              disabled={isCompleted}
              className={cn(isCompleted && "border-emerald-500/40 text-emerald-600")}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {isCompleted ? "Concluída!" : "Marcar como concluída"}
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ═══ EDIT VIEW ═══
  return (
    <div className="space-y-4">
      <div className="bg-card rounded-lg shadow-sm p-6">
        {/* Title */}
        <Input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
          placeholder="Título da lição..."
          className="text-[20px] font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/40 mb-4"
        />

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 py-2 border-y border-border/50 mb-4 flex-wrap">
          <ToolbarButton editor={editor} icon={Heading1} label="Heading 1" action={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor?.isActive("heading", { level: 1 })} />
          <ToolbarButton editor={editor} icon={Heading2} label="Heading 2" action={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor?.isActive("heading", { level: 2 })} />
          <ToolbarButton editor={editor} icon={Heading3} label="Heading 3" action={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor?.isActive("heading", { level: 3 })} />
          <ToolbarButton editor={editor} icon={Heading4} label="Heading 4" action={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()} isActive={editor?.isActive("heading", { level: 4 })} />
          <Separator orientation="vertical" className="h-4 mx-1.5" />
          <ToolbarButton editor={editor} icon={Bold} label="Bold" action={() => editor?.chain().focus().toggleBold().run()} isActive={editor?.isActive("bold")} />
          <ToolbarButton editor={editor} icon={Italic} label="Italic" action={() => editor?.chain().focus().toggleItalic().run()} isActive={editor?.isActive("italic")} />
          <ToolbarButton editor={editor} icon={Strikethrough} label="Strikethrough" action={() => editor?.chain().focus().toggleStrike().run()} isActive={editor?.isActive("strike")} />
          <ToolbarButton editor={editor} icon={Code} label="Code" action={() => editor?.chain().focus().toggleCode().run()} isActive={editor?.isActive("code")} />
          <Separator orientation="vertical" className="h-4 mx-1.5" />
          <ToolbarButton editor={editor} icon={List} label="Bullet List" action={() => editor?.chain().focus().toggleBulletList().run()} isActive={editor?.isActive("bulletList")} />
          <ToolbarButton editor={editor} icon={ListOrdered} label="Numbered List" action={() => editor?.chain().focus().toggleOrderedList().run()} isActive={editor?.isActive("orderedList")} />
          <ToolbarButton editor={editor} icon={Quote} label="Blockquote" action={() => editor?.chain().focus().toggleBlockquote().run()} isActive={editor?.isActive("blockquote")} />
          <Separator orientation="vertical" className="h-4 mx-1.5" />
          <ToolbarButton editor={editor} icon={ImageIcon} label="Image" action={promptAndInsertImage} />
          <ToolbarButton editor={editor} icon={LinkIcon} label="Link" action={promptAndInsertLink} isActive={editor?.isActive("link")} />
          <ToolbarButton editor={editor} icon={YoutubeIcon} label="YouTube" action={() => setVideoDialogOpen(true)} />
        </div>

        {/* Tiptap Editor */}
        <EditorContent editor={editor} />
      </div>

      {/* ── Resources Section ── */}
      <div className="bg-card rounded-lg shadow-sm overflow-hidden">
        <div className="p-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Paperclip className="h-4 w-4" /> Recursos
          </h3>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                Adicionar <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setLinkDialogOpen(true)}>
                <ExternalLink className="h-4 w-4 mr-2" /> Adicionar link de recurso
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileUploadRef.current?.click()} disabled={uploadingFile}>
                <Upload className="h-4 w-4 mr-2" /> Adicionar arquivo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPostDialogOpen(true)}>
                <MessageSquare className="h-4 w-4 mr-2" /> Fixar post da comunidade
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileUploadRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        {resources.length > 0 && (
          <div className="px-4 pb-4 space-y-1.5">
            {resources.map((r, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/40 group">
                {r.type === "link" && <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />}
                {r.type === "file" && <File className="h-4 w-4 text-muted-foreground shrink-0" />}
                {r.type === "post" && <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0" />}
                <span className="text-sm text-foreground truncate flex-1">
                  {r.type === "link" ? r.label : r.type === "file" ? r.label : `Post: ${r.postId.slice(0, 8)}…`}
                </span>
                <button
                  onClick={() => removeResource(i)}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </button>
              </div>
            ))}
          </div>
        )}

        {resources.length === 0 && (
          <div className="px-4 pb-4">
            <p className="text-xs text-muted-foreground">Nenhum recurso adicionado.</p>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-card rounded-lg shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch id="lesson-published" checked={isPublished} onCheckedChange={(v) => { setIsPublished(v); setHasChanges(true); }} />
          <Label htmlFor="lesson-published" className="text-sm">{isPublished ? "Publicado" : "Rascunho"}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleCancel} disabled={!hasChanges}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending} className={cn(!hasChanges && "opacity-50 cursor-not-allowed")}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>

      {/* ── Video Dialog ── */}
      <Dialog open={videoDialogOpen} onOpenChange={(open) => { setVideoDialogOpen(open); if (!open) setVideoUrl(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar vídeo</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="YouTube, Loom, Vimeo ou link de vídeo" onKeyDown={(e) => { if (e.key === "Enter") handleAddVideo(); }} />
            <div className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center gap-2 text-center">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Arraste e solte o vídeo aqui</p>
              <button type="button" className="text-sm text-primary hover:underline">ou selecione arquivo</button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setVideoDialogOpen(false); setVideoUrl(""); }}>Cancelar</Button>
            <Button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleAddVideo(); }} disabled={!videoUrl.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Link Resource Dialog ── */}
      <Dialog open={linkDialogOpen} onOpenChange={(open) => { setLinkDialogOpen(open); if (!open) { setLinkLabel(""); setLinkUrl(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Adicionar link de recurso</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">Nome do link</Label>
              <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Ex: Documentação oficial" className="mt-1" />
            </div>
            <div>
              <Label className="text-sm">URL</Label>
              <Input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." className="mt-1" onKeyDown={(e) => { if (e.key === "Enter") handleAddLink(); }} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setLinkDialogOpen(false); setLinkLabel(""); setLinkUrl(""); }}>Cancelar</Button>
            <Button onClick={handleAddLink} disabled={!linkUrl.trim()}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pin Post Dialog ── */}
      <Dialog open={postDialogOpen} onOpenChange={(open) => { setPostDialogOpen(open); if (!open) setPostId(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Fixar post da comunidade</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">ID do post</Label>
              <Input value={postId} onChange={(e) => setPostId(e.target.value)} placeholder="Cole o ID do post aqui" className="mt-1" onKeyDown={(e) => { if (e.key === "Enter") handleAddPost(); }} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setPostDialogOpen(false); setPostId(""); }}>Cancelar</Button>
            <Button onClick={handleAddPost} disabled={!postId.trim()}>Fixar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
