import { useState, useEffect, useRef, useCallback } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { toast } from "sonner";
import { trackEvent } from "@/lib/tracking";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCourseByProduct,
  useCreateCourse,
  useModules,
  useCreateModule,
  useUpdateModule,
  useDeleteModule,
  useAllLessons,
  useCreateLesson,
  useUpdateLesson,
  useDeleteLesson,
  useUpdateCourse,
  useReorderModules,
  useReorderLessons,
  useDuplicateLesson,
  MODULE_TEMPLATES,
  getCoursePublishChecklist,
  type Course,
  type CourseModule,
  type CourseLesson,
} from "@/hooks/useCourseBuilder";
import {
  Loader2, Plus, GripVertical, BookOpen, Play, Trash2,
  ChevronDown, ChevronRight, Check, AlertCircle,
  MoreVertical, Pencil, Calendar, Clock, Eye, EyeOff, Droplets,
  Copy, LayoutTemplate, CheckCircle2, XCircle, AlertTriangle,
  Image as ImageIcon, ShoppingCart, Settings, DollarSign,
  User, Mail, Type, ListChecks, ToggleLeft,
  Star, Zap, Gift, Share2, MailCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RichTextEditor } from "@/components/RichTextEditor";
import { Switch } from "@/components/ui/switch";
import { ImageUploadField } from "@/components/course/ImageUploadField";
import { BrandingColorPicker } from "@/components/course/BrandingColorPicker";
import { CourseMobilePreview } from "@/components/course/CourseMobilePreview";
import { CourseLessonEditor } from "@/components/course/CourseLessonEditor";
import { useStorefrontTheme } from "@/hooks/useStorefrontTheme";
import { WizardTabLayout } from "@/components/editor/WizardTabLayout";
import { StepCard } from "@/components/editor/StepCard";
import { cn } from "@/lib/utils";

// ── Standardized toast helper ──
function showToast(type: "success" | "error" | "warning", message: string, description?: string) {
  const durations = { success: 3000, error: 5000, warning: 4000 };
  if (type === "success") toast.success(message, { description, duration: durations.success });
  else if (type === "error") toast.error(message, { description, duration: durations.error });
  else toast.warning(message, { description, duration: durations.warning });
}

interface CourseFlowProps {
  initialProduct: any;
  setSaving: (v: boolean) => void;
}

export default function CourseFlow({ initialProduct, setSaving }: CourseFlowProps) {
  const { currentWorkspace } = useWorkspace();
  const { data: course, isLoading } = useCourseByProduct(initialProduct.id);
  const createCourse = useCreateCourse();

  const didCreate = useRef(false);
  useEffect(() => {
    if (!isLoading && !course && currentWorkspace?.id && !createCourse.isPending && !didCreate.current) {
      didCreate.current = true;
      createCourse.mutate({
        workspace_id: currentWorkspace.id,
        product_id: initialProduct.id,
        title: initialProduct.name || "Novo Curso",
      });
    }
  }, [isLoading, course, currentWorkspace?.id]);

  if (isLoading || (!course && createCourse.isPending)) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="flex-1 min-w-0 space-y-6">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
          <div className="hidden lg:block w-[320px] shrink-0">
            <Skeleton className="h-[600px] w-[320px] rounded-[40px]" />
          </div>
        </div>
      </div>
    );
  }

  if (!course) return null;

  return <CourseFlowInner course={course} initialProduct={initialProduct} setSaving={setSaving} />;
}

// ═══════════════════════════════════════════
// Main inner component with tabs
// ═══════════════════════════════════════════
function CourseFlowInner({ course, initialProduct, setSaving }: { course: Course; initialProduct: any; setSaving: (v: boolean) => void }) {
  const [tab, setTab] = useState("thumbnail");
  const [courseSubView, setCourseSubView] = useState<"main" | "editPage" | "lesson">("main");
  const themeTokens = useStorefrontTheme();
  const isDirtyRef = useRef(false);

  // Telemetry: opened
  useEffect(() => {
    trackEvent("course_builder_opened", { course_id: course.id });
  }, [course.id]);

  // Guard: beforeunload
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current || updateCourse.isPending) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // For publish logic from OptionsTab
  const updateCourse = useUpdateCourse();
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);
  const checklist = getCoursePublishChecklist(course, modules, allLessons);
  const hasErrors = checklist.some((c) => c.severity === "error" && !c.passed);

  const tabOrder = ["thumbnail", "checkout", "course", "options"];

  const handleNext = () => {
    const idx = tabOrder.indexOf(tab);
    if (idx < tabOrder.length - 1) setTab(tabOrder[idx + 1]);
  };

  const handlePrev = () => {
    const idx = tabOrder.indexOf(tab);
    if (idx > 0) setTab(tabOrder[idx - 1]);
  };

  const handleTabChange = (v: string) => {
    trackEvent("course_builder_tab_switched", { from: tab, to: v, course_id: course.id });
    setTab(v);
    if (v !== "course") setCourseSubView("main");
  };

  const handleSaveDraft = () => {
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status: "draft" },
      {
        onSuccess: () => {
          showToast("success", "Rascunho salvo!");
          setSaving(false);
          isDirtyRef.current = false;
          trackEvent("course_draft_saved", { course_id: course.id });
        },
        onError: () => { showToast("error", "Erro ao salvar"); setSaving(false); },
      }
    );
  };

  const handlePublish = () => {
    trackEvent("course_publish_attempt", { course_id: course.id });
    if (hasErrors) {
      showToast("error", "Corrija os itens obrigatórios antes de publicar");
      trackEvent("course_publish_fail", { course_id: course.id, reason: "checklist_errors" });
      return;
    }
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status: "published" },
      {
        onSuccess: () => {
          showToast("success", "Curso publicado!");
          setSaving(false);
          isDirtyRef.current = false;
          trackEvent("course_publish_success", { course_id: course.id });
        },
        onError: () => {
          showToast("error", "Erro ao publicar");
          setSaving(false);
          trackEvent("course_publish_fail", { course_id: course.id, reason: "mutation_error" });
        },
      }
    );
  };

  return (
    <WizardTabLayout
      tabs={[
        { key: "thumbnail", label: "1. Thumbnail" },
        { key: "checkout", label: "2. Checkout" },
        { key: "course", label: "3. Curso" },
        { key: "options", label: "4. Opções" },
      ]}
      activeTab={tab}
      onTabChange={handleTabChange}
      preview={<MobilePreviewPanel tab={tab} course={course} themeTokens={themeTokens} courseSubView={courseSubView} />}
      onSaveDraft={handleSaveDraft}
      onNext={handleNext}
      onPrev={handlePrev}
      onPublish={handlePublish}
      isLastTab={tab === "options"}
      isFirstTab={tab === "thumbnail"}
      canPublish={!hasErrors}
      isSaving={updateCourse.isPending}
    >
      <TabsContent value="thumbnail">
        <ThumbnailTab course={course} setSaving={setSaving} />
      </TabsContent>
      <TabsContent value="checkout">
        <CheckoutTab course={course} setSaving={setSaving} />
      </TabsContent>
      <TabsContent value="course">
        <ContentTab course={course} setSaving={setSaving} subView={courseSubView} setSubView={setCourseSubView} />
      </TabsContent>
      <TabsContent value="options">
        <OptionsTab course={course} setSaving={setSaving} />
      </TabsContent>
    </WizardTabLayout>
  );
}

