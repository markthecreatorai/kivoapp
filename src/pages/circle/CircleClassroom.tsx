import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceProvider";
import { useAuth } from "@/contexts/AuthProvider";
import {
  BookOpen, Play, CheckCircle2, Crown, ArrowLeft,
  ChevronDown, ChevronRight, FileText, Headphones, Circle,
  Heart, MessageCircle, Plus,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import CourseFormModal from "@/components/circle/CourseFormModal";
import CourseCardMenu from "@/components/circle/CourseCardMenu";

// ─── Types ───────────────────────────────────────────────────
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
  media_url: string | null;
  text_content: string | null;
  description: string | null;
  duration: number | null;
  position: number | null;
  parent_id: string | null;
}

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

// ─── Mock data ───────────────────────────────────────────────
const MOCK_COURSES: CircleCourse[] = [
  { id: "mock-1", community_id: "", name: "Foundations of Growth", description: "Learn the core principles of scaling your online business from zero to six figures.", cover_url: null, access_type: "free", is_published: true, position: 0 },
  { id: "mock-2", community_id: "", name: "Content Marketing Mastery", description: "Create content that converts — strategy, copywriting, and distribution.", cover_url: null, access_type: "free", is_published: true, position: 1 },
  { id: "mock-3", community_id: "", name: "Community Building Blueprint", description: "Build and engage a thriving community around your brand.", cover_url: null, access_type: "free", is_published: true, position: 2 },
  { id: "mock-4", community_id: "", name: "Sales Funnel Secrets", description: "Design high-converting funnels that sell on autopilot.", cover_url: null, access_type: "premium", is_published: true, position: 3 },
  { id: "mock-5", community_id: "", name: "Email Marketing Pro", description: "Master email sequences, automations, and deliverability.", cover_url: null, access_type: "free", is_published: true, position: 4 },
  { id: "mock-6", community_id: "", name: "Launch Like a Pro", description: "Step-by-step launch playbook for digital products.", cover_url: null, access_type: "premium", is_published: true, position: 5 },
];

