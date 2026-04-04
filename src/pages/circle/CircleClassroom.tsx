import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthProvider";
import { useLessonProgress } from "@/hooks/useLessonProgress";
import {
  BookOpen, Play, Crown, Plus,
  FileText, Circle, Loader2, CheckCircle2,
  MoreHorizontal, ChevronDown, ChevronRight, FolderOpen, Folder,
  Lock, Copy, Trash2, GripVertical, Award, Download,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCertificate, generateCertificatePDF } from "@/hooks/useCertificate";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CourseFormModal from "@/components/circle/CourseFormModal";
import CourseCardMenu from "@/components/circle/CourseCardMenu";
import LessonEditor from "@/components/circle/LessonEditor";
import QuizEditor from "@/components/circle/QuizEditor";
import QuizPlayer from "@/components/circle/QuizPlayer";
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// ─── Types ───────────────────────────────────────────────────
interface CircleCourse {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  access_type: string;
  cover_url: string | null;
  is_published: boolean;
  position: number;
  access_mode?: string;
  min_level?: number | null;
  unlock_after_days?: number | null;
  course_price_cents?: number | null;
  allowed_tier_ids?: string[] | null;
  allowed_member_ids?: string[] | null;
  private_mode?: string | null;
}

/* ── Sortable wrapper for course cards ── */
function SortableCourseCard({ courseId, disabled, children }: { courseId: string; disabled?: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: courseId,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group/sortable">
      {!disabled && (
        <button
          type="button"
          className="absolute top-2.5 left-2.5 z-20 cursor-grab active:cursor-grabbing touch-none bg-background/80 backdrop-blur-sm rounded-md p-1 opacity-0 group-hover/sortable:opacity-100 transition-opacity shadow-sm"
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      )}
      {children}
    </div>
  );
}

interface CircleLesson {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
  type: string;
  parent_id: string | null;
  resources?: any[] | null;
}

