import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Save,
  Upload,
  FileText,
  Video,
  FileType,
  Headphones,
  Bold,
  Italic,
  List,
  ListOrdered,
  Link,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type MemberContent = Database["public"]["Tables"]["member_content"]["Row"];
type MediaType = "VIDEO" | "TEXT" | "PDF" | "AUDIO";

interface LessonEditorProps {
  productId: string;
  lesson: MemberContent | null;
  onLessonUpdate: () => void;
  onLessonChange: (lesson: MemberContent | null) => void;
}

export function LessonEditor({
  productId,
  lesson,
  onLessonUpdate,
  onLessonChange,
}: LessonEditorProps) {
  const [title, setTitle] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("TEXT");
  const [isFree, setIsFree] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [duration, setDuration] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>();

  // Rich text editor for TEXT type
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setDescription(html);
      // Trigger auto-save
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = setTimeout(() => {
        if (lesson) {
          saveLesson();
        }
      }, 5000);
    },
  });

  // Load lesson data when selection changes
  useEffect(() => {
    if (lesson) {
      setTitle(lesson.title);
      setMediaType((lesson.media_type as MediaType) || "TEXT");
      setIsFree(lesson.is_free || false);
      setMediaUrl(lesson.media_url || "");
      setDescription(lesson.description || "");
      
      if (lesson.duration) {
        const hours = Math.floor(lesson.duration / 3600);
        const minutes = Math.floor((lesson.duration % 3600) / 60);
        const seconds = lesson.duration % 60;
        setDuration(
          hours > 0
            ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
            : `${minutes}:${seconds.toString().padStart(2, "0")}`
        );
      } else {
        setDuration("");
      }

      // Update editor content
      if (mediaType === "TEXT" && editor) {
        editor.commands.setContent(lesson.text_content || "");
      }
    }
  }, [lesson, editor, mediaType]);

  // Parse duration string to seconds
  const parseDuration = (duration: string): number => {
    if (!duration) return 0;
    
    const parts = duration.split(":").map(Number);
    if (parts.length === 2) {
      // mm:ss format
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // hh:mm:ss format
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  };

  const saveLesson = async () => {
    if (!lesson) return;

    setSaving(true);
    try {
      const updateData: Partial<MemberContent> = {
        title: title.trim() || "Sem título",
        media_type: mediaType,
        is_free: isFree,
        media_url: mediaUrl || null,
        duration: parseDuration(duration),
        description: description || null,
      };

      // Add text content for TEXT type
      if (mediaType === "TEXT" && editor) {
        updateData.text_content = editor.getHTML();
      }

      const { error } = await supabase
        .from("member_content")
        .update(updateData)
        .eq("id", lesson.id);

      if (error) throw error;

      toast.success("Aula salva!");
      onLessonUpdate();
    } catch (error) {
      console.error("Error saving lesson:", error);
      toast.error("Erro ao salvar aula");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!lesson) return;

    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Sessão expirada. Entre novamente para enviar arquivos.");
        return;
      }

      // Generate unique filename — o bucket privado exige o prefixo `auth.uid()`
      const fileExt = file.name.split('.').pop();
      const fileName = `${lesson.id}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/courses/${productId}/${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from("private-files")
        .upload(filePath, file);

      if (error) throw error;

      // A URL guardada contém o marcador do bucket privado; o player pede
      // uma URL assinada de curta duração ao abrir a aula.
      const { data: urlData } = supabase.storage
        .from("private-files")
        .getPublicUrl(data.path);


      setMediaUrl(urlData.publicUrl);
      toast.success("Arquivo enviado!");
    } catch (error) {
      console.error("Error uploading file:", error);
      toast.error("Erro ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  };

  const renderMediaTypeIcon = (type: MediaType) => {
    switch (type) {
      case "VIDEO":
        return <Video className="h-4 w-4" />;
      case "TEXT":
        return <FileText className="h-4 w-4" />;
      case "PDF":
        return <FileType className="h-4 w-4" />;
      case "AUDIO":
        return <Headphones className="h-4 w-4" />;
    }
  };

  if (!lesson) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">
            Selecione ou crie uma aula
          </h3>
          <p className="text-sm text-muted-foreground">
            Escolha uma aula na barra lateral para começar a editá-la
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {renderMediaTypeIcon(mediaType)}
            <h2 className="text-xl font-semibold text-foreground">
              Editar Aula
            </h2>
          </div>
          <Button
            onClick={saveLesson}
            disabled={saving}
            className="kivo-gradient text-primary-foreground"
          >
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Salvando..." : "Salvar Aula"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações Básicas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="title">Nome da Aula</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Digite o nome da aula"
              />
            </div>

            <div>
              <Label htmlFor="media-type">Tipo de Conteúdo</Label>
              <Select
                value={mediaType}
                onValueChange={(value: MediaType) => setMediaType(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIDEO">
                    <div className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Vídeo
                    </div>
                  </SelectItem>
                  <SelectItem value="TEXT">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Texto
                    </div>
                  </SelectItem>
                  <SelectItem value="PDF">
                    <div className="flex items-center gap-2">
                      <FileType className="h-4 w-4" />
                      PDF
                    </div>
                  </SelectItem>
                  <SelectItem value="AUDIO">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-4 w-4" />
                      Áudio
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="is-free"
                checked={isFree}
                onCheckedChange={setIsFree}
              />
              <Label htmlFor="is-free">Aula gratuita (preview)</Label>
            </div>
          </CardContent>
        </Card>

        {/* Content based on media type */}
        {mediaType === "VIDEO" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Conteúdo de Vídeo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Upload de Vídeo ou URL Externa</Label>
                <div className="mt-2 space-y-3">
                  <div className="flex gap-2">
                    <Input
                      placeholder="URL do YouTube/Vimeo ou arquivo local"
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Enviando..." : "Upload"}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="duration">Duração (mm:ss ou hh:mm:ss)</Label>
                <Input
                  id="duration"
                  placeholder="Ex: 5:30 ou 1:05:30"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="description">Descrição/Notas</Label>
                <Textarea
                  id="description"
                  placeholder="Descreva o conteúdo da aula"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {mediaType === "TEXT" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Editor de Texto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Toolbar */}
                <div className="flex items-center gap-2 p-2 border border-border rounded-md">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleBold().run()}
                    className={cn(
                      "h-8 w-8 p-0",
                      editor?.isActive("bold") && "bg-muted"
                    )}
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => editor?.chain().focus().toggleItalic().run()}
                    className={cn(
                      "h-8 w-8 p-0",
                      editor?.isActive("italic") && "bg-muted"
                    )}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      editor?.chain().focus().toggleBulletList().run()
                    }
                    className={cn(
                      "h-8 w-8 p-0",
                      editor?.isActive("bulletList") && "bg-muted"
                    )}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      editor?.chain().focus().toggleOrderedList().run()
                    }
                    className={cn(
                      "h-8 w-8 p-0",
                      editor?.isActive("orderedList") && "bg-muted"
                    )}
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </div>

                {/* Editor */}
                <div className="min-h-[300px] p-4 border border-border rounded-md focus-within:ring-2 focus-within:ring-ring">
                  <EditorContent
                    editor={editor}
                    className="prose max-w-none [&>.ProseMirror]:outline-none"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {(mediaType === "PDF" || mediaType === "AUDIO") && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Upload de {mediaType === "PDF" ? "PDF" : "Áudio"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Arquivo</Label>
                <div className="mt-2">
                  <div className="flex gap-2">
                    <Input
                      placeholder={`URL do arquivo ${mediaType === "PDF" ? "PDF" : "de áudio"}`}
                      value={mediaUrl}
                      onChange={(e) => setMediaUrl(e.target.value)}
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {uploading ? "Enviando..." : "Upload"}
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={mediaType === "PDF" ? ".pdf" : "audio/*"}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              </div>

              {mediaType === "AUDIO" && (
                <div>
                  <Label htmlFor="audio-duration">Duração (mm:ss)</Label>
                  <Input
                    id="audio-duration"
                    placeholder="Ex: 15:30"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              )}

              {/* Preview */}
              {mediaUrl && (
                <div className="mt-4">
                  <Label>Preview</Label>
                  <div className="mt-2 p-4 border border-border rounded-md">
                    {mediaType === "PDF" ? (
                      <embed
                        src={mediaUrl}
                        type="application/pdf"
                        className="w-full h-64"
                      />
                    ) : (
                      <audio controls className="w-full">
                        <source src={mediaUrl} />
                        Seu navegador não suporta o elemento de áudio.
                      </audio>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}