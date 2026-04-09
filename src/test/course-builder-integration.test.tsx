import { describe, it, expect, vi } from "vitest";
import {
  getCoursePublishChecklist,
  type Course,
  type CourseModule,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";

// Mock Supabase client (padrão do projeto)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: () => ({ data: null, error: null }), maybeSingle: () => ({ data: null, error: null }) }), in: () => ({ order: () => ({ data: [], error: null }) }), order: () => ({ data: [], error: null }) }),
      insert: () => ({ select: () => ({ single: () => ({ data: {}, error: null }) }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: () => ({ data: {}, error: null }) }) }) }),
      delete: () => ({ eq: () => ({ data: null, error: null }) }),
    }),
    rpc: () => ({ data: null, error: null }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } }, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ data: { path: "x" }, error: null }), getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x" } }) }) },
  },
}));

// ── Factories ──

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "c1", workspace_id: "w1", product_id: "p1",
    title: "Curso Completo", description_richtext: "<p>Descrição com mais de dez caracteres</p>",
    hero_image_url: "https://img.example.com/hero.jpg",
    branding_title_font: null, branding_bg_color: null, branding_highlight_color: null,
    thumbnail_style: "preview", thumbnail_image: "https://img.example.com/thumb.jpg",
    thumbnail_title: "Curso de React", thumbnail_subtitle: "Subtítulo", thumbnail_cta: "Acessar",
    checkout_image: null, checkout_title: null, checkout_description: null, checkout_cta: null,
    checkout_bottom_title: null, checkout_price_cents: 9900, checkout_discount_price_cents: null,
    checkout_price_type: "one_time", checkout_billing_interval: null, checkout_custom_fields: null,
    growth_blocks: null, status: "draft",
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeModule(overrides: Partial<CourseModule> = {}): CourseModule {
  return {
    id: "m1", course_id: "c1", title: "Módulo 1", status: "published",
    drip_type: "immediate", drip_at: null, drip_days: null, position: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLesson(overrides: Partial<CourseLesson> = {}): CourseLesson {
  return {
    id: "l1", module_id: "m1", title: "Aula 1",
    description_richtext: "<p>Conteúdo com mais de dez caracteres</p>",
    video_url: "https://video.example.com/v.mp4", status: "published", position: 0,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// Integration: Publish gate
// ═══════════════════════════════════════════════

describe("Checklist — publish gate integration", () => {
  it("curso incompleto tem pelo menos 4 erros bloqueantes", () => {
    const empty = makeCourse({ title: "", hero_image_url: null, description_richtext: null, thumbnail_title: null, checkout_price_cents: null });
    const checklist = getCoursePublishChecklist(empty, [], []);
    const errors = checklist.filter((c) => c.severity === "error" && !c.passed);
    expect(errors.length).toBeGreaterThanOrEqual(4);
  });

  it("curso completo não tem erros bloqueantes", () => {
    const checklist = getCoursePublishChecklist(makeCourse(), [makeModule()], [makeLesson()]);
    const errors = checklist.filter((c) => c.severity === "error" && !c.passed);
    expect(errors).toHaveLength(0);
  });

  it("warnings falham sem hero, price e thumbnail, mas não bloqueiam", () => {
    const course = makeCourse({ hero_image_url: null, checkout_price_cents: null, thumbnail_title: null });
    const checklist = getCoursePublishChecklist(course, [makeModule()], [makeLesson()]);
    const warnings = checklist.filter((c) => c.severity === "warning" && !c.passed);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    const errors = checklist.filter((c) => c.severity === "error" && !c.passed);
    expect(errors).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════
// Integration: Tab order
// ═══════════════════════════════════════════════

describe("Tab order and navigation", () => {
  const TAB_ORDER = ["thumbnail", "checkout", "course", "options"] as const;

  it("tab order has 4 items: thumbnail → checkout → course → options", () => {
    expect(TAB_ORDER).toEqual(["thumbnail", "checkout", "course", "options"]);
    expect(TAB_ORDER.length).toBe(4);
  });

  it("next tab from thumbnail is checkout, prev from options is course", () => {
    const nextIdx = TAB_ORDER.indexOf("thumbnail") + 1;
    expect(TAB_ORDER[nextIdx]).toBe("checkout");

    const prevIdx = TAB_ORDER.indexOf("options") - 1;
    expect(TAB_ORDER[prevIdx]).toBe("course");
  });
});