const MOCK_MODULES: CourseModule[] = [
  {
    id: "mod-1", title: "Getting Started", position: 0,
    lessons: [
      { id: "les-1", title: "Welcome & Course Overview", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "A warm welcome and what you'll learn in this course.", duration: 300, position: 0, parent_id: "mod-1" },
      { id: "les-2", title: "Setting Up Your Workspace", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "Configure your tools and environment for maximum productivity.", duration: 480, position: 1, parent_id: "mod-1" },
      { id: "les-3", title: "Mindset for Success", type: "lesson", media_type: "text", media_url: null, text_content: "Success starts with the right mindset...", description: "The mental frameworks that separate top performers.", duration: 600, position: 2, parent_id: "mod-1" },
    ],
  },
  {
    id: "mod-2", title: "Core Strategies", position: 1,
    lessons: [
      { id: "les-4", title: "Finding Your Niche", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "How to identify and validate a profitable niche.", duration: 720, position: 0, parent_id: "mod-2" },
      { id: "les-5", title: "Building Your Audience", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "Organic and paid strategies to grow your following.", duration: 900, position: 1, parent_id: "mod-2" },
      { id: "les-6", title: "Monetization Models", type: "lesson", media_type: "pdf", media_url: null, text_content: null, description: "Compare different business models and pick the right one.", duration: 540, position: 2, parent_id: "mod-2" },
    ],
  },
  {
    id: "mod-3", title: "Advanced Techniques", position: 2,
    lessons: [
      { id: "les-7", title: "Scaling with Systems", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "Automate and delegate to grow without burnout.", duration: 660, position: 0, parent_id: "mod-3" },
      { id: "les-8", title: "Analytics & Optimization", type: "lesson", media_type: "video", media_url: null, text_content: null, description: "Data-driven decisions for continuous growth.", duration: 480, position: 1, parent_id: "mod-3" },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────
export default function CircleClassroom() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
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

  // ─── Lesson content for detail view (uses member_content linked to products) ──
  const { data: realCourseContent } = useQuery({
    queryKey: ["classroom-content", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return null;
      // For circle_courses, we don't have linked product_id yet, so use mock
      return null;
    },
    enabled: !!selectedCourseId && !isMock,
  });

  const courseContent = isMock && selectedCourseId?.startsWith("mock-") ? MOCK_MODULES : realCourseContent;

  // Auto-select first lesson and expand all modules
  const allLessons = useMemo(() => courseContent?.flatMap(m => m.lessons) || [], [courseContent]);
  useEffect(() => {
    if (courseContent && courseContent.length > 0 && !selectedLessonId) {
      setExpandedModules(new Set(courseContent.map(m => m.id)));
      if (allLessons.length > 0) setSelectedLessonId(allLessons[0].id);
    }
  }, [courseContent, selectedLessonId, allLessons]);

  const selectedCourse = courses.find(c => c.id === selectedCourseId);
  const activeLesson = allLessons.find(l => l.id === selectedLessonId);

  const toggleModule = (moduleId: string) => {
    setExpandedModules(prev => {
      const next = new Set(prev);
      next.has(moduleId) ? next.delete(moduleId) : next.add(moduleId);
      return next;
    });
  };

  const getLessonIcon = (mediaType: string | null) => {
    switch (mediaType) {
      case "video": return <Play className="h-3.5 w-3.5" />;
      case "audio": return <Headphones className="h-3.5 w-3.5" />;
      case "pdf": return <FileText className="h-3.5 w-3.5" />;
      default: return <FileText className="h-3.5 w-3.5" />;
    }
  };

  // ═══════════════════════════════════════════════════════════
  //  DETAIL VIEW — Sidebar + Main Content
  // ═══════════════════════════════════════════════════════════
  if (selectedCourseId && selectedCourse) {
    const percent = 0; // Progress TBD when linked to real lessons

    return (
      <div className="flex flex-col h-[calc(100vh-120px)]">
        {/* Top bar */}
        <div className="shrink-0 px-4 md:px-6 py-3 border-b border-border bg-card flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => { setSelectedCourseId(null); setSelectedLessonId(null); setExpandedModules(new Set()); }}
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
          {/* ── Left Sidebar: Modules & Lessons ── */}
          <ScrollArea className="w-72 lg:w-80 shrink-0 border-r border-border bg-card">
            <div className="py-2">
              {courseContent?.map((mod) => {
                const isExpanded = expandedModules.has(mod.id);

                return (
                  <div key={mod.id}>
                    <button
                      onClick={() => toggleModule(mod.id)}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors"
                    >
                      {isExpanded
                        ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      }
                      <span className="text-[13px] font-semibold text-foreground flex-1 truncate">{mod.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        0/{mod.lessons.length}
                      </span>
                    </button>

                    {isExpanded && mod.lessons.map((lesson) => {
                      const isActive = lesson.id === selectedLessonId;

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => setSelectedLessonId(lesson.id)}
                          className={cn(
                            "w-full flex items-center gap-2.5 pl-9 pr-4 py-2 text-left transition-colors",
                            isActive ? "bg-accent/50 border-r-2 border-primary" : "hover:bg-muted/30"
                          )}
                        >
                          <div className="shrink-0">
                            <Circle className="h-4 w-4 text-muted-foreground/40" />
                          </div>
                          <span className={cn(
                            "text-[13px] flex-1 truncate",
                            isActive ? "font-medium text-foreground" : "text-muted-foreground"
                          )}>
                            {lesson.title}
                          </span>
                          <div className="shrink-0 text-muted-foreground/40">
                            {getLessonIcon(lesson.media_type)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

              {(!courseContent || courseContent.length === 0) && (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nenhum módulo encontrado.
                </div>
              )}
            </div>
          </ScrollArea>

          {/* ── Right: Content Area ── */}
          <ScrollArea className="flex-1 bg-muted/30">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-6 space-y-6">
              {activeLesson ? (
                <>
                  {/* Video / Content Player */}
                  <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
                    {activeLesson.media_type === "video" ? (
                      activeLesson.media_url ? (
                        <div className="aspect-video">
                          {activeLesson.media_url.includes("youtube") || activeLesson.media_url.includes("youtu.be") || activeLesson.media_url.includes("vimeo") ? (
                            <iframe
                              src={activeLesson.media_url}
                              className="w-full h-full"
                              allow="autoplay; fullscreen; picture-in-picture"
                              allowFullScreen
                            />
                          ) : (
                            <video src={activeLesson.media_url} controls className="w-full h-full" />
                          )}
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-foreground/90 to-foreground/70 flex flex-col items-center justify-center gap-3">
                          <div className="h-16 w-16 rounded-full bg-background/20 flex items-center justify-center">
                            <Play className="h-7 w-7 text-background/70 ml-1" />
                          </div>
                          <span className="text-background/50 text-sm font-medium">Video content</span>
                        </div>
                      )
                    ) : activeLesson.media_type === "audio" ? (
                      <div className="p-8 flex flex-col items-center gap-4">
                        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                          <Headphones className="h-8 w-8 text-primary" />
                        </div>
                        {activeLesson.media_url ? (
                          <audio src={activeLesson.media_url} controls className="w-full max-w-md" />
                        ) : (
                          <span className="text-muted-foreground text-sm">Audio content</span>
                        )}
                      </div>
                    ) : activeLesson.media_type === "pdf" ? (
                      <div className="p-8 flex flex-col items-center gap-4">
                        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                          <FileText className="h-8 w-8 text-primary" />
                        </div>
                        {activeLesson.media_url ? (
                          <a href={activeLesson.media_url} target="_blank" rel="noopener noreferrer">
                            <Button>Open PDF</Button>
                          </a>
                        ) : (
                          <span className="text-muted-foreground text-sm">PDF content</span>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-foreground/90 to-foreground/70 flex flex-col items-center justify-center gap-3">
                        <div className="h-16 w-16 rounded-full bg-background/20 flex items-center justify-center">
                          <FileText className="h-7 w-7 text-background/70" />
                        </div>
                        <span className="text-background/50 text-sm font-medium">Lesson content</span>
                      </div>
                    )}

                    <div className="p-5">
                      <h2 className="text-lg font-bold text-foreground">{activeLesson.title}</h2>
                      {activeLesson.description && (
                        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{activeLesson.description}</p>
                      )}
                      {activeLesson.text_content && (
                        <div className="mt-4 text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                          {activeLesson.text_content}
                        </div>
                      )}
                      {activeLesson.duration && activeLesson.duration > 0 && (
                        <span className="inline-block mt-3 text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded">
                          ⏱ {Math.ceil(activeLesson.duration / 60)} min
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Community Post Card */}
                  <div className="bg-card rounded-xl shadow-sm border border-border p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <MessageCircle className="h-4 w-4 text-muted-foreground" />
                      <span className="text-[13px] font-semibold text-foreground">Discussion</span>
                    </div>
                    <div className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-primary/10 text-primary text-[11px] font-medium">K</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold text-foreground">Kivo Team</span>
                            <span className="text-[10px] font-semibold bg-primary/10 text-primary px-1.5 py-0.5 rounded">Creator</span>
                            <span className="text-[11px] text-muted-foreground">· 2h ago</span>
                          </div>
                          <h4 className="text-sm font-bold text-foreground mt-1">
                            💬 Discussion: {activeLesson.title}
                          </h4>
                          <p className="text-[13px] text-muted-foreground mt-0.5 line-clamp-2">
                            Share your thoughts, questions, and takeaways from this lesson. Let's help each other grow! 🚀
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 ml-[42px]">
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <Heart className="h-3.5 w-3.5" /> 12
                        </span>
                        <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                          <MessageCircle className="h-3.5 w-3.5" /> 5
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <div className="text-center">
                    <BookOpen className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                    <p className="text-sm">Select a lesson to start</p>
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
                setExpandedModules(new Set());
              }}
              className="bg-card rounded-xl shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden flex flex-col relative"
            >
              {/* Admin menu */}
              {isAdmin && !isMock && (
                <div className="absolute top-2.5 right-2.5 z-10">
                  <CourseCardMenu
                    course={course}
                    isFirst={index === 0}
                    isLast={index === courses.length - 1}
                    onEdit={() => { setEditingCourse(course); setShowFormModal(true); }}
                  />
                </div>
              )}

              {/* Thumbnail */}
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

              {/* Progress placeholder */}
              <div className="mt-auto px-4 mb-4 pt-3">
                <Progress value={0} className="h-1.5 rounded-full [&>div]:bg-primary [&>div]:rounded-full" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Course Form Modal */}
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
