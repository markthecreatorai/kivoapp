import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";
import {
  useCourseByProduct,
  useCreateCourse,
  useModules,
  useCreateModule,
  useUpdateModule,
  useDeleteModule,
  useAllLessons,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson,
  useUpdateCourse,
  type Course,
  type CourseModule,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";
import { Loader2, Plus, GripVertical, BookOpen, Play, Trash2, ChevronDown, ChevronRight, Settings, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUploadField } from "@/components/course/ImageUploadField";
import { BrandingColorPicker } from "@/components/course/BrandingColorPicker";
import { CourseMobilePreview } from "@/components/course/CourseMobilePreview";

interface CourseFlowProps {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}

export default function CourseFlow({ initialProduct, setSaving }: CourseFlowProps) {
  const { currentWorkspace } = useWorkspace();
  const { data: course, isLoading } = useCourseByProduct(initialProduct.id);
  const createCourse = useCreateCourse();

  useEffect(() => {
    if (!isLoading && !course && currentWorkspace?.id) {
      createCourse.mutate({
        workspace_id: currentWorkspace.id,
        product_id: initialProduct.id,
        title: initialProduct.name || "Novo Curso",
      });
    }
  }, [isLoading, course, currentWorkspace?.id]);

  if (isLoading || (!course && createCourse.isPending)) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!course) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      <Tabs defaultValue="homepage" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="homepage" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Homepage
          </TabsTrigger>
          <TabsTrigger value="content" className="gap-2">
            <Play className="h-4 w-4" />
            Conteúdo
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="homepage">
          <HomepageTab course={course} setSaving={setSaving} />
        </TabsContent>

        <TabsContent value="content">
          <ContentTab course={course} setSaving={setSaving} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab course={course} setSaving={setSaving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════
// Autosave hook
// ═══════════════════════════════════════════
type SaveStatus = "idle" | "saving" | "saved" | "error";

function useAutosave(course: Course, setSaving: (v: boolean) => void) {
  const updateCourse = useUpdateCourse();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRef = useRef<Partial<Course> | null>(null);

  const flush = useCallback(() => {
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    setStatus("saving");
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, ...payload },
      {
        onSuccess: () => {
          setStatus("saved");
          setSaving(false);
          setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
        },
        onError: () => {
          setStatus("error");
          setSaving(false);
        },
      }
    );
  }, [course.id, updateCourse, setSaving]);

  const enqueue = useCallback(
    (fields: Partial<Course>) => {
      pendingRef.current = { ...pendingRef.current, ...fields };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 1200);
    },
    [flush]
  );

  // Flush on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) flush();
    };
  }, [flush]);

  return { enqueue, status, flush };
}

