import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapLink from "@tiptap/extension-link";
import TiptapImage from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import {
  ArrowLeft, Upload, Video, Trash2, Save, Eye, EyeOff,
  Bold, Italic, Strikethrough, List, Heading2, Link2, ImageIcon,
  Youtube as YoutubeIcon, FileText, X, Loader2, Paperclip, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useUpdateLesson, useDeleteLesson,
  useLessonMaterials, useCreateMaterial, useDeleteMaterial,
  type CourseLesson, type LessonMaterial,
} from "@/hooks/useCourseBuilder";
import { LessonMobilePreview } from "@/components/course/LessonMobilePreview";

export interface LessonNavInfo {
  prevLesson: CourseLesson | null;
  nextLesson: CourseLesson | null;
}

export interface CourseBranding {
  highlightColor: string;
  bgColor: string;
  titleFont: string;
}

interface CourseLessonEditorProps {
  lesson: CourseLesson;
  onBack: () => void;
  onDeleted: () => void;
  onNavigate?: (lesson: CourseLesson) => void;
  nav?: LessonNavInfo;
  branding?: CourseBranding;
}

// ── Publish validation ──
// Minimum required: title ≥ 3 chars AND (video_url OR description with real text content)
function getPublishErrors(title: string, videoUrl: string, descHtml: string): string[] {
  const errors: string[] = [];
  if (title.trim().length < 3) errors.push("Título precisa ter ao menos 3 caracteres");
  const hasVideo = videoUrl.trim().length > 0;
  const textOnly = descHtml.replace(/<[^>]*>/g, "").trim();
  if (!hasVideo && textOnly.length < 10) errors.push("Adicione um vídeo ou descrição com pelo menos 10 caracteres");
  return errors;
}