// ─── Certificate Button (shown at 100% progress) ────────────
function CertificateButton({ memberId, courseId, communityId, courseName, communityName, studentName }: {
  memberId: string | null; courseId: string; communityId: string;
  courseName: string; communityName: string; studentName: string;
}) {
  const { certificate, isLoading, generateCertificate } = useCertificate(memberId, courseId);

  const handleDownload = async (cert: any) => {
    const blob = await generateCertificatePDF(cert);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `certificado-${cert.certificate_code}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return null;

  if (certificate) {
    return (
      <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 p-3 text-center space-y-2">
        <div className="flex items-center justify-center gap-1.5">
          <Award className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary">Certificado Emitido!</span>
        </div>
        <Button size="sm" variant="outline" className="w-full text-xs" onClick={() => handleDownload(certificate)}>
          <Download className="h-3.5 w-3.5 mr-1.5" /> Baixar Certificado
        </Button>
        <a
          href={`/verify/${certificate.certificate_code}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-muted-foreground hover:text-primary underline block"
        >
          Verificar autenticidade
        </a>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <Button
        size="sm"
        className="w-full text-xs"
        onClick={() =>
          generateCertificate.mutate({
            communityId,
            studentName,
            courseName,
            creatorName: communityName,
          })
        }
        disabled={generateCertificate.isPending}
      >
        {generateCertificate.isPending ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Award className="h-3.5 w-3.5 mr-1.5" />
        )}
        Emitir Certificado
      </Button>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────
export default function CircleClassroom() {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CircleCourse | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ─── Community & member queries ───────────────────────
  const { data: community } = useQuery({
    queryKey: ["community-slug", slug],
    queryFn: async () => {
      if (!slug) return null;
      const { data } = await supabase.from("communities").select("*").eq("slug", slug).eq("is_active", true).maybeSingle();
      return data;
    },
    enabled: !!slug,
  });

  const { data: member } = useQuery({
    queryKey: ["circle-member", community?.id, user?.id],
    queryFn: async () => {
      if (!community || !user) return null;
      const { data } = await supabase.from("community_members").select("*").eq("community_id", community.id).eq("user_id", user.id).single();
      return data;
    },
    enabled: !!community && !!user,
  });

  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";

  // ─── Member active tiers (for PRIVATE access check) ──
  const { data: memberTierIds = [] } = useQuery({
    queryKey: ["member-active-tiers", community?.id, member?.id],
    queryFn: async () => {
      if (!community || !member) return [];
      const { data } = await supabase
        .from("community_member_tiers")
        .select("tier_id")
        .eq("community_id", community.id)
        .eq("member_id", member.id)
        .eq("status", "ACTIVE");
      return (data || []).map((r: any) => r.tier_id as string);
    },
    enabled: !!community && !!member,
  });

  // ─── Lesson progress tracking ────────────────────────
  const { progressMap, getCourseProgress, markStarted, markCompleted } = useLessonProgress(
    member?.id || null,
    selectedCourseId
  );

  // ─── Circle courses query ────────────────────────────
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["circle-courses", community?.id],
    queryFn: async () => {
      if (!community) return [];
      const { data } = await supabase
        .from("circle_courses")
        .select("*")
        .eq("community_id", community.id)
        .order("position");
      return (data || []) as CircleCourse[];
    },
    enabled: !!community,
  });

  const { data: courseProgressById = {} } = useQuery({
    queryKey: ["classroom-progress-by-course", member?.id, courses.map((c) => c.id).join(",")],
    queryFn: async () => {
      if (!member?.id || !courses.length) return {} as Record<string, number>;

      const { data: lessons } = await supabase
        .from("circle_lessons")
        .select("id, course_id, type")
        .in("course_id", courses.map((c) => c.id))
        .eq("type", "page");

      const pages = (lessons || []) as Array<{ id: string; course_id: string; type: string }>;
      if (!pages.length) return {} as Record<string, number>;

      const lessonIds = pages.map((p) => p.id);
      const { data: progressRows } = await (supabase as any)
        .from("circle_lesson_progress")
        .select("lesson_id, completed_at")
        .eq("member_id", member.id)
        .in("lesson_id", lessonIds);

      const completedSet = new Set(
        ((progressRows || []) as any[]).filter((r) => !!r.completed_at).map((r) => r.lesson_id)
      );

      const byCourse: Record<string, { total: number; completed: number }> = {};
      for (const page of pages) {
        byCourse[page.course_id] ||= { total: 0, completed: 0 };
        byCourse[page.course_id].total += 1;
        if (completedSet.has(page.id)) byCourse[page.course_id].completed += 1;
      }

      const pct: Record<string, number> = {};
      for (const c of courses) {
        const v = byCourse[c.id];
        pct[c.id] = !v || v.total === 0 ? 0 : Math.round((v.completed / v.total) * 100);
      }

      return pct;
    },
    enabled: !!member?.id && courses.length > 0,
  });

  // ─── All items (pages + modules) for selected course ──
  const { data: allItems = [] } = useQuery({
    queryKey: ["circle-lessons", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return [];
      const { data } = await supabase
        .from("circle_lessons")
        .select("*")
        .eq("course_id", selectedCourseId)
        .order("position");
      return (data || []) as CircleLesson[];
    },
    enabled: !!selectedCourseId,
  });

  // Separate modules and pages
  const modules = useMemo(() => allItems.filter(i => i.type === "module" && !i.parent_id), [allItems]);
  const allPages = useMemo(() => allItems.filter(i => i.type === "page"), [allItems]);
  const getChildPages = (moduleId: string) => allItems.filter(i => i.type === "page" && i.parent_id === moduleId);

  // Build ordered tree
  const orderedItems = useMemo(() => {
    const items: Array<{ type: "page" | "module"; item: CircleLesson; children?: CircleLesson[] }> = [];
    const rootLevel = allItems.filter(i => !i.parent_id).sort((a, b) => a.position - b.position);
    for (const item of rootLevel) {
      if (item.type === "module") {
        items.push({ type: "module", item, children: getChildPages(item.id) });
      } else {
        items.push({ type: "page", item });
      }
    }
    return items;
  }, [allItems]);

  // ─── Mutations ───────────────────────────────────────
  const addPageMutation = useMutation({
    mutationFn: async (parentId?: string | null) => {
      if (!selectedCourseId) throw new Error("No course selected");
      const { error } = await supabase.from("circle_lessons").insert({
        course_id: selectedCourseId,
        title: "New page",
        position: allItems.length,
        is_published: false,
        type: "page",
        parent_id: parentId || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      toast.success("Página adicionada!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const addModuleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourseId) throw new Error("No course selected");
      const { error } = await supabase.from("circle_lessons").insert({
        course_id: selectedCourseId,
        title: "New folder",
        position: allItems.length,
        is_published: true,
        type: "module",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      toast.success("Módulo adicionado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("circle_lessons").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      setSelectedLessonId(null);
      toast.success("Item excluído!");
    },
  });

  const renameModuleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase.from("circle_lessons").update({ title }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      setRenamingModuleId(null);
      toast.success("Nome atualizado!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const duplicateModuleMutation = useMutation({
    mutationFn: async (moduleId: string) => {
      const module = allItems.find(i => i.id === moduleId);
      if (!module || !selectedCourseId) throw new Error("Módulo não encontrado");

      // Create module copy
      const { data: newModule, error: modErr } = await supabase
        .from("circle_lessons")
        .insert({
          course_id: selectedCourseId,
          title: module.title + " (cópia)",
          position: allItems.length,
          is_published: module.is_published,
          type: "module",
        })
        .select("id")
        .single();
      if (modErr) throw modErr;

      // Copy child pages
      const children = getChildPages(moduleId);
      if (children.length > 0) {
        const copies = children.map((child, i) => ({
          course_id: selectedCourseId,
          title: child.title,
          content: child.content,
          position: i,
          is_published: child.is_published,
          type: "page" as const,
          parent_id: newModule.id,
          resources: child.resources,
        }));
        const { error: childErr } = await supabase.from("circle_lessons").insert(copies as any);
        if (childErr) throw childErr;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      toast.success("Pasta duplicada!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  // ─── Reorder courses via drag & drop ──────────────────
  const reorderCoursesMutation = useMutation({
    mutationFn: async (reordered: CircleCourse[]) => {
      const updates = reordered.map((c, i) =>
        supabase.from("circle_courses").update({ position: i }).eq("id", c.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-courses", community?.id] });
    },
    onError: () => toast.error("Erro ao reordenar cursos"),
  });

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleCourseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = courses.findIndex((c) => c.id === active.id);
    const newIndex = courses.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove([...courses], oldIndex, newIndex);
    // optimistic update
    queryClient.setQueryData(["circle-courses", community?.id], reordered);
    reorderCoursesMutation.mutate(reordered);
  };

  const startRenaming = (item: CircleLesson) => {
    setRenamingModuleId(item.id);
    setRenameValue(item.title);
  };

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) { setRenamingModuleId(null); return; }
    renameModuleMutation.mutate({ id, title: trimmed });
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const activeLesson = allPages.find(l => l.id === selectedLessonId);
  const activeLessonIndex = allPages.findIndex(l => l.id === selectedLessonId);
  const nextLesson = activeLessonIndex >= 0 ? allPages[activeLessonIndex + 1] : null;

  // Auto-select first page
  useEffect(() => {
    if (allPages.length > 0 && !selectedLessonId) {
      setSelectedLessonId(allPages[0].id);
    }
  }, [allPages, selectedLessonId]);

  // Auto-expand modules
  useEffect(() => {
    if (modules.length > 0) {
      setExpandedModules(new Set(modules.map(m => m.id)));
    }
  }, [modules]);

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW — Sidebar + Editor (Skool-style)
  // ═══════════════════════════════════════════════════════════
  if (selectedCourseId && selectedCourse) {
    const totalPages = allPages.length;
    const percent = getCourseProgress(totalPages);
    const completedPages = Object.values(progressMap).filter((p) => p.completed).length;

    return (
      <div className="flex flex-col h-[calc(100vh-120px)]">
        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Sidebar ── */}
          <ScrollArea className="w-72 lg:w-80 shrink-0 border-r border-border bg-card">
            <div className="p-4">
              {/* Course title + progress + ⋯ menu */}
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex-1 min-w-0">
                  <button
                    onClick={() => { setSelectedCourseId(null); setSelectedLessonId(null); }}
                    className="text-sm font-bold text-foreground hover:text-primary transition-colors text-left truncate block w-full"
                  >
                    {selectedCourse.name}
                  </button>
                </div>
                {isAdmin && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => addPageMutation.mutate(null)}>
                        <FileText className="h-4 w-4 mr-2" /> Adicionar página
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addModuleMutation.mutate()}>
                        <FolderOpen className="h-4 w-4 mr-2" /> Adicionar pasta
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Progress bar */}
              <div className="mb-4 rounded-lg border bg-muted/30 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-foreground">Seu progresso</span>
                  <span className="text-[11px] text-muted-foreground font-medium">{percent}%</span>
                </div>
                <Progress value={percent} className="h-1.5 flex-1 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
                <p className="text-[10px] text-muted-foreground mt-1">{completedPages}/{totalPages} aulas concluídas</p>
              </div>

              {/* Certificate button when 100% */}
              {percent === 100 && <CertificateButton memberId={member?.id || null} courseId={selectedCourseId} communityId={community?.id || ""} courseName={selectedCourse.name} communityName={community?.name || "Kivo"} studentName={member?.display_name || user?.email || "Aluno"} />}

              {/* Items tree */}
              <div className="space-y-0.5">
                {orderedItems.map(({ type, item, children }) => {
                  if (type === "module") {
                    const isExpanded = expandedModules.has(item.id);
                    const childPages = children || [];
                    return (
                      <div key={item.id}>
                        {/* Module header */}
                        <div className="flex items-center group/mod">
                          {renamingModuleId === item.id ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 flex-1 min-w-0">
                              <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                              <input
                                autoFocus
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => commitRename(item.id)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitRename(item.id);
                                  if (e.key === "Escape") setRenamingModuleId(null);
                                }}
                                className="text-[13px] font-semibold bg-transparent border-b border-primary outline-none flex-1 min-w-0 text-foreground"
                              />
                            </div>
                          ) : (
                            <button
                              onClick={() => toggleModule(item.id)}
                              className="flex items-center gap-2 px-3 py-2 rounded-lg flex-1 min-w-0 hover:bg-muted/50 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              }
                              {isExpanded
                                ? <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                                : <Folder className="h-4 w-4 text-muted-foreground shrink-0" />
                              }
                              <span className="text-[13px] font-semibold text-foreground truncate">
                                {item.title}
                              </span>
                            </button>
                          )}
                          {isAdmin && renamingModuleId !== item.id && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted opacity-0 group-hover/mod:opacity-100 transition-opacity mr-1 shrink-0">
                                  <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => startRenaming(item)}>
                                  <FileText className="h-4 w-4 mr-2" /> Editar pasta
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => addPageMutation.mutate(item.id)}>
                                  <Plus className="h-4 w-4 mr-2" /> Adicionar página na pasta
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => duplicateModuleMutation.mutate(item.id)}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplicar pasta
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    if (confirm("Excluir este módulo e suas páginas?")) deleteItemMutation.mutate(item.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir pasta
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>

                        {/* Child pages */}
                        {isExpanded && childPages.map((page) => {
                          const isActive = page.id === selectedLessonId;
                          const prog = progressMap[page.id];
                          return (
                            <div
                              key={page.id}
                              onClick={() => { setSelectedLessonId(page.id); markStarted.mutate(page.id); }}
                              className={cn(
                                "flex items-center gap-2 pl-11 pr-3 py-2 rounded-lg cursor-pointer transition-colors group/page ml-1",
                                isActive ? "bg-accent/60 border border-border" : "hover:bg-muted/50"
                              )}
                            >
                              {prog?.completed ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              ) : (
                                <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                              )}
                              <span className={cn(
                                "text-[13px] flex-1 truncate",
                                isActive ? "font-medium text-foreground" : "text-muted-foreground"
                              )}>
                                {page.title}
                              </span>
                              {!page.is_published && (
                                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">RASCUNHO</span>
                              )}
                              {isAdmin && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); if (confirm("Excluir?")) deleteItemMutation.mutate(page.id); }}
                                  className="opacity-0 group-hover/page:opacity-100 transition-opacity shrink-0"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {isExpanded && childPages.length === 0 && (
                          <div className="pl-11 pr-3 py-2 text-[12px] text-muted-foreground/60 italic">
                            Pasta vazia
                          </div>
                        )}
                      </div>
                    );
                  }

                  // Root page
                  const isActive = item.id === selectedLessonId;
                  const prog = progressMap[item.id];
                  return (
                    <div
                      key={item.id}
                      onClick={() => { setSelectedLessonId(item.id); markStarted.mutate(item.id); }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/page",
                        isActive ? "bg-accent/60 border border-border" : "hover:bg-muted/50"
                      )}
                    >
                      {prog?.completed ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      )}
                      <span className={cn(
                        "text-[13px] flex-1 truncate",
                        isActive ? "font-medium text-foreground" : "text-muted-foreground"
                      )}>
                        {item.title}
                      </span>
                      {!item.is_published && (
                        <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">RASCUNHO</span>
                      )}
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm("Excluir?")) deleteItemMutation.mutate(item.id); }}
                          className="opacity-0 group-hover/page:opacity-100 transition-opacity shrink-0"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {allItems.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground mb-1">Nenhum conteúdo ainda</p>
                  <p className="text-xs text-muted-foreground/80 mb-3">
                    {isAdmin ? "Comece criando uma página ou pasta para organizar o curso." : "Esse curso ainda não recebeu aulas. Volte em breve."}
                  </p>
                  {isAdmin && (
                    <div className="space-y-2">
                      <Button variant="outline" size="sm" className="w-full" onClick={() => addPageMutation.mutate(null)}>
                        <Plus className="h-4 w-4 mr-1.5" /> Adicionar página
                      </Button>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => addModuleMutation.mutate()}>
                        <FolderOpen className="h-4 w-4 mr-1.5" /> Adicionar pasta
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quiz Editor for admins */}
            {isAdmin && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <QuizEditor courseId={selectedCourseId} />
              </div>
            )}
          </ScrollArea>

          {/* ── Right: Lesson Editor / Content ── */}
          <ScrollArea className="flex-1 bg-muted/30">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
              {activeLesson ? (
                <div className="space-y-3">
                  <LessonEditor
                    lesson={activeLesson}
                    isAdmin={isAdmin}
                    courseId={selectedCourseId}
                    memberId={member?.id}
                    onMarkCompleted={(lessonId) =>
                      markCompleted.mutate({ lessonId })
                    }
                    isCompleted={!!progressMap[activeLesson.id]?.completed}
                    nextLessonTitle={nextLesson?.title || null}
                    onGoToNextLesson={nextLesson ? () => {
                      setSelectedLessonId(nextLesson.id);
                      markStarted.mutate(nextLesson.id);
                    } : undefined}
                  />
                  {/* Show quiz player below lesson when course is complete */}
                  {member?.id && percent === 100 && <div className="mt-6"><QuizPlayer courseId={selectedCourseId} memberId={member.id} /></div>}
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    <div className="text-center">
                      <BookOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                      <p className="text-sm">Selecione uma aula para começar</p>
                    </div>
                  </div>
                  {/* Quiz player when no lesson selected */}
                  {member?.id && <QuizPlayer courseId={selectedCourseId} memberId={member.id} />}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  //  GRID VIEW — Course Cards
  // ═══════════════════════════════════════════════════════════
  if (isLoading) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-xl shadow-sm animate-pulse overflow-hidden">
              <div className="h-[180px] bg-muted" />
              <div className="p-4 space-y-3">
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-2 bg-muted rounded w-1/2 mt-4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (courses.length === 0) {
    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <BookOpen className="h-9 w-9 text-muted-foreground/40" />
          </div>
          <h2 className="text-xl font-bold text-foreground mb-1">Nenhum curso ainda</h2>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            Crie seu primeiro curso para começar a compartilhar conhecimento com sua comunidade.
          </p>
          {isAdmin && (
            <Button size="lg" onClick={() => { setEditingCourse(null); setShowFormModal(true); }}>
              <Plus className="h-5 w-5 mr-2" /> Adicionar curso
            </Button>
          )}
        </div>
        {community && (
          <CourseFormModal
            open={showFormModal}
            onOpenChange={(open) => { setShowFormModal(open); if (!open) setEditingCourse(null); }}
            communityId={community.id}
            workspaceId={community?.workspace_id}
            course={editingCourse}
            nextPosition={0}
          />
        )}
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">Sala de aula</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {courses.length} {courses.length === 1 ? "curso disponível" : "cursos disponíveis"}
          </p>
        </div>
        {isAdmin ? (
          <Button onClick={() => { setEditingCourse(null); setShowFormModal(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Adicionar curso
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground rounded-full border px-2.5 py-1 bg-muted/40">Acompanhe seu progresso</span>
        )}
      </div>

      <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleCourseDragEnd}>
        <SortableContext items={courses.map(c => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course, index) => {
              const isPremium = course.access_type === "premium";
              const coursePct = courseProgressById[course.id] || 0;
              const memberLevel = member?.level ?? 1;
              const memberJoinedAt = member?.joined_at ? new Date(member.joined_at) : null;
              const daysSinceJoin = memberJoinedAt ? Math.floor((Date.now() - memberJoinedAt.getTime()) / 86400000) : 0;

              let isLocked = false;
              let lockMessage = "";
              const mode = course.access_mode || "OPEN";

              if (!isAdmin) {
                switch (mode) {
                  case "LEVEL_UNLOCK":
                    if (memberLevel < (course.min_level || 0)) {
                      isLocked = true;
                      lockMessage = `Desbloqueia no nível ${course.min_level} (você está no ${memberLevel})`;
                    }
                    break;
                  case "BUY_NOW":
                    isLocked = true;
                    lockMessage = `Compra avulsa — R$ ${((course.course_price_cents || 0) / 100).toFixed(2).replace(".", ",")}`;
                    break;
                  case "TIME_UNLOCK": {
                    const requiredDays = course.unlock_after_days || 0;
                    if (daysSinceJoin < requiredDays) {
                      isLocked = true;
                      const remaining = requiredDays - daysSinceJoin;
                      lockMessage = `Libera em ${remaining} ${remaining === 1 ? "dia" : "dias"}`;
                    }
                    break;
                  }
                  case "PRIVATE": {
                    const inMemberList = (course.allowed_member_ids || []).includes(member?.id || "");
                    const hasTier = (course.allowed_tier_ids || []).some(tid => memberTierIds.includes(tid));
                    if (!inMemberList && !hasTier) {
                      isLocked = true;
                      lockMessage = "Acesso exclusivo para membros de tiers específicos";
                    }
                    break;
                  }
                }
              }

              return (
                <SortableCourseCard key={course.id} courseId={course.id} disabled={!isAdmin}>
                  <div
                    onClick={() => {
                      if (isLocked) {
                        toast.error(lockMessage);
                        return;
                      }
                      setSelectedCourseId(course.id);
                      setSelectedLessonId(null);
                    }}
                    className={cn(
                      "bg-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col relative h-full",
                      isLocked && "opacity-80"
                    )}
                  >
                    {isAdmin && (
                      <div className="absolute top-2.5 right-2.5 z-10">
                        <CourseCardMenu
                          course={course}
                          isFirst={index === 0}
                          isLast={index === courses.length - 1}
                          onEdit={() => { setEditingCourse(course); setShowFormModal(true); }}
                        />
                      </div>
                    )}
                    <div className="relative overflow-hidden" style={{ height: 180 }}>
                      {course.cover_url ? (
                        <img src={course.cover_url} alt={course.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-foreground/80 to-foreground/60 flex items-center justify-center">
                          <BookOpen className="h-12 w-12 text-background/30" />
                        </div>
                      )}
                      {isLocked ? (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/40">
                          <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center shadow-lg">
                            <Lock className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/20 transition-colors pointer-events-none">
                          <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                            <Play className="h-5 w-5 text-foreground ml-0.5" />
                          </div>
                        </div>
                      )}
                      {isPremium && (
                        <div className="absolute top-0 right-0 overflow-hidden w-20 h-20 pointer-events-none">
                          <div className="absolute top-[10px] right-[-28px] rotate-45 bg-accent text-accent-foreground text-[9px] font-extrabold tracking-wider py-1 px-7 shadow-sm flex items-center justify-center gap-0.5">
                            <Crown className="h-2.5 w-2.5" /> PRO
                          </div>
                        </div>
                      )}
                      {!course.is_published && isAdmin && (
                        <div className="absolute top-2.5 left-2.5 bg-muted text-muted-foreground text-[10px] font-bold px-2 py-0.5 rounded-full">
                          RASCUNHO
                        </div>
                      )}
                    </div>
                    <div className="pt-3 px-4">
                      <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {course.name}
                      </h3>
                      {course.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                          {course.description}
                        </p>
                      )}
                      {isLocked && (
                        <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                          <Lock className="h-3 w-3" />
                          <span>{lockMessage}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-auto px-4 mb-4 pt-3">
                      <Progress value={isLocked ? 0 : coursePct} className="h-1.5 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
                      <p className="text-[10px] text-muted-foreground mt-1">{isLocked ? "Bloqueado" : `${coursePct}% concluído`}</p>
                    </div>
                  </div>
                </SortableCourseCard>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {community && (
        <CourseFormModal
          open={showFormModal}
          onOpenChange={(open) => { setShowFormModal(open); if (!open) setEditingCourse(null); }}
          communityId={community.id}
          workspaceId={community?.workspace_id}
          course={editingCourse}
          nextPosition={courses.length}
        />
      )}
    </div>
  );
}
