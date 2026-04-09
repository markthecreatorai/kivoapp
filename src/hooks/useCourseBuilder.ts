import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──
export interface Course {
  id: string;
  workspace_id: string;
  product_id: string | null;
  title: string;
  description_richtext: string | null;
  hero_image_url: string | null;
  branding_title_font: string | null;
  branding_bg_color: string | null;
  branding_highlight_color: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  status: string;
  drip_type: string;
  drip_at: string | null;
  drip_days: number | null;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CourseLesson {
  id: string;
  module_id: string;
  title: string;
  description_richtext: string | null;
  video_url: string | null;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface LessonMaterial {
  id: string;
  lesson_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
}

// ── Course by product ──
export function useCourseByProduct(productId: string | undefined) {
  return useQuery({
    queryKey: ["course-by-product", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses" as any)
        .select("*")
        .eq("product_id", productId!)
        .maybeSingle();
      if (error) throw error;
      return data as Course | null;
    },
    enabled: !!productId,
  });
}

// ── Create course ──
export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { workspace_id: string; product_id: string; title?: string }) => {
      const { data, error } = await supabase
        .from("courses" as any)
        .insert({
          workspace_id: params.workspace_id,
          product_id: params.product_id,
          title: params.title || "Novo Curso",
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as Course;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["course-by-product", vars.product_id] });
    },
  });
}

// ── Update course ──
export function useUpdateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Course> & { id: string }) => {
      const { data, error } = await supabase
        .from("courses" as any)
        .update(updates as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as Course;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["course-by-product", data.product_id] });
    },
  });
}

// ── Modules ──
export function useModules(courseId: string | undefined) {
  return useQuery({
    queryKey: ["course-modules", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_modules" as any)
        .select("*")
        .eq("course_id", courseId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as CourseModule[];
    },
    enabled: !!courseId,
  });
}

export function useCreateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { course_id: string; title?: string; position?: number }) => {
      const { data, error } = await supabase
        .from("course_modules" as any)
        .insert({
          course_id: params.course_id,
          title: params.title || "Novo Módulo",
          position: params.position ?? 0,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as CourseModule;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["course-modules", vars.course_id] });
    },
  });
}

export function useUpdateModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, course_id, ...updates }: Partial<CourseModule> & { id: string; course_id: string }) => {
      const { error } = await supabase
        .from("course_modules" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
      return course_id;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: ["course-modules", courseId] });
    },
  });
}

export function useDeleteModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, course_id }: { id: string; course_id: string }) => {
      const { error } = await supabase.from("course_modules" as any).delete().eq("id", id);
      if (error) throw error;
      return course_id;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: ["course-modules", courseId] });
      qc.invalidateQueries({ queryKey: ["course-lessons"] });
    },
  });
}

export function useReorderModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ courseId, order }: { courseId: string; order: { id: string; position: number }[] }) => {
      for (const item of order) {
        const { error } = await supabase
          .from("course_modules" as any)
          .update({ position: item.position } as any)
          .eq("id", item.id);
        if (error) throw error;
      }
      return courseId;
    },
    onSuccess: (courseId) => {
      qc.invalidateQueries({ queryKey: ["course-modules", courseId] });
    },
  });
}

// ── Lessons ──
export function useLessons(moduleId: string | undefined) {
  return useQuery({
    queryKey: ["course-lessons", moduleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_lessons" as any)
        .select("*")
        .eq("module_id", moduleId!)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as CourseLesson[];
    },
    enabled: !!moduleId,
  });
}

export function useAllLessons(courseId: string | undefined, moduleIds: string[]) {
  return useQuery({
    queryKey: ["course-all-lessons", courseId],
    queryFn: async () => {
      if (!moduleIds.length) return [];
      const { data, error } = await supabase
        .from("course_lessons" as any)
        .select("*")
        .in("module_id", moduleIds)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data || []) as CourseLesson[];
    },
    enabled: !!courseId && moduleIds.length > 0,
  });
}

export function useCreateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { module_id: string; title?: string; position?: number }) => {
      const { data, error } = await supabase
        .from("course_lessons" as any)
        .insert({
          module_id: params.module_id,
          title: params.title || "Nova Aula",
          position: params.position ?? 0,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as CourseLesson;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["course-lessons", data.module_id] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons"] });
    },
  });
}

export function useUpdateLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, module_id, ...updates }: Partial<CourseLesson> & { id: string; module_id: string }) => {
      const { error } = await supabase
        .from("course_lessons" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
      return module_id;
    },
    onSuccess: (moduleId) => {
      qc.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons"] });
    },
  });
}

export function useDeleteLesson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, module_id }: { id: string; module_id: string }) => {
      const { error } = await supabase.from("course_lessons" as any).delete().eq("id", id);
      if (error) throw error;
      return module_id;
    },
    onSuccess: (moduleId) => {
      qc.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons"] });
    },
  });
}

export function useReorderLessons() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ moduleId, order }: { moduleId: string; order: { id: string; position: number }[] }) => {
      for (const item of order) {
        const { error } = await supabase
          .from("course_lessons" as any)
          .update({ position: item.position } as any)
          .eq("id", item.id);
        if (error) throw error;
      }
      return moduleId;
    },
    onSuccess: (moduleId) => {
      qc.invalidateQueries({ queryKey: ["course-lessons", moduleId] });
      qc.invalidateQueries({ queryKey: ["course-all-lessons"] });
    },
  });
}

// ── Materials ──
export function useLessonMaterials(lessonId: string | undefined) {
  return useQuery({
    queryKey: ["lesson-materials", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_materials" as any)
        .select("*")
        .eq("lesson_id", lessonId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as LessonMaterial[];
    },
    enabled: !!lessonId,
  });
}

export function useDeleteMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, lesson_id }: { id: string; lesson_id: string }) => {
      const { error } = await supabase.from("lesson_materials" as any).delete().eq("id", id);
      if (error) throw error;
      return lesson_id;
    },
    onSuccess: (lessonId) => {
      qc.invalidateQueries({ queryKey: ["lesson-materials", lessonId] });
    },
  });
}
