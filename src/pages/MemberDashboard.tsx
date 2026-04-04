import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, BookOpen, LogOut, Award, Clock, FolderDown } from "lucide-react";
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
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState<CourseEntitlement[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgress>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/member/login"); return; }
      setUserEmail(user.email || null);

      // Get customer by email
      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email!)
        .limit(1)
        .maybeSingle();

      if (!customer) { setLoading(false); return; }
      setCustomerId(customer.id);

      // Get entitlements with products
      const { data: entitlements } = await supabase
        .from("entitlements")
        .select("product_id, expires_at, revoked_at")
        .eq("customer_id", customer.id)
        .is("revoked_at", null);

      if (!entitlements || entitlements.length === 0) { setLoading(false); return; }

      const productIds = [...new Set(entitlements.map(e => e.product_id))];
      
      const { data: products } = await supabase
        .from("products")
        .select("id, name, thumbnail_url, type")
        .in("id", productIds);

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

      // Get progress for each course
      for (const course of courseEntitlements) {
        const { data: contents } = await supabase
          .from("member_content")
          .select("id")
          .eq("product_id", course.product_id)
          .eq("type", "lesson");

        if (!contents) continue;

        const { data: progress } = await supabase
          .from("lesson_progress")
          .select("member_content_id, completed")
          .eq("customer_id", customer.id)
          .in("member_content_id", contents.map(c => c.id));

        setProgressMap(prev => ({
          ...prev,
          [course.product_id]: {
            product_id: course.product_id,
            total: contents.length,
            completed: progress?.filter(p => p.completed).length ?? 0,
          }
        }));
      }

      setLoading(false);
    }
    load();
  }, [navigate]);

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

  return (
    <div className="min-h-screen bg-[hsl(var(--muted)/0.3)]">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span className="font-semibold text-foreground">Meus Cursos</span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/member/library" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <FolderDown className="w-4 h-4" />
              <span className="hidden sm:inline">Downloads</span>
            </Link>
            <span className="text-xs text-muted-foreground hidden sm:block">{userEmail}</span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                        className="w-full h-40 object-cover"
                      />
                    ) : (
                      <div className="w-full h-40 bg-muted flex items-center justify-center">
                        <BookOpen className="w-10 h-10 text-muted-foreground" />
                      </div>
                    )}
                    
                    <div className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-foreground leading-tight line-clamp-2">
                          {course.product.name}
                        </h3>
                        {percent === 100 && (
                          <Badge className="bg-green-100 text-green-800 shrink-0">
                            <Award className="w-3 h-3 mr-1" /> Completo
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
        )}
      </main>
    </div>
  );
}
