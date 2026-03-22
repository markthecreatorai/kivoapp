import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import { BookOpen, Play, CheckCircle2, Lock, ChevronRight, Crown } from "lucide-react";
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

  // Check which courses are premium (have a price > 0)
  const { data: premiumCourseIds = [] } = useQuery({
    queryKey: ["classroom-premium", courses.map(c => c.id).join(",")],
    queryFn: async () => {
      if (courses.length === 0) return [];
      const { data } = await supabase
        .from("prices")
        .select("product_id, unit_amount")
        .in("product_id", courses.map(c => c.id))
        .gt("unit_amount", 0);
      return [...new Set((data || []).map(p => p.product_id))];
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
                onClick={() => navigate(`/member/course/${course.id}`)}
                className="bg-card rounded-xl shadow-sm border border-border hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col"
              >
                {/* Thumbnail — top of card, 16:9 aspect or fixed ~220px */}
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
                  {/* Play overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/20 transition-colors">
                    <div className="h-12 w-12 rounded-full bg-background/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                      <Play className="h-5 w-5 text-foreground ml-0.5" />
                    </div>
                  </div>
                  {/* Completed badge */}
                  {isCompleted && (
                    <div className="absolute top-2.5 left-2.5 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> COMPLETED
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 p-4 flex flex-col justify-between">
                  <div>
                    <h3 className="text-[15px] font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2">
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
                          className="h-1.5 flex-1 [&>div]:bg-primary"
                        />
                        <span className={cn(
                          "text-[11px] font-semibold shrink-0",
                          isCompleted ? "text-primary" : "text-muted-foreground"
                        )}>
                          {percent}%
                        </span>
                      </div>
                    )}
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
