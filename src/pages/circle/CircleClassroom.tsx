import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import {
  BookOpen, Play, CheckCircle2, Crown, ArrowLeft,
  ChevronDown, ChevronRight, FileText, Headphones, Circle,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CourseModule {
  id: string;
  title: string;
  position: number | null;
  lessons: CourseLesson[];
}

interface CourseLesson {
  id: string;
  title: string;
  type: string;
  media_type: string | null;
  duration: number | null;
  position: number | null;
  parent_id: string | null;
}

export default function CircleClassroom() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());

  // Get workspace courses
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["classroom-courses", currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      const { data } = await supabase
        .from("products")
        .select("id, name, description, thumbnail_url, type, status")
        .eq("workspace_id", currentWorkspace.id)
        .eq("type", "COURSE")
        .eq("status", "PUBLISHED")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!currentWorkspace,
  });

  // Get lesson counts per course
  const { data: lessonCounts = {} } = useQuery({
    queryKey: ["classroom-lesson-counts", courses.map(c => c.id).join(",")],
    queryFn: async () => {
      if (courses.length === 0) return {};
      const counts: Record<string, { total: number; modules: number }> = {};
      for (const course of courses) {
        const { data } = await supabase
          .from("member_content")
          .select("id, type")
          .eq("product_id", course.id);
        const items = data || [];
        counts[course.id] = {
          total: items.filter(i => i.type === "LESSON" || i.type === "lesson").length,
          modules: items.filter(i => i.type === "MODULE" || i.type === "module").length,
        };
      }
      return counts;
    },
    enabled: courses.length > 0,
  });

  // Premium courses
  const { data: premiumCourseIds = [] } = useQuery({
    queryKey: ["classroom-premium", courses.map(c => c.id).join(",")],
    queryFn: async () => {
      if (courses.length === 0) return [];
      const { data } = await supabase
        .from("prices")
        .select("product_id, amount")
        .in("product_id", courses.map(c => c.id))
        .gt("amount", 0);
      return [...new Set((data || []).map(p => p.product_id))];
    },
    enabled: courses.length > 0,
  });

  // Get customer id
  const { data: customerId } = useQuery({
    queryKey: ["classroom-customer", user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const { data } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      return data?.id || null;
    },
    enabled: !!user?.email,
  });

  // Progress per course
  const { data: progressMap = {} } = useQuery({
    queryKey: ["classroom-progress", customerId, courses.map(c => c.id).join(",")],
    queryFn: async () => {
      if (!customerId || courses.length === 0) return {};
      const progress: Record<string, { completed: number; total: number }> = {};
      for (const course of courses) {
        const { data: lessons } = await supabase
          .from("member_content")
          .select("id")
          .eq("product_id", course.id)
          .in("type", ["LESSON", "lesson"]);
        const lessonIds = (lessons || []).map(l => l.id);
        if (lessonIds.length === 0) {
          progress[course.id] = { completed: 0, total: 0 };
          continue;
        }
        const { data: completed } = await supabase
          .from("lesson_progress")
          .select("id")
          .eq("customer_id", customerId)
          .eq("completed", true)
          .in("member_content_id", lessonIds);
        progress[course.id] = {
          completed: (completed || []).length,
          total: lessonIds.length,
        };
      }
      return progress;
    },
    enabled: !!customerId && courses.length > 0,
  });

  // Fetch course content when a course is selected
  const { data: courseContent } = useQuery({
    queryKey: ["classroom-content", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return null;
      const { data } = await supabase
        .from("member_content")
        .select("id, title, type, media_type, duration, position, parent_id")
        .eq("product_id", selectedCourseId)
        .order("position");
      if (!data) return null;

      const modules = data
        .filter(c => c.type === "MODULE" || c.type === "module")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const lessons = data
        .filter(c => c.type === "LESSON" || c.type === "lesson")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const structured: CourseModule[] = modules.map(mod => ({
        ...mod,
        lessons: lessons.filter(l => l.parent_id === mod.id),
      }));

      const orphans = lessons.filter(l => !l.parent_id);
      if (orphans.length > 0) {
        structured.unshift({ id: "orphan", title: "Lessons", position: -1, lessons: orphans });
      }

      return structured;
    },
    enabled: !!selectedCourseId,
  });

  // Lesson-level progress for selected course
  const { data: lessonProgress = {} } = useQuery({
    queryKey: ["classroom-lesson-progress", customerId, selectedCourseId],
    queryFn: async () => {
      if (!customerId || !selectedCourseId) return {};
      const { data: lessons } = await supabase
        .from("member_content")
        .select("id")
        .eq("product_id", selectedCourseId)
        .in("type", ["LESSON", "lesson"]);
      const ids = (lessons || []).map(l => l.id);
      if (ids.length === 0) return {};
      const { data: prog } = await supabase
        .from("lesson_progress")
        .select("member_content_id, completed")
        .eq("customer_id", customerId)
        .in("member_content_id", ids);
      const map: Record<string, boolean> = {};
      (prog || []).forEach((p: any) => { map[p.member_content_id] = p.completed; });
      return map;
    },
    enabled: !!customerId && !!selectedCourseId,
  });

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const selectedCourse = courses.find(c => c.id === selectedCourseId);

  const getLessonIcon = (mediaType: string | null) => {
    switch (mediaType) {
      case "video": return <Play className="h-4 w-4" />;
      case "audio": return <Headphones className="h-4 w-4" />;
      case "pdf": return <FileText className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  // === DETAIL VIEW ===
  if (selectedCourseId && selectedCourse) {
    const prog = progressMap[selectedCourseId] || { completed: 0, total: 0 };
    const percent = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;

    return (
      <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">
        {/* Back button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { setSelectedCourseId(null); setExpandedModules(new Set()); }}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to Classroom
        </Button>

        {/* Course header card */}
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden mb-6">
          {/* Banner */}
          <div className="relative h-[200px]">
            {selectedCourse.thumbnail_url ? (
              <img src={selectedCourse.thumbnail_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-foreground/80 to-foreground/60 flex items-center justify-center">
                <BookOpen className="h-16 w-16 text-background/20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
            <div className="absolute bottom-4 left-5 right-5">
              <h1 className="text-xl font-bold text-background">{selectedCourse.name}</h1>
              {selectedCourse.description && (
                <p className="text-sm text-background/70 mt-1 line-clamp-2">{selectedCourse.description}</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">
                {prog.completed} of {prog.total} lessons completed
              </span>
              <span className="text-sm font-semibold text-primary">{percent}%</span>
            </div>
            <Progress value={percent} className="h-2 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
          </div>
        </div>

        {/* Modules & Lessons */}
        <div className="space-y-2">
          {courseContent?.map((mod) => {
            const isExpanded = expandedModules.has(mod.id);
            const modCompleted = mod.lessons.filter(l => lessonProgress[l.id]).length;
            const modTotal = mod.lessons.length;

            return (
              <div key={mod.id} className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                {/* Module header */}
                <button
                  onClick={() => toggleModule(mod.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/50 transition-colors"
                >
                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">{mod.title}</h3>
                    <span className="text-[12px] text-muted-foreground">
                      {modCompleted}/{modTotal} lessons
                    </span>
                  </div>
                  {modTotal > 0 && (
                    <div className="shrink-0 w-16">
                      <Progress
                        value={modTotal > 0 ? (modCompleted / modTotal) * 100 : 0}
                        className="h-1 rounded-full [&>div]:bg-primary [&>div]:rounded-full"
                      />
                    </div>
                  )}
                </button>

                {/* Lessons list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {mod.lessons.map((lesson, i) => {
                      const isComplete = lessonProgress[lesson.id] || false;
                      return (
                        <div
                          key={lesson.id}
                          className={cn(
                            "flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors cursor-pointer",
                            i < mod.lessons.length - 1 && "border-b border-border/50"
                          )}
                        >
                          {/* Status icon */}
                          <div className="shrink-0">
                            {isComplete ? (
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            ) : (
                              <Circle className="h-5 w-5 text-muted-foreground/40" />
                            )}
                          </div>
                          {/* Lesson info */}
                          <div className="flex-1 min-w-0">
                            <span className={cn(
                              "text-sm",
                              isComplete ? "text-muted-foreground line-through" : "text-foreground"
                            )}>
                              {lesson.title}
                            </span>
                          </div>
                          {/* Media type icon */}
                          <div className="shrink-0 text-muted-foreground/50">
                            {getLessonIcon(lesson.media_type)}
                          </div>
                          {/* Duration */}
                          {lesson.duration && lesson.duration > 0 && (
                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {Math.ceil(lesson.duration / 60)}min
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // === GRID VIEW ===
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

  return (
    <div className="px-4 md:px-8 py-6 max-w-5xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">Classroom</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {courses.length} {courses.length === 1 ? "course" : "courses"} available
        </p>
      </div>

      {courses.length === 0 ? (
        <div className="bg-card rounded-xl shadow-sm p-12 text-center">
          <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold text-foreground">No courses yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Courses will appear here once they're published.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courses.map((course) => {
            const counts = lessonCounts[course.id] || { total: 0, modules: 0 };
            const prog = progressMap[course.id] || { completed: 0, total: 0 };
            const percent = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
            const isCompleted = prog.total > 0 && prog.completed === prog.total;
            const isPremium = premiumCourseIds.includes(course.id);

            return (
              <div
                key={course.id}
                onClick={() => {
                  setSelectedCourseId(course.id);
                  setExpandedModules(new Set());
                }}
                className="bg-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col"
              >
                {/* Thumbnail */}
                <div className="relative overflow-hidden" style={{ height: 180 }}>
                  {course.thumbnail_url ? (
                    <img
                      src={course.thumbnail_url}
                      alt={course.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
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
                  {isCompleted && (
                    <div className="absolute top-2.5 left-2.5 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> COMPLETED
                    </div>
                  )}
                  {isPremium && !isCompleted && (
                    <div className="absolute top-0 right-0 overflow-hidden w-20 h-20 pointer-events-none">
                      <div className="absolute top-[10px] right-[-28px] rotate-45 bg-accent text-accent-foreground text-[9px] font-extrabold tracking-wider py-1 px-7 shadow-sm flex items-center justify-center gap-0.5">
                        <Crown className="h-2.5 w-2.5" /> PRO
                      </div>
                    </div>
                  )}
                </div>

                {/* Title & Description */}
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

                {/* Progress */}
                <div className="mt-auto px-4 mb-4 pt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-muted-foreground">
                      {counts.total} {counts.total === 1 ? "lesson" : "lessons"}
                    </span>
                    <span className={cn(
                      "text-[11px] font-semibold",
                      isCompleted ? "text-primary" : "text-muted-foreground"
                    )}>
                      {percent}%
                    </span>
                  </div>
                  <Progress
                    value={percent}
                    className="h-1.5 rounded-full [&>div]:bg-primary [&>div]:rounded-full"
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