// ═══════════════════════════════════════════
// Mobile Preview Panel (context-aware by tab)
// ═══════════════════════════════════════════
function MobilePreviewPanel({ tab, course, themeTokens, courseSubView }: { tab: string; course: Course; themeTokens: any; courseSubView: string }) {
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);

  const bgColor = course.branding_bg_color || "#ffffff";
  const hlColor = course.branding_highlight_color || "#6366f1";
  const titleFont = course.branding_title_font || "Inter";

  if (tab === "course" && courseSubView === "lesson") {
    // Lesson editor has its own preview
    return null;
  }

  if (tab === "course") {
    // Show course homepage preview
    return (
      <CourseMobilePreview
        title={course.title}
        description={course.description_richtext || ""}
        heroImageUrl={course.hero_image_url || null}
        bgColor={bgColor}
        highlightColor={hlColor}
        titleFont={titleFont}
        modulesCount={modules.length}
        lessonsCount={allLessons.length}
      />
    );
  }

  if (tab === "thumbnail") {
    const style = course.thumbnail_style || "preview";
    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium text-muted-foreground mb-3 text-center">Preview em tempo real</p>
        <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
          <div className="w-full h-full rounded-[32px] overflow-hidden flex flex-col relative overflow-y-auto" style={{ backgroundColor: themeTokens?.backgroundColor || "#fff" }}>
            <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20" />
            <div className="p-4 pt-10 flex items-center h-full">
              {style === "button" && (
                <div className="w-full py-4 px-6 rounded-2xl border-2 text-center text-sm font-bold shadow-sm truncate"
                  style={{ borderColor: hlColor, color: themeTokens?.textColor || "#000" }}>
                  {course.thumbnail_title || course.title || "Título do Curso"}
                </div>
              )}
              {style === "callout" && (
                <div className="w-full rounded-2xl border p-5 shadow-sm" style={{ borderColor: hlColor + "40" }}>
                  <p className="font-bold text-lg leading-snug" style={{ color: themeTokens?.textColor || "#000" }}>
                    {course.thumbnail_title || course.title || "Título do Curso"}
                  </p>
                  {course.thumbnail_subtitle && (
                    <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens?.textColor || "#000", opacity: 0.7 }}>
                      {course.thumbnail_subtitle}
                    </p>
                  )}
                  <div className="mt-5 py-3 text-white text-sm font-medium text-center rounded-lg" style={{ backgroundColor: hlColor }}>
                    {course.thumbnail_cta || "Acessar curso"}
                  </div>
                </div>
              )}
              {style === "preview" && (
                <div className="w-full rounded-3xl border overflow-hidden shadow-sm" style={{ borderColor: hlColor + "40" }}>
                  <div className="h-44 flex items-center justify-center overflow-hidden" style={{ backgroundColor: (themeTokens?.textColor || "#000") + "10" }}>
                    {course.thumbnail_image || course.hero_image_url ? (
                      <img src={course.thumbnail_image || course.hero_image_url || ""} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-10 w-10" style={{ color: themeTokens?.textColor || "#000", opacity: 0.3 }} />
                    )}
                  </div>
                  <div className="p-5">
                    <p className="font-bold text-lg leading-snug" style={{ color: themeTokens?.textColor || "#000" }}>
                      {course.thumbnail_title || course.title || "Título do Curso"}
                    </p>
                    {course.thumbnail_subtitle && (
                      <p className="text-sm mt-2 line-clamp-2" style={{ color: themeTokens?.textColor || "#000", opacity: 0.7 }}>
                        {course.thumbnail_subtitle}
                      </p>
                    )}
                    <div className="mt-4 flex items-center justify-end">
                      <div className="py-2.5 px-5 text-white rounded-xl text-sm font-medium" style={{ backgroundColor: hlColor }}>
                        {course.thumbnail_cta || "Acessar"}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (tab === "checkout") {
    const displayPrice = course.checkout_discount_price_cents && course.checkout_discount_price_cents > 0
      ? course.checkout_discount_price_cents
      : (course.checkout_price_cents || 0);
    const hasDiscount = (course.checkout_discount_price_cents ?? 0) > 0 && (course.checkout_discount_price_cents ?? 0) < (course.checkout_price_cents ?? 0);
    const priceLabel = `R$ ${(displayPrice / 100).toFixed(2).replace(".", ",")}`;
    const originalLabel = hasDiscount ? `R$ ${((course.checkout_price_cents || 0) / 100).toFixed(2).replace(".", ",")}` : null;
    const isSubscription = course.checkout_price_type === "subscription";
    const intervalLabel = course.checkout_billing_interval === "yearly" ? "/ano" : course.checkout_billing_interval === "quarterly" ? "/tri" : "/mês";

    return (
      <div className="hidden lg:block w-[320px] shrink-0 sticky top-24">
        <p className="text-xs font-medium text-muted-foreground mb-3 text-center">Preview em tempo real</p>
        <div className="w-[320px] h-[600px] bg-black rounded-[40px] p-2 shadow-xl flex flex-col justify-start">
          <div className="w-full h-full rounded-[32px] overflow-hidden flex flex-col relative overflow-y-auto" style={{ backgroundColor: themeTokens?.backgroundColor || "#fff" }}>
            <div className="w-32 h-6 bg-black absolute top-0 inset-x-0 mx-auto rounded-b-xl z-20" />
            {course.checkout_image && (
              <div className="h-40 bg-muted overflow-hidden shrink-0">
                <img src={course.checkout_image} className="w-full h-full object-cover" alt="" />
              </div>
            )}
            <div className="p-4 space-y-3 pt-10 flex-1">
              {/* Price */}
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold" style={{ color: hlColor }}>{priceLabel}{isSubscription && <span className="text-xs font-normal">{intervalLabel}</span>}</span>
                {originalLabel && <span className="text-xs line-through text-muted-foreground">{originalLabel}</span>}
              </div>

              {/* Description */}
              {course.checkout_description && (
                <div className="text-[11px] leading-relaxed line-clamp-6 prose prose-xs max-w-none" style={{ color: (themeTokens?.textColor || "#000") + "cc" }}
                  dangerouslySetInnerHTML={{ __html: course.checkout_description }}
                />
              )}

              {/* Bottom title */}
              {(course.checkout_bottom_title || course.checkout_title) && (
                <p className="font-bold text-sm text-center pt-2" style={{ color: themeTokens?.textColor || "#000" }}>
                  {course.checkout_bottom_title || course.checkout_title}
                </p>
              )}

              {/* Form fields */}
              <div className="space-y-2 pt-1">
                <div className="space-y-1">
                  <p className="text-[10px] font-medium" style={{ color: themeTokens?.textColor || "#000" }}>Nome</p>
                  <div className="h-8 border rounded-md" style={{ backgroundColor: (themeTokens?.textColor || "#000") + "08", borderColor: (themeTokens?.textColor || "#000") + "20" }} />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-medium" style={{ color: themeTokens?.textColor || "#000" }}>E-mail</p>
                  <div className="h-8 border rounded-md" style={{ backgroundColor: (themeTokens?.textColor || "#000") + "08", borderColor: (themeTokens?.textColor || "#000") + "20" }} />
                </div>
                {(course.checkout_custom_fields as CustomField[] | null)?.map((f: any) => f.label && (
                  <div key={f.id} className="space-y-1">
                    <p className="text-[10px] font-medium" style={{ color: themeTokens?.textColor || "#000" }}>{f.label}</p>
                    <div className="h-8 border rounded-md" style={{ backgroundColor: (themeTokens?.textColor || "#000") + "08", borderColor: (themeTokens?.textColor || "#000") + "20" }} />
                  </div>
                ))}
              </div>

              {/* Total + CTA */}
              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between text-xs font-medium" style={{ color: themeTokens?.textColor || "#000" }}>
                  <span>Total :</span>
                  <span className="font-bold">{priceLabel}</span>
                </div>
                <div className="w-full py-3 text-white font-bold text-center rounded-lg text-sm tracking-wide" style={{ backgroundColor: hlColor }}>
                  {course.checkout_cta || "COMPRAR"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Options tab — shows CourseMobilePreview with branding
  return (
    <CourseMobilePreview
      title={course.title}
      description={course.description_richtext || ""}
      heroImageUrl={course.hero_image_url || null}
      bgColor={bgColor}
      highlightColor={hlColor}
      titleFont={titleFont}
      modulesCount={modules.length}
      lessonsCount={allLessons.length}
    />
  );
}

// ═══════════════════════════════════════════
// Autosave hook
// ═══════════════════════════════════════════
type SaveStatus = "idle" | "saving" | "saved" | "error";

function useAutosave(course: Course, setSaving: (v: boolean) => void) {
  const updateCourse = useUpdateCourse();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingRef = useRef<Partial<Course> | null>(null);

  const flush = useCallback(() => {
    const payload = pendingRef.current;
    if (!payload) return;
    pendingRef.current = null;
    setStatus("saving");
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, ...payload },
      {
        onSuccess: () => {
          setStatus("saved");
          setSaving(false);
          setTimeout(() => setStatus((s) => (s === "saved" ? "idle" : s)), 2000);
        },
        onError: () => {
          setStatus("error");
          setSaving(false);
        },
      }
    );
  }, [course.id, updateCourse, setSaving]);

  const enqueue = useCallback(
    (fields: Partial<Course>) => {
      pendingRef.current = { ...pendingRef.current, ...fields };
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 1200);
    },
    [flush]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pendingRef.current) flush();
    };
  }, [flush]);

  return { enqueue, status, flush };
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {status === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /><span>Salvando...</span></>)}
      {status === "saved" && (<><Check className="h-3 w-3 text-green-500" /><span className="text-green-600">Salvo</span></>)}
      {status === "error" && (<><AlertCircle className="h-3 w-3 text-destructive" /><span className="text-destructive">Erro ao salvar</span></>)}
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 1: Thumbnail
// ═══════════════════════════════════════════
const CARD_STYLES = [
  { key: "preview", label: "Preview", desc: "Imagem grande e detalhes" },
  { key: "callout", label: "Callout", desc: "Título e CTA em destaque" },
  { key: "button", label: "Button", desc: "Link rápido minimalista" },
];

function ThumbnailTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const { enqueue, status } = useAutosave(course, setSaving);

  const [cardStyle, setCardStyle] = useState(course.thumbnail_style || "preview");
  const [thumbImage, setThumbImage] = useState(course.thumbnail_image || course.hero_image_url || "");
  const [thumbTitle, setThumbTitle] = useState(course.thumbnail_title || course.title || "");
  const [thumbSubtitle, setThumbSubtitle] = useState(course.thumbnail_subtitle || "");
  const [thumbCta, setThumbCta] = useState(course.thumbnail_cta || "Acessar curso");

  const update = (fields: Partial<Course>) => enqueue(fields);

  const titleValid = thumbTitle.trim().length >= 3;
  const imageCompleted = cardStyle === "button" || !!thumbImage;

  return (
    <div className="space-y-6 animate-in fade-in">
      <SaveStatusIndicator status={status} />

      {/* Step 1 — Escolha o estilo do card */}
      <StepCard stepNumber={1} title="Escolha o estilo do card" description="Como o curso vai aparecer na sua vitrine." completed={!!cardStyle}>
        <div className="grid grid-cols-3 gap-3" role="radiogroup" aria-label="Estilo do card">
          {CARD_STYLES.map(({ key, label, desc }) => (
            <button
              key={key}
              role="radio"
              aria-checked={cardStyle === key}
              onClick={() => { setCardStyle(key); update({ thumbnail_style: key }); }}
              className={cn(
                "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all",
                cardStyle === key
                  ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-card hover:border-primary/30"
              )}
            >
              <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center",
                cardStyle === key ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                {key === "preview" && <ImageIcon className="h-5 w-5" />}
                {key === "callout" && <BookOpen className="h-5 w-5" />}
                {key === "button" && <Play className="h-5 w-5" />}
              </div>
              <p className="text-sm font-semibold text-foreground">{label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{desc}</p>
            </button>
          ))}
        </div>
      </StepCard>

      {/* Step 2 — Imagem de capa */}
      {cardStyle !== "button" && (
        <StepCard stepNumber={2} title="Imagem de capa" description="Recomendação: 1920×1080px (16:9)." completed={imageCompleted}>
          <ImageUploadField
            value={thumbImage || null}
            onChange={(url) => { setThumbImage(url || ""); update({ thumbnail_image: url, hero_image_url: url }); }}
          />
        </StepCard>
      )}

      {/* Step 3 — Textos da vitrine */}
      <StepCard stepNumber={cardStyle === "button" ? 2 : 3} title="Textos da vitrine" description="Título, subtítulo e chamada para ação." completed={titleValid}>
        <div className="space-y-5">
          {/* Título */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Título do curso</Label>
            <Input
              value={thumbTitle}
              onChange={(e) => {
                const v = e.target.value;
                setThumbTitle(v);
                if (v.length <= 100) update({ thumbnail_title: v, title: v });
              }}
              maxLength={100}
              placeholder="Ex: Curso de Marketing Digital"
              className={cn(!titleValid && thumbTitle.length > 0 && "border-destructive focus-visible:ring-destructive")}
            />
            <div className="flex justify-between">
              {!titleValid && thumbTitle.length > 0 && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Mínimo 3 caracteres
                </p>
              )}
              <p className="text-right text-[10px] text-muted-foreground ml-auto">{thumbTitle.length}/100</p>
            </div>
          </div>

          {/* Subtítulo */}
          {cardStyle !== "button" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Subtítulo (Headline)</Label>
              <Textarea
                placeholder="Frase que captura a atenção na vitrine."
                maxLength={120}
                value={thumbSubtitle}
                onChange={(e) => { setThumbSubtitle(e.target.value); update({ thumbnail_subtitle: e.target.value }); }}
                rows={2}
                className="resize-none"
              />
              <p className="text-right text-[10px] text-muted-foreground">{thumbSubtitle.length}/120</p>
            </div>
          )}

          {/* CTA */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Texto do botão (CTA)</Label>
            <Input
              value={thumbCta}
              onChange={(e) => {
                const v = e.target.value;
                setThumbCta(v);
                if (v.length <= 40) update({ thumbnail_cta: v });
              }}
              maxLength={40}
              placeholder="Acessar curso"
            />
            <p className="text-right text-[10px] text-muted-foreground">{thumbCta.length}/40</p>
          </div>
        </div>
      </StepCard>
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 2: Checkout (4 steps)
// ═══════════════════════════════════════════
interface CustomField {
  id: string;
  label: string;
  type: "text" | "select" | "checkbox";
  required: boolean;
  options?: string[];
}

function CheckoutTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const { enqueue, status } = useAutosave(course, setSaving);

  const [checkoutImage, setCheckoutImage] = useState(course.checkout_image || "");
  const [checkoutTitle, setCheckoutTitle] = useState(course.checkout_title || course.title || "");
  const [checkoutDesc, setCheckoutDesc] = useState(course.checkout_description || "");
  const [bottomTitle, setBottomTitle] = useState(course.checkout_bottom_title || "");
  const [ctaText, setCtaText] = useState(course.checkout_cta || "COMPRAR");
  const [priceType, setPriceType] = useState(course.checkout_price_type || "one_time");
  const [priceCents, setPriceCents] = useState(course.checkout_price_cents ?? 0);
  const [discountCents, setDiscountCents] = useState(course.checkout_discount_price_cents ?? 0);
  const [billingInterval, setBillingInterval] = useState(course.checkout_billing_interval || "monthly");
  const [customFields, setCustomFields] = useState<CustomField[]>(
    (course.checkout_custom_fields as CustomField[] | null) || []
  );
  const [showDiscount, setShowDiscount] = useState((course.checkout_discount_price_cents ?? 0) > 0);

  const update = (fields: Partial<Course>) => enqueue(fields);

  const formatCurrency = (cents: number) => {
    return `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;
  };

  const parseCurrency = (raw: string): number => {
    const cleaned = raw.replace(/[^\d,]/g, "").replace(",", ".");
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 100);
  };

  const priceValid = priceCents > 0;
  const discountValid = !showDiscount || (discountCents > 0 && discountCents < priceCents);

  const addCustomField = () => {
    const newField: CustomField = { id: crypto.randomUUID(), label: "", type: "text", required: false };
    const next = [...customFields, newField];
    setCustomFields(next);
    update({ checkout_custom_fields: next as any });
  };

  const updateCustomField = (id: string, patch: Partial<CustomField>) => {
    const next = customFields.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setCustomFields(next);
    update({ checkout_custom_fields: next as any });
  };

  const removeCustomField = (id: string) => {
    const next = customFields.filter((f) => f.id !== id);
    setCustomFields(next);
    update({ checkout_custom_fields: next as any });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <SaveStatusIndicator status={status} />

      {/* Step 1 — Imagem do checkout */}
      <StepCard stepNumber={1} title="Imagem do checkout" description="Hero visual da página de compra." completed={!!checkoutImage}>
        <ImageUploadField
          value={checkoutImage || null}
          onChange={(url) => { setCheckoutImage(url || ""); update({ checkout_image: url }); }}
        />
      </StepCard>

      {/* Step 2 — Descrição da oferta */}
      <StepCard stepNumber={2} title="Descrição da oferta" description="Convença o aluno a comprar." completed={!!checkoutTitle.trim()}>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Título *</Label>
            <Input
              value={checkoutTitle}
              onChange={(e) => { setCheckoutTitle(e.target.value); update({ checkout_title: e.target.value }); }}
              maxLength={100}
              placeholder="Ex: Domine marketing digital em 30 dias"
            />
            <p className="text-right text-[10px] text-muted-foreground">{checkoutTitle.length}/100</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Descrição da oferta *</Label>
            <RichTextEditor
              placeholder="Descreva o que o aluno vai aprender, benefícios e diferenciais..."
              value={checkoutDesc}
              onChange={(v) => { setCheckoutDesc(v); update({ checkout_description: v }); }}
              minHeight="140px"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Título inferior</Label>
            <Input
              value={bottomTitle}
              onChange={(e) => { setBottomTitle(e.target.value); update({ checkout_bottom_title: e.target.value }); }}
              maxLength={80}
              placeholder="Ex: Garanta sua vaga agora"
            />
            <p className="text-right text-[10px] text-muted-foreground">{bottomTitle.length}/80</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-semibold">Texto do botão (CTA) *</Label>
            <Input
              value={ctaText}
              onChange={(e) => { const v = e.target.value; setCtaText(v); if (v.length <= 30) update({ checkout_cta: v }); }}
              maxLength={30}
              placeholder="COMPRAR"
            />
            <p className="text-right text-[10px] text-muted-foreground">{ctaText.length}/30</p>
          </div>
        </div>
      </StepCard>

      {/* Step 3 — Preço */}
      <StepCard stepNumber={3} title="Definir preço" description="Escolha o modelo de cobrança." completed={priceValid}>
        <div className="space-y-5">
          {/* Toggle one_time vs subscription */}
          <div className="flex gap-2">
            <button
              onClick={() => { setPriceType("one_time"); update({ checkout_price_type: "one_time" }); }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                priceType === "one_time"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/30"
              )}
            >
              Pagamento único
            </button>
            <button
              onClick={() => { setPriceType("subscription"); update({ checkout_price_type: "subscription" }); }}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium border transition-all",
                priceType === "subscription"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/30"
              )}
            >
              Assinatura
            </button>
          </div>

          {/* Billing interval for subscription */}
          {priceType === "subscription" && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Intervalo de cobrança</Label>
              <Select value={billingInterval} onValueChange={(v) => { setBillingInterval(v); update({ checkout_billing_interval: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Mensal</SelectItem>
                  <SelectItem value="quarterly">Trimestral</SelectItem>
                  <SelectItem value="yearly">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Price + discount */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-semibold">Preço (R$) *</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={(priceCents / 100).toFixed(2).replace(".", ",")}
                onChange={(e) => {
                  const cents = parseCurrency(e.target.value);
                  setPriceCents(cents);
                  update({ checkout_price_cents: cents });
                }}
                placeholder="0,00"
                className={cn(!priceValid && priceCents === 0 && "border-destructive")}
              />
              {!priceValid && (
                <p className="text-[11px] text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Preço obrigatório
                </p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Preço promocional</Label>
                <button
                  onClick={() => {
                    const next = !showDiscount;
                    setShowDiscount(next);
                    if (!next) { setDiscountCents(0); update({ checkout_discount_price_cents: null as any }); }
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    showDiscount ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform",
                    showDiscount ? "translate-x-4" : "translate-x-1"
                  )} />
                </button>
              </div>
              {showDiscount && (
                <>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={(discountCents / 100).toFixed(2).replace(".", ",")}
                    onChange={(e) => {
                      const cents = parseCurrency(e.target.value);
                      setDiscountCents(cents);
                      update({ checkout_discount_price_cents: cents });
                    }}
                    placeholder="0,00"
                    className={cn(!discountValid && "border-destructive")}
                  />
                  {!discountValid && discountCents > 0 && (
                    <p className="text-[11px] text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Deve ser menor que o preço principal
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Placeholders for future features */}
          <div className="border border-dashed border-border rounded-lg p-4 space-y-2 opacity-60">
            <p className="text-xs font-medium text-muted-foreground">🔒 Em breve</p>
            <p className="text-xs text-muted-foreground">Parcelamento e cupons de desconto estarão disponíveis em versões futuras.</p>
          </div>
        </div>
      </StepCard>

      {/* Step 4 — Campos do checkout */}
      <StepCard stepNumber={4} title="Campos do formulário" description="Informações coletadas na compra." completed={true}>
        <div className="space-y-4">
          {/* Fixed fields */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Campos obrigatórios (fixos)</p>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">Nome</span>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm text-foreground">E-mail</span>
            </div>
          </div>

          {/* Custom fields */}
          {customFields.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground font-medium">Campos personalizados</p>
              {customFields.map((field) => (
                <div key={field.id} className="flex items-center gap-2 p-3 rounded-lg border bg-card">
                  <div className="shrink-0 text-muted-foreground">
                    {field.type === "text" && <Type className="h-4 w-4" />}
                    {field.type === "select" && <ListChecks className="h-4 w-4" />}
                    {field.type === "checkbox" && <ToggleLeft className="h-4 w-4" />}
                  </div>
                  <Input
                    value={field.label}
                    onChange={(e) => updateCustomField(field.id, { label: e.target.value })}
                    placeholder="Nome do campo"
                    className="h-8 text-sm flex-1"
                  />
                  <Select value={field.type} onValueChange={(v) => updateCustomField(field.id, { type: v as CustomField["type"] })}>
                    <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Texto</SelectItem>
                      <SelectItem value="select">Seleção</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                    </SelectContent>
                  </Select>
                  <button onClick={() => removeCustomField(field.id)} className="text-muted-foreground hover:text-destructive p-1">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <Button variant="outline" size="sm" onClick={addCustomField} className="w-full">
            <Plus className="h-4 w-4 mr-1" /> Adicionar campo
          </Button>
        </div>
      </StepCard>
    </div>
  );
}

// ═══════════════════════════════════════════
// Sortable wrapper
// ═══════════════════════════════════════════
function SortableItem({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className={cn(className, isDragging && "opacity-50 z-50")} {...attributes}>
      <div className="flex items-center">
        <button
          {...listeners}
          className="cursor-grab hover:cursor-grabbing p-1 text-muted-foreground/50 hover:text-muted-foreground touch-none"
          aria-label="Arrastar para reordenar"
          tabIndex={0}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Status badge
// ═══════════════════════════════════════════
function StatusBadge({ status, dripType }: { status: string; dripType?: string }) {
  if (status === "published") {
    return <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-green-600 hover:bg-green-600"><Eye className="h-2.5 w-2.5 mr-0.5" />Publicado</Badge>;
  }
  if (status === "drip") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 hover:bg-blue-100">
        <Droplets className="h-2.5 w-2.5 mr-0.5" />
        {dripType === "date" ? "Drip (data)" : dripType === "days_after_purchase" ? "Drip (dias)" : "Drip"}
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4"><EyeOff className="h-2.5 w-2.5 mr-0.5" />Rascunho</Badge>;
}

// ═══════════════════════════════════════════
// Tab 3: Content (Course modules/lessons tree)
// ═══════════════════════════════════════════
function ContentTab({ course, setSaving, subView, setSubView }: { course: Course; setSaving: (v: boolean) => void; subView: "main" | "editPage" | "lesson"; setSubView: (v: "main" | "editPage" | "lesson") => void }) {
  const { data: serverModules = [] } = useModules(course.id);
  const moduleIds = serverModules.map((m) => m.id);
  const { data: serverLessons = [] } = useAllLessons(course.id, moduleIds);

  const [selectedLesson, setSelectedLesson] = useState<CourseLesson | null>(null);

  const [localModules, setLocalModules] = useState<CourseModule[]>(serverModules);
  const [localLessons, setLocalLessons] = useState<CourseLesson[]>(serverLessons);
  const isReorderingRef = useRef(false);
  useEffect(() => { if (!isReorderingRef.current) setLocalModules(serverModules); }, [serverModules]);
  useEffect(() => { if (!isReorderingRef.current) setLocalLessons(serverLessons); }, [serverLessons]);

  const createModule = useCreateModule();
  const updateModule = useUpdateModule();
  const deleteModuleMut = useDeleteModule();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const deleteLessonMut = useDeleteLesson();
  const reorderModules = useReorderModules();
  const reorderLessons = useReorderLessons();
  const duplicateLesson = useDuplicateLesson();

  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ type: "module" | "lesson"; id: string; title: string; courseId?: string; moduleId?: string } | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const flatLessons = [...localModules]
    .sort((a, b) => a.position - b.position)
    .flatMap((mod) =>
      [...localLessons].filter((l) => l.module_id === mod.id).sort((a, b) => a.position - b.position)
    );

  // ── Sub-view: Lesson Editor ──
  if (subView === "lesson" && selectedLesson) {
    const currentIdx = flatLessons.findIndex((l) => l.id === selectedLesson.id);
    const prevLesson = currentIdx > 0 ? flatLessons[currentIdx - 1] : null;
    const nextLesson = currentIdx < flatLessons.length - 1 ? flatLessons[currentIdx + 1] : null;

    return (
      <div className="max-w-5xl" style={{ minHeight: 500 }}>
        <ErrorBoundary fallback={
          <div className="p-8 text-center">
            <p className="text-sm text-destructive mb-2">Erro ao carregar o editor da aula.</p>
            <Button variant="outline" size="sm" onClick={() => { setSelectedLesson(null); setSubView("main"); }}>Voltar aos módulos</Button>
          </div>
        }>
          <CourseLessonEditor
            lesson={selectedLesson}
            onBack={() => { setSelectedLesson(null); setSubView("main"); }}
            onDeleted={() => { setSelectedLesson(null); setSubView("main"); }}
            onNavigate={(l) => setSelectedLesson(l)}
            nav={{ prevLesson, nextLesson }}
            branding={{
              highlightColor: course.branding_highlight_color || "#6366f1",
              bgColor: course.branding_bg_color || "#ffffff",
              titleFont: course.branding_title_font || "Inter",
            }}
          />
        </ErrorBoundary>
      </div>
    );
  }

  // ── Sub-view: Edit Page (Course Homepage editor) ──
  if (subView === "editPage") {
    return (
      <EditPageSubView
        course={course}
        setSaving={setSaving}
        onBack={() => setSubView("main")}
      />
    );
  }

  // ── Main view: Course Homepage card + Modules tree ──

  const selectLesson = (lesson: CourseLesson) => {
    setSelectedLesson(lesson);
    setSubView("lesson");
  };

  const toggleExpand = (id: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddModule = () => {
    createModule.mutate(
      { course_id: course.id, position: localModules.length },
      {
        onSuccess: (mod) => {
          setExpandedModules((prev) => new Set(prev).add(mod.id));
          toast.success("Módulo criado");
        },
      }
    );
  };

  const handleAddFromTemplate = async (templateKey: string) => {
    const template = MODULE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    setShowTemplates(false);
    createModule.mutate(
      { course_id: course.id, title: template.moduleName, position: localModules.length },
      {
        onSuccess: async (mod) => {
          setExpandedModules((prev) => new Set(prev).add(mod.id));
          for (let i = 0; i < template.lessons.length; i++) {
            await createLesson.mutateAsync({ module_id: mod.id, title: template.lessons[i], position: i });
          }
          toast.success(`Template "${template.label}" aplicado!`);
        },
      }
    );
  };

  const handleAddLesson = (moduleId: string) => {
    const count = localLessons.filter((l) => l.module_id === moduleId).length;
    createLesson.mutate(
      { module_id: moduleId, position: count },
      {
        onSuccess: () => {
          setExpandedModules((prev) => new Set(prev).add(moduleId));
          toast.success("Aula criada");
        },
      }
    );
  };

  const handleDuplicateLesson = (lesson: CourseLesson) => {
    const moduleLessons = localLessons.filter((l) => l.module_id === lesson.module_id);
    duplicateLesson.mutate(
      { lesson, newPosition: moduleLessons.length },
      { onSuccess: () => toast.success("Aula duplicada!") }
    );
  };

  const startRename = (id: string, currentTitle: string) => {
    setRenamingId(id);
    setRenameValue(currentTitle);
  };

  const commitRename = (id: string, type: "module" | "lesson", parentId: string) => {
    setRenamingId(null);
    const trimmed = renameValue.trim() || "Sem título";
    if (type === "module") {
      setLocalModules((prev) => prev.map((m) => m.id === id ? { ...m, title: trimmed } : m));
      updateModule.mutate(
        { id, course_id: parentId, title: trimmed },
        { onError: () => { setLocalModules(serverModules); toast.error("Erro ao renomear"); } }
      );
    } else {
      setLocalLessons((prev) => prev.map((l) => l.id === id ? { ...l, title: trimmed } : l));
      updateLesson.mutate(
        { id, module_id: parentId, title: trimmed },
        { onError: () => { setLocalLessons(serverLessons); toast.error("Erro ao renomear"); } }
      );
    }
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const { type, id, courseId, moduleId } = deleteTarget;
    if (type === "module") {
      setLocalModules((prev) => prev.filter((m) => m.id !== id));
      setLocalLessons((prev) => prev.filter((l) => l.module_id !== id));
      deleteModuleMut.mutate(
        { id, course_id: courseId! },
        {
          onSuccess: () => toast.success("Módulo excluído"),
          onError: () => { setLocalModules(serverModules); setLocalLessons(serverLessons); toast.error("Erro ao excluir"); },
        }
      );
    } else {
      setLocalLessons((prev) => prev.filter((l) => l.id !== id));
      deleteLessonMut.mutate(
        { id, module_id: moduleId! },
        {
          onSuccess: () => toast.success("Aula excluída"),
          onError: () => { setLocalLessons(serverLessons); toast.error("Erro ao excluir"); },
        }
      );
    }
    setDeleteTarget(null);
  };

  const setModuleStatus = (mod: CourseModule, newStatus: string) => {
    const dripType = newStatus === "drip" ? (mod.drip_type === "none" ? "days_after_purchase" : mod.drip_type) : "none";
    setLocalModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, status: newStatus, drip_type: dripType } : m));
    updateModule.mutate(
      { id: mod.id, course_id: mod.course_id, status: newStatus, drip_type: dripType } as any,
      { onError: () => { setLocalModules(serverModules); toast.error("Erro ao alterar status"); } }
    );
  };

  const updateDrip = (mod: CourseModule, dripType: string, dripDays?: number | null, dripAt?: string | null) => {
    setLocalModules((prev) => prev.map((m) => m.id === mod.id ? { ...m, drip_type: dripType, drip_days: dripDays ?? m.drip_days, drip_at: dripAt ?? m.drip_at } : m));
    updateModule.mutate(
      { id: mod.id, course_id: mod.course_id, drip_type: dripType, ...(dripDays !== undefined ? { drip_days: dripDays } : {}), ...(dripAt !== undefined ? { drip_at: dripAt } : {}) } as any,
      { onError: () => { setLocalModules(serverModules); toast.error("Erro ao configurar drip"); } }
    );
  };

  const handleModuleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = localModules.findIndex((m) => m.id === active.id);
    const newIdx = localModules.findIndex((m) => m.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(localModules, oldIdx, newIdx).map((m, i) => ({ ...m, position: i }));
    setLocalModules(reordered);
    isReorderingRef.current = true;
    trackEvent("course_module_reordered", { course_id: course.id });
    reorderModules.mutate(
      { courseId: course.id, order: reordered.map((m) => ({ id: m.id, position: m.position })) },
      {
        onSettled: () => { isReorderingRef.current = false; },
        onError: () => { setLocalModules(serverModules); showToast("error", "Erro ao reordenar"); },
      }
    );
  };

  const handleLessonDragEnd = (moduleId: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const moduleLessons = localLessons.filter((l) => l.module_id === moduleId).sort((a, b) => a.position - b.position);
    const oldIdx = moduleLessons.findIndex((l) => l.id === active.id);
    const newIdx = moduleLessons.findIndex((l) => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(moduleLessons, oldIdx, newIdx).map((l, i) => ({ ...l, position: i }));
    setLocalLessons((prev) => {
      const others = prev.filter((l) => l.module_id !== moduleId);
      return [...others, ...reordered];
    });
    isReorderingRef.current = true;
    trackEvent("course_lesson_reordered", { course_id: course.id, module_id: moduleId });
    reorderLessons.mutate(
      { moduleId, order: reordered.map((l) => ({ id: l.id, position: l.position })) },
      {
        onSettled: () => { isReorderingRef.current = false; },
        onError: () => { setLocalLessons(serverLessons); showToast("error", "Erro ao reordenar"); },
      }
    );
  };

  return (
    <ErrorBoundary fallback={
      <div className="p-8 text-center max-w-3xl">
        <p className="text-sm text-destructive mb-2">Erro ao carregar o conteúdo do curso.</p>
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>Recarregar página</Button>
      </div>
    }>
    <div className="max-w-3xl space-y-6 animate-in fade-in">
      {/* ── Section 1: Course Homepage ── */}
      <StepCard stepNumber={1} title="Course Homepage" description="Start by giving your course a title, description, and image." completed={!!course.title && !!course.hero_image_url}>
        <div
          className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card cursor-pointer hover:border-primary/40 transition-colors"
          onClick={() => setSubView("editPage")}
        >
          <div className="h-[60px] w-[80px] rounded-lg border border-border bg-muted/50 overflow-hidden shrink-0 flex items-center justify-center">
            {course.hero_image_url ? (
              <img src={course.hero_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Homepage</p>
            <p className="text-sm font-semibold truncate">{course.title || "Sem título"}</p>
          </div>
          <Button variant="ghost" size="sm" className="shrink-0 gap-1.5 text-xs text-primary">
            Edit Page <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </StepCard>

      {/* ── Section 2: Add Modules ── */}
      <StepCard stepNumber={2} title="Add modules" description="Organize your course content into modules and lessons." completed={localModules.length > 0}>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleModuleDragEnd}>
          <SortableContext items={localModules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {localModules.map((mod, modIndex) => {
              const moduleLessons = localLessons
                .filter((l) => l.module_id === mod.id)
                .sort((a, b) => a.position - b.position);
              const isExpanded = expandedModules.has(mod.id);

              return (
                <SortableItem key={mod.id} id={mod.id}>
                  <Card className="border border-border/60">
                    <CardHeader className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleExpand(mod.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={isExpanded ? "Recolher módulo" : "Expandir módulo"}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>

                        {renamingId === mod.id ? (
                          <Input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            maxLength={100}
                            className="h-7 text-sm font-medium"
                            onBlur={() => commitRename(mod.id, "module", mod.course_id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                          />
                        ) : (
                          <span className="text-sm font-semibold truncate flex-1">
                            Module {modIndex + 1}: {mod.title}
                          </span>
                        )}

                        <StatusBadge status={mod.status} dripType={mod.drip_type} />

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Menu do módulo">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startRename(mod.id, mod.title)}>
                              <Pencil className="h-4 w-4 mr-2" />Renomear
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setModuleStatus(mod, "published")} disabled={mod.status === "published"}>
                              <Eye className="h-4 w-4 mr-2" />Published
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setModuleStatus(mod, "drip")} disabled={mod.status === "drip"}>
                              <Droplets className="h-4 w-4 mr-2" />Drip
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setModuleStatus(mod, "draft")} disabled={mod.status === "draft"}>
                              <EyeOff className="h-4 w-4 mr-2" />Draft
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget({ type: "module", id: mod.id, title: mod.title, courseId: mod.course_id })}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />Delete Module
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="pt-0 pb-3 px-4">
                        {mod.status === "drip" && (
                          <div className="flex items-center gap-3 mb-3 pl-2 py-2 px-3 rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                            <Droplets className="h-4 w-4 text-blue-600 shrink-0" />
                            <Select value={mod.drip_type} onValueChange={(v) => updateDrip(mod, v)}>
                              <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="date">
                                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />Data específica</span>
                                </SelectItem>
                                <SelectItem value="days_after_purchase">
                                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Dias após compra</span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {mod.drip_type === "days_after_purchase" && (
                              <Input type="number" min={1} className="h-7 w-20 text-xs" defaultValue={mod.drip_days ?? ""} placeholder="Dias"
                                onBlur={(e) => updateDrip(mod, "days_after_purchase", parseInt(e.target.value) || null)} />
                            )}
                            {mod.drip_type === "date" && (
                              <Input type="date" className="h-7 text-xs w-40" defaultValue={mod.drip_at ? mod.drip_at.split("T")[0] : ""}
                                onBlur={(e) => updateDrip(mod, "date", undefined, e.target.value ? new Date(e.target.value).toISOString() : null)} />
                            )}
                          </div>
                        )}

                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleLessonDragEnd(mod.id)}>
                          <SortableContext items={moduleLessons.map((l) => l.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-0.5 pl-2">
                              {moduleLessons.map((lesson, lessonIdx) => (
                                <SortableItem key={lesson.id} id={lesson.id} className="rounded-md hover:bg-muted/50 transition-colors">
                                  <div
                                    className="flex items-center gap-2 py-2 px-2 group cursor-pointer"
                                    onClick={() => selectLesson(lesson)}
                                  >
                                    <Play className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    {renamingId === lesson.id ? (
                                      <Input autoFocus value={renameValue} onChange={(e) => setRenameValue(e.target.value)} maxLength={100}
                                        className="h-6 text-xs flex-1"
                                        onClick={(e) => e.stopPropagation()}
                                        onBlur={() => commitRename(lesson.id, "lesson", lesson.module_id)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                          if (e.key === "Escape") setRenamingId(null);
                                        }} />
                                    ) : (
                                      <span className="text-sm flex-1 truncate">
                                        Lesson {lessonIdx + 1}: {lesson.title}
                                      </span>
                                    )}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon"
                                          className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground transition-opacity"
                                          onClick={(e) => e.stopPropagation()}
                                          aria-label="Menu da aula">
                                          <MoreVertical className="h-3 w-3" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); startRename(lesson.id, lesson.title); }}>
                                          <Pencil className="h-4 w-4 mr-2" />Renomear
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleDuplicateLesson(lesson); }}>
                                          <Copy className="h-4 w-4 mr-2" />Duplicar
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive focus:text-destructive"
                                          onClick={(e) => { e.stopPropagation(); setDeleteTarget({ type: "lesson", id: lesson.id, title: lesson.title, moduleId: lesson.module_id }); }}>
                                          <Trash2 className="h-4 w-4 mr-2" />Excluir
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                  </div>
                                </SortableItem>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>

                        <Button variant="outline" size="sm" className="mt-2 w-full text-xs gap-1.5"
                          onClick={() => handleAddLesson(mod.id)} disabled={createLesson.isPending}>
                          <Plus className="h-3.5 w-3.5" />Add Lesson
                        </Button>
                      </CardContent>
                    )}
                  </Card>
                </SortableItem>
              );
            })}
          </SortableContext>
        </DndContext>

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1 gap-2" onClick={handleAddModule} disabled={createModule.isPending}>
            <Plus className="h-4 w-4" />Add Module
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => setShowTemplates(true)}>
            <LayoutTemplate className="h-4 w-4" />Template
          </Button>
        </div>

        {localModules.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm mb-1">Nenhum módulo criado ainda</p>
            <p className="text-xs">Use um template ou crie um módulo em branco</p>
          </div>
        )}
      </StepCard>

      {/* Template picker */}
      <AlertDialog open={showTemplates} onOpenChange={setShowTemplates}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="h-5 w-5" />Criar módulo a partir de template
            </AlertDialogTitle>
            <AlertDialogDescription>Escolha um template para iniciar com aulas pré-configuradas.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 py-2">
            {MODULE_TEMPLATES.map((tmpl) => (
              <button key={tmpl.key} onClick={() => handleAddFromTemplate(tmpl.key)}
                className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors">
                <p className="text-sm font-medium">{tmpl.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{tmpl.lessons.length} aulas: {tmpl.lessons.join(" · ")}</p>
              </button>
            ))}
          </div>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.type === "module" ? "módulo" : "aula"}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "module"
                ? `O módulo "${deleteTarget.title}" e todas as suas aulas serão excluídos permanentemente.`
                : `A aula "${deleteTarget?.title}" será excluída permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </ErrorBoundary>
  );
}

// ═══════════════════════════════════════════
// Edit Page sub-view (Course Homepage editor)
// ═══════════════════════════════════════════
function EditPageSubView({ course, setSaving, onBack }: { course: Course; setSaving: (v: boolean) => void; onBack: () => void }) {
  const { enqueue, status, flush } = useAutosave(course, setSaving);

  const [heroUrl, setHeroUrl] = useState(course.hero_image_url || "");
  const [title, setTitle] = useState(course.title || "");
  const [description, setDescription] = useState(course.description_richtext || "");
  const [titleFont, setTitleFont] = useState(course.branding_title_font || "Inter");
  const [bgColor, setBgColor] = useState(course.branding_bg_color || "#ffffff");
  const [hlColor, setHlColor] = useState(course.branding_highlight_color || "#6366f1");

  const update = (fields: Partial<Course>) => enqueue(fields);

  const handleSave = () => {
    flush();
    setTimeout(() => onBack(), 400);
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      {/* Header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className="h-4 w-4 rotate-180" />
        <span>Course Homepage</span>
      </button>

      <SaveStatusIndicator status={status} />

      {/* Section 1: Page Description */}
      <StepCard stepNumber={1} title="Page Description" completed={!!title && !!heroUrl}>
        <div className="space-y-5">
          <ImageUploadField
            value={heroUrl || null}
            onChange={(url) => { setHeroUrl(url || ""); update({ hero_image_url: url }); }}
            label="Course Image"
            recommendation="Recommended: 1920×1080"
          />

          <div className="space-y-2">
            <Label className="text-sm font-medium">Title</Label>
            <Input
              value={title}
              onChange={(e) => {
                const v = e.target.value;
                setTitle(v);
                if (v.length <= 100) update({ title: v });
              }}
              maxLength={100}
              placeholder="My 12-week Program"
            />
            <p className="text-right text-[10px] text-muted-foreground">{title.length}/100</p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            <RichTextEditor
              value={description}
              onChange={(html) => { setDescription(html); update({ description_richtext: html }); }}
              minHeight="140px"
              placeholder="Describe what students will learn..."
            />
          </div>
        </div>
      </StepCard>

      {/* Section 2: Customize Branding */}
      <StepCard stepNumber={2} title="Customize Branding" completed={!!bgColor && !!hlColor}>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Title Font</Label>
            <Select value={titleFont} onValueChange={(v) => { setTitleFont(v); update({ branding_title_font: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Inter", "Poppins", "Montserrat", "Roboto", "Playfair Display", "DM Sans", "Space Grotesk"].map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <BrandingColorPicker label="Background Color" value={bgColor} onChange={(c) => { setBgColor(c); update({ branding_bg_color: c }); }} />
            <BrandingColorPicker label="Highlight Color" value={hlColor} onChange={(c) => { setHlColor(c); update({ branding_highlight_color: c }); }} />
          </div>
        </div>
      </StepCard>

      {/* Footer actions */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="outline" onClick={onBack}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 4: Options (branding + growth blocks + checklist + status)
// ═══════════════════════════════════════════

const GROWTH_BLOCKS = [
  { key: "reviews", label: "Reviews", desc: "Exibir avaliações de alunos no curso", icon: Star },
  { key: "email_flows", label: "Email Flows", desc: "Automação de e-mails pós-compra", icon: Zap },
  { key: "order_bump", label: "Order Bump", desc: "Oferta adicional no checkout", icon: Gift },
  { key: "affiliate_share", label: "Affiliate Share", desc: "Permitir afiliados divulgarem", icon: Share2 },
  { key: "confirmation_email", label: "Confirmation Email", desc: "E-mail de confirmação de compra", icon: MailCheck },
] as const;

function OptionsTab({ course, setSaving }: { course: Course; setSaving: (v: boolean) => void }) {
  const { enqueue, status: saveStatus } = useAutosave(course, setSaving);
  const updateCourse = useUpdateCourse();
  const { data: modules = [] } = useModules(course.id);
  const moduleIds = modules.map((m) => m.id);
  const { data: allLessons = [] } = useAllLessons(course.id, moduleIds);

  const [titleFont, setTitleFont] = useState(course.branding_title_font || "Inter");
  const [bgColor, setBgColor] = useState(course.branding_bg_color || "#ffffff");
  const [hlColor, setHlColor] = useState(course.branding_highlight_color || "#6366f1");
  const [description, setDescription] = useState(course.description_richtext || "");
  const [heroUrl, setHeroUrl] = useState(course.hero_image_url || "");
  const [courseStatus, setCourseStatus] = useState(course.status);
  const [growthBlocks, setGrowthBlocks] = useState<Record<string, boolean>>(
    (course.growth_blocks as Record<string, boolean>) || {}
  );

  const update = (fields: Partial<Course>) => enqueue(fields);

  const checklist = getCoursePublishChecklist(course, modules, allLessons);
  const errorItems = checklist.filter((c) => c.severity === "error");
  const warningItems = checklist.filter((c) => c.severity === "warning");
  const hasErrors = errorItems.some((c) => !c.passed);
  const passedCount = checklist.filter((c) => c.passed).length;

  const toggleGrowthBlock = (key: string) => {
    const next = { ...growthBlocks, [key]: !growthBlocks[key] };
    setGrowthBlocks(next);
    update({ growth_blocks: next } as any);
  };

  const handlePublish = () => {
    if (hasErrors) {
      const pending = errorItems.filter((c) => !c.passed).map((c) => c.label);
      toast.error("Corrija os itens obrigatórios antes de publicar", {
        description: `Faltam: ${pending.join("; ")}`,
        duration: 6000,
      });
      return;
    }
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status: "published" },
      {
        onSuccess: () => {
          setCourseStatus("published");
          toast.success("Curso publicado com sucesso!");
          setSaving(false);
        },
        onError: (err: any) => {
          toast.error("Erro ao publicar", { description: err?.message || "Tente novamente." });
          setSaving(false);
        },
      }
    );
  };

  const saveAsDraft = () => {
    setSaving(true);
    updateCourse.mutate(
      { id: course.id, status: "draft" },
      {
        onSuccess: () => {
          setCourseStatus("draft");
          toast.success(courseStatus === "published" ? "Curso despublicado" : "Rascunho salvo!");
          setSaving(false);
        },
        onError: () => { toast.error("Erro ao salvar"); setSaving(false); },
      }
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <SaveStatusIndicator status={saveStatus} />

      {/* Step 1 — Branding */}
      <StepCard stepNumber={1} title="Branding do curso" completed={!!bgColor && !!hlColor}>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Descrição do curso</Label>
            <RichTextEditor
              value={description}
              onChange={(html) => { setDescription(html); update({ description_richtext: html }); }}
              minHeight="120px"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Imagem Hero</Label>
            <ImageUploadField
              value={heroUrl || null}
              onChange={(url) => { setHeroUrl(url || ""); update({ hero_image_url: url }); }}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Fonte do título</Label>
            <Select value={titleFont} onValueChange={(v) => { setTitleFont(v); update({ branding_title_font: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Inter", "Poppins", "Montserrat", "Roboto", "Playfair Display", "DM Sans", "Space Grotesk"].map(f => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <BrandingColorPicker label="Cor de fundo" value={bgColor} onChange={(c) => { setBgColor(c); update({ branding_bg_color: c }); }} />
            <BrandingColorPicker label="Cor de destaque" value={hlColor} onChange={(c) => { setHlColor(c); update({ branding_highlight_color: c }); }} />
          </div>
        </div>
      </StepCard>

      {/* Step 2 — Growth Blocks */}
      <StepCard stepNumber={2} title="Blocos de crescimento" description="Ative recursos para aumentar vendas e engajamento.">
        <div className="space-y-3">
          {GROWTH_BLOCKS.map(({ key, label, desc, icon: Icon }) => {
            const enabled = !!growthBlocks[key];
            const isComingSoon = key !== "confirmation_email";
            return (
              <div
                key={key}
                className={cn(
                  "flex items-center gap-4 p-4 rounded-xl border transition-all",
                  enabled ? "border-primary/30 bg-primary/5" : "border-border bg-card"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                  enabled ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{label}</p>
                    {isComingSoon && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">Em breve</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={() => toggleGrowthBlock(key)}
                  disabled={isComingSoon}
                />
              </div>
            );
          })}
        </div>
      </StepCard>

      {/* Step 3 — Checklist */}
      <StepCard stepNumber={3} title="Checklist de publicação" completed={passedCount === checklist.length}>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground mb-3">{passedCount}/{checklist.length} itens completos</p>

          {/* Obrigatórios */}
          {errorItems.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-foreground mb-1.5">Obrigatórios</p>
              {errorItems.map((item) => (
                <div key={item.key} className="flex items-start gap-2 py-1">
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm",
                    item.passed ? "text-muted-foreground line-through" : "text-foreground font-medium"
                  )}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recomendados */}
          {warningItems.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-foreground mb-1.5">Recomendados</p>
              {warningItems.map((item) => (
                <div key={item.key} className="flex items-start gap-2 py-1">
                  {item.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  )}
                  <span className={cn(
                    "text-sm",
                    item.passed ? "text-muted-foreground line-through" : "text-foreground"
                  )}>{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {passedCount === checklist.length && (
            <p className="text-xs text-green-600 font-medium pt-2">✓ Tudo pronto para publicar!</p>
          )}
        </div>
      </StepCard>

      {/* Step 4 — Status */}
      <StepCard stepNumber={4} title="Status do curso">
        <div className="space-y-4">
          <div>
            <Label className="text-sm">Status atual</Label>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant={courseStatus === "published" ? "default" : "outline"}>
                {courseStatus === "published" ? "Publicado" : "Rascunho"}
              </Badge>
            </div>
          </div>
          <div className="flex gap-2">
            {courseStatus === "published" ? (
              <Button variant="outline" onClick={saveAsDraft} disabled={updateCourse.isPending} className="flex-1">
                <EyeOff className="h-4 w-4 mr-2" />Voltar para rascunho
              </Button>
            ) : (
              <>
                <Button variant="outline" onClick={saveAsDraft} disabled={updateCourse.isPending} className="flex-1">
                  Salvar rascunho
                </Button>
                <Button onClick={handlePublish} disabled={updateCourse.isPending || hasErrors} className="flex-1"
                  title={hasErrors ? "Corrija os itens obrigatórios do checklist" : undefined}>
                  <Eye className="h-4 w-4 mr-2" />Publicar curso
                </Button>
              </>
            )}
          </div>
        </div>
      </StepCard>
    </div>
  );
}
