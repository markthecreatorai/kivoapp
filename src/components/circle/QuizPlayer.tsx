import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ClipboardList, CheckCircle2, XCircle, Clock, RotateCcw,
  ChevronRight, Trophy, AlertTriangle, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface QuizOption {
  label: string;
  is_correct: boolean;
}

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  passing_score: number;
  max_attempts: number;
  time_limit_minutes: number | null;
  is_required_for_certificate: boolean;
}

interface Question {
  id: string;
  question_text: string;
  options: QuizOption[];
  position: number;
  points: number;
}

interface Attempt {
  id: string;
  score: number;
  total_points: number;
  passed: boolean;
  completed_at: string | null;
  started_at: string;
}

export default function QuizPlayer({ courseId, memberId }: { courseId: string; memberId: string }) {
  const queryClient = useQueryClient();
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [currentQ, setCurrentQ] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [lastResult, setLastResult] = useState<{ score: number; total: number; passed: boolean; details: Array<{ questionId: string; correct: boolean; correctIdx: number }> } | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Quizzes for this course
  const { data: quizzes = [] } = useQuery({
    queryKey: ["course-quizzes-player", courseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("course_quizzes")
        .select("*")
        .eq("course_id", courseId)
        .eq("is_published", true)
        .order("position");
      return (data || []) as Quiz[];
    },
  });

  // Past attempts for all quizzes in this course
  const { data: attempts = [] } = useQuery({
    queryKey: ["quiz-attempts", courseId, memberId],
    queryFn: async () => {
      if (!quizzes.length) return [];
      const { data } = await supabase
        .from("course_quiz_attempts")
        .select("*")
        .eq("member_id", memberId)
        .in("quiz_id", quizzes.map(q => q.id))
        .order("created_at", { ascending: false });
      return (data || []) as Attempt[];
    },
    enabled: quizzes.length > 0,
  });

  // Questions for active quiz
  const { data: questions = [] } = useQuery({
    queryKey: ["quiz-questions-player", activeQuizId],
    queryFn: async () => {
      if (!activeQuizId) return [];
      const { data } = await supabase
        .from("course_quiz_questions")
        .select("*")
        .eq("quiz_id", activeQuizId)
        .order("position");
      return (data || []) as Question[];
    },
    enabled: !!activeQuizId,
  });

  // Timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || showResults) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, showResults]);

  const activeQuiz = quizzes.find(q => q.id === activeQuizId);
  const quizAttempts = (qId: string) => attempts.filter(a => (a as any).quiz_id === qId && a.completed_at);
  const bestAttempt = (qId: string) => {
    const completed = quizAttempts(qId);
    if (!completed.length) return null;
    return completed.reduce((best, a) => a.score > best.score ? a : best, completed[0]);
  };

  const startQuiz = useMutation({
    mutationFn: async (quizId: string) => {
      const { data, error } = await supabase
        .from("course_quiz_attempts")
        .insert({ quiz_id: quizId, member_id: memberId })
        .select("id")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, quizId) => {
      setActiveQuizId(quizId);
      setCurrentAttemptId(data.id);
      setAnswers({});
      setCurrentQ(0);
      setShowResults(false);
      setLastResult(null);
      const quiz = quizzes.find(q => q.id === quizId);
      if (quiz?.time_limit_minutes && quiz.time_limit_minutes > 0) {
        setTimeLeft(quiz.time_limit_minutes * 60);
      } else {
        setTimeLeft(null);
      }
    },
    onError: (e: any) => toast.error(e.message),
  });

  const handleSubmit = async () => {
    if (!activeQuiz || !currentAttemptId) return;

    let score = 0;
    let totalPoints = 0;
    const details: Array<{ questionId: string; correct: boolean; correctIdx: number }> = [];
    const answerInserts: Array<{ attempt_id: string; question_id: string; selected_option: number; is_correct: boolean; points_earned: number }> = [];

    for (const q of questions) {
      const opts = q.options as QuizOption[];
      const selected = answers[q.id] ?? -1;
      const correctIdx = opts.findIndex(o => o.is_correct);
      const isCorrect = selected === correctIdx;
      totalPoints += q.points;
      if (isCorrect) score += q.points;

      details.push({ questionId: q.id, correct: isCorrect, correctIdx });
      answerInserts.push({
        attempt_id: currentAttemptId,
        question_id: q.id,
        selected_option: selected,
        is_correct: isCorrect,
        points_earned: isCorrect ? q.points : 0,
      });
    }

    const pct = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0;
    const passed = pct >= activeQuiz.passing_score;

    // Save answers + update attempt
    await supabase.from("course_quiz_answers").insert(answerInserts);
    await supabase.from("course_quiz_attempts").update({
      score: pct,
      total_points: totalPoints,
      passed,
      completed_at: new Date().toISOString(),
    }).eq("id", currentAttemptId);

    setLastResult({ score: pct, total: totalPoints, passed, details });
    setShowResults(true);
    setTimeLeft(null);
    queryClient.invalidateQueries({ queryKey: ["quiz-attempts", courseId, memberId] });
  };

  // If taking a quiz
  if (activeQuizId && !showResults && questions.length > 0) {
    const q = questions[currentQ];
    const opts = (q?.options || []) as QuizOption[];
    const progress = Math.round(((currentQ + 1) / questions.length) * 100);

    return (
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{activeQuiz?.title}</CardTitle>
            {timeLeft !== null && (
              <Badge variant={timeLeft < 60 ? "destructive" : "secondary"} className="text-xs">
                <Clock className="h-3 w-3 mr-1" />
                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
              </Badge>
            )}
          </div>
          <Progress value={progress} className="h-1.5 mt-2" />
          <span className="text-[10px] text-muted-foreground">{currentQ + 1} de {questions.length}</span>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm font-medium text-foreground">{q.question_text}</p>

          <div className="space-y-2">
            {opts.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setAnswers(p => ({ ...p, [q.id]: oi }))}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-lg border text-sm transition-colors",
                  answers[q.id] === oi
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "border-border hover:bg-muted/50 text-muted-foreground"
                )}
              >
                <span className="font-semibold mr-2">{String.fromCharCode(65 + oi)}.</span>
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentQ === 0}
              onClick={() => setCurrentQ(p => p - 1)}
            >
              Anterior
            </Button>

            {currentQ < questions.length - 1 ? (
              <Button size="sm" onClick={() => setCurrentQ(p => p + 1)}>
                Próxima <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={handleSubmit} disabled={Object.keys(answers).length < questions.length}>
                Finalizar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Results view
  if (showResults && lastResult && activeQuiz) {
    return (
      <Card className="bg-card border border-border/50 shadow-sm rounded-xl">
        <CardContent className="py-6 text-center space-y-4">
          {lastResult.passed ? (
            <>
              <Trophy className="h-12 w-12 text-primary mx-auto" />
              <h3 className="text-lg font-bold text-foreground">Parabéns! Você passou!</h3>
            </>
          ) : (
            <>
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <h3 className="text-lg font-bold text-foreground">Não atingiu a nota mínima</h3>
            </>
          )}

          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <p className="text-3xl font-bold text-foreground">{lastResult.score}%</p>
              <p className="text-xs text-muted-foreground">Sua nota</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-muted-foreground">{activeQuiz.passing_score}%</p>
              <p className="text-xs text-muted-foreground">Mínimo</p>
            </div>
          </div>

          {/* Per-question feedback */}
          <div className="text-left space-y-2 max-w-md mx-auto">
            {questions.map((q, qi) => {
              const detail = lastResult.details.find(d => d.questionId === q.id);
              return (
                <div key={q.id} className="flex items-start gap-2 text-sm">
                  {detail?.correct
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                    : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  }
                  <span className={cn("text-xs", detail?.correct ? "text-foreground" : "text-muted-foreground")}>
                    {qi + 1}. {q.question_text.slice(0, 60)}{q.question_text.length > 60 ? "..." : ""}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => { setActiveQuizId(null); setShowResults(false); setLastResult(null); }}>
              Voltar
            </Button>
            {!lastResult.passed && (
              <Button size="sm" onClick={() => { setShowResults(false); setCurrentQ(0); setAnswers({}); startQuiz.mutate(activeQuiz.id); }}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Tentar novamente
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Quiz list
  if (quizzes.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">Avaliações</span>
      </div>

      {quizzes.map((quiz) => {
        const past = quizAttempts(quiz.id);
        const best = bestAttempt(quiz.id);
        const attemptsLeft = quiz.max_attempts - past.length;
        const hasPassed = past.some(a => a.passed);

        return (
          <Card key={quiz.id} className="bg-card border border-border/50 shadow-sm rounded-xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{quiz.title}</h4>
                  {quiz.description && <p className="text-xs text-muted-foreground">{quiz.description}</p>}
                </div>
                {hasPassed && <Badge variant="default" className="text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" /> Aprovado</Badge>}
              </div>

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-3">
                <span>Nota mínima: {quiz.passing_score}%</span>
                <span>Tentativas: {past.length}/{quiz.max_attempts}</span>
                {quiz.time_limit_minutes && <span><Clock className="h-3 w-3 inline mr-0.5" />{quiz.time_limit_minutes} min</span>}
                {quiz.is_required_for_certificate && <Badge variant="outline" className="text-[10px]">Obrigatório p/ certificado</Badge>}
              </div>

              {best && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-muted-foreground">Melhor nota:</span>
                  <Badge variant={best.passed ? "default" : "secondary"} className="text-xs">{best.score}%</Badge>
                </div>
              )}

              {!hasPassed && attemptsLeft > 0 && (
                <Button size="sm" onClick={() => startQuiz.mutate(quiz.id)} disabled={startQuiz.isPending}>
                  {startQuiz.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ClipboardList className="h-3.5 w-3.5 mr-1" />}
                  {past.length === 0 ? "Iniciar Avaliação" : "Tentar Novamente"}
                </Button>
              )}

              {!hasPassed && attemptsLeft <= 0 && (
                <p className="text-xs text-destructive">Tentativas esgotadas</p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