export function CourseLessonEditor({ lesson, onBack, onDeleted, onNavigate, nav, branding }: CourseLessonEditorProps) {
  // ── Local state (versioning: always edit local, save explicitly) ──
  const [title, setTitle] = useState(lesson.title);
  const [videoUrl, setVideoUrl] = useState(lesson.video_url || "");
  const [description, setDescription] = useState(lesson.description_richtext || "");
  const [status, setStatus] = useState(lesson.status);
  const [dirty, setDirty] = useState(false);

  // Upload state
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [materialUploading, setMaterialUploading] = useState(false);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const materialInputRef = useRef<HTMLInputElement>(null);

  // Dialogs
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showVideoEmbedModal, setShowVideoEmbedModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [embedUrl, setEmbedUrl] = useState("");

  // Unsaved changes warning
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);

  // Hooks
  const updateLesson = useUpdateLesson();
  const deleteLessonMut = useDeleteLesson();
  const { data: materials = [] } = useLessonMaterials(lesson.id);
  const createMaterial = useCreateMaterial();
  const deleteMaterial = useDeleteMaterial();

  // Reset when lesson changes
  useEffect(() => {
    setTitle(lesson.title);
    setVideoUrl(lesson.video_url || "");
    setDescription(lesson.description_richtext || "");
    setStatus(lesson.status);
    setDirty(false);
  }, [lesson.id]);

  // ── Rich text editor ──
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage,
      Youtube.configure({ controls: true }),
    ],
    content: lesson.description_richtext || "",
    onUpdate: ({ editor: ed }) => {
      setDescription(ed.getHTML());
      setDirty(true);
    },
  });

  // Sync editor content on lesson switch
  useEffect(() => {
    if (editor && lesson.description_richtext !== undefined) {
      const current = editor.getHTML();
      if (current !== (lesson.description_richtext || "")) {
        editor.commands.setContent(lesson.description_richtext || "");
      }
    }
  }, [lesson.id, editor]);

  const markDirty = useCallback(() => setDirty(true), []);

  // ── Save ──
  const handleSave = (newStatus?: string) => {
    const targetStatus = newStatus || status;
    if (targetStatus === "published") {
      const errors = getPublishErrors(title, videoUrl, description);
      if (errors.length > 0) {
        errors.forEach((e) => toast.error(e));
        return;
      }
    }

    updateLesson.mutate(
      {
        id: lesson.id,
        module_id: lesson.module_id,
        title: title.trim() || "Sem título",
        video_url: videoUrl || null,
        description_richtext: description || null,
        status: targetStatus,
      },
      {
        onSuccess: () => {
          setStatus(targetStatus);
          setDirty(false);
          toast.success(targetStatus === "published" ? "Aula publicada!" : "Rascunho salvo!");
        },
        onError: () => toast.error("Erro ao salvar aula"),
      }
    );
  };

  // ── Delete ──
  const handleDelete = () => {
    deleteLessonMut.mutate(
      { id: lesson.id, module_id: lesson.module_id },
      {
        onSuccess: () => { toast.success("Aula excluída"); onDeleted(); },
        onError: () => toast.error("Erro ao excluir"),
      }
    );
  };

  // ── Back with unsaved check ──
  const handleBack = () => {
    if (dirty) {
      setShowUnsavedWarning(true);
    } else {
      onBack();
    }
  };

  // ── Video upload ──
  const handleVideoUpload = async (file: File) => {
    if (file.size > 500 * 1024 * 1024) {
      toast.error("Vídeo máximo: 500MB");
      return;
    }
    setVideoUploading(true);
    setVideoProgress(10);
    try {
      const ext = file.name.split(".").pop();
      const path = `course-videos/${lesson.id}/${Date.now()}.${ext}`;
      setVideoProgress(30);
      const { error } = await supabase.storage.from("private-files").upload(path, file);
      if (error) throw error;
      setVideoProgress(80);
      const { data: urlData } = supabase.storage.from("private-files").getPublicUrl(path);
      setVideoUrl(urlData.publicUrl);
      setDirty(true);
      setVideoProgress(100);
      toast.success("Vídeo enviado!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao enviar vídeo");
    } finally {
      setTimeout(() => { setVideoUploading(false); setVideoProgress(0); }, 500);
    }
  };

  // ── Material upload ──
  const handleMaterialUpload = async (files: FileList) => {
    setMaterialUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 50 * 1024 * 1024) {
          toast.error(`${file.name}: máximo 50MB`);
          continue;
        }
        const ext = file.name.split(".").pop();
        const path = `course-materials/${lesson.id}/${Date.now()}-${file.name}`;
        const { error } = await supabase.storage.from("private-files").upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from("private-files").getPublicUrl(path);
        await createMaterial.mutateAsync({
          lesson_id: lesson.id,
          file_name: file.name,
          file_url: urlData.publicUrl,
          file_type: ext || null,
          file_size: file.size,
        } as any);
      }
      toast.success("Material(is) adicionado(s)!");
    } catch (err) {
      console.error(err);
      toast.error("Erro ao enviar material");
    } finally {
      setMaterialUploading(false);
    }
  };

  const publishErrors = getPublishErrors(title, videoUrl, description);
  const canPublish = publishErrors.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" onClick={handleBack} className="h-8 w-8" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Editando aula</p>
          <p className="text-sm font-medium truncate">{title || "Sem título"}</p>
        </div>
        <Badge variant={status === "published" ? "default" : "outline"} className="text-xs">
          {status === "published" ? <><Eye className="h-3 w-3 mr-1" />Publicada</> : <><EyeOff className="h-3 w-3 mr-1" />Rascunho</>}
        </Badge>
        {dirty && <span className="text-xs text-amber-500 font-medium">● Não salvo</span>}
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {/* Video upload */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Vídeo da aula</Label>
          {videoUrl ? (
            <div className="relative rounded-lg border border-border overflow-hidden bg-muted">
              <div className="aspect-video flex items-center justify-center bg-black/5">
                <Video className="h-10 w-10 text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground truncate max-w-xs">{videoUrl.split("/").pop()}</span>
              </div>
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-7 w-7"
                onClick={() => { setVideoUrl(""); markDirty(); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors",
                videoUploading && "pointer-events-none opacity-60"
              )}
              onClick={() => !videoUploading && videoInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file?.type.startsWith("video/")) handleVideoUpload(file);
              }}
            >
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-1">Arraste um vídeo aqui ou</p>
              <Button variant="outline" size="sm" type="button" disabled={videoUploading}>
                {videoUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />Enviando...</> : "Selecionar vídeo"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">MP4, WebM, MOV — máx. 500MB</p>
            </div>
          )}
          {videoUploading && <Progress value={videoProgress} className="h-1.5" />}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ""; }}
          />

          {/* Or paste URL */}
          {!videoUrl && !videoUploading && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">ou cole uma URL:</span>
              <Input
                placeholder="https://youtube.com/watch?v=..."
                className="h-7 text-xs flex-1"
                onBlur={(e) => { if (e.target.value.trim()) { setVideoUrl(e.target.value.trim()); markDirty(); } }}
                onKeyDown={(e) => { if (e.key === "Enter") { setVideoUrl((e.target as HTMLInputElement).value.trim()); markDirty(); } }}
              />
            </div>
          )}
        </div>

        {/* Title */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Título da aula</Label>
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            maxLength={100}
            placeholder="Nome da aula"
            className={title.length > 100 ? "border-destructive" : ""}
          />
          <p className="text-xs text-muted-foreground text-right">{title.length}/100</p>
        </div>

        {/* Rich text description */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Descrição / Conteúdo da aula</Label>
          {editor && (
            <div className="border border-border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-ring">
              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30">
                <ToolbarBtn
                  active={editor.isActive("heading", { level: 2 })}
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  icon={<Heading2 className="h-4 w-4" />}
                  label="Título"
                />
                <ToolbarBtn
                  active={editor.isActive("bold")}
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  icon={<Bold className="h-4 w-4" />}
                  label="Negrito"
                />
                <ToolbarBtn
                  active={editor.isActive("italic")}
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  icon={<Italic className="h-4 w-4" />}
                  label="Itálico"
                />
                <ToolbarBtn
                  active={editor.isActive("strike")}
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  icon={<Strikethrough className="h-4 w-4" />}
                  label="Riscado"
                />
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarBtn
                  active={editor.isActive("bulletList")}
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  icon={<List className="h-4 w-4" />}
                  label="Lista"
                />
                <div className="w-px h-5 bg-border mx-1" />
                <ToolbarBtn
                  active={false}
                  onClick={() => { setLinkUrl(""); setShowLinkModal(true); }}
                  icon={<Link2 className="h-4 w-4" />}
                  label="Link"
                />
                <ToolbarBtn
                  active={false}
                  onClick={() => { setImageUrl(""); setShowImageModal(true); }}
                  icon={<ImageIcon className="h-4 w-4" />}
                  label="Imagem"
                />
                <ToolbarBtn
                  active={false}
                  onClick={() => { setEmbedUrl(""); setShowVideoEmbedModal(true); }}
                  icon={<YoutubeIcon className="h-4 w-4" />}
                  label="Vídeo embed"
                />
              </div>
              {/* Editor area */}
              <EditorContent
                editor={editor}
                className="prose prose-sm max-w-none p-4 min-h-[200px] [&>.ProseMirror]:outline-none [&>.ProseMirror]:min-h-[180px]"
              />
            </div>
          )}
        </div>

        {/* Supporting materials */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Materiais de apoio</Label>
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={() => materialInputRef.current?.click()}
              disabled={materialUploading}
            >
              {materialUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
              Adicionar arquivo
            </Button>
            <input
              ref={materialInputRef}
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv,.mp3,.wav"
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) handleMaterialUpload(e.target.files); e.target.value = ""; }}
            />
          </div>

          {materials.length > 0 && (
            <div className="space-y-1.5">
              {materials.map((mat) => (
                <MaterialRow key={mat.id} material={mat} onDelete={() => deleteMaterial.mutate({ id: mat.id, lesson_id: mat.lesson_id })} />
              ))}
            </div>
          )}

          {materials.length === 0 && !materialUploading && (
            <p className="text-xs text-muted-foreground py-3 text-center">
              Nenhum material adicionado. Aceita PDF, DOCX, XLSX, ZIP e mais.
            </p>
          )}
        </div>
      </div>

      {/* ── Footer actions ── */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-background">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive gap-1"
          onClick={() => setShowDeleteConfirm(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Excluir
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSave("draft")}
            disabled={updateLesson.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            Salvar rascunho
          </Button>
          <Button
            size="sm"
            onClick={() => handleSave("published")}
            disabled={updateLesson.isPending || !canPublish}
            title={!canPublish ? publishErrors.join("; ") : undefined}
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            Publicar
          </Button>
        </div>
      </div>

      {/* ── Modals ── */}
      {/* Link modal */}
      <Dialog open={showLinkModal} onOpenChange={setShowLinkModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Inserir link</DialogTitle></DialogHeader>
          <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLinkModal(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (linkUrl) editor?.chain().focus().setLink({ href: linkUrl }).run();
              setShowLinkModal(false);
            }}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image modal */}
      <Dialog open={showImageModal} onOpenChange={setShowImageModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Inserir imagem</DialogTitle></DialogHeader>
          <Input placeholder="URL da imagem" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImageModal(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (imageUrl) editor?.chain().focus().setImage({ src: imageUrl }).run();
              setShowImageModal(false);
            }}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Video embed modal */}
      <Dialog open={showVideoEmbedModal} onOpenChange={setShowVideoEmbedModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Embed de vídeo (YouTube)</DialogTitle></DialogHeader>
          <Input placeholder="https://youtube.com/watch?v=..." value={embedUrl} onChange={(e) => setEmbedUrl(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVideoEmbedModal(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (embedUrl) editor?.chain().focus().setYoutubeVideo({ src: embedUrl }).run();
              setShowVideoEmbedModal(false);
            }}>Inserir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir aula?</AlertDialogTitle>
            <AlertDialogDescription>"{title}" será excluída permanentemente com todos os materiais.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes warning */}
      <AlertDialog open={showUnsavedWarning} onOpenChange={setShowUnsavedWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>Você tem alterações que não foram salvas. Deseja sair sem salvar?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowUnsavedWarning(false); onBack(); }}>
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Toolbar button ──
function ToolbarBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-7 w-7 inline-flex items-center justify-center rounded text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
      title={label}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

// ── Material row ──
function MaterialRow({ material, onDelete }: { material: LessonMaterial; onDelete: () => void }) {
  const sizeLabel = material.file_size
    ? material.file_size > 1024 * 1024
      ? `${(material.file_size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(material.file_size / 1024)} KB`
    : null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-muted/30 group">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="text-xs font-medium truncate flex-1">{material.file_name}</span>
      {material.file_type && (
        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 uppercase">{material.file_type}</Badge>
      )}
      {sizeLabel && <span className="text-[10px] text-muted-foreground">{sizeLabel}</span>}
      <a href={material.file_url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground">
        <Download className="h-3.5 w-3.5" />
      </a>
      <button onClick={onDelete} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" aria-label="Remover material">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
