import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { BookOpen, Play, CheckCircle2, Lock, ChevronRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export default function CircleClassroom() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Get workspace courses (products of type COURSE)
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

  // Get user progress per course
  const { data: progressMap = {} } = useQuery({
    queryKey: ["classroom-progress", user?.email, courses.map(c => c.id).join(",")],
    queryFn: async () => {
      if (!user?.email || courses.length === 0) return {};
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      if (!customer) return {};

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
          .eq("customer_id", customer.id)
          .eq("completed", true)
          .in("member_content_id", lessonIds);
        progress[course.id] = {
          completed: (completed || []).length,
          total: lessonIds.length,
        };
      }
      return progress;
    },
    enabled: !!user?.email && courses.length > 0,
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card rounded-xl shadow-sm p-4 animate-pulse flex gap-4">
              <div className="w-[200px] h-[120px] bg-muted rounded-lg shrink-0" />
              <div className="flex-1 space-y-3 py-2">
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
    <div className="p-4 md:py-6 md:px-5 max-w-3xl mx-auto">
      {/* Header */}
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
        <div className="space-y-3">
          {courses.map((course) => {
            const counts = lessonCounts[course.id] || { total: 0, modules: 0 };
            const prog = progressMap[course.id] || { completed: 0, total: 0 };
            const percent = prog.total > 0 ? Math.round((prog.completed / prog.total) * 100) : 0;
            const isCompleted = prog.total > 0 && prog.completed === prog.total;

            return (
              <div
                key={course.id}
                onClick={() => navigate(`/member/course/${course.id}`)}
                className="bg-card rounded-xl shadow-sm border border-border hover:shadow-md transition-all cursor-pointer group overflow-hidden"
              >
                <div className="flex flex-col sm:flex-row">
                  {/* Thumbnail */}
                  <div className="sm:w-[200px] h-[140px] sm:h-auto bg-muted shrink-0 relative overflow-hidden">
                    {course.thumbnail_url ? (
                      <img
                        src={course.thumbnail_url}
                        alt={course.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
                        <BookOpen className="h-10 w-10 text-primary/40" />
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                        <Play className="h-4 w-4 text-foreground ml-0.5" />
                      </div>
                    </div>
                    {/* Completed badge */}
                    {isCompleted && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" /> COMPLETED
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 p-4 sm:p-5 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="text-[16px] font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {course.name}
                      </h3>
                      {course.description && (
                        <p className="text-[13px] text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                          {course.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 space-y-2">
                      {/* Stats */}
                      <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
                        {counts.modules > 0 && (
                          <span className="flex items-center gap-1">
                            <BookOpen className="h-3.5 w-3.5" />
                            {counts.modules} {counts.modules === 1 ? "module" : "modules"}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Play className="h-3.5 w-3.5" />
                          {counts.total} {counts.total === 1 ? "lesson" : "lessons"}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {prog.total > 0 && (
                        <div className="flex items-center gap-3">
                          <Progress
                            value={percent}
                            className={cn(
                              "h-1.5 flex-1",
                              isCompleted ? "[&>div]:bg-green-500" : "[&>div]:bg-primary"
                            )}
                          />
                          <span className={cn(
                            "text-[11px] font-semibold shrink-0",
                            isCompleted ? "text-green-600" : "text-muted-foreground"
                          )}>
                            {percent}%
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex items-center pr-4">
                    <ChevronRight className="h-5 w-5 text-muted-foreground/40 group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
