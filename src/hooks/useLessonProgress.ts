import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function useLessonProgress(memberId: string | null, courseId: string | null) {
  const queryClient = useQueryClient();

  // Fetch all progress records for a course
  const { data: progressMap = {} } = useQuery({
    queryKey: ["lesson-progress", memberId, courseId],
    queryFn: async () => {
      if (!memberId || !courseId) return {};
      // Get all lessons for this course
      const { data: lessons } = await supabase
        .from("circle_lessons")
        .select("id")
        .eq("course_id", courseId)
        .eq("type", "page");

      if (!lessons?.length) return {};
      const lessonIds = lessons.map((l: any) => l.id);

      const { data: progressRows } = await (supabase as any)
        .from("circle_lesson_progress")
        .select("lesson_id, completed_at, progress_pct")
        .eq("member_id", memberId)
        .in("lesson_id", lessonIds);

      const map: Record<string, { completed: boolean; progress_pct: number }> = {};
      for (const row of (progressRows || []) as any[]) {
        map[row.lesson_id] = {
          completed: !!row.completed_at,
          progress_pct: row.progress_pct || 0,
        };
      }
      return map;
    },
    enabled: !!memberId && !!courseId,
  });

  // Calculate overall course progress %
  const getCourseProgress = (totalLessons: number): number => {
    if (!totalLessons) return 0;
    const completed = Object.values(progressMap).filter((p) => p.completed).length;
    return Math.round((completed / totalLessons) * 100);
  };

  // Mark lesson as started (10%)
  const markStarted = useMutation({
    mutationFn: async (lessonId: string) => {
      if (!memberId) return;
      await (supabase as any).from("circle_lesson_progress").upsert(
        { lesson_id: lessonId, member_id: memberId, progress_pct: 10 },
        { onConflict: "lesson_id,member_id", ignoreDuplicates: false }
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["lesson-progress", memberId, courseId] }),
  });

  // Mark lesson as completed (100%)
  const markCompleted = useMutation({
    mutationFn: async ({ lessonId, communityId, pointsPerCourse }: { lessonId: string; communityId?: string; pointsPerCourse?: number }) => {
      if (!memberId) return;
      await (supabase as any).from("circle_lesson_progress").upsert(
        {
          lesson_id: lessonId,
          member_id: memberId,
          progress_pct: 100,
          completed_at: new Date().toISOString(),
        },
        { onConflict: "lesson_id,member_id" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lesson-progress", memberId, courseId] });
      toast.success("Lição marcada como concluída! 🎉");
    },
    onError: (err: any) => toast.error(err.message),
  });

  return { progressMap, getCourseProgress, markStarted, markCompleted };
}
