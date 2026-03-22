import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import {
  BookOpen, Play, Crown, ArrowLeft, Plus,
  FileText, Circle, CheckCircle2, Trash2, GripVertical, Loader2,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
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
}

interface CircleLesson {
  id: string;
  course_id: string;
  title: string;
  content: string | null;
  position: number;
  is_published: boolean;
  created_at: string;
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

  // ─── Lessons for selected course ─────────────────────
  const { data: lessons = [] } = useQuery({
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

  // ─── Add lesson mutation ─────────────────────────────
  const addLessonMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourseId) throw new Error("No course selected");
      const { error } = await supabase.from("circle_lessons").insert({
        course_id: selectedCourseId,
        title: "Untitled Lesson",
        position: lessons.length,
        is_published: false,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      toast.success("Lição adicionada!");
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      const { error } = await supabase.from("circle_lessons").delete().eq("id", lessonId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["circle-lessons", selectedCourseId] });
      setSelectedLessonId(null);
      toast.success("Lição excluída!");
    },
  });

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const activeLesson = lessons.find(l => l.id === selectedLessonId);

  // Auto-select first lesson
  useEffect(() => {
    if (lessons.length > 0 && !selectedLessonId) {
      setSelectedLessonId(lessons[0].id);
    }
  }, [lessons, selectedLessonId]);

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW — Lesson Sidebar + Editor
  // ═══════════════════════════════════════════════════════════
  if (selectedCourseId && selectedCourse) {
    const completedCount = 0;
    const totalCount = lessons.length;
    const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
    const isMockCourse = selectedCourseId.startsWith("mock-");

    return (
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Top bar */}
        <div className="shrink-0 px-4 md:px-6 py-3 border-b border-border bg-card flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => { setSelectedCourseId(null); setSelectedLessonId(null); }}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-foreground truncate">{selectedCourse.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Progress value={percent} className="h-1 w-24 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
              <span className="text-[11px] text-muted-foreground">{percent}% complete</span>
            </div>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* ── Left Sidebar: Lessons ── */}
          <ScrollArea className="w-72 lg:w-80 shrink-0 border-r border-border bg-card">
            <div className="p-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Lições ({totalCount})
              </h3>

              {isMockCourse ? (
                <div className="space-y-1">
                  {["Welcome & Overview", "Setting Up", "Mindset for Success", "Finding Your Niche", "Building Your Audience"].map((t, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground">
                      <Circle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                      <span className="truncate">{t}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-0.5">
                  {lessons.map((lesson) => {
                    const isActive = lesson.id === selectedLessonId;
                    return (
                      <div
                        key={lesson.id}
                        onClick={() => setSelectedLessonId(lesson.id)}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors group/lesson",
                          isActive ? "bg-accent border border-border" : "hover:bg-muted/50"
                        )}
                      >
                        <Circle className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground/40"
                        )} />
                        <span className={cn(
                          "text-[13px] flex-1 truncate",
                          isActive ? "font-medium text-foreground" : "text-muted-foreground"
                        )}>
                          {lesson.title}
                        </span>
                        {!lesson.is_published && (
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            DRAFT
                          </span>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm("Excluir esta lição?")) deleteLessonMutation.mutate(lesson.id);
                            }}
                            className="opacity-0 group-hover/lesson:opacity-100 transition-opacity shrink-0"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isAdmin && !isMockCourse && (
                <>
                  <Separator className="my-3" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => addLessonMutation.mutate()}
                    disabled={addLessonMutation.isPending}
                  >
                    {addLessonMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1.5" />
                    )}
                    Add Lesson
                  </Button>
                </>
              )}

              {lessons.length === 0 && !isMockCourse && (
                <div className="text-center py-8">
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma lição ainda</p>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => addLessonMutation.mutate()}
                    >
                      <Plus className="h-4 w-4 mr-1.5" /> Criar primeira lição
                    </Button>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>

          {/* ── Right: Lesson Editor / Content ── */}
          <ScrollArea className="flex-1 bg-muted/30">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6">
              {activeLesson && !isMockCourse ? (
                <LessonEditor
                  lesson={activeLesson}
                  isAdmin={isAdmin}
                  courseId={selectedCourseId}
                />
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
                    <p className="text-sm">Selecione uma lição para começar</p>
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
  //  EMPTY STATE — No courses at all (admin sees centered + Add Course)
  // ═══════════════════════════════════════════════════════════
  if (!isLoading && circleCourses.length === 0 && !isMock) {
    // This case won't hit because isMock is true when circleCourses is empty
    // but we keep it for when mock data is removed later
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

  // True empty state — no real courses, show centered button for admins
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
              <Plus className="h-5 w-5 mr-2" /> Add Course
            </Button>
          )}
        </div>

        {community && (
          <CourseFormModal
            open={showFormModal}
            onOpenChange={(open) => { setShowFormModal(open); if (!open) setEditingCourse(null); }}
            communityId={community.id}
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
          <h1 className="text-xl font-bold text-foreground">Classroom</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {courses.length} {courses.length === 1 ? "course" : "courses"} available
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingCourse(null); setShowFormModal(true); }}>
            <Plus className="h-4 w-4 mr-1.5" /> Add Course
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course, index) => {
          const isPremium = course.access_type === "premium";

          return (
            <div
              key={course.id}
              onClick={() => {
                setSelectedCourseId(course.id);
                setSelectedLessonId(null);
              }}
              className="bg-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col relative"
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
                <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/20 transition-colors">
                  <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                    <Play className="h-5 w-5 text-foreground ml-0.5" />
                  </div>
                </div>
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
              </div>

              <div className="mt-auto px-4 mb-4 pt-3">
                <Progress value={0} className="h-1.5 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
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
