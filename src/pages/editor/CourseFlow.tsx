import { useState, useEffect } from "react";
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
import { Loader2, Plus, GripVertical, BookOpen, Play, Trash2, ChevronDown, ChevronRight, Palette, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CourseFlowProps {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}

export default function CourseFlow({ initialProduct, setSaving }: CourseFlowProps) {
  const { currentWorkspace } = useWorkspace();
  const { data: course, isLoading } = useCourseByProduct(initialProduct.id);
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();

  // Auto-create course record if missing
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
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
      <Tabs defaultValue="content" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="content" className="gap-2">
            <BookOpen className="h-4 w-4" />
            Conteúdo
          </TabsTrigger>
          <TabsTrigger value="branding" className="gap-2">
            <Palette className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="content">
          <ContentTab course={course} setSaving={setSaving} />
        </TabsContent>

        <TabsContent value="branding">
          <BrandingTab course={course} setSaving={setSaving} />
        </TabsContent>

        <TabsContent value="settings">
          <SettingsTab course={course} setSaving={setSaving} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════
// Content Tab
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
    <div className="space-y-4">
      {modules.map((mod, mi) => {
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
                {/* Drip config */}
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

                {/* Lessons list */}
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
// Branding Tab
// ═══════════════════════════════════════════
function BrandingTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const updateCourse = useUpdateCourse();
  const [font, setFont] = useState(course.branding_title_font || "Inter");
  const [bgColor, setBgColor] = useState(course.branding_bg_color || "#ffffff");
  const [hlColor, setHlColor] = useState(course.branding_highlight_color || "#6366f1");
  const [heroUrl, setHeroUrl] = useState(course.hero_image_url || "");

  const save = () => {
    setSaving(true);
    updateCourse.mutate(
      {
        id: course.id,
        branding_title_font: font,
        branding_bg_color: bgColor,
        branding_highlight_color: hlColor,
        hero_image_url: heroUrl || null,
      },
      {
        onSuccess: () => {
          toast.success("Branding salvo");
          setSaving(false);
        },
        onError: () => {
          toast.error("Erro ao salvar branding");
          setSaving(false);
        },
      }
    );
  };

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aparência do curso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Imagem de capa (URL)</Label>
            <Input value={heroUrl} onChange={(e) => setHeroUrl(e.target.value)} placeholder="https://..." />
          </div>
          <div>
            <Label className="text-sm">Fonte do título</Label>
            <Select value={font} onValueChange={setFont}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Inter">Inter</SelectItem>
                <SelectItem value="Poppins">Poppins</SelectItem>
                <SelectItem value="Montserrat">Montserrat</SelectItem>
                <SelectItem value="Roboto">Roboto</SelectItem>
                <SelectItem value="Playfair Display">Playfair Display</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Cor de fundo</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div>
              <Label className="text-sm">Cor de destaque</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={hlColor} onChange={(e) => setHlColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
                <Input value={hlColor} onChange={(e) => setHlColor(e.target.value)} className="flex-1" />
              </div>
            </div>
          </div>

          <Button onClick={save} disabled={updateCourse.isPending} className="w-full">
            Salvar branding
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════
// Settings Tab
// ═══════════════════════════════════════════
function SettingsTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const updateCourse = useUpdateCourse();
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description_richtext || "");
  const [status, setStatus] = useState(course.status);

  const save = () => {
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, title, description_richtext: description, status },
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
            <Label className="text-sm">Título do curso</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} />
            <p className="text-xs text-muted-foreground mt-1">{title.length}/100</p>
          </div>
          <div>
            <Label className="text-sm">Descrição</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} />
          </div>
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
