import { useState, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Youtube from "@tiptap/extension-youtube";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Image as ImageIcon, Link as LinkIcon, Youtube as YoutubeIcon,
  Heading1, Heading2, Heading3, Heading4,
  Loader2, Save, X, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LessonEditorProps {
  lesson: {
    id: string;
    course_id: string;
    title: string;
    content: string | null;
    is_published: boolean;
  };
  isAdmin: boolean;
  courseId: string;
  memberId?: string;
  onMarkCompleted?: (lessonId: string) => void;
  isCompleted?: boolean;
}

interface ToolbarButtonProps {
  editor: ReturnType<typeof useEditor>;
  icon: React.ElementType;
  label: string;
  action: () => void;
  isActive?: boolean;
}

function ToolbarButton({ icon: Icon, label, action, isActive }: ToolbarButtonProps) {
  return (
    <button
      onClick={action}
      className={cn(
        "h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground",
        isActive && "bg-muted text-foreground"
      )}
      title={label}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export default function LessonEditor({ lesson, isAdmin, courseId, memberId, onMarkCompleted, isCompleted = false }: LessonEditorProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [isPublished, setIsPublished] = useState(lesson.is_published);
  const [hasChanges, setHasChanges] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Youtube.configure({ width: 640, height: 360 }),
    ],
    content: lesson.content || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[300px] p-4",
      },
    },
    onUpdate: () => {
      setHasChanges(true);
    },
  });

  // Reset state when lesson changes
  const [prevId, setPrevId] = useState(lesson.id);
  if (lesson.id !== prevId) {
    setPrevId(lesson.id);
    setTitle(lesson.title);
    setIsPublished(lesson.is_published);
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
        })
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
    setHasChanges(false);
    editor?.commands.setContent(lesson.content || "");
  };

  const promptAndInsertLink = () => {
    const url = window.prompt("URL do link:");
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const promptAndInsertImage = () => {
    const url = window.prompt("URL da imagem:");
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const promptAndInsertYoutube = () => {
    const url = window.prompt("URL do vídeo YouTube:");
    if (url && editor) {
      editor.chain().focus().setYoutubeVideo({ src: url }).run();
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">{lesson.title}</h2>
          {lesson.content ? (
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-foreground"
              dangerouslySetInnerHTML={{ __html: lesson.content }}
            />
          ) : (
            <p className="text-muted-foreground text-sm italic">Conteúdo em breve...</p>
          )}
        </div>
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

  return (
    <div className="space-y-4">
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {/* Editable title */}
        <div className="p-4 border-b border-border">
          <Input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setHasChanges(true); }}
            placeholder="Título da lição..."
            className="text-lg font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/30 flex-wrap">
          <ToolbarButton editor={editor} icon={Heading1} label="Heading 1" action={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor?.isActive("heading", { level: 1 })} />
          <ToolbarButton editor={editor} icon={Heading2} label="Heading 2" action={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor?.isActive("heading", { level: 2 })} />
          <ToolbarButton editor={editor} icon={Heading3} label="Heading 3" action={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor?.isActive("heading", { level: 3 })} />
          <ToolbarButton editor={editor} icon={Heading4} label="Heading 4" action={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()} isActive={editor?.isActive("heading", { level: 4 })} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolbarButton editor={editor} icon={Bold} label="Bold" action={() => editor?.chain().focus().toggleBold().run()} isActive={editor?.isActive("bold")} />
          <ToolbarButton editor={editor} icon={Italic} label="Italic" action={() => editor?.chain().focus().toggleItalic().run()} isActive={editor?.isActive("italic")} />
          <ToolbarButton editor={editor} icon={Strikethrough} label="Strikethrough" action={() => editor?.chain().focus().toggleStrike().run()} isActive={editor?.isActive("strike")} />
          <ToolbarButton editor={editor} icon={Code} label="Code" action={() => editor?.chain().focus().toggleCode().run()} isActive={editor?.isActive("code")} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolbarButton editor={editor} icon={List} label="Bullet List" action={() => editor?.chain().focus().toggleBulletList().run()} isActive={editor?.isActive("bulletList")} />
          <ToolbarButton editor={editor} icon={ListOrdered} label="Numbered List" action={() => editor?.chain().focus().toggleOrderedList().run()} isActive={editor?.isActive("orderedList")} />
          <ToolbarButton editor={editor} icon={Quote} label="Blockquote" action={() => editor?.chain().focus().toggleBlockquote().run()} isActive={editor?.isActive("blockquote")} />
          <Separator orientation="vertical" className="h-5 mx-1" />
          <ToolbarButton editor={editor} icon={ImageIcon} label="Image" action={promptAndInsertImage} />
          <ToolbarButton editor={editor} icon={LinkIcon} label="Link" action={promptAndInsertLink} isActive={editor?.isActive("link")} />
          <ToolbarButton editor={editor} icon={YoutubeIcon} label="YouTube" action={promptAndInsertYoutube} />
        </div>

        {/* Tiptap Editor Content */}
        <EditorContent editor={editor} />
      </div>

      {/* Bottom controls */}
      <div className="bg-card rounded-xl shadow-sm border border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Switch
            id="lesson-published"
            checked={isPublished}
            onCheckedChange={(v) => { setIsPublished(v); setHasChanges(true); }}
          />
          <Label htmlFor="lesson-published" className="text-sm">
            {isPublished ? "Publicado" : "Rascunho"}
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={!hasChanges}>
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!hasChanges || saveMutation.isPending}>
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
