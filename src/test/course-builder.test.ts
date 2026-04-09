import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  getCoursePublishChecklist,
  MODULE_TEMPLATES,
  type Course,
  type CourseModule,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";
import { useProductDraft } from "@/hooks/useProductDraft";

// ── Factories ──

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: "c1",
    workspace_id: "w1",
    product_id: "p1",
    title: "Curso Completo de React",
    description_richtext: "<p>Aprenda React do zero ao avançado com projetos práticos</p>",
    hero_image_url: "https://img.example.com/hero.jpg",
    branding_title_font: null,
    branding_bg_color: null,
    branding_highlight_color: null,
    thumbnail_style: "preview",
    thumbnail_image: "https://img.example.com/thumb.jpg",
    thumbnail_title: "Curso de React",
    thumbnail_subtitle: "Do zero ao avançado",
    thumbnail_cta: "Acessar curso",
    checkout_image: null,
    checkout_title: null,
    checkout_description: null,
    checkout_cta: null,
    checkout_bottom_title: null,
    checkout_price_cents: 9900,
    checkout_discount_price_cents: null,
    checkout_price_type: "one_time",
    checkout_billing_interval: null,
    checkout_custom_fields: null,
    growth_blocks: null,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeModule(overrides: Partial<CourseModule> = {}): CourseModule {
  return {
    id: "m1",
    course_id: "c1",
    title: "Módulo 1",
    status: "published",
    drip_type: "immediate",
    drip_at: null,
    drip_days: null,
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeLesson(overrides: Partial<CourseLesson> = {}): CourseLesson {
  return {
    id: "l1",
    module_id: "m1",
    title: "Aula 1",
    description_richtext: "<p>Conteúdo da aula com mais de dez caracteres</p>",
    video_url: "https://video.example.com/v1.mp4",
    status: "published",
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// getCoursePublishChecklist
// ═══════════════════════════════════════════════

describe("getCoursePublishChecklist", () => {
  it("curso completo → todos passam", () => {
    const checklist = getCoursePublishChecklist(makeCourse(), [makeModule()], [makeLesson()]);
    const failed = checklist.filter((c) => !c.passed);
    expect(failed).toHaveLength(0);
  });

  it("curso vazio → falha em title, modules, lessons, published-lessons", () => {
    const empty = makeCourse({
      title: "",
      hero_image_url: null,
      description_richtext: null,
      thumbnail_title: null,
      checkout_price_cents: null,
    });
    const checklist = getCoursePublishChecklist(empty, [], []);
    const errorsFailed = checklist.filter((c) => c.severity === "error" && !c.passed);
    const errorKeys = errorsFailed.map((c) => c.key);
    expect(errorKeys).toContain("title");
    expect(errorKeys).toContain("modules");
    expect(errorKeys).toContain("lessons");
    expect(errorKeys).toContain("published-lessons");
  });

  it("título < 3 chars → falha apenas title", () => {
    const course = makeCourse({ title: "AB" });
    const checklist = getCoursePublishChecklist(course, [makeModule()], [makeLesson()]);
    const titleItem = checklist.find((c) => c.key === "title");
    expect(titleItem?.passed).toBe(false);
  });

  it("sem módulos → falha modules", () => {
    const checklist = getCoursePublishChecklist(makeCourse(), [], [makeLesson()]);
    const modulesItem = checklist.find((c) => c.key === "modules");
    expect(modulesItem?.passed).toBe(false);
  });

  it("sem aulas publicadas → falha published-lessons", () => {
    const draftLesson = makeLesson({ status: "draft" });
    const checklist = getCoursePublishChecklist(makeCourse(), [makeModule()], [draftLesson]);
    const publishedItem = checklist.find((c) => c.key === "published-lessons");
    expect(publishedItem?.passed).toBe(false);
  });

  it("sem preço → falha price (severity warning)", () => {
    const course = makeCourse({ checkout_price_cents: null });
    const checklist = getCoursePublishChecklist(course, [makeModule()], [makeLesson()]);
    const priceItem = checklist.find((c) => c.key === "price");
    expect(priceItem?.passed).toBe(false);
    expect(priceItem?.severity).toBe("warning");
  });

  it("sem thumbnail title → falha thumbnail (severity warning)", () => {
    const course = makeCourse({ thumbnail_title: null });
    const checklist = getCoursePublishChecklist(course, [makeModule()], [makeLesson()]);
    const thumbItem = checklist.find((c) => c.key === "thumbnail");
    expect(thumbItem?.passed).toBe(false);
    expect(thumbItem?.severity).toBe("warning");
  });
});

// ═══════════════════════════════════════════════
// useProductDraft
// ═══════════════════════════════════════════════

describe("useProductDraft", () => {
  it("inicia sem dirty", () => {
    const { result } = renderHook(() => useProductDraft({ name: "Curso" }));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.dirtyFields.size).toBe(0);
    expect(result.current.lastSavedAt).toBeNull();
  });

  it("updateField marca dirty e atualiza draft", () => {
    const { result } = renderHook(() => useProductDraft({ name: "Curso" }));
    act(() => result.current.updateField("name", "Novo Nome"));
    expect(result.current.isDirty).toBe(true);
    expect(result.current.dirtyFields.has("name")).toBe(true);
    expect(result.current.productDraft.name).toBe("Novo Nome");
  });

  it("markSaved limpa dirty e seta lastSavedAt", () => {
    const { result } = renderHook(() => useProductDraft({ name: "Curso" }));
    act(() => result.current.updateField("name", "Editado"));
    act(() => result.current.markSaved());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.lastSavedAt).toBeInstanceOf(Date);
  });

  it("reset limpa tudo", () => {
    const { result } = renderHook(() => useProductDraft({ name: "Curso" }));
    act(() => result.current.updateField("name", "Editado"));
    act(() => result.current.reset({ name: "Reset" }));
    expect(result.current.isDirty).toBe(false);
    expect(result.current.productDraft.name).toBe("Reset");
  });
});

// ═══════════════════════════════════════════════
// MODULE_TEMPLATES
// ═══════════════════════════════════════════════

describe("MODULE_TEMPLATES", () => {
  it("todos têm key, label, moduleName, lessons", () => {
    MODULE_TEMPLATES.forEach((t) => {
      expect(t.key).toBeTruthy();
      expect(t.label).toBeTruthy();
      expect(t.moduleName).toBeTruthy();
      expect(t.lessons.length).toBeGreaterThan(0);
    });
  });

  it("sem keys duplicadas", () => {
    const keys = MODULE_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("contém welcome, core, bonus", () => {
    const keys = MODULE_TEMPLATES.map((t) => t.key);
    expect(keys).toContain("welcome");
    expect(keys).toContain("core");
    expect(keys).toContain("bonus");
  });
});
