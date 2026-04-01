import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { useLessonProgress } from "@/hooks/useLessonProgress";
import {
  BookOpen, Play, Crown, ArrowLeft, Plus,
  FileText, Circle, Trash2, Loader2, CheckCircle2,
  MoreHorizontal, ChevronDown, ChevronRight, FolderOpen, Folder, Pencil,
  Lock,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import CourseFormModal from "@/components/circle/CourseFormModal";
import CourseCardMenu from "@/components/circle/CourseCardMenu";
import LessonEditor from "@/components/circle/LessonEditor";

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

// ─── Mock data ───────────────────────────────────────────────
const MOCK_COURSES: CircleCourse[] = [
  { id: "mock-1", community_id: "", name: "Foundations of Growth", description: "Learn the core principles of scaling your online business from zero to six figures.", cover_url: null, access_type: "free", is_published: true, position: 0 },
  { id: "mock-2", community_id: "", name: "Content Marketing Mastery", description: "Create content that converts — strategy, copywriting, and distribution.", cover_url: null, access_type: "free", is_published: true, position: 1 },
  { id: "mock-3", community_id: "", name: "Community Building Blueprint", description: "Build and engage a thriving community around your brand.", cover_url: null, access_type: "free", is_published: true, position: 2 },
  { id: "mock-4", community_id: "", name: "Sales Funnel Secrets", description: "Design high-converting funnels that sell on autopilot.", cover_url: null, access_type: "premium", is_published: true, position: 3 },
  { id: "mock-5", community_id: "", name: "Email Marketing Pro", description: "Master email sequences, automations, and deliverability.", cover_url: null, access_type: "free", is_published: true, position: 4 },
  { id: "mock-6", community_id: "", name: "Launch Like a Pro", description: "Step-by-step launch playbook for digital products.", cover_url: null, access_type: "premium", is_published: true, position: 5 },
];

// ─── Component ───────────────────────────────────────────────
export default function CircleClassroom() {
  const { currentWorkspace } = useWorkspace();
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
    queryKey: ["community", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return null;
      const { data } = await supabase.from("communities").select("*").eq("workspace_id", currentWorkspace.id).single();
      return data;
    },
    enabled: !!currentWorkspace,
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

  // ─── Lesson progress tracking ────────────────────────
  const { progressMap, getCourseProgress, markStarted, markCompleted } = useLessonProgress(
    member?.id || null,
    selectedCourseId
  );

  // ─── Circle courses query ────────────────────────────
  const { data: circleCourses = [], isLoading } = useQuery({
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

  const isMock = circleCourses.length === 0 && !isLoading;
  const courses = isMock ? MOCK_COURSES : circleCourses;

  const { data: courseProgressById = {} } = useQuery({
    queryKey: ["classroom-progress-by-course", member?.id, courses.map((c) => c.id).join(",")],
    queryFn: async () => {
      if (!member?.id || !courses.length) return {} as Record<string, number>;

      const realCourses = courses.filter((c) => !c.id.startsWith("mock-"));
      if (!realCourses.length) return {} as Record<string, number>;

      const { data: lessons } = await supabase
        .from("circle_lessons")
        .select("id, course_id, type")
        .in("course_id", realCourses.map((c) => c.id))
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
      for (const c of realCourses) {
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
      if (!selectedCourseId || selectedCourseId.startsWith("mock-")) return [];
      const { data } = await supabase
        .from("circle_lessons")
        .select("*")
        .eq("course_id", selectedCourseId)
        .order("position");
      return (data || []) as CircleLesson[];
    },
    enabled: !!selectedCourseId && !selectedCourseId.startsWith("mock-"),
  });

  // Separate modules and pages
  const modules = useMemo(() => allItems.filter(i => i.type === "module" && !i.parent_id), [allItems]);
  const rootPages = useMemo(() => allItems.filter(i => i.type === "page" && !i.parent_id), [allItems]);
  const getChildPages = (moduleId: string) => allItems.filter(i => i.type === "page" && i.parent_id === moduleId);
  const allPages = useMemo(() => allItems.filter(i => i.type === "page"), [allItems]);

  // Build ordered tree (must be top-level hook)
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
    const isMockCourse = selectedCourseId.startsWith("mock-");

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
                {isAdmin && !isMockCourse && (
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

              {/* Items tree */}
              {isMockCourse ? (
                <div className="space-y-0.5">
                  {["Welcome & Overview", "Setting Up", "Mindset for Success", "Finding Your Niche", "Building Your Audience"].map((t, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground">
                      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      <span className="truncate">{t}</span>
                    </div>
                  ))}
                </div>
              ) : (
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
                                onDoubleClick={() => isAdmin && startRenaming(item)}
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
                              <div className="flex items-center gap-0.5 opacity-0 group-hover/mod:opacity-100 transition-opacity pr-1">
                                <button
                                  onClick={() => startRenaming(item)}
                                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                                  title="Renomear"
                                >
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => addPageMutation.mutate(item.id)}
                                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                                  title="Adicionar página to folder"
                                >
                                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm("Excluir este módulo e suas páginas?")) deleteItemMutation.mutate(item.id);
                                  }}
                                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </button>
                              </div>
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
              )}

              {allItems.length === 0 && !isMockCourse && (
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
          </ScrollArea>

          {/* ── Right: Lesson Editor / Content ── */}
          <ScrollArea className="flex-1 bg-muted/30">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
              {activeLesson && !isMockCourse ? (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Agora</p>
                      <p className="text-sm font-medium text-foreground">{activeLesson.title}</p>
                      {nextLesson ? (
                        <p className="text-xs text-muted-foreground mt-0.5">Próxima aula: {nextLesson.title}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-0.5">Você chegou na última aula deste curso 🎉</p>
                      )}
                    </div>
                    {nextLesson ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedLessonId(nextLesson.id);
                          markStarted.mutate(nextLesson.id);
                        }}
                      >
                        Próxima aula
                      </Button>
                    ) : null}
                  </div>
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
                </div>
              ) : isMockCourse ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm">Este é um curso de demonstração.</p>
                    <p className="text-xs text-muted-foreground mt-1">Crie cursos reais para gerenciar lições.</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm">Selecione uma aula para começar</p>
                  </div>
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
  if (circleCourses.length === 0) {
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
            workspaceId={currentWorkspace?.id}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course, index) => {
          const isPremium = course.access_type === "premium";
          const coursePct = course.id.startsWith("mock-") ? 0 : (courseProgressById[course.id] || 0);
          const memberLevel = member?.level ?? 1;
          const memberJoinedAt = member?.joined_at ? new Date(member.joined_at) : null;
          const daysSinceJoin = memberJoinedAt ? Math.floor((Date.now() - memberJoinedAt.getTime()) / 86400000) : 0;

          // Determine lock status per access_mode
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
              case "PRIVATE":
                isLocked = true;
                lockMessage = "Acesso privado";
                break;
            }
          }

          return (
            <div
              key={course.id}
              onClick={() => {
                if (isLocked) {
                  toast.error(lockMessage);
                  return;
                }
                setSelectedCourseId(course.id);
                setSelectedLessonId(null);
              }}
              className={cn(
                "bg-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col relative",
                isLocked && "opacity-80"
              )}
            >
              {isAdmin && !course.id.startsWith("mock-") && (
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
          );
        })}
      </div>

      {community && (
        <CourseFormModal
          open={showFormModal}
          onOpenChange={(open) => { setShowFormModal(open); if (!open) setEditingCourse(null); }}
          communityId={community.id}
          course={editingCourse}
          nextPosition={courses.length}
        />
      )}
    </div>
  );
}
