import { useState, useEffect, useRef, useCallback } from "react";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  useReorderModules,
  useReorderLessons,
  useDuplicateLesson,
  MODULE_TEMPLATES,
  getCoursePublishChecklist,
  type Course,
  type CourseModule,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";
import {
  Loader2, Plus, GripVertical, BookOpen, Play, Trash2,
  ChevronDown, ChevronRight, Settings, Check, AlertCircle,
  MoreVertical, Pencil, Calendar, Clock, Eye, EyeOff, Droplets,
  Copy, LayoutTemplate, CheckCircle2, XCircle, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageUploadField } from "@/components/course/ImageUploadField";
import { BrandingColorPicker } from "@/components/course/BrandingColorPicker";
import { CourseMobilePreview } from "@/components/course/CourseMobilePreview";
import { CourseLessonEditor } from "@/components/course/CourseLessonEditor";
import { cn } from "@/lib/utils";

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
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {status === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /><span>Salvando...</span></>)}
          {status === "saved" && (<><Check className="h-3 w-3 text-green-500" /><span className="text-green-600">Salvo</span></>)}
          {status === "error" && (<><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Erro ao salvar</span></>)}
        </div>

        <ImageUploadField
          value={heroUrl || null}
          onChange={(url) => { setHeroUrl(url || ""); update({ hero_image_url: url }); }}
        />

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
            {titleError ? <p className="text-xs text-destructive">{titleError}</p> : <span />}
            <p className="text-xs text-muted-foreground">{title.length}/100</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Descrição</Label>
          <RichTextEditor
            value={description}
            onChange={(html) => { setDescription(html); update({ description_richtext: html }); }}
            minHeight="140px"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Branding do curso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Fonte do título</Label>
              <Select value={titleFont} onValueChange={(v) => { setTitleFont(v); update({ branding_title_font: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Inter", "Poppins", "Montserrat", "Roboto", "Playfair Display", "DM Sans", "Space Grotesk"].map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <BrandingColorPicker label="Cor de fundo" value={bgColor} onChange={(c) => { setBgColor(c); update({ branding_bg_color: c }); }} />
              <BrandingColorPicker label="Cor de destaque" value={hlColor} onChange={(c) => { setHlColor(c); update({ branding_highlight_color: c }); }} />
            </div>
          </CardContent>
        </Card>
      </div>

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
// Sortable wrapper
// ═══════════════════════════════════════════
function SortableItem({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn(className, isDragging && "opacity-50 z-50")} {...attributes}>
      <div className="flex items-center">
        <button
          {...listeners}
          className="cursor-grab hover:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground touch-none"
          aria-label="Arrastar para reordenar"
          tabIndex={0}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Status badge
// ═══════════════════════════════════════════
function StatusBadge({ status, dripType }: { status: string; dripType?: string }) {
  if (status === "published") {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600"><Eye className="h-2.5 w-2.5 mr-0.5" />Publicado</Badge>;
  }
  if (status === "drip") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 hover:bg-blue-100">
        <Droplets className="h-2.5 w-2.5 mr-0.5" />
        {dripType === "date" ? "Drip (data)" : dripType === "days_after_purchase" ? "Drip (dias)" : "Drip"}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4"><EyeOff className="h-2.5 w-2.5 mr-0.5" />Rascunho</Badge>;
}

// ═══════════════════════════════════════════
// Content Tab — Full drag-and-drop tree
// ═══════════════════════════════════════════
function ContentTab({ course }: { course: Course; setSaving: (v: boolean) => void }) {
  const { data: serverModules = [] } = useModules(course.id);
  const moduleIds = serverModules.map((m) => m.id);
  const { data: serverLessons = [] } = useAllLessons(course.id, moduleIds);

  // Selected lesson for editing
  const [selectedLesson, setSelectedLesson] = useState<CourseLesson | null>(null);

  // Optimistic local state
  const [localModules, setLocalModules] = useState<CourseModule[]>(serverModules);
  const [localLessons, setLocalLessons] = useState<CourseLesson[]>(serverLessons);
  useEffect(() => { setLocalModules(serverModules); }, [serverModules]);
  useEffect(() => { setLocalLessons(serverLessons); }, [serverLessons]);

  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const deleteModuleMut = useDeleteModule();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const deleteLessonMut = useDeleteLesson();
  const reorderModules = useReorderModules();
  const reorderLessons = useReorderLessons();
  const duplicateLesson = useDuplicateLesson();

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "module" | "lesson"; id: string; title: string; courseId?: string; moduleId?: string } | null>(null);
  const [dripConfigId, setDripConfigId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  // Compute flat ordered list of all lessons for navigation
  const flatLessons = localModules
    .sort((a, b) => a.position - b.position)
    .flatMap((mod) =>
      localLessons.filter((l) => l.module_id === mod.id).sort((a, b) => a.position - b.position)
    );

  // If a lesson is selected, show the lesson editor
  if (selectedLesson) {
    const currentIdx = flatLessons.findIndex((l) => l.id === selectedLesson.id);
    const prevLesson = currentIdx > 0 ? flatLessons[currentIdx - 1] : null;
    const nextLesson = currentIdx < flatLessons.length - 1 ? flatLessons[currentIdx + 1] : null;

    return (
      <div className="max-w-5xl" style={{ minHeight: 500 }}>
        <CourseLessonEditor
          lesson={selectedLesson}
          onBack={() => setSelectedLesson(null)}
          onDeleted={() => setSelectedLesson(null)}
          onNavigate={(l) => setSelectedLesson(l)}
          nav={{ prevLesson, nextLesson }}
          branding={{
            highlightColor: course.branding_highlight_color || "#6366f1",
            bgColor: course.branding_bg_color || "#ffffff",
            titleFont: course.branding_title_font || "Inter",
          }}
        />
      </div>
    );
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleExpand = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── Add Module ──
  const handleAddModule = () => {
    createModule.mutate(
      { course_id: course.id, position: localModules.length },
      {
        onSuccess: (mod) => {
          setExpandedModules((prev) => new Set(prev).add(mod.id));
          toast.success("Módulo criado");
        },
      }
    );
  };

  // ── Add from template ──
  const handleAddFromTemplate = async (templateKey: string) => {
    const template = MODULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setShowTemplates(false);
    createModule.mutate(
      { course_id: course.id, title: template.moduleName, position: localModules.length },
      {
        onSuccess: async (mod) => {
          setExpandedModules((prev) => new Set(prev).add(mod.id));
          // Create template lessons sequentially
          for (let i = 0; i < template.lessons.length; i++) {
            await createLesson.mutateAsync({ module_id: mod.id, title: template.lessons[i], position: i });
          }
          toast.success(`Template "${template.label}" aplicado!`);
        },
      }
    );
  };

  // ── Add Lesson ──
  const handleAddLesson = (moduleId: string) => {
    const count = localLessons.filter((l) => l.module_id === moduleId).length;
    createLesson.mutate(
      { module_id: moduleId, position: count },
      {
        onSuccess: () => {
          setExpandedModules((prev) => new Set(prev).add(moduleId));
          toast.success("Aula criada");
        },
      }
    );
  };

  // ── Duplicate Lesson ──
  const handleDuplicateLesson = (lesson: CourseLesson) => {
    const moduleLessons = localLessons.filter((l) => l.module_id === lesson.module_id);
    duplicateLesson.mutate(
      { lesson, newPosition: moduleLessons.length },
      { onSuccess: () => toast.success("Aula duplicada!") }
    );
  };

  // ── Rename ──
  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = (id: string, type: "module" | "lesson", parentId: string) => {
    setRenamingId(null);
    const trimmed = renameValue.trim() || "Sem título";
    if (type === "module") {
      // Optimistic
      setLocalModules((prev) => prev.map((m) => m.id === id ? { ...m, title: trimmed } : m));
      updateModule.mutate(
        { id, course_id: parentId, title: trimmed },
        { onError: () => { setLocalModules(serverModules); toast.error("Erro ao renomear"); } }
      );
    } else {
      setLocalLessons((prev) => prev.map((l) => l.id === id ? { ...l, title: trimmed } : l));
      updateLesson.mutate(
        { id, module_id: parentId, title: trimmed },
        { onError: () => { setLocalLessons(serverLessons); toast.error("Erro ao renomear"); } }
      );
    }
  };

  // ── Delete ──
  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { type, id, courseId, moduleId } = deleteTarget;
    if (type === "module") {
      setLocalModules((prev) => prev.filter((m) => m.id !== id));
      setLocalLessons((prev) => prev.filter((l) => l.module_id !== id));
      deleteModuleMut.mutate(
        { id, course_id: courseId! },
        {
          onSuccess: () => toast.success("Módulo excluído"),
          onError: () => { setLocalModules(serverModules); setLocalLessons(serverLessons); toast.error("Erro ao excluir"); },
        }
      );
    } else {
      setLocalLessons((prev) => prev.filter((l) => l.id !== id));
      deleteLessonMut.mutate(
        { id, module_id: moduleId! },
        {
          onSuccess: () => toast.success("Aula excluída"),
          onError: () => { setLocalLessons(serverLessons); toast.error("Erro ao excluir"); },
        }
      );
    }
    setDeleteTarget(null);
  };

  // ── Module status change ──
  const setModuleStatus = (mod: CourseModule, newStatus: string) => {
    setLocalModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, status: newStatus, drip_type: newStatus === "drip" ? m.drip_type : "none" } : m));
    updateModule.mutate(
      { id: mod.id, course_id: mod.course_id, status: newStatus, ...(newStatus !== "drip" ? { drip_type: "none" } : {}) },
      { onError: () => { setLocalModules(serverModules); toast.error("Erro ao alterar status"); } }
    );
    if (newStatus === "drip") setDripConfigId(mod.id);
  };

  // ── Drip config ──
  const updateDrip = (mod: CourseModule, dripType: string, dripDays?: number | null, dripAt?: string | null) => {
    setLocalModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, drip_type: dripType, drip_days: dripDays ?? m.drip_days, drip_at: dripAt ?? m.drip_at } : m));
    updateModule.mutate(
      { id: mod.id, course_id: mod.course_id, drip_type: dripType, ...(dripDays !== undefined ? { drip_days: dripDays } : {}), ...(dripAt !== undefined ? { drip_at: dripAt } : {}) } as any,
      { onError: () => { setLocalModules(serverModules); toast.error("Erro ao configurar drip"); } }
    );
  };

  // ── Module DnD ──
  const handleModuleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localModules.findIndex((m) => m.id === active.id);
    const newIdx = localModules.findIndex((m) => m.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(localModules, oldIdx, newIdx).map((m, i) => ({ ...m, position: i }));
    setLocalModules(reordered);
    reorderModules.mutate(
      { courseId: course.id, order: reordered.map((m) => ({ id: m.id, position: m.position })) },
      { onError: () => { setLocalModules(serverModules); toast.error("Erro ao reordenar"); } }
    );
  };

  // ── Lesson DnD ──
  const handleLessonDragEnd = (moduleId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const moduleLessons = localLessons.filter((l) => l.module_id === moduleId).sort((a, b) => a.position - b.position);
    const oldIdx = moduleLessons.findIndex((l) => l.id === active.id);
    const newIdx = moduleLessons.findIndex((l) => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(moduleLessons, oldIdx, newIdx).map((l, i) => ({ ...l, position: i }));
    setLocalLessons((prev) => {
      const others = prev.filter((l) => l.module_id !== moduleId);
      return [...others, ...reordered];
    });
    reorderLessons.mutate(
      { moduleId, order: reordered.map((l) => ({ id: l.id, position: l.position })) },
      { onError: () => { setLocalLessons(serverLessons); toast.error("Erro ao reordenar"); } }
    );
  };

  return (
    <div className="max-w-3xl space-y-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
        <SortableContext items={localModules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {localModules.map((mod) => {
            const moduleLessons = localLessons
              .filter((l) => l.module_id === mod.id)
              .sort((a, b) => a.position - b.position);
            const isExpanded = expandedModules.has(mod.id);

            return (
              <SortableItem key={mod.id} id={mod.id}>
                <Card className="border border-border/60">
                  <CardHeader className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleExpand(mod.id)}
                        className="text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={isExpanded ? "Recolher módulo" : "Expandir módulo"}
                      >
                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                      <BookOpen className="h-4 w-4 text-primary shrink-0" />

                      {renamingId === mod.id ? (
                        <Input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          maxLength={100}
                          className="h-7 text-sm font-medium"
                          onBlur={() => commitRename(mod.id, "module", mod.course_id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                        />
                      ) : (
                        <span className="text-sm font-medium truncate flex-1">{mod.title}</span>
                      )}

                      <StatusBadge status={mod.status} dripType={mod.drip_type} />

                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {moduleLessons.length} aula{moduleLessons.length !== 1 ? "s" : ""}
                      </span>

                      {/* Module menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Menu do módulo">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => startRename(mod.id, mod.title)}>
                            <Pencil className="h-4 w-4 mr-2" />Renomear
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setModuleStatus(mod, "published")} disabled={mod.status === "published"}>
                            <Eye className="h-4 w-4 mr-2" />Publicado
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setModuleStatus(mod, "drip")} disabled={mod.status === "drip"}>
                            <Droplets className="h-4 w-4 mr-2" />Drip
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setModuleStatus(mod, "draft")} disabled={mod.status === "draft"}>
                            <EyeOff className="h-4 w-4 mr-2" />Rascunho
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget({ type: "module", id: mod.id, title: mod.title, courseId: mod.course_id })}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />Excluir módulo
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>

                  {isExpanded && (
                    <CardContent className="pt-0 pb-3 px-4">
                      {/* Drip config inline */}
                      {mod.status === "drip" && (
                        <div className="flex items-center gap-3 mb-3 pl-2 py-2 px-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                          <Droplets className="h-4 w-4 text-blue-600 shrink-0" />
                          <Select
                            value={mod.drip_type === "none" ? "days_after_purchase" : mod.drip_type}
                            onValueChange={(v) => updateDrip(mod, v)}
                          >
                            <SelectTrigger className="h-7 text-xs w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="date">
                                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Data específica</span>
                              </SelectItem>
                              <SelectItem value="days_after_purchase">
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Dias após compra</span>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          {mod.drip_type === "days_after_purchase" && (
                            <Input
                              type="number"
                              min={1}
                              className="h-7 w-20 text-xs"
                              defaultValue={mod.drip_days ?? ""}
                              placeholder="Dias"
                              onBlur={(e) => updateDrip(mod, "days_after_purchase", parseInt(e.target.value) || null)}
                            />
                          )}
                          {mod.drip_type === "date" && (
                            <Input
                              type="date"
                              className="h-7 text-xs w-40"
                              defaultValue={mod.drip_at ? mod.drip_at.split("T")[0] : ""}
                              onBlur={(e) => updateDrip(mod, "date", undefined, e.target.value ? new Date(e.target.value).toISOString() : null)}
                            />
                          )}
                        </div>
                      )}

                      {/* Lessons list with DnD */}
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleLessonDragEnd(mod.id)}
                      >
                        <SortableContext items={moduleLessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-1 pl-2">
                            {moduleLessons.map((lesson) => (
                              <SortableItem
                                key={lesson.id}
                                id={lesson.id}
                                className="rounded-md hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-center gap-2 py-1.5 px-2 group">
                                  <Play className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  {renamingId === lesson.id ? (
                                    <Input
                                      autoFocus
                                      value={renameValue}
                                      onChange={(e) => setRenameValue(e.target.value)}
                                      maxLength={100}
                                      className="h-6 text-xs flex-1"
                                      onBlur={() => commitRename(lesson.id, "lesson", lesson.module_id)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        if (e.key === "Escape") setRenamingId(null);
                                      }}
                                    />
                                  ) : (
                                    <span
                                      className="text-xs cursor-pointer hover:text-primary transition-colors flex-1 truncate"
                                      onClick={() => setSelectedLesson(lesson)}
                                    >
                                      {lesson.title}
                                    </span>
                                  )}
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity"
                                        aria-label="Menu da aula"
                                      >
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => startRename(lesson.id, lesson.title)}>
                                        <Pencil className="h-4 w-4 mr-2" />Renomear
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleDuplicateLesson(lesson)}>
                                        <Copy className="h-4 w-4 mr-2" />Duplicar
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setDeleteTarget({ type: "lesson", id: lesson.id, title: lesson.title, moduleId: lesson.module_id })}
                                      >
                                        <Trash2 className="h-4 w-4 mr-2" />Excluir
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </SortableItem>
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 ml-2 text-xs gap-1 text-muted-foreground"
                        onClick={() => handleAddLesson(mod.id)}
                        disabled={createLesson.isPending}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar aula
                      </Button>
                    </CardContent>
                  )}
                </Card>
              </SortableItem>
            );
          })}
        </SortableContext>
      </DndContext>

      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1 gap-2"
          onClick={handleAddModule}
          disabled={createModule.isPending}
        >
          <Plus className="h-4 w-4" />
          Adicionar módulo
        </Button>
        <Button
          variant="outline"
          className="gap-2"
          onClick={() => setShowTemplates(true)}
        >
          <LayoutTemplate className="h-4 w-4" />
          Template
        </Button>
      </div>

      {localModules.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm mb-1">Nenhum módulo criado ainda</p>
          <p className="text-xs">Use um template ou crie um módulo em branco</p>
        </div>
      )}

      {/* Template picker dialog */}
      <AlertDialog open={showTemplates} onOpenChange={setShowTemplates}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />
              Criar módulo a partir de template
            </AlertDialogTitle>
            <AlertDialogDescription>
              Escolha um template para iniciar com aulas pré-configuradas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {MODULE_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => handleAddFromTemplate(tmpl.key)}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <p className="text-sm font-medium">{tmpl.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  {tmpl.lessons.length} aulas: {tmpl.lessons.join(" · ")}
                </p>
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir {deleteTarget?.type === "module" ? "módulo" : "aula"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "module"
                ? `O módulo "${deleteTarget.title}" e todas as suas aulas serão excluídos permanentemente.`
                : `A aula "${deleteTarget?.title}" será excluída permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ═══════════════════════════════════════════
// Settings Tab — with publish checklist
// ═══════════════════════════════════════════
function SettingsTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const updateCourse = useUpdateCourse();
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);
  const [status, setStatus] = useState(course.status);

  const checklist = getCoursePublishChecklist(course, modules, allLessons);
  const hasErrors = checklist.some((c) => c.severity === "error" && !c.passed);
  const allPassed = checklist.every((c) => c.passed);

  const save = (targetStatus?: string) => {
    const newStatus = targetStatus || status;
    if (newStatus === "published" && hasErrors) {
      toast.error("Corrija os itens obrigatórios antes de publicar");
      return;
    }
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status: newStatus },
      {
        onSuccess: () => {
          setStatus(newStatus);
          toast.success(newStatus === "published" ? "Curso publicado!" : "Configurações salvas");
          setSaving(false);
        },
        onError: () => { toast.error("Erro ao salvar"); setSaving(false); },
      }
    );
  };

  return (
    <div className="max-w-lg space-y-6">
      {/* Publish checklist */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Checklist de publicação
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {checklist.map((item) => (
            <div key={item.key} className="flex items-start gap-2 py-1">
              {item.passed ? (
                <Check className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
              ) : item.severity === "error" ? (
                <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              )}
              <span className={cn(
                "text-sm",
                item.passed ? "text-muted-foreground" : item.severity === "error" ? "text-foreground font-medium" : "text-foreground"
              )}>
                {item.label}
              </span>
            </div>
          ))}
          {allPassed && (
            <p className="text-xs text-green-600 font-medium pt-2">
              ✓ Tudo pronto para publicar!
            </p>
          )}
        </CardContent>
      </Card>

      {/* Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configurações do curso</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm">Status atual</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={status === "published" ? "default" : "outline"}>
                {status === "published" ? "Publicado" : "Rascunho"}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            {status === "published" ? (
              <Button variant="outline" onClick={() => save("draft")} disabled={updateCourse.isPending} className="flex-1">
                <EyeOff className="h-4 w-4 mr-2" />
                Voltar para rascunho
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => save("draft")} disabled={updateCourse.isPending} className="flex-1">
                  Salvar rascunho
                </Button>
                <Button
                  onClick={() => save("published")}
                  disabled={updateCourse.isPending || hasErrors}
                  className="flex-1"
                  title={hasErrors ? "Corrija os itens obrigatórios do checklist" : undefined}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Publicar curso
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
