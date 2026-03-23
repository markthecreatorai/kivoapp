import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Loader2, ChevronLeft, ChevronRight, Check, Menu,
  Play, FileText, Headphones, BookOpen, ArrowLeft, Award, Download,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import confetti from "canvas-confetti";
import { toast } from "sonner";

interface Module {
  id: string;
  title: string;
  position: number | null;
  lessons: Lesson[];
}

interface Lesson {
  id: string;
  title: string;
  type: string;
  media_url: string | null;
  media_type: string | null;
  text_content: string | null;
  description: string | null;
  duration: number | null;
  position: number | null;
  parent_id: string | null;
  is_free: boolean | null;
  is_published: boolean | null;
}

interface LessonProgressData {
  member_content_id: string;
  completed: boolean;
  progress_percent: number;
}

export default function MemberCourse() {
  const { productId } = useParams<{ productId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [loading, setLoading] = useState(true);
  const [courseName, setCourseName] = useState("");
  const [modules, setModules] = useState<Module[]>([]);
  const [flatLessons, setFlatLessons] = useState<Lesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [progressMap, setProgressMap] = useState<Record<string, LessonProgressData>>({});
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [allCompleted, setAllCompleted] = useState(false);
  const [generatingCert, setGeneratingCert] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/member/login"); return; }

      const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("email", user.email!)
        .limit(1)
        .maybeSingle();

      if (!customer) { navigate("/member"); return; }
      setCustomerId(customer.id);

      // Get product name
      const { data: product } = await supabase
        .from("products")
        .select("name")
        .eq("id", productId!)
        .maybeSingle();
      if (product) setCourseName(product.name);

      // Get all content for this product
      const { data: allContent } = await supabase
        .from("member_content")
        .select("id, title, type, media_url, media_type, text_content, description, duration, position, parent_id, is_free, is_published")
        .eq("product_id", productId!)
        .order("position");

      if (!allContent) { setLoading(false); return; }

      // Separate modules and lessons
      const mods = allContent
        .filter(c => c.type === "module")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const lessons = allContent
        .filter(c => c.type === "lesson")
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

      const structuredModules: Module[] = mods.map(mod => ({
        ...mod,
        lessons: lessons.filter(l => l.parent_id === mod.id),
      }));

      // Add orphan lessons (no parent)
      const orphanLessons = lessons.filter(l => !l.parent_id);
      if (orphanLessons.length > 0) {
        structuredModules.unshift({
          id: "orphan",
          title: "Aulas",
          position: -1,
          lessons: orphanLessons,
        });
      }

      setModules(structuredModules);
      const flat = structuredModules.flatMap(m => m.lessons);
      setFlatLessons(flat);
      if (flat.length > 0) {
        setActiveLesson(flat[0]);
        setActiveLessonIndex(0);
      }

      // Get progress
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("member_content_id, completed, progress_percent")
        .eq("customer_id", customer.id)
        .in("member_content_id", allContent.map(c => c.id));

      if (progress) {
        const map: Record<string, LessonProgressData> = {};
        progress.forEach(p => { map[p.member_content_id] = p; });
        setProgressMap(map);
      }

      setLoading(false);
    }
    load();
  }, [productId, navigate]);

  // Check if all completed
  useEffect(() => {
    if (flatLessons.length === 0) return;
    const all = flatLessons.every(l => progressMap[l.id]?.completed);
    if (all && !allCompleted) {
      setAllCompleted(true);
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [progressMap, flatLessons, allCompleted]);

  const generateCertificatePDF = (cert: { student_name: string; course_name: string; creator_name: string; issued_at: string }) => {
    const issuedDate = new Date(cert.issued_at).toLocaleDateString("pt-BR", {
      day: "2-digit", month: "long", year: "numeric",
    });

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="842" height="595" viewBox="0 0 842 595">
        <rect width="842" height="595" fill="#FFFFFF"/>
        <rect x="20" y="20" width="802" height="555" fill="none" stroke="#FA4B38" stroke-width="3" rx="12"/>
        <rect x="30" y="30" width="782" height="535" fill="none" stroke="#FA4B38" stroke-width="1" stroke-opacity="0.3" rx="8"/>
        
        <!-- Header decoration -->
        <line x1="271" y1="120" x2="571" y2="120" stroke="#FA4B38" stroke-width="2"/>
        <text x="421" y="90" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="#FA4B38" font-weight="bold">CERTIFICADO</text>
        <text x="421" y="145" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#888888" letter-spacing="4">DE CONCLUSÃO</text>
        
        <!-- Body -->
        <text x="421" y="210" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666666">Certificamos que</text>
        <text x="421" y="260" text-anchor="middle" font-family="Georgia, serif" font-size="30" fill="#1a1a1a" font-weight="bold">${escapeXml(cert.student_name)}</text>
        <line x1="221" y1="275" x2="621" y2="275" stroke="#dddddd" stroke-width="1"/>
        
        <text x="421" y="320" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#666666">concluiu com sucesso o curso</text>
        <text x="421" y="365" text-anchor="middle" font-family="Georgia, serif" font-size="24" fill="#FA4B38" font-weight="bold">${escapeXml(cert.course_name)}</text>
        
        <text x="421" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#888888">Emitido em ${issuedDate}</text>
        
        <!-- Signature -->
        <line x1="301" y1="500" x2="541" y2="500" stroke="#333333" stroke-width="1"/>
        <text x="421" y="520" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" fill="#444444">${escapeXml(cert.creator_name || "")}</text>
        <text x="421" y="540" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#999999">Instrutor(a)</text>
      </svg>
    `;

    const canvas = document.createElement("canvas");
    canvas.width = 842 * 2;
    canvas.height = 595 * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);

    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    return new Promise<void>((resolve) => {
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);

        canvas.toBlob((pdfBlob) => {
          if (pdfBlob) {
            const downloadUrl = URL.createObjectURL(pdfBlob);
            const link = document.createElement("a");
            link.href = downloadUrl;
            link.download = `certificado-${cert.course_name.replace(/\s+/g, "-").toLowerCase()}.png`;
            link.click();
            URL.revokeObjectURL(downloadUrl);
          }
          resolve();
        }, "image/png");
      };
      img.src = url;
    });
  };

  const escapeXml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const handleGenerateCertificate = async () => {
    if (!productId) return;
    setGeneratingCert(true);

    try {
      const { data, error } = await supabase.functions.invoke("generate-certificate", {
        body: { product_id: productId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const cert = data.certificate;
      await generateCertificatePDF(cert);
      toast.success("Certificado baixado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar certificado");
    } finally {
      setGeneratingCert(false);
    }
  };

  const selectLesson = (lesson: Lesson, index: number) => {
    setActiveLesson(lesson);
    setActiveLessonIndex(index);
    setSidebarOpen(false);

    // Update last_accessed
    if (customerId) {
      supabase.from("lesson_progress").upsert({
        customer_id: customerId,
        member_content_id: lesson.id,
        last_accessed_at: new Date().toISOString(),
      }, { onConflict: "customer_id,member_content_id" }).then(() => {});
    }
  };

  const markComplete = async () => {
    if (!activeLesson || !customerId) return;
    setCompleting(true);

    await supabase.from("lesson_progress").upsert({
      customer_id: customerId,
      member_content_id: activeLesson.id,
      completed: true,
      progress_percent: 100,
      completed_at: new Date().toISOString(),
    }, { onConflict: "customer_id,member_content_id" });

    setProgressMap(prev => ({
      ...prev,
      [activeLesson.id]: {
        member_content_id: activeLesson.id,
        completed: true,
        progress_percent: 100,
      }
    }));

    setCompleting(false);

    // Auto-advance to next
    if (activeLessonIndex < flatLessons.length - 1) {
      setTimeout(() => {
        selectLesson(flatLessons[activeLessonIndex + 1], activeLessonIndex + 1);
      }, 500);
    }
  };

  const goToLesson = (direction: "prev" | "next") => {
    const idx = direction === "prev" ? activeLessonIndex - 1 : activeLessonIndex + 1;
    if (idx >= 0 && idx < flatLessons.length) {
      selectLesson(flatLessons[idx], idx);
    }
  };

  const totalLessons = flatLessons.length;
  const completedLessons = flatLessons.filter(l => progressMap[l.id]?.completed).length;
  const overallPercent = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  const renderContent = () => {
    if (!activeLesson) return null;

    if (activeLesson.media_url && (activeLesson.media_type === "video" || activeLesson.media_url.includes("youtube") || activeLesson.media_url.includes("vimeo"))) {
      const isEmbed = activeLesson.media_url.includes("youtube") || activeLesson.media_url.includes("vimeo");
      if (isEmbed) {
        let embedUrl = activeLesson.media_url;
        if (embedUrl.includes("youtube.com/watch")) {
          const vid = new URL(embedUrl).searchParams.get("v");
          embedUrl = `https://www.youtube.com/embed/${vid}`;
        }
        if (embedUrl.includes("youtu.be/")) {
          const vid = embedUrl.split("youtu.be/")[1]?.split("?")[0];
          embedUrl = `https://www.youtube.com/embed/${vid}`;
        }
        return (
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
            <iframe src={embedUrl} className="w-full h-full" allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
          </div>
        );
      }
      return (
        <video controls className="w-full rounded-lg bg-black aspect-video" src={activeLesson.media_url}>
          Your browser does not support the video tag.
        </video>
      );
    }

    if (activeLesson.media_type === "audio" && activeLesson.media_url) {
      return (
        <div className="bg-muted rounded-xl p-6 flex flex-col items-center gap-4">
          <Headphones className="w-12 h-12 text-muted-foreground" />
          <audio controls className="w-full" src={activeLesson.media_url} />
        </div>
      );
    }

    if (activeLesson.media_type === "pdf" && activeLesson.media_url) {
      return (
        <div className="space-y-3">
          <iframe src={activeLesson.media_url} className="w-full h-[600px] rounded-lg border" />
          <a href={activeLesson.media_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm"><FileText className="w-4 h-4" /> Download PDF</Button>
          </a>
        </div>
      );
    }

    if (activeLesson.text_content) {
      return (
        <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: activeLesson.text_content }} />
      );
    }

    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-12 h-12 mx-auto mb-3" />
        <p>Nenhum conteúdo disponível para esta aula.</p>
      </div>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <Link to="/member" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2">
          <ArrowLeft className="w-3 h-3" /> Meus Cursos
        </Link>
        <h2 className="font-semibold text-foreground text-sm leading-tight">{courseName}</h2>
        <div className="flex items-center gap-2 mt-2">
          <Progress value={overallPercent} className="h-1.5 flex-1 [&>div]:bg-primary" />
          <span className="text-xs text-muted-foreground">{overallPercent}%</span>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {modules.map((mod) => {
            const modCompleted = mod.lessons.filter(l => progressMap[l.id]?.completed).length;
            return (
              <div key={mod.id} className="mb-3">
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {mod.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {modCompleted}/{mod.lessons.length}
                  </span>
                </div>
                {mod.lessons.map((lesson) => {
                  const isActive = activeLesson?.id === lesson.id;
                  const isComplete = progressMap[lesson.id]?.completed;
                  const globalIdx = flatLessons.findIndex(l => l.id === lesson.id);
                  return (
                    <button
                      key={lesson.id}
                      onClick={() => selectLesson(lesson, globalIdx)}
                      className={`w-full text-left px-2 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors ${
                        isActive ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-foreground"
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                        isComplete 
                          ? "bg-green-500 border-green-500" 
                          : isActive ? "border-primary" : "border-muted-foreground/30"
                      }`}>
                        {isComplete && <Check className="w-3 h-3 text-white" />}
                      </div>
                      <span className="line-clamp-1 flex-1">{lesson.title}</span>
                      {lesson.is_free && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Grátis</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isLessonComplete = activeLesson ? progressMap[activeLesson.id]?.completed : false;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="w-72 border-r bg-[#F9FAFB] shrink-0 hidden md:flex flex-col">
          <SidebarContent />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        {isMobile && (
          <header className="bg-card border-b h-12 flex items-center px-4 gap-3 sticky top-0 z-10">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0 w-72">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <span className="text-sm font-medium text-foreground truncate">{activeLesson?.title}</span>
          </header>
        )}

        {/* Lesson content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
            {/* Course completion banner */}
            {allCompleted && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center animate-fade-in">
                <Award className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <h3 className="text-lg font-bold text-green-800">Parabéns! 🎉</h3>
                <p className="text-sm text-green-700 mt-1">Você completou todas as aulas deste curso!</p>
                <Button
                  className="mt-3 bg-primary hover:bg-primary/90 gap-2"
                  disabled={generatingCert}
                  onClick={handleGenerateCertificate}
                >
                  {generatingCert ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  Download Certificado
                </Button>
              </div>
            )}

            {activeLesson && (
              <>
                <div>
                  <h1 className="text-xl font-bold text-foreground">{activeLesson.title}</h1>
                  {activeLesson.duration && (
                    <p className="text-xs text-muted-foreground mt-1">
                      <Play className="w-3 h-3 inline" /> {activeLesson.duration} min
                    </p>
                  )}
                </div>

                {renderContent()}

                {activeLesson.description && (
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">{activeLesson.description}</p>
                  </div>
                )}

                {/* Complete button */}
                <Button
                  onClick={markComplete}
                  disabled={isLessonComplete || completing}
                  className={`w-full h-12 font-semibold ${
                    isLessonComplete 
                      ? "bg-green-100 text-green-800 hover:bg-green-100 cursor-default" 
                      : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  {completing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isLessonComplete ? (
                    <><Check className="w-4 h-4" /> Aula concluída</>
                  ) : (
                    <><Check className="w-4 h-4" /> Marcar como concluída</>
                  )}
                </Button>
              </>
            )}
          </div>
        </main>

        {/* Bottom navigation */}
        <div className="border-t bg-card p-3 flex items-center justify-between">
          <Button
            variant="ghost"
            disabled={activeLessonIndex === 0}
            onClick={() => goToLesson("prev")}
            className="gap-1"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            {activeLessonIndex + 1} / {flatLessons.length}
          </span>
          <Button
            variant="ghost"
            disabled={activeLessonIndex === flatLessons.length - 1}
            onClick={() => goToLesson("next")}
            className="gap-1"
          >
            Próxima <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
