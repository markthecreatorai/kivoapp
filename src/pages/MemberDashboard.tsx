import { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, BookOpen, LogOut, Award, Clock, FolderDown,
  Play, Flame, Target, Trophy, ChevronRight, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

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

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/member/login"); return; }
      setUserEmail(user.email || null);
      setUserName(user.user_metadata?.full_name || user.email?.split("@")[0] || "Aluno");

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
        .select("id, name, thumbnail_url, type, delivery_url")
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
      await Promise.all(courseEntitlements.map(async (course) => {
        const { data: contents } = await supabase
          .from("member_content")
          .select("id")
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

      // Login streak (count consecutive days with lesson_progress entries)
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
            else if (i > 0) break; // allow today to not have activity yet
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
      if (!p.lastAccessedAt) continue;
      if (!best || (p.lastAccessedAt > (best.progress.lastAccessedAt || ""))) {
        best = { course, progress: p };
      }
    }
    return best;
  }, [courses, progressMap]);

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
                  <p className="text-xs text-primary font-semibold uppercase tracking-wider">Continuar assistindo</p>
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

                    <Link to={`/member/course/${course.product_id}`} className="block">
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

// Helpers

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function progress_has_data(map: Record<string, CourseProgress>) {
  return Object.values(map).some(p => p.total > 0);
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
