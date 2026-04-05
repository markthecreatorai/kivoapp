import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, BookOpen, LogOut, Award, Clock, FolderDown,
  Play, Flame, Target, Trophy, ChevronRight, Users,
  CheckCircle2, Sparkles, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { trackEvent } from "@/lib/tracking";

interface CourseEntitlement {
  product_id: string;
  expires_at: string | null;
  revoked_at: string | null;
  product: {
    id: string;
    name: string;
    thumbnail_url: string | null;
    type: string;
  };
}

interface CourseProgress {
  product_id: string;
  total: number;
  completed: number;
  lastAccessedAt: string | null;
  lastLessonId: string | null;
}

interface RecentLesson {
  lessonId: string;
  lessonTitle: string;
  courseName: string;
  productId: string;
  completedAt: string;
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseEntitlement[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>("");
  const [hasDownloads, setHasDownloads] = useState(false);
  const [loginStreak, setLoginStreak] = useState(0);
  const [communities, setCommunities] = useState<{ id: string; name: string; slug: string; icon_url: string | null }[]>([]);
  const [recentLessons, setRecentLessons] = useState<RecentLesson[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/member/login"); return; }
      setUserEmail(user.email || null);
      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Aluno");

      // Track
      trackEvent("student_portal_viewed", {}, undefined);

      // Customer lookup
      const { data: customer } = await supabase
        .from("customers")
        .select("id, name")
        .eq("email", user.email!)
        .limit(1)
        .maybeSingle();

      if (!customer) { setLoading(false); return; }
      setCustomerId(customer.id);
      if (customer.name) setUserName(customer.name.split(" ")[0]);

      // Entitlements
      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("product_id, expires_at, revoked_at")
        .eq("customer_id", customer.id)
        .is("revoked_at", null);

      if (!entitlements || entitlements.length === 0) { setLoading(false); return; }

      const productIds = [...new Set(entitlements.map(e => e.product_id))];

      // Products + check downloads
      const { data: products } = await supabase
        .from("products")
        .select("id, name, thumbnail_url, type, delivery_url, workspace_id")
        .in("id", productIds);

      if (products) {
        setHasDownloads(products.some(p => !!p.delivery_url));
      }

      const courseEntitlements: CourseEntitlement[] = entitlements
        .filter(e => {
          const prod = products?.find(p => p.id === e.product_id);
          return prod && prod.type === "COURSE";
        })
        .map(e => ({
          ...e,
          product: products!.find(p => p.id === e.product_id)!,
        }));

      setCourses(courseEntitlements);

      // Progress for each course (parallelized)
      const progressEntries: Record<string, CourseProgress> = {};
      const allRecentLessons: RecentLesson[] = [];

      await Promise.all(courseEntitlements.map(async (course) => {
        const { data: contents } = await supabase
          .from("member_content")
          .select("id, title")
          .eq("product_id", course.product_id)
          .eq("type", "lesson");

        if (!contents || contents.length === 0) {
          progressEntries[course.product_id] = {
            product_id: course.product_id, total: 0, completed: 0,
            lastAccessedAt: null, lastLessonId: null,
          };
          return;
        }

        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("member_content_id, completed, last_accessed_at")
          .eq("customer_id", customer.id)
          .in("member_content_id", contents.map(c => c.id));

        // Find most recently accessed lesson
        let lastAccessedAt: string | null = null;
        let lastLessonId: string | null = null;
        if (progress) {
          for (const p of progress) {
            if (p.last_accessed_at && (!lastAccessedAt || p.last_accessed_at > lastAccessedAt)) {
              lastAccessedAt = p.last_accessed_at;
              lastLessonId = p.member_content_id;
            }
          }

          // Collect recently completed lessons
          const completedRecently = progress
            .filter(p => p.completed && p.last_accessed_at)
            .sort((a, b) => (b.last_accessed_at || "").localeCompare(a.last_accessed_at || ""))
            .slice(0, 5);

          for (const p of completedRecently) {
            const content = contents.find(c => c.id === p.member_content_id);
            if (content) {
              allRecentLessons.push({
                lessonId: p.member_content_id,
                lessonTitle: content.title || "Aula sem título",
                courseName: course.product.name,
                productId: course.product_id,
                completedAt: p.last_accessed_at!,
              });
            }
          }
        }

        progressEntries[course.product_id] = {
          product_id: course.product_id,
          total: contents.length,
          completed: progress?.filter(p => p.completed).length ?? 0,
          lastAccessedAt,
          lastLessonId,
        };
      }));

      setProgressMap(progressEntries);
      setRecentLessons(
        allRecentLessons
          .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
          .slice(0, 8)
      );

      // Communities the user is a member of
      const { data: memberships } = await supabase
        .from("community_members")
        .select("community_id")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .limit(5);

      if (memberships && memberships.length > 0) {
        const communityIds = memberships.map(m => m.community_id);
        const { data: comms } = await supabase
          .from("communities")
          .select("id, name, slug, icon_url")
          .in("id", communityIds)
          .eq("is_active", true);
        if (comms) setCommunities(comms);
      }

      // Login streak
      if (progress_has_data(progressEntries)) {
        const { data: recentProgress } = await supabase
          .from("lesson_progress")
          .select("last_accessed_at")
          .eq("customer_id", customer.id)
          .not("last_accessed_at", "is", null)
          .order("last_accessed_at", { ascending: false })
          .limit(100);

        if (recentProgress) {
          const days = new Set(recentProgress.map(p => p.last_accessed_at?.slice(0, 10)));
          let streak = 0;
          const today = new Date();
          for (let i = 0; i < 30; i++) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            if (days.has(key)) { streak++; }
            else if (i > 0) break;
          }
          setLoginStreak(streak);
        }
      }

      setLoading(false);
    }
    load();
  }, [navigate]);

  // Stats
  const stats = useMemo(() => {
    const totalLessons = Object.values(progressMap).reduce((s, p) => s + p.total, 0);
    const completedLessons = Object.values(progressMap).reduce((s, p) => s + p.completed, 0);
    const completedCourses = Object.values(progressMap).filter(p => p.total > 0 && p.completed === p.total).length;
    const overallPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
    return { totalLessons, completedLessons, completedCourses, overallPercent };
  }, [progressMap]);

  // Resume course — find most recently accessed course that's not 100%
  const resumeCourse = useMemo(() => {
    let best: { course: CourseEntitlement; progress: CourseProgress } | null = null;
    for (const course of courses) {
      const p = progressMap[course.product_id];
      if (!p || p.total === 0 || (p.completed === p.total)) continue;
      if (!best || ((p.lastAccessedAt || "") > (best.progress.lastAccessedAt || ""))) {
        best = { course, progress: p };
      }
    }
    // If no recently accessed, pick first incomplete
    if (!best) {
      for (const course of courses) {
        const p = progressMap[course.product_id];
        if (p && p.total > 0 && p.completed < p.total) {
          best = { course, progress: p };
          break;
        }
      }
    }
    return best;
  }, [courses, progressMap]);

  // Recommendations: courses not started or communities not yet joined
  const recommendations = useMemo(() => {
    const items: { type: "course" | "community"; id: string; name: string; thumbnail?: string | null; slug?: string }[] = [];

    // Courses with 0% progress
    for (const course of courses) {
      const p = progressMap[course.product_id];
      if (p && p.total > 0 && p.completed === 0) {
        items.push({ type: "course", id: course.product_id, name: course.product.name, thumbnail: course.product.thumbnail_url });
      }
    }

    // Communities user hasn't visited much (just list them as suggestions)
    for (const comm of communities) {
      if (items.length >= 4) break;
      items.push({ type: "community", id: comm.id, name: comm.name, thumbnail: comm.icon_url, slug: comm.slug });
    }

    return items.slice(0, 4);
  }, [courses, progressMap, communities]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/member/login");
  };

  const isExpired = (e: CourseEntitlement) => {
    if (!e.expires_at) return false;
    return new Date(e.expires_at) < new Date();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const greeting = getGreeting();

  return (
    <div className="min-h-screen bg-[hsl(var(--muted)/0.3)]">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Meu Portal</span>
          </div>
          <div className="flex items-center gap-3">
            {hasDownloads && (
              <Link to="/member/library" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <FolderDown className="w-4 h-4" />
                <span className="hidden sm:inline">Downloads</span>
              </Link>
            )}
            <Link to="/member/certificates" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Award className="w-4 h-4" />
              <span className="hidden sm:inline">Certificados</span>
            </Link>
            <span className="text-xs text-muted-foreground hidden sm:block">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome + Resume */}
        <section className="space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">
              {greeting}, {userName}! 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {courses.length > 0
                ? `Você tem ${courses.length} curso${courses.length > 1 ? "s" : ""} ativo${courses.length > 1 ? "s" : ""}.`
                : "Explore seus conteúdos adquiridos."}
            </p>
          </div>

          {/* Resume CTA */}
          {resumeCourse && (
            <Link
              to={`/member/course/${resumeCourse.course.product_id}`}
              onClick={() => trackEvent("continue_learning_clicked", { product_id: resumeCourse.course.product_id })}
              className="block bg-primary/5 border border-primary/20 rounded-xl p-4 hover:bg-primary/10 transition-colors"
            >
              <div className="flex items-center gap-4">
                {resumeCourse.course.product.thumbnail_url ? (
                  <img
                    src={resumeCourse.course.product.thumbnail_url}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Play className="w-6 h-6 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-primary font-semibold uppercase tracking-wider">Continuar estudando</p>
                  <p className="font-semibold text-foreground truncate mt-0.5">
                    {resumeCourse.course.product.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Progress
                      value={Math.round((resumeCourse.progress.completed / resumeCourse.progress.total) * 100)}
                      className="h-1.5 flex-1 [&>div]:bg-primary"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">
                      {resumeCourse.progress.completed}/{resumeCourse.progress.total}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-primary shrink-0" />
              </div>
            </Link>
          )}
        </section>

        {/* Stats */}
        {courses.length > 0 && (
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Target className="w-4 h-4 text-primary" />}
              label="Progresso"
              value={`${stats.overallPercent}%`}
            />
            <StatCard
              icon={<BookOpen className="w-4 h-4 text-primary" />}
              label="Aulas feitas"
              value={`${stats.completedLessons}/${stats.totalLessons}`}
            />
            <StatCard
              icon={<Trophy className="w-4 h-4 text-primary" />}
              label="Concluídos"
              value={String(stats.completedCourses)}
            />
            <StatCard
              icon={<Flame className="w-4 h-4 text-primary" />}
              label="Streak"
              value={`${loginStreak} dia${loginStreak !== 1 ? "s" : ""}`}
            />
          </section>
        )}

        {/* Courses */}
        {courses.length === 0 ? (
          <div className="text-center py-16 space-y-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
              <BookOpen className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Nenhum curso encontrado</h2>
            <p className="text-sm text-muted-foreground">
              Você ainda não comprou nenhum curso. Visite a loja do creator para começar.
            </p>
          </div>
        ) : (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Meus Cursos</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courses.map((course) => {
                const progress = progressMap[course.product_id];
                const percent = progress && progress.total > 0
                  ? Math.round((progress.completed / progress.total) * 100)
                  : 0;
                const expired = isExpired(course);

                return (
                  <div
                    key={course.product_id}
                    className="bg-card rounded-xl border overflow-hidden transition-shadow hover:shadow-md relative"
                  >
                    {expired && (
                      <div className="absolute inset-0 bg-background/80 z-10 flex flex-col items-center justify-center gap-3 rounded-xl">
                        <Clock className="w-8 h-8 text-muted-foreground" />
                        <p className="text-sm font-medium text-foreground">Acesso expirado</p>
                        <Button size="sm" variant="outline">Renovar</Button>
                      </div>
                    )}

                    <Link
                      to={`/member/course/${course.product_id}`}
                      onClick={() => trackEvent("active_course_opened", { product_id: course.product_id })}
                      className="block"
                    >
                      {course.product.thumbnail_url ? (
                        <img
                          src={course.product.thumbnail_url}
                          alt={course.product.name}
                          className="w-full h-36 object-cover"
                        />
                      ) : (
                        <div className="w-full h-36 bg-muted flex items-center justify-center">
                          <BookOpen className="w-10 h-10 text-muted-foreground" />
                        </div>
                      )}

                      <div className="p-4 space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold text-foreground leading-tight line-clamp-2 text-sm">
                            {course.product.name}
                          </h3>
                          {percent === 100 && (
                            <Badge variant="secondary" className="shrink-0 gap-1">
                              <Award className="w-3 h-3" /> Completo
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>{progress?.completed ?? 0} de {progress?.total ?? 0} aulas</span>
                            <span>{percent}%</span>
                          </div>
                          <Progress value={percent} className="h-2 [&>div]:bg-primary" />
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Recent Activity */}
        {recentLessons.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Atividade Recente</h2>
            </div>
            <div className="space-y-2">
              {recentLessons.map((lesson) => (
                <Link
                  key={lesson.lessonId}
                  to={`/member/course/${lesson.productId}`}
                  className="flex items-center gap-3 p-3 bg-card rounded-lg border hover:shadow-sm transition-shadow"
                >
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{lesson.lessonTitle}</p>
                    <p className="text-xs text-muted-foreground truncate">{lesson.courseName}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatRelativeDate(lesson.completedAt)}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Recommended for you */}
        {recommendations.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Recomendado para você</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {recommendations.map((rec) => (
                <Link
                  key={rec.id}
                  to={rec.type === "course" ? `/member/course/${rec.id}` : `/circles/${rec.slug}/feed`}
                  onClick={() => trackEvent("recommendation_clicked", { type: rec.type, id: rec.id })}
                  className="flex items-center gap-3 p-3 bg-card rounded-xl border hover:shadow-sm transition-shadow"
                >
                  {rec.thumbnail ? (
                    <img src={rec.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      {rec.type === "course" ? <BookOpen className="w-5 h-5 text-primary" /> : <Users className="w-5 h-5 text-primary" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{rec.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {rec.type === "course" ? "Comece agora" : "Explorar comunidade"}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Communities */}
        {communities.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Suas Comunidades</h2>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
              {communities.map((comm) => (
                <Link
                  key={comm.id}
                  to={`/circles/${comm.slug}/feed`}
                  className="flex items-center gap-3 bg-card border rounded-xl p-3 min-w-[200px] sm:min-w-0 sm:flex-1 hover:shadow-sm transition-shadow"
                >
                  {comm.icon_url ? (
                    <img src={comm.icon_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{comm.name}</p>
                    <p className="text-xs text-muted-foreground">Acessar</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 ml-auto" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

// ─── Helpers ───

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function progress_has_data(map: Record<string, CourseProgress>) {
  return Object.values(map).some(p => p.total > 0);
}

function formatRelativeDate(isoDate: string) {
  const now = new Date();
  const d = new Date(isoDate);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin}min atrás`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h atrás`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "ontem";
  if (diffD < 7) return `${diffD}d atrás`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-card rounded-xl border p-3 space-y-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
