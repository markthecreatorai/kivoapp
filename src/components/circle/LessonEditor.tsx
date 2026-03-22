import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Quote, Image, Link, Youtube, Heading1, Heading2, Heading3, Heading4,
  Loader2, Save, X,
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
}

const TOOLBAR_BUTTONS = [
  { icon: Heading1, label: "H1", tag: "# " },
  { icon: Heading2, label: "H2", tag: "## " },
  { icon: Heading3, label: "H3", tag: "### " },
  { icon: Heading4, label: "H4", tag: "#### " },
  { type: "separator" as const },
  { icon: Bold, label: "Bold", tag: "**" },
  { icon: Italic, label: "Italic", tag: "_" },
  { icon: Strikethrough, label: "Strikethrough", tag: "~~" },
  { icon: Code, label: "Code", tag: "`" },
  { type: "separator" as const },
  { icon: List, label: "Bullet List", tag: "- " },
  { icon: ListOrdered, label: "Numbered List", tag: "1. " },
  { icon: Quote, label: "Quote", tag: "> " },
  { type: "separator" as const },
  { icon: Image, label: "Image", tag: "![alt](url)" },
  { icon: Link, label: "Link", tag: "[text](url)" },
  { icon: Youtube, label: "YouTube", tag: "[youtube](url)" },
];

export default function LessonEditor({ lesson, isAdmin, courseId }: LessonEditorProps) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(lesson.title);
  const [content, setContent] = useState(lesson.content || "");
  const [isPublished, setIsPublished] = useState(lesson.is_published);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset state when lesson changes
  const [prevId, setPrevId] = useState(lesson.id);
  if (lesson.id !== prevId) {
    setPrevId(lesson.id);
    setTitle(lesson.title);
    setContent(lesson.content || "");
    setIsPublished(lesson.is_published);
    setHasChanges(false);
  }

  const handleChange = useCallback((setter: (v: string) => void, value: string) => {
    setter(value);
    setHasChanges(true);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("circle_lessons")
        .update({
          title: title.trim() || "Untitled Lesson",
          content: content || null,
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
    setContent(lesson.content || "");
    setIsPublished(lesson.is_published);
    setHasChanges(false);
  };

  const insertTag = (tag: string) => {
    const textarea = document.getElementById("lesson-content-editor") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.substring(start, end);

    let newContent: string;
    let newCursorPos: number;

    if (tag.startsWith("#") || tag === "- " || tag === "1. " || tag === "> ") {
      newContent = content.substring(0, start) + tag + selected + content.substring(end);
      newCursorPos = start + tag.length + selected.length;
    } else if (tag.includes("](")) {
      newContent = content.substring(0, start) + tag + content.substring(end);
      newCursorPos = start + tag.length;
    } else {
      newContent = content.substring(0, start) + tag + selected + tag + content.substring(end);
      newCursorPos = start + tag.length + selected.length;
    }

    setContent(newContent);
    setHasChanges(true);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  if (!isAdmin) {
    // Read-only view for members
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="p-6">
          <h2 className="text-xl font-bold text-foreground mb-4">{lesson.title}</h2>
          {lesson.content ? (
            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
              {lesson.content}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm italic">Conteúdo em breve...</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lesson Editor Card */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        {/* Editable title */}
        <div className="p-4 border-b border-border">
          <Input
            value={title}
            onChange={(e) => handleChange(setTitle, e.target.value)}
            placeholder="Título da lição..."
            className="text-lg font-bold border-none shadow-none px-0 h-auto focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-3 py-2 border-b border-border bg-muted/30 flex-wrap">
          {TOOLBAR_BUTTONS.map((btn, i) => {
            if ('type' in btn && btn.type === "separator") {
              return <Separator key={i} orientation="vertical" className="h-5 mx-1" />;
            }
            const Icon = ('icon' in btn) ? btn.icon : null;
            return (
              <button
                key={i}
                onClick={() => 'tag' in btn && insertTag(btn.tag!)}
                className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                title={'label' in btn ? btn.label : ''}
              >
                {Icon && <Icon className="h-4 w-4" />}
              </button>
            );
          })}
        </div>

        {/* Content area */}
        <div className="p-4">
          <textarea
            id="lesson-content-editor"
            value={content}
            onChange={(e) => handleChange(setContent, e.target.value)}
            placeholder="Escreva o conteúdo da lição aqui... (Markdown suportado)"
            className="w-full min-h-[400px] resize-y bg-transparent text-sm text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none font-mono"
          />
        </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={!hasChanges}
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={!hasChanges || saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