// ═══════════════════════════════════════════
// Homepage Tab — 2-column layout
// ═══════════════════════════════════════════
function HomepageTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const { enqueue, status } = useAutosave(course, setSaving);
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);

  // Local state mirrors course fields for instant preview
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description_richtext || "");
  const [heroUrl, setHeroUrl] = useState(course.hero_image_url || "");
  const [titleFont, setTitleFont] = useState(course.branding_title_font || "Inter");
  const [bgColor, setBgColor] = useState(course.branding_bg_color || "#ffffff");
  const [hlColor, setHlColor] = useState(course.branding_highlight_color || "#6366f1");

  const titleError = title.length > 100 ? "Máximo 100 caracteres" : title.length === 0 ? "Título obrigatório" : null;

  const update = (fields: Partial<Course>) => enqueue(fields);

  return (
    <div className="flex gap-8 items-start">
      {/* ── Left: Form ── */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Save status indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {status === "saving" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Salvando...</span>
            </>
          )}
          {status === "saved" && (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-600">Salvo</span>
            </>
          )}
          {status === "error" && (
            <>
              <AlertCircle className="h-3 w-3 text-destructive" />
              <span className="text-destructive">Erro ao salvar</span>
            </>
          )}
        </div>

        {/* Hero image */}
        <ImageUploadField
          value={heroUrl || null}
          onChange={(url) => {
            setHeroUrl(url || "");
            update({ hero_image_url: url });
          }}
        />

        {/* Title */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Título do curso</Label>
          <Input
            value={title}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              if (v.length <= 100 && v.length > 0) update({ title: v });
            }}
            maxLength={100}
            className={titleError ? "border-destructive" : ""}
          />
          <div className="flex justify-between">
            {titleError ? (
              <p className="text-xs text-destructive">{titleError}</p>
            ) : (
              <span />
            )}
            <p className="text-xs text-muted-foreground">{title.length}/100</p>
          </div>
        </div>

        {/* Description rich text */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Descrição</Label>
          <RichTextEditor
            value={description}
            onChange={(html) => {
              setDescription(html);
              update({ description_richtext: html });
            }}
            minHeight="140px"
          />
        </div>

        {/* Branding section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Branding do curso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Font */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fonte do título</Label>
              <Select
                value={titleFont}
                onValueChange={(v) => {
                  setTitleFont(v);
                  update({ branding_title_font: v });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Poppins">Poppins</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                  <SelectItem value="Roboto">Roboto</SelectItem>
                  <SelectItem value="Playfair Display">Playfair Display</SelectItem>
                  <SelectItem value="DM Sans">DM Sans</SelectItem>
                  <SelectItem value="Space Grotesk">Space Grotesk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <BrandingColorPicker
                label="Cor de fundo"
                value={bgColor}
                onChange={(c) => {
                  setBgColor(c);
                  update({ branding_bg_color: c });
                }}
              />
              <BrandingColorPicker
                label="Cor de destaque"
                value={hlColor}
                onChange={(c) => {
                  setHlColor(c);
                  update({ branding_highlight_color: c });
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Right: Mobile preview ── */}
      <CourseMobilePreview
        title={title}
        description={description}
        heroImageUrl={heroUrl || null}
        bgColor={bgColor}
        highlightColor={hlColor}
        titleFont={titleFont}
        modulesCount={modules.length}
        lessonsCount={allLessons.length}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// Content Tab (modules + lessons)
// ═══════════════════════════════════════════
function ContentTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);
  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const deleteModule = useDeleteModule();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [editingTitle, setEditingTitle] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddModule = () => {
    createModule.mutate(
      { course_id: course.id, position: modules.length },
      {
        onSuccess: (mod) => {
          setExpandedModules((prev) => new Set(prev).add(mod.id));
          toast.success("Módulo criado");
        },
      }
    );
  };

  const handleAddLesson = (moduleId: string) => {
    const moduleLessons = allLessons.filter((l) => l.module_id === moduleId);
    createLesson.mutate(
      { module_id: moduleId, position: moduleLessons.length },
      { onSuccess: () => toast.success("Aula criada") }
    );
  };

  const handleDeleteModule = (mod: CourseModule) => {
    if (!confirm("Excluir módulo e todas as aulas?")) return;
    deleteModule.mutate(
      { id: mod.id, course_id: mod.course_id },
      { onSuccess: () => toast.success("Módulo excluído") }
    );
  };

  const handleDeleteLesson = (lesson: CourseLesson) => {
    deleteLesson.mutate(
      { id: lesson.id, module_id: lesson.module_id },
      { onSuccess: () => toast.success("Aula excluída") }
    );
  };

  const handleModuleTitleBlur = (mod: CourseModule, newTitle: string) => {
    setEditingTitle(null);
    if (newTitle === mod.title) return;
    updateModule.mutate({ id: mod.id, course_id: mod.course_id, title: newTitle });
  };

  const handleLessonTitleBlur = (lesson: CourseLesson, newTitle: string) => {
    setEditingTitle(null);
    if (newTitle === lesson.title) return;
    updateLesson.mutate({ id: lesson.id, module_id: lesson.module_id, title: newTitle });
  };

  return (
    <div className="max-w-3xl space-y-4">
      {modules.map((mod) => {
        const moduleLessons = allLessons.filter((l) => l.module_id === mod.id);
        const isExpanded = expandedModules.has(mod.id);

        return (
          <Card key={mod.id} className="border border-border/60">
            <CardHeader className="py-3 px-4">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab" />
                <button onClick={() => toggleExpand(mod.id)} className="text-muted-foreground">
                  {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <BookOpen className="h-4 w-4 text-primary" />
                {editingTitle === mod.id ? (
                  <Input
                    autoFocus
                    defaultValue={mod.title}
                    maxLength={100}
                    className="h-7 text-sm font-medium"
                    onBlur={(e) => handleModuleTitleBlur(mod, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                  />
                ) : (
                  <span
                    className="text-sm font-medium cursor-pointer hover:text-primary transition-colors flex-1 truncate"
                    onClick={() => {
                      setEditingTitle(mod.id);
                      setExpandedModules((prev) => new Set(prev).add(mod.id));
                    }}
                  >
                    {mod.title}
                  </span>
                )}
                <span className="text-xs text-muted-foreground ml-auto mr-2">
                  {moduleLessons.length} aula{moduleLessons.length !== 1 ? "s" : ""}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteModule(mod)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0 pb-3 px-4">
                <div className="flex items-center gap-3 mb-3 pl-8">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">Liberação:</Label>
                  <Select
                    value={mod.drip_type}
                    onValueChange={(v) => updateModule.mutate({ id: mod.id, course_id: mod.course_id, drip_type: v })}
                  >
                    <SelectTrigger className="h-7 text-xs w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Imediata</SelectItem>
                      <SelectItem value="date">Data específica</SelectItem>
                      <SelectItem value="days_after_purchase">Dias após compra</SelectItem>
                    </SelectContent>
                  </Select>
                  {mod.drip_type === "days_after_purchase" && (
                    <Input
                      type="number"
                      min={1}
                      className="h-7 w-20 text-xs"
                      defaultValue={mod.drip_days ?? ""}
                      placeholder="Dias"
                      onBlur={(e) =>
                        updateModule.mutate({
                          id: mod.id,
                          course_id: mod.course_id,
                          drip_days: parseInt(e.target.value) || null,
                        } as any)
                      }
                    />
                  )}
                </div>

                <div className="space-y-1 pl-8">
                  {moduleLessons.map((lesson) => (
                    <div
                      key={lesson.id}
                      className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/50 group"
                    >
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 cursor-grab" />
                      <Play className="h-3.5 w-3.5 text-muted-foreground" />
                      {editingTitle === lesson.id ? (
                        <Input
                          autoFocus
                          defaultValue={lesson.title}
                          maxLength={100}
                          className="h-6 text-xs"
                          onBlur={(e) => handleLessonTitleBlur(lesson, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                        />
                      ) : (
                        <span
                          className="text-xs cursor-pointer hover:text-primary transition-colors flex-1 truncate"
                          onClick={() => setEditingTitle(lesson.id)}
                        >
                          {lesson.title}
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteLesson(lesson)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 ml-8 text-xs gap-1 text-muted-foreground"
                  onClick={() => handleAddLesson(mod.id)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar aula
                </Button>
              </CardContent>
            )}
          </Card>
        );
      })}

      <Button variant="outline" className="w-full gap-2" onClick={handleAddModule}>
        <Plus className="h-4 w-4" />
        Adicionar módulo
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════
function SettingsTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const updateCourse = useUpdateCourse();
  const [status, setStatus] = useState(course.status);

  const save = () => {
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status },
      {
        onSuccess: () => {
          toast.success("Configurações salvas");
          setSaving(false);
        },
        onError: () => {
          toast.error("Erro ao salvar");
          setSaving(false);
        },
      }
    );
  };

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações do curso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="published">Publicado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={updateCourse.isPending} className="w-full">
            Salvar configurações
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
